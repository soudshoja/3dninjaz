"use client";

/**
 * Phase 16 — Generic N-option variant selector.
 *
 * Renders swatches for Color options (when swatchHex set on ≥1 value),
 * pill buttons for all other options. Supports 1..3 options.
 *
 * Unavailable combos (no matching variant OR inStock=false when trackStock=true)
 * render in disabled state.
 *
 * Mobile-first: 48px min tap targets (Phase 2 D-04).
 */

import { useMemo, useState, useEffect } from "react";
import type { HydratedOption, HydratedVariant } from "@/lib/variants";

/** A variant is OOS when admin disabled it (inStock=false) OR it tracks stock
 * and is depleted (trackStock=true AND stock<=0). */
function isVariantOOS(v: HydratedVariant): boolean {
  return !v.inStock || (v.trackStock === true && (v.stock ?? 0) <= 0);
}

/** A variant is hidden from the selector when it is OOS AND allow_preorder=FALSE. */
function isVariantHidden(v: HydratedVariant): boolean {
  return isVariantOOS(v) && v.allowPreorder !== true;
}

interface VariantSelectorProps {
  options: HydratedOption[];
  variants: HydratedVariant[];
  onVariantChange: (variant: HydratedVariant | null) => void;
}

type SelectedValues = [string | null, string | null, string | null];

/** True when the variant is in stock OR (Phase 18) preorderable. */
function isVariantAvailable(v: HydratedVariant): boolean {
  // An OOS variant is only "available" (clickable) if preorder is allowed.
  if (isVariantOOS(v)) return v.allowPreorder === true;
  return true;
}

function findMatchingVariant(
  variants: HydratedVariant[],
  selected: SelectedValues,
): HydratedVariant | null {
  return (
    variants.find(
      (v) =>
        v.optionValueIds[0] === selected[0] &&
        v.optionValueIds[1] === selected[1] &&
        v.optionValueIds[2] === selected[2],
    ) ?? null
  );
}

export function VariantSelector({
  options,
  variants: rawVariants,
  onVariantChange,
}: VariantSelectorProps) {
  // Phase 18 — filter out hidden variants (OOS tracked without preorder).
  const variants = useMemo(
    () => rawVariants.filter((v) => !isVariantHidden(v)),
    [rawVariants],
  );

  // Derive which option values still have at least one visible variant.
  // An option value is hidden when every variant using it is hidden.
  const visibleValueIds = useMemo(() => {
    const set = new Set<string>();
    for (const v of variants) {
      for (const vid of v.optionValueIds) {
        if (vid) set.add(vid);
      }
    }
    return set;
  }, [variants]);

  // Initial selection: Phase 17 — prefer admin-marked default, then first
  // available, then first variant (AD-05).
  const defaultSelected = useMemo<SelectedValues>(() => {
    // 1. Explicit default — only if not hidden
    const def = variants.find((v) => v.isDefault);
    if (def) return [...def.optionValueIds] as SelectedValues;
    // 2. First available
    const available = variants.find(isVariantAvailable);
    if (available) return [...available.optionValueIds] as SelectedValues;
    // 3. First variant
    const first = variants[0] ?? null;
    if (!first) return [null, null, null];
    return [...first.optionValueIds] as SelectedValues;
  }, [variants]);

  const [selected, setSelected] = useState<SelectedValues>(defaultSelected);

  // Notify parent on mount and whenever selection changes
  useEffect(() => {
    const variant = findMatchingVariant(variants, selected);
    onVariantChange(variant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected[0], selected[1], selected[2]]);

  if (options.length === 0) return null;

  const handleSelect = (slotIdx: number, valueId: string) => {
    setSelected((prev) => {
      const next: SelectedValues = [...prev] as SelectedValues;
      next[slotIdx] = valueId;
      // When a value in an earlier slot changes, try to keep later slots valid
      // by picking the first available value for those slots
      return next;
    });
  };

  return (
    <div className="space-y-4 mb-6">
      {options.map((option, slotIdx) => {
        const currentValueId = selected[slotIdx];
        // Phase 18 — strip values that have no visible variant.
        const visibleValues = option.values.filter((v) => visibleValueIds.has(v.id));
        if (visibleValues.length === 0) return null;
        const isColorOption = visibleValues.some((v) => v.swatchHex);

        return (
          <div key={option.id}>
            <p className="text-xs tracking-[0.2em] font-bold mb-2 text-[var(--color-brand-ink)]">
              {option.name.toUpperCase()}
              {currentValueId && (
                <span className="ml-2 normal-case tracking-normal font-medium text-[var(--color-brand-text-muted)]">
                  : {visibleValues.find((v) => v.id === currentValueId)?.value}
                </span>
              )}
            </p>

            {isColorOption ? (
              // Swatch buttons for color options
              <div className="flex flex-wrap gap-2">
                {visibleValues.map((val) => {
                  // Build test selection to check availability
                  const testSelected: SelectedValues = [...selected] as SelectedValues;
                  testSelected[slotIdx] = val.id;
                  const matchingVariant = findMatchingVariant(variants, testSelected);
                  const available = matchingVariant ? isVariantAvailable(matchingVariant) : false;
                  const isSelected = currentValueId === val.id;

                  return (
                    <button
                      key={val.id}
                      type="button"
                      onClick={() => { if (available) handleSelect(slotIdx, val.id); }}
                      disabled={!available}
                      aria-disabled={!available}
                      tabIndex={!available ? -1 : 0}
                      title={!available ? "Out of stock" : val.value}
                      aria-label={`${val.value}${!available ? " (out of stock)" : ""}`}
                      aria-pressed={isSelected}
                      className="relative rounded-full transition-all"
                      style={{
                        width: 40,
                        height: 40,
                        minWidth: 48,
                        minHeight: 48,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: available ? "pointer" : "not-allowed",
                      }}
                    >
                      <span
                        className="rounded-full block"
                        style={{
                          width: 32,
                          height: 32,
                          backgroundColor: val.swatchHex ?? "#ccc",
                          border: isSelected
                            ? "2px solid var(--color-brand-ink)"
                            : "1px solid #d1d5db",
                          opacity: available ? 1 : 0.35,
                          position: "relative",
                        }}
                      >
                        {!available && (
                          <span
                            className="absolute inset-0 rounded-full"
                            style={{
                              background:
                                "linear-gradient(135deg, transparent 43%, #6b7280 43%, #6b7280 57%, transparent 57%)",
                            }}
                          />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              // Pill buttons for text options
              <ul className="flex flex-wrap gap-2" role="radiogroup" aria-label={option.name}>
                {visibleValues.map((val) => {
                  const testSelected: SelectedValues = [...selected] as SelectedValues;
                  testSelected[slotIdx] = val.id;
                  const matchingVariant = findMatchingVariant(variants, testSelected);
                  const available = matchingVariant ? isVariantAvailable(matchingVariant) : false;
                  const isSelected = currentValueId === val.id;

                  return (
                    <li key={val.id}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        aria-disabled={!available}
                        disabled={!available}
                        tabIndex={!available ? -1 : 0}
                        title={!available ? "Out of stock" : val.value}
                        onClick={() => { if (available) handleSelect(slotIdx, val.id); }}
                        className="rounded-full border-2 px-4 py-2 text-sm font-semibold transition min-h-[48px]"
                        style={{
                          borderColor: !available
                            ? "#cbd5e1"
                            : isSelected
                              ? "var(--color-brand-ink)"
                              : "#D4D4D8",
                          backgroundColor: !available
                            ? "#f1f5f9"
                            : isSelected
                              ? "var(--color-brand-ink)"
                              : "white",
                          color: !available
                            ? "#94a3b8"
                            : isSelected
                              ? "white"
                              : "var(--color-brand-ink)",
                          cursor: available ? "pointer" : "not-allowed",
                          textDecoration: !available ? "line-through" : "none",
                          opacity: !available ? 0.5 : 1,
                        }}
                      >
                        {val.value}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
