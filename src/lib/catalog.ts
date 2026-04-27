import "server-only";
import { db } from "@/lib/db";
import {
  products,
  productVariants,
  productOptions,
  productOptionValues,
  categories,
  subcategories,
  colors,
} from "@/lib/db/schema";
import { and, asc, eq, desc, inArray, isNotNull, or } from "drizzle-orm";
import {
  composeVariantLabel,
  type HydratedProductVariants,
  type HydratedOption,
  type HydratedVariant,
} from "@/lib/variants";
import { buildColourSlugMap } from "@/lib/colours";
import { ensureTiers, ensureImagesV2, type ImageEntryV2 } from "@/lib/config-fields";

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
 * Delegates to ensureImagesV2 for forwards-compat with the new object shape.
 */
function ensureImagesArray(raw: unknown): string[] {
  return ensureImagesV2(raw).map((e) => e.url);
}

type ProductRow = typeof products.$inferSelect;
type VariantRow = typeof productVariants.$inferSelect;
type CategoryRow = typeof categories.$inferSelect;
type SubcategoryRow = typeof subcategories.$inferSelect;

export type CatalogVariant = VariantRow;

export type CatalogProduct = Omit<ProductRow, "images" | "productType" | "priceTiers"> & {
  images: string[];
  /** Phase 19 (19-10) — image entries with caption/alt; backwards-compat with legacy string[] */
  imagesV2: ImageEntryV2[];
  variants: CatalogVariant[];
  category: CategoryRow | null;
  subcategory: SubcategoryRow | null;
  // Phase 16 — generic options/variants (additive; existing callers unaffected)
  hydratedVariants: HydratedVariant[];
  options: HydratedOption[];
  // Phase 19 (19-07) — made-to-order fields (parsed; stocked products get defaults)
  productType: "stocked" | "configurable";
  priceTiers: Record<string, number> | null;
  maxUnitCount: number | null;
};

/**
 * Category tree node consumed by the storefront nav + shop sidebar. Keeps
 * only the fields the UI actually renders, so we don't leak admin-only
 * columns (position is kept so the storefront matches admin ordering).
 */
export type CategoryTreeNode = {
  id: string;
  name: string;
  slug: string;
  position: number;
  subcategories: {
    id: string;
    name: string;
    slug: string;
    position: number;
  }[];
};

/**
 * Resolve the storefront card image for a product. Honours the admin's
 * thumbnailIndex selection, but falls back to the first image when the
 * configured slot is missing (image was deleted after the picker saved).
 */
export function pickThumbnail(p: {
  images: string[];
  thumbnailIndex?: number | null;
}): string | undefined {
  const idx = typeof p.thumbnailIndex === "number" ? p.thumbnailIndex : 0;
  if (p.images.length === 0) return undefined;
  if (idx >= 0 && idx < p.images.length) return p.images[idx];
  return p.images[0];
}

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

  const subcategoryIds = Array.from(
    new Set(rows.map((p) => p.subcategoryId).filter((v): v is string => !!v)),
  );
  const subcategoryRows =
    subcategoryIds.length > 0
      ? await db
          .select()
          .from(subcategories)
          .where(inArray(subcategories.id, subcategoryIds))
      : [];

  // Phase 16 — batch fetch product_options + product_option_values for all products
  // Single query per table (no N+1), joined in memory.
  const optionRows = await db
    .select()
    .from(productOptions)
    .where(inArray(productOptions.productId, ids))
    .orderBy(productOptions.position);

  const optionIds = optionRows.map((o) => o.id);
  const valueRows =
    optionIds.length > 0
      ? await db
          .select()
          .from(productOptionValues)
          .where(inArray(productOptionValues.optionId, optionIds))
          .orderBy(productOptionValues.position)
      : [];

  // Build lookup maps
  const variantByProduct = new Map<string, VariantRow[]>();
  for (const v of variantRows) {
    const bucket = variantByProduct.get(v.productId) ?? [];
    bucket.push(v);
    variantByProduct.set(v.productId, bucket);
  }
  const categoryById = new Map(categoryRows.map((c) => [c.id, c]));
  const subcategoryById = new Map(subcategoryRows.map((s) => [s.id, s]));

  // Phase 16 — option/value maps keyed by productId and optionId
  const optionsByProduct = new Map<string, typeof optionRows>();
  for (const o of optionRows) {
    const bucket = optionsByProduct.get(o.productId) ?? [];
    bucket.push(o);
    optionsByProduct.set(o.productId, bucket);
  }
  const valuesByOption = new Map<string, typeof valueRows>();
  for (const v of valueRows) {
    const bucket = valuesByOption.get(v.optionId) ?? [];
    bucket.push(v);
    valuesByOption.set(v.optionId, bucket);
  }
  const valueById = new Map(valueRows.map((v) => [v.id, v]));

  return rows.map((p) => {
    const rawVariants = variantByProduct.get(p.id) ?? [];
    const pOptions = optionsByProduct.get(p.id) ?? [];

    // Build HydratedOption[]
    const hydratedOptions: HydratedOption[] = pOptions.map((o) => ({
      id: o.id,
      name: o.name,
      position: o.position,
      values: (valuesByOption.get(o.id) ?? []).map((v) => ({
        id: v.id,
        value: v.value,
        position: v.position,
        swatchHex: v.swatchHex ?? null,
        colorId: v.colorId ?? null,
      })),
    }));

    // Build HydratedVariant[]
    const now = new Date();
    const hydratedVariants: HydratedVariant[] = rawVariants.map((v) => {
      const labelParts: string[] = [];
      for (const vid of [v.option1ValueId, v.option2ValueId, v.option3ValueId, v.option4ValueId, v.option5ValueId, v.option6ValueId]) {
        if (vid) {
          const val = valueById.get(vid);
          if (val) labelParts.push(val.value);
        }
      }
      const isOnSale =
        v.salePrice !== null &&
        (v.saleFrom === null || v.saleFrom.getTime() <= now.getTime()) &&
        (v.saleTo === null || v.saleTo.getTime() >= now.getTime());
      const effectivePrice = isOnSale ? (v.salePrice as string) : v.price;
      return {
        id: v.id,
        price: v.price,
        stock: v.stock ?? 0,
        inStock: v.inStock ?? true,
        trackStock: v.trackStock ?? false,
        sku: v.sku ?? null,
        imageUrl: v.imageUrl ?? null,
        label: labelParts.length > 0 ? composeVariantLabel(labelParts) : (v.labelCache ?? ""),
        position: v.position ?? 0,
        optionValueIds: [
          v.option1ValueId ?? null,
          v.option2ValueId ?? null,
          v.option3ValueId ?? null,
          v.option4ValueId ?? null,
          v.option5ValueId ?? null,
          v.option6ValueId ?? null,
        ] as [string | null, string | null, string | null, string | null, string | null, string | null],
        costPrice: v.costPrice ?? null,
        filamentGrams: v.filamentGrams ?? null,
        printTimeHours: v.printTimeHours ?? null,
        laborMinutes: v.laborMinutes ?? null,
        otherCost: v.otherCost ?? null,
        filamentRateOverride: v.filamentRateOverride ?? null,
        laborRateOverride: v.laborRateOverride ?? null,
        costPriceManual: v.costPriceManual ?? false,
        salePrice: v.salePrice ?? null,
        saleFrom: v.saleFrom ?? null,
        saleTo: v.saleTo ?? null,
        isDefault: v.isDefault ?? false,
        effectivePrice,
        isOnSale,
        weightG: v.weightG ?? null,
        allowPreorder: v.allowPreorder ?? false,
      };
    });

    return {
      ...p,
      images: ensureImagesArray(p.images),
      imagesV2: ensureImagesV2(p.images),
      variants: rawVariants,
      hydratedVariants,
      options: hydratedOptions,
      category: p.categoryId ? categoryById.get(p.categoryId) ?? null : null,
      subcategory: p.subcategoryId
        ? subcategoryById.get(p.subcategoryId) ?? null
        : null,
      // Phase 19 (19-07) — made-to-order fields
      productType: (p.productType ?? "stocked") as "stocked" | "configurable",
      priceTiers: p.productType === "configurable" ? ensureTiers(p.priceTiers) : null,
      maxUnitCount: p.maxUnitCount ?? null,
    };
  });
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
  return db
    .select()
    .from(categories)
    .orderBy(asc(categories.position), asc(categories.name));
}

/**
 * Phase 8 (08-01) — hierarchical tree for the nav mega-menu and the shop
 * filter sidebar. Empty categories (zero subcategories) are kept so admins
 * can pre-create placeholder categories; the consuming UI chooses whether
 * to hide them.
 */
export async function getActiveCategoryTree(): Promise<CategoryTreeNode[]> {
  const cats = await db
    .select()
    .from(categories)
    .orderBy(asc(categories.position), asc(categories.name));
  if (cats.length === 0) return [];

  const subs = await db
    .select()
    .from(subcategories)
    .where(
      inArray(
        subcategories.categoryId,
        cats.map((c) => c.id),
      ),
    )
    .orderBy(asc(subcategories.position), asc(subcategories.name));

  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    position: c.position,
    subcategories: subs
      .filter((s) => s.categoryId === c.id)
      .map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        position: s.position,
      })),
  }));
}

export async function getActiveProductsByCategorySlug(
  categorySlug: string,
): Promise<{ category: CategoryRow | null; products: CatalogProduct[] }> {
  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.slug, categorySlug))
    .limit(1);
  if (!category) return { category: null, products: [] };

  // Phase 8 transition — a product is in a category if EITHER the legacy
  // products.category_id matches OR products.subcategory_id belongs to a
  // subcategory whose parent is this category. We pull the subcategory IDs
  // in a small pre-query to keep the main WHERE simple.
  const subRows = await db
    .select({ id: subcategories.id })
    .from(subcategories)
    .where(eq(subcategories.categoryId, category.id));
  const subIds = subRows.map((s) => s.id);

  const predicate =
    subIds.length > 0
      ? or(
          eq(products.categoryId, category.id),
          inArray(products.subcategoryId, subIds),
        )
      : eq(products.categoryId, category.id);

  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), predicate))
    .orderBy(desc(products.createdAt));

  return { category, products: await hydrateProducts(rows) };
}

/**
 * Filter by subcategory slug. Optional categorySlug narrows disambiguation
 * when the same subcategory slug exists under multiple parents (e.g. every
 * category has a "general"). Returns both the resolved subcategory and its
 * parent so the page can render a breadcrumb.
 */
export async function getActiveProductsBySubcategorySlug(
  subcategorySlug: string,
  categorySlug?: string,
): Promise<{
  category: CategoryRow | null;
  subcategory: SubcategoryRow | null;
  products: CatalogProduct[];
}> {
  let parentCat: CategoryRow | null = null;
  if (categorySlug) {
    const [c] = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, categorySlug))
      .limit(1);
    if (!c) return { category: null, subcategory: null, products: [] };
    parentCat = c;
  }

  const [sub] = parentCat
    ? await db
        .select()
        .from(subcategories)
        .where(
          and(
            eq(subcategories.categoryId, parentCat.id),
            eq(subcategories.slug, subcategorySlug),
          ),
        )
        .limit(1)
    : await db
        .select()
        .from(subcategories)
        .where(eq(subcategories.slug, subcategorySlug))
        .limit(1);

  if (!sub) return { category: parentCat, subcategory: null, products: [] };

  if (!parentCat) {
    const [c] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, sub.categoryId))
      .limit(1);
    parentCat = c ?? null;
  }

  const rows = await db
    .select()
    .from(products)
    .where(
      and(eq(products.isActive, true), eq(products.subcategoryId, sub.id)),
    )
    .orderBy(desc(products.createdAt));

  return {
    category: parentCat,
    subcategory: sub,
    products: await hydrateProducts(rows),
  };
}

// ===========================================================================
// Phase 18 — /shop colour filter (D-13, D-15, D-16)
// ---------------------------------------------------------------------------
// Manual hydration (NO LATERAL — MariaDB 10.11). Customer-facing surface —
// strips code/previous_hex/family_*; only id/name/hex/slug ever leave the
// server boundary.
// ===========================================================================

export type ShopColourChip = { slug: string; name: string; hex: string };

/**
 * Returns the de-duplicated list of colours currently in use by ≥1 active
 * product (variant in_stock = 1, parent product is_active = 1). Used to
 * render the /shop sidebar Colour accordion (D-13).
 *
 * 4-step manual hydration:
 *   1. Fetch all active colours (small table — ≤ ~150 rows).
 *   2. Fetch all pov rows with non-null colorId (build pov.id → color.id map).
 *   3. For each of the 6 variant slot columns, find variants whose slot
 *      references one of those pov ids AND whose parent product is active +
 *      variant is in stock. Collect distinct color ids actually in use.
 *   4. Filter the colour list to those used ids; build collision-aware slug
 *      map; project to {slug, name, hex} sorted alphabetically.
 */
export async function getActiveProductColourChips(): Promise<ShopColourChip[]> {
  // Step 1 — all active colours
  const allColours = await db
    .select({
      id: colors.id,
      name: colors.name,
      hex: colors.hex,
      brand: colors.brand,
    })
    .from(colors)
    .where(eq(colors.isActive, true));
  if (allColours.length === 0) return [];

  // Step 2 — pov rows with non-null colorId
  const povRows = await db
    .select({
      id: productOptionValues.id,
      colorId: productOptionValues.colorId,
    })
    .from(productOptionValues)
    .where(isNotNull(productOptionValues.colorId));
  if (povRows.length === 0) return [];
  const povIds = povRows.map((r) => r.id);
  const colourIdByPov = new Map<string, string>();
  for (const r of povRows) {
    if (r.colorId) colourIdByPov.set(r.id, r.colorId);
  }

  // Step 3 — variants referencing any pov in any of 6 slots, in stock,
  // on active product. Six parallel queries — manual hydration (no LATERAL).
  const slotCols = [
    productVariants.option1ValueId,
    productVariants.option2ValueId,
    productVariants.option3ValueId,
    productVariants.option4ValueId,
    productVariants.option5ValueId,
    productVariants.option6ValueId,
  ];
  const liveSets = await Promise.all(
    slotCols.map((col) =>
      db
        .select({ povId: col, productId: productVariants.productId })
        .from(productVariants)
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(
          and(
            inArray(col, povIds),
            eq(products.isActive, true),
            eq(productVariants.inStock, true),
          ),
        ),
    ),
  );
  const usedColourIds = new Set<string>();
  for (const set of liveSets) {
    for (const row of set) {
      const cid = colourIdByPov.get(row.povId as string);
      if (cid) usedColourIds.add(cid);
    }
  }
  if (usedColourIds.size === 0) return [];

  // Step 4 — project to chip shape with collision-aware slugs (D-14)
  const usedColours = allColours.filter((c) => usedColourIds.has(c.id));
  if (usedColours.length === 0) return [];
  const slugMap = buildColourSlugMap(usedColours);
  return usedColours
    .map((c) => ({ slug: slugMap.get(c.id)!, name: c.name, hex: c.hex }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve a list of colour slugs to a Set<productId> that have ≥1 active
 * in-stock variant matching one of the colours. Used by /shop to intersect
 * the colour filter with the existing category/subcategory filter.
 *
 * Empty input → empty set (callers should bypass when slugs.length === 0).
 *
 * Manual hydration (NO LATERAL).
 */
export async function getProductIdsByColourSlugs(
  slugs: string[],
): Promise<Set<string>> {
  if (slugs.length === 0) return new Set();

  // Step 1 — all active colours (slug map is built collision-aware)
  const allColours = await db
    .select({ id: colors.id, name: colors.name, brand: colors.brand })
    .from(colors)
    .where(eq(colors.isActive, true));
  if (allColours.length === 0) return new Set();

  // Step 2 — match given slugs to colour ids via the same slug map
  const slugMap = buildColourSlugMap(allColours);
  const slugSet = new Set(slugs);
  const matchedColourIds: string[] = [];
  for (const c of allColours) {
    const s = slugMap.get(c.id);
    if (s && slugSet.has(s)) matchedColourIds.push(c.id);
  }
  if (matchedColourIds.length === 0) return new Set();

  // Step 3 — pov rows whose colorId is in the matched set
  const povRows = await db
    .select({ id: productOptionValues.id })
    .from(productOptionValues)
    .where(inArray(productOptionValues.colorId, matchedColourIds));
  if (povRows.length === 0) return new Set();
  const povIds = povRows.map((r) => r.id);

  // Step 4 — variants referencing any pov in any slot, in stock, on active product
  const slotCols = [
    productVariants.option1ValueId,
    productVariants.option2ValueId,
    productVariants.option3ValueId,
    productVariants.option4ValueId,
    productVariants.option5ValueId,
    productVariants.option6ValueId,
  ];
  const hits = await Promise.all(
    slotCols.map((col) =>
      db
        .select({ productId: productVariants.productId })
        .from(productVariants)
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(
          and(
            inArray(col, povIds),
            eq(products.isActive, true),
            eq(productVariants.inStock, true),
          ),
        ),
    ),
  );
  const productIdSet = new Set<string>();
  for (const set of hits) for (const h of set) productIdSet.add(h.productId);
  return productIdSet;
}
