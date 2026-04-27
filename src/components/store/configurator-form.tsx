"use client";

/**
 * Phase 19 (19-06) — Type-dispatched configurator form for made-to-order PDPs.
 *
 * Renders one labelled input per config field, dispatching by `field.fieldType`:
 *   - text   → styled text input with uppercase + char-filtering + char counter
 *   - number → number input with min/max/step constraints
 *   - colour → swatch grid (48×48 circles + caption) from resolvedColours
 *   - select → HTML <select> with optional priceAdd suffix
 *
 * Tap targets are ≥ 44px for all interactive elements (RESP-01).
 */

import { useRef } from "react";
import { BRAND } from "@/lib/brand";
import type { PublicConfigField } from "@/lib/configurable-product-data";
import type {
  TextFieldConfig,
  NumberFieldConfig,
  ColourFieldConfig,
  SelectFieldConfig,
} from "@/lib/config-fields";

type Props = {
  fields: PublicConfigField[];
  /** Current form values, keyed by fieldId */
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  /** Called on first non-empty input or colour click — triggers hero swap */
  onTouch: () => void;
  /**
   * Optional: the fieldId of the first colour field that represents the shared
   * "Base & Clicker" colour. When set, the label for that field is overridden
   * to "Base & Clicker color" and a descriptive sub-label is shown.
   */
  baseClickerFieldId?: string;
};

// ============================================================================
// Shared helper
// ============================================================================

/** Whether this field is filled (for required indicator). */
function isFilled(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

// ============================================================================
// Field sub-components
// ============================================================================

function TextField({
  field,
  value,
  onChange,
  onTouch,
  touched,
}: {
  field: PublicConfigField;
  value: string;
  onChange: (v: string) => void;
  onTouch: () => void;
  touched: React.MutableRefObject<boolean>;
}) {
  const cfg = field.config as TextFieldConfig;
  const maxLen = cfg.maxLength ?? 20;
  const allowedPattern = cfg.allowedChars ? new RegExp(`[^${cfg.allowedChars}]`, "g") : null;
  const remaining = maxLen - value.length;
  const atLimit = value.length >= maxLen;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    let v = e.currentTarget.value;
    if (cfg.uppercase) v = v.toUpperCase();
    if (allowedPattern) v = v.replace(allowedPattern, "");
    if (v.length > maxLen) v = v.slice(0, maxLen);
    onChange(v);
    if (!touched.current && v.length > 0) {
      touched.current = true;
      onTouch();
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        type="text"
        value={value}
        onChange={handleChange}
        maxLength={maxLen}
        placeholder={`Enter ${field.label.toLowerCase()}`}
        className="w-full px-4 py-3 rounded-xl border-2 border-zinc-200 focus:border-zinc-900 outline-none text-lg font-bold tracking-widest uppercase transition"
        style={{ minHeight: 48, background: "#fff" }}
        aria-label={field.label}
        aria-required={field.required}
        aria-invalid={field.required && !isFilled(value) ? "true" : undefined}
      />
      <div className="flex justify-between text-xs text-zinc-500 px-1">
        <span>
          {value.length} / {maxLen} character{maxLen !== 1 ? "s" : ""}
        </span>
        <span style={{ color: atLimit ? "#be123c" : undefined }}>
          {atLimit ? "Maximum reached" : remaining > 0 ? `${remaining} remaining` : ""}
        </span>
      </div>
      {field.helpText ? (
        <p className="text-xs text-zinc-400 px-1">{field.helpText}</p>
      ) : null}
    </div>
  );
}

function NumberField({
  field,
  value,
  onChange,
  onTouch,
  touched,
}: {
  field: PublicConfigField;
  value: string;
  onChange: (v: string) => void;
  onTouch: () => void;
  touched: React.MutableRefObject<boolean>;
}) {
  const cfg = field.config as NumberFieldConfig;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.currentTarget.value;
    onChange(v);
    if (!touched.current && v.length > 0) {
      touched.current = true;
      onTouch();
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        type="number"
        value={value}
        onChange={handleChange}
        min={cfg.min}
        max={cfg.max}
        step={cfg.step}
        className="w-full px-4 py-3 rounded-xl border-2 border-zinc-200 focus:border-zinc-900 outline-none text-lg font-bold transition"
        style={{ minHeight: 48, background: "#fff" }}
        aria-label={field.label}
        aria-required={field.required}
      />
      {field.helpText ? (
        <p className="text-xs text-zinc-400 px-1">{field.helpText}</p>
      ) : null}
    </div>
  );
}

function ColourField({
  field,
  value,
  onChange,
  onTouch,
  touched,
}: {
  field: PublicConfigField;
  value: string;
  onChange: (v: string) => void;
  onTouch: () => void;
  touched: React.MutableRefObject<boolean>;
}) {
  const colours = field.resolvedColours ?? [];

  function handleClick(colourId: string) {
    onChange(colourId);
    if (!touched.current) {
      touched.current = true;
      onTouch();
    }
  }

  if (colours.length === 0) {
    return (
      <p className="text-sm text-zinc-400 italic">
        No colours configured for this field.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-3" role="group" aria-label={field.label}>
      {colours.map((c) => {
        const isSelected = value === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => handleClick(c.id)}
            title={c.name}
            aria-pressed={isSelected}
            aria-label={c.name}
            style={{
              minWidth: 48,
              minHeight: 48,
              borderRadius: "999px",
              border: `3px solid ${isSelected ? BRAND.green : "transparent"}`,
              outline: isSelected ? `2px solid ${BRAND.green}` : "2px solid transparent",
              outlineOffset: 2,
              padding: 0,
              background: "none",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span
              style={{
                display: "block",
                width: 44,
                height: 44,
                borderRadius: "999px",
                background: c.hex,
                border: "1px solid rgba(0,0,0,0.12)",
                boxShadow: isSelected ? `0 0 0 3px ${BRAND.green}40` : undefined,
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: isSelected ? BRAND.ink : "#64748b",
                lineHeight: 1,
                maxWidth: 56,
                textAlign: "center",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {c.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SelectField({
  field,
  value,
  onChange,
  onTouch,
  touched,
}: {
  field: PublicConfigField;
  value: string;
  onChange: (v: string) => void;
  onTouch: () => void;
  touched: React.MutableRefObject<boolean>;
}) {
  const cfg = field.config as SelectFieldConfig;

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.currentTarget.value;
    onChange(v);
    if (!touched.current && v) {
      touched.current = true;
      onTouch();
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        value={value}
        onChange={handleChange}
        className="w-full px-4 py-3 rounded-xl border-2 border-zinc-200 focus:border-zinc-900 outline-none text-base font-semibold transition bg-white"
        style={{ minHeight: 48 }}
        aria-label={field.label}
        aria-required={field.required}
      >
        <option value="">Select {field.label.toLowerCase()}</option>
        {cfg.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
            {opt.priceAdd ? ` (+RM ${opt.priceAdd.toFixed(2)})` : ""}
          </option>
        ))}
      </select>
      {field.helpText ? (
        <p className="text-xs text-zinc-400 px-1">{field.helpText}</p>
      ) : null}
    </div>
  );
}

// ============================================================================
// ConfiguratorForm — main export
// ============================================================================

export function ConfiguratorForm({ fields, values, onChange, onTouch, baseClickerFieldId }: Props) {
  // Track first-touch per form instance (not per field) — single hero swap.
  const touchedRef = useRef(false);

  if (fields.length === 0) {
    return (
      <p className="text-sm text-zinc-400 italic">
        No configuration fields set up for this product yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {fields.map((field) => {
        const value = values[field.id] ?? "";
        const filled = isFilled(value);
        const showRequiredError = field.required && !filled;

        // Base & Clicker override: when this field is the designated
        // base+clicker field, show a clear shared-colour label instead of
        // the admin-authored field label.
        const isBaseClicker = baseClickerFieldId
          ? field.id === baseClickerFieldId
          : false;
        const displayLabel = isBaseClicker ? "Base & Clicker color" : field.label;
        const displayHelp = isBaseClicker
          ? "The carabiner clip and bottom cube share this colour."
          : field.helpText;

        function handleFieldChange(v: string) {
          onChange({ ...values, [field.id]: v });
        }

        return (
          <div key={field.id} className="flex flex-col gap-2">
            {/* Field label */}
            <label className="flex items-center gap-1 text-sm font-bold text-zinc-800 uppercase tracking-wide">
              {displayLabel}
              {field.required && (
                <span aria-hidden="true" className="text-red-500 ml-0.5">
                  *
                </span>
              )}
            </label>

            {/* Help text (above input) */}
            {displayHelp && field.fieldType !== "text" && field.fieldType !== "number" ? (
              <p className="text-xs text-zinc-400">{displayHelp}</p>
            ) : null}

            {/* Type-dispatched input */}
            {field.fieldType === "text" && (
              <TextField
                field={field}
                value={value}
                onChange={handleFieldChange}
                onTouch={onTouch}
                touched={touchedRef}
              />
            )}
            {field.fieldType === "number" && (
              <NumberField
                field={field}
                value={value}
                onChange={handleFieldChange}
                onTouch={onTouch}
                touched={touchedRef}
              />
            )}
            {field.fieldType === "colour" && (
              <ColourField
                field={field}
                value={value}
                onChange={handleFieldChange}
                onTouch={onTouch}
                touched={touchedRef}
              />
            )}
            {field.fieldType === "select" && (
              <SelectField
                field={field}
                value={value}
                onChange={handleFieldChange}
                onTouch={onTouch}
                touched={touchedRef}
              />
            )}

            {/* Required microcopy */}
            {showRequiredError && (
              <p className="text-xs font-semibold" style={{ color: "#be123c" }}>
                Required
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
