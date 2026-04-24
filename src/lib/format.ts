/**
 * Currency formatting helpers for 3D Ninjaz (MYR).
 *
 * Drizzle decimal columns round-trip as strings via mysql2. These helpers
 * accept both strings and numbers so callers don't have to pre-convert.
 */

export function formatMYR(price: string | number): string {
  const n = typeof price === "string" ? parseFloat(price) : price;
  if (!Number.isFinite(n)) return "RM 0.00";
  return `RM ${n.toFixed(2)}`;
}

/**
 * Render the price of a product's variants as either a single price
 * (all variants equal) or a range "RM 18.00 - RM 45.00" (sorted ascending).
 *
 * Phase 17: accepts optional `effectivePrice` per variant so the storefront
 * grid reflects active sale prices. Falls back to `price` when not present.
 */
export function priceRangeMYR(
  variants: Array<{ price: string | number; effectivePrice?: string | number }>,
): string {
  if (!variants.length) return "RM 0.00";
  const prices = variants
    .map((v) => {
      const ep = v.effectivePrice ?? v.price;
      return typeof ep === "string" ? parseFloat(ep) : ep;
    })
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (prices.length === 0) return "RM 0.00";
  if (prices[0] === prices[prices.length - 1]) return formatMYR(prices[0]);
  return `${formatMYR(prices[0])} - ${formatMYR(prices[prices.length - 1])}`;
}
