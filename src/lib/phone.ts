/**
 * Malaysian phone number normalizer for guest-order linking.
 *
 * Strips all non-digit characters, then canonicalises the country prefix so
 * that "+60 11-2543 4730", "011-2543 4730", "60112543 4730", etc. all resolve
 * to the same digits-only string "60112543 4730" → "601125434730".
 *
 * Rules applied in order:
 *  1. Strip all non-digit characters.
 *  2. If the result starts with "60", keep as-is (already has country code).
 *  3. If the result starts with "0", replace the leading "0" with "60"
 *     (local format: "011..." → "6011...").
 *  4. Otherwise return the digits as-is (unknown format — still storable).
 *  5. If no digits are found, return "".
 */
export function normalizePhoneMy(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.startsWith("60")) return digits;
  if (digits.startsWith("0")) return "60" + digits.slice(1);
  return digits;
}
