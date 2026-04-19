"use client";

import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";

type Variant = {
  id: string;
  size: "S" | "M" | "L";
  price: string;
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
          return (
            <li key={v.id}>
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSelect(v.size)}
                className="w-full rounded-[20px] py-4 px-3 font-bold transition border-2 flex flex-col items-center gap-1 min-h-[60px]"
                style={{
                  backgroundColor: isSelected ? accent : "white",
                  color: isSelected ? "white" : BRAND.ink,
                  borderColor: isSelected ? accent : BRAND.ink,
                  boxShadow: isSelected
                    ? `0 6px 0 rgba(0,0,0,0.35)`
                    : "0 3px 0 rgba(0,0,0,0.15)",
                }}
              >
                <span className="font-[var(--font-heading)] text-3xl">{v.size}</span>
                <span className="text-sm opacity-90">{SIZE_LABEL[v.size]}</span>
                <span className="text-sm font-bold mt-1">{formatMYR(v.price)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
