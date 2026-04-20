"use client";

import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";

type Variant = {
  id: string;
  size: "S" | "M" | "L";
  price: string;
  // Phase 5 05-04 — per-variant inventory toggle (INV-01). Optional so this
  // component is backwards-compatible with callers that haven't passed the
  // field through yet.
  inStock?: boolean;
};

const SIZE_LABEL: Record<Variant["size"], string> = {
  S: "Small",
  M: "Medium",
  L: "Large",
};

const ACCENTS: Record<Variant["size"], string> = {
  S: BRAND.blue,
  M: BRAND.green,
  L: BRAND.purple,
};

/**
 * Three chunky pill chips (D2-11). Renders only sizes that have a variant
 * row — so a product with only M doesn't render empty S / L slots.
 *
 * Uses the native ARIA radiogroup / radio pattern so screen readers
 * announce the selection group correctly.
 *
 * Phase 5 05-04: when a variant has inStock=false, the chip is greyed out,
 * onClick is suppressed, aria-disabled=true, and a "Sold out" helper text
 * appears under the price.
 */
export function SizeSelector({
  variants,
  selectedSize,
  onSelect,
}: {
  variants: Variant[];
  selectedSize: Variant["size"] | null;
  onSelect: (size: Variant["size"]) => void;
}) {
  if (!variants.length) {
    return <p className="text-slate-600">Currently unavailable.</p>;
  }
  return (
    <div>
      <p
        className="text-xs tracking-[0.2em] font-bold mb-3"
        style={{ color: BRAND.ink }}
      >
        PICK YOUR SIZE
      </p>
      <ul className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Size">
        {variants.map((v) => {
          const isSelected = selectedSize === v.size;
          const accent = ACCENTS[v.size];
          // inStock undefined → treat as in-stock (back-compat). Only an
          // explicit false greys the chip out.
          const soldOut = v.inStock === false;
          return (
            <li key={v.id}>
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-disabled={soldOut}
                disabled={soldOut}
                onClick={() => {
                  if (soldOut) return;
                  onSelect(v.size);
                }}
                className="w-full rounded-[20px] py-4 px-3 font-bold transition border-2 flex flex-col items-center gap-1 min-h-[60px] disabled:cursor-not-allowed"
                style={{
                  backgroundColor: soldOut
                    ? "#f1f5f9"
                    : isSelected
                      ? accent
                      : "white",
                  color: soldOut
                    ? "#94a3b8"
                    : isSelected
                      ? "white"
                      : BRAND.ink,
                  borderColor: soldOut
                    ? "#cbd5e1"
                    : isSelected
                      ? accent
                      : "#D4D4D8", // zinc-300
                  boxShadow: soldOut
                    ? "none"
                    : isSelected
                      ? `0 4px 0 rgba(11,16,32,0.18)`
                      : "0 2px 0 rgba(11,16,32,0.08)",
                }}
              >
                <span className="font-[var(--font-heading)] text-3xl">{v.size}</span>
                <span className="text-sm opacity-90">{SIZE_LABEL[v.size]}</span>
                <span className="text-sm font-bold mt-1">
                  {soldOut ? "Sold out" : formatMYR(v.price)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
