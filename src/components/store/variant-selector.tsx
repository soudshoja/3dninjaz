"use client";

/**
 * Phase 16 — Generic N-option variant selector.
 *
 * Renders swatches for Color options (when swatchHex set on ≥1 value),
 * pill buttons for all other options. Supports 1..6 options.
 *
 * Unavailable combos (no matching variant OR inStock=false when trackStock=true)
 * render in disabled state.
 *
 * Mobile-first: 48px min tap targets (Phase 2 D-04).
 */

import { useMemo, useState, useEffect } from "react";
import type { HydratedOption, HydratedVariant } from "@/lib/variants";
import { isVariantAvailable as isVariantAvailableShared } from "@/lib/variant-availability";

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
  /** Fix 3 — hover preview. Called on mouseenter with the previewed variant,
   * and on mouseleave with null. Only fires on hover-capable pointers so
   * touch devices don't accidentally trigger preview on tap. */
  onPreviewChange?: (variant: HydratedVariant | null) => void;
  /** Bug fix — called whenever the first unselected option changes.
   * Receives the option name (e.g. "Letters") or null when all slots filled.
   * Used by AddToBagButton to say "Pick a Letters" instead of "Pick a variant". */
  onFirstMissingOptionChange?: (name: string | null) => void;
}

type SelectedValues = [string | null, string | null, string | null, string | null, string | null, string | null];

/** True when the variant is in stock OR (Phase 18) preorderable. Delegates
 *  to the shared pure helper so product-card and selector can't diverge. */
function isVariantAvailable(v: HydratedVariant): boolean {
  return isVariantAvailableShared({
    inStock: v.inStock,
    trackStock: v.trackStock === true,
    stock: v.stock ?? 0,
    allowPreorder: v.allowPreorder === true,
  });
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
        v.optionValueIds[2] === selected[2] &&
        v.optionValueIds[3] === selected[3] &&
        v.optionValueIds[4] === selected[4] &&
        v.optionValueIds[5] === selected[5],
    ) ?? null
  );
}

export function VariantSelector({
  options,
  variants: rawVariants,
  onVariantChange,
  onPreviewChange,
  onFirstMissingOptionChange,
}: VariantSelectorProps) {
  // Phase 18 — filter out hidden variants (OOS without preorder).
  const variants = useMemo(
    () => rawVariants.filter((v) => !isVariantHidden(v)),
    [rawVariants],
  );

  // Fix 3 — hover-preview support. Gate on real hover (pointer devices);
  // touch devices fire mouseenter weirdly. Default off until we confirm
  // client-side via matchMedia("(hover: hover)").
  const [hoverCapable, setHoverCapable] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(hover: hover)");
    setHoverCapable(mq.matches);
    const handler = (e: MediaQueryListEvent) => setHoverCapable(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

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
    if (!first) return [null, null, null, null, null, null];
    return [...first.optionValueIds] as SelectedValues;
  }, [variants]);

  const [selected, setSelected] = useState<SelectedValues>(defaultSelected);
  // Track which pill is currently being hovered (for the dashed-border preview ring).
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  // Notify parent on mount and whenever selection changes
  useEffect(() => {
    const variant = findMatchingVariant(variants, selected);
    onVariantChange(variant);
    // Bug fix: emit the first option slot that is still null so the
    // Add-to-bag button can say "Pick a Letters" instead of "Pick a variant".
    if (onFirstMissingOptionChange) {
      const firstMissing = options.find((opt, idx) => selected[idx] === null);
      onFirstMissingOptionChange(firstMissing?.name ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected[0], selected[1], selected[2], selected[3], selected[4], selected[5]]);

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

  /** Fix 3 — find the best variant to preview when user hovers a pill/swatch.
   * Prefers matching with other currently-selected values; falls back to
   * the first variant containing this value in that slot. */
  const findPreviewVariant = (slotIdx: number, valueId: string): HydratedVariant | null => {
    const test: SelectedValues = [...selected] as SelectedValues;
    test[slotIdx] = valueId;
    const exact = findMatchingVariant(variants, test);
    if (exact) return exact;
    return variants.find((v) => v.optionValueIds[slotIdx] === valueId) ?? null;
  };

  const handleHoverEnter = (slotIdx: number, valueId: string) => {
    if (!hoverCapable) return;
    setHoveredKey(`${slotIdx}:${valueId}`);
    if (!onPreviewChange) return;
    const v = findPreviewVariant(slotIdx, valueId);
    if (v) onPreviewChange(v);
  };

  const handleHoverLeave = () => {
    if (!hoverCapable) return;
    setHoveredKey(null);
    onPreviewChange?.(null);
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
              // Phase 18 (REQ-7) — swatch buttons with always-visible name caption.
              // Vertical layout: 32px hex circle on top, 12px caption below.
              // gap-3 (12px) instead of gap-2 (8px) per UI-SPEC §Surface 4 grid spacing
              // (compensates for the extra vertical caption height).
              <div className="flex flex-wrap gap-3">
                {visibleValues.map((val) => {
                  // A value is available if ANY non-hidden variant uses it in this slot.
                  // Using an exact-selection match would disable values in multi-option products
                  // when other slots have no matching combo yet selected (Bug 2 fix).
                  const available = variants.some(
                    (v) => v.optionValueIds[slotIdx] === val.id && isVariantAvailable(v),
                  );
                  const isSelected = currentValueId === val.id;
                  const isHovered = hoveredKey === `${slotIdx}:${val.id}`;

                  return (
                    <div
                      key={val.id}
                      className="flex flex-col items-center gap-1"
                      style={{ width: 80 }}
                    >
                      <button
                        type="button"
                        onClick={() => { if (available) handleSelect(slotIdx, val.id); }}
                        onMouseEnter={() => { if (available) handleHoverEnter(slotIdx, val.id); }}
                        onMouseLeave={handleHoverLeave}
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
                              : isHovered
                                ? "2px dashed var(--color-brand-ink)"
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
                      {/* Phase 18 (REQ-7) — always-visible name caption. UI-SPEC §Surface 4:
                          12px Chakra_Petch (var(--font-body)), weight 500 default / 700 selected,
                          line-through + zinc-400 when OOS, max-width 80px with ellipsis. */}
                      <span
                        aria-hidden
                        className="text-center max-w-[80px] truncate"
                        style={{
                          fontFamily: "var(--font-body)",
                          fontSize: 12,
                          lineHeight: 1.2,
                          fontWeight: isSelected ? 700 : 500,
                          color: !available
                            ? "#A1A1AA"
                            : isSelected
                              ? "var(--color-brand-ink)"
                              : "#3F3F46",
                          textDecoration: !available ? "line-through" : "none",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {val.value}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              // Pill buttons for text options
              <ul className="flex flex-wrap gap-2" role="radiogroup" aria-label={option.name}>
                {visibleValues.map((val) => {
                  // A value is available if ANY non-hidden variant uses it in this slot.
                  // Using an exact-selection match would disable values in multi-option products
                  // when other slots have no matching combo yet selected (Bug 2 fix).
                  const available = variants.some(
                    (v) => v.optionValueIds[slotIdx] === val.id && isVariantAvailable(v),
                  );
                  const isSelected = currentValueId === val.id;
                  const isHovered = hoveredKey === `${slotIdx}:${val.id}`;

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
                        onMouseEnter={() => { if (available) handleHoverEnter(slotIdx, val.id); }}
                        onMouseLeave={handleHoverLeave}
                        className="rounded-full border-2 px-4 py-2 text-sm font-semibold transition min-h-[48px]"
                        style={{
                          borderColor: !available
                            ? "#cbd5e1"
                            : isSelected
                              ? "var(--color-brand-ink)"
                              : isHovered
                                ? "var(--color-brand-ink)"
                                : "#D4D4D8",
                          borderStyle: isHovered && !isSelected ? "dashed" : "solid",
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
