"use client";

import Image from "next/image";
import { useMemo, useState, useCallback } from "react";
import { BRAND } from "@/lib/brand";
import { formatMYR, priceRangeMYR } from "@/lib/format";
import { ProductGallery } from "@/components/store/product-gallery";
import { SizeSelector } from "@/components/store/size-selector";
import { VariantSelector } from "@/components/store/variant-selector";
import { SizeGuide } from "@/components/store/size-guide";
import { AddToBagButton } from "@/components/store/add-to-bag-button";
import { WishlistButton } from "@/components/store/wishlist-button";
import { RatingBadge } from "@/components/store/rating-badge";
import type { HydratedOption, HydratedVariant } from "@/lib/variants";

type Size = "S" | "M" | "L";

type Variant = {
  id: string;
  size?: Size | null; // optional post phase-16-07 (size column dropped)
  price: string;
  inStock?: boolean;
  trackStock?: boolean;
  stock?: number;
};

type PictureSource = {
  type: "image/avif" | "image/webp" | "image/jpeg";
  srcSet: string;
};
type PictureData = { sources: PictureSource[]; fallbackSrc: string };

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
    variants: Variant[];
    // Phase 16 — generic variant system (additive)
    options?: HydratedOption[];
    hydratedVariants?: HydratedVariant[];
  };
  isWishlistedInitial?: boolean;
  ratingAvg?: number;
  ratingCount?: number;
  pictures?: PictureData[];
};

const SIZE_ORDER: Record<Size, number> = { S: 0, M: 1, L: 2 };

/**
 * Stateful PDP container.
 *
 * Phase 16: when `options` + `hydratedVariants` are provided, renders the
 * generic <VariantSelector> instead of the legacy <SizeSelector>. Falls back
 * to legacy path when options are missing (defensive).
 */
export function ProductDetail({
  product,
  isWishlistedInitial = false,
  ratingAvg = 0,
  ratingCount = 0,
  pictures,
}: ProductDetailProps) {
  // ----- Legacy path (size-only, pre-phase-16 fallback) -----
  const sortedVariants = useMemo(
    () =>
      [...product.variants].sort(
        (a, b) => (SIZE_ORDER[a.size ?? "S"] ?? 0) - (SIZE_ORDER[b.size ?? "S"] ?? 0),
      ),
    [product.variants],
  );
  const [selectedSize, setSelectedSize] = useState<Size | null>(null);
  const legacySelectedVariant =
    sortedVariants.find((v) => v.size === selectedSize) ?? null;

  // ----- Phase 16 generic path -----
  const hasGenericOptions =
    (product.options?.length ?? 0) > 0 &&
    (product.hydratedVariants?.length ?? 0) > 0;

  const [selectedHydrated, setSelectedHydrated] = useState<HydratedVariant | null>(null);

  const handleVariantChange = useCallback((v: HydratedVariant | null) => {
    setSelectedHydrated(v);
  }, []);

  // Determine effective selected variant + image
  const effectiveVariant = hasGenericOptions ? selectedHydrated : legacySelectedVariant;
  const effectivePrice = effectiveVariant
    ? formatMYR(effectiveVariant.price)
    : hasGenericOptions
      ? priceRangeMYR(product.hydratedVariants ?? [])
      : priceRangeMYR(sortedVariants);

  // If selected variant has its own image, prepend to gallery
  const variantImageUrl =
    hasGenericOptions && selectedHydrated?.imageUrl ? selectedHydrated.imageUrl : null;
  const galleryImages = variantImageUrl
    ? [variantImageUrl, ...product.images.filter((i) => i !== variantImageUrl)]
    : product.images;

  const material = product.materialType ?? "PLA";
  const leadDays = product.estimatedProductionDays ?? 7;
  const hasSizeOption = product.options?.some(
    (o) => o.name.toLowerCase() === "size",
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 md:py-16 grid lg:grid-cols-2 gap-10 md:gap-14">
      <div>
        <ProductGallery
          images={galleryImages}
          pictures={variantImageUrl ? undefined : pictures}
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

        <p
          className="inline-flex self-start rounded-full px-5 py-2 text-lg font-bold mb-6"
          style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
        >
          {effectivePrice}
        </p>

        <p className="text-base leading-relaxed mb-6 text-zinc-700">
          {product.description}
        </p>

        {/* Phase 16: generic variant selector when options available */}
        {hasGenericOptions ? (
          <VariantSelector
            options={product.options!}
            variants={product.hydratedVariants!}
            onVariantChange={handleVariantChange}
          />
        ) : (
          /* Legacy size selector (fallback for pre-backfill or old data) */
          <SizeSelector
            variants={sortedVariants as Parameters<typeof SizeSelector>[0]["variants"]}
            selectedSize={selectedSize}
            onSelect={setSelectedSize}
          />
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            {hasGenericOptions ? (
              <AddToBagButtonV2
                selectedVariant={selectedHydrated}
                productId={product.id}
                productSlug={product.slug}
                productName={product.name}
                productImage={product.images[0] ?? null}
              />
            ) : (
              <AddToBagButton
                selectedVariant={legacySelectedVariant as Parameters<typeof AddToBagButton>[0]["selectedVariant"]}
                productId={product.id}
                productSlug={product.slug}
                productName={product.name}
                productImage={product.images[0] ?? null}
              />
            )}
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

        {/* Size guide only for products with a Size option (or legacy) */}
        {(hasSizeOption || !hasGenericOptions) && (
          <SizeGuide variants={sortedVariants as Parameters<typeof SizeGuide>[0]["variants"]} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 16 — AddToBagButton variant for variantId-based cart
// ---------------------------------------------------------------------------
// Thin wrapper that maps HydratedVariant → the cart store's addItem shape.
// The cart store is updated in Plan 16-05 to accept variantId directly.
// During this transition window we pass the legacy shape so the existing
// cart-store.ts still works without modification.

function AddToBagButtonV2({
  selectedVariant,
  productId,
  productSlug,
  productName,
  productImage,
}: {
  selectedVariant: HydratedVariant | null;
  productId: string;
  productSlug: string;
  productName: string;
  productImage: string | null;
}) {
  // Bridge: map HydratedVariant to the legacy AddToBagButton shape.
  // size is still required by cart-store v1; we use "S" as a placeholder
  // until the cart is upgraded in Plan 16-05.
  const legacyShape = selectedVariant
    ? {
        id: selectedVariant.id,
        size: "S" as const, // placeholder — overridden in 16-05 cart upgrade
        price: selectedVariant.price,
      }
    : null;

  return (
    <AddToBagButton
      selectedVariant={legacyShape}
      productId={productId}
      productSlug={productSlug}
      productName={productName}
      productImage={productImage}
    />
  );
}
