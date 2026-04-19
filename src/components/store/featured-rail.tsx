import type { CatalogProduct } from "@/lib/catalog";
import { ProductCard } from "@/components/store/product-card";
import { BRAND } from "@/lib/brand";
import { Wave } from "@/components/brand/wave";

/**
 * Homepage featured rail. Accepts `products` from the page — does no DB
 * work itself. Renders a 2/3/4 responsive grid (D2-06) on a blue band
 * flanked by matched-color wave dividers.
 */
export function FeaturedRail({ products }: { products: CatalogProduct[] }) {
  if (!products.length) return null;
  return (
    <section className="relative">
      <Wave color={BRAND.blue} />
      <div className="py-16 md:py-24" style={{ backgroundColor: BRAND.blue }}>
        <div className="max-w-6xl mx-auto px-6">
          <h2
            className="font-[var(--font-heading)] text-4xl md:text-6xl text-center mb-4"
            style={{ color: BRAND.cream }}
          >
            FEATURED DROPS
          </h2>
          <p className="text-center mb-12 text-lg text-white/80">
            Fresh off the printer. Limited runs, ninja fast delivery.
          </p>
          {/* 320px phones (iPhone SE landscape, older Androids) can't fit
              two cards side-by-side when a product has a full price range
              label like "RM 28.00 - RM 52.00" (~143px) — the shrink-0 badge
              would escape its card. Below 360px we fall back to a single
              column; at 360+ (iPhone SE portrait and up) the 2-col grid
              still works because min-w-0 on the card title lets it truncate. */}
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map((p, i) => (
              <ProductCard key={p.id} product={p} accentIndex={i} />
            ))}
          </div>
        </div>
      </div>
      <Wave color={BRAND.blue} flip />
    </section>
  );
}
