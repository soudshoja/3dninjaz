/**
 * Phase 10 (10-01) — Order profit helper.
 *
 * Profit is computed EX-shipping: revenue = sum(item.price * qty), total cost
 * = sum(item.unit_cost * qty) + extra_cost. Shipping quote / courier cost are
 * ignored here because Delyva is a pass-through (customer paid, we paid).
 *
 * NULL unit_cost is treated as 0 for the math but flagged via hasMissingCosts
 * so the admin UI can surface "N items missing cost price" and prompt a
 * retroactive fill.
 *
 * All inputs are numbers (caller parses the mysql2 decimal strings once at
 * the read site). Output is also numbers — callers format via formatMYR.
 *
 * Edge cases:
 *   - Empty items array: everything 0, hasMissingCosts=false, margin=0.
 *   - revenue = 0 but cost > 0 (free promo + real cost): margin is clamped
 *     to 0 to avoid division-by-zero and wildly negative percentages.
 *   - All numbers rounded to 2 decimals on output so downstream sums stay
 *     stable (no "66.66666...%").
 */

export type OrderCostItemInput = {
  price: number;
  qty: number;
  unitCost: number | null;
};

export type OrderCostSummary = {
  revenueGross: number;
  itemCostTotal: number;
  extraCost: number;
  totalCost: number;
  profitExShipping: number;
  marginPercent: number;
  hasMissingCosts: boolean;
  missingCount: number;
};

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function computeOrderCost(
  items: ReadonlyArray<OrderCostItemInput>,
  extraCost: number,
): OrderCostSummary {
  let revenueGross = 0;
  let itemCostTotal = 0;
  let missingCount = 0;

  for (const it of items) {
    const qty = Number.isFinite(it.qty) ? it.qty : 0;
    const price = Number.isFinite(it.price) ? it.price : 0;
    revenueGross += price * qty;

    if (it.unitCost == null || !Number.isFinite(it.unitCost)) {
      missingCount += 1;
      continue;
    }
    itemCostTotal += it.unitCost * qty;
  }

  const extra = Number.isFinite(extraCost) ? Math.max(0, extraCost) : 0;
  const totalCost = itemCostTotal + extra;
  const profit = revenueGross - totalCost;
  const margin = revenueGross > 0 ? (profit / revenueGross) * 100 : 0;

  return {
    revenueGross: round2(revenueGross),
    itemCostTotal: round2(itemCostTotal),
    extraCost: round2(extra),
    totalCost: round2(totalCost),
    profitExShipping: round2(profit),
    marginPercent: round2(margin),
    hasMissingCosts: missingCount > 0,
    missingCount,
  };
}

/**
 * Convenience — parse the mysql2 decimal string/null/number shape used by
 * Drizzle columns into the numeric inputs the helper expects. Null-safe.
 */
export function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export function toNumOrNull(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
