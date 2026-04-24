/**
 * Phase 16 — Generic variant helpers.
 *
 * Provides:
 *   hydrateProductVariants  — 3-query batch fetch (no LATERAL, per MariaDB quirk)
 *   composeVariantLabel     — "Small / Red" from array of value strings
 *   findVariantByOptions    — lookup by option value IDs
 *
 * MariaDB 10.11 note: NO LATERAL joins. All hydration uses manual multi-query
 * pattern (fetch parents → fetch children by inArray → join in memory).
 */

import { db } from "@/lib/db";
import { productOptions, productOptionValues, productVariants } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type HydratedOptionValue = {
  id: string;
  value: string;
  position: number;
  swatchHex: string | null;
};

export type HydratedOption = {
  id: string;
  name: string;
  position: number;
  values: HydratedOptionValue[];
};

export type HydratedVariant = {
  id: string;
  price: string;
  stock: number;
  inStock: boolean;
  trackStock: boolean;
  sku: string | null;
  imageUrl: string | null;
  label: string;
  position: number;
  /** [option1ValueId, option2ValueId, option3ValueId] — null slots for unused options */
  optionValueIds: [string | null, string | null, string | null];
  // Phase 14 cost breakdown passthrough
  costPrice: string | null;
  filamentGrams: string | null;
  printTimeHours: string | null;
  laborMinutes: string | null;
  otherCost: string | null;
  filamentRateOverride: string | null;
  laborRateOverride: string | null;
  costPriceManual: boolean;
  // Phase 17 — sale pricing + default flag + per-variant weight
  salePrice: string | null;
  saleFrom: Date | null;
  saleTo: Date | null;
  isDefault: boolean;
  /** Derived at hydration time: effective price given server-now. */
  effectivePrice: string;
  /** Derived: true if sale_price is set AND now is inside [saleFrom, saleTo]. */
  isOnSale: boolean;
  /** AD-08 — per-variant shipping weight in grams. NULL = inherit product weight. */
  weightG: number | null;
  /** Phase 18 — admin-toggled: when TRUE and variant is OOS (tracked+stock=0),
   * variant is shown on PDP as "Pre-order" instead of hidden. */
  allowPreorder: boolean;
};

export type HydratedProductVariants = {
  options: HydratedOption[];
  variants: HydratedVariant[];
};

// ---------------------------------------------------------------------------
// composeVariantLabel
// ---------------------------------------------------------------------------

/**
 * Join option values into a human label: ["Small", "Red"] → "Small / Red".
 * Empty strings and nulls are filtered out.
 */
export function composeVariantLabel(values: (string | null | undefined)[]): string {
  return values.filter((v): v is string => typeof v === "string" && v.trim() !== "").join(" / ");
}

// ---------------------------------------------------------------------------
// hydrateProductVariants
// ---------------------------------------------------------------------------

/**
 * Fetch options + values + variants for a single product in 3 queries.
 * Manual multi-query hydration — Drizzle's relational `with:` emits LATERAL
 * which MariaDB 10.11 does not support.
 */
export async function hydrateProductVariants(
  productId: string,
): Promise<HydratedProductVariants> {
  // Query 1: options
  const optionRows = await db
    .select()
    .from(productOptions)
    .where(eq(productOptions.productId, productId))
    .orderBy(productOptions.position);

  if (optionRows.length === 0) {
    // No options defined — hydrate variants with label_cache only
    const variantRows = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId))
      .orderBy(productVariants.position);
    const now = new Date();
    return {
      options: [],
      variants: variantRows.map((v) => {
        const isOnSale =
          v.salePrice !== null &&
          (v.saleFrom === null || v.saleFrom.getTime() <= now.getTime()) &&
          (v.saleTo === null || v.saleTo.getTime() >= now.getTime());
        const effectivePrice = isOnSale ? (v.salePrice as string) : v.price;
        return {
          id: v.id,
          price: v.price,
          stock: v.stock ?? 0,
          inStock: v.inStock ?? true,
          trackStock: v.trackStock ?? false,
          sku: v.sku ?? null,
          imageUrl: v.imageUrl ?? null,
          label: v.labelCache ?? "",
          position: v.position ?? 0,
          optionValueIds: [null, null, null] as [string | null, string | null, string | null],
          costPrice: v.costPrice ?? null,
          filamentGrams: v.filamentGrams ?? null,
          printTimeHours: v.printTimeHours ?? null,
          laborMinutes: v.laborMinutes ?? null,
          otherCost: v.otherCost ?? null,
          filamentRateOverride: v.filamentRateOverride ?? null,
          laborRateOverride: v.laborRateOverride ?? null,
          costPriceManual: v.costPriceManual ?? false,
          salePrice: v.salePrice ?? null,
          saleFrom: v.saleFrom ?? null,
          saleTo: v.saleTo ?? null,
          isDefault: v.isDefault ?? false,
          effectivePrice,
          isOnSale,
          weightG: v.weightG ?? null,
          allowPreorder: v.allowPreorder ?? false,
        };
      }),
    };
  }

  // Query 2: all option values for these options
  const optionIds = optionRows.map((o) => o.id);
  const valueRows = await db
    .select()
    .from(productOptionValues)
    .where(inArray(productOptionValues.optionId, optionIds))
    .orderBy(productOptionValues.position);

  // Query 3: variants
  const variantRows = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, productId))
    .orderBy(productVariants.position);

  // Build lookup maps
  const valueById = new Map(valueRows.map((v) => [v.id, v]));
  const valuesByOption = new Map<string, typeof valueRows>();
  for (const v of valueRows) {
    const bucket = valuesByOption.get(v.optionId) ?? [];
    bucket.push(v);
    valuesByOption.set(v.optionId, bucket);
  }

  // Hydrate options
  const options: HydratedOption[] = optionRows.map((o) => ({
    id: o.id,
    name: o.name,
    position: o.position,
    values: (valuesByOption.get(o.id) ?? []).map((v) => ({
      id: v.id,
      value: v.value,
      position: v.position,
      swatchHex: v.swatchHex ?? null,
    })),
  }));

  // Hydrate variants
  const now = new Date();
  const variants: HydratedVariant[] = variantRows.map((v) => {
    // Compose label from option1/2/3 value lookups
    const labelParts: string[] = [];
    for (const vid of [v.option1ValueId, v.option2ValueId, v.option3ValueId]) {
      if (vid) {
        const val = valueById.get(vid);
        if (val) labelParts.push(val.value);
      }
    }
    // Use label_cache if available and labelParts is empty (legacy rows)
    const label =
      labelParts.length > 0
        ? composeVariantLabel(labelParts)
        : (v.labelCache ?? "");

    const isOnSale =
      v.salePrice !== null &&
      (v.saleFrom === null || v.saleFrom.getTime() <= now.getTime()) &&
      (v.saleTo === null || v.saleTo.getTime() >= now.getTime());
    const effectivePrice = isOnSale ? (v.salePrice as string) : v.price;

    return {
      id: v.id,
      price: v.price,
      stock: v.stock ?? 0,
      inStock: v.inStock ?? true,
      trackStock: v.trackStock ?? false,
      sku: v.sku ?? null,
      imageUrl: v.imageUrl ?? null,
      label,
      position: v.position ?? 0,
      optionValueIds: [
        v.option1ValueId ?? null,
        v.option2ValueId ?? null,
        v.option3ValueId ?? null,
      ],
      costPrice: v.costPrice ?? null,
      filamentGrams: v.filamentGrams ?? null,
      printTimeHours: v.printTimeHours ?? null,
      laborMinutes: v.laborMinutes ?? null,
      otherCost: v.otherCost ?? null,
      filamentRateOverride: v.filamentRateOverride ?? null,
      laborRateOverride: v.laborRateOverride ?? null,
      costPriceManual: v.costPriceManual ?? false,
      salePrice: v.salePrice ?? null,
      saleFrom: v.saleFrom ?? null,
      saleTo: v.saleTo ?? null,
      isDefault: v.isDefault ?? false,
      effectivePrice,
      isOnSale,
      weightG: v.weightG ?? null,
      allowPreorder: v.allowPreorder ?? false,
    };
  });

  return { options, variants };
}

// ---------------------------------------------------------------------------
// findVariantByOptions
// ---------------------------------------------------------------------------

/**
 * Find a variant within a hydrated set by matching option value IDs.
 * Null slots in valueIds match variants whose corresponding option slot is also null.
 */
export function findVariantByOptions(
  variants: HydratedVariant[],
  valueIds: [string | null, string | null, string | null],
): HydratedVariant | null {
  return (
    variants.find(
      (v) =>
        v.optionValueIds[0] === valueIds[0] &&
        v.optionValueIds[1] === valueIds[1] &&
        v.optionValueIds[2] === valueIds[2],
    ) ?? null
  );
}

