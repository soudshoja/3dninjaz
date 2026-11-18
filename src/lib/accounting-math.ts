// Pure accounting arithmetic. No DB, no server-only: unit tested and shared by
// the cash summary, the Net Position page and (via numbers) the dashboard.
//
// Definitions (Accounting v2 plan):
//   View A  Net profit (cash) = product sales ex shipping
//                               + income entries (project | event | other)
//                               - PayPal fees - expenses
//           Product cost (COGS) is NEVER subtracted here.
//   View B  Gross margin      = product sales ex shipping - product cost
//                               - extra cost - PayPal fees (never expenses)
//   View C  Net position      = View A - asset payments + capital in
//                               - capital out
//           and "after instalments" also subtracts what is still owed.

export function round2(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/**
 * Shipping the shop actually kept: shipping is a pass-through that only exists
 * inside money still held. A fully refunded or part-paid order never took the
 * whole shipping charge, so it is clamped to what remains of the receipts.
 */
export function shippingKept(o: { amountPaid: number; refunded: number; shipping: number }): number {
  const kept = o.amountPaid - o.refunded;
  return Math.min(o.shipping, Math.max(0, kept));
}

/** Product sales ex shipping for one paid order (never negative from a refund). */
export function productSalesOf(o: { amountPaid: number; refunded: number; shipping: number }): number {
  return o.amountPaid - o.refunded - shippingKept(o);
}

/** Below this share of order lines with a cost, a margin headline is hidden. */
export const MIN_COST_COVERAGE = 0.9;

export function computeNetProfitCash(i: {
  productSales: number;
  incomeEntries: number;
  paypalFees: number;
  expenses: number;
}): number {
  return round2(i.productSales + i.incomeEntries - i.paypalFees - i.expenses);
}

export function computeGrossMargin(i: {
  productSales: number;
  productCost: number;
  extraCost: number;
  paypalFees: number;
}): number {
  return round2(i.productSales - i.productCost - i.extraCost - i.paypalFees);
}

/** Share (0..1) of order lines that carry a unit cost. No lines + no sales = 1. */
export function costCoverage(linesWithCost: number, totalLines: number, hasSales: boolean): number {
  if (totalLines > 0) return linesWithCost / totalLines;
  return hasSales ? 0 : 1;
}

export function hasEnoughCostData(coverage: number): boolean {
  return coverage >= MIN_COST_COVERAGE;
}

export function computeNetPosition(i: {
  netProfitCash: number;
  assetPaymentsMade: number;
  capitalIn: number;
  capitalOut: number;
  /** Still owed on instalment assets (all time, never range-bound). */
  instalmentsOwed: number;
}): { now: number; afterInstalments: number } {
  const now = round2(i.netProfitCash - i.assetPaymentsMade + i.capitalIn - i.capitalOut);
  return { now, afterInstalments: round2(now - i.instalmentsOwed) };
}
