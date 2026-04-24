/**
 * Pure variant availability helpers — client-safe (no db/mysql2 imports).
 *
 * Split out from variants.ts so client components (variant-selector) and
 * server components (product-card) can share the same logic without pulling
 * mysql2 into the client bundle. Same pattern as sku.ts.
 */

/** Minimal shape required to evaluate availability. HydratedVariant is a
 * superset of this and passes the typecheck. */
export type VariantAvailabilityShape = {
  inStock: boolean;
  trackStock: boolean;
  stock: number;
  allowPreorder: boolean;
};

/**
 * A variant is available if the admin marked it in-stock AND
 * either: stock tracking is off (on-demand print), stock > 0, or pre-order is on.
 */
export function isVariantAvailable(v: VariantAvailabilityShape): boolean {
  if (!v.inStock) return false;
  if (!v.trackStock) return true;
  if (v.stock > 0) return true;
  if (v.allowPreorder) return true;
  return false;
}
