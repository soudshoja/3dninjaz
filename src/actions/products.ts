"use server";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { products, productVariants, categories } from "@/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { productSchema, type ProductInput } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";

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

  await db.insert(products).values({
    id,
    name: productData.name,
    slug,
    description: productData.description,
    images: productData.images,
    materialType: productData.materialType?.trim() || null,
    estimatedProductionDays: productData.estimatedProductionDays ?? null,
    isActive: productData.isActive,
    isFeatured: productData.isFeatured,
    categoryId: productData.categoryId || null,
  });

  if (variants.length > 0) {
    await db.insert(productVariants).values(
      variants.map((v) => ({
        productId: id,
        size: v.size,
        price: v.price,
        widthCm: toDecimalOrNull(v.widthCm),
        heightCm: toDecimalOrNull(v.heightCm),
        depthCm: toDecimalOrNull(v.depthCm),
      }))
    );
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

  await db
    .update(products)
    .set({
      name: productData.name,
      description: productData.description,
      images: productData.images,
      materialType: productData.materialType?.trim() || null,
      estimatedProductionDays: productData.estimatedProductionDays ?? null,
      isActive: productData.isActive,
      isFeatured: productData.isFeatured,
      categoryId: productData.categoryId || null,
    })
    .where(eq(products.id, id));

  // Replace variants: delete old, insert new. Simpler and correct than diffing.
  await db.delete(productVariants).where(eq(productVariants.productId, id));

  if (variants.length > 0) {
    await db.insert(productVariants).values(
      variants.map((v) => ({
        productId: id,
        size: v.size,
        price: v.price,
        widthCm: toDecimalOrNull(v.widthCm),
        heightCm: toDecimalOrNull(v.heightCm),
        depthCm: toDecimalOrNull(v.depthCm),
      }))
    );
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

  let category: { id: string; name: string; slug: string } | null = null;
  if (row.categoryId) {
    const [catRow] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, row.categoryId))
      .limit(1);
    if (catRow) category = catRow;
  }

  return { ...row, variants, category };
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

  const variantByProduct = new Map<string, typeof variantRows>();
  for (const v of variantRows) {
    const bucket = variantByProduct.get(v.productId) ?? [];
    bucket.push(v);
    variantByProduct.set(v.productId, bucket);
  }

  const categoryById = new Map(categoryRows.map((c) => [c.id, c]));

  return list.map((p) => ({
    ...p,
    variants: variantByProduct.get(p.id) ?? [],
    category: p.categoryId ? categoryById.get(p.categoryId) ?? null : null,
  }));
}
