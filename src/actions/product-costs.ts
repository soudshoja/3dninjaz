"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { products, productVariants } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  applyBulkMode,
  costToNumber,
  representativePrice,
  toCostString,
} from "@/lib/product-cost-math";
import { ensureTiers } from "@/lib/config-fields";
import {
  readOptionCost,
  selectOptionPrices,
  writeOptionCost,
} from "@/lib/product-option-costs";
import type {
  BulkCostChange,
  BulkCostMode,
  BulkCostResult,
  OptionCostResult,
  OptionTarget,
  SimpleCostResult,
} from "@/lib/product-cost-types";

// Product cost server actions (Accounting v2). One action per operation; every
// one calls requireAdmin() first (CVE-2025-29927: middleware alone is
// bypassable), validates with zod, writes in a single transaction, stamps
// cost_updated_at and revalidates the admin pages.

const MAX_BULK_IDS = 500;
const money = z.number().finite().min(0).max(99_999_999.99);
const idList = z.array(z.string().min(1).max(36)).min(1).max(MAX_BULK_IDS);

const singleSchema = z.object({
  productId: z.string().min(1).max(36),
  // null clears the cost
  cost: money.nullable(),
  // undefined = leave unchanged, null = clear
  costPerExtra: money.nullable().optional(),
});

const modeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("set"), amount: money }),
  z.object({
    kind: z.literal("percent_of_price"),
    percent: z.number().finite().min(0).max(1000),
  }),
  z.object({
    kind: z.literal("adjust_rm"),
    delta: z.number().finite().min(-99_999_999).max(99_999_999),
  }),
  z.object({
    kind: z.literal("adjust_percent"),
    percent: z.number().finite().min(-100).max(1000),
  }),
]);

const optionTargetSchema = z.object({
  productId: z.string().min(1).max(36),
  fieldId: z.string().min(1).max(36),
  value: z.string().min(1).max(150),
});

const bulkSchema = z
  .object({
    ids: z.array(z.string().min(1).max(36)).max(MAX_BULK_IDS),
    options: z.array(optionTargetSchema).max(MAX_BULK_IDS).optional(),
    mode: modeSchema,
  })
  .refine((v) => v.ids.length + (v.options?.length ?? 0) > 0, "Nothing selected");

const optionSingleSchema = optionTargetSchema.extend({ cost: money.nullable() });

const undoSchema = z.object({
  changes: z
    .array(
      z.object({
        id: z.string().min(1).max(36),
        option: z
          .object({ fieldId: z.string().min(1).max(36), value: z.string().min(1).max(150) })
          .optional(),
        oldCost: money.nullable(),
        oldCostPerExtra: money.nullable(),
        oldCostUpdatedAt: z.string().max(40).nullable(),
        newCost: money.nullable(),
      }),
    )
    .min(1)
    .max(MAX_BULK_IDS),
});

function revalidateCostPages() {
  revalidatePath("/admin/products");
  revalidatePath("/admin/products/costs");
  revalidatePath("/admin");
}


/**
 * Inline edit of ONE option's cost. A blank (null) cost removes the option's
 * own cost so the product cost applies again. Only options that really exist on
 * the product's Select field are accepted.
 */
export async function updateOptionCost(input: {
  productId: string;
  fieldId: string;
  value: string;
  cost: number | null;
}): Promise<OptionCostResult> {
  await requireAdmin();
  const parsed = optionSingleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a cost of RM 0.00 or more." };
  const { cost, ...target } = parsed.data;
  try {
    const prices = await selectOptionPrices(db, target.productId, target.fieldId);
    if (!prices || !prices.has(target.value)) {
      return { ok: false, error: "That option no longer exists. Refresh the page." };
    }
    await db.transaction((tx) => writeOptionCost(tx, target, cost));
    revalidateCostPages();
    return { ok: true, cost };
  } catch (err) {
    console.error("[product-costs] updateOptionCost failed:", err);
    return { ok: false, error: "Could not save that cost. Please try again." };
  }
}

/** Inline edit / mobile capture: set (or clear) the cost of ONE product. */
export async function updateProductCost(input: {
  productId: string;
  cost: number | null;
  costPerExtra?: number | null;
}): Promise<SimpleCostResult> {
  await requireAdmin();
  const parsed = singleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Enter a cost of RM 0.00 or more." };
  }
  const { productId, cost, costPerExtra } = parsed.data;

  const [cur] = await db
    .select({
      costPrice: products.costPrice,
      costPerExtraUnit: products.costPerExtraUnit,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!cur) return { ok: false, error: "Product not found." };

  const nextCost = toCostString(cost);
  const nextExtra =
    costPerExtra === undefined ? cur.costPerExtraUnit : toCostString(costPerExtra);
  const changed =
    (cur.costPrice ?? null) !== nextCost || (cur.costPerExtraUnit ?? null) !== nextExtra;

  if (changed) {
    await db
      .update(products)
      .set({
        costPrice: nextCost,
        costPerExtraUnit: nextExtra,
        costUpdatedAt: new Date(),
      })
      .where(eq(products.id, productId));
    revalidateCostPages();
    revalidatePath(`/admin/products/${productId}/edit`);
  }
  return {
    ok: true,
    cost: costToNumber(nextCost),
    costPerExtra: costToNumber(nextExtra),
  };
}

/**
 * Bulk apply. Recomputes every new value on the server from the CURRENT DB
 * price and cost (the client preview is only a preview). Returns the old values
 * so the caller can offer the 8-second Undo.
 */
export async function applyBulkCost(input: {
  ids: string[];
  /** Individual Select options (a product's variants) to cost. */
  options?: OptionTarget[];
  mode: BulkCostMode;
}): Promise<BulkCostResult> {
  await requireAdmin();
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That bulk change is not valid. Check the number you entered." };
  }
  const { ids, mode } = parsed.data;
  const optionTargets = [
    ...new Map(
      (parsed.data.options ?? []).map((o) => [`${o.productId}::${o.fieldId}::${o.value}`, o]),
    ).values(),
  ];
  const uniqueIds = [...new Set([...ids, ...optionTargets.map((o) => o.productId)])];
  const productIdSet = new Set(ids);

  try {
    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: products.id,
          productType: products.productType,
          priceTiers: products.priceTiers,
          costPrice: products.costPrice,
          costPerExtraUnit: products.costPerExtraUnit,
          costUpdatedAt: products.costUpdatedAt,
        })
        .from(products)
        .where(inArray(products.id, uniqueIds));

      const variantRows = await tx
        .select({ productId: productVariants.productId, price: productVariants.price })
        .from(productVariants)
        .where(inArray(productVariants.productId, uniqueIds));
      const priceByProduct = new Map<string, number[]>();
      for (const v of variantRows) {
        const n = Number(v.price);
        if (!Number.isFinite(n)) continue;
        const b = priceByProduct.get(v.productId) ?? [];
        b.push(n);
        priceByProduct.set(v.productId, b);
      }

      const changes: BulkCostChange[] = [];
      let skipped = 0;
      const now = new Date();
      const rowById = new Map(rows.map((r) => [r.id, r]));
      for (const r of rows) {
        if (!productIdSet.has(r.id)) continue; // loaded only for its options
        const type = r.productType ?? "stocked";
        const price = representativePrice({
          productType: type,
          variantPrices: priceByProduct.get(r.id) ?? [],
          priceTiers: type === "stocked" ? null : ensureTiers(r.priceTiers),
        });
        const current = costToNumber(r.costPrice);
        const next = applyBulkMode(mode, price, current);
        if (next === null || next === current) {
          skipped += 1;
          continue;
        }
        await tx
          .update(products)
          .set({ costPrice: toCostString(next), costUpdatedAt: now })
          .where(eq(products.id, r.id));
        changes.push({
          id: r.id,
          oldCost: current,
          oldCostPerExtra: costToNumber(r.costPerExtraUnit),
          oldCostUpdatedAt: r.costUpdatedAt ? r.costUpdatedAt.toISOString() : null,
          newCost: next,
        });
      }
      skipped += [...productIdSet].filter((id) => !rowById.has(id)).length;

      // Options: price = option price, else the product's representative price;
      // "current" for raise/lower = own cost, else the product cost it falls back to.
      const optionPricesCache = new Map<string, Map<string, number | null> | null>();
      for (const t of optionTargets) {
        const product = rowById.get(t.productId);
        const cacheKey = `${t.productId}::${t.fieldId}`;
        if (!optionPricesCache.has(cacheKey)) {
          optionPricesCache.set(cacheKey, await selectOptionPrices(tx, t.productId, t.fieldId));
        }
        const optionPrices = optionPricesCache.get(cacheKey);
        if (!product || !optionPrices || !optionPrices.has(t.value)) {
          skipped += 1;
          continue;
        }
        const type = product.productType ?? "stocked";
        const basePrice = representativePrice({
          productType: type,
          variantPrices: priceByProduct.get(product.id) ?? [],
          priceTiers: type === "stocked" ? null : ensureTiers(product.priceTiers),
        });
        const price = optionPrices.get(t.value) ?? basePrice;
        const own = await readOptionCost(tx, t);
        const productCost = costToNumber(product.costPrice);
        const next = applyBulkMode(mode, price, own ?? productCost);
        if (next === null || next === own || (own === null && next === productCost)) {
          skipped += 1;
          continue;
        }
        await writeOptionCost(tx, t, next);
        changes.push({
          id: t.productId,
          option: { fieldId: t.fieldId, value: t.value },
          oldCost: own,
          oldCostPerExtra: null,
          oldCostUpdatedAt: null,
          newCost: next,
        });
      }
      return { changes, skipped };
    });
    revalidateCostPages();
    return { ok: true, ...result };
  } catch (err) {
    console.error("[product-costs] applyBulkCost failed:", err);
    return { ok: false, error: "Could not save the new costs. Nothing was changed. Please try again." };
  }
}

/**
 * Undo a bulk apply: restore the old cost, old cost-per-extra and old
 * cost_updated_at. A row is only restored when its cost still equals the value
 * the bulk apply wrote, so a later edit is never clobbered.
 */
export async function undoBulkCost(input: {
  changes: BulkCostChange[];
}): Promise<{ ok: true; restored: number } | { ok: false; error: string }> {
  await requireAdmin();
  const parsed = undoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Nothing to undo." };

  try {
    const restored = await db.transaction(async (tx) => {
      let n = 0;
      for (const c of parsed.data.changes) {
        if (c.option) {
          const target: OptionTarget = { productId: c.id, ...c.option };
          if ((await readOptionCost(tx, target)) !== c.newCost) continue; // edited since
          await writeOptionCost(tx, target, c.oldCost);
          n += 1;
          continue;
        }
        const [cur] = await tx
          .select({ costPrice: products.costPrice })
          .from(products)
          .where(eq(products.id, c.id))
          .limit(1);
        if (!cur) continue;
        if (costToNumber(cur.costPrice) !== c.newCost) continue; // edited since
        const oldAt = c.oldCostUpdatedAt ? new Date(c.oldCostUpdatedAt) : null;
        await tx
          .update(products)
          .set({
            costPrice: toCostString(c.oldCost),
            costPerExtraUnit: toCostString(c.oldCostPerExtra),
            costUpdatedAt: oldAt && !Number.isNaN(oldAt.getTime()) ? oldAt : null,
          })
          .where(eq(products.id, c.id));
        n += 1;
      }
      return n;
    });
    revalidateCostPages();
    return { ok: true, restored };
  } catch (err) {
    console.error("[product-costs] undoBulkCost failed:", err);
    return { ok: false, error: "Could not undo. Please set the costs again by hand." };
  }
}
