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
 */

import { useState, useMemo } from "react";
import Image from "next/image";
import { ShoppingBag } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { useCartStore } from "@/stores/cart-store";
import { ConfiguratorForm } from "@/components/store/configurator-form";
import { TextareaDisplay } from "@/components/store/textarea-display";
import { ProductGallery } from "@/components/store/product-gallery";
import { WishlistButton } from "@/components/store/wishlist-button";
import { RatingBadge } from "@/components/store/rating-badge";
import { DescriptionDisplay } from "@/components/store/description-display";
import type { PublicConfigField } from "@/lib/configurable-product-data";
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
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});

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

  // Customer-input fields (everything except admin-content textareas)
  const inputFields = useMemo(
    () => fields.filter((f) => f.fieldType !== "textarea"),
    [fields],
  );

  // Required customer-input fields filled
  const requiredFilled = useMemo(
    () =>
      inputFields
        .filter((f) => f.required)
        .every((f) => (values[f.id] ?? "").length > 0),
    [inputFields, values],
  );

  const canAdd = flatPrice !== null && requiredFilled;

  const addItem = useCartStore((s) => s.addItem);
  const setDrawerOpen = useCartStore((s) => s.setDrawerOpen);

  function handleAddToBag() {
    if (!canAdd || flatPrice === null) return;

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
  const ctaLabel = canAdd
    ? `Add to Bag · ${formatMYR(flatPrice!)}`
    : !requiredFilled
    ? "Fill in all fields first"
    : "Enter your details";

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
                images={product.images}
                pictures={product.pictures}
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

              <div className="mb-4">
                {flatPrice !== null ? (
                  <span
                    className="inline-flex self-start items-center rounded-full px-5 py-2 text-2xl font-extrabold tracking-tight"
                    style={{
                      backgroundColor: BRAND.green,
                      color: BRAND.ink,
                      boxShadow: `0 4px 0 ${BRAND.greenDark}`,
                    }}
                  >
                    {formatMYR(flatPrice)}
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

            {/* Customer input fields — only render if any non-textarea fields exist */}
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
                Made-to-order in our Kuala Lumpur workshop. Ships in {leadDays}{" "}
                business days.
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
