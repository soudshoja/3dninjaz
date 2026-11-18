import "server-only";

import { db } from "@/lib/db";
import {
  orders,
  expenses,
  payouts,
  assetPayments,
  incomeEntries,
} from "@/lib/db/schema";
import { and, gte, lt, sql, type SQL } from "drizzle-orm";
import { toNum } from "@/lib/profit";
import { mytBounds, nextDayYmd, type EntryRange } from "@/lib/accounting-entry-range";
import { round2 } from "@/lib/accounting-format";
import type { AccountKey } from "@/lib/accounting-types";

// ============================================================================
// Account balances ("net movement since records began", or within a range).
//
// The ONE place that decides what moves each account. The PayPal ledger page
// takes its Balance headline from here so the two can never drift.
//
// Rules, applied the same way to every account:
//   paypal      + SUM(orders.paypal_net) of paid orders
//               + amount_paid of orders tagged PayPal by hand (no capture id, so
//                 no fee/net is known: counted at the full amount paid)
//               - refunds on those same orders (never on a captured order whose
//                 net is not recorded yet, since that money is not counted in)
//               - expenses paid_from paypal with via_paypal = 0
//   bank        + bank_transfer paid orders (amount_paid - refunded_amount)
//   cash        + cash paid orders (amount_paid - refunded_amount)
//   every acct  + income_entries on the account (capital_out subtracts)
//               + transfers in (payouts.paid_into)
//               - transfers out (payouts.from_account)
//               - expenses paid_from the account (negative = refund adds back)
//               - asset_payments paid_from the account
//   creditCard  is reported as AMOUNT OWED: positive means we owe the card.
//               owed = -(movement of the card account), i.e. card spend and
//               transfers out of the card add to it; transfers in reduce it.
//
// Decisions worth knowing:
//   - via_paypal = 1 expenses are card charges that went through PayPal. They
//     never touch the PayPal balance (they sit on the card instead).
//   - Refunds of bank/cash orders reduce those balances (money went back out).
//   - Orders have no refund date, so a refund is dated with its order.
//   - A paid order with NULL method, or method 'other', moves no balance. Both
//     are counted in `notes` so the gap is visible.
//
// Range dates are Malaysia time. Order timestamps use [from 00:00+08:00,
// to+1 day 00:00+08:00); the string-dated tables use [from, to+1 day).
// ============================================================================

export type AccountBalancesResult = {
  paypal: number;
  bank: number;
  cash: number;
  /** Amount owed on the card. Positive = we owe money. */
  creditCard: number;
  /** Plain-language caveats to show under the numbers. */
  notes: string[];
  /** PayPal-captured paid orders whose net is not recorded yet (PayPal balance low). */
  paypalNetMissingCount: number;
  /** Paid orders tagged PayPal by hand: counted at amount paid, fee unknown. */
  paypalManualCount: number;
  /** Paid orders with no payment method: counted as sales, in no balance. */
  unknownMethodOrders: { count: number; amount: number };
};

type Acc = Record<AccountKey, number>;
const zero = (): Acc => ({ paypal: 0, bank: 0, cash: 0, credit_card: 0 });

const PAID = sql`CAST(${orders.amountPaid} AS DECIMAL(10,2)) > 0`;
// Tagged PayPal by hand: no capture id, so PayPal never reported a fee or net.
export const MANUAL_PAYPAL_ORDER_SQL = sql`(${orders.paypalCaptureId} IS NULL AND ${orders.paymentMethod} = 'paypal')`;
// What each paid order adds to PayPal: the recorded net, else (hand-tagged) the
// full amount paid, else nothing yet.
export const PAYPAL_IN_SQL = sql`(CASE WHEN ${orders.paypalNet} IS NOT NULL THEN ${orders.paypalNet} WHEN ${MANUAL_PAYPAL_ORDER_SQL} THEN ${orders.amountPaid} ELSE 0 END)`;
// Orders whose money is counted into PayPal (so their refunds come out of it).
export const PAYPAL_COUNTED_SQL = sql`(${orders.paypalNet} IS NOT NULL OR ${MANUAL_PAYPAL_ORDER_SQL})`;
const CAPTURED_NET_MISSING = sql`(${orders.paypalCaptureId} IS NOT NULL AND ${orders.paypalNet} IS NULL)`;

export async function getAccountBalances(
  range?: EntryRange | null,
): Promise<AccountBalancesResult> {
  const { lo, hi } = mytBounds(range);
  const orderConds: SQL[] = [PAID];
  if (lo) orderConds.push(gte(orders.createdAt, lo));
  if (hi) orderConds.push(lt(orders.createdAt, hi));

  const strRange = (col: Parameters<typeof gte>[0]): SQL | undefined => {
    const c: SQL[] = [];
    if (range?.from) c.push(gte(col, range.from));
    if (range?.to) c.push(lt(col, nextDayYmd(range.to)));
    return c.length ? and(...c) : undefined;
  };

  const [ord] = await db
    .select({
      paypalNet: sql<string>`COALESCE(SUM(${PAYPAL_IN_SQL}), 0)`,
      paypalRefunds: sql<string>`COALESCE(SUM(CASE WHEN ${PAYPAL_COUNTED_SQL} THEN ${orders.refundedAmount} ELSE 0 END), 0)`,
      bankNet: sql<string>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod} = 'bank_transfer' AND ${orders.paypalCaptureId} IS NULL THEN ${orders.amountPaid} - ${orders.refundedAmount} ELSE 0 END), 0)`,
      cashNet: sql<string>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod} = 'cash' AND ${orders.paypalCaptureId} IS NULL THEN ${orders.amountPaid} - ${orders.refundedAmount} ELSE 0 END), 0)`,
      netMissing: sql<string>`COALESCE(SUM(CASE WHEN ${CAPTURED_NET_MISSING} THEN 1 ELSE 0 END), 0)`,
      manualPaypal: sql<string>`COALESCE(SUM(CASE WHEN ${MANUAL_PAYPAL_ORDER_SQL} AND ${orders.paypalNet} IS NULL THEN 1 ELSE 0 END), 0)`,
      unknownCount: sql<string>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod} IS NULL AND ${orders.paypalCaptureId} IS NULL THEN 1 ELSE 0 END), 0)`,
      unknownAmount: sql<string>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod} IS NULL AND ${orders.paypalCaptureId} IS NULL THEN ${orders.amountPaid} - ${orders.refundedAmount} ELSE 0 END), 0)`,
      otherCount: sql<string>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod} = 'other' AND ${orders.paypalCaptureId} IS NULL THEN 1 ELSE 0 END), 0)`,
    })
    .from(orders)
    .where(and(...orderConds));

  const expRows = await db
    .select({
      acct: expenses.paidFrom,
      viaPaypal: expenses.viaPaypal,
      total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
    })
    .from(expenses)
    .where(strRange(expenses.expenseDate))
    .groupBy(expenses.paidFrom, expenses.viaPaypal);

  const incRows = await db
    .select({
      acct: incomeEntries.account,
      kind: incomeEntries.kind,
      total: sql<string>`COALESCE(SUM(${incomeEntries.amount}), 0)`,
    })
    .from(incomeEntries)
    .where(strRange(incomeEntries.entryDate))
    .groupBy(incomeEntries.account, incomeEntries.kind);

  const outRows = await db
    .select({
      acct: payouts.fromAccount,
      total: sql<string>`COALESCE(SUM(${payouts.amount}), 0)`,
    })
    .from(payouts)
    .where(strRange(payouts.payoutDate))
    .groupBy(payouts.fromAccount);

  const inRows = await db
    .select({
      acct: payouts.paidInto,
      total: sql<string>`COALESCE(SUM(${payouts.amount}), 0)`,
    })
    .from(payouts)
    .where(strRange(payouts.payoutDate))
    .groupBy(payouts.paidInto);

  const apRows = await db
    .select({
      acct: assetPayments.paidFrom,
      total: sql<string>`COALESCE(SUM(${assetPayments.amount}), 0)`,
    })
    .from(assetPayments)
    .where(strRange(assetPayments.paymentDate))
    .groupBy(assetPayments.paidFrom);

  const m = zero();
  m.paypal += toNum(ord?.paypalNet) - toNum(ord?.paypalRefunds);
  m.bank += toNum(ord?.bankNet);
  m.cash += toNum(ord?.cashNet);
  for (const r of expRows) {
    // Card charges that went through PayPal never touch the PayPal balance.
    if (r.acct === "paypal" && Number(r.viaPaypal) === 1) continue;
    m[r.acct] -= toNum(r.total);
  }
  for (const r of incRows) {
    m[r.acct] += (r.kind === "capital_out" ? -1 : 1) * toNum(r.total);
  }
  for (const r of outRows) m[r.acct] -= toNum(r.total);
  for (const r of inRows) m[r.acct] += toNum(r.total);
  for (const r of apRows) m[r.acct] -= toNum(r.total);

  const unknownCount = Number(ord?.unknownCount ?? 0);
  const unknownAmount = round2(toNum(ord?.unknownAmount));
  const otherCount = Number(ord?.otherCount ?? 0);
  const netMissing = Number(ord?.netMissing ?? 0);
  const manualPaypal = Number(ord?.manualPaypal ?? 0);

  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const notes: string[] = [];
  if (unknownCount > 0) {
    notes.push(
      `${unknownCount} paid ${plural(unknownCount, "order", "orders")} (RM ${unknownAmount.toFixed(2)}) ` +
        `${plural(unknownCount, "has", "have")} no payment method, so ${plural(unknownCount, "it is", "they are")} in sales but in no balance. ` +
        `Tag ${plural(unknownCount, "it", "them")} on the orders page.`,
    );
  }
  if (otherCount > 0) {
    notes.push(
      `${otherCount} paid ${plural(otherCount, "order", "orders")} tagged "Other" ${plural(otherCount, "is", "are")} in sales but in no balance.`,
    );
  }
  if (netMissing > 0) {
    notes.push(
      `PayPal balance leaves out ${netMissing} PayPal-captured ${plural(netMissing, "order", "orders")} whose fee and net are not recorded yet.`,
    );
  }
  if (manualPaypal > 0) {
    notes.push(
      `${manualPaypal} ${plural(manualPaypal, "order was", "orders were")} tagged PayPal by hand and ${plural(manualPaypal, "is", "are")} counted at the full amount paid, because no PayPal fee is known for ${plural(manualPaypal, "it", "them")}.`,
    );
  }

  return {
    paypal: round2(m.paypal),
    bank: round2(m.bank),
    cash: round2(m.cash),
    creditCard: round2(-m.credit_card),
    notes,
    paypalNetMissingCount: netMissing,
    paypalManualCount: manualPaypal,
    unknownMethodOrders: { count: unknownCount, amount: unknownAmount },
  };
}
