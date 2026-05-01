"use client";

/**
 * Quick task 260430-icx — PDP root component for `simple` productType.
 *
 * Lighter cousin of <ConfigurableProductView>:
 *   - Flat price (always priceTiers["1"]). No tier table, no unitField, no
 *     out-of-table state. Customer-filled fields do NOT affect price.
 *   - No live preview (keychain/vending-only). Standard image gallery.
 *   - Iterates fields:
 *       text/number/colour/select  -> existing <ConfiguratorForm> input renderers
 *       textarea                   -> <TextareaDisplay> read-only HTML block
 *   - Add-to-bag: configurationData.values contains ONLY customer-filled
 *     inputs. textarea fields are admin content — excluded entirely.
 *
 * Quick task 260501-spv — simple products may now ALSO carry an optional
 * single-axis variant set (e.g. Size OR Colour). When `hydratedVariants`
 * is non-empty, the view renders the shared <VariantSelector>, switches the
 * displayed price to the selected variant's effectivePrice, and routes the
 * cart through the stocked path ({ variantId, quantity }). When variants
 * are absent the view falls back to the original flat-price flow byte-for-
 * byte. Customer-input fields are hidden in the variant branch — admins
 * choosing variants surrender the free-form configurator side of simple.
 * Admin-content textarea fields still render in both branches.
 */

import { useState, useMemo, useCallback } from "react";
import Image from "next/image";
import { ShoppingBag } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { useCartStore } from "@/stores/cart-store";
import { ConfiguratorForm } from "@/components/store/configurator-form";
import { TextareaDisplay } from "@/components/store/textarea-display";
import { ProductGallery } from "@/components/store/product-gallery";
import { VariantSelector } from "@/components/store/variant-selector";
import { WishlistButton } from "@/components/store/wishlist-button";
import { RatingBadge } from "@/components/store/rating-badge";
import { DescriptionDisplay } from "@/components/store/description-display";
import type { PublicConfigField } from "@/lib/configurable-product-data";
import type { HydratedOption, HydratedVariant } from "@/lib/variants";
import type { PictureData } from "@/lib/image-manifest";
import type { TextareaFieldConfig } from "@/lib/config-fields";

// ============================================================================
// Types
// ============================================================================

type Props = {
  product: {
    id: string;
    name: string;
    slug: string;
    description: string;
    /** Quick task 260430-kmr — pre-rendered (sanitised) HTML for description. */
    descriptionHtml?: string;
    images: string[];
    imageCaptions?: (string | null | undefined)[];
    materialType: string | null;
    estimatedProductionDays: number | null;
    category: { name: string; slug: string } | null;
    pictures?: PictureData[];
    productType?: "stocked" | "configurable" | "keychain" | "vending" | "simple";
  };
  fields: PublicConfigField[];
  /** Always 1 for simple products — kept for prop-shape parity with ConfigurableProductView. */
  maxUnitCount: number | null;
  /** Always {"1": flatPrice} for simple products. */
  priceTiers: Record<string, number>;
  /** Always null for simple products (no unit-driven pricing). */
  unitField: string | null;
  isWishlistedInitial?: boolean;
  ratingAvg?: number;
  ratingCount?: number;
  /**
   * Quick task 260501-spv — optional single-axis variant set. When non-empty
   * the SimpleProductView swaps its flat-price flow for a variant-driven
   * one (selector + variantId-keyed cart). When empty / undefined the
   * original flat-price flow is preserved byte-for-byte.
   */
  options?: HydratedOption[];
  hydratedVariants?: HydratedVariant[];
  /** Pre-resolved <picture> sources keyed by variantId — mirrors stocked PDP. */
  variantPictures?: Record<string, PictureData | null>;
};

// ============================================================================
// Summary builder (textarea fields excluded — admin content, not customer data)
// ============================================================================

function buildSimpleSummary(
  fields: PublicConfigField[],
  values: Record<string, string>,
): string {
  const parts: string[] = [];
  for (const f of fields) {
    if (f.fieldType === "textarea") continue;
    const v = values[f.id] ?? "";
    if (!v) continue;
    if (f.fieldType === "text") {
      parts.push(`"${v}"`);
    } else if (f.fieldType === "colour") {
      const c = f.resolvedColours?.find((x) => x.id === v);
      if (c) parts.push(`${c.name} ${f.label.toLowerCase()}`);
    } else if (f.fieldType === "number" || f.fieldType === "select") {
      parts.push(`${f.label}: ${v}`);
    }
  }
  return parts.join(" · ");
}

// ============================================================================
// SimpleProductView
// ============================================================================

export function SimpleProductView({
  product,
  fields,
  priceTiers,
  isWishlistedInitial = false,
  ratingAvg = 0,
  ratingCount = 0,
  options = [],
  hydratedVariants = [],
  variantPictures = {},
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});

  // Quick task 260501-spv — variant branch toggle. Single source of truth.
  const hasVariants = hydratedVariants.length > 0;

  // Variant branch state — selected + hovered variant.
  const [selectedHydrated, setSelectedHydrated] = useState<HydratedVariant | null>(null);
  const [hoveredHydrated, setHoveredHydrated] = useState<HydratedVariant | null>(null);
  const [firstMissingOptionName, setFirstMissingOptionName] = useState<string | null>(null);

  const handleVariantChange = useCallback((v: HydratedVariant | null) => {
    setSelectedHydrated(v);
  }, []);
  const handlePreviewChange = useCallback((v: HydratedVariant | null) => {
    setHoveredHydrated(v);
  }, []);
  const handleFirstMissingOptionChange = useCallback((name: string | null) => {
    setFirstMissingOptionName(name);
  }, []);

  // Hover wins over click for display (same rule as stocked PDP).
  const displayedHydrated = hoveredHydrated ?? selectedHydrated;

  // Visible variants — strip OOS-without-preorder rows so we can detect
  // "all sold out" without leaking hidden rows into the selector.
  const visibleVariants = useMemo(
    () =>
      hydratedVariants.filter((v) => {
        const oos = !v.inStock || (v.trackStock === true && (v.stock ?? 0) <= 0);
        return !(oos && v.allowPreorder !== true);
      }),
    [hydratedVariants],
  );
  const soldOut = hasVariants && visibleVariants.length === 0;

  // Flat price: always priceTiers["1"]. Falls back to the smallest key if
  // an admin somehow saved a different shape (defensive).
  const flatPrice: number | null = useMemo(() => {
    if (typeof priceTiers["1"] === "number") return priceTiers["1"];
    const minKey = Object.keys(priceTiers).map(Number).sort((a, b) => a - b)[0];
    if (minKey !== undefined && typeof priceTiers[String(minKey)] === "number") {
      return priceTiers[String(minKey)];
    }
    return null;
  }, [priceTiers]);

  // Customer-input fields (everything except admin-content textareas).
  // Hidden when variants are in play — variant-with-fields is a hybrid we
  // don't ship; the cart shape can't carry both. Admins choosing variants
  // give up the configurator-style customer inputs (textareas still render).
  const inputFields = useMemo(
    () => (hasVariants ? [] : fields.filter((f) => f.fieldType !== "textarea")),
    [fields, hasVariants],
  );

  // Required customer-input fields filled (flat-price branch only).
  const requiredFilled = useMemo(
    () =>
      inputFields
        .filter((f) => f.required)
        .every((f) => (values[f.id] ?? "").length > 0),
    [inputFields, values],
  );

  // Pre-order detection mirrors stocked PDP. Only applies in variant branch.
  const isPreorderSelected =
    hasVariants &&
    !!selectedHydrated &&
    (!selectedHydrated.inStock ||
      (selectedHydrated.trackStock === true && (selectedHydrated.stock ?? 0) <= 0)) &&
    selectedHydrated.allowPreorder === true;

  const isPreorderDisplayed =
    hasVariants &&
    !!displayedHydrated &&
    (!displayedHydrated.inStock ||
      (displayedHydrated.trackStock === true && (displayedHydrated.stock ?? 0) <= 0)) &&
    displayedHydrated.allowPreorder === true;

  // Effective price: variant branch prefers the displayed variant's
  // effectivePrice (sale-aware); flat branch keeps flatPrice.
  const effectivePriceNumber: number | null = hasVariants
    ? (displayedHydrated ? Number.parseFloat(displayedHydrated.effectivePrice) : null)
    : flatPrice;

  const canAdd = hasVariants
    ? !soldOut && !!selectedHydrated
    : flatPrice !== null && requiredFilled;

  const addItem = useCartStore((s) => s.addItem);
  const setDrawerOpen = useCartStore((s) => s.setDrawerOpen);

  function handleAddToBag() {
    if (!canAdd) return;

    if (hasVariants) {
      if (!selectedHydrated) return;
      // Stocked-style cart entry — variantId is the sole key. Cart hydration
      // resolves price + label + image server-side from the variant row.
      addItem({ variantId: selectedHydrated.id, quantity: 1 });
      setDrawerOpen(true);
      return;
    }

    if (flatPrice === null) return;

    // Strip textarea field IDs from values — admin content, not customer data.
    const inputIds = new Set(inputFields.map((f) => f.id));
    const customerValues: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      if (inputIds.has(k)) customerValues[k] = v;
    }

    const summary = buildSimpleSummary(fields, customerValues);
    const configurationData = {
      values: customerValues,
      computedPrice: flatPrice,
      computedSummary: summary,
    };
    addItem({ productId: product.id, configurationData });
    setDrawerOpen(true);
  }

  const material = product.materialType ?? "PLA";
  const leadDays = product.estimatedProductionDays ?? 7;

  // CTA label — three branches: variant / flat-with-fields / flat-no-fields.
  const ctaLabel = (() => {
    if (hasVariants) {
      if (soldOut) return "Out of stock";
      if (!selectedHydrated) {
        return firstMissingOptionName
          ? `Pick a ${firstMissingOptionName}`
          : "Pick a variant";
      }
      const priceLabel = formatMYR(effectivePriceNumber ?? 0);
      return isPreorderSelected ? `Pre-order · ${priceLabel}` : `Add to Bag · ${priceLabel}`;
    }
    if (canAdd) return `Add to Bag · ${formatMYR(flatPrice!)}`;
    if (!requiredFilled) return "Fill in all fields first";
    return "Enter your details";
  })();

  // Gallery: variant branch swaps in the selected variant's PictureData.
  const galleryImages = useMemo(() => {
    if (!hasVariants) return product.images;
    const variantPic = displayedHydrated ? variantPictures[displayedHydrated.id] ?? null : null;
    if (variantPic) {
      return [variantPic.fallbackSrc, ...product.images.filter((i) => i !== variantPic.fallbackSrc)];
    }
    return product.images;
  }, [hasVariants, displayedHydrated, variantPictures, product.images]);

  const galleryPictures = useMemo<PictureData[] | undefined>(() => {
    if (!hasVariants) return product.pictures;
    const variantPic = displayedHydrated ? variantPictures[displayedHydrated.id] ?? null : null;
    if (variantPic && product.pictures) {
      return [variantPic, ...product.pictures];
    }
    return product.pictures;
  }, [hasVariants, displayedHydrated, variantPictures, product.pictures]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: BRAND.cream }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 md:py-10">
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
          {/* LEFT: Gallery */}
          <div className="min-w-0 lg:sticky lg:top-24">
            <div
              className="rounded-3xl overflow-hidden p-4"
              style={{
                background: "#ffffff",
                border: `2.5px solid ${BRAND.ink}18`,
                boxShadow: `0 8px 0 ${BRAND.ink}12, 0 20px 40px ${BRAND.ink}10`,
              }}
            >
              <ProductGallery
                images={galleryImages}
                pictures={galleryPictures}
                alt={product.name}
              />
            </div>
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

          {/* RIGHT: Info + form */}
          <div className="flex flex-col gap-5 min-w-0">
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

              {/* Quick task 260501-spv — Pre-order badge for variant branch.
                  Mirrors stocked PDP: shows whenever the displayed variant is
                  OOS but allows preorder. Hidden in flat-price branch. */}
              {isPreorderDisplayed && (
                <div className="mb-3">
                  <span
                    className="inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider"
                    style={{ backgroundColor: BRAND.purple, color: "white" }}
                  >
                    Pre-order
                  </span>
                </div>
              )}

              {/* Price block — variant branch shows sale strike-through when
                  the displayed variant is on sale; flat branch is unchanged. */}
              {hasVariants && displayedHydrated?.isOnSale ? (
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <span
                    className="inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider"
                    style={{ backgroundColor: BRAND.purple, color: "white" }}
                  >
                    On Sale
                  </span>
                  <span className="text-base font-semibold text-zinc-400 line-through">
                    {formatMYR(Number.parseFloat(displayedHydrated.price))}
                  </span>
                  <span
                    className="inline-flex self-start items-center rounded-full px-5 py-2 text-2xl font-extrabold tracking-tight"
                    style={{
                      backgroundColor: BRAND.green,
                      color: BRAND.ink,
                      boxShadow: `0 4px 0 ${BRAND.greenDark}`,
                    }}
                  >
                    {formatMYR(Number.parseFloat(displayedHydrated.effectivePrice))}
                  </span>
                </div>
              ) : (
                <div className="mb-4">
                  {effectivePriceNumber !== null ? (
                    <span
                      className="inline-flex self-start items-center rounded-full px-5 py-2 text-2xl font-extrabold tracking-tight"
                      style={{
                        backgroundColor: BRAND.green,
                        color: BRAND.ink,
                        boxShadow: `0 4px 0 ${BRAND.greenDark}`,
                      }}
                    >
                      {formatMYR(effectivePriceNumber)}
                    </span>
                  ) : (
                    <span
                      className="inline-flex self-start items-center rounded-full px-5 py-2 text-base font-semibold"
                      style={{
                        backgroundColor: "#f1f5f9",
                        color: "#64748b",
                        border: "2px solid #e2e8f0",
                      }}
                    >
                      Price unavailable
                    </span>
                  )}
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

            {/* Admin-content blocks (textarea fields) — rendered above inputs so
                care/usage/safety info is visible before the customer commits. */}
            {fields
              .filter((f) => f.fieldType === "textarea")
              .map((f) => {
                const cfg = f.config as TextareaFieldConfig;
                return (
                  <div
                    key={f.id}
                    className="rounded-3xl p-5 sm:p-6"
                    style={{
                      background: "#ffffff",
                      border: `2.5px solid ${BRAND.ink}12`,
                      boxShadow: `0 6px 0 ${BRAND.ink}0e, 0 16px 32px ${BRAND.ink}0a`,
                    }}
                  >
                    <TextareaDisplay
                      label={f.label}
                      helpText={f.helpText}
                      html={cfg.html ?? ""}
                    />
                  </div>
                );
              })}

            {/* Quick task 260501-spv — variant selector card. Single-axis
                cap is enforced upstream in the admin editor; the selector
                itself is the same component stocked PDP uses, so the UX
                stays identical when admins promote a Simple product to
                "with variants". */}
            {hasVariants && (
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
                    {options[0]?.name
                      ? `Choose ${options[0].name}`
                      : "Choose a variant"}
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
                    options={options}
                    variants={hydratedVariants}
                    onVariantChange={handleVariantChange}
                    onPreviewChange={handlePreviewChange}
                    onFirstMissingOptionChange={handleFirstMissingOptionChange}
                  />
                )}
              </div>
            )}

            {/* Customer input fields — only render if any non-textarea fields exist
                AND no variants are present (variants + customer fields is a
                hybrid we don't ship; the cart can't carry both shapes). */}
            {inputFields.length > 0 && (
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
                    Customise
                  </h2>
                </div>
                <ConfiguratorForm
                  fields={inputFields}
                  values={values}
                  onChange={setValues}
                  onTouch={() => {
                    /* simple products have no live preview — no-op */
                  }}
                />
              </div>
            )}

            {/* Add to bag */}
            <div
              className="rounded-3xl p-5 sm:p-6"
              style={{
                background: canAdd ? `${BRAND.green}08` : "#f8fafc",
                border: `2.5px solid ${canAdd ? BRAND.green : BRAND.ink + "10"}`,
                boxShadow: `0 6px 0 ${
                  canAdd ? BRAND.greenDark + "30" : BRAND.ink + "0a"
                }, 0 16px 32px ${BRAND.ink}06`,
                transition:
                  "background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
              }}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  disabled={!canAdd}
                  onClick={handleAddToBag}
                  className="flex-1 min-w-0 flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-extrabold uppercase tracking-wide transition-all duration-200"
                  style={{
                    backgroundColor: canAdd ? BRAND.green : "#e2e8f0",
                    color: canAdd ? BRAND.ink : "#94a3b8",
                    cursor: canAdd ? "pointer" : "not-allowed",
                    minHeight: 56,
                    boxShadow: canAdd
                      ? `0 4px 0 ${BRAND.greenDark}, 0 8px 24px ${BRAND.green}40`
                      : "none",
                  }}
                  aria-disabled={!canAdd}
                >
                  <ShoppingBag size={20} strokeWidth={2.5} aria-hidden="true" />
                  {ctaLabel}
                </button>
                <WishlistButton
                  productId={product.id}
                  initialState={isWishlistedInitial}
                  variant="pill"
                />
              </div>
            </div>

            {/* Material + craft */}
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
                Material:{" "}
                <span className="font-normal text-zinc-600">{material}</span>
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "#374151" }}>
                Every product is made to order in our Kuala Lumpur Ninja Hideout! We inspect every item before we ship each product straight to your door!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky mobile CTA */}
      <div
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 px-4 pb-safe-area-inset-bottom"
        style={{
          backgroundColor: "rgba(247,250,244,0.96)",
          backdropFilter: "blur(12px)",
          borderTop: `2px solid ${BRAND.ink}10`,
          paddingTop: 12,
          paddingBottom: 16,
        }}
      >
        <button
          type="button"
          disabled={!canAdd}
          onClick={handleAddToBag}
          className="w-full flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-extrabold uppercase tracking-wide transition-all duration-200"
          style={{
            backgroundColor: canAdd ? BRAND.green : "#e2e8f0",
            color: canAdd ? BRAND.ink : "#94a3b8",
            cursor: canAdd ? "pointer" : "not-allowed",
            minHeight: 54,
            boxShadow: canAdd ? `0 4px 0 ${BRAND.greenDark}` : "none",
          }}
          aria-disabled={!canAdd}
          aria-label={ctaLabel}
        >
          <ShoppingBag size={20} strokeWidth={2.5} aria-hidden="true" />
          {ctaLabel}
        </button>
      </div>

      <div className="lg:hidden h-24" aria-hidden="true" />
    </div>
  );
}
