"use server";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { categories, subcategories, products } from "@/lib/db/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { categorySchema, subcategorySchema } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";

// ============================================================================
// Phase 8 (08-01) — Category + Subcategory management.
//
// Every write action calls requireAdmin() as its first `await` (CVE-2025-29927
// — middleware alone is bypassable; see CLAUDE.md).
//
// Reorder semantics: we use a simple integer `position` column, normalised to
// 0..N-1 within the parent (category-level or subcategory-level). Up/Down
// buttons swap positions with the adjacent sibling. This avoids drag-drop
// dependencies for v1 and keeps the SQL trivial.
// ============================================================================

export type CategoryActionResult =
  | { success: true; id?: string }
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

async function nextCategoryPosition(): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`COALESCE(MAX(${categories.position}), -1)`.mapWith(Number) })
    .from(categories);
  return (row?.max ?? -1) + 1;
}

async function nextSubcategoryPosition(categoryId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`COALESCE(MAX(${subcategories.position}), -1)`.mapWith(Number) })
    .from(subcategories)
    .where(eq(subcategories.categoryId, categoryId));
  return (row?.max ?? -1) + 1;
}

// ----------------------------------------------------------------------------
// Category writes
// ----------------------------------------------------------------------------

export async function createCategory(
  formData: FormData,
): Promise<CategoryActionResult> {
  await requireAdmin();

  const rawSlug = (formData.get("slug") as string | null) ?? "";
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    slug: rawSlug.trim() === "" ? undefined : rawSlug,
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const name = parsed.data.name.trim();
  const slug = parsed.data.slug ? slugify(parsed.data.slug) : slugify(name);
  if (!slug) return { error: { name: ["Could not derive slug from name"] } };

  const id = randomUUID();
  const position = await nextCategoryPosition();

  try {
    await db.insert(categories).values({ id, name, slug, position });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Duplicate") || msg.includes("unique")) {
      return { error: { name: ["Category name or slug already exists"] } };
    }
    throw e;
  }

  revalidatePath("/admin/categories");
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  return { success: true, id };
}

export async function updateCategory(
  id: string,
  formData: FormData,
): Promise<CategoryActionResult> {
  await requireAdmin();

  const rawSlug = (formData.get("slug") as string | null) ?? "";
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    slug: rawSlug.trim() === "" ? undefined : rawSlug,
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const name = parsed.data.name.trim();
  const slug = parsed.data.slug ? slugify(parsed.data.slug) : slugify(name);
  if (!slug) return { error: { name: ["Could not derive slug from name"] } };

  try {
    await db
      .update(categories)
      .set({ name, slug })
      .where(eq(categories.id, id));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Duplicate") || msg.includes("unique")) {
      return { error: { name: ["Category name or slug already exists"] } };
    }
    throw e;
  }

  revalidatePath("/admin/categories");
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  return { success: true };
}

export async function deleteCategory(
  id: string,
): Promise<CategoryActionResult> {
  await requireAdmin();

  // Subcategories cascade via FK; but products keep their subcategory_id set
  // to NULL (FK ON DELETE SET NULL). Null out the legacy category_id pointer
  // on products too so no dangling reference remains.
  await db.update(products).set({ categoryId: null }).where(eq(products.categoryId, id));
  await db.delete(categories).where(eq(categories.id, id));

  revalidatePath("/admin/categories");
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  return { success: true };
}

/** Swap the position of a category with its up/down sibling. */
export async function moveCategory(
  id: string,
  direction: "up" | "down",
): Promise<CategoryActionResult> {
  await requireAdmin();

  const ordered = await db
    .select({ id: categories.id, position: categories.position })
    .from(categories)
    .orderBy(asc(categories.position), asc(categories.name));

  const idx = ordered.findIndex((c) => c.id === id);
  if (idx < 0) return { error: "Category not found" };

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= ordered.length) {
    return { success: true }; // already at edge
  }

  const a = ordered[idx];
  const b = ordered[swapIdx];
  await db.update(categories).set({ position: b.position }).where(eq(categories.id, a.id));
  await db.update(categories).set({ position: a.position }).where(eq(categories.id, b.id));

  revalidatePath("/admin/categories");
  revalidatePath("/shop");
  return { success: true };
}

// ----------------------------------------------------------------------------
// Subcategory writes
// ----------------------------------------------------------------------------

export async function createSubcategory(
  formData: FormData,
): Promise<CategoryActionResult> {
  await requireAdmin();

  const rawSlug = (formData.get("slug") as string | null) ?? "";
  const parsed = subcategorySchema.safeParse({
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    slug: rawSlug.trim() === "" ? undefined : rawSlug,
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const name = parsed.data.name.trim();
  const slug = parsed.data.slug ? slugify(parsed.data.slug) : slugify(name);
  if (!slug) return { error: { name: ["Could not derive slug from name"] } };

  const id = randomUUID();
  const position = await nextSubcategoryPosition(parsed.data.categoryId);

  try {
    await db.insert(subcategories).values({
      id,
      categoryId: parsed.data.categoryId,
      slug,
      name,
      position,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Duplicate") || msg.includes("unique")) {
      return { error: { slug: ["Subcategory slug already used in this category"] } };
    }
    throw e;
  }

  revalidatePath("/admin/categories");
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  return { success: true, id };
}

export async function updateSubcategory(
  id: string,
  formData: FormData,
): Promise<CategoryActionResult> {
  await requireAdmin();

  const rawSlug = (formData.get("slug") as string | null) ?? "";
  const parsed = subcategorySchema.safeParse({
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    slug: rawSlug.trim() === "" ? undefined : rawSlug,
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const name = parsed.data.name.trim();
  const slug = parsed.data.slug ? slugify(parsed.data.slug) : slugify(name);
  if (!slug) return { error: { name: ["Could not derive slug from name"] } };

  try {
    await db
      .update(subcategories)
      .set({
        name,
        slug,
        categoryId: parsed.data.categoryId,
      })
      .where(eq(subcategories.id, id));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Duplicate") || msg.includes("unique")) {
      return { error: { slug: ["Subcategory slug already used in this category"] } };
    }
    throw e;
  }

  revalidatePath("/admin/categories");
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  return { success: true };
}

export async function deleteSubcategory(
  id: string,
): Promise<CategoryActionResult> {
  await requireAdmin();

  // Block delete if any product still points to this subcategory — admin must
  // reassign first. (Schema FK is ON DELETE SET NULL so a cascade delete
  // would silently orphan products; we'd rather fail loudly.)
  const [countRow] = await db
    .select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(products)
    .where(eq(products.subcategoryId, id));
  if ((countRow?.n ?? 0) > 0) {
    return {
      error: `Cannot delete: ${countRow?.n ?? 0} product(s) still in this subcategory. Reassign them first.`,
    };
  }

  await db.delete(subcategories).where(eq(subcategories.id, id));
  revalidatePath("/admin/categories");
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  return { success: true };
}

export async function moveSubcategory(
  id: string,
  direction: "up" | "down",
): Promise<CategoryActionResult> {
  await requireAdmin();

  const [sub] = await db
    .select()
    .from(subcategories)
    .where(eq(subcategories.id, id))
    .limit(1);
  if (!sub) return { error: "Subcategory not found" };

  const ordered = await db
    .select({ id: subcategories.id, position: subcategories.position })
    .from(subcategories)
    .where(eq(subcategories.categoryId, sub.categoryId))
    .orderBy(asc(subcategories.position), asc(subcategories.name));

  const idx = ordered.findIndex((s) => s.id === id);
  if (idx < 0) return { error: "Subcategory not found" };

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= ordered.length) return { success: true };

  const a = ordered[idx];
  const b = ordered[swapIdx];
  await db.update(subcategories).set({ position: b.position }).where(eq(subcategories.id, a.id));
  await db.update(subcategories).set({ position: a.position }).where(eq(subcategories.id, b.id));

  revalidatePath("/admin/categories");
  revalidatePath("/shop");
  return { success: true };
}

// ----------------------------------------------------------------------------
// Reads
// ----------------------------------------------------------------------------

export async function getCategories() {
  return db
    .select()
    .from(categories)
    .orderBy(asc(categories.position), asc(categories.name));
}

export async function getSubcategoriesByCategory(categoryId: string) {
  return db
    .select()
    .from(subcategories)
    .where(eq(subcategories.categoryId, categoryId))
    .orderBy(asc(subcategories.position), asc(subcategories.name));
}

export async function getAllSubcategories() {
  return db
    .select()
    .from(subcategories)
    .orderBy(asc(subcategories.position), asc(subcategories.name));
}

/**
 * Return every category together with its subcategories, each annotated
 * with the count of products currently linked (via subcategory_id, the
 * new FK). Plus a legacy product count for categories (via category_id)
 * so admin can see what hasn't yet been migrated.
 *
 * MariaDB 10.11 has no LATERAL joins — we manually hydrate (CLAUDE.md).
 */
export async function getCategoriesWithSubcategories() {
  const cats = await db
    .select()
    .from(categories)
    .orderBy(asc(categories.position), asc(categories.name));
  if (cats.length === 0) return [];

  const catIds = cats.map((c) => c.id);
  const subs = await db
    .select()
    .from(subcategories)
    .where(inArray(subcategories.categoryId, catIds))
    .orderBy(asc(subcategories.position), asc(subcategories.name));

  // Count products per subcategory (new FK)
  const subCounts = subs.length
    ? await db
        .select({
          subcategoryId: products.subcategoryId,
          n: sql<number>`COUNT(*)`.mapWith(Number),
        })
        .from(products)
        .where(
          inArray(
            products.subcategoryId,
            subs.map((s) => s.id),
          ),
        )
        .groupBy(products.subcategoryId)
    : [];
  const subCountById = new Map(
    subCounts.map((r) => [r.subcategoryId as string, r.n]),
  );

  // Legacy: products that still reference category_id directly (pre-migration
  // state or bulk-import). Helpful diagnostic during transition.
  const legacyCounts = await db
    .select({
      categoryId: products.categoryId,
      n: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(products)
    .where(inArray(products.categoryId, catIds))
    .groupBy(products.categoryId);
  const legacyCountById = new Map(
    legacyCounts.map((r) => [r.categoryId as string, r.n]),
  );

  return cats.map((c) => ({
    ...c,
    legacyProductCount: legacyCountById.get(c.id) ?? 0,
    subcategories: subs
      .filter((s) => s.categoryId === c.id)
      .map((s) => ({
        ...s,
        productCount: subCountById.get(s.id) ?? 0,
      })),
  }));
}

/**
 * Legacy flat list used by existing admin screens — keep so no call site
 * breaks while subcategory migration rolls out. Returns the same shape as
 * the pre-hierarchy helper.
 */
export async function getCategoriesWithCounts() {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      position: categories.position,
      createdAt: categories.createdAt,
      productCount: sql<number>`COUNT(${products.id})`.mapWith(Number),
    })
    .from(categories)
    .leftJoin(products, eq(products.categoryId, categories.id))
    .groupBy(
      categories.id,
      categories.name,
      categories.slug,
      categories.position,
      categories.createdAt,
    )
    .orderBy(asc(categories.position), asc(categories.name));
  return rows;
}

/**
 * Used by the storefront mega-menu + shop filter. Returns every category
 * sorted by position, with its subcategories inline (already sorted).
 * Excludes empty categories? No — admin may want placeholder categories
 * visible even without products yet. Storefront layer decides whether to
 * suppress empties (see site-nav for policy).
 */
export async function getCategoryTree() {
  return getCategoriesWithSubcategories();
}

/**
 * Resolve a subcategory slug to its row + parent, for shop filtering.
 * Returns null if the subcategory slug is ambiguous across categories —
 * callers should then also pass a category slug (handled at route level).
 */
export async function getSubcategoryBySlug(
  subcategorySlug: string,
  categorySlug?: string,
) {
  if (categorySlug) {
    const [cat] = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, categorySlug))
      .limit(1);
    if (!cat) return null;
    const [sub] = await db
      .select()
      .from(subcategories)
      .where(
        and(
          eq(subcategories.categoryId, cat.id),
          eq(subcategories.slug, subcategorySlug),
        ),
      )
      .limit(1);
    return sub ? { subcategory: sub, category: cat } : null;
  }
  // No category scope — pick the first match. Admin-controlled data so
  // ambiguity is rare.
  const [sub] = await db
    .select()
    .from(subcategories)
    .where(eq(subcategories.slug, subcategorySlug))
    .limit(1);
  if (!sub) return null;
  const [cat] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, sub.categoryId))
    .limit(1);
  return cat ? { subcategory: sub, category: cat } : null;
}
