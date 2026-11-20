import type { CatalogProduct } from "@/lib/catalog";
import { ProductCard } from "@/components/store/product-card";
import { BRAND } from "@/lib/brand";
import { getWishlistedProductIds } from "@/actions/wishlist";

/**
 * Homepage featured rail. Lightened (2026-04-20) — white background with a
 * blue accent rule under the heading instead of a full blue flood fill. The
 * vivid accent still lives on the product-card badges and CTA, not on the
 * section canvas.
 *
 * Phase 6 06-04 — server-side batch fetch of wishlist state for the
 * visible products so heart overlays render with correct initial state.
 */
export async function FeaturedRail({ products }: { products: CatalogProduct[] }) {
  if (!products.length) return null;
  const wishedIds = await getWishlistedProductIds(products.map((p) => p.id));
  return (
    <section
      className="py-16 md:py-24 border-t border-zinc-100"
      style={{ backgroundColor: "#FAFAFA" }}
    >
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col items-center mb-10">
          <span
            className="h-1 w-16 rounded-full mb-4"
            style={{ backgroundColor: BRAND.blue }}
            aria-hidden
          />
          <h2
            className="font-[var(--font-heading)] text-4xl md:text-6xl text-center mb-3 text-zinc-900"
          >
            FEATURED DROPS
          </h2>
          <p className="text-center text-lg text-zinc-600">
            Fresh off the printer. Limited runs, ninja fast delivery.
          </p>
        </div>
        {/* 320px phones (iPhone SE landscape, older Androids) can't fit
            two cards side-by-side when a product has a full price range
            label like "RM 28.00 - RM 52.00" (~143px) — the shrink-0 badge
            would escape its card. Below 360px we fall back to a single
            column; at 360+ (iPhone SE portrait and up) the 2-col grid
            still works because min-w-0 on the card title lets it truncate. */}
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
      </div>
    </section>
  );
}
