import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { priceRangeMYR } from "@/lib/format";
import { pickThumbnail, type CatalogProduct } from "@/lib/catalog";
import { WishlistButton } from "@/components/store/wishlist-button";
import { SoldOutBadge } from "@/components/store/sold-out-badge";
// Phase 7 (07-08) — replaces next/Image with `<picture>` shell that reads
// the per-image manifest and emits avif/webp/jpeg srcset for ~70% size
// reduction on average.
import { ResponsiveProductImage } from "@/components/storefront/responsive-product-image";

/**
 * Single product card. Used by the homepage featured rail, /shop grid,
 * and category-filtered views (D2-07). The whole card is a link, with
 * an aria-label that combines name + price for screen readers.
 *
 * Accent cycles through blue/green/purple based on `accentIndex` so grid
 * rows feel lively without per-product configuration.
 *
 * Phase 6 06-04: optional WishlistButton overlay top-right of the image.
 * Parents pass `isWishlisted` via getWishlistedProductIds batch helper to
 * avoid an N+1 query on grid pages.
 */
const ACCENTS = [BRAND.blue, BRAND.green, BRAND.purple] as const;

export async function ProductCard({
  product,
  accentIndex = 0,
  isWishlisted = false,
}: {
  product: CatalogProduct;
  accentIndex?: number;
  isWishlisted?: boolean;
}) {
  const accent = ACCENTS[accentIndex % ACCENTS.length];
  // Honour the admin's thumbnail selection; falls back to images[0] when the
  // configured slot is missing (image deleted after the picker saved).
  const firstImage = pickThumbnail(product);
  const priceLabel = priceRangeMYR(product.variants);
  // Phase 5 05-04 (INV-01): show Sold Out overlay when EVERY variant has
  // inStock=false. If a product has no variants at all (defensive), do not
  // show sold out — it is still purchasable / visible per existing rules.
  const allSoldOut =
    product.variants.length > 0 &&
    product.variants.every((v) => v.inStock === false);

  return (
    <div className="relative group">
      <Link
        href={`/products/${product.slug}`}
        className="block rounded-[28px] bg-white shadow-lg hover:-translate-y-1 hover:shadow-xl transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{ outlineColor: accent }}
        aria-label={`${product.name} — ${priceLabel}`}
      >
      <div
        className="relative aspect-square rounded-[24px] overflow-hidden"
        style={{ backgroundColor: `${accent}20` }}
      >
        {firstImage ? (
          <ResponsiveProductImage
            imageUrl={firstImage}
            alt={product.name}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
            No image
          </div>
        )}
        {product.isFeatured ? (
          <span
            className="absolute top-3 left-3 rounded-full px-3 py-1 text-xs font-bold text-white"
            style={{ backgroundColor: accent }}
          >
            FEATURED
          </span>
        ) : null}
        {allSoldOut ? <SoldOutBadge /> : null}
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

      {/* Wishlist heart overlay — sibling to the Link (NOT inside) so we
          don't nest interactive elements (HTML invalid). The button uses
          stopPropagation so a click never bubbles into the card link. */}
      <div className="absolute top-3 right-3 z-10">
        <WishlistButton
          productId={product.id}
          initialState={isWishlisted}
          variant="overlay"
        />
      </div>
    </div>
  );
}
