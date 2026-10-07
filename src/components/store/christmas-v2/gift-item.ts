/**
 * What the Christmas page needs from a product. Kept small and DB-free so the
 * preview route can feed fixtures. Production maps CatalogProduct rows with
 * toGiftItem() in ./from-catalog.ts.
 */
export type GiftItem = {
  id: string;
  slug: string;
  name: string;
  /** Display price, already formatted, e.g. "RM 24.00" or "From RM 18.00". */
  priceLabel: string;
  /** First product image, or null while the product has no photo yet. */
  imageUrl: string | null;
  /** Shown as a small tag when set. */
  isFeatured?: boolean;
};
