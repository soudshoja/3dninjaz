"use client";

/**
 * Phase 19 (19-06) — PDP root component for made-to-order (configurable) products.
 *
 * Orchestrates:
 *   - ConfigurableImageGallery — hero + thumbstrip; auto-swaps to live preview
 *     on first text input or colour pick (D-10).
 *   - ConfiguratorForm — type-dispatched inputs (text/number/colour/select).
 *   - KeychainPreview — generic SVG name-strip live preview.
 *   - Price meter — reads tier via lookupTierPrice; "outOfTable" / "Enter
 *     details" / "MYR X" states.
 *   - Add-to-bag button — disabled until all required fields filled + price
 *     resolved. Builds configurationData payload (Plan 19-08 wires cart store).
 *
 * D-11: configurationData payload is built here; cart addConfigurableItem stub
 * is intentionally a console.info until Plan 19-08 wires the cart store.
 *
 * D-14 backwards compat: this component is only mounted when
 * `product.productType === "configurable"`. The stocked variant flow in
 * product-detail.tsx is completely untouched.
 */

import { useState, useMemo } from "react";
import Image from "next/image";
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
// Summary builder
// ============================================================================

function buildSummary(
  fields: PublicConfigField[],
  values: Record<string, string>,
  price: number,
): string {
  const parts: string[] = [];
  for (const f of fields) {
    const v = values[f.id] ?? "";
    if (!v) continue;
    if (f.fieldType === "text") {
      parts.push(`"${v}" (${v.length} ${f.label.toLowerCase()})`);
    } else if (f.fieldType === "colour") {
      const c = f.resolvedColours?.find((x) => x.id === v);
      if (c) parts.push(`${c.name} ${f.label.toLowerCase()}`);
    } else if (f.fieldType === "number") {
      parts.push(`${f.label}: ${v}`);
    } else if (f.fieldType === "select") {
      parts.push(`${f.label}: ${v}`);
    }
  }
  void price; // price is included in computedPrice field, not inline summary
  return parts.join(" · ");
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

  // ── Derived state ──────────────────────────────────────────────────────────

  // The text value from the field that drives the tier lookup (unitField).
  // For keychains this is the "Your name" text field value.
  const unitFieldId = useMemo(() => {
    if (!unitField) return null;
    const match = fields.find(
      (f) => f.fieldType === "text" && f.label.toLowerCase() === unitField.toLowerCase(),
    );
    return match?.id ?? null;
  }, [fields, unitField]);

  const unitFieldValue = unitFieldId ? (values[unitFieldId] ?? "") : "";

  // Price: if unitField is configured, look up by value length; else use tier "1"
  const currentPrice: number | null = useMemo(() => {
    if (unitField && unitFieldId) {
      return lookupTierPrice(priceTiers, unitFieldValue);
    }
    // No unit-driven lookup — use tier "1" as a flat price
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
  // Pull baseHex from the first colour field, letterHex from the second.
  const colourFields = useMemo(() => fields.filter((f) => f.fieldType === "colour"), [fields]);

  function resolveHex(fieldIndex: number, fallback: string): string {
    const cf = colourFields[fieldIndex];
    if (!cf) return fallback;
    const selectedId = values[cf.id];
    if (!selectedId) return fallback;
    return cf.resolvedColours?.find((c) => c.id === selectedId)?.hex ?? fallback;
  }

  const baseHex = resolveHex(0, "#71717a"); // zinc-500
  const letterHex = resolveHex(1, "#ffffff"); // white

  // ── Text value for preview ────────────────────────────────────────────────
  const textFields = useMemo(() => fields.filter((f) => f.fieldType === "text"), [fields]);
  const textValue = textFields.length > 0 ? (values[textFields[0].id] ?? "") : "";
  const maxLength = textFields.length > 0
    ? ((textFields[0].config as { maxLength?: number }).maxLength ?? 10)
    : 10;

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleTouch() {
    if (!touched) {
      setTouched(true);
      setShowPreview(true);
    }
  }

  const addItem = useCartStore((s) => s.addItem);
  const setDrawerOpen = useCartStore((s) => s.setDrawerOpen);

  function handleAddToBag() {
    if (!canAdd || currentPrice === null) return;
    const summary = buildSummary(fields, values, currentPrice);
    const configurationData = {
      values,
      computedPrice: currentPrice,
      computedSummary: summary,
    };
    // Phase 19 (19-08): wire cart store — same config hash dedupes qty
    addItem({ productId: product.id, configurationData });
    setDrawerOpen(true);
  }

  const material = product.materialType ?? "PLA";
  const leadDays = product.estimatedProductionDays ?? 7;

  // ── Render ────────────────────────────────────────────────────────────────

  const previewNode = (
    <KeychainPreview
      text={textValue}
      baseHex={baseHex}
      letterHex={letterHex}
      maxLength={maxLength}
    />
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 md:py-16 grid lg:grid-cols-2 gap-10 md:gap-14">
      {/* ── Gallery column ── */}
      <div>
        <ConfigurableImageGallery
          displayImages={product.images}
          pictures={product.pictures}
          showPreview={showPreview}
          onTogglePreview={setShowPreview}
          previewSlot={previewNode}
        />
      </div>

      {/* ── Form column ── */}
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

        {/* ── Price meter card ── */}
        <div
          className="inline-flex self-start rounded-full px-5 py-2 text-lg font-bold mb-6"
          style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
        >
          {outOfTable ? (
            <span className="text-base font-semibold" style={{ color: "#be123c" }}>
              Maximum {maxUnitCount} characters reached
            </span>
          ) : currentPrice !== null ? (
            <span>{formatMYR(currentPrice)}</span>
          ) : (
            <span className="text-base font-medium text-zinc-500">Enter your details</span>
          )}
        </div>

        <p className="text-base leading-relaxed mb-6 text-zinc-700">{product.description}</p>

        {/* ── Configurator form ── */}
        <div className="mb-6">
          <ConfiguratorForm
            fields={fields}
            values={values}
            onChange={setValues}
            onTouch={handleTouch}
          />
        </div>

        {/* ── Add to bag + wishlist ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <button
              type="button"
              disabled={!canAdd}
              onClick={handleAddToBag}
              className="w-full rounded-2xl px-6 py-4 text-base font-extrabold uppercase tracking-wide transition-all"
              style={{
                backgroundColor: canAdd ? BRAND.green : "#e2e8f0",
                color: canAdd ? BRAND.ink : "#94a3b8",
                cursor: canAdd ? "pointer" : "not-allowed",
                minHeight: 52,
              }}
            >
              {canAdd
                ? `Add to bag · ${formatMYR(currentPrice!)}`
                : outOfTable
                ? "Too many characters"
                : !requiredFilled
                ? "Fill in all fields"
                : "Enter your details"}
            </button>
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
          Made to order — ships in {leadDays} business days from Kuala Lumpur.
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
