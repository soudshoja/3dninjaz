import "server-only";

import { db } from "@/lib/db";
import { productConfigFields, products, colors } from "@/lib/db/schema";
import { eq, asc, inArray } from "drizzle-orm";
import {
  ensureConfigJson,
  ensureTiers,
  type AnyFieldConfig,
  type FieldType,
} from "@/lib/config-fields";

// ============================================================================
// Phase 19 (19-06) — Public-side hydration helper for configurable products.
//
// Uses MANUAL MULTI-QUERY hydration (no Drizzle `with:{}` / LATERAL joins) to
// comply with MariaDB 10.11 constraints (CLAUDE.md).
//
// Admin-only colour fields (code, previousHex, familyType, familySubtype) are
// NEVER projected — Phase 18 REQ-7 contract is preserved at the read boundary.
// ============================================================================

/** Per-field config, typed per fieldType (via ensureConfigJson). */
export type PublicConfigField = {
  id: string;
  position: number;
  fieldType: FieldType;
  label: string;
  helpText: string | null;
  required: boolean;
  config: AnyFieldConfig;
  /**
   * Only present for `fieldType === "colour"` fields.
   * Pre-resolved subset from the colour library — id/name/hex ONLY.
   * Admin-only fields (code, previousHex, family*) are never included.
   */
  resolvedColours?: Array<{ id: string; name: string; hex: string }>;
};

/**
 * Fetch all configurable-product data needed for the storefront PDP.
 *
 * 1. Fetches config fields (ordered by position) for the given product.
 * 2. Parses each row's configJson via ensureConfigJson (no raw strings leak).
 * 3. For colour fields: collects all `allowedColorIds`, batch-fetches colour
 *    rows in ONE query, builds a Map, and attaches `resolvedColours` to each
 *    colour field — projecting ONLY {id, name, hex} (admin-only stripped).
 * 4. Fetches the product's tier-pricing columns and parses priceTiers via
 *    ensureTiers.
 *
 * Never throws — config parse errors surface as exceptions to the RSC.
 * Callers should handle notFound() at the page layer.
 */
export async function getConfigurableProductData(productId: string): Promise<{
  fields: PublicConfigField[];
  maxUnitCount: number | null;
  priceTiers: Record<string, number>;
  unitField: string | null;
}> {
  // Step 1 — fetch config fields ordered by position (no LATERAL)
  const fieldRows = await db
    .select()
    .from(productConfigFields)
    .where(eq(productConfigFields.productId, productId))
    .orderBy(asc(productConfigFields.position));

  // Step 2 — parse configJson per fieldType
  const parsedFields: Array<Omit<PublicConfigField, "resolvedColours"> & { _allowedColorIds?: string[] }> = fieldRows.map(
    (r) => {
      let config: AnyFieldConfig;
      try {
        config = ensureConfigJson(r.fieldType as FieldType, r.configJson);
      } catch {
        // Fail-soft: return a minimal safe config so the page doesn't crash on
        // an admin misconfiguration. The form will show an empty field.
        config = r.fieldType === "colour"
          ? { allowedColorIds: [] }
          : r.fieldType === "number"
          ? { min: 0, max: 100, step: 1 }
          : r.fieldType === "select"
          ? { options: [] }
          : { maxLength: 20, allowedChars: "A-Z", uppercase: true, profanityCheck: false };
      }

      const base = {
        id: r.id,
        position: r.position,
        fieldType: r.fieldType as FieldType,
        label: r.label,
        helpText: r.helpText ?? null,
        required: r.required ?? true,
        config,
      };

      if (r.fieldType === "colour" && "allowedColorIds" in config) {
        return { ...base, _allowedColorIds: (config as { allowedColorIds: string[] }).allowedColorIds };
      }
      return base;
    },
  );

  // Step 3 — batch-fetch resolved colours for ALL colour fields in ONE query
  const allAllowedIds = parsedFields
    .filter((f) => f._allowedColorIds && f._allowedColorIds.length > 0)
    .flatMap((f) => f._allowedColorIds!);

  const uniqueIds = Array.from(new Set(allAllowedIds));

  // Single batch query — id/name/hex ONLY (no code/previousHex/family*/brand)
  const colourRows =
    uniqueIds.length > 0
      ? await db
          .select({ id: colors.id, name: colors.name, hex: colors.hex })
          .from(colors)
          .where(inArray(colors.id, uniqueIds))
      : [];

  const colourMap = new Map(colourRows.map((c) => [c.id, c]));

  // Compose final PublicConfigField[]
  const fields: PublicConfigField[] = parsedFields.map((f) => {
    const { _allowedColorIds, ...rest } = f;
    if (_allowedColorIds) {
      const resolvedColours = _allowedColorIds
        .map((id) => colourMap.get(id))
        .filter((c): c is { id: string; name: string; hex: string } => c !== undefined);
      return { ...rest, resolvedColours };
    }
    return rest;
  });

  // Step 4 — fetch tier-pricing columns from the product row
  const [productRow] = await db
    .select({
      maxUnitCount: products.maxUnitCount,
      priceTiers: products.priceTiers,
      unitField: products.unitField,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  const priceTiers = productRow ? ensureTiers(productRow.priceTiers) : {};
  const maxUnitCount = productRow?.maxUnitCount ?? null;
  const unitField = productRow?.unitField ?? null;

  return { fields, maxUnitCount, priceTiers, unitField };
}
