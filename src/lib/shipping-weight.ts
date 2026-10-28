/**
 * Quick task 260911-mpw — pure grams<->kg helper for the mandatory
 * shipping-weight product field.
 *
 * Plain lib module — NO "use server", NO DB import, NO React import. It is
 * imported by both a client component (product-form.tsx) and a server
 * action (products.ts / admin-bulk-import.ts), so it must stay neutral on
 * both sides of that boundary.
 *
 * Unit convention: the wire/UI value is always GRAMS (integer). The DB
 * column (`products.shippingWeightKg`, decimal(8,3)) stores kilograms.
 * mysql2 returns `decimal` columns as strings, so the kg-side helper here
 * accepts `string | number`.
 */

// Upper bound mirrors MAX_PARCEL_WEIGHT_KG = 30 at
// src/lib/shipping-quote-core.ts:217 — a single unit heavier than the max
// parcel weight can never be quoted even at qty 1, so it is an unsellable
// product and the form refuses it at entry.
export const SHIPPING_WEIGHT_MIN_G = 1;
export const SHIPPING_WEIGHT_MAX_G = 30000;

export const SHIPPING_WEIGHT_ERROR =
  "Shipping weight is required — enter a whole number of grams (1–30000)";

export type ParseShippingWeightResult =
  | { ok: true; grams: number; kg: string }
  | { ok: false; error: string };

/**
 * Parse a raw grams input (string, number, or empty) into a validated
 * { grams, kg } pair, or a shared error message on failure.
 *
 * Accepts only whole-number-of-grams strings after trimming — no decimals,
 * no thousands separators, no scientific notation.
 */
export function parseShippingWeightGrams(
  input: string | number | null | undefined,
): ParseShippingWeightResult {
  if (input === null || input === undefined) {
    return { ok: false, error: SHIPPING_WEIGHT_ERROR };
  }

  const trimmed = String(input).trim();
  if (trimmed === "") {
    return { ok: false, error: SHIPPING_WEIGHT_ERROR };
  }

  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: SHIPPING_WEIGHT_ERROR };
  }

  const grams = Number(trimmed);
  if (
    !Number.isInteger(grams) ||
    grams < SHIPPING_WEIGHT_MIN_G ||
    grams > SHIPPING_WEIGHT_MAX_G
  ) {
    return { ok: false, error: SHIPPING_WEIGHT_ERROR };
  }

  return { ok: true, grams, kg: (grams / 1000).toFixed(3) };
}

/**
 * Inverse of the kg-storage side — turns a DB decimal (string, per mysql2)
 * or number into whole grams for display/pre-fill. Returns null for
 * null/empty/NaN input rather than throwing, since this feeds useState
 * initializers.
 */
export function kgToGrams(kg: string | number | null | undefined): number | null {
  if (kg === null || kg === undefined) return null;
  const trimmed = String(kg).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1000);
}
