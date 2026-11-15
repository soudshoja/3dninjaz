import "server-only";
// Product cost resolver (Accounting v2).
//
// Called at EVERY order-line insert to snapshot a per-unit cost onto
// order_items.unit_cost (unit_cost_source = 'snapshot'). Cost is snapshotted at
// creation; later product-cost edits never rewrite history except the explicit
// backfill on /admin/products/costs-import.
//
// Resolution order:
//   1. variant cost  - only when the line points at a REAL product_variants row
//      (not the "NONE" sentinel) whose cost_price is non-null
//   2. option cost   - the chosen option of a Select field has its own cost in
//      product_option_costs (a product's "variants" are its Select options;
//      configValues[fieldId] === option value). Replaces the product base cost.
//   3. product cost  - products.cost_price, plus (unitCount-1) *
//      products.cost_per_extra_unit for keychains when that is non-null
//      (an option cost, when present, is the base here)
//   4. null
//
// `unitCount` MUST be the server-validated count used to price the line
// (keycapseq: validated slot count; name-based tiers: length of the unit field
// value) and never a client-supplied number.

import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { productOptionCosts, products, productVariants } from "@/lib/db/schema";
import { costToNumber, deriveUnitCount, toCostString, unitCostFromFields } from "@/lib/product-cost-math";

export type CostLineInput = {
  productId: string | null | undefined;
  variantId?: string | null;
  /** Server-validated keycap/character count for tiered lines. */
  unitCount?: number | null;
  /**
   * Stored configuration values of the line (configuration_data.values). Used
   * ONLY when unitCount is not given: the count is derived from the product's
   * unit field the same way pricing does (keycapseq slots / text length).
   */
  configValues?: Record<string, string> | null;
};

export type ResolvedCost = {
  unitCost: number | null;
  source: "snapshot" | null;
};

/** Anything with a drizzle `select` (the db or a transaction). */
type SelectExecutor = Pick<typeof db, "select">;

const NONE: ResolvedCost = { unitCost: null, source: null };

type OptionCostRow = { fieldId: string; value: string; cost: number };

/**
 * Option costs for the given products. NEVER throws: this runs inside every
 * order insert, so a missing table (code deployed before the DDL) or any DB
 * hiccup must degrade to "no option costs", not break checkout.
 */
async function loadOptionCosts(
  executor: SelectExecutor,
  productIds: string[],
): Promise<Map<string, OptionCostRow[]>> {
  const byProduct = new Map<string, OptionCostRow[]>();
  if (productIds.length === 0) return byProduct;
  try {
    const rows = await executor
      .select({
        productId: productOptionCosts.productId,
        fieldId: productOptionCosts.fieldId,
        optionValue: productOptionCosts.optionValue,
        costPrice: productOptionCosts.costPrice,
      })
      .from(productOptionCosts)
      .where(inArray(productOptionCosts.productId, productIds));
    for (const r of rows) {
      const cost = costToNumber(r.costPrice);
      if (cost === null) continue;
      const bucket = byProduct.get(r.productId) ?? [];
      bucket.push({ fieldId: r.fieldId, value: r.optionValue, cost });
      byProduct.set(r.productId, bucket);
    }
  } catch (err) {
    console.error("[product-cost] option costs unavailable, using product cost:", err);
    return new Map();
  }
  // Deterministic when a product has several costed Select fields.
  for (const bucket of byProduct.values()) {
    bucket.sort((a, b) => (a.fieldId + a.value).localeCompare(b.fieldId + b.value));
  }
  return byProduct;
}

/** Cost of the option a line selected, or null. */
export function selectedOptionCost(
  rows: OptionCostRow[] | undefined,
  configValues: Record<string, string> | null | undefined,
): number | null {
  if (!rows || !configValues) return null;
  for (const r of rows) {
    if (configValues[r.fieldId] === r.value) return r.cost;
  }
  return null;
}

/** Batch resolver: 2-3 queries total regardless of the number of lines. */
export async function resolveUnitCosts(
  lines: CostLineInput[],
  executor: SelectExecutor = db,
): Promise<ResolvedCost[]> {
  const productIds = [
    ...new Set(lines.map((l) => l.productId).filter((v): v is string => !!v)),
  ];
  if (productIds.length === 0) return lines.map(() => NONE);
  const variantIds = [
    ...new Set(
      lines
        .map((l) => l.variantId)
        .filter((v): v is string => !!v && v !== "NONE"),
    ),
  ];

  const productRows = await executor
    .select({
      id: products.id,
      productType: products.productType,
      costPrice: products.costPrice,
      costPerExtraUnit: products.costPerExtraUnit,
      unitField: products.unitField,
    })
    .from(products)
    .where(inArray(products.id, productIds));
  const productById = new Map(productRows.map((p) => [p.id, p]));

  const variantRows =
    variantIds.length > 0
      ? await executor
          .select({
            id: productVariants.id,
            productId: productVariants.productId,
            costPrice: productVariants.costPrice,
          })
          .from(productVariants)
          .where(inArray(productVariants.id, variantIds))
      : [];
  const variantById = new Map(variantRows.map((v) => [v.id, v]));

  // Only lines that carry a configuration can select an option.
  const optionProductIds = [
    ...new Set(
      lines
        .filter((l) => !!l.productId && l.configValues && Object.keys(l.configValues).length > 0)
        .map((l) => l.productId as string),
    ),
  ];
  const optionCostsByProduct = await loadOptionCosts(executor, optionProductIds);

  return lines.map((l): ResolvedCost => {
    if (!l.productId) return NONE;
    const p = productById.get(l.productId);
    if (!p) return NONE;

    if (l.variantId && l.variantId !== "NONE") {
      const v = variantById.get(l.variantId);
      const vc = v && v.productId === l.productId ? costToNumber(v.costPrice) : null;
      if (vc !== null) return { unitCost: vc, source: "snapshot" };
    }

    const optionCost = selectedOptionCost(optionCostsByProduct.get(l.productId), l.configValues);
    const cost = unitCostFromFields({
      productType: p.productType,
      costPrice: optionCost ?? costToNumber(p.costPrice),
      costPerExtraUnit: costToNumber(p.costPerExtraUnit),
      unitCount:
        l.unitCount ?? deriveUnitCount(p.unitField ?? null, l.configValues ?? null),
    });
    return cost === null ? NONE : { unitCost: cost, source: "snapshot" };
  });
}

export async function resolveUnitCost(
  line: CostLineInput,
  executor: SelectExecutor = db,
): Promise<ResolvedCost> {
  const [r] = await resolveUnitCosts([line], executor);
  return r ?? NONE;
}

/**
 * Convenience for insert sites: the two column values to write.
 * `unitCost` is a DECIMAL string or null; `unitCostSource` is 'snapshot' or null.
 */
export function costColumns(r: ResolvedCost): {
  unitCost: string | null;
  unitCostSource: "snapshot" | null;
} {
  const unitCost = toCostString(r.unitCost);
  return { unitCost, unitCostSource: unitCost === null ? null : "snapshot" };
}
