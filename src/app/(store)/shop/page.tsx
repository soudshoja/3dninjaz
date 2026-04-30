import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Shuriken } from "@/components/brand/shuriken";
import { BRAND } from "@/lib/brand";
import { ProductCard } from "@/components/store/product-card";
import {
  getActiveProducts,
  getActiveProductsByCategorySlug,
  getActiveProductsBySubcategorySlug,
  getActiveCategoryTree,
  getActiveProductColourChips,
  getProductIdsByColourSlugs,
  type CatalogProduct,
  type CategoryTreeNode,
} from "@/lib/catalog";
import { getWishlistedProductIds } from "@/actions/wishlist";
// Temporarily disabled: import { ColourFilterSection } from "@/components/store/colour-filter-section";

export const metadata: Metadata = { title: "Shop" };

type SearchParams = Promise<{
  category?: string;
  subcategory?: string;
  // Phase 18 (18-08) — comma-separated colour slugs (D-13 URL grammar)
  colour?: string;
}>;

/**
 * Phase 8 (08-01) — storefront shop with 2-level filtering.
 *
 * Query params:
 *   ?category=<slug>                       — all products in that category
 *                                            (aggregates every subcategory)
 *   ?category=<slug>&subcategory=<slug>    — narrow to one subcategory
 *   (no params)                            — all active products
 *
 * The filter sidebar on the left mirrors the nav mega-menu — it's the same
 * tree, collapsed, with the active node highlighted.
 */
export default async function ShopPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { category, subcategory, colour } = await searchParams;
  const colourSlugs = colour ? colour.split(",").filter(Boolean) : [];

  const [tree, colourChips, result] = await Promise.all([
    getActiveCategoryTree(),
    getActiveProductColourChips(),
    resolveProducts(category, subcategory, colourSlugs),
  ]);

  if (result === "not_found") notFound();

  const { products, headline, breadcrumb } = result;

  const wishedIds = await getWishlistedProductIds(products.map((p) => p.id));

  return (
    <div className="pb-24 bg-white">
      <section className="pt-10 md:pt-16 pb-6 border-b border-zinc-100 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-3 mb-4 min-w-0">
            <Shuriken className="w-6 h-6 md:w-7 md:h-7 shrink-0" fill={BRAND.purple} />
            <h1
              className="font-[var(--font-heading)] text-2xl sm:text-4xl md:text-6xl tracking-tight text-zinc-900 min-w-0"
            >
              {headline.toUpperCase()}
            </h1>
          </div>
          {breadcrumb ? (
            <nav
              aria-label="Breadcrumb"
              className="text-sm text-zinc-500 mb-2 flex items-center flex-wrap gap-1"
            >
              {breadcrumb.map((crumb, i) => (
                <span key={`${crumb.href ?? "cur"}-${i}`} className="flex items-center gap-1">
                  {i > 0 ? <ChevronRight className="h-3 w-3 opacity-60" aria-hidden /> : null}
                  {crumb.href ? (
                    <Link href={crumb.href} className="hover:underline">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="font-semibold text-zinc-900">
                      {crumb.label}
                    </span>
                  )}
                </span>
              ))}
            </nav>
          ) : null}
          <p className="text-base text-zinc-500">
            {products.length} {products.length === 1 ? "product" : "products"}
          </p>
        </div>
      </section>

      {/* Mobile-only horizontal category chip strip */}
      {tree.length > 0 ? (
        <nav
          aria-label="Filter by category"
          className="md:hidden max-w-6xl mx-auto mt-4 overflow-x-clip"
        >
          <ul className="flex gap-2 overflow-x-auto pb-2 px-6">
            <li className="shrink-0">
              <Link
                href="/shop"
                className="inline-flex items-center min-h-[44px] px-4 rounded-full border-2 text-sm font-bold whitespace-nowrap"
                style={{
                  backgroundColor: !category && !subcategory ? BRAND.ink : "transparent",
                  color: !category && !subcategory ? "#ffffff" : BRAND.ink,
                  borderColor: BRAND.ink,
                }}
              >
                All drops
              </Link>
            </li>
            {tree.map((c) => {
              const isActive = category === c.slug;
              return (
                <li key={c.id} className="shrink-0">
                  <Link
                    href={`/shop?category=${encodeURIComponent(c.slug)}`}
                    className="inline-flex items-center min-h-[44px] px-4 rounded-full border-2 text-sm font-bold whitespace-nowrap"
                    style={{
                      backgroundColor: isActive ? BRAND.ink : "transparent",
                      color: isActive ? "#ffffff" : BRAND.ink,
                      borderColor: BRAND.ink,
                    }}
                  >
                    {c.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      {/* Colour filter temporarily hidden — re-enable when filter UX is finalized */}
      {/* <div className="md:hidden max-w-6xl mx-auto px-6 mt-3">
        <ColourFilterSection chips={colourChips} />
      </div> */}

      <section className="max-w-6xl mx-auto px-6 mt-6 grid gap-8 md:grid-cols-[240px_1fr]">
        <aside className="hidden md:block">
          <ShopSidebar
            tree={tree}
            activeCategory={category ?? null}
            activeSubcategory={subcategory ?? null}
          />
          {/* <ColourFilterSection chips={colourChips} /> */}
        </aside>

        <div>
          {products.length === 0 ? (
            <div className="text-center py-20">
              <Image
                src="/icons/ninja/nav/faq@128.png"
                alt=""
                width={96}
                height={96}
                className="mx-auto h-24 w-24 object-contain mb-4"
              />
              <p className="text-xl font-bold mb-2" style={{ color: BRAND.ink }}>
                {category || subcategory
                  ? "No drops in this squad yet."
                  : "No drops yet. Check back soon."}
              </p>
              <p className="text-slate-600">The ninjas are still printing.</p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
              {products.map((p, i) => (
                <li key={p.id}>
                  <ProductCard
                    product={p}
                    accentIndex={i}
                    isWishlisted={wishedIds.has(p.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

type Breadcrumb = { label: string; href?: string };

type ResolvedView = {
  products: CatalogProduct[];
  headline: string;
  breadcrumb: Breadcrumb[] | null;
};

async function resolveProducts(
  categorySlug: string | undefined,
  subcategorySlug: string | undefined,
  colourSlugs: string[],
): Promise<ResolvedView | "not_found"> {
  let base: ResolvedView | "not_found";
  if (subcategorySlug) {
    // Prefer scoping by category when both are supplied to avoid
    // ambiguity across parents.
    const out = await getActiveProductsBySubcategorySlug(
      subcategorySlug,
      categorySlug,
    );
    if (!out.subcategory) return "not_found";
    base = {
      products: out.products,
      headline: out.subcategory.name,
      breadcrumb: [
        { label: "Shop", href: "/shop" },
        out.category
          ? {
              label: out.category.name,
              href: `/shop?category=${encodeURIComponent(out.category.slug)}`,
            }
          : { label: "Uncategorized" },
        { label: out.subcategory.name },
      ],
    };
  } else if (categorySlug) {
    const out = await getActiveProductsByCategorySlug(categorySlug);
    if (!out.category) return "not_found";
    base = {
      products: out.products,
      headline: out.category.name,
      breadcrumb: [
        { label: "Shop", href: "/shop" },
        { label: out.category.name },
      ],
    };
  } else {
    const all = await getActiveProducts();
    base = {
      products: all,
      headline: "All Drops",
      breadcrumb: null,
    };
  }

  // Phase 18 (18-08) — intersect with colour filter when present.
  // No colour filter: return base as-is.
  if (colourSlugs.length === 0) return base;

  const allowedIds = await getProductIdsByColourSlugs(colourSlugs);
  if (allowedIds.size === 0) {
    return { ...base, products: [] };
  }
  return {
    ...base,
    products: base.products.filter((p) => allowedIds.has(p.id)),
  };
}

function ShopSidebar({
  tree,
  activeCategory,
  activeSubcategory,
}: {
  tree: CategoryTreeNode[];
  activeCategory: string | null;
  activeSubcategory: string | null;
}) {
  if (tree.length === 0) return null;
  return (
    <nav aria-label="Filter by category" className="text-sm">
      <div
        className="font-[var(--font-heading)] text-sm mb-3"
        style={{ color: BRAND.ink }}
      >
        FILTER
      </div>
      <ul className="space-y-3">
        <li>
          <Link
            href="/shop"
            className={
              "block font-semibold hover:opacity-70 " +
              (!activeCategory && !activeSubcategory ? "underline" : "")
            }
            style={{ color: BRAND.ink }}
          >
            All drops
          </Link>
        </li>
        {tree.map((c) => {
          const isCatActive =
            activeCategory === c.slug && !activeSubcategory;
          const isCatExpanded = activeCategory === c.slug;
          return (
            <li key={c.id}>
              <Link
                href={`/shop?category=${encodeURIComponent(c.slug)}`}
                className={
                  "block font-semibold hover:opacity-70 " +
                  (isCatActive ? "underline" : "")
                }
                style={{ color: BRAND.ink }}
              >
                {c.name}
              </Link>
              {isCatExpanded && c.subcategories.length > 0 ? (
                <ul className="mt-1 ml-3 space-y-1 border-l-2 pl-3" style={{ borderColor: "#0B102015" }}>
                  {c.subcategories.map((s) => {
                    const isSubActive = activeSubcategory === s.slug;
                    return (
                      <li key={s.id}>
                        <Link
                          href={`/shop?category=${encodeURIComponent(c.slug)}&subcategory=${encodeURIComponent(s.slug)}`}
                          className={
                            "block text-sm text-slate-600 hover:text-[color:var(--brand-ink,#0B1020)] " +
                            (isSubActive ? "font-semibold underline" : "")
                          }
                        >
                          {s.name}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
