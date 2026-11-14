import "server-only";

// ============================================================================
// STUB (track "acctcore"): the real implementation belongs to track
// "acctentry", which OVERWRITES this file. It exists only so accounting.ts and
// the overview page build before acctentry lands. The exported signature is
// the agreed contract and must not change:
//
//   getAccountBalances(range?) -> { paypal, bank, cash, creditCard, notes }
//
// Balances are "net movement since records began" (all time) unless a range is
// passed. creditCard is the amount OWED on the card (card spend minus
// transfers into the card), so a positive number is money still to repay.
// ============================================================================

import { db } from "@/lib/db";
import { orders, expenses, payouts, assetPayments, incomeEntries } from "@/lib/db/schema";
import { and, gte, lte, lt, sql, type SQL } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { toNum } from "@/lib/profit";
import { rangeBounds, type DateRange } from "@/lib/date-range";
import { round2 } from "@/lib/accounting-math";

export type AccountBalances = {
  paypal: number;
  bank: number;
  cash: number;
  creditCard: number;
  notes: string[];
};

function ymdConds(col: AnyMySqlColumn, range?: DateRange): SQL[] {
  const conds: SQL[] = [];
  if (range?.from) conds.push(gte(col, range.from));
  if (range?.to) conds.push(lte(col, range.to));
  return conds;
}

export async function getAccountBalances(range?: DateRange): Promise<AccountBalances> {
  const { start, endExclusive } = rangeBounds(range ?? { from: null, to: null });
  const orderConds: SQL[] = [sql`CAST(${orders.amountPaid} AS DECIMAL(12,2)) > 0`];
  if (start) orderConds.push(gte(orders.createdAt, start));
  if (endExclusive) orderConds.push(lt(orders.createdAt, endExclusive));

  const [o] = await db
    .select({
      paypalNet: sql<string>`COALESCE(SUM(${orders.paypalNet}), 0)`,
      paypalRefunds: sql<string>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod} = 'paypal' OR ${orders.paypalCaptureId} IS NOT NULL THEN ${orders.refundedAmount} ELSE 0 END), 0)`,
      bank: sql<string>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod} = 'bank_transfer' THEN ${orders.amountPaid} ELSE 0 END), 0)`,
      cash: sql<string>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod} = 'cash' THEN ${orders.amountPaid} ELSE 0 END), 0)`,
      unknownMethod: sql<number>`SUM(CASE WHEN ${orders.paymentMethod} IS NULL THEN 1 ELSE 0 END)`,
      netMissing: sql<number>`SUM(CASE WHEN ${orders.paypalCaptureId} IS NOT NULL AND ${orders.paypalNet} IS NULL THEN 1 ELSE 0 END)`,
    })
    .from(orders)
    .where(and(...orderConds));

  const expRows = await db
    .select({
      paidFrom: expenses.paidFrom,
      viaPaypal: expenses.viaPaypal,
      total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
    })
    .from(expenses)
    .where(and(...ymdConds(expenses.expenseDate, range)))
    .groupBy(expenses.paidFrom, expenses.viaPaypal);

  const payRows = await db
    .select({
      paidFrom: assetPayments.paidFrom,
      total: sql<string>`COALESCE(SUM(${assetPayments.amount}), 0)`,
    })
    .from(assetPayments)
    .where(and(...ymdConds(assetPayments.paymentDate, range)))
    .groupBy(assetPayments.paidFrom);

  const incRows = await db
    .select({
      account: incomeEntries.account,
      total: sql<string>`COALESCE(SUM(${incomeEntries.amount}), 0)`,
    })
    .from(incomeEntries)
    .where(and(...ymdConds(incomeEntries.entryDate, range)))
    .groupBy(incomeEntries.account);

  const trRows = await db
    .select({
      fromAccount: payouts.fromAccount,
      paidInto: payouts.paidInto,
      total: sql<string>`COALESCE(SUM(${payouts.amount}), 0)`,
    })
    .from(payouts)
    .where(and(...ymdConds(payouts.payoutDate, range)))
    .groupBy(payouts.fromAccount, payouts.paidInto);

  const bal = { paypal: 0, bank: 0, cash: 0, credit_card: 0 };
  type Key = keyof typeof bal;

  bal.paypal += toNum(o?.paypalNet) - toNum(o?.paypalRefunds);
  bal.bank += toNum(o?.bank);
  bal.cash += toNum(o?.cash);

  for (const e of expRows) {
    // Card charges that merely route through PayPal never touch its balance.
    if (e.paidFrom === "paypal" && Number(e.viaPaypal) === 1) continue;
    bal[e.paidFrom as Key] -= toNum(e.total);
  }
  for (const p of payRows) bal[p.paidFrom as Key] -= toNum(p.total);
  for (const i of incRows) bal[i.account as Key] += toNum(i.total);
  for (const t of trRows) {
    bal[t.fromAccount as Key] -= toNum(t.total);
    bal[t.paidInto as Key] += toNum(t.total);
  }

  const notes: string[] = [];
  const unknown = Number(o?.unknownMethod ?? 0);
  if (unknown > 0) {
    notes.push(
      `${unknown} paid order${unknown === 1 ? " has" : "s have"} no payment method and ${unknown === 1 ? "is" : "are"} left out of every balance.`,
    );
  }
  const netMissing = Number(o?.netMissing ?? 0);
  if (netMissing > 0) {
    notes.push(
      `PayPal balance excludes ${netMissing} paid order${netMissing === 1 ? "" : "s"} whose net amount is not captured yet.`,
    );
  }

  return {
    paypal: round2(bal.paypal),
    bank: round2(bal.bank),
    cash: round2(bal.cash),
    // Credit card balance is stored negative while money is owed; flip to owed.
    creditCard: round2(-bal.credit_card),
    notes,
  };
}
