"use server";

/**
 * Phase 16 — Admin variant management server actions.
 *
 * All actions gated by requireAdmin() as FIRST await (CVE-2025-29927).
 *
 * Actions:
 *   addProductOption        — insert option at next position (max 3)
 *   renameProductOption     — update option name
 *   deleteProductOption     — cascade: delete values + variants using this slot
 *   addOptionValue          — insert value at next position for an option
 *   renameOptionValue       — update value text + optional swatchHex
 *   deleteOptionValue       — warn: deletes variants using this value
 *   generateVariantMatrix   — compute cartesian of options×values, insert missing
 *   updateVariant           — Zod-validated partial update
 *   deleteVariant           — hard delete
 *   reorderOptionValues     — update positions for a list of value IDs
 */

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  productOptions,
  productOptionValues,
  productVariants,
} from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { composeVariantLabel } from "@/lib/variants";
import { variantUpdateSchema } from "@/lib/validators";

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { error: string };

// ---------------------------------------------------------------------------
// Option management
// ---------------------------------------------------------------------------

export async function addProductOption(
  productId: string,
  name: string,
): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();

  const trimmed = name.trim().slice(0, 64);
  if (!trimmed) return { error: "Option name is required" };

  // Count existing options for this product (max 3)
  const existing = await db
    .select({ id: productOptions.id, position: productOptions.position })
    .from(productOptions)
    .where(eq(productOptions.productId, productId));

  if (existing.length >= 3) {
    return { error: "Maximum 3 options per product" };
  }

  // Check for duplicate name
  const duplicate = existing.find((o) => {
    // We can't easily get name here from a select without it — re-query below
    return false; // placeholder
  });
  void duplicate; // suppress unused warning

  const existingNames = await db
    .select({ name: productOptions.name })
    .from(productOptions)
    .where(eq(productOptions.productId, productId));
  if (existingNames.some((o) => o.name.toLowerCase() === trimmed.toLowerCase())) {
    return { error: `Option "${trimmed}" already exists` };
  }

  // Next position = max existing position + 1 (1-indexed)
  const nextPosition = existing.length > 0
    ? Math.max(...existing.map((o) => o.position)) + 1
    : 1;

  if (nextPosition > 3) return { error: "Maximum 3 options per product" };

  const id = randomUUID();
  await db.insert(productOptions).values({
    id,
    productId,
    name: trimmed,
    position: nextPosition,
  });

  revalidatePath(`/admin/products/${productId}/variants`);
  return { success: true, data: { id } };
}

export async function renameProductOption(
  optionId: string,
  name: string,
): Promise<ActionResult> {
  await requireAdmin();

  const trimmed = name.trim().slice(0, 64);
  if (!trimmed) return { error: "Option name is required" };

  const [option] = await db
    .select()
    .from(productOptions)
    .where(eq(productOptions.id, optionId))
    .limit(1);
  if (!option) return { error: "Option not found" };

  await db
    .update(productOptions)
    .set({ name: trimmed })
    .where(eq(productOptions.id, optionId));

  revalidatePath(`/admin/products/${option.productId}/variants`);
  return { success: true };
}

export async function deleteProductOption(
  optionId: string,
): Promise<ActionResult<{ variantsDeleted: number }>> {
  await requireAdmin();

  const [option] = await db
    .select()
    .from(productOptions)
    .where(eq(productOptions.id, optionId))
    .limit(1);
  if (!option) return { error: "Option not found" };

  // Find all values for this option
  const values = await db
    .select({ id: productOptionValues.id })
    .from(productOptionValues)
    .where(eq(productOptionValues.optionId, optionId));

  const valueIds = values.map((v) => v.id);

  // Delete variants that reference any of these values in the corresponding slot
  let variantsDeleted = 0;
  if (valueIds.length > 0) {
    // Determine which slot this option occupies
    const slot = option.position; // 1, 2, or 3
    let whereClause;
    if (slot === 1) {
      whereClause = inArray(productVariants.option1ValueId, valueIds);
    } else if (slot === 2) {
      whereClause = inArray(productVariants.option2ValueId, valueIds);
    } else {
      whereClause = inArray(productVariants.option3ValueId, valueIds);
    }
    const toDelete = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(and(eq(productVariants.productId, option.productId), whereClause));
    variantsDeleted = toDelete.length;
    if (toDelete.length > 0) {
      await db.delete(productVariants).where(
        inArray(productVariants.id, toDelete.map((v) => v.id)),
      );
    }
  }

  // Delete option (cascades to option_values via FK)
  await db.delete(productOptions).where(eq(productOptions.id, optionId));

  revalidatePath(`/admin/products/${option.productId}/variants`);
  return { success: true, data: { variantsDeleted } };
}

// ---------------------------------------------------------------------------
// Option value management
// ---------------------------------------------------------------------------

export async function addOptionValue(
  optionId: string,
  value: string,
  swatchHex?: string,
): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();

  const trimmed = value.trim().slice(0, 64);
  if (!trimmed) return { error: "Value is required" };

  // Check for duplicate
  const existing = await db
    .select({ id: productOptionValues.id, position: productOptionValues.position })
    .from(productOptionValues)
    .where(eq(productOptionValues.optionId, optionId));

  if (existing.some((v) => {
    // Need value text — handled below
    return false;
  })) {
    // placeholder
  }

  const existingValues = await db
    .select({ value: productOptionValues.value })
    .from(productOptionValues)
    .where(eq(productOptionValues.optionId, optionId));
  if (existingValues.some((v) => v.value.toLowerCase() === trimmed.toLowerCase())) {
    return { error: `Value "${trimmed}" already exists` };
  }

  const nextPosition = existing.length > 0
    ? Math.max(...existing.map((v) => v.position)) + 1
    : 0;

  const id = randomUUID();
  await db.insert(productOptionValues).values({
    id,
    optionId,
    value: trimmed,
    position: nextPosition,
    swatchHex: swatchHex?.trim() || null,
  });

  // Get productId for revalidation
  const [option] = await db
    .select({ productId: productOptions.productId })
    .from(productOptions)
    .where(eq(productOptions.id, optionId))
    .limit(1);
  if (option) revalidatePath(`/admin/products/${option.productId}/variants`);

  return { success: true, data: { id } };
}

export async function renameOptionValue(
  valueId: string,
  value: string,
  swatchHex?: string | null,
): Promise<ActionResult> {
  await requireAdmin();

  const trimmed = value.trim().slice(0, 64);
  if (!trimmed) return { error: "Value is required" };

  const [val] = await db
    .select({ optionId: productOptionValues.optionId })
    .from(productOptionValues)
    .where(eq(productOptionValues.id, valueId))
    .limit(1);
  if (!val) return { error: "Value not found" };

  await db
    .update(productOptionValues)
    .set({
      value: trimmed,
      swatchHex: swatchHex !== undefined ? (swatchHex?.trim() || null) : undefined,
    })
    .where(eq(productOptionValues.id, valueId));

  // Update label_cache on all variants referencing this value
  const variants1 = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.option1ValueId, valueId));
  const variants2 = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.option2ValueId, valueId));
  const variants3 = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.option3ValueId, valueId));

  // Re-compute labels lazily — the generateVariantMatrix action will handle bulk updates.
  // For now just null out label_cache so the UI falls back to live query.
  const allAffected = [...variants1, ...variants2, ...variants3];
  if (allAffected.length > 0) {
    await db
      .update(productVariants)
      .set({ labelCache: null })
      .where(inArray(productVariants.id, allAffected.map((v) => v.id)));
  }

  // Get productId for revalidation
  const [option] = await db
    .select({ productId: productOptions.productId })
    .from(productOptions)
    .where(eq(productOptions.id, val.optionId))
    .limit(1);
  if (option) revalidatePath(`/admin/products/${option.productId}/variants`);

  return { success: true };
}

export async function deleteOptionValue(
  valueId: string,
): Promise<ActionResult<{ variantsDeleted: number }>> {
  await requireAdmin();

  const [val] = await db
    .select({ optionId: productOptionValues.optionId })
    .from(productOptionValues)
    .where(eq(productOptionValues.id, valueId))
    .limit(1);
  if (!val) return { error: "Value not found" };

  // Count affected variants
  const affected1 = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.option1ValueId, valueId));
  const affected2 = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.option2ValueId, valueId));
  const affected3 = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.option3ValueId, valueId));

  const allAffected = [...affected1, ...affected2, ...affected3];
  if (allAffected.length > 0) {
    await db
      .delete(productVariants)
      .where(inArray(productVariants.id, allAffected.map((v) => v.id)));
  }

  await db.delete(productOptionValues).where(eq(productOptionValues.id, valueId));

  const [option] = await db
    .select({ productId: productOptions.productId })
    .from(productOptions)
    .where(eq(productOptions.id, val.optionId))
    .limit(1);
  if (option) revalidatePath(`/admin/products/${option.productId}/variants`);

  return { success: true, data: { variantsDeleted: allAffected.length } };
}

// ---------------------------------------------------------------------------
// Variant matrix generation
// ---------------------------------------------------------------------------

/**
 * Compute the cartesian product of all option values for a product and insert
 * any missing variant combinations. Existing variants are untouched.
 * Returns count of newly inserted variants.
 */
export async function generateVariantMatrix(
  productId: string,
): Promise<ActionResult<{ inserted: number }>> {
  await requireAdmin();

  // Fetch options
  const options = await db
    .select()
    .from(productOptions)
    .where(eq(productOptions.productId, productId))
    .orderBy(productOptions.position);

  if (options.length === 0) return { error: "No options defined for this product" };

  // Fetch values for each option
  const optionIds = options.map((o) => o.id);
  const allValues = await db
    .select()
    .from(productOptionValues)
    .where(inArray(productOptionValues.optionId, optionIds))
    .orderBy(productOptionValues.position);

  const valuesByOption = new Map<string, typeof allValues>();
  for (const v of allValues) {
    const bucket = valuesByOption.get(v.optionId) ?? [];
    bucket.push(v);
    valuesByOption.set(v.optionId, bucket);
  }

  // Validate: every option must have at least one value
  for (const opt of options) {
    if (!valuesByOption.get(opt.id)?.length) {
      return { error: `Option "${opt.name}" has no values — add values first` };
    }
  }

  // Compute cartesian product
  type Combo = { v1: typeof allValues[0] | null; v2: typeof allValues[0] | null; v3: typeof allValues[0] | null };
  let combos: Combo[] = [{ v1: null, v2: null, v3: null }];

  for (let slot = 0; slot < options.length; slot++) {
    const opt = options[slot];
    const vals = valuesByOption.get(opt.id) ?? [];
    const expanded: Combo[] = [];
    for (const existing of combos) {
      for (const v of vals) {
        const next = { ...existing };
        if (slot === 0) next.v1 = v;
        else if (slot === 1) next.v2 = v;
        else next.v3 = v;
        expanded.push(next);
      }
    }
    combos = expanded;
  }

  // Fetch existing variants to avoid duplicates
  const existingVariants = await db
    .select({
      id: productVariants.id,
      option1ValueId: productVariants.option1ValueId,
      option2ValueId: productVariants.option2ValueId,
      option3ValueId: productVariants.option3ValueId,
    })
    .from(productVariants)
    .where(eq(productVariants.productId, productId));

  const existingKey = (v1: string | null, v2: string | null, v3: string | null) =>
    `${v1 ?? ""}|${v2 ?? ""}|${v3 ?? ""}`;
  const existingSet = new Set(
    existingVariants.map((v) =>
      existingKey(v.option1ValueId, v.option2ValueId, v.option3ValueId),
    ),
  );

  // Insert missing combos
  let inserted = 0;
  for (const combo of combos) {
    const v1id = combo.v1?.id ?? null;
    const v2id = combo.v2?.id ?? null;
    const v3id = combo.v3?.id ?? null;
    const key = existingKey(v1id, v2id, v3id);
    if (existingSet.has(key)) continue;

    const labelParts: string[] = [];
    if (combo.v1) labelParts.push(combo.v1.value);
    if (combo.v2) labelParts.push(combo.v2.value);
    if (combo.v3) labelParts.push(combo.v3.value);
    const label = composeVariantLabel(labelParts);

    // Use "S" as the legacy size for new variants (size column is NOT NULL — dual-read window)
    // This will be dropped in 16-07
    await db.insert(productVariants).values({
      id: randomUUID(),
      productId,
      price: "0.00",
      inStock: false,
      stock: 0,
      trackStock: false,
      option1ValueId: v1id,
      option2ValueId: v2id,
      option3ValueId: v3id,
      labelCache: label,
      position: inserted,
      costPriceManual: false,
    });
    existingSet.add(key);
    inserted++;
  }

  revalidatePath(`/admin/products/${productId}/variants`);
  return { success: true, data: { inserted } };
}

// ---------------------------------------------------------------------------
// Variant CRUD
// ---------------------------------------------------------------------------

export async function updateVariant(
  variantId: string,
  fields: Record<string, unknown>,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = variantUpdateSchema.safeParse(fields);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Validation error" };
  }

  const data = parsed.data;

  // Build update payload — only include fields that were provided
  const update: Record<string, unknown> = {};
  if (data.price !== undefined) update.price = data.price;
  if (data.costPrice !== undefined) update.costPrice = data.costPrice || null;
  if (data.stock !== undefined) update.stock = data.stock;
  if (data.trackStock !== undefined) update.trackStock = data.trackStock;
  if (data.inStock !== undefined) update.inStock = data.inStock;
  if (data.sku !== undefined) update.sku = data.sku;
  if (data.imageUrl !== undefined) update.imageUrl = data.imageUrl;
  if (data.position !== undefined) update.position = data.position;
  if (data.option1ValueId !== undefined) update.option1ValueId = data.option1ValueId;
  if (data.option2ValueId !== undefined) update.option2ValueId = data.option2ValueId;
  if (data.option3ValueId !== undefined) update.option3ValueId = data.option3ValueId;
  if (data.filamentGrams !== undefined) update.filamentGrams = data.filamentGrams || null;
  if (data.printTimeHours !== undefined) update.printTimeHours = data.printTimeHours || null;
  if (data.laborMinutes !== undefined) update.laborMinutes = data.laborMinutes || null;
  if (data.otherCost !== undefined) update.otherCost = data.otherCost || null;
  if (data.filamentRateOverride !== undefined) update.filamentRateOverride = data.filamentRateOverride || null;
  if (data.laborRateOverride !== undefined) update.laborRateOverride = data.laborRateOverride || null;
  if (data.costPriceManual !== undefined) update.costPriceManual = data.costPriceManual;

  if (Object.keys(update).length === 0) return { success: true };

  await db
    .update(productVariants)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .set(update as any)
    .where(eq(productVariants.id, variantId));

  // Revalidate — we need the product ID
  const [v] = await db
    .select({ productId: productVariants.productId })
    .from(productVariants)
    .where(eq(productVariants.id, variantId))
    .limit(1);
  if (v) revalidatePath(`/admin/products/${v.productId}/variants`);

  return { success: true };
}

export async function deleteVariant(variantId: string): Promise<ActionResult> {
  await requireAdmin();

  const [v] = await db
    .select({ productId: productVariants.productId })
    .from(productVariants)
    .where(eq(productVariants.id, variantId))
    .limit(1);

  await db.delete(productVariants).where(eq(productVariants.id, variantId));

  if (v) revalidatePath(`/admin/products/${v.productId}/variants`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Count affected variants (UI helper — returns count before delete)
// ---------------------------------------------------------------------------

export async function countVariantsAffectedByValueDelete(
  valueId: string,
): Promise<ActionResult<{ count: number }>> {
  await requireAdmin();

  const [a1, a2, a3] = await Promise.all([
    db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.option1ValueId, valueId)),
    db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.option2ValueId, valueId)),
    db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.option3ValueId, valueId)),
  ]);

  return { success: true, data: { count: a1.length + a2.length + a3.length } };
}
