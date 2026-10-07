import type { GiftItem } from "./gift-types";
import { formatMYR } from "@/lib/format";

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
    priceLabel: `From ${formatMYR(18)}`,
    placeholderIcon: "snowflake",
    placeholderNote: NOTE,
  },
  {
    id: "fx-reindeer",
    name: "Mini Reindeer Desk Buddy",
    href: "/shop",
    priceLabel: `From ${formatMYR(24)}`,
    placeholderIcon: "gift",
    placeholderNote: NOTE,
  },
  {
    id: "fx-cutters",
    name: "Gingerbread Cookie Cutter Set",
    href: "/shop",
    priceLabel: `From ${formatMYR(22)}`,
    placeholderIcon: "box",
    placeholderNote: NOTE,
  },
  {
    id: "fx-bauble",
    name: "Name Bauble, Made to Order",
    href: "/shop",
    priceLabel: `From ${formatMYR(15)}`,
    placeholderIcon: "tree",
    placeholderNote: NOTE,
  },
  {
    id: "fx-nightlight",
    name: "Snowy Village Night Light",
    href: "/shop",
    priceLabel: `From ${formatMYR(45)}`,
    placeholderIcon: "lamp",
    placeholderNote: NOTE,
  },
  {
    id: "fx-keychains",
    name: "Candy Cane Keychain Trio",
    href: "/shop",
    priceLabel: `From ${formatMYR(16)}`,
    placeholderIcon: "key",
    placeholderNote: NOTE,
  },
];
