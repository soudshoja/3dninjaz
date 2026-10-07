import type { GiftItem } from "./gift-item";

/**
 * TODO: preview-only fixtures. Names and prices are made up so the layout can
 * be judged without the database. Production passes real products.
 */
export const FIXTURE_GIFTS: GiftItem[] = [
  { id: "fx-1", slug: "reindeer-desk-buddy", name: "Reindeer desk buddy", priceLabel: "RM 38.00", imageUrl: null, isFeatured: true },
  { id: "fx-2", slug: "snowflake-ornament-set", name: "Snowflake ornament set", priceLabel: "From RM 22.00", imageUrl: null },
  { id: "fx-3", slug: "gingerbread-house-keychain", name: "Gingerbread house keychain", priceLabel: "RM 15.00", imageUrl: null },
  { id: "fx-4", slug: "star-lantern", name: "Star lantern", priceLabel: "RM 46.00", imageUrl: null },
  { id: "fx-5", slug: "santa-hat-pen-holder", name: "Santa hat pen holder", priceLabel: "RM 28.00", imageUrl: null },
  { id: "fx-6", slug: "mini-gift-box-tealight", name: "Mini gift box tealight holder", priceLabel: "From RM 19.00", imageUrl: null },
];
