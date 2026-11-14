import "server-only";

import { db } from "@/lib/db";
import {
  orders,
  expenses,
  payouts,
  assetPayments,
  assets,
  incomeEntries,
} from "@/lib/db/schema";
import { and, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { toNum } from "@/lib/profit";
import { formatOrderNumber } from "@/lib/orders";
import { mytBounds, nextDayYmd, type EntryRange } from "@/lib/accounting-entry-range";
import { round2 } from "@/lib/accounting-format";
import { getAccountBalances } from "@/lib/account-balances";

// Same rule as account-balances.ts: an order tagged PayPal by hand (no capture
// id) has no recorded net, so it is counted at the full amount paid.

// ============================================================================
// PayPal ledger: every line that moves the PayPal balance, plus the card
// charges that went through PayPal but did NOT (shown for information only).
//
// The Balance headline comes from getAccountBalances() so it always matches the
// balances elsewhere. The table rows are built here from the same rules.
// ============================================================================

export type PaypalLedgerRowKind =
  | "order"
  | "refund"
  | "transfer_out"
  | "transfer_in"
  | "expense"
  | "income"
  | "asset_payment";

export type PaypalLedgerRow = {
  key: string;
  /** YYYY-MM-DD (Malaysia time). Refunds carry the order date. */
  date: string;
  kind: PaypalLedgerRowKind;
  label: string;
  /** Link target for orders / refunds, when there is one. */
  orderId: string | null;
  /** Orders only: what the customer paid. */
  gross: number | null;
  /** Orders only: PayPal fee taken. */
  fee: number | null;
  /** Signed effect on the PayPal balance. */
  effect: number;
  /** Orders only: PayPal-captured but net not recorded yet, so effect is 0 for now. */
  netPending: boolean;
};

export type PaypalCardCharge = {
  id: string;
  date: string;
  supplier: string | null;
  note: string | null;
  amount: number;
};

export type PaypalLedger = {
  range: EntryRange;
  /** Sum of paypal_net over paid orders in range. */
  received: number;
  /** Sum of paypal_fee over paid orders in range. */
  fees: number;
  /** PayPal balance movement in range (same figure as getAccountBalances). */
  balance: number;
  rows: PaypalLedgerRow[];
  cardCharges: PaypalCardCharge[];
  cardChargesTotal: number;
  notes: string[];
};

function mytDate(d: Date): string {
  return new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

export async function getPaypalLedger(range: EntryRange): Promise<PaypalLedger> {
  const { lo, hi } = mytBounds(range);

  const strRange = (col: Parameters<typeof gte>[0]): SQL | undefined => {
    const c: SQL[] = [];
    if (range.from) c.push(gte(col, range.from));
    if (range.to) c.push(lt(col, nextDayYmd(range.to)));
    return c.length ? and(...c) : undefined;
  };

  const orderConds: SQL[] = [
    sql`CAST(${orders.amountPaid} AS DECIMAL(10,2)) > 0`,
    sql`(${orders.paypalCaptureId} IS NOT NULL OR ${orders.paymentMethod} = 'paypal')`,
  ];
  if (lo) orderConds.push(gte(orders.createdAt, lo));
  if (hi) orderConds.push(lt(orders.createdAt, hi));

  const [orderRows, expRows, outRows, inRows, apRows, incRows, balances] = await Promise.all([
    db
      .select({
        id: orders.id,
        createdAt: orders.createdAt,
        captureId: orders.paypalCaptureId,
        amountPaid: orders.amountPaid,
        refunded: orders.refundedAmount,
        fee: orders.paypalFee,
        net: orders.paypalNet,
      })
      .from(orders)
      .where(and(...orderConds)),
    db
      .select()
      .from(expenses)
      .where(and(eq(expenses.paidFrom, "paypal"), strRange(expenses.expenseDate))),
    db
      .select()
      .from(payouts)
      .where(and(eq(payouts.fromAccount, "paypal"), strRange(payouts.payoutDate))),
    db
      .select()
      .from(payouts)
      .where(and(eq(payouts.paidInto, "paypal"), strRange(payouts.payoutDate))),
    db
      .select({
        id: assetPayments.id,
        date: assetPayments.paymentDate,
        amount: assetPayments.amount,
        assetName: assets.name,
        instalmentNo: assetPayments.instalmentNo,
      })
      .from(assetPayments)
      .leftJoin(assets, eq(assetPayments.assetId, assets.id))
      .where(and(eq(assetPayments.paidFrom, "paypal"), strRange(assetPayments.paymentDate))),
    db
      .select()
      .from(incomeEntries)
      .where(and(eq(incomeEntries.account, "paypal"), strRange(incomeEntries.entryDate))),
    getAccountBalances(range),
  ]);

  // Card charges that went through PayPal but hit a card (paid_from card).
  const cardRows = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.viaPaypal, 1), strRange(expenses.expenseDate)));

  const rows: PaypalLedgerRow[] = [];
  let received = 0;
  let fees = 0;

  for (const o of orderRows) {
    const date = mytDate(new Date(o.createdAt));
    const manual = o.net == null && !o.captureId;
    const netPending = o.net == null && !manual;
    const net = o.net != null ? toNum(o.net) : manual ? toNum(o.amountPaid) : 0;
    const fee = toNum(o.fee);
    received += net;
    fees += fee;
    rows.push({
      key: `o:${o.id}`,
      date,
      kind: "order",
      label: `Order ${formatOrderNumber(o.id)}`,
      orderId: o.id,
      gross: toNum(o.amountPaid),
      fee: o.fee == null ? null : fee,
      effect: net,
      netPending,
    });
    const refunded = toNum(o.refunded);
    if (refunded > 0 && !netPending) {
      rows.push({
        key: `r:${o.id}`,
        date,
        kind: "refund",
        label: `Refund on order ${formatOrderNumber(o.id)} (dated with the order)`,
        orderId: o.id,
        gross: null,
        fee: null,
        effect: -refunded,
        netPending: false,
      });
    }
  }

  for (const e of expRows) {
    if (Number(e.viaPaypal) === 1) continue; // card charge, not a PayPal balance move
    rows.push({
      key: `e:${e.id}`,
      date: e.expenseDate,
      kind: "expense",
      label: [e.supplierName, e.note].filter(Boolean).join(" · ") || "Expense",
      orderId: null,
      gross: null,
      fee: null,
      effect: -toNum(e.amount),
      netPending: false,
    });
  }
  for (const p of outRows) {
    rows.push({
      key: `t:${p.id}`,
      date: p.payoutDate,
      kind: "transfer_out",
      label: `Transfer to ${p.paidInto}${p.note ? ` · ${p.note}` : ""}`,
      orderId: null,
      gross: null,
      fee: null,
      effect: -toNum(p.amount),
      netPending: false,
    });
  }
  for (const p of inRows) {
    rows.push({
      key: `ti:${p.id}`,
      date: p.payoutDate,
      kind: "transfer_in",
      label: `Transfer from ${p.fromAccount}${p.note ? ` · ${p.note}` : ""}`,
      orderId: null,
      gross: null,
      fee: null,
      effect: toNum(p.amount),
      netPending: false,
    });
  }
  for (const a of apRows) {
    rows.push({
      key: `a:${a.id}`,
      date: a.date,
      kind: "asset_payment",
      label: `Asset payment${a.assetName ? ` · ${a.assetName}` : ""}${a.instalmentNo ? ` (instalment ${a.instalmentNo})` : ""}`,
      orderId: null,
      gross: null,
      fee: null,
      effect: -toNum(a.amount),
      netPending: false,
    });
  }
  for (const i of incRows) {
    rows.push({
      key: `i:${i.id}`,
      date: i.entryDate,
      kind: "income",
      label: `${i.sourceName}${i.kind === "capital_out" ? " (capital out)" : ""}`,
      orderId: null,
      gross: null,
      fee: null,
      effect: (i.kind === "capital_out" ? -1 : 1) * toNum(i.amount),
      netPending: false,
    });
  }

  rows.sort((a, b) => (a.date === b.date ? a.key.localeCompare(b.key) : b.date.localeCompare(a.date)));

  const cardCharges: PaypalCardCharge[] = cardRows
    .map((e) => ({
      id: e.id,
      date: e.expenseDate,
      supplier: e.supplierName ?? null,
      note: e.note ?? null,
      amount: toNum(e.amount),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const notes: string[] = [];
  if (balances.paypalNetMissingCount > 0) {
    const n = balances.paypalNetMissingCount;
    notes.push(
      `${n} PayPal-captured ${n === 1 ? "order has" : "orders have"} no fee and net recorded yet, so ${n === 1 ? "it adds" : "they add"} nothing to the balance (and ${n === 1 ? "its" : "their"} refunds are left out) until the payment is synced.`,
    );
  }
  if (balances.paypalManualCount > 0) {
    const n = balances.paypalManualCount;
    notes.push(
      `${n} ${n === 1 ? "order was" : "orders were"} tagged PayPal by hand and ${n === 1 ? "is" : "are"} counted at the full amount paid, because no PayPal fee is known for ${n === 1 ? "it" : "them"}.`,
    );
  }

  return {
    range,
    received: round2(received),
    fees: round2(fees),
    balance: balances.paypal,
    rows,
    cardCharges,
    cardChargesTotal: round2(cardCharges.reduce((s, c) => s + c.amount, 0)),
    notes,
  };
}
