"use client";

/**
 * Phase 19 (19-06) — PDP root component for made-to-order (configurable) products.
 *
 * Redesigned (ui-ux-pro-max / Claymorphism treatment):
 *   - Mobile-first: single column stack, preview card at top on mobile.
 *   - Desktop: sticky preview card (left) + scrollable form column (right).
 *   - Claymorphism: chunky rounded cards, layered shadows, ink border accents.
 *   - CTA: full-width green button, disabled state matches brand.
 *   - Sticky "Add to Bag" bar on mobile for thumb-reachable CTA.
 *
 * Functional behaviour is UNCHANGED:
 *   - handleTouch first-touch-only (single hero swap, no scroll hijack on repeat).
 *   - canAdd / requiredFilled / outOfTable logic identical.
 *   - addItem / setDrawerOpen cart wiring identical.
 *   - KeychainPreview SVG is untouched.
 */

import { useState, useMemo, useRef } from "react";
import Image from "next/image";
import { ShoppingBag, Heart } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { lookupTierPrice } from "@/lib/config-fields";
import { useCartStore } from "@/stores/cart-store";
import { ConfiguratorForm } from "@/components/store/configurator-form";
import { ConfigurableImageGallery } from "@/components/store/configurable-image-gallery";
import { KeychainPreview } from "@/components/store/keychain-preview";
import { WishlistButton } from "@/components/store/wishlist-button";
import { RatingBadge } from "@/components/store/rating-badge";
import type { PublicConfigField } from "@/lib/configurable-product-data";
import type { PictureData } from "@/lib/image-manifest";

// ============================================================================
// Types
// ============================================================================

type Props = {
  product: {
    id: string;
    name: string;
    slug: string;
    description: string;
    images: string[];
    imageCaptions?: (string | null | undefined)[];
    materialType: string | null;
    estimatedProductionDays: number | null;
    category: { name: string; slug: string } | null;
    pictures?: PictureData[];
  };
  fields: PublicConfigField[];
  maxUnitCount: number | null;
  priceTiers: Record<string, number>;
  unitField: string | null;
  isWishlistedInitial?: boolean;
  ratingAvg?: number;
  ratingCount?: number;
};

// ============================================================================
// Summary builder (unchanged)
// ============================================================================

function buildSummary(
  fields: PublicConfigField[],
  values: Record<string, string>,
  price: number,
  baseClickerColorName?: string,
): string {
  const parts: string[] = [];
  let firstColourFieldId: string | null = null;
  for (const f of fields) {
    if (f.fieldType === "colour" && firstColourFieldId === null) {
      firstColourFieldId = f.id;
    }
  }

  for (const f of fields) {
    const v = values[f.id] ?? "";
    if (!v) continue;
    if (f.fieldType === "text") {
      parts.push(`"${v}" (${v.length} ${f.label.toLowerCase()})`);
    } else if (f.fieldType === "colour") {
      const c = f.resolvedColours?.find((x) => x.id === v);
      if (c) {
        const label = f.id === firstColourFieldId ? "base & clicker" : f.label.toLowerCase();
        parts.push(`${c.name} ${label}`);
      }
    } else if (f.fieldType === "number") {
      parts.push(`${f.label}: ${v}`);
    } else if (f.fieldType === "select") {
      parts.push(`${f.label}: ${v}`);
    }
  }
  void price;
  void baseClickerColorName;
  return parts.join(" · ");
}

// ============================================================================
// Price pill
// ============================================================================

function PricePill({
  outOfTable,
  maxUnitCount,
  currentPrice,
}: {
  outOfTable: boolean;
  maxUnitCount: number | null;
  currentPrice: number | null;
}) {
  if (outOfTable) {
    return (
      <span
        className="inline-flex self-start items-center rounded-full px-4 py-1.5 text-sm font-bold"
        style={{ backgroundColor: "#fff1f2", color: "#be123c", border: "2px solid #fecdd3" }}
      >
        Max {maxUnitCount} characters
      </span>
    );
  }
  if (currentPrice !== null) {
    return (
      <span
        className="inline-flex self-start items-center rounded-full px-5 py-2 text-2xl font-extrabold tracking-tight"
        style={{
          backgroundColor: BRAND.green,
          color: BRAND.ink,
          boxShadow: `0 4px 0 ${BRAND.greenDark}`,
        }}
      >
        {formatMYR(currentPrice)}
      </span>
    );
  }
  return (
    <span
      className="inline-flex self-start items-center rounded-full px-5 py-2 text-base font-semibold"
      style={{ backgroundColor: "#f1f5f9", color: "#64748b", border: "2px solid #e2e8f0" }}
    >
      Enter your details to see price
    </span>
  );
}

// ============================================================================
// ConfigurableProductView
// ============================================================================

export function ConfigurableProductView({
  product,
  fields,
  maxUnitCount,
  priceTiers,
  unitField,
  isWishlistedInitial = false,
  ratingAvg = 0,
  ratingCount = 0,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // ── Derived state ──────────────────────────────────────────────────────────

  const unitFieldId = useMemo(() => {
    if (!unitField) return null;
    // unitField stores the config-field UUID (set by admin via tier-table-editor).
    // Match by ID — label matching was wrong and always missed, causing fallback to
    // min-tier price regardless of what the customer typed.
    const match = fields.find(
      (f) => (f.fieldType === "text" || f.fieldType === "number") && f.id === unitField,
    );
    return match?.id ?? null;
  }, [fields, unitField]);

  const unitFieldValue = unitFieldId ? (values[unitFieldId] ?? "") : "";

  const currentPrice: number | null = useMemo(() => {
    if (unitField && unitFieldId) {
      return lookupTierPrice(priceTiers, unitFieldValue);
    }
    const minKey = Object.keys(priceTiers).map(Number).sort((a, b) => a - b)[0];
    if (minKey !== undefined && priceTiers[String(minKey)] !== undefined) {
      return priceTiers[String(minKey)];
    }
    return null;
  }, [priceTiers, unitField, unitFieldId, unitFieldValue]);

  const outOfTable =
    unitField !== null &&
    unitFieldId !== null &&
    currentPrice === null &&
    unitFieldValue.length > 0 &&
    unitFieldValue.length > (maxUnitCount ?? 0);

  const requiredFilled = useMemo(
    () => fields.filter((f) => f.required).every((f) => (values[f.id] ?? "").length > 0),
    [fields, values],
  );

  const canAdd = currentPrice !== null && requiredFilled && !outOfTable;

  // ── Colour values for KeychainPreview ────────────────────────────────────
  const colourFields = useMemo(() => fields.filter((f) => f.fieldType === "colour"), [fields]);

  function resolveHex(fieldIndex: number, fallback: string): string {
    const cf = colourFields[fieldIndex];
    if (!cf) return fallback;
    const selectedId = values[cf.id];
    if (!selectedId) return fallback;
    return cf.resolvedColours?.find((c) => c.id === selectedId)?.hex ?? fallback;
  }

  const baseHex = resolveHex(0, "#71717a");
  const letterHex = resolveHex(1, "#ffffff");

  // ── Text value for preview ────────────────────────────────────────────────
  const textFields = useMemo(() => fields.filter((f) => f.fieldType === "text"), [fields]);
  const textValue = textFields.length > 0 ? (values[textFields[0].id] ?? "") : "";
  const maxLength = textFields.length > 0
    ? ((textFields[0].config as { maxLength?: number }).maxLength ?? 10)
    : 10;

  // ── Handlers (first-touch-only — DO NOT change) ───────────────────────────
  function handleTouch() {
    if (!touched) {
      setTouched(true);
      setShowPreview(true);
      previewRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  const addItem = useCartStore((s) => s.addItem);
  const setDrawerOpen = useCartStore((s) => s.setDrawerOpen);

  function handleAddToBag() {
    if (!canAdd || currentPrice === null) return;

    const firstColourField = colourFields[0];
    const baseClickerColourId = firstColourField ? (values[firstColourField.id] ?? "") : "";
    const baseClickerColourEntry = firstColourField?.resolvedColours?.find(
      (c) => c.id === baseClickerColourId,
    );
    const baseClickerColorName = baseClickerColourEntry?.name;
    const baseClickerColor = baseClickerColourEntry?.hex;

    const summary = buildSummary(fields, values, currentPrice, baseClickerColorName);
    const configurationData = {
      values,
      computedPrice: currentPrice,
      computedSummary: summary,
      ...(baseClickerColor ? { baseClickerColor } : {}),
      ...(baseClickerColorName ? { baseClickerColorName } : {}),
    };
    addItem({ productId: product.id, configurationData });
    setDrawerOpen(true);
  }

  const material = product.materialType ?? "PLA";
  const leadDays = product.estimatedProductionDays ?? 7;

  // ── Preview node (passed to gallery) ─────────────────────────────────────
  const previewNode = (
    <div
      ref={previewRef}
      className="flex w-full items-center justify-center py-6 sm:py-10 overflow-x-auto"
      style={{ minHeight: 240 }}
    >
      <KeychainPreview
        text={textValue}
        baseHex={baseHex}
        letterHex={letterHex}
        maxLength={maxLength}
      />
    </div>
  );

  // ── CTA button label ──────────────────────────────────────────────────────
  const ctaLabel = canAdd
    ? `Add to Bag · ${formatMYR(currentPrice!)}`
    : outOfTable
    ? "Too many characters"
    : !requiredFilled
    ? "Fill in all fields first"
    : "Enter your details";

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream }}
    >
      {/* ── Page width container ─────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 md:py-10">

        {/* ── Breadcrumb / category link ─────────────────────────────────── */}
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

        {/* ── Two-column layout ─────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-2 gap-6 lg:gap-12 items-start">

          {/* ── LEFT: Gallery card (sticky on desktop) ─────────────────── */}
          <div className="lg:sticky lg:top-24">
            {/* Hero gallery card — Claymorphism: white bg + chunky shadow + thick border */}
            <div
              className="rounded-3xl overflow-hidden"
              style={{
                background: "#ffffff",
                border: `2.5px solid ${BRAND.ink}18`,
                boxShadow: `0 8px 0 ${BRAND.ink}12, 0 20px 40px ${BRAND.ink}10`,
              }}
            >
              {/* Inner padding for the gallery */}
              <div className="p-4 pb-0">
                <ConfigurableImageGallery
                  displayImages={product.images}
                  imageCaptions={product.imageCaptions}
                  pictures={product.pictures}
                  showPreview={showPreview}
                  onTogglePreview={setShowPreview}
                  previewSlot={previewNode}
                />
              </div>

              {/* Preview hint strip at bottom of gallery card */}
              {!showPreview && (
                <div
                  className="px-4 py-3 mt-3 text-center text-xs font-semibold"
                  style={{ color: BRAND.blue, backgroundColor: `${BRAND.blue}08` }}
                >
                  Type your name below to see your live preview
                </div>
              )}
              {showPreview && (
                <div
                  className="px-4 py-3 mt-3 text-center text-xs font-semibold"
                  style={{ color: BRAND.green, backgroundColor: `${BRAND.green}08` }}
                >
                  This is your personalised keychain
                </div>
              )}
            </div>

            {/* Trust signal — visible on desktop below gallery, above fold */}
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

          {/* ── RIGHT: Product info + form column ─────────────────────── */}
          <div className="flex flex-col gap-5 min-w-0">

            {/* ── Product header card ─────────────────────────────────── */}
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

              {/* Price pill */}
              <div className="mb-4">
                <PricePill
                  outOfTable={outOfTable}
                  maxUnitCount={maxUnitCount}
                  currentPrice={currentPrice}
                />
              </div>

              <p className="text-base leading-relaxed" style={{ color: "#374151" }}>
                {product.description}
              </p>
            </div>

            {/* ── Personalise section card ────────────────────────────── */}
            <div
              className="rounded-3xl p-5 sm:p-6"
              style={{
                background: "#ffffff",
                border: `2.5px solid ${BRAND.ink}12`,
                boxShadow: `0 6px 0 ${BRAND.ink}0e, 0 16px 32px ${BRAND.ink}0a`,
              }}
            >
              {/* Section header */}
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
                  Personalise Your Keychain
                </h2>
              </div>

              <ConfiguratorForm
                fields={fields}
                values={values}
                onChange={setValues}
                onTouch={handleTouch}
                baseClickerFieldId={colourFields[0]?.id}
              />
            </div>

            {/* ── Add to bag card ─────────────────────────────────────── */}
            <div
              className="rounded-3xl p-5 sm:p-6"
              style={{
                background: canAdd ? `${BRAND.green}08` : "#f8fafc",
                border: `2.5px solid ${canAdd ? BRAND.green : BRAND.ink + "10"}`,
                boxShadow: `0 6px 0 ${canAdd ? BRAND.greenDark + "30" : BRAND.ink + "0a"}, 0 16px 32px ${BRAND.ink}06`,
                transition: "background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
              }}
            >
              {/* Wishlist + Add to bag row */}
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
                    transform: "translateY(0)",
                  }}
                  onMouseDown={(e) => {
                    if (canAdd) {
                      (e.currentTarget as HTMLButtonElement).style.transform = "translateY(2px)";
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 2px 0 ${BRAND.greenDark}, 0 4px 12px ${BRAND.green}30`;
                    }
                  }}
                  onMouseUp={(e) => {
                    if (canAdd) {
                      (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 0 ${BRAND.greenDark}, 0 8px 24px ${BRAND.green}40`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (canAdd) {
                      (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 0 ${BRAND.greenDark}, 0 8px 24px ${BRAND.green}40`;
                    }
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

              {/* Contextual hint below CTA */}
              {!canAdd && !outOfTable && (
                <p className="mt-3 text-xs text-center font-medium" style={{ color: "#64748b" }}>
                  {requiredFilled
                    ? "Enter your name to unlock the price"
                    : "Fill in all required fields above to continue"}
                </p>
              )}
            </div>

            {/* ── Trust + shipping row ─────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Shipping info */}
              <div
                className="flex-1 flex items-center gap-3 rounded-2xl px-4 py-3.5"
                style={{
                  backgroundColor: `${BRAND.blue}0f`,
                  border: `1.5px solid ${BRAND.blue}25`,
                }}
              >
                <span className="text-xl shrink-0" aria-hidden="true">
                  <Image
                    src="/icons/ninja/emoji/secure@128.png"
                    alt=""
                    width={28}
                    height={28}
                    className="h-7 w-7 object-contain"
                  />
                </span>
                <p className="text-sm font-medium leading-snug" style={{ color: BRAND.ink }}>
                  <span className="font-bold block">Made to order</span>
                  Ships in {leadDays} business days from KL
                </p>
              </div>

              {/* PayPal secure */}
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

            {/* ── Material & craft card ────────────────────────────────── */}
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
                Every piece is printed to order on our Kuala Lumpur printers, layer by ninja layer.
                Hand-finished, inspected, then shipped straight to your door.
              </p>
            </div>

          </div>
          {/* end right column */}
        </div>
        {/* end grid */}
      </div>

      {/* ── Sticky mobile CTA bar ────────────────────────────────────────── */}
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

      {/* Spacer so sticky bar doesn't cover last card on mobile */}
      <div className="lg:hidden h-24" aria-hidden="true" />
    </div>
  );
}
