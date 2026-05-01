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
import { ConfigurableProductView } from "@/components/store/configurable-product-view";
import { SimpleProductView } from "@/components/store/simple-product-view";
import { DescriptionDisplay } from "@/components/store/description-display";
import type { PublicConfigField } from "@/lib/configurable-product-data";

type ProductDetailProps = {
  product: {
    id: string;
    name: string;
    slug: string;
    description: string;
    /** Quick task 260430-kmr — pre-rendered (sanitised) HTML for description. Empty string when absent. */
    descriptionHtml?: string;
    images: string[];
    /** Phase 19 (19-10) — optional captions parallel to images[]; for configurable PDP figcaption */
    imageCaptions?: (string | null | undefined)[];
    materialType: string | null;
    estimatedProductionDays: number | null;
    category: { name: string; slug: string } | null;
    options: HydratedOption[];
    hydratedVariants: HydratedVariant[];
    productType?: "stocked" | "configurable" | "keychain" | "vending" | "simple";
  };
  isWishlistedInitial?: boolean;
  ratingAvg?: number;
  ratingCount?: number;
  /** Pre-resolved PictureData for each product image (indexed parallel to images[]) */
  pictures?: PictureData[];
  /** Pre-resolved PictureData keyed by variantId for variants that have imageUrl set */
  variantPictures?: Record<string, PictureData | null>;
  configurableData?: { fields: PublicConfigField[]; maxUnitCount: number | null; priceTiers: Record<string, number>; unitField: string | null };
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
  configurableData,
}: ProductDetailProps) {
  // Quick task 260430-icx — `simple` PDP renders <SimpleProductView>, NOT
  // ConfigurableProductView, because textarea fields render as read-only
  // HTML blocks instead of input widgets.
  // Quick task 260501-spv — simple may now hold an optional single-axis
  // variant set. Forward options + hydratedVariants + variantPictures so
  // SimpleProductView can render the shared <VariantSelector> when present.
  if (product.productType === "simple" && configurableData) {
    return (
      <SimpleProductView
        product={{ ...product, pictures }}
        {...configurableData}
        options={product.options}
        hydratedVariants={product.hydratedVariants}
        variantPictures={variantPictures}
        isWishlistedInitial={isWishlistedInitial}
        ratingAvg={ratingAvg}
        ratingCount={ratingCount}
      />
    );
  }
  if ((product.productType === "configurable" || product.productType === "keychain" || product.productType === "vending") && configurableData) {
    return <ConfigurableProductView product={{ ...product, pictures }} {...configurableData} isWishlistedInitial={isWishlistedInitial} ratingAvg={ratingAvg} ratingCount={ratingCount} />;
  }
  const [selectedHydrated, setSelectedHydrated] = useState<HydratedVariant | null>(null);
  // Bug fix: track first missing option name for the Add-to-bag button label.
  const [firstMissingOptionName, setFirstMissingOptionName] = useState<string | null>(null);
  // Fix 3 — hovered variant (hover preview). Takes priority over selectedHydrated
  // for IMAGE/PRICE/BADGE display. Cleared on mouseleave.
  const [hoveredHydrated, setHoveredHydrated] = useState<HydratedVariant | null>(null);

  const handleVariantChange = useCallback((v: HydratedVariant | null) => {
    setSelectedHydrated(v);
  }, []);
  const handlePreviewChange = useCallback((v: HydratedVariant | null) => {
    setHoveredHydrated(v);
  }, []);
  const handleFirstMissingOptionChange = useCallback((name: string | null) => {
    setFirstMissingOptionName(name);
  }, []);

  // What the user sees: hover wins over click for display.
  const displayedHydrated = hoveredHydrated ?? selectedHydrated;

  // Gallery: when the displayed variant has a pre-resolved PictureData, prepend it.
  const galleryImages = useMemo(() => {
    const variantPic = displayedHydrated ? variantPictures[displayedHydrated.id] ?? null : null;
    if (variantPic) {
      // Prepend variant picture using its fallbackSrc as the image URL key
      return [variantPic.fallbackSrc, ...product.images.filter((i) => i !== variantPic.fallbackSrc)];
    }
    return product.images;
  }, [displayedHydrated, variantPictures, product.images]);

  const galleryPictures = useMemo<PictureData[] | undefined>(() => {
    const variantPic = displayedHydrated ? variantPictures[displayedHydrated.id] ?? null : null;
    if (variantPic && pictures) {
      return [variantPic, ...pictures];
    }
    return pictures;
  }, [displayedHydrated, variantPictures, pictures]);

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

  // Effective price display — hover-aware
  const effectivePriceDisplay = displayedHydrated
    ? formatMYR(displayedHydrated.effectivePrice)
    : priceRangeMYR(product.hydratedVariants);

  // Pre-order badge — driven by the DISPLAYED variant (hover-aware) so the
  // preview shows its pre-order status. Admin-disabled (inStock=false) OR
  // tracked+stock=0, with allow_preorder=true, counts as pre-order.
  const isPreorder =
    !!displayedHydrated &&
    (!displayedHydrated.inStock ||
      (displayedHydrated.trackStock === true && (displayedHydrated.stock ?? 0) <= 0)) &&
    displayedHydrated.allowPreorder === true;

  // Add-to-bag stays wired to the SELECTED (clicked) variant — we never add
  // the hovered variant to the cart.
  const isPreorderSelected =
    !!selectedHydrated &&
    (!selectedHydrated.inStock ||
      (selectedHydrated.trackStock === true && (selectedHydrated.stock ?? 0) <= 0)) &&
    selectedHydrated.allowPreorder === true;

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 md:py-10">
        {/* Breadcrumb */}
        {product.category ? (
          <a
            href={`/shop?category=${encodeURIComponent(product.category.slug)}`}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] mb-5 transition-opacity hover:opacity-70 cursor-pointer"
            style={{ color: BRAND.purple }}
          >
            <span aria-hidden="true">←</span>
            {product.category.name}
          </a>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12 items-start">
          {/* ── LEFT: Gallery card (sticky on desktop) ── */}
          <div className="min-w-0 lg:sticky lg:top-24">
            <div
              className="rounded-3xl overflow-hidden"
              style={{
                background: "#ffffff",
                border: `2.5px solid ${BRAND.ink}18`,
                boxShadow: `0 8px 0 ${BRAND.ink}12, 0 20px 40px ${BRAND.ink}10`,
              }}
            >
              <div className="p-4">
                <ProductGallery
                  images={galleryImages}
                  pictures={galleryPictures}
                  alt={product.name}
                />
              </div>
            </div>

            {/* Desktop trust signal */}
            <div
              className="hidden lg:flex items-center gap-2 mt-4 px-4 py-3 rounded-2xl text-sm font-medium"
              style={{
                backgroundColor: `${BRAND.green}15`,
                color: BRAND.ink,
                border: `1.5px solid ${BRAND.green}30`,
              }}
            >
              <Image
                src="/icons/ninja/emoji/secure@128.png"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 object-contain shrink-0"
              />
              <span>Secure checkout via PayPal. Made in Kuala Lumpur.</span>
            </div>
          </div>

          {/* ── RIGHT: Product info + form ── */}
          <div className="flex flex-col gap-5 min-w-0">

            {/* Product header card */}
            <div
              className="rounded-3xl p-5 sm:p-6"
              style={{
                background: "#ffffff",
                border: `2.5px solid ${BRAND.ink}12`,
                boxShadow: `0 6px 0 ${BRAND.ink}0e, 0 16px 32px ${BRAND.ink}0a`,
              }}
            >
              <h1
                className="font-[var(--font-heading)] text-2xl sm:text-3xl md:text-4xl leading-tight mb-3"
                style={{ color: BRAND.ink }}
              >
                {product.name}
              </h1>

              {ratingCount > 0 ? (
                <div className="mb-3">
                  <RatingBadge avg={ratingAvg} count={ratingCount} size="md" />
                </div>
              ) : null}

              {/* Pre-order badge */}
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

              {/* Price */}
              {displayedHydrated?.isOnSale ? (
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <span
                    className="inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider"
                    style={{ backgroundColor: BRAND.purple, color: "white" }}
                  >
                    On Sale
                  </span>
                  <span className="text-base font-semibold text-zinc-400 line-through">
                    {formatMYR(displayedHydrated.price)}
                  </span>
                  <span
                    className="inline-flex self-start items-center rounded-full px-5 py-2 text-2xl font-extrabold tracking-tight"
                    style={{
                      backgroundColor: BRAND.green,
                      color: BRAND.ink,
                      boxShadow: `0 4px 0 ${BRAND.greenDark}`,
                    }}
                  >
                    {formatMYR(displayedHydrated.effectivePrice)}
                  </span>
                </div>
              ) : (
                <div className="mb-4">
                  <span
                    className="inline-flex self-start items-center rounded-full px-5 py-2 text-2xl font-extrabold tracking-tight"
                    style={{
                      backgroundColor: BRAND.green,
                      color: BRAND.ink,
                      boxShadow: `0 4px 0 ${BRAND.greenDark}`,
                    }}
                  >
                    {effectivePriceDisplay}
                  </span>
                </div>
              )}

              {product.descriptionHtml ? (
                <DescriptionDisplay html={product.descriptionHtml} />
              ) : (
                <p className="text-base leading-relaxed" style={{ color: "#374151" }}>
                  {product.description}
                </p>
              )}
            </div>

            {/* Variant selector card */}
            <div
              className="rounded-3xl p-5 sm:p-6"
              style={{
                background: "#ffffff",
                border: `2.5px solid ${BRAND.ink}12`,
                boxShadow: `0 6px 0 ${BRAND.ink}0e, 0 16px 32px ${BRAND.ink}0a`,
              }}
            >
              <div className="flex items-center gap-2 mb-5">
                <span
                  className="w-1.5 h-6 rounded-full shrink-0"
                  style={{ backgroundColor: BRAND.blue }}
                  aria-hidden="true"
                />
                <h2
                  className="font-[var(--font-heading)] text-lg font-bold uppercase tracking-wide"
                  style={{ color: BRAND.ink }}
                >
                  Choose Your Size
                </h2>
              </div>

              {soldOut ? (
                <div
                  className="rounded-2xl border-2 px-4 py-3 text-sm font-semibold"
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
                  onPreviewChange={handlePreviewChange}
                  onFirstMissingOptionChange={handleFirstMissingOptionChange}
                />
              )}
            </div>

            {/* Add to bag card */}
            <div
              className="rounded-3xl p-5 sm:p-6"
              style={{
                background: "#f8fafc",
                border: `2.5px solid ${BRAND.ink}10`,
                boxShadow: `0 6px 0 ${BRAND.ink}0a, 0 16px 32px ${BRAND.ink}06`,
              }}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <AddToBagButton
                    selectedVariant={
                      !soldOut && selectedHydrated
                        ? { ...selectedHydrated, isPreorder: isPreorderSelected }
                        : null
                    }
                    productId={product.id}
                    productSlug={product.slug}
                    productName={product.name}
                    productImage={product.images[0] ?? null}
                    firstMissingOptionName={firstMissingOptionName}
                  />
                </div>
                <WishlistButton
                  productId={product.id}
                  initialState={isWishlistedInitial}
                  variant="pill"
                />
              </div>
            </div>

            {/* Trust + shipping row */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div
                className="flex-1 flex items-center gap-3 rounded-2xl px-4 py-3.5"
                style={{
                  backgroundColor: `${BRAND.blue}0f`,
                  border: `1.5px solid ${BRAND.blue}25`,
                }}
              >
                <Image
                  src="/icons/ninja/emoji/secure@128.png"
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 object-contain shrink-0"
                />
                <p className="text-sm font-medium leading-snug" style={{ color: BRAND.ink }}>
                  <span className="font-bold block">Ships in {leadDays} days</span>
                  From Kuala Lumpur
                </p>
              </div>
              <div
                className="flex-1 flex items-center gap-3 rounded-2xl px-4 py-3.5 lg:hidden"
                style={{
                  backgroundColor: `${BRAND.green}0f`,
                  border: `1.5px solid ${BRAND.green}25`,
                }}
              >
                <Image
                  src="/icons/ninja/emoji/secure@128.png"
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 object-contain shrink-0"
                />
                <p className="text-sm font-medium leading-snug" style={{ color: BRAND.ink }}>
                  <span className="font-bold block">Secure checkout</span>
                  Protected by PayPal
                </p>
              </div>
            </div>

            {/* Material & craft card */}
            <div
              className="rounded-3xl p-5 sm:p-6"
              style={{
                background: "#ffffff",
                border: `2.5px solid ${BRAND.ink}10`,
                boxShadow: `0 4px 0 ${BRAND.ink}0a, 0 12px 24px ${BRAND.ink}06`,
              }}
            >
              <div className="flex items-center gap-2 mb-4">
                <span
                  className="w-1.5 h-6 rounded-full shrink-0"
                  style={{ backgroundColor: BRAND.purple }}
                  aria-hidden="true"
                />
                <h2
                  className="font-[var(--font-heading)] text-lg font-bold uppercase tracking-wide"
                  style={{ color: BRAND.ink }}
                >
                  Material &amp; Craft
                </h2>
              </div>
              <p className="text-sm font-semibold mb-1.5" style={{ color: BRAND.ink }}>
                Material: <span className="font-normal text-zinc-600">{material}</span>
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
                Every product is made to order in our Kuala Lumpur Ninja Hideout! We inspect every item before we ship each product straight to your door!
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
