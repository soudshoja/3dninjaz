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
import type {
  BulkCostChange,
  BulkCostMode,
  BulkCostResult,
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

const bulkSchema = z.object({ ids: idList, mode: modeSchema });

const undoSchema = z.object({
  changes: z
    .array(
      z.object({
        id: z.string().min(1).max(36),
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
  mode: BulkCostMode;
}): Promise<BulkCostResult> {
  await requireAdmin();
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That bulk change is not valid. Check the number you entered." };
  }
  const { ids, mode } = parsed.data;
  const uniqueIds = [...new Set(ids)];

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
      const prices = new Map<string, number[]>();
      for (const v of variantRows) {
        const n = Number(v.price);
        if (!Number.isFinite(n)) continue;
        const b = prices.get(v.productId) ?? [];
        b.push(n);
        prices.set(v.productId, b);
      }

      const changes: BulkCostChange[] = [];
      let skipped = 0;
      const now = new Date();
      for (const r of rows) {
        const type = r.productType ?? "stocked";
        const price = representativePrice({
          productType: type,
          variantPrices: prices.get(r.id) ?? [],
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
      skipped += uniqueIds.length - rows.length;
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
