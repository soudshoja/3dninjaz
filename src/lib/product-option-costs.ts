import "server-only";
// Shared DB helpers for per-option ("variant") costs. A product's variants are
// the options of its Select config field; their costs live in
// product_option_costs, keyed (product, field, option value). Used by the
// inline / bulk actions and by the Excel import. Callers do requireAdmin().

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { productConfigFields, productOptionCosts } from "@/lib/db/schema";
import { ensureConfigJson, type SelectFieldConfig } from "@/lib/config-fields";
import { costToNumber, toCostString } from "@/lib/product-cost-math";
import type { OptionTarget } from "@/lib/product-cost-types";

type Reader = Pick<typeof db, "select">;
type Writer = Pick<typeof db, "select" | "insert" | "update" | "delete">;

/** value -> option price (null = no override) for one Select field, or null if not a Select. */
export async function selectOptionPrices(
  tx: Reader,
  productId: string,
  fieldId: string,
): Promise<Map<string, number | null> | null> {
  const [f] = await tx
    .select({ configJson: productConfigFields.configJson })
    .from(productConfigFields)
    .where(
      and(
        eq(productConfigFields.id, fieldId),
        eq(productConfigFields.productId, productId),
        eq(productConfigFields.fieldType, "select"),
      ),
    )
    .limit(1);
  if (!f) return null;
  let cfg: SelectFieldConfig;
  try {
    cfg = ensureConfigJson("select", f.configJson) as SelectFieldConfig;
  } catch {
    return null;
  }
  const map = new Map<string, number | null>();
  for (const o of cfg.options ?? []) {
    if (typeof o?.value !== "string" || o.value === "") continue;
    map.set(o.value, typeof o.price === "number" && Number.isFinite(o.price) ? o.price : null);
  }
  return map;
}

export async function readOptionCost(tx: Reader, t: OptionTarget): Promise<number | null> {
  const [row] = await tx
    .select({ costPrice: productOptionCosts.costPrice })
    .from(productOptionCosts)
    .where(
      and(
        eq(productOptionCosts.productId, t.productId),
        eq(productOptionCosts.fieldId, t.fieldId),
        eq(productOptionCosts.optionValue, t.value),
      ),
    )
    .limit(1);
  return row ? costToNumber(row.costPrice) : null;
}

/** Set (or, with null, delete) the cost of one option. A missing row = use the product cost. */
export async function writeOptionCost(tx: Writer, t: OptionTarget, cost: number | null): Promise<void> {
  const where = and(
    eq(productOptionCosts.productId, t.productId),
    eq(productOptionCosts.fieldId, t.fieldId),
    eq(productOptionCosts.optionValue, t.value),
  );
  if (cost === null) {
    await tx.delete(productOptionCosts).where(where);
    return;
  }
  const costStr = toCostString(cost)!;
  const [existing] = await tx
    .select({ id: productOptionCosts.id })
    .from(productOptionCosts)
    .where(where)
    .limit(1);
  if (existing) {
    await tx
      .update(productOptionCosts)
      .set({ costPrice: costStr })
      .where(eq(productOptionCosts.id, existing.id));
  } else {
    await tx.insert(productOptionCosts).values({
      id: randomUUID(),
      productId: t.productId,
      fieldId: t.fieldId,
      optionValue: t.value,
      costPrice: costStr,
    });
  }
}

