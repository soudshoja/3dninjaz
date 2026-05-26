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
