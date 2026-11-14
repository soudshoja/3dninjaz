import "server-only";

import { db } from "@/lib/db";
import { expenses, assets, assetPayments, incomeEntries, storeSettings } from "@/lib/db/schema";
import { and, gte, lte, sql, eq, type SQL } from "drizzle-orm";
import { toNum } from "@/lib/profit";
import {
  type DateRange,
  type RangeBucket,
  bucketForRange,
  bucketKeyForInstant,
  bucketLabel,
} from "@/lib/date-range";
import {
  fetchPaidOrders,
  fetchOrderLines,
  orderProductSales,
  orderShippingKept,
  orderReceipts,
  type PaidOrderRow,
  type PaidOrderItemRow,
} from "@/lib/paid-orders";
import {
  round2,
  computeNetProfitCash,
  computeGrossMargin,
  computeNetPosition,
  costCoverage,
  hasEnoughCostData,
} from "@/lib/accounting-math";
import { PROFIT_INCOME_KINDS } from "@/lib/accounting-types";

// ============================================================================
// Accounting aggregation engine, split into three views (see accounting-math):
//
//   getCashSummary   View A  Net profit (cash)  - never subtracts product cost
//   getGrossMargin   View B  Gross margin       - never subtracts expenses
//   getNetPosition   View C  Net position       - View A + assets + funding
//   getAccountBalances (account-balances.ts)    - where the money sits
//
// Shipping is a pass-through (customer pays, courier gets it): it is excluded
// from sales and from cost, so there is no courier cost or markup logic here.
//
// Orders come from paid-orders.ts (the single shared paid-order filter, MYT
// boundaries). Expenses/income/asset dates are plain "YYYY-MM-DD" strings, so
// they are compared as strings against the inclusive range.
//
// MariaDB notes (CLAUDE.md): no LATERAL joins -> manual multi-query hydration;
// mysql2 returns DECIMAL as strings -> toNum before arithmetic.
// ============================================================================

export type { DateRange } from "@/lib/date-range";
export { getAccountBalances } from "@/lib/account-balances";
export type { AccountBalances } from "@/lib/account-balances";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CashSummary = {
  /** Product sales excluding shipping, net of refunds. */
  productSales: number;
  /** Shipping collected from customers. Information only, never revenue. */
  shippingCollected: number;
  /** Receipts including shipping, net of refunds. Information only. */
  receipts: number;
  /** Income entries of kind project | event | other (never website sales). */
  otherIncome: number;
  paypalFees: number;
  expensesTotal: number;
  /** View A. */
  netProfit: number;
  orderCount: number;
  /** Paid orders that went through PayPal but have no fee captured yet. */
  missingPaypalFeeCount: number;
  /** Paid orders with no payment method (they reach no balance). */
  unknownMethodCount: number;
  /** RM (absolute) of expenses and income dated by estimate inside the range. */
  estimatedDateAmount: number;
};

/** Kept as the name existing callers (admin-accounting.ts) import. */
export type AccountingSummary = CashSummary;

export type GrossMarginSummary = {
  productSales: number;
  productCost: number;
  extraCost: number;
  paypalFees: number;
  /** View B. Present even when coverage is low; hide the headline with enoughData. */
  margin: number;
  marginPercent: number | null;
  /** 0..1 share of order lines with a unit cost. */
  coverage: number;
  linesTotal: number;
  linesWithCost: number;
  /** False when coverage is below 90%: show "Not enough cost data". */
  enoughData: boolean;
  /** Memo only: materials bought (expenses) vs materials used (product cost). */
  materialsBought: number;
  materialsUsed: number;
  orderCount: number;
};

export type NetPosition = {
  netProfitCash: number;
  assetPaymentsMade: number;
  capitalIn: number;
  capitalOut: number;
  /** Net position now. */
  now: number;
  /** Still owed on instalment assets (all time). */
  instalmentsOwed: number;
  /** Net position once every instalment is paid. */
  afterInstalments: number;
  /** Assets with no payment rows recorded (not counted in the position). */
  assetsWithoutPayments: number;
};

export type SalesReportRow = {
  /** Bucket key: YYYY-MM-DD (day), Monday (week) or YYYY-MM-01 (month). */
  bucket: string;
  label: string;
  orderCount: number;
  sales: number;
  shippingCollected: number;
  paypalFees: number;
  /** Order line cost + extra cost for the bucket. */
  productCost: number;
  coverage: number;
  /** Null when coverage is below 90%. */
  grossMargin: number | null;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Inclusive string-date conditions for a "YYYY-MM-DD" varchar column. */
function ymdConds(col: Parameters<typeof gte>[0], range: DateRange): SQL[] {
  const conds: SQL[] = [];
  if (range.from) conds.push(gte(col, range.from));
  if (range.to) conds.push(lte(col, range.to));
  return conds;
}

type LineStats = { cost: number; withCost: number; total: number };

function lineStatsByOrder(lines: PaidOrderItemRow[]): Map<string, LineStats> {
  const m = new Map<string, LineStats>();
  for (const l of lines) {
    const s = m.get(l.orderId) ?? { cost: 0, withCost: 0, total: 0 };
    s.total += 1;
    if (l.unitCost != null) {
      s.withCost += 1;
      s.cost += l.unitCost * l.quantity;
    }
    m.set(l.orderId, s);
  }
  return m;
}

async function sumExpenses(range: DateRange) {
  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
      materials: sql<string>`COALESCE(SUM(CASE WHEN ${expenses.category} = 'materials' THEN ${expenses.amount} ELSE 0 END), 0)`,
      estimated: sql<string>`COALESCE(SUM(CASE WHEN ${expenses.dateIsEstimate} = 1 THEN ABS(${expenses.amount}) ELSE 0 END), 0)`,
    })
    .from(expenses)
    .where(and(...ymdConds(expenses.expenseDate, range)));
  return {
    total: toNum(row?.total),
    materials: toNum(row?.materials),
    estimated: toNum(row?.estimated),
  };
}

type IncomeTotals = {
  profitKinds: number;
  capitalIn: number;
  capitalOut: number;
  estimated: number;
};

async function sumIncome(range: DateRange): Promise<IncomeTotals> {
  const rows = await db
    .select({
      kind: incomeEntries.kind,
      total: sql<string>`COALESCE(SUM(${incomeEntries.amount}), 0)`,
      estimated: sql<string>`COALESCE(SUM(CASE WHEN ${incomeEntries.dateIsEstimate} = 1 THEN ABS(${incomeEntries.amount}) ELSE 0 END), 0)`,
    })
    .from(incomeEntries)
    .where(and(...ymdConds(incomeEntries.entryDate, range)))
    .groupBy(incomeEntries.kind);
  const out: IncomeTotals = { profitKinds: 0, capitalIn: 0, capitalOut: 0, estimated: 0 };
  for (const r of rows) {
    const t = toNum(r.total);
    out.estimated += toNum(r.estimated);
    if ((PROFIT_INCOME_KINDS as readonly string[]).includes(r.kind)) out.profitKinds += t;
    else if (r.kind === "capital_in") out.capitalIn += t;
    else if (r.kind === "capital_out") out.capitalOut += t;
  }
  return out;
}

function buildCash(
  orders: PaidOrderRow[],
  exp: { total: number; estimated: number },
  inc: IncomeTotals,
): CashSummary {
  let productSales = 0;
  let shippingCollected = 0;
  let receipts = 0;
  let paypalFees = 0;
  let missingPaypalFeeCount = 0;
  let unknownMethodCount = 0;
  for (const o of orders) {
    productSales += orderProductSales(o);
    receipts += orderReceipts(o);
    shippingCollected += orderShippingKept(o);
    paypalFees += o.paypalFee ?? 0;
    // Only PayPal-captured orders are expected to carry a fee.
    if (o.paypalCaptureId != null && o.paypalFee == null) missingPaypalFeeCount++;
    if (o.paymentMethod == null) unknownMethodCount++;
  }
  const netProfit = computeNetProfitCash({
    productSales,
    incomeEntries: inc.profitKinds,
    paypalFees,
    expenses: exp.total,
  });
  return {
    productSales: round2(productSales),
    shippingCollected: round2(shippingCollected),
    receipts: round2(receipts),
    otherIncome: round2(inc.profitKinds),
    paypalFees: round2(paypalFees),
    expensesTotal: round2(exp.total),
    netProfit,
    orderCount: orders.length,
    missingPaypalFeeCount,
    unknownMethodCount,
    estimatedDateAmount: round2(exp.estimated + inc.estimated),
  };
}

function buildMargin(
  orders: PaidOrderRow[],
  lines: PaidOrderItemRow[],
  materialsBought: number,
): GrossMarginSummary {
  const stats = lineStatsByOrder(lines);
  let productSales = 0;
  let productCost = 0;
  let extraCost = 0;
  let paypalFees = 0;
  let linesTotal = 0;
  let linesWithCost = 0;
  for (const o of orders) {
    productSales += orderProductSales(o);
    extraCost += o.extraCost;
    paypalFees += o.paypalFee ?? 0;
    const s = stats.get(o.id);
    if (s) {
      productCost += s.cost;
      linesTotal += s.total;
      linesWithCost += s.withCost;
    }
  }
  const coverage = costCoverage(linesWithCost, linesTotal, productSales > 0);
  const margin = computeGrossMargin({ productSales, productCost, extraCost, paypalFees });
  return {
    productSales: round2(productSales),
    productCost: round2(productCost),
    extraCost: round2(extraCost),
    paypalFees: round2(paypalFees),
    margin,
    marginPercent: productSales > 0 ? round2((margin / productSales) * 100) : null,
    coverage,
    linesTotal,
    linesWithCost,
    enoughData: hasEnoughCostData(coverage),
    materialsBought: round2(materialsBought),
    materialsUsed: round2(productCost),
    orderCount: orders.length,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** View A. */
export async function getCashSummary(range: DateRange): Promise<CashSummary> {
  const [orders, exp, inc] = await Promise.all([
    fetchPaidOrders(range),
    sumExpenses(range),
    sumIncome(range),
  ]);
  return buildCash(orders, exp, inc);
}

/** View B. */
export async function getGrossMargin(range: DateRange): Promise<GrossMarginSummary> {
  const [orders, exp] = await Promise.all([fetchPaidOrders(range), sumExpenses(range)]);
  const lines = await fetchOrderLines(orders.map((o) => o.id));
  return buildMargin(orders, lines, exp.materials);
}

/** View A and View B from one set of queries (dashboard, overview, summary). */
export async function getAccountingOverview(
  range: DateRange,
): Promise<{ cash: CashSummary; margin: GrossMarginSummary }> {
  const [orders, exp, inc] = await Promise.all([
    fetchPaidOrders(range),
    sumExpenses(range),
    sumIncome(range),
  ]);
  const lines = await fetchOrderLines(orders.map((o) => o.id));
  return {
    cash: buildCash(orders, exp, inc),
    margin: buildMargin(orders, lines, exp.materials),
  };
}

/** Existing name used by admin-accounting.ts: the cash view. */
export async function getAccountingSummary(range: DateRange): Promise<AccountingSummary> {
  return getCashSummary(range);
}

export type AssetProgress = {
  id: string;
  name: string;
  seller: string | null;
  assetDate: string;
  total: number;
  isInstalment: boolean;
  instalmentCount: number | null;
  /** Payments dated inside the range. */
  paidInRange: number;
  /** All payments ever made, regardless of the range. */
  paidToDate: number;
  paymentsCount: number;
  /** Instalment assets only: total minus ALL payments (all-time balance), never below 0. */
  stillToPay: number;
};

export async function getAssetsProgress(range: DateRange): Promise<AssetProgress[]> {
  const [assetRows, payRows] = await Promise.all([
    db.select().from(assets).orderBy(assets.assetDate),
    db.select().from(assetPayments),
  ]);
  const byAsset = new Map<string, { inRange: number; toDate: number; count: number }>();
  for (const p of payRows) {
    const s = byAsset.get(p.assetId) ?? { inRange: 0, toDate: 0, count: 0 };
    const amt = toNum(p.amount);
    const d = p.paymentDate;
    const afterFrom = !range.from || d >= range.from;
    const beforeTo = !range.to || d <= range.to;
    if (afterFrom && beforeTo) s.inRange += amt;
    s.toDate += amt;
    s.count += 1;
    byAsset.set(p.assetId, s);
  }
  return assetRows.map((a) => {
    const s = byAsset.get(a.id) ?? { inRange: 0, toDate: 0, count: 0 };
    const total = toNum(a.amount);
    const isInstalment = a.instalmentCount != null;
    return {
      id: a.id,
      name: a.name,
      seller: a.seller ?? null,
      assetDate: a.assetDate,
      total,
      isInstalment,
      instalmentCount: a.instalmentCount ?? null,
      paidInRange: round2(s.inRange),
      paidToDate: round2(s.toDate),
      paymentsCount: s.count,
      stillToPay: isInstalment ? round2(Math.max(0, total - s.toDate)) : 0,
    };
  });
}

/**
 * Still owed on instalment assets, ALL TIME. Never range-bound: a debt does not
 * disappear because the report window ends before it falls due.
 */
export async function getInstalmentsOwed(): Promise<number> {
  const all = await getAssetsProgress({ from: null, to: null });
  return round2(all.reduce((s, a) => s + a.stillToPay, 0));
}

/** View C. Pass an already-computed cash summary to skip re-querying orders. */
export async function getNetPosition(
  range: DateRange,
  cash?: CashSummary,
): Promise<NetPosition> {
  const [cashSummary, payAgg, inc, progress] = await Promise.all([
    cash ? Promise.resolve(cash) : getCashSummary(range),
    db
      .select({ total: sql<string>`COALESCE(SUM(${assetPayments.amount}), 0)` })
      .from(assetPayments)
      .where(and(...ymdConds(assetPayments.paymentDate, range))),
    sumIncome(range),
    getAssetsProgress({ from: null, to: null }),
  ]);
  const assetPaymentsMade = toNum(payAgg[0]?.total);
  const instalmentsOwed = round2(progress.reduce((s, a) => s + a.stillToPay, 0));
  const pos = computeNetPosition({
    netProfitCash: cashSummary.netProfit,
    assetPaymentsMade,
    capitalIn: inc.capitalIn,
    capitalOut: inc.capitalOut,
    instalmentsOwed,
  });
  return {
    netProfitCash: cashSummary.netProfit,
    assetPaymentsMade: round2(assetPaymentsMade),
    capitalIn: round2(inc.capitalIn),
    capitalOut: round2(inc.capitalOut),
    now: pos.now,
    instalmentsOwed,
    afterInstalments: pos.afterInstalments,
    assetsWithoutPayments: progress.filter((a) => a.paymentsCount === 0 && a.total > 0).length,
  };
}

/**
 * Sales by period. Bucket defaults from the span (daily <= 31 days, weekly
 * <= 180, else monthly). Rows exist only for periods that have paid orders.
 */
export async function getSalesReport(
  range: DateRange & { bucket?: RangeBucket },
): Promise<SalesReportRow[]> {
  const bucket = range.bucket ?? bucketForRange(range);
  const orders = await fetchPaidOrders(range);
  const lines = await fetchOrderLines(orders.map((o) => o.id));
  const stats = lineStatsByOrder(lines);

  type Acc = {
    orderCount: number;
    sales: number;
    shipping: number;
    fees: number;
    cost: number;
    linesTotal: number;
    linesWithCost: number;
  };
  const byBucket = new Map<string, Acc>();
  for (const o of orders) {
    const key = bucketKeyForInstant(o.createdAt, bucket);
    const a =
      byBucket.get(key) ??
      { orderCount: 0, sales: 0, shipping: 0, fees: 0, cost: 0, linesTotal: 0, linesWithCost: 0 };
    a.orderCount += 1;
    a.sales += orderProductSales(o);
    a.shipping += orderShippingKept(o);
    a.fees += o.paypalFee ?? 0;
    a.cost += o.extraCost;
    const s = stats.get(o.id);
    if (s) {
      a.cost += s.cost;
      a.linesTotal += s.total;
      a.linesWithCost += s.withCost;
    }
    byBucket.set(key, a);
  }

  return [...byBucket.entries()]
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([key, a]) => {
      const coverage = costCoverage(a.linesWithCost, a.linesTotal, a.sales > 0);
      return {
        bucket: key,
        label: bucketLabel(key, bucket),
        orderCount: a.orderCount,
        sales: round2(a.sales),
        shippingCollected: round2(a.shipping),
        paypalFees: round2(a.fees),
        productCost: round2(a.cost),
        coverage,
        grossMargin: hasEnoughCostData(coverage) ? round2(a.sales - a.cost - a.fees) : null,
      };
    });
}

/** True when SST is switched on in store settings (SST is not modelled here). */
export async function getSstEnabled(): Promise<boolean> {
  const [row] = await db
    .select({ on: storeSettings.sstEnabled })
    .from(storeSettings)
    .where(eq(storeSettings.id, "default"))
    .limit(1);
  return !!row?.on;
}
