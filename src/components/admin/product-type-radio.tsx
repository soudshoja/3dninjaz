"use client";

import { Package, Wand2, Check, AlertCircle } from "lucide-react";
import { BRAND } from "@/lib/brand";

// ============================================================================
// Phase 19-03 — Product type radio cards
// Renders two-card radio for Stocked vs Made-to-Order at the top of the
// product form. Locked state shows a yellow info banner and disables both
// cards (used when a product already has variants or config fields attached).
// ============================================================================

type Props = {
  value: "stocked" | "configurable";
  onChange: (v: "stocked" | "configurable") => void;
  /** When true, render disabled state + the explanation message. */
  locked?: boolean;
  lockedReason?: string;
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
}: Props) {
  const stockedSelected = value === "stocked";
  const configurableSelected = value === "configurable";

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

      {/* Radio group — two cards side-by-side (md:grid-cols-2; 1-col mobile) */}
      <div
        role="radiogroup"
        aria-label="Product type"
        className="grid gap-3 md:grid-cols-2"
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
      </div>
    </div>
  );
}
