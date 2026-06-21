import "server-only";

import { db } from "@/lib/db";
import {
  orders,
  orderItems,
  orderShipments,
  shippingConfig,
  expenses,
  payouts,
  assets,
} from "@/lib/db/schema";
import { and, gte, lt, inArray, eq, sql } from "drizzle-orm";
import { toNum } from "@/lib/profit";

// ============================================================================
// Accounting aggregation engine (cash basis).
//
// Sales, COGS, shipping cost, and PayPal fees are DERIVED from paid orders —
// nothing is double-entered. Expenses/assets/payouts come from their tables.
//
//   Profit = Sales − COGS − Shipping − PayPalFees − Expenses
//   Sales      = Σ(amountPaid − refundedAmount)        [orders with amountPaid > 0]
//   COGS       = Σ(unitCost × qty) + Σ extraCost
//   Shipping   = Σ actual courier base cost (resolveShippingCost)
//   PayPalFees = Σ paypalFee
//   Expenses   = Σ expenses.amount (date-filtered)
//   Assets are EXCLUDED from profit.
//
// MariaDB notes (CLAUDE.md): no LATERAL joins → manual multi-query hydration;
// mysql2 returns DECIMAL/LONGTEXT as strings → toNum before arithmetic.
//
// Date handling: order date bounds are parsed UTC-consistently (date-only
// strings → UTC midnight) with an EXCLUSIVE next-day upper bound, matching the
// convention in admin-payments.ts. The sales-report month bucket uses the same
// UTC basis (toISOString) so filter and bucket agree.
// ============================================================================

function round2(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Date range as inclusive "YYYY-MM-DD" strings. null = unbounded. */
export type DateRange = { from: string | null; to: string | null };

export type AccountingSummary = {
  sales: number;
  cogs: number;
  shipping: number;
  paypalFees: number;
  expensesTotal: number;
  profit: number;
  orderCount: number;
  /** Orders where courier cost had to be estimated from markup config. */
  missingShippingCostCount: number;
  /** Line items with no cost price recorded (COGS understated). */
  missingItemCostCount: number;
  /** Paid orders whose PayPal fee isn't captured yet (fees understated). */
  missingPaypalFeeCount: number;
};

export type AccountBalances = {
  paypal: number;
  bank: number;
  cash: number;
  totalAssets: number;
  /** Paid orders whose PayPal net isn't captured yet (balance understated). */
  paypalNetMissingCount: number;
};

export type SalesReportRow = {
  month: string; // "YYYY-MM"
  revenue: number;
  cogs: number;
  shipping: number;
  paypalFees: number;
  profit: number;
  orderCount: number;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Cash-basis order filter: only orders where money was actually received
 * (amountPaid > 0), optionally bounded by createdAt date range.
 *
 * Both bounds parse the "YYYY-MM-DD" string as UTC midnight (date-only strings
 * are UTC per ECMAScript); the upper bound is the EXCLUSIVE next day so the
 * whole "to" day is included. Invalid strings are ignored (no bound), so a
 * malformed query param can never produce an Invalid Date for the driver.
 */
function orderRangeConditions(range: DateRange) {
  const conds = [sql`CAST(${orders.amountPaid} AS DECIMAL(10,2)) > 0`];
  if (range.from) {
    const lo = new Date(range.from);
    if (!Number.isNaN(lo.getTime())) conds.push(gte(orders.createdAt, lo));
  }
  if (range.to) {
    const hi = new Date(range.to);
    if (!Number.isNaN(hi.getTime())) {
      hi.setUTCDate(hi.getUTCDate() + 1); // exclusive next-day boundary
      conds.push(lt(orders.createdAt, hi));
    }
  }
  return conds;
}

function parseSnapshot(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const o = typeof raw === "string" ? JSON.parse(raw) : raw;
    return o && typeof o === "object" ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Pull the real courier base price out of a Delyva service snapshot, if present. */
function snapshotBasePrice(snap: Record<string, unknown> | null): number | null {
  if (!snap) return null;
  // Preferred: explicit basePrice captured at booking (see shipping.ts booking
  // write). Fallbacks: a nested { price: { amount } } service object.
  const base = toNum(snap.basePrice as string | number | null | undefined);
  if (base > 0) return base;
  const price = snap.price as unknown;
  if (price && typeof price === "object") {
    const amt = (price as Record<string, unknown>).amount;
    const n = toNum(amt as string | number | null | undefined);
    if (n > 0) return n;
  }
  return null;
}

/**
 * Resolve the ACTUAL courier cost we pay for an order.
 *
 * IMPORTANT: orders.shippingCost (and shippingQuotedPrice) is the MARKED-UP
 * price CHARGED to the customer, not what we pay the courier. So we never use
 * it verbatim as cost. Priority:
 *   1. basePrice captured in the service snapshot at booking (exact).
 *   2. reverse-engineer from the charged price using the markup config:
 *        charged = base*(1+pct/100) + flat  ⇒  base = (charged − flat)/(1+pct/100)
 *      (flagged `estimated` — uses the CURRENT markup config).
 *   3. free-shipping order (charged 0) → 0 courier cost (not flagged).
 */
function resolveShippingCost(
  shippingCost: number,
  snapBase: number | null,
  markupPercent: number,
  markupFlat: number,
): { cost: number; estimated: boolean } {
  if (snapBase != null && snapBase > 0) return { cost: round2(snapBase), estimated: false };
  if (shippingCost <= 0) return { cost: 0, estimated: false };
  const base = (shippingCost - markupFlat) / (1 + markupPercent / 100);
  return { cost: round2(Math.max(0, base)), estimated: true };
}

async function getMarkupConfig(): Promise<{ percent: number; flat: number }> {
  const [row] = await db
    .select({ percent: shippingConfig.markupPercent, flat: shippingConfig.markupFlat })
    .from(shippingConfig)
    .where(eq(shippingConfig.id, "default"))
    .limit(1);
  return { percent: toNum(row?.percent), flat: toNum(row?.flat) };
}

type OrderRow = {
  id: string;
  amountPaid: string | null;
  refundedAmount: string | null;
  paypalFee: string | null;
  // The reliable "this order went through PayPal" signal. paymentMethod is
  // unreliable (NULL on real PayPal orders whose back-fill never ran), so we
  // key PayPal-fee expectations off the capture id. Manual/WhatsApp/bank-
  // transfer orders have no capture and legitimately carry no PayPal fee.
  paypalCaptureId: string | null;
  extraCost: string | null;
  shippingCost: string | null;
  createdAt: Date;
};

/** Shared fetch: paid orders in range + their per-order COGS + courier base. */
async function fetchOrderFinancials(range: DateRange) {
  const orderRows: OrderRow[] = await db
    .select({
      id: orders.id,
      amountPaid: orders.amountPaid,
      refundedAmount: orders.refundedAmount,
      paypalFee: orders.paypalFee,
      paypalCaptureId: orders.paypalCaptureId,
      extraCost: orders.extraCost,
      shippingCost: orders.shippingCost,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(and(...orderRangeConditions(range)));

  const ids = orderRows.map((o) => o.id);
  const cogsByOrder = new Map<string, number>();
  const snapBaseByOrder = new Map<string, number | null>();
  let missingItemCostCount = 0;

  if (ids.length > 0) {
    const items = await db
      .select({
        orderId: orderItems.orderId,
        unitCost: orderItems.unitCost,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(inArray(orderItems.orderId, ids));
    for (const it of items) {
      if (it.unitCost == null) missingItemCostCount++;
      const prev = cogsByOrder.get(it.orderId) ?? 0;
      cogsByOrder.set(it.orderId, prev + toNum(it.unitCost) * (it.quantity ?? 0));
    }

    const ships = await db
      .select({
        orderId: orderShipments.orderId,
        serviceSnapshot: orderShipments.serviceSnapshot,
      })
      .from(orderShipments)
      .where(inArray(orderShipments.orderId, ids));
    for (const s of ships) {
      snapBaseByOrder.set(s.orderId, snapshotBasePrice(parseSnapshot(s.serviceSnapshot)));
    }
  }

  return { orderRows, cogsByOrder, snapBaseByOrder, missingItemCostCount };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getAccountingSummary(range: DateRange): Promise<AccountingSummary> {
  const [{ orderRows, cogsByOrder, snapBaseByOrder, missingItemCostCount }, markup, expensesTotal] =
    await Promise.all([fetchOrderFinancials(range), getMarkupConfig(), sumExpenses(range)]);

  let sales = 0;
  let cogs = 0;
  let shipping = 0;
  let paypalFees = 0;
  let missingShippingCostCount = 0;
  let missingPaypalFeeCount = 0;

  for (const o of orderRows) {
    sales += toNum(o.amountPaid) - toNum(o.refundedAmount);
    cogs += (cogsByOrder.get(o.id) ?? 0) + toNum(o.extraCost);
    // Only PayPal-captured orders are expected to have a fee. Manual/WhatsApp/
    // bank-transfer orders have no PayPal charge — never flag them.
    if (o.paypalCaptureId != null && o.paypalFee == null) missingPaypalFeeCount++;
    paypalFees += toNum(o.paypalFee);
    const { cost, estimated } = resolveShippingCost(
      toNum(o.shippingCost),
      snapBaseByOrder.get(o.id) ?? null,
      markup.percent,
      markup.flat,
    );
    shipping += cost;
    if (estimated && toNum(o.shippingCost) > 0) missingShippingCostCount++;
  }

  const profit = sales - cogs - shipping - paypalFees - expensesTotal;

  return {
    sales: round2(sales),
    cogs: round2(cogs),
    shipping: round2(shipping),
    paypalFees: round2(paypalFees),
    expensesTotal: round2(expensesTotal),
    profit: round2(profit),
    orderCount: orderRows.length,
    missingShippingCostCount,
    missingItemCostCount,
    missingPaypalFeeCount,
  };
}

export async function getSalesReport(range: DateRange): Promise<SalesReportRow[]> {
  const { orderRows, cogsByOrder, snapBaseByOrder } = await fetchOrderFinancials(range);
  const markup = await getMarkupConfig();

  type Acc = Omit<SalesReportRow, "month" | "profit">;
  const byMonth = new Map<string, Acc>();

  for (const o of orderRows) {
    // UTC month bucket — consistent with the UTC-based order date filter.
    const month = new Date(o.createdAt).toISOString().slice(0, 7); // YYYY-MM
    const acc =
      byMonth.get(month) ??
      { revenue: 0, cogs: 0, shipping: 0, paypalFees: 0, orderCount: 0 };
    acc.revenue += toNum(o.amountPaid) - toNum(o.refundedAmount);
    acc.cogs += (cogsByOrder.get(o.id) ?? 0) + toNum(o.extraCost);
    acc.paypalFees += toNum(o.paypalFee);
    const { cost } = resolveShippingCost(
      toNum(o.shippingCost),
      snapBaseByOrder.get(o.id) ?? null,
      markup.percent,
      markup.flat,
    );
    acc.shipping += cost;
    acc.orderCount += 1;
    byMonth.set(month, acc);
  }

  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, a]) => ({
      month,
      revenue: round2(a.revenue),
      cogs: round2(a.cogs),
      shipping: round2(a.shipping),
      paypalFees: round2(a.paypalFees),
      profit: round2(a.revenue - a.cogs - a.shipping - a.paypalFees),
      orderCount: a.orderCount,
    }));
}

/** Σ expenses.amount within the date range (expenseDate is "YYYY-MM-DD" string). */
async function sumExpenses(range: DateRange): Promise<number> {
  const conds = [];
  if (range.from) conds.push(gte(expenses.expenseDate, range.from));
  if (range.to) conds.push(lt(expenses.expenseDate, nextDay(range.to)));
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)` })
    .from(expenses)
    .where(conds.length ? and(...conds) : undefined);
  return toNum(row?.total);
}

/** "YYYY-MM-DD" → the next calendar day "YYYY-MM-DD" (for exclusive upper bounds). */
function nextDay(ymd: string): string {
  const d = new Date(ymd + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return ymd;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function getAccountBalances(): Promise<AccountBalances> {
  // PayPal inflow/refunds restricted to paid orders. Bank/Cash move via payouts.
  const [ordAgg] = await db
    .select({
      paypalNet: sql<string>`COALESCE(SUM(${orders.paypalNet}), 0)`,
      refunds: sql<string>`COALESCE(SUM(${orders.refundedAmount}), 0)`,
      netMissing: sql<number>`SUM(CASE WHEN ${orders.paypalCaptureId} IS NOT NULL AND ${orders.paypalNet} IS NULL THEN 1 ELSE 0 END)`,
    })
    .from(orders)
    .where(sql`CAST(${orders.amountPaid} AS DECIMAL(10,2)) > 0`);

  const [payoutAgg] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${payouts.amount}), 0)`,
      intoBank: sql<string>`COALESCE(SUM(CASE WHEN ${payouts.paidInto} = 'bank' THEN ${payouts.amount} ELSE 0 END), 0)`,
      intoCash: sql<string>`COALESCE(SUM(CASE WHEN ${payouts.paidInto} = 'cash' THEN ${payouts.amount} ELSE 0 END), 0)`,
    })
    .from(payouts);

  const [expAgg] = await db
    .select({
      paypal: sql<string>`COALESCE(SUM(CASE WHEN ${expenses.paidFrom} = 'paypal' THEN ${expenses.amount} ELSE 0 END), 0)`,
      bank: sql<string>`COALESCE(SUM(CASE WHEN ${expenses.paidFrom} = 'bank' THEN ${expenses.amount} ELSE 0 END), 0)`,
      cash: sql<string>`COALESCE(SUM(CASE WHEN ${expenses.paidFrom} = 'cash' THEN ${expenses.amount} ELSE 0 END), 0)`,
    })
    .from(expenses);

  const [assetAgg] = await db
    .select({ total: sql<string>`COALESCE(SUM(${assets.amount}), 0)` })
    .from(assets);

  const paypal =
    toNum(ordAgg?.paypalNet) -
    toNum(ordAgg?.refunds) -
    toNum(payoutAgg?.total) -
    toNum(expAgg?.paypal);
  const bank = toNum(payoutAgg?.intoBank) - toNum(expAgg?.bank);
  const cash = toNum(payoutAgg?.intoCash) - toNum(expAgg?.cash);

  return {
    paypal: round2(paypal),
    bank: round2(bank),
    cash: round2(cash),
    totalAssets: round2(toNum(assetAgg?.total)),
    paypalNetMissingCount: Number(ordAgg?.netMissing ?? 0),
  };
}
