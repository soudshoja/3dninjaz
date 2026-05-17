"use client";

/**
 * Phase 20 (20-09) — POS line row component.
 *
 * Collapsed: drag-handle · thumbnail · name + variant label · qty stepper ·
 *   unitPrice input (purple-50 tint when overridden) · line total · trash.
 *
 * Expanded (configurable / keychain): smooth height transition 250ms, blue 2px
 *   border, bg-slate-50 inner card. Mounts an inline configurator that maps
 *   PosConfigFields to inputs. Colour fields open ColourPickerDialog.
 *
 * Reactivity contract (Phase 17 AD-06):
 *   Pattern A optimistic — qty stepper, unitPrice override.
 *   Pattern B refetch — variant select, configurator field change.
 *   NEVER call router refresh() in any mutation path.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import {
  GripVertical,
  Trash2,
  ChevronDown,
  ChevronUp,
  Package,
  Settings2,
  Keyboard,
  Pencil,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import {
  getPosConfigFields,
  getStockedVariantsForPos,
  type PosLine,
  type PosLineStocked,
  type PosLineConfigurable,
  type PosLineFreeText,
  type PosConfigField,
  type PosVariant,
} from "@/actions/admin-pos";

// ─── Types ────────────────────────────────────────────────────────────────────

type LineWithId = { localId: string } & PosLine;

type PosLineRowProps = {
  line: LineWithId;
  onChange: (line: PosLine) => void;
  onRemove: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
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

function getLineQty(line: PosLine): number {
  return line.quantity;
}

function isConfigurableLike(line: PosLine) {
  return line.kind === "configurable";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PosLineRow({
  line,
  onChange,
  onRemove,
  isExpanded,
  onToggleExpand,
}: PosLineRowProps) {
  // ── Derived state ──────────────────────────────────────────────────────────
  const qty = getLineQty(line);
  const currentPrice = getLinePrice(line);
  const lineTotal = currentPrice * qty;

  // Unit price input display
  const [priceInputValue, setPriceInputValue] = useState(currentPrice.toFixed(2));
  const priceInputRef = useRef<HTMLInputElement>(null);

  // Computed price (before override)
  const [computedPrice, setComputedPrice] = useState<number>(
    line.kind === "configurable"
      ? (line as PosLineConfigurable).computedUnitPrice
      : line.kind === "stocked"
        ? (line as PosLineStocked).unitPriceOverride ?? 0
        : (line as PosLineFreeText).unitPrice
  );

  // Is overridden?
  const isOverridden =
    line.kind !== "free_text" &&
    typeof (line as PosLineStocked | PosLineConfigurable).unitPriceOverride === "number" &&
    (line as PosLineStocked | PosLineConfigurable).unitPriceOverride !== computedPrice;

  // ── Config fields for expandable rows ─────────────────────────────────────
  const [configFields, setConfigFields] = useState<PosConfigField[] | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [configLoading, setConfigLoading] = useState(false);

  // ── Stocked variants ───────────────────────────────────────────────────────
  const [variants, setVariants] = useState<PosVariant[] | null>(null);
  const [variantsLoading, setVariantsLoading] = useState(false);

  // ── Colour picker ─────────────────────────────────────────────────────────
  const [colourPickerField, setColourPickerField] = useState<string | null>(null);

  const [, startTransition] = useTransition();

  // ── Load config fields on expand ──────────────────────────────────────────

  useEffect(() => {
    if (!isExpanded) return;

    if (isConfigurableLike(line) && configFields === null) {
      setConfigLoading(true);
      startTransition(async () => {
        const fields = await getPosConfigFields(
          (line as PosLineConfigurable).productId
        );
        setConfigFields(fields ?? []);
        // Seed configValues from existing configurationData
        if (line.kind === "configurable") {
          try {
            const existing = JSON.parse(
              (line as PosLineConfigurable).configurationData || "{}"
            );
            setConfigValues(existing);
          } catch {
            setConfigValues({});
          }
        }
        setConfigLoading(false);
      });
    }

    if (line.kind === "stocked" && variants === null) {
      setVariantsLoading(true);
      startTransition(async () => {
        const result = await getStockedVariantsForPos(
          (line as PosLineStocked).productId
        );
        setVariants(result);
        // Auto-select first in-stock variant if none selected
        if (result.length > 0 && !(line as PosLineStocked).variantId) {
          const first = result[0];
          const effectivePrice = first.isOnSale && first.salePrice != null
            ? first.salePrice
            : first.price;
          setComputedPrice(effectivePrice);
          setPriceInputValue(effectivePrice.toFixed(2));
          onChange({
            ...line,
            variantId: first.variantId,
            unitPriceOverride: undefined,
          } as PosLineStocked);
        }
        setVariantsLoading(false);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded]);

  // ── Quantity ───────────────────────────────────────────────────────────────

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

  // ── Variant select ─────────────────────────────────────────────────────────

  function handleVariantChange(variantId: string) {
    if (!variants) return;
    const v = variants.find((vv) => vv.variantId === variantId);
    if (!v) return;
    const effectivePrice = v.isOnSale && v.salePrice != null ? v.salePrice : v.price;
    setComputedPrice(effectivePrice);
    setPriceInputValue(effectivePrice.toFixed(2));
    onChange({
      ...line,
      variantId,
      unitPriceOverride: undefined,
    } as PosLineStocked);
  }

  // ── Configurator field change ──────────────────────────────────────────────

  function handleConfigFieldChange(fieldId: string, value: string) {
    const nextValues = { ...configValues, [fieldId]: value };
    setConfigValues(nextValues);
    // Pattern B: update configurationData on the line
    onChange({
      ...line,
      configurationData: JSON.stringify(nextValues),
    } as PosLineConfigurable);
  }

  // ── Name for free-text ─────────────────────────────────────────────────────

  function handleFreeTextNameChange(name: string) {
    onChange({ ...line, name } as PosLineFreeText);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const inputClass =
    "rounded-[4px] border-2 border-slate-300 bg-white px-2 py-1 text-sm focus:outline-none focus:border-[#0080ff] transition-colors";

  const lineName =
    line.kind === "free_text"
      ? (line as PosLineFreeText).name || "Custom item"
      : line.kind === "stocked" || line.kind === "configurable"
        ? (line as { productId: string }).productId.slice(0, 8) + "…"
        : "Line";

  const lineIcon =
    line.kind === "configurable" ? (
      <Settings2 size={16} className="text-slate-400" />
    ) : line.kind === "free_text" ? (
      <Pencil size={16} className="text-slate-400" />
    ) : (
      <Package size={16} className="text-slate-400" />
    );

  const showExpandToggle = isConfigurableLike(line) || line.kind === "stocked";

  return (
    <div
      className="rounded-[4px] border-2 transition-colors overflow-hidden"
      style={{
        borderColor: isExpanded ? "#0080ff" : "#e2e8f0",
        borderWidth: isExpanded ? "2px" : "2px",
      }}
    >
      {/* ── Collapsed row ── */}
      <div className="flex items-center gap-2 bg-white px-3 py-3 min-h-[56px] md:min-h-[56px]">
        {/* Drag handle (decorative) */}
        <GripVertical size={20} className="text-slate-300 shrink-0 cursor-grab" aria-hidden />

        {/* Thumbnail / icon */}
        <div className="h-10 w-10 shrink-0 rounded-[4px] bg-slate-100 flex items-center justify-center overflow-hidden">
          {lineIcon}
        </div>

        {/* Name + variant label */}
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
            <p
              className="text-sm font-medium truncate"
              style={{ color: BRAND.ink }}
            >
              {line.kind === "stocked" || line.kind === "configurable"
                ? line.kind === "stocked" && variants && (line as PosLineStocked).variantId
                  ? variants.find((v) => v.variantId === (line as PosLineStocked).variantId)?.label ?? "Select variant"
                  : "Select variant"
                : lineName}
            </p>
          )}
          <p className="text-xs text-slate-500 capitalize">{line.kind.replace("_", "-")}</p>
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

        {/* Expand toggle (for configurable / stocked) */}
        {showExpandToggle ? (
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex items-center justify-center w-8 h-8 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label={isExpanded ? "Collapse line" : "Expand line"}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
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

      {/* ── Expanded section ── */}
      {isExpanded ? (
        <div
          className="border-t-2 border-slate-100 px-4 pt-4 pb-4 transition-all duration-[250ms]"
          style={{ backgroundColor: "#f8fafc" }}
        >
          {/* ── Stocked: variant selector ── */}
          {line.kind === "stocked" ? (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: BRAND.ink }}>
                Select variant
              </label>
              {variantsLoading ? (
                <div className="h-12 bg-slate-200 animate-pulse rounded-[4px]" />
              ) : variants && variants.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => {
                    const selected = (line as PosLineStocked).variantId === v.variantId;
                    const effectivePrice =
                      v.isOnSale && v.salePrice != null ? v.salePrice : v.price;
                    return (
                      <button
                        key={v.variantId}
                        type="button"
                        disabled={!v.inStock}
                        onClick={() => handleVariantChange(v.variantId)}
                        className="rounded-[4px] border-2 px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40"
                        style={{
                          borderColor: selected ? "#0080ff" : "#e2e8f0",
                          backgroundColor: selected ? "#0080ff1a" : "white",
                          color: BRAND.ink,
                        }}
                      >
                        {v.label} — {formatMYR(effectivePrice)}
                        {v.isOnSale ? " (sale)" : ""}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No variants found.</p>
              )}
            </div>
          ) : null}

          {/* ── Configurable: inline config fields ── */}
          {line.kind === "configurable" ? (
            <div>
              {configLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-12 bg-slate-200 animate-pulse rounded-[4px]" />
                  ))}
                </div>
              ) : configFields && configFields.length > 0 ? (
                <div className="space-y-4">
                  {configFields.map((field) => (
                    <div key={field.id}>
                      <label className="block text-sm font-medium mb-1" style={{ color: BRAND.ink }}>
                        {field.label}
                        {field.required ? (
                          <span className="text-red-600 ml-1">*</span>
                        ) : null}
                      </label>
                      {field.helpText ? (
                        <p className="text-xs text-slate-500 mb-1">{field.helpText}</p>
                      ) : null}

                      {/* Colour field */}
                      {field.fieldType === "colour" ? (
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setColourPickerField(
                                colourPickerField === field.id ? null : field.id
                              )
                            }
                            className="flex items-center gap-2 min-h-[48px] rounded-[4px] border-2 border-slate-300 px-3 py-2 text-sm hover:border-[#0080ff] transition-colors"
                            aria-label={`Pick colour for ${field.label}`}
                          >
                            {configValues[field.id] ? (
                              <span
                                className="inline-block w-6 h-6 rounded-[4px] border border-slate-300"
                                style={{ backgroundColor: configValues[field.id] }}
                              />
                            ) : null}
                            <span className="text-slate-600">
                              {configValues[field.id] ? configValues[field.id] : "Pick colour"}
                            </span>
                          </button>
                          {colourPickerField === field.id ? (
                            <div className="text-xs text-slate-500">
                              Enter hex colour:
                              <input
                                type="color"
                                value={configValues[field.id] || "#000000"}
                                onChange={(e) => handleConfigFieldChange(field.id, e.target.value)}
                                className="ml-2 w-8 h-8 rounded cursor-pointer border-0"
                                aria-label="Colour picker"
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : field.fieldType === "select" ? (
                        /* Select field */
                        (() => {
                          let options: string[] = [];
                          try {
                            const parsed = field.configJson
                              ? JSON.parse(field.configJson)
                              : {};
                            options = parsed.options ?? [];
                          } catch {
                            options = [];
                          }
                          return (
                            <select
                              className="w-full min-h-[48px] rounded-[4px] border-2 border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#0080ff] transition-colors"
                              value={configValues[field.id] || ""}
                              onChange={(e) =>
                                handleConfigFieldChange(field.id, e.target.value)
                              }
                            >
                              <option value="">Select…</option>
                              {options.map((opt: string) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          );
                        })()
                      ) : field.fieldType === "number" ? (
                        /* Number field */
                        <input
                          type="number"
                          className="w-full min-h-[48px] rounded-[4px] border-2 border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#0080ff] transition-colors"
                          value={configValues[field.id] || ""}
                          onChange={(e) =>
                            handleConfigFieldChange(field.id, e.target.value)
                          }
                          min={0}
                        />
                      ) : (
                        /* Text / textarea default */
                        <input
                          type="text"
                          className="w-full min-h-[48px] rounded-[4px] border-2 border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#0080ff] transition-colors"
                          value={configValues[field.id] || ""}
                          onChange={(e) =>
                            handleConfigFieldChange(field.id, e.target.value)
                          }
                        />
                      )}
                    </div>
                  ))}

                  {/* Computed unit price indicator */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-sm">
                    <span className="text-slate-600">Computed price</span>
                    <span className="font-mono font-semibold">
                      {formatMYR((line as PosLineConfigurable).computedUnitPrice)}
                    </span>
                  </div>
                </div>
              ) : configFields !== null && configFields.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No configuration fields for this product.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
