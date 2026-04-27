import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { priceRangeMYR, formatFromTier } from "@/lib/format";
import { pickThumbnail, type CatalogProduct } from "@/lib/catalog";
import { WishlistButton } from "@/components/store/wishlist-button";
import { SoldOutBadge } from "@/components/store/sold-out-badge";
// Phase 7 (07-08) — replaces next/Image with `<picture>` shell that reads
// the per-image manifest and emits avif/webp/jpeg srcset for ~70% size
// reduction on average.
import { ResponsiveProductImage } from "@/components/storefront/responsive-product-image";
import { isVariantAvailable } from "@/lib/variant-availability";

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
 *
 * Redesign (caveman session): Willow & Co reference — product image as full
 * hero, pastel tinted bg, sharp corners (no border-radius on card), clean
 * typography below the image. Kid-friendly, premium-playful for ages 9-17.
 * Price-from now filters to AVAILABLE variants only (inStock + stock>0 or
 * untracked or preorder). Falls back to "Sold out" badge + greyed price.
 */

// Soft pastel tints derived from brand palette for the image bg well.
const PASTEL_TINTS = [
  "#dce9ff", // blue-tinted cream
  "#d6f5e3", // green-tinted cream
  "#ead4f7", // purple-tinted cream
] as const;

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
  const pastelBg = PASTEL_TINTS[accentIndex % PASTEL_TINTS.length];

  // Honour the admin's thumbnail selection; falls back to images[0] when the
  // configured slot is missing (image deleted after the picker saved).
  const firstImage = pickThumbnail(product);

  // Available-only price range: filter hydratedVariants to purchasable ones.
  // Falls back to raw variants for products not yet migrated to Phase 16.
  const allHydrated = product.hydratedVariants.length > 0 ? product.hydratedVariants : [];
  const availableVariants = allHydrated.filter(isVariantAvailable);
  const allSoldOut = product.productType !== "configurable" && allHydrated.length > 0 && availableVariants.length === 0;

  // Phase 19 (19-07) — configurable products use tier-based "From MYR X" label.
  // Stocked products use the existing priceRangeMYR flow — UNTOUCHED.
  let priceLabel: string;
  if (product.productType === "configurable") {
    priceLabel = formatFromTier(product.priceTiers);
  } else if (allHydrated.length === 0) {
    priceLabel = priceRangeMYR(product.variants);
  } else if (allSoldOut) {
    priceLabel = "Sold out";
  } else {
    priceLabel = priceRangeMYR(availableVariants);
  }

  // Show SALE chip when any AVAILABLE variant has an active sale.
  const hasSale = product.productType !== "configurable" && availableVariants.some((v) => v.isOnSale);

  return (
    <div className="relative group">
      <Link
        href={`/products/${product.slug}`}
        className={[
          "block bg-white overflow-hidden",
          "border-2 border-transparent",
          "shadow-sm hover:shadow-lg hover:-translate-y-0.5",
          "transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          allSoldOut ? "opacity-80" : "",
        ].join(" ")}
        style={{ outlineColor: accent }}
        aria-label={`${product.name} — ${priceLabel}`}
      >
        {/* Hero image — square, flush to all card edges, no border-radius */}
        <div
          className="relative aspect-square w-full overflow-hidden"
          style={{ backgroundColor: pastelBg }}
        >
          {firstImage ? (
            <ResponsiveProductImage
              imageUrl={firstImage}
              alt={product.name}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-medium" style={{ color: accent }}>
              No image yet
            </div>
          )}

          {/* Top-left badge — FEATURED or SALE, mutually exclusive */}
          {product.isFeatured ? (
            <span
              className="absolute top-2 left-2 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white"
              style={{ backgroundColor: accent }}
            >
              FEATURED
            </span>
          ) : hasSale ? (
            <span
              className="absolute top-2 left-2 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white"
              style={{ backgroundColor: BRAND.purple }}
            >
              SALE
            </span>
          ) : null}

          {product.productType !== "configurable" && allSoldOut ? <SoldOutBadge /> : null}
        </div>

        {/* Card footer — white bar with name + price */}
        <div
          className="px-3 pt-3 pb-3 border-t-4"
          style={{ borderColor: accent }}
        >
          <h3
            className="font-[var(--font-heading)] text-[15px] md:text-base leading-snug font-extrabold uppercase tracking-tight line-clamp-2"
            style={{ color: BRAND.ink }}
          >
            {product.name}
          </h3>
          <p
            className="mt-1 text-sm font-bold"
            style={{ color: allSoldOut ? "#9ca3af" : accent }}
          >
            {allSoldOut ? "Sold out" : `from ${priceLabel}`}
          </p>
        </div>
      </Link>

      {/* Wishlist heart overlay — sibling to the Link (NOT inside) so we
          don't nest interactive elements (HTML invalid). The button uses
          stopPropagation so a click never bubbles into the card link. */}
      <div className="absolute top-2 right-2 z-10">
        <WishlistButton
          productId={product.id}
          initialState={isWishlisted}
          variant="overlay"
        />
      </div>
    </div>
  );
}
