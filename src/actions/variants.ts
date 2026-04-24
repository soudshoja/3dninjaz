"use server";

/**
 * Phase 16/17 — Admin variant management server actions.
 *
 * All actions gated by requireAdmin() as FIRST await (CVE-2025-29927).
 *
 * Actions (Phase 16):
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
 *
 * Actions (Phase 17):
 *   uploadVariantImage      — upload image for a variant row (AD-02, Pattern A)
 *   removeVariantImage      — clear imageUrl + best-effort delete (Pattern A)
 *   setDefaultVariant       — transaction: unset all, set one (AD-05, Pattern B)
 *   bulkUpdateVariants      — set/multiply/add price, sale price, active, delete (AD-03, Pattern B)
 */

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  productOptions,
  productOptionValues,
  productVariants,
  products,
} from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// Phase 18 — revalidate both admin editor AND public PDP after every variant
// mutation. Issue 4: inventory/price edits weren't reflected on /products/[slug]
// because only the admin path was revalidated.
async function revalidateProductSurfaces(productId: string): Promise<void> {
  revalidatePath(`/admin/products/${productId}/variants`);
  const [p] = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (p) {
    revalidatePath(`/products/${p.slug}`);
    revalidatePath("/");
    revalidatePath("/shop");
  }
}
import { requireAdmin } from "@/lib/auth-helpers";
import { writeUpload, deleteUpload } from "@/lib/storage";
import { composeVariantLabel, hydrateProductVariants } from "@/lib/variants";
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

  const existing = await db
    .select({ id: productOptions.id, position: productOptions.position })
    .from(productOptions)
    .where(eq(productOptions.productId, productId));

  if (existing.length >= 3) {
    return { error: "Product supports up to 3 attribute types (e.g., Size, Color, Part). Each option can have unlimited values — add values to existing options to create more variants." };
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

  if (nextPosition > 3) return { error: "Product supports up to 3 attribute types. Add more values to existing options to create more variants." };

  const id = randomUUID();
  await db.insert(productOptions).values({
    id,
    productId,
    name: trimmed,
    position: nextPosition,
  });

  await revalidateProductSurfaces(productId);
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

  await revalidateProductSurfaces(option.productId);
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

  await revalidateProductSurfaces(option.productId);
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
  if (option) await revalidateProductSurfaces(option.productId);

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
  if (option) await revalidateProductSurfaces(option.productId);

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
  if (option) await revalidateProductSurfaces(option.productId);

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

  await revalidateProductSurfaces(productId);
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
  // Phase 17 — sale pricing + default + weight
  if (data.salePrice !== undefined) update.salePrice = data.salePrice || null;
  if (data.saleFrom !== undefined) update.saleFrom = data.saleFrom ? new Date(data.saleFrom) : null;
  if (data.saleTo !== undefined) update.saleTo = data.saleTo ? new Date(data.saleTo) : null;
  if (data.isDefault !== undefined) update.isDefault = data.isDefault;
  if (data.weightG !== undefined) update.weightG = data.weightG === null || data.weightG === undefined ? null : Number(data.weightG);
  // Phase 18 — allow pre-order toggle
  if (data.allowPreorder !== undefined) update.allowPreorder = data.allowPreorder;

  // Validate sale price < regular price (T-17-01-price-tampering)
  if (data.salePrice && data.salePrice !== "") {
    const [currentVariant] = await db
      .select({ price: productVariants.price })
      .from(productVariants)
      .where(eq(productVariants.id, variantId))
      .limit(1);
    if (currentVariant) {
      const saleNum = parseFloat(data.salePrice);
      const priceNum = parseFloat(String(currentVariant.price));
      if (saleNum >= priceNum) {
        return { error: "Sale price must be less than the regular price" };
      }
    }
  }

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
  if (v) await revalidateProductSurfaces(v.productId);

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

  if (v) await revalidateProductSurfaces(v.productId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// UI re-hydration helper (called by client after mutations to re-sync state)
// ---------------------------------------------------------------------------

export async function getVariantEditorData(
  productId: string,
): Promise<{ data: { options: Awaited<ReturnType<typeof hydrateProductVariants>>["options"]; variants: Awaited<ReturnType<typeof hydrateProductVariants>>["variants"] } } | { error: string }> {
  await requireAdmin();
  const { options, variants } = await hydrateProductVariants(productId);
  return { data: { options, variants } };
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

// ---------------------------------------------------------------------------
// Phase 17 — Image upload / remove per variant row (AD-02, AD-06 Pattern A)
// ---------------------------------------------------------------------------

/**
 * Upload an image for a specific variant row.
 * Reuses the Phase 7 writeUpload pipeline (bucket = productId).
 * On DB failure, best-effort deletes the newly written file (T-17-02b-upload-orphan).
 */
export async function uploadVariantImage(
  variantId: string,
  formData: FormData,
): Promise<ActionResult<{ imageUrl: string }>> {
  await requireAdmin();

  const [v] = await db
    .select({ productId: productVariants.productId, oldUrl: productVariants.imageUrl })
    .from(productVariants)
    .where(eq(productVariants.id, variantId))
    .limit(1);
  if (!v) return { error: "Variant not found" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file provided" };

  let newUrl: string;
  try {
    newUrl = await writeUpload(v.productId, file);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed" };
  }

  try {
    await db
      .update(productVariants)
      .set({ imageUrl: newUrl })
      .where(eq(productVariants.id, variantId));
  } catch {
    // Rollback filesystem on DB failure (T-17-02b-upload-orphan)
    await deleteUpload(newUrl).catch(() => {});
    return { error: "Failed to persist image URL" };
  }

  // Best-effort delete of prior image
  if (v.oldUrl) {
    await deleteUpload(v.oldUrl).catch(() => {});
  }

  await revalidateProductSurfaces(v.productId);
  return { success: true, data: { imageUrl: newUrl } };
}

/**
 * Remove the image from a variant row. Clears imageUrl to NULL and
 * best-effort deletes the file from disk.
 */
export async function removeVariantImage(variantId: string): Promise<ActionResult> {
  await requireAdmin();

  const [v] = await db
    .select({ productId: productVariants.productId, oldUrl: productVariants.imageUrl })
    .from(productVariants)
    .where(eq(productVariants.id, variantId))
    .limit(1);
  if (!v) return { error: "Variant not found" };

  await db
    .update(productVariants)
    .set({ imageUrl: null })
    .where(eq(productVariants.id, variantId));

  if (v.oldUrl) {
    await deleteUpload(v.oldUrl).catch(() => {});
  }

  await revalidateProductSurfaces(v.productId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Phase 17 — Set default variant (AD-05, AD-06 Pattern B)
// ---------------------------------------------------------------------------

/**
 * Mark one variant as the default for its product.
 * Executes inside a transaction: unset all other is_default on the product,
 * then set this one. App-layer single-default invariant (MariaDB has no
 * partial unique index). Race: last write wins — acceptable for single-admin store.
 */
export async function setDefaultVariant(variantId: string): Promise<ActionResult> {
  await requireAdmin();

  const [v] = await db
    .select({ productId: productVariants.productId })
    .from(productVariants)
    .where(eq(productVariants.id, variantId))
    .limit(1);
  if (!v) return { error: "Variant not found" };

  await db.transaction(async (tx) => {
    // 1. Unset all defaults for this product
    await tx
      .update(productVariants)
      .set({ isDefault: false })
      .where(eq(productVariants.productId, v.productId));
    // 2. Set this one
    await tx
      .update(productVariants)
      .set({ isDefault: true })
      .where(eq(productVariants.id, variantId));
  });

  await revalidateProductSurfaces(v.productId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Phase 17 — Bulk update variants (AD-03, AD-06 Pattern B)
// ---------------------------------------------------------------------------

export type BulkOp =
  | { kind: "set-price"; value: string }
  | { kind: "multiply-price"; percent: number }
  | { kind: "add-price"; delta: string }
  | { kind: "set-sale-price"; value: string | null }
  | { kind: "set-active"; inStock: boolean }
  | { kind: "delete" };

/**
 * Apply a bulk operation to a subset of variants belonging to a product.
 * Validates that all variantIds belong to productId (T-17-06-bulk-scope-leak).
 * Validates post-op prices >= 0.01 (T-17-01b-negative-price).
 * Validates multiplier > 0 (T-17-01c-percentage-overflow).
 * Validates sale price < current price (T-17-01-price-tampering).
 * Wraps all row mutations in db.transaction for atomic rollback.
 */
export async function bulkUpdateVariants(
  productId: string,
  variantIds: string[],
  op: BulkOp,
): Promise<ActionResult<{ affected: number }>> {
  await requireAdmin();

  if (!variantIds.length) return { error: "No variants selected" };

  // Validate all variantIds belong to productId (T-17-06)
  const owned = await db
    .select({ id: productVariants.id, price: productVariants.price })
    .from(productVariants)
    .where(and(
      inArray(productVariants.id, variantIds),
      eq(productVariants.productId, productId),
    ));

  if (owned.length !== variantIds.length) {
    return { error: "One or more variants do not belong to this product" };
  }

  // Validate op-specific constraints
  if (op.kind === "multiply-price") {
    if (!isFinite(op.percent) || op.percent <= 0) {
      return { error: "Multiply percent must be greater than 0" };
    }
    // Check post-op prices >= 0.01 (T-17-01b)
    for (const v of owned) {
      const newPrice = Math.round(parseFloat(String(v.price)) * (op.percent / 100) * 100) / 100;
      if (newPrice < 0.01) {
        return { error: `Bulk op would set a variant price below RM 0.01` };
      }
    }
  }
  if (op.kind === "add-price") {
    const delta = parseFloat(op.delta);
    if (!isFinite(delta)) return { error: "Invalid price delta" };
    for (const v of owned) {
      const newPrice = Math.round((parseFloat(String(v.price)) + delta) * 100) / 100;
      if (newPrice < 0.01) {
        return { error: `Bulk op would set a variant price below RM 0.01` };
      }
    }
  }
  if (op.kind === "set-sale-price" && op.value !== null && op.value !== "") {
    const saleNum = parseFloat(op.value);
    for (const v of owned) {
      const priceNum = parseFloat(String(v.price));
      if (saleNum >= priceNum) {
        return { error: "Sale price must be less than the regular price for all selected variants" };
      }
    }
  }

  // Execute in transaction
  let affected = 0;
  await db.transaction(async (tx) => {
    for (const v of owned) {
      if (op.kind === "set-price") {
        await tx.update(productVariants).set({ price: op.value }).where(eq(productVariants.id, v.id));
      } else if (op.kind === "multiply-price") {
        const newPrice = (Math.round(parseFloat(String(v.price)) * (op.percent / 100) * 100) / 100).toFixed(2);
        await tx.update(productVariants).set({ price: newPrice }).where(eq(productVariants.id, v.id));
      } else if (op.kind === "add-price") {
        const delta = parseFloat(op.delta);
        const newPrice = (Math.round((parseFloat(String(v.price)) + delta) * 100) / 100).toFixed(2);
        await tx.update(productVariants).set({ price: newPrice }).where(eq(productVariants.id, v.id));
      } else if (op.kind === "set-sale-price") {
        await tx.update(productVariants).set({ salePrice: op.value || null }).where(eq(productVariants.id, v.id));
      } else if (op.kind === "set-active") {
        await tx.update(productVariants).set({ inStock: op.inStock }).where(eq(productVariants.id, v.id));
      } else if (op.kind === "delete") {
        await tx.delete(productVariants).where(eq(productVariants.id, v.id));
      }
      affected++;
    }
  });

  await revalidateProductSurfaces(productId);
  return { success: true, data: { affected } };
}
