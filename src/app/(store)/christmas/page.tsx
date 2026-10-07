import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { ChristmasHero } from "@/components/store/christmas/christmas-hero";
import { ProductCard } from "@/components/store/product-card";
import { getActiveProductsByCategorySlug } from "@/lib/catalog";
import { getWishlistedProductIds } from "@/actions/wishlist";
import { CHRISTMAS_CATEGORY_SLUG } from "@/lib/seasonal";

export const metadata: Metadata = {
  title: "Christmas",
  description:
    "Christmas gifts 3D printed to order in Kuala Lumpur and shipped across Malaysia.",
};

// The grid is driven by the admin-managed "christmas" category.
export const dynamic = "force-dynamic";

export default async function ChristmasPage() {
  const { products } = await getActiveProductsByCategorySlug(
    CHRISTMAS_CATEGORY_SLUG,
  );
  const wishedIds = await getWishlistedProductIds(products.map((p) => p.id));

  return (
    <>
      <ChristmasHero />

      <section
        id="christmas-gifts"
        className="scroll-mt-24 py-16 md:py-24 border-t border-zinc-100"
        style={{ backgroundColor: "#FAFAFA" }}
        aria-labelledby="christmas-gifts-heading"
      >
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col items-center mb-10">
            <span
              className="h-1 w-16 rounded-full mb-4"
              style={{ backgroundColor: BRAND.green }}
              aria-hidden
            />
            <h2
              id="christmas-gifts-heading"
              className="font-[var(--font-heading)] text-4xl md:text-6xl text-center mb-3 text-zinc-900"
            >
              CHRISTMAS GIFTS
            </h2>
            <p className="text-center text-lg text-zinc-600">
              Printed when you order. Ninja fast delivery.
            </p>
          </div>

          {products.length > 0 ? (
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {products.map((p, i) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  accentIndex={i}
                  isWishlisted={wishedIds.has(p.id)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center max-w-md mx-auto">
              <p className="text-lg text-zinc-600">
                Our Christmas gifts are still printing. Browse the full shop in
                the meantime.
              </p>
              <Link
                href="/shop"
                className="mt-6 rounded-full px-8 py-4 font-bold text-lg border-2 hover:bg-white transition min-h-[60px] inline-flex items-center"
                style={{ borderColor: BRAND.blue, color: BRAND.blue }}
              >
                Go to the shop
              </Link>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
