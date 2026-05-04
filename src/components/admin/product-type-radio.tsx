"use client";

import { Package, Wand2, Link, Boxes, FileText, Check, AlertCircle, Info } from "lucide-react";
import { BRAND } from "@/lib/brand";

// ============================================================================
// Phase 19-03 — Product type radio cards
// Renders five-card radio for Stocked / Made-to-Order / Keyboard Clicker /
// Vending Machine / Simple at the top of the product form. Locked state shows
// a yellow info banner and disables all cards (used when a product already has
// variants or config fields).
//
// Quick task 260430-icx — extended to 5 cards with `Simple` (5th card).
// Grid: 1-col (mobile) → 2-col (sm 640px+) → 3-col (lg 1024px+) → 5-col (xl 1280px+)
// Equal-height cards via auto-rows-fr + flex-col on card interior.
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

type CardDef = {
  id: ProductTypeValue;
  icon: React.ReactNode;
  label: string;
  description: string;
};

const CARDS: CardDef[] = [
  {
    id: "stocked",
    icon: <Package className="h-5 w-5" />,
    label: "Stocked",
    description:
      "Pre-made products with size/colour variants. Customers pick a variant and we ship from stock.",
  },
  {
    id: "configurable",
    icon: <Wand2 className="h-5 w-5" />,
    label: "Made-to-Order",
    description:
      "Customisable print-on-demand products. Customers fill a form (name/colour/etc.) and we make each one.",
  },
  {
    id: "keychain",
    icon: <Link className="h-5 w-5" />,
    label: "Keyboard Clicker",
    description:
      "Name + 3 colours (base / clicker / letter), tier pricing per character. Pre-seeded fields — fully editable.",
  },
  {
    id: "vending",
    icon: <Boxes className="h-5 w-5" />,
    label: "Vending Machine",
    description:
      "2 colours (primary / secondary), flat price. Pre-seeded fields — admin sets allowed colours from the gallery.",
  },
  {
    id: "simple",
    icon: <FileText className="h-5 w-5" />,
    label: "Simple",
    description:
      "Flat price. Add free-form fields (text/number/colour/select/rich-text). No auto-seeded fields — fully admin-curated.",
  },
];

export function ProductTypeRadio({
  value,
  onChange,
  locked = false,
  lockedReason,
  switchInfo,
}: Props) {
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

      {/*
        Responsive radio grid:
          - mobile (<640px): 1 col, full-width cards
          - sm (640px+): 2 cols
          - lg (1024px+): 3 cols
          - xl (1280px+): 5 cols
        auto-rows-fr ensures all cards in a row share the same height.
      */}
      <div
        role="radiogroup"
        aria-label="Product type"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
        style={{ gridAutoRows: "1fr" }}
      >
        {CARDS.map((card) => {
          const selected = value === card.id;
          return (
            <button
              key={card.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-pressed={selected}
              disabled={locked}
              onClick={() => {
                if (!locked) onChange(card.id);
              }}
              className={[
                "relative flex flex-col gap-3 rounded-2xl text-left",
                "p-4 md:p-5",
                "outline-none",
                "transition-all duration-150",
                "focus-visible:ring-2 focus-visible:ring-offset-2",
                "min-h-[44px]",
              ].join(" ")}
              style={{
                border: selected ? `2px solid ${BRAND.green}` : "1px solid #E4E4E7",
                background: selected ? `${BRAND.green}12` : BRAND.cream,
                cursor: locked ? "not-allowed" : "pointer",
                opacity: locked ? 0.6 : 1,
                boxShadow: selected
                  ? `0 0 0 0 transparent`
                  : "0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.04)",
              }}
              onMouseEnter={(e) => {
                if (!locked && !selected) {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow =
                    "0 4px 12px 0 rgba(0,0,0,0.10), 0 2px 4px -1px rgba(0,0,0,0.06)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#D1D5DB";
                }
              }}
              onMouseLeave={(e) => {
                if (!locked && !selected) {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow =
                    "0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.04)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#E4E4E7";
                }
              }}
            >
              {/* Selected check badge — top-right */}
              {selected && (
                <span
                  className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full"
                  style={{ backgroundColor: BRAND.green }}
                  aria-hidden
                >
                  <Check className="h-3 w-3 text-white" />
                </span>
              )}

              {/* Icon block */}
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: selected ? BRAND.green : "#ECEEF0",
                  color: selected ? "white" : BRAND.ink,
                }}
                aria-hidden
              >
                {card.icon}
              </span>

              {/* Text block — grows to fill remaining card height */}
              <span className="flex flex-col gap-1 flex-1">
                <span
                  className="font-semibold text-sm leading-snug"
                  style={{ color: BRAND.ink }}
                >
                  {card.label}
                </span>
                <span
                  className="text-xs leading-relaxed line-clamp-3"
                  style={{ color: "#52525B" }}
                >
                  {card.description}
                </span>
              </span>
            </button>
          );
        })}
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
