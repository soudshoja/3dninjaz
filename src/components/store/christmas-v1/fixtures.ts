import type { GiftItem } from "./gift-types";

/**
 * Preview-only gifts. No database, no images.
 * TODO: remove once /christmas passes real products through toGiftItem().
 */
const NOTE = "TODO: product photo";

export const FIXTURE_GIFTS: GiftItem[] = [
  {
    id: "fx-snowman",
    name: "Articulated Snowman Ornament",
    href: "/shop",
    priceLabel: "From RM 18.00",
    placeholderIcon: "snowflake",
    placeholderNote: NOTE,
  },
  {
    id: "fx-reindeer",
    name: "Mini Reindeer Desk Buddy",
    href: "/shop",
    priceLabel: "From RM 24.00",
    placeholderIcon: "gift",
    placeholderNote: NOTE,
  },
  {
    id: "fx-cutters",
    name: "Gingerbread Cookie Cutter Set",
    href: "/shop",
    priceLabel: "From RM 22.00",
    placeholderIcon: "box",
    placeholderNote: NOTE,
  },
  {
    id: "fx-keychain",
    name: "Snowflake Name Keychain",
    href: "/shop",
    priceLabel: "From RM 12.00",
    placeholderIcon: "key",
    placeholderNote: NOTE,
  },
  {
    id: "fx-lamp",
    name: "Stackable Tree Night Lamp",
    href: "/shop",
    priceLabel: "From RM 48.00",
    placeholderIcon: "lamp",
    placeholderNote: NOTE,
  },
  {
    id: "fx-penguin",
    name: "Flexi Penguin Fidget",
    href: "/shop",
    priceLabel: "From RM 16.00",
    soldOut: false,
    placeholderIcon: "tree",
    placeholderNote: NOTE,
  },
];
