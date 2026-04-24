"use client";

import Image from "next/image";
import { useMemo, useState, useCallback } from "react";
import { BRAND } from "@/lib/brand";
import { formatMYR, priceRangeMYR } from "@/lib/format";
import { ProductGallery } from "@/components/store/product-gallery";
import { VariantSelector } from "@/components/store/variant-selector";
import { AddToBagButton } from "@/components/store/add-to-bag-button";
import { WishlistButton } from "@/components/store/wishlist-button";
import { RatingBadge } from "@/components/store/rating-badge";
import type { HydratedOption, HydratedVariant } from "@/lib/variants";
import type { PictureData } from "@/lib/image-manifest";

type ProductDetailProps = {
  product: {
    id: string;
    name: string;
    slug: string;
    description: string;
    images: string[];
    materialType: string | null;
    estimatedProductionDays: number | null;
    category: { name: string; slug: string } | null;
    options: HydratedOption[];
    hydratedVariants: HydratedVariant[];
  };
  isWishlistedInitial?: boolean;
  ratingAvg?: number;
  ratingCount?: number;
  /** Pre-resolved PictureData for each product image (indexed parallel to images[]) */
  pictures?: PictureData[];
  /** Pre-resolved PictureData keyed by variantId for variants that have imageUrl set */
  variantPictures?: Record<string, PictureData | null>;
};

/**
 * Stateful PDP container.
 *
 * Phase 17: renders sale price + ON SALE badge, pre-selects the admin-marked
 * default variant, swaps the gallery to the variant's image when selected.
 * Legacy SizeSelector / SizeGuide / AddToBagButtonV2 paths removed (17-04).
 */
export function ProductDetail({
  product,
  isWishlistedInitial = false,
  ratingAvg = 0,
  ratingCount = 0,
  pictures,
  variantPictures = {},
}: ProductDetailProps) {
  const [selectedHydrated, setSelectedHydrated] = useState<HydratedVariant | null>(null);

  const handleVariantChange = useCallback((v: HydratedVariant | null) => {
    setSelectedHydrated(v);
  }, []);

  // Gallery: when the selected variant has a pre-resolved PictureData, prepend it.
  const galleryImages = useMemo(() => {
    const variantPic = selectedHydrated ? variantPictures[selectedHydrated.id] ?? null : null;
    if (variantPic) {
      // Prepend variant picture using its fallbackSrc as the image URL key
      return [variantPic.fallbackSrc, ...product.images.filter((i) => i !== variantPic.fallbackSrc)];
    }
    return product.images;
  }, [selectedHydrated, variantPictures, product.images]);

  const galleryPictures = useMemo<PictureData[] | undefined>(() => {
    const variantPic = selectedHydrated ? variantPictures[selectedHydrated.id] ?? null : null;
    if (variantPic && pictures) {
      return [variantPic, ...pictures];
    }
    return pictures;
  }, [selectedHydrated, variantPictures, pictures]);

  const material = product.materialType ?? "PLA";
  const leadDays = product.estimatedProductionDays ?? 7;

  // Fix 2 — compute visible variants so PDP can show "sold out" when all
  // variants are hidden (either admin-disabled or tracked+stock=0, without preorder).
  const visibleVariants = useMemo(
    () =>
      product.hydratedVariants.filter((v) => {
        const oos = !v.inStock || (v.trackStock === true && (v.stock ?? 0) <= 0);
        return !(oos && v.allowPreorder !== true);
      }),
    [product.hydratedVariants],
  );
  const soldOut = product.hydratedVariants.length > 0 && visibleVariants.length === 0;

  // Effective price display
  const effectivePriceDisplay = selectedHydrated
    ? formatMYR(selectedHydrated.effectivePrice)
    : priceRangeMYR(product.hydratedVariants);

  // Pre-order badge — true when selected variant is OOS (by either dimension:
  // inStock=false OR tracked+stock=0) AND allow_preorder=true.
  const isPreorder =
    !!selectedHydrated &&
    (!selectedHydrated.inStock ||
      (selectedHydrated.trackStock === true && (selectedHydrated.stock ?? 0) <= 0)) &&
    selectedHydrated.allowPreorder === true;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 md:py-16 grid lg:grid-cols-2 gap-10 md:gap-14">
      <div>
        <ProductGallery
          images={galleryImages}
          pictures={galleryPictures}
          alt={product.name}
        />
      </div>

      <div className="min-w-0 flex flex-col">
        {product.category ? (
          <a
            href={`/shop?category=${encodeURIComponent(product.category.slug)}`}
            className="text-xs tracking-[0.2em] font-bold mb-3"
            style={{ color: BRAND.purple }}
          >
            {product.category.name.toUpperCase()}
          </a>
        ) : null}

        <h1 className="font-[var(--font-heading)] text-3xl md:text-5xl leading-tight mb-2 text-zinc-900">
          {product.name}
        </h1>

        {ratingCount > 0 ? (
          <div className="mb-3">
            <RatingBadge avg={ratingAvg} count={ratingCount} size="md" />
          </div>
        ) : null}

        {/* Phase 18 — pre-order badge (AD-09) — visible when variant is OOS+preorder */}
        {isPreorder && (
          <div className="mb-3">
            <span
              className="inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider"
              style={{ backgroundColor: BRAND.purple, color: "white" }}
            >
              Pre-order
            </span>
          </div>
        )}

        {/* Phase 17 — sale price rendering (AD-01) */}
        {selectedHydrated?.isOnSale ? (
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <span
              className="inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider"
              style={{ backgroundColor: BRAND.purple, color: "white" }}
            >
              On Sale
            </span>
            <span className="text-base font-semibold text-zinc-400 line-through">
              {formatMYR(selectedHydrated.price)}
            </span>
            <span
              className="inline-flex self-start rounded-full px-5 py-2 text-lg font-bold"
              style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
            >
              {formatMYR(selectedHydrated.effectivePrice)}
            </span>
          </div>
        ) : (
          <p
            className="inline-flex self-start rounded-full px-5 py-2 text-lg font-bold mb-6"
            style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
          >
            {effectivePriceDisplay}
          </p>
        )}

        <p className="text-base leading-relaxed mb-6 text-zinc-700">
          {product.description}
        </p>

        {/* Fix 2 — when every variant is hidden (sold out + no preorder),
            replace the selector with a clear sold-out message. */}
        {soldOut ? (
          <div
            className="rounded-2xl border-2 px-4 py-3 text-sm font-semibold mb-6"
            style={{ borderColor: "#cbd5e1", backgroundColor: "#f1f5f9", color: BRAND.ink }}
            role="status"
          >
            Currently sold out. Check back soon!
          </div>
        ) : (
          <VariantSelector
            options={product.options}
            variants={product.hydratedVariants}
            onVariantChange={handleVariantChange}
          />
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <AddToBagButton
              selectedVariant={
                !soldOut && selectedHydrated
                  ? { ...selectedHydrated, isPreorder }
                  : null
              }
              productId={product.id}
              productSlug={product.slug}
              productName={product.name}
              productImage={product.images[0] ?? null}
            />
          </div>
          <WishlistButton
            productId={product.id}
            initialState={isWishlistedInitial}
            variant="pill"
          />
        </div>

        <p className="mt-4 flex items-center gap-2 text-sm text-zinc-600">
          <Image
            src="/icons/ninja/emoji/secure@128.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 object-contain shrink-0"
          />
          <span>Secure checkout with PayPal.</span>
        </p>

        <p
          className="mt-4 rounded-2xl px-4 py-3 text-sm font-medium"
          style={{ backgroundColor: `${BRAND.green}20`, color: BRAND.ink }}
        >
          Ships in {leadDays} business days from Kuala Lumpur.
        </p>

        <section className="mt-6 rounded-2xl border border-zinc-200 p-5 bg-white">
          <h2 className="font-[var(--font-heading)] text-xl mb-2 text-zinc-900">
            Material &amp; craft
          </h2>
          <p className="text-sm text-zinc-700 mb-2">
            <span className="font-bold">Material:</span> {material}
          </p>
          <p className="text-sm text-zinc-700">
            Every piece is printed to order on our Kuala Lumpur printers, layer
            by ninja layer. Hand-finished, inspected, then shipped straight to
            your door.
          </p>
        </section>
      </div>
    </div>
  );
}
