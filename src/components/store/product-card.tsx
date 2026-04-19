import Link from "next/link";
import Image from "next/image";
import { BRAND } from "@/lib/brand";
import { priceRangeMYR } from "@/lib/format";
import type { CatalogProduct } from "@/lib/catalog";

/**
 * Single product card. Used by the homepage featured rail, /shop grid,
 * and category-filtered views (D2-07). The whole card is a link, with
 * an aria-label that combines name + price for screen readers.
 *
 * Accent cycles through blue/green/purple based on `accentIndex` so grid
 * rows feel lively without per-product configuration.
 */
const ACCENTS = [BRAND.blue, BRAND.green, BRAND.purple] as const;

export function ProductCard({
  product,
  accentIndex = 0,
}: {
  product: CatalogProduct;
  accentIndex?: number;
}) {
  const accent = ACCENTS[accentIndex % ACCENTS.length];
  const firstImage = product.images?.[0];
  const priceLabel = priceRangeMYR(product.variants);

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block rounded-[28px] bg-white shadow-lg hover:-translate-y-1 hover:shadow-xl transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{ outlineColor: accent }}
      aria-label={`${product.name} — ${priceLabel}`}
    >
      <div
        className="relative aspect-square rounded-[24px] overflow-hidden"
        style={{ backgroundColor: `${accent}20` }}
      >
        {firstImage ? (
          <Image
            src={firstImage}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
            No image
          </div>
        )}
        {product.isFeatured ? (
          <span
            className="absolute top-3 right-3 rounded-full px-3 py-1 text-xs font-bold text-white"
            style={{ backgroundColor: accent }}
          >
            FEATURED
          </span>
        ) : null}
      </div>
      {/* p-5 flex row: title + price badge.
          - `min-w-0` on the flex item (h3) is required for `truncate` to
            work inside a flex parent (CSS defaults flex items to
            `min-width: auto`, which prevents shrink below intrinsic content
            size and pushes the price badge past the 320px viewport edge).
          - `shrink-0` on the badge is preserved so price never wraps or
            truncates — on very narrow cards the title compresses instead. */}
      <div className="p-4 md:p-5 flex items-center justify-between gap-3">
        <h3
          className="min-w-0 font-[var(--font-heading)] text-lg md:text-xl truncate"
          style={{ color: BRAND.ink }}
        >
          {product.name}
        </h3>
        <span
          className="shrink-0 rounded-full px-3 py-1 text-xs md:text-sm font-bold text-white"
          style={{ backgroundColor: accent }}
        >
          {priceLabel}
        </span>
      </div>
    </Link>
  );
}
