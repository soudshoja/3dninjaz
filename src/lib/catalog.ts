import "server-only";
import { db } from "@/lib/db";
import { products, productVariants, categories } from "@/lib/db/schema";
import { and, eq, desc, inArray } from "drizzle-orm";

// ============================================================================
// MariaDB 10.11 note — Drizzle's relational `db.query.products.findMany({ with })`
// compiles to LATERAL joins, which MariaDB < 10.12 does not support. We use
// manual multi-query hydration here, matching src/actions/products.ts.
//
// D2-08 — every helper filters isActive = true. Inactive products must never
// surface on customer-facing pages, regardless of access path.
// ============================================================================

/**
 * MariaDB stores JSON as LONGTEXT; mysql2 returns raw strings. Normalise
 * images back to string[] at the read path so callers don't have to care.
 */
function ensureImagesArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === "string");
  if (typeof raw === "string") {
    if (raw.trim() === "") return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === "string");
      }
    } catch {
      return [];
    }
  }
  return [];
}

type ProductRow = typeof products.$inferSelect;
type VariantRow = typeof productVariants.$inferSelect;
type CategoryRow = typeof categories.$inferSelect;

export type CatalogVariant = VariantRow;

export type CatalogProduct = Omit<ProductRow, "images"> & {
  images: string[];
  variants: CatalogVariant[];
  category: CategoryRow | null;
};

async function hydrateProducts(rows: ProductRow[]): Promise<CatalogProduct[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((p) => p.id);
  const variantRows = await db
    .select()
    .from(productVariants)
    .where(inArray(productVariants.productId, ids));

  const categoryIds = Array.from(
    new Set(rows.map((p) => p.categoryId).filter((v): v is string => !!v))
  );
  const categoryRows =
    categoryIds.length > 0
      ? await db
          .select()
          .from(categories)
          .where(inArray(categories.id, categoryIds))
      : [];

  const variantByProduct = new Map<string, VariantRow[]>();
  for (const v of variantRows) {
    const bucket = variantByProduct.get(v.productId) ?? [];
    bucket.push(v);
    variantByProduct.set(v.productId, bucket);
  }
  const categoryById = new Map(categoryRows.map((c) => [c.id, c]));

  return rows.map((p) => ({
    ...p,
    images: ensureImagesArray(p.images),
    variants: variantByProduct.get(p.id) ?? [],
    category: p.categoryId ? categoryById.get(p.categoryId) ?? null : null,
  }));
}

export async function getActiveProducts(): Promise<CatalogProduct[]> {
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.isActive, true))
    .orderBy(desc(products.createdAt));
  return hydrateProducts(rows);
}

export async function getActiveFeaturedProducts(
  limit = 4
): Promise<CatalogProduct[]> {
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), eq(products.isFeatured, true)))
    .orderBy(desc(products.createdAt))
    .limit(limit);
  return hydrateProducts(rows);
}

export async function getActiveProductBySlug(
  slug: string
): Promise<CatalogProduct | null> {
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.isActive, true)))
    .limit(1);
  if (!row) return null;
  const [hydrated] = await hydrateProducts([row]);
  return hydrated ?? null;
}

export async function getActiveCategories(): Promise<CategoryRow[]> {
  return db.select().from(categories).orderBy(categories.name);
}

export async function getActiveProductsByCategorySlug(
  categorySlug: string
): Promise<{ category: CategoryRow | null; products: CatalogProduct[] }> {
  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.slug, categorySlug))
    .limit(1);
  if (!category) return { category: null, products: [] };

  const rows = await db
    .select()
    .from(products)
    .where(
      and(eq(products.isActive, true), eq(products.categoryId, category.id))
    )
    .orderBy(desc(products.createdAt));

  return { category, products: await hydrateProducts(rows) };
}
