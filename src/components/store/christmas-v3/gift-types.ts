/**
 * The only product shape this page needs. Production maps real catalogue
 * rows into it with `toGiftItem` (see to-gift-item.ts); the preview route
 * feeds it fixtures, so it never touches the database.
 */
export type GiftIcon = "gift" | "snowflake" | "tree" | "key" | "lamp" | "box";

export type GiftItem = {
  id: string;
  name: string;
  /** Link target, e.g. `/products/<slug>`. */
  href: string;
  /** Ready-to-print price text, e.g. "From RM 18.00". */
  priceLabel: string;
  soldOut?: boolean;
  /** Stored image path. When missing, a placeholder tile is drawn. */
  imageUrl?: string;
  /** Icon drawn on the placeholder tile. */
  placeholderIcon?: GiftIcon;
  /** Visible note on the placeholder tile (fixtures use "TODO: ..."). */
  placeholderNote?: string;
};
