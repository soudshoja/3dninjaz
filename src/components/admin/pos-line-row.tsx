"use client";

/**
 * POS Line Row — compact filled ticket row.
 *
 * Displays a 56px summary row:
 *   thumb · name + variant/config subtitle · qty stepper ·
 *   unit-price override input (purple tint when overridden) · line total ·
 *   Edit pencil (calls onEdit — builder reopens the product modal) · trash
 *
 * Free-text lines have an inline name editor instead of a thumbnail and no Edit
 * pencil (nothing to reconfigure).
 *
 * Display snapshot fields (productName, productImageUrl, variantLabel,
 * configSummary) are stored directly on the line so no hydration fetch is needed
 * here. Phase 17 AD-06 reactivity contract: qty + unitPrice are optimistic local
 * state. NEVER call router.refresh().
 */

import { useRef, useState } from "react";
import { GripVertical, Trash2, Pencil, Package, Settings2 } from "lucide-react";
import { BRAND } from "@/lib/brand";
import {
  type PosLine,
  type PosLineStocked,
  type PosLineConfigurable,
  type PosLineFreeText,
} from "@/actions/admin-pos";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Line with a stable React key + display snapshot fields. */
export type LineWithId = {
  localId: string;
  /** Admin-visible product name */
  productName?: string;
  /** Thumbnail URL for the compact row */
  productImageUrl?: string | null;
  /** Variant label, e.g. "Red / Large" */
  variantLabel?: string | null;
  /** Configurable summary string, e.g. "Ninja · Red · 3 names" */
  configSummary?: string | null;
} & PosLine;

type PosLineRowProps = {
  line: LineWithId;
  onChange: (line: PosLine) => void;
  onRemove: () => void;
  /** Called when the Edit pencil is clicked; builder reopens product modal for this line. */
  onEdit?: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMYR(n: number) {
  return `RM ${n.toFixed(2)}`;
}

function getLineUnitPrice(line: PosLine): number {
  if (line.kind === "free_text") return (line as PosLineFreeText).unitPrice;
  if (line.kind === "stocked") {
    const sl = line as PosLineStocked;
    return sl.unitPriceOverride ?? 0;
  }
  if (line.kind === "configurable") {
    const cl = line as PosLineConfigurable;
    return cl.unitPriceOverride ?? cl.computedUnitPrice;
  }
  return 0;
}

function isFreeText(line: PosLine): boolean {
  return line.kind === "free_text";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PosLineRow({ line, onChange, onRemove, onEdit }: PosLineRowProps) {
  const extended = line as LineWithId;

  const currentPrice = getLineUnitPrice(line);
  const [priceInputValue, setPriceInputValue] = useState(currentPrice.toFixed(2));
  const priceInputRef = useRef<HTMLInputElement>(null);

  // Track original computed price for override tint detection
  const computedPriceRef = useRef<number>(
    line.kind === "configurable"
      ? (line as PosLineConfigurable).computedUnitPrice
      : line.kind === "stocked"
        ? (line as PosLineStocked).unitPriceOverride ?? 0
        : (line as PosLineFreeText).unitPrice,
  );

  const isOverridden =
    line.kind !== "free_text" &&
    typeof (line as PosLineStocked | PosLineConfigurable).unitPriceOverride === "number" &&
    (line as PosLineStocked | PosLineConfigurable).unitPriceOverride !== computedPriceRef.current;

  const qty = line.quantity;
  const lineTotal = currentPrice * qty;

  // ── Quantity stepper ──────────────────────────────────────────────────────

  function adjustQty(delta: number) {
    const next = Math.max(1, qty + delta);
    onChange({ ...line, quantity: next } as PosLine);
  }

  // ── Unit price override ────────────────────────────────────────────────────

  function handlePriceBlur() {
    const parsed = parseFloat(priceInputValue);
    if (!isFinite(parsed) || parsed < 0) {
      setPriceInputValue(currentPrice.toFixed(2));
      return;
    }
    if (line.kind === "stocked") {
      onChange({ ...line, unitPriceOverride: parsed } as PosLineStocked);
    } else if (line.kind === "configurable") {
      onChange({ ...line, unitPriceOverride: parsed } as PosLineConfigurable);
    } else {
      onChange({ ...line, unitPrice: parsed } as PosLineFreeText);
    }
  }

  // ── Free-text name ─────────────────────────────────────────────────────────

  function handleFreeTextNameChange(name: string) {
    onChange({ ...line, name } as PosLineFreeText);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const inputClass =
    "rounded-[4px] border-2 border-slate-300 bg-white px-2 py-1 text-sm focus:outline-none focus:border-[#0080ff] transition-colors";

  const thumbUrl = extended.productImageUrl ?? null;
  const subtitle = [extended.variantLabel, extended.configSummary]
    .filter(Boolean)
    .join(" · ");

  const lineIcon =
    line.kind === "configurable" ? (
      <Settings2 size={16} className="text-slate-400" />
    ) : line.kind === "free_text" ? (
      <Pencil size={16} className="text-slate-400" />
    ) : (
      <Package size={16} className="text-slate-400" />
    );

  return (
    <div className="rounded-[4px] border-2 border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-3 min-h-[56px]">
        {/* Drag handle */}
        <GripVertical size={20} className="text-slate-300 shrink-0 cursor-grab" aria-hidden />

        {/* Thumbnail */}
        <div className="h-10 w-10 shrink-0 rounded-[4px] bg-slate-100 flex items-center justify-center overflow-hidden">
          {thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            lineIcon
          )}
        </div>

        {/* Name + subtitle */}
        <div className="flex-1 min-w-0">
          {isFreeText(line) ? (
            <input
              type="text"
              placeholder="Item name"
              value={(line as PosLineFreeText).name}
              onChange={(e) => handleFreeTextNameChange(e.target.value)}
              className="w-full text-sm border-0 bg-transparent p-0 focus:outline-none font-medium truncate"
              style={{ color: BRAND.ink }}
              aria-label="Item name"
            />
          ) : (
            <p className="text-sm font-medium truncate" style={{ color: BRAND.ink }}>
              {extended.productName ??
                (line as PosLineStocked | PosLineConfigurable).productId.slice(0, 8) + "…"}
            </p>
          )}
          {subtitle ? (
            <p className="text-xs text-slate-500 truncate">{subtitle}</p>
          ) : (
            <p className="text-xs text-slate-500 capitalize">{line.kind.replace("_", "-")}</p>
          )}
        </div>

        {/* Quantity stepper */}
        <div className="flex items-center border-2 border-slate-200 rounded-[4px] overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => adjustQty(-1)}
            disabled={qty <= 1}
            className="flex items-center justify-center w-10 h-10 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors cursor-pointer"
            aria-label="Decrease quantity"
          >
            –
          </button>
          <span
            className="flex items-center justify-center w-8 text-sm font-semibold tabular-nums"
            style={{ color: BRAND.ink }}
          >
            {qty}
          </span>
          <button
            type="button"
            onClick={() => adjustQty(1)}
            className="flex items-center justify-center w-10 h-10 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>

        {/* Unit price input */}
        <div className="relative shrink-0">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
            RM
          </span>
          <input
            ref={priceInputRef}
            type="number"
            min="0"
            step="0.01"
            value={priceInputValue}
            onChange={(e) => setPriceInputValue(e.target.value)}
            onBlur={handlePriceBlur}
            className={
              inputClass +
              " w-24 pl-7 text-right font-mono" +
              (isOverridden ? " bg-purple-50" : "")
            }
            style={isOverridden ? { backgroundColor: "#f5f3ff" } : undefined}
            aria-label="Unit price"
          />
        </div>

        {/* Line total */}
        <p
          className="w-20 text-right text-sm font-bold tabular-nums shrink-0"
          style={{ color: BRAND.ink }}
        >
          {formatMYR(lineTotal)}
        </p>

        {/* Edit pencil — product lines only (not free-text) */}
        {!isFreeText(line) && onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center justify-center w-10 h-10 text-slate-400 hover:text-[#0080ff] transition-colors cursor-pointer"
            aria-label="Edit line options"
          >
            <Pencil size={14} />
          </button>
        ) : null}

        {/* Trash */}
        <button
          type="button"
          onClick={onRemove}
          className="flex items-center justify-center w-10 h-10 text-red-400 hover:text-red-600 transition-colors shrink-0 cursor-pointer"
          aria-label="Remove line"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
