/**
 * Client-safe SKU helpers — NO server imports (no db, no drizzle, no mysql2).
 * Can be imported from both client components and server actions.
 */

/**
 * Auto-generate a SKU for a variant using the brand pattern:
 *   3DN-{SLUG4}-{INITIALS}
 *
 * - 3DN- : brand prefix (4 chars)
 * - {SLUG4}: first 4 alphanumeric chars of productSlug, uppercased
 *   ("ninja-robot-model-kit" → "NINJ")
 * - {INITIALS}: first char of each option value, uppercased, no dashes
 *   (["blue", "Small"] → "BS", ["Red", "Medium", "Matte"] → "RMM")
 * - Empty/null value labels are omitted
 *
 * Examples:
 *   generateVariantSku("ninja-robot-model-kit", ["blue", "S"]) → "3DN-NINJ-BS"
 *   generateVariantSku("keyboard-name-clicker", ["Red", "Medium"]) → "3DN-KEYB-RM"
 *   generateVariantSku("t-shirt", ["Small"]) → "3DN-TSHI-S"
 *   generateVariantSku("single-option", []) → "3DN-SING"
 */
export function generateVariantSku(
  productSlug: string,
  optionValueLabels: (string | null | undefined)[],
): string {
  const slugPart = productSlug
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
  const initials = optionValueLabels
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => {
      const cleaned = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
      return cleaned.slice(0, 1);
    })
    .join("");
  return initials ? `3DN-${slugPart}-${initials}` : `3DN-${slugPart}`;
}
