"use server";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  products,
  productVariants,
  productConfigFields,
  categories,
  subcategories,
} from "@/lib/db/schema";
import { eq, desc, inArray, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { productSchema, type ProductInput } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";
import { computeVariantCost } from "@/lib/cost-breakdown";
import { getStoreSettingsCached } from "@/lib/store-settings";
import { ensureImagesV2 } from "@/lib/config-fields";
import { seedKeychainFields } from "@/lib/keychain-fields";
import { seedVendingFields } from "@/lib/vending-fields";

export type ProductActionResult =
  | { success: true; productId?: string }
  | { error: Record<string, string[] | undefined> | string };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toDecimalOrNull(v: string | undefined | null): string | null {
  if (!v) return null;
  const trimmed = v.toString().trim();
  if (trimmed === "") return null;
  return trimmed;
}

/**
 * MariaDB stores JSON as LONGTEXT internally, so mysql2 returns the raw string
 * instead of auto-parsing like it does for MySQL 8's native JSON type. Normalise
 * the images column back to a string array at the data-access layer so callers
 * never have to care about the dialect difference.
 */
/**
 * Force a thumbnail index back into a valid slot. Defends against:
 *   - undefined/NaN coming from the form
 *   - integer that points past the current images.length (image was deleted
 *     after the picker was last saved)
 *   - negative integers (form error)
 */
function clampThumbnailIndex(
  raw: number | undefined,
  imagesLength: number,
): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  if (raw < 0) return 0;
  if (imagesLength === 0) return 0;
  if (raw >= imagesLength) return 0;
  return Math.floor(raw);
}

/**
 * Given a subcategoryId, return the parent categoryId so we can keep the
 * legacy products.category_id pointer in sync while the transition rolls
 * out. Returns null when the subcategory isn't found (shouldn't happen
 * from the UI but defends against stale form data).
 */
async function resolveParentCategoryId(
  subcategoryId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ categoryId: subcategories.categoryId })
    .from(subcategories)
    .where(eq(subcategories.id, subcategoryId))
    .limit(1);
  return row?.categoryId ?? null;
}

function ensureImagesArray(raw: unknown): string[] {
  // Delegates to ensureImagesV2 so both the legacy string[] shape AND the
  // Phase-19 {url, caption, alt} object shape are handled correctly.
  return ensureImagesV2(raw).map((e) => e.url);
}

export async function createProduct(
  data: ProductInput
): Promise<ProductActionResult> {
  await requireAdmin();

  const parsed = productSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { variants, ...productData } = parsed.data;

  // Generate a UUID in app code so we can return it immediately and control
  // filesystem paths (uploads/products/<id>/...). MySQL's UUID() default
  // would work, but we'd need a follow-up SELECT to read it back.
  const id = randomUUID();
  const baseSlug = slugify(productData.name);
  const slug = `${baseSlug || "product"}-${Date.now().toString(36)}`;

  // Phase 19 (19-10) — if imagesV2 is provided (new shape with captions),
  // persist it directly. Otherwise fall back to the legacy string[].
  // Mirrors the same logic in updateProduct so both paths stay in sync.
  const imagesToPersist =
    productData.imagesV2 && productData.imagesV2.length > 0
      ? productData.imagesV2
      : productData.images;

  // Clamp the requested thumbnail index to a valid slot in the images array.
  // The form validator already bounds it to 0-9, but if images.length is
  // smaller (uploads removed before save) we coerce back to 0 so storefront
  // grids never index past the array.
  const safeThumb = clampThumbnailIndex(
    productData.thumbnailIndex,
    productData.images.length,
  );

  // Phase 8 — when the form supplies a subcategoryId, resolve its parent
  // category so the legacy products.category_id stays consistent (nav and
  // shop filters still read from both columns during transition).
  const resolvedCategoryId = productData.subcategoryId
    ? await resolveParentCategoryId(productData.subcategoryId)
    : productData.categoryId || null;

  await db.insert(products).values({
    id,
    name: productData.name,
    slug,
    description: productData.description,
    images: imagesToPersist,
    thumbnailIndex: safeThumb,
    materialType: productData.materialType?.trim() || null,
    estimatedProductionDays: productData.estimatedProductionDays ?? null,
    isActive: productData.isActive,
    isFeatured: productData.isFeatured,
    categoryId: resolvedCategoryId,
    subcategoryId: productData.subcategoryId || null,
    // Phase 19 (19-03) — persist product type chosen at creation
    productType: productData.productType ?? "stocked",
  });

  if (variants.length > 0) {
    // Phase 14 — fetch store rates once for cost computation.
    const storeSettings = await getStoreSettingsCached();
    const storeRates = {
      filamentCostPerKg: storeSettings.defaultFilamentCostPerKg,
      electricityCostPerKwh: storeSettings.defaultElectricityCostPerKwh,
      electricityKwhPerHour: storeSettings.defaultElectricityKwhPerHour,
      laborRatePerHour: storeSettings.defaultLaborRatePerHour,
      overheadPercent: storeSettings.defaultOverheadPercent,
    };

    await db.insert(productVariants).values(
      variants.map((v) => {
        // Phase 14 — compute cost_price from breakdown (or keep manual value).
        const breakdown = computeVariantCost(
          {
            costPriceManual: v.costPriceManual,
            costPrice: v.costPrice,
            filamentGrams: v.filamentGrams,
            printTimeHours: v.printTimeHours,
            laborMinutes: v.laborMinutes,
            otherCost: v.otherCostBreakdown,
            filamentRateOverride: v.filamentRateOverride,
            laborRateOverride: v.laborRateOverride,
          },
          storeRates,
        );
        const computedCostPrice =
          breakdown.total > 0 ? String(breakdown.total.toFixed(2)) : toDecimalOrNull(v.costPrice);
        return {
          productId: id,
          price: v.price,
          costPrice: computedCostPrice,
          trackStock: v.trackStock,
          stock: v.stock,
          // Phase 14 breakdown columns
          filamentGrams: toDecimalOrNull(v.filamentGrams),
          printTimeHours: toDecimalOrNull(v.printTimeHours),
          laborMinutes: toDecimalOrNull(v.laborMinutes),
          otherCost: toDecimalOrNull(v.otherCostBreakdown),
          filamentRateOverride: toDecimalOrNull(v.filamentRateOverride),
          laborRateOverride: toDecimalOrNull(v.laborRateOverride),
          costPriceManual: v.costPriceManual ?? false,
        };
      })
    );
  }

  // Phase 19 — auto-seed the 4 locked config fields for keychain products,
  // then wire up unitField/maxUnitCount/priceTiers so new keychains are
  // immediately ready for name personalisation + tier pricing.
  // Wrapped in try/catch so a seeding failure rolls back cleanly: delete the
  // just-inserted product row and return a form-level error.
  if (productData.productType === "keychain") {
    try {
      await seedKeychainFields(id, { silent: true });
      // Locate the text+locked row from the seeded fields (avoids AND on
      // boolean column which can be dialect-sensitive in MariaDB).
      const allFields = await db
        .select({ id: productConfigFields.id, fieldType: productConfigFields.fieldType, locked: productConfigFields.locked })
        .from(productConfigFields)
        .where(eq(productConfigFields.productId, id));
      const nameField = allFields.find((f) => f.fieldType === "text" && f.locked);
      if (nameField) {
        await db
          .update(products)
          .set({
            unitField: nameField.id,
            maxUnitCount: 8,
            priceTiers: JSON.stringify({ 1: 7, 2: 9, 3: 12, 4: 15, 5: 18, 6: 22, 7: 26, 8: 30 }),
          })
          .where(eq(products.id, id));
      }
    } catch (err) {
      console.error("[createProduct] seedKeychainFields failed:", err);
      try {
        await db.delete(products).where(eq(products.id, id));
      } catch {
        // best-effort rollback — ignore secondary error
      }
      return { error: { _form: ["Failed to seed keychain fields"] } };
    }
  }

  // Auto-seed 2 locked colour fields for vending products + flat-price tier.
  if (productData.productType === "vending") {
    try {
      await seedVendingFields(id, { silent: true });
      await db
        .update(products)
        .set({
          unitField: null,
          maxUnitCount: 1,
          priceTiers: JSON.stringify({ 1: 25 }),
        })
        .where(eq(products.id, id));
    } catch (err) {
      console.error("[createProduct] seedVendingFields failed:", err);
      try {
        await db.delete(products).where(eq(products.id, id));
      } catch {
        /* best-effort rollback */
      }
      return { error: { _form: ["Failed to seed vending fields"] } };
    }
  }

  // Quick task 260430-icx — `simple` shares vending's flat-price model
  // (priceTiers={"1":<amount>}, maxUnitCount=1, unitField=null) but does NOT
  // auto-seed any config fields. Admin curates fields freely from the
  // /admin/products/<id>/fields editor. simplePrice required for create.
  if (productData.productType === "simple") {
    const priceStr = (productData.simplePrice ?? "").trim();
    if (!priceStr) {
      try {
        await db.delete(products).where(eq(products.id, id));
      } catch {
        /* best-effort rollback */
      }
      return { error: { simplePrice: ["Price is required for simple products"] } };
    }
    const priceNum = Number(priceStr);
    await db
      .update(products)
      .set({
        unitField: null,
        maxUnitCount: 1,
        priceTiers: JSON.stringify({ 1: priceNum }),
      })
      .where(eq(products.id, id));
  }

  revalidatePath("/admin/products");
  revalidatePath("/admin");
  return { success: true, productId: id };
}

export async function updateProduct(
  id: string,
  data: ProductInput
): Promise<ProductActionResult> {
  await requireAdmin();

  const parsed = productSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { variants, ...productData } = parsed.data;

  const safeThumb = clampThumbnailIndex(
    productData.thumbnailIndex,
    productData.images.length,
  );

  const resolvedCategoryId = productData.subcategoryId
    ? await resolveParentCategoryId(productData.subcategoryId)
    : productData.categoryId || null;

  // Phase 19 (19-10) — if imagesV2 is provided (new shape with captions),
  // persist it directly (Drizzle's json() column handles serialization).
  // Otherwise fall back to the legacy string[].
  const imagesToPersist = productData.imagesV2 && productData.imagesV2.length > 0
    ? productData.imagesV2
    : productData.images;

  await db
    .update(products)
    .set({
      name: productData.name,
      description: productData.description,
      images: imagesToPersist,
      thumbnailIndex: safeThumb,
      materialType: productData.materialType?.trim() || null,
      estimatedProductionDays: productData.estimatedProductionDays ?? null,
      isActive: productData.isActive,
      isFeatured: productData.isFeatured,
      categoryId: resolvedCategoryId,
      subcategoryId: productData.subcategoryId || null,
      // Phase 19 (19-03) — persist product type (additive, no variant logic change)
      productType: productData.productType ?? "stocked",
    })
    .where(eq(products.id, id));

  // Replace variants: delete old, insert new. Simpler and correct than diffing.
  await db.delete(productVariants).where(eq(productVariants.productId, id));

  if (variants.length > 0) {
    // Phase 14 — fetch store rates once for cost computation.
    const storeSettings = await getStoreSettingsCached();
    const storeRates = {
      filamentCostPerKg: storeSettings.defaultFilamentCostPerKg,
      electricityCostPerKwh: storeSettings.defaultElectricityCostPerKwh,
      electricityKwhPerHour: storeSettings.defaultElectricityKwhPerHour,
      laborRatePerHour: storeSettings.defaultLaborRatePerHour,
      overheadPercent: storeSettings.defaultOverheadPercent,
    };

    await db.insert(productVariants).values(
      variants.map((v) => {
        const breakdown = computeVariantCost(
          {
            costPriceManual: v.costPriceManual,
            costPrice: v.costPrice,
            filamentGrams: v.filamentGrams,
            printTimeHours: v.printTimeHours,
            laborMinutes: v.laborMinutes,
            otherCost: v.otherCostBreakdown,
            filamentRateOverride: v.filamentRateOverride,
            laborRateOverride: v.laborRateOverride,
          },
          storeRates,
        );
        const computedCostPrice =
          breakdown.total > 0 ? String(breakdown.total.toFixed(2)) : toDecimalOrNull(v.costPrice);
        return {
          productId: id,
          price: v.price,
          costPrice: computedCostPrice,
          trackStock: v.trackStock,
          stock: v.stock,
          // Phase 14 breakdown columns
          filamentGrams: toDecimalOrNull(v.filamentGrams),
          printTimeHours: toDecimalOrNull(v.printTimeHours),
          laborMinutes: toDecimalOrNull(v.laborMinutes),
          otherCost: toDecimalOrNull(v.otherCostBreakdown),
          filamentRateOverride: toDecimalOrNull(v.filamentRateOverride),
          laborRateOverride: toDecimalOrNull(v.laborRateOverride),
          costPriceManual: v.costPriceManual ?? false,
        };
      })
    );
  }

  // Phase 19 — if the admin switches an existing product TO keychain type,
  // auto-seed the 4 locked fields if none exist yet (idempotent: if fields
  // already exist we leave them alone). Also wire up unitField/maxUnitCount/
  // priceTiers so the product is immediately ready without manual setup.
  if (productData.productType === "keychain") {
    const [{ value: fieldCount }] = await db
      .select({ value: count() })
      .from(productConfigFields)
      .where(eq(productConfigFields.productId, id));
    if (fieldCount === 0) {
      try {
        await seedKeychainFields(id, { silent: true });
        // Find the locked text field that was just inserted.
        const allFields = await db
          .select({ id: productConfigFields.id, fieldType: productConfigFields.fieldType, locked: productConfigFields.locked })
          .from(productConfigFields)
          .where(eq(productConfigFields.productId, id));
        const nameField = allFields.find((f) => f.fieldType === "text" && f.locked);
        if (nameField) {
          await db
            .update(products)
            .set({
              unitField: nameField.id,
              maxUnitCount: 8,
              priceTiers: JSON.stringify({ 1: 7, 2: 9, 3: 12, 4: 15, 5: 18, 6: 22, 7: 26, 8: 30 }),
            })
            .where(eq(products.id, id));
        }
      } catch (err) {
        console.error("[updateProduct] seedKeychainFields failed:", err);
        // Non-fatal for update — product row is already saved. Log and continue.
      }
    }
  }

  // If the admin switches an existing product TO vending type, auto-seed the
  // 2 locked colour fields if none exist yet. Wire flat-price tier.
  if (productData.productType === "vending") {
    const [{ value: fieldCount }] = await db
      .select({ value: count() })
      .from(productConfigFields)
      .where(eq(productConfigFields.productId, id));
    if (fieldCount === 0) {
      try {
        await seedVendingFields(id, { silent: true });
        await db
          .update(products)
          .set({
            unitField: null,
            maxUnitCount: 1,
            priceTiers: JSON.stringify({ 1: 25 }),
          })
          .where(eq(products.id, id));
      } catch (err) {
        console.error("[updateProduct] seedVendingFields failed:", err);
      }
    }
  }

  // Quick task 260430-icx — `simple` re-writes the tier-pricing trio on every
  // update so admin price edits propagate. NO auto-seed (unlike vending).
  // simplePrice empty -> leave existing tier untouched (form may omit field
  // when user hasn't changed it).
  if (productData.productType === "simple") {
    const priceStr = (productData.simplePrice ?? "").trim();
    if (priceStr) {
      const priceNum = Number(priceStr);
      await db
        .update(products)
        .set({
          unitField: null,
          maxUnitCount: 1,
          priceTiers: JSON.stringify({ 1: priceNum }),
        })
        .where(eq(products.id, id));
    }
  }

  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${id}/edit`);
  revalidatePath("/admin");
  return { success: true };
}

export async function deleteProduct(id: string): Promise<ProductActionResult> {
  await requireAdmin();
  // productVariants are cascade-deleted via FK ON DELETE CASCADE on the schema.
  await db.delete(products).where(eq(products.id, id));
  revalidatePath("/admin/products");
  revalidatePath("/admin");
  return { success: true };
}

export async function toggleProductActive(
  id: string,
  isActive: boolean
): Promise<ProductActionResult> {
  await requireAdmin();
  await db.update(products).set({ isActive }).where(eq(products.id, id));
  revalidatePath("/admin/products");
  revalidatePath("/admin");
  return { success: true };
}

export async function toggleProductFeatured(
  id: string,
  isFeatured: boolean
): Promise<ProductActionResult> {
  await requireAdmin();
  await db.update(products).set({ isFeatured }).where(eq(products.id, id));
  revalidatePath("/admin/products");
  revalidatePath("/admin");
  return { success: true };
}

// MariaDB 10.11 does not support LATERAL joins, which Drizzle's relational
// `with: { variants, category }` query builder emits. Manually hydrate the
// relations via extra SELECTs instead — small N, so no N+1 concern.

export async function getProduct(id: string) {
  const [row] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  if (!row) return null;

  const variants = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, id));

  let category: typeof categories.$inferSelect | null = null;
  if (row.categoryId) {
    const [catRow] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, row.categoryId))
      .limit(1);
    if (catRow) category = catRow;
  }

  let subcategory: typeof subcategories.$inferSelect | null = null;
  if (row.subcategoryId) {
    const [subRow] = await db
      .select()
      .from(subcategories)
      .where(eq(subcategories.id, row.subcategoryId))
      .limit(1);
    if (subRow) subcategory = subRow;
  }

  return {
    ...row,
    images: ensureImagesArray(row.images),
    // Phase 19 (19-10) — expose the V2 shape so the admin edit form can
    // populate captions without re-uploading. ensureImagesV2 handles both the
    // legacy string[] and the new {url, caption, alt} object shape.
    imagesV2: ensureImagesV2(row.images),
    variants,
    category,
    subcategory,
  };
}

export async function getProducts() {
  const list = await db
    .select()
    .from(products)
    .orderBy(desc(products.createdAt));

  if (list.length === 0) return [];

  const ids = list.map((p) => p.id);
  const variantRows = await db
    .select()
    .from(productVariants)
    .where(inArray(productVariants.productId, ids));

  const categoryIds = Array.from(
    new Set(list.map((p) => p.categoryId).filter((v): v is string => !!v))
  );
  const categoryRows =
    categoryIds.length > 0
      ? await db
          .select()
          .from(categories)
          .where(inArray(categories.id, categoryIds))
      : [];

  const subcategoryIds = Array.from(
    new Set(list.map((p) => p.subcategoryId).filter((v): v is string => !!v)),
  );
  const subcategoryRows =
    subcategoryIds.length > 0
      ? await db
          .select()
          .from(subcategories)
          .where(inArray(subcategories.id, subcategoryIds))
      : [];

  const variantByProduct = new Map<string, typeof variantRows>();
  for (const v of variantRows) {
    const bucket = variantByProduct.get(v.productId) ?? [];
    bucket.push(v);
    variantByProduct.set(v.productId, bucket);
  }

  const categoryById = new Map(categoryRows.map((c) => [c.id, c]));
  const subcategoryById = new Map(subcategoryRows.map((s) => [s.id, s]));

  return list.map((p) => ({
    ...p,
    images: ensureImagesArray(p.images),
    variants: variantByProduct.get(p.id) ?? [],
    category: p.categoryId ? categoryById.get(p.categoryId) ?? null : null,
    subcategory: p.subcategoryId
      ? subcategoryById.get(p.subcategoryId) ?? null
      : null,
  }));
}
