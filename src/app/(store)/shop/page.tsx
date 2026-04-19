import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Shuriken } from "@/components/brand/shuriken";
import { BRAND } from "@/lib/brand";
import { CategoryChips } from "@/components/store/category-chips";
import { ProductCard } from "@/components/store/product-card";
import {
  getActiveProducts,
  getActiveCategories,
  getActiveProductsByCategorySlug,
  type CatalogProduct,
} from "@/lib/catalog";

export const metadata: Metadata = { title: "Shop" };

type SearchParams = Promise<{ category?: string }>;

export default async function ShopPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { category } = await searchParams;

  const [categories, filteredResult, allProducts] = await Promise.all([
    getActiveCategories(),
    category
      ? getActiveProductsByCategorySlug(category)
      : Promise.resolve({ category: null, products: null as CatalogProduct[] | null }),
    category ? Promise.resolve(null) : getActiveProducts(),
  ]);

  let products: CatalogProduct[];
  let activeCategoryName: string | null = null;
  if (category) {
    if (!filteredResult.category) notFound();
    products = filteredResult.products ?? [];
    activeCategoryName = filteredResult.category.name;
  } else {
    products = allProducts ?? [];
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <section className="pt-10 md:pt-16 pb-8" style={{ backgroundColor: BRAND.cream }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-3 mb-4">
            <Shuriken className="w-7 h-7" fill={BRAND.purple} />
            <h1
              className="font-[var(--font-heading)] text-4xl md:text-6xl tracking-tight"
              style={{ color: BRAND.ink }}
            >
              {activeCategoryName ? activeCategoryName.toUpperCase() : "ALL DROPS"}
            </h1>
          </div>
          <p className="text-base text-slate-600 mb-8">
            {products.length} {products.length === 1 ? "product" : "products"}
          </p>
          <CategoryChips categories={categories} />
        </div>
      </section>

      {/* Grid */}
      <section className="max-w-6xl mx-auto px-6">
        {products.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-xl font-bold mb-2" style={{ color: BRAND.ink }}>
              {category ? "No drops in this squad yet." : "No drops yet. Check back soon."}
            </p>
            <p className="text-slate-600">The ninjas are still printing.</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 min-[360px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 md:gap-6">
            {products.map((p, i) => (
              <li key={p.id}>
                <ProductCard product={p} accentIndex={i} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
