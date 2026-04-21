"use client";

import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";

type Variant = {
  id: string;
  size: "S" | "M" | "L";
  price: string;
  // Phase 5 05-04 — legacy boolean toggle (kept for back-compat).
  inStock?: boolean;
  // Phase 13 — optional stock tracking. When trackStock=false (default/on-demand)
  // the variant is always available regardless of stock value.
  trackStock?: boolean;
  stock?: number;
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
          // Phase 13: sold-out only when trackStock=true AND stock<=0.
          // On-demand variants (trackStock=false, the default) are never sold out.
          // Falls back to legacy inStock boolean for rows that haven't been
          // migrated yet (back-compat).
          const soldOut = v.trackStock === true
            ? (v.stock ?? 0) <= 0
            : v.inStock === false;
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
