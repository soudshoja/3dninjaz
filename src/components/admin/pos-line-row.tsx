"use client";

/**
 * Phase 20 (20-09b) — POS line row — reworked to mount the customer PDP.
 *
 * User feedback: "products in POS should display as they are in store".
 * The old custom inline configurator (variant pills, colour pickers, manual
 * config field renders) is replaced by a full <ProductDetail> mount.
 *
 * Two visual states:
 *
 *   "filling"  — initial state after picking a product. Renders the full
 *                customer PDP inside a branded card (max-w 720px). The PDP's
 *                "Add to order" callback collapses the row to "filled".
 *
 *   "filled"   — compact 56px summary row:
 *                  40×40 thumb · name + variant/config subtitle · qty stepper ·
 *                  unitPrice input (purple-50 tint when changed) · line total ·
 *                  "Edit" pencil (reopens "filling") · trash button
 *
 * Free-text lines use their own compact form and are never in "filling" mode.
 *
 * D-08: isManualLine guard — manual sentinel lines always render compact form.
 * Phase 17 AD-06: Pattern A optimistic — qty stepper, unitPrice override.
 * NEVER call router.refresh() in any mutation path.
 */

import { useState, useRef } from "react";
import {
  GripVertical,
  Trash2,
  Pencil,
  Package,
  Loader2,
  Settings2,
  Keyboard,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import {
  type PosLine,
  type PosLineStocked,
  type PosLineConfigurable,
  type PosLineFreeText,
  type PosProductHydration,
} from "@/actions/admin-pos";
import { ProductDetail, type PosAddToOrderLine } from "@/components/store/product-detail";

// ─── Types ────────────────────────────────────────────────────────────────────

type LineWithId = {
  localId: string;
  /** Hydration payload fetched when the product was picked. null while loading. */
  hydration?: PosProductHydration | null;
  /** "filling" = PDP expanded; "filled" = compact row */
  fillState?: "filling" | "filled";
  /** Snapshot of the last PosAddToOrderLine from the PDP — used to populate the summary row */
  filledLine?: PosAddToOrderLine | null;
} & PosLine;

type PosLineRowProps = {
  line: LineWithId;
  onChange: (line: PosLine) => void;
  onRemove: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMYR(n: number) {
  return `RM ${n.toFixed(2)}`;
}

function getLinePrice(line: PosLine): number {
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

function isManualLine(line: PosLine): boolean {
  if (line.kind === "free_text") return true;
  return (line as PosLineStocked | PosLineConfigurable).productId === "manual";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PosLineRow({
  line,
  onChange,
  onRemove,
}: PosLineRowProps) {
  const extended = line as LineWithId;

  const fillState = extended.fillState ?? (isManualLine(line) ? "filled" : "filling");
  const hydration = extended.hydration;
  const filledLine = extended.filledLine;

  // Unit price display state (for override input in filled mode)
  const currentPrice = getLinePrice(line);
  const [priceInputValue, setPriceInputValue] = useState(currentPrice.toFixed(2));
  const priceInputRef = useRef<HTMLInputElement>(null);

  // Computed price (before override) — for tint detection
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

  // ── Quantity ──────────────────────────────────────────────────────────────

  function adjustQty(delta: number) {
    const next = Math.max(1, qty + delta);
    onChange({ ...line, quantity: next } as PosLine);
  }

  // ── Unit price override (filled mode) ────────────────────────────────────

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

  // ── Free-text name ────────────────────────────────────────────────────────

  function handleFreeTextNameChange(name: string) {
    onChange({ ...line, name } as PosLineFreeText);
  }

  // ── PDP onAddToOrder callback ─────────────────────────────────────────────

  function handlePdpAddToOrder(posLine: PosAddToOrderLine) {
    // Translate PosAddToOrderLine → PosLine and switch to "filled"
    const unitPrice = posLine.unitPrice;
    let updatedLine: PosLine;

    if (posLine.variantId && line.kind !== "configurable") {
      // Stocked: variantId is set
      updatedLine = {
        kind: "stocked",
        productId: posLine.productId,
        variantId: posLine.variantId,
        quantity: posLine.qty,
        unitPriceOverride: unitPrice,
      } as PosLineStocked;
    } else {
      // Configurable / simple (no variantId)
      updatedLine = {
        kind: "configurable",
        productId: posLine.productId,
        variantId: posLine.variantId ?? undefined,
        quantity: posLine.qty,
        computedUnitPrice: unitPrice,
        configurationData: posLine.configurationData
          ? JSON.stringify(posLine.configurationData.values)
          : "{}",
      } as PosLineConfigurable;
    }

    // Merge UI-only fields back so PosBuilder state retains them
    const merged: LineWithId = {
      ...updatedLine,
      localId: extended.localId,
      hydration: extended.hydration,
      fillState: "filled",
      filledLine: posLine,
    };

    // computedPriceRef update
    computedPriceRef.current = unitPrice;
    setPriceInputValue(unitPrice.toFixed(2));

    // Call parent onChange with the core PosLine (without UI fields)
    const { localId: _l, hydration: _h, fillState: _f, filledLine: _fl, ...coreLine } = merged;
    void _l; void _h; void _f; void _fl;
    onChange(coreLine as PosLine);

    // Update the line state in parent — we need to also persist fillState/filledLine.
    // Because pos-builder uses LineWithId which extends PosLine, we can safely cast.
    // The builder's `updateLine` will spread the returned PosLine with the localId.
    // To pass UI fields we need to piggyback on the onChange — BUT pos-builder
    // strips localId and calls onChange(updated). We work around this by
    // triggering a second call that carries the full extended shape. The builder's
    // updateLine does: setLines(prev => prev.map((l) => l.localId === localId ? { ...updated, localId } : l))
    // So we pass the full merged object cast as PosLine — the extra keys (hydration, fillState,
    // filledLine) ride along and survive in the builder's state. TypeScript accepts this
    // because PosLine is a union of the 3 specific types.
    onChange(merged as unknown as PosLine);
  }

  // ── Edit (reopen filling mode) ────────────────────────────────────────────

  function handleEdit() {
    const merged: LineWithId = {
      ...line,
      localId: extended.localId,
      hydration: extended.hydration,
      fillState: "filling",
      filledLine: extended.filledLine,
    };
    onChange(merged as unknown as PosLine);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const inputClass =
    "rounded-[4px] border-2 border-slate-300 bg-white px-2 py-1 text-sm focus:outline-none focus:border-[#0080ff] transition-colors";

  // ── Free-text / filled compact row ────────────────────────────────────────

  if (isManualLine(line) || fillState === "filled") {
    const thumbUrl = filledLine?.productImageUrl ?? null;
    const subtitle = filledLine
      ? [filledLine.variantLabel, filledLine.configurationData?.computedSummary]
          .filter(Boolean)
          .join(" · ")
      : null;

    const lineIcon =
      line.kind === "configurable" ? (
        <Settings2 size={16} className="text-slate-400" />
      ) : line.kind === "free_text" ? (
        <Pencil size={16} className="text-slate-400" />
      ) : (
        <Package size={16} className="text-slate-400" />
      );

    return (
      <div
        className="rounded-[4px] border-2 border-slate-200 bg-white overflow-hidden"
      >
        <div className="flex items-center gap-2 px-3 py-3 min-h-[56px]">
          {/* Drag handle */}
          <GripVertical size={20} className="text-slate-300 shrink-0 cursor-grab" aria-hidden />

          {/* Thumbnail */}
          <div className="h-10 w-10 shrink-0 rounded-[4px] bg-slate-100 flex items-center justify-center overflow-hidden">
            {thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              lineIcon
            )}
          </div>

          {/* Name + subtitle */}
          <div className="flex-1 min-w-0">
            {line.kind === "free_text" ? (
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
                {filledLine?.productName ??
                  (hydration?.product.name) ??
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
              className="flex items-center justify-center w-10 h-10 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
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
              className="flex items-center justify-center w-10 h-10 text-slate-600 hover:bg-slate-50 transition-colors"
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

          {/* Edit button — product lines only (not free-text) */}
          {!isManualLine(line) && hydration ? (
            <button
              type="button"
              onClick={handleEdit}
              className="flex items-center justify-center w-8 h-8 text-slate-400 hover:text-[#0080ff] transition-colors"
              aria-label="Edit line"
            >
              <Pencil size={14} />
            </button>
          ) : null}

          {/* Trash */}
          <button
            type="button"
            onClick={onRemove}
            className="flex items-center justify-center w-8 h-8 text-red-400 hover:text-red-600 transition-colors shrink-0"
            aria-label="Remove line"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
  }

  // ── Filling state: full PDP ───────────────────────────────────────────────

  const productIcon =
    hydration?.product.productType === "keychain" ? (
      <Keyboard size={16} className="text-slate-400" />
    ) : hydration?.product.productType === "configurable" ? (
      <Settings2 size={16} className="text-slate-400" />
    ) : (
      <Package size={16} className="text-slate-400" />
    );

  return (
    <div
      className="rounded-[4px] border-2 overflow-hidden"
      style={{ borderColor: "#0080ff" }}
    >
      {/* Header strip */}
      <div
        className="flex items-center gap-2 px-3 py-2 min-h-[48px]"
        style={{ backgroundColor: "#0080ff0d" }}
      >
        {productIcon}
        <span className="flex-1 text-sm font-semibold truncate" style={{ color: BRAND.ink }}>
          {hydration?.product.name ?? "Loading product…"}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="flex items-center justify-center w-8 h-8 text-red-400 hover:text-red-600 transition-colors shrink-0"
          aria-label="Remove line"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* PDP mount */}
      <div className="p-0">
        {hydration === undefined || hydration === null ? (
          /* Hydration loading skeleton */
          <div className="flex items-center justify-center gap-2 p-8 text-slate-500 text-sm">
            <Loader2 size={20} className="animate-spin text-[#0080ff]" />
            Loading product details…
          </div>
        ) : (
          /* Full customer PDP mounted inside the POS card */
          <div
            style={{ maxWidth: 720, margin: "0 auto" }}
          >
            <ProductDetail
              product={hydration.product}
              pictures={hydration.pictures}
              variantPictures={hydration.variantPictures}
              configurableData={hydration.configurableData}
              isWishlistedInitial={false}
              ratingAvg={0}
              ratingCount={0}
              onAddToOrder={handlePdpAddToOrder}
            />
          </div>
        )}
      </div>
    </div>
  );
}
