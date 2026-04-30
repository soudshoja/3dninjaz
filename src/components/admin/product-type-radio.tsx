"use client";

import { Package, Wand2, Link, Boxes, FileText, Check, AlertCircle, Info } from "lucide-react";
import { BRAND } from "@/lib/brand";

// ============================================================================
// Phase 19-03 — Product type radio cards
// Renders four-card radio for Stocked / Made-to-Order / Keyboard Clicker /
// Vending Machine at the top of the product form. Locked state shows a yellow
// info banner and disables all cards (used when a product already has variants
// or config fields).
//
// Quick task 260430-icx — extended to 5 cards with `Simple` (5th card).
// Grid widened from lg:grid-cols-4 to lg:grid-cols-5.
//
// Type-guard fix — perCardWarnings enables per-card amber warnings for
// destructive-only transitions (e.g. configurable-like → stocked deletes
// fields). Non-destructive transitions (configLike ↔ configLike) are always
// free — no warning shown.
// ============================================================================

type ProductTypeValue = "stocked" | "configurable" | "keychain" | "vending" | "simple";

type Props = {
  value: ProductTypeValue;
  onChange: (v: ProductTypeValue) => void;
  /** When true, render disabled state + the explanation message. */
  locked?: boolean;
  lockedReason?: string;
  /**
   * Optional info note shown UNDER the radio grid — e.g. "X variants stay in DB".
   * Per "keep all data and switch" directive: switches never destroy data, so
   * this is informational only (not a warning, not a blocker).
   */
  switchInfo?: string;
};

function SelectedBadge() {
  return (
    <span
      className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full"
      style={{ backgroundColor: BRAND.green }}
      aria-hidden
    >
      <Check className="h-3 w-3 text-white" />
    </span>
  );
}

export function ProductTypeRadio({
  value,
  onChange,
  locked = false,
  lockedReason,
  switchInfo,
}: Props) {
  const stockedSelected = value === "stocked";
  const configurableSelected = value === "configurable";
  const keychainSelected = value === "keychain";
  const vendingSelected = value === "vending";
  const simpleSelected = value === "simple";

  return (
    <div>
      {/* Locked banner — shown when type cannot be changed */}
      {locked && lockedReason && (
        <div
          role="alert"
          className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2 items-start"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
          <span>{lockedReason}</span>
        </div>
      )}

      {/* Radio group — five cards (md:grid-cols-2 lg:grid-cols-5; 1-col mobile)
          Quick task 260430-icx — widened to 5 cards. */}
      <div
        role="radiogroup"
        aria-label="Product type"
        className="grid gap-3 md:grid-cols-2 lg:grid-cols-5"
      >
        {/* Card 1: Stocked */}
        <button
          type="button"
          role="radio"
          aria-checked={stockedSelected}
          disabled={locked}
          onClick={() => { if (!locked) onChange("stocked"); }}
          className="relative flex items-start gap-3 rounded-xl p-4 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-offset-2 min-h-[48px]"
          style={{
            border: stockedSelected ? `2px solid ${BRAND.green}` : "1px solid #E4E4E7",
            background: stockedSelected ? `${BRAND.green}0D` : "white",
            cursor: locked ? "not-allowed" : "pointer",
            opacity: locked ? 0.6 : 1,
          }}
        >
          {stockedSelected && <SelectedBadge />}
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: stockedSelected ? BRAND.green : "#F4F4F5",
              color: stockedSelected ? "white" : BRAND.ink,
            }}
            aria-hidden
          >
            <Package className="h-5 w-5" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span
              className="font-display text-sm font-semibold leading-tight"
              style={{ color: BRAND.ink }}
            >
              Stocked
            </span>
            <span className="text-xs leading-relaxed" style={{ color: "#52525B" }}>
              Pre-made products with size/colour variants. Customers pick a variant and we ship from stock.
            </span>
          </span>
        </button>

        {/* Card 2: Made-to-Order */}
        <button
          type="button"
          role="radio"
          aria-checked={configurableSelected}
          disabled={locked}
          onClick={() => { if (!locked) onChange("configurable"); }}
          className="relative flex items-start gap-3 rounded-xl p-4 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-offset-2 min-h-[48px]"
          style={{
            border: configurableSelected ? `2px solid ${BRAND.green}` : "1px solid #E4E4E7",
            background: configurableSelected ? `${BRAND.green}0D` : "white",
            cursor: locked ? "not-allowed" : "pointer",
            opacity: locked ? 0.6 : 1,
          }}
        >
          {configurableSelected && <SelectedBadge />}
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: configurableSelected ? BRAND.green : "#F4F4F5",
              color: configurableSelected ? "white" : BRAND.ink,
            }}
            aria-hidden
          >
            <Wand2 className="h-5 w-5" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span
              className="font-display text-sm font-semibold leading-tight"
              style={{ color: BRAND.ink }}
            >
              Made-to-Order
            </span>
            <span className="text-xs leading-relaxed" style={{ color: "#52525B" }}>
              Customisable print-on-demand products. Customers fill a form (name/colour/etc.) and we make each one.
            </span>
          </span>
        </button>

        {/* Card 3: Keyboard Clicker (internal enum value: 'keychain') */}
        <button
          type="button"
          role="radio"
          aria-checked={keychainSelected}
          disabled={locked}
          onClick={() => { if (!locked) onChange("keychain"); }}
          className="relative flex items-start gap-3 rounded-xl p-4 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-offset-2 min-h-[48px]"
          style={{
            border: keychainSelected ? `2px solid ${BRAND.green}` : "1px solid #E4E4E7",
            background: keychainSelected ? `${BRAND.green}0D` : "white",
            cursor: locked ? "not-allowed" : "pointer",
            opacity: locked ? 0.6 : 1,
          }}
        >
          {keychainSelected && <SelectedBadge />}
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: keychainSelected ? BRAND.green : "#F4F4F5",
              color: keychainSelected ? "white" : BRAND.ink,
            }}
            aria-hidden
          >
            <Link className="h-5 w-5" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span
              className="font-display text-sm font-semibold leading-tight"
              style={{ color: BRAND.ink }}
            >
              Keyboard Clicker
            </span>
            <span className="text-xs leading-relaxed" style={{ color: "#52525B" }}>
              Name + 3 colours (base / clicker / letter), tier pricing per character. Pre-seeded fields — fully editable.
            </span>
          </span>
        </button>

        {/* Card 4: Vending Machine */}
        <button
          type="button"
          role="radio"
          aria-checked={vendingSelected}
          disabled={locked}
          onClick={() => { if (!locked) onChange("vending"); }}
          className="relative flex items-start gap-3 rounded-xl p-4 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-offset-2 min-h-[48px]"
          style={{
            border: vendingSelected ? `2px solid ${BRAND.green}` : "1px solid #E4E4E7",
            background: vendingSelected ? `${BRAND.green}0D` : "white",
            cursor: locked ? "not-allowed" : "pointer",
            opacity: locked ? 0.6 : 1,
          }}
        >
          {vendingSelected && <SelectedBadge />}
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: vendingSelected ? BRAND.green : "#F4F4F5",
              color: vendingSelected ? "white" : BRAND.ink,
            }}
            aria-hidden
          >
            <Boxes className="h-5 w-5" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span
              className="font-display text-sm font-semibold leading-tight"
              style={{ color: BRAND.ink }}
            >
              Vending Machine
            </span>
            <span className="text-xs leading-relaxed" style={{ color: "#52525B" }}>
              2 colours (primary / secondary), flat price. Pre-seeded fields — admin sets allowed colours from the gallery.
            </span>
          </span>
        </button>

        {/* Card 5: Simple — quick task 260430-icx */}
        <button
          type="button"
          role="radio"
          aria-checked={simpleSelected}
          disabled={locked}
          onClick={() => { if (!locked) onChange("simple"); }}
          className="relative flex items-start gap-3 rounded-xl p-4 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-offset-2 min-h-[48px]"
          style={{
            border: simpleSelected ? `2px solid ${BRAND.green}` : "1px solid #E4E4E7",
            background: simpleSelected ? `${BRAND.green}0D` : "white",
            cursor: locked ? "not-allowed" : "pointer",
            opacity: locked ? 0.6 : 1,
          }}
        >
          {simpleSelected && <SelectedBadge />}
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: simpleSelected ? BRAND.green : "#F4F4F5",
              color: simpleSelected ? "white" : BRAND.ink,
            }}
            aria-hidden
          >
            <FileText className="h-5 w-5" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span
              className="font-display text-sm font-semibold leading-tight"
              style={{ color: BRAND.ink }}
            >
              Simple
            </span>
            <span className="text-xs leading-relaxed" style={{ color: "#52525B" }}>
              Flat price. Add free-form fields (text/number/colour/select/rich-text). No auto-seeded fields — fully admin-curated.
            </span>
          </span>
        </button>
      </div>

      {/* Info note — appears when there's data on the product that won't show
          under all types (variants for non-stocked, fields for stocked).
          Switching is always allowed; data is preserved either way. */}
      {!locked && switchInfo && (
        <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 flex gap-2 items-start">
          <Info className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
          <span>{switchInfo}</span>
        </div>
      )}
    </div>
  );
}
