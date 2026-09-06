/**
 * Pure helpers for per-option shipping weight resolution.
 *
 * Extracted from src/actions/shipping-quote.ts so unit tests can import
 * without triggering the `server-only` boundary.
 *
 * Used by:
 *   - src/actions/shipping-quote.ts (quoteForCart Tier 0)
 *   - src/actions/shipping.ts (sumOrderWeight Tier 0)
 *   - src/lib/__tests__/option-weight-resolution.test.ts (unit tests)
 */

import { ensureKeycapSequence } from "@/lib/config-fields";

/**
 * Phase 25 (25-08) — a keycapseq unit field stores its value as a JSON array of
 * keycap slots (e.g. `[{"t":"L","ch":"J"},{"t":"I","id":"alien"}]`), NOT a plain
 * string. Detect that shape so the weight tier keys off SLOT COUNT rather than
 * the JSON blob's raw string length. Text / number unit fields never serialise
 * to a bracketed JSON array, so they keep the length-based key.
 */
function isKeycapSequenceValue(v: string): boolean {
  const t = v.trim();
  return t.startsWith("[") && t.endsWith("]");
}

/** Shape stored in the fieldsByProduct map built by quoteForCart / sumOrderWeight. */
export type FieldWeightEntry = {
  fieldId: string;
  optionsByValue: Map<string, number>; // option.value -> weight in grams
};

/**
 * Resolve the total option-weight contribution in KG for a cart/order line
 * whose configValues map fieldId -> chosen option.value.
 *
 * - Returns null when configValues is empty, or none of the chosen options
 *   have a weight set. The caller then falls through to the existing
 *   variant -> product -> default ladder.
 * - Returns sum(matching_option.weight_grams) / 1000 otherwise.
 * - Sums across multiple Select fields on the same product.
 *
 * Server re-reads option weight from product_config_fields.configJson;
 * a client-supplied numeric weight is NEVER accepted (T-17-09 guard).
 * configValues carries only string option values, not grams — the grams
 * live exclusively in the DB-fetched FieldWeightEntry.optionsByValue map.
 */
export function resolveOptionWeightKg(
  configValues: Record<string, string>,
  fieldsForProduct: FieldWeightEntry[],
): number | null {
  let totalGrams = 0;
  let found = false;
  for (const { fieldId, optionsByValue } of fieldsForProduct) {
    const chosenValue = configValues[fieldId];
    if (chosenValue === undefined) continue;
    const grams = optionsByValue.get(chosenValue);
    if (grams !== undefined) {
      totalGrams += grams;
      found = true;
    }
  }
  return found ? totalGrams / 1000 : null;
}

/**
 * Resolve per-tier shipping weight in KG for a configurable line whose price/
 * weight scales with the character count of a unit field (keychain / clicker).
 *
 * The unit count = length of the customer's value in the unit field. The
 * weight is looked up from products.weightTiers (GRAMS keyed by count, same
 * key space as priceTiers), then converted to kg.
 *
 * Returns null when there is no unit field, the unit value is empty, or the
 * resolved length has no matching tier — the caller then falls through to the
 * existing variant -> product -> default weight ladder.
 *
 * Server re-reads weightTiers from the products row; a client-supplied weight
 * is NEVER accepted (T-17-09 guard). configValues carries only string field
 * values — the grams live exclusively in the DB-fetched weightTiers map.
 *
 * Phase 25 (25-08, D-12): for a keycapseq unit field the value is a JSON slot
 * array, so the tier key is the decoded SLOT COUNT (letters + icons combined,
 * flat-per-slot for v1), NOT the raw JSON string length. Text / number unit
 * fields are unchanged — they still key off the value's character length.
 */
export function resolveTierWeightKg(
  unitFieldId: string | null,
  configValues: Record<string, string>,
  weightTiers: Record<string, number>,
): number | null {
  if (!unitFieldId) return null;
  const v = configValues[unitFieldId];
  if (typeof v !== "string" || v.length === 0) return null;
  // keycapseq → slot count; text/number → character length (T-17-09: server
  // always re-reads weightTiers; the client gram value is never trusted).
  const count = isKeycapSequenceValue(v)
    ? ensureKeycapSequence(v).length
    : v.length;
  const grams = weightTiers[String(count)];
  if (typeof grams !== "number" || !Number.isFinite(grams) || grams < 0) {
    return null;
  }
  return grams / 1000;
}
