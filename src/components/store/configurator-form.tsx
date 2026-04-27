"use client";

/**
 * Phase 19 (19-06) — Type-dispatched configurator form for made-to-order PDPs.
 *
 * Redesigned (ui-ux-pro-max / Claymorphism treatment):
 *   - TextField: larger, bolder, brand-accented focus ring.
 *   - ColourField: round chips with green selected ring + drop shadow + checkmark.
 *   - SelectField: styled select with brand border.
 *   - Section labels: bold uppercase with coloured accent bar.
 *   - All tap targets >= 48px (mobile-first).
 *
 * Functional behaviour is UNCHANGED:
 *   - First-touch-only onTouch (touchedRef pattern).
 *   - uppercase / allowedChars / maxLength filtering.
 *   - baseClickerFieldId label override.
 */

import { useRef } from "react";
import { Check } from "lucide-react";
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
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  onTouch: () => void;
  baseClickerFieldId?: string;
};

// ============================================================================
// Shared helper
// ============================================================================

function isFilled(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

// ============================================================================
// TextField
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
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          maxLength={maxLen}
          placeholder={`Enter ${field.label.toLowerCase()}…`}
          className="w-full px-5 py-4 rounded-2xl text-lg font-bold tracking-widest uppercase outline-none transition-all duration-200"
          style={{
            minHeight: 56,
            background: "#fff",
            border: `2.5px solid ${value.length > 0 ? BRAND.blue : "#d1d5db"}`,
            color: BRAND.ink,
            boxShadow: value.length > 0
              ? `0 0 0 3px ${BRAND.blue}20, 0 4px 0 ${BRAND.blueDark}30`
              : `0 2px 0 #d1d5db40`,
            letterSpacing: "0.2em",
          }}
          aria-label={field.label}
          aria-required={field.required}
          aria-invalid={field.required && !isFilled(value) ? "true" : undefined}
        />
        {/* Character count badge inside input */}
        <span
          className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold tabular-nums"
          style={{ color: atLimit ? "#be123c" : "#94a3b8", pointerEvents: "none" }}
          aria-hidden="true"
        >
          {value.length}/{maxLen}
        </span>
      </div>

      {/* Help text or limit warning */}
      <div className="flex justify-between items-center px-1">
        {field.helpText ? (
          <p className="text-xs" style={{ color: "#6b7280" }}>{field.helpText}</p>
        ) : (
          <span />
        )}
        {atLimit && (
          <span className="text-xs font-semibold" style={{ color: "#be123c" }}>
            Maximum reached
          </span>
        )}
        {!atLimit && remaining <= 3 && value.length > 0 && (
          <span className="text-xs font-semibold" style={{ color: "#f59e0b" }}>
            {remaining} left
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// NumberField
// ============================================================================

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
    <div className="flex flex-col gap-1.5">
      <input
        type="number"
        value={value}
        onChange={handleChange}
        min={cfg.min}
        max={cfg.max}
        step={cfg.step}
        className="w-full px-5 py-4 rounded-2xl text-lg font-bold outline-none transition-all duration-200"
        style={{
          minHeight: 56,
          background: "#fff",
          border: `2.5px solid ${value ? BRAND.blue : "#d1d5db"}`,
          color: BRAND.ink,
          boxShadow: value ? `0 0 0 3px ${BRAND.blue}20, 0 4px 0 ${BRAND.blueDark}30` : `0 2px 0 #d1d5db40`,
        }}
        aria-label={field.label}
        aria-required={field.required}
      />
      {field.helpText ? (
        <p className="text-xs px-1" style={{ color: "#6b7280" }}>{field.helpText}</p>
      ) : null}
    </div>
  );
}

// ============================================================================
// ColourField — round chips with checkmark + shadow
// ============================================================================

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
      <p className="text-sm italic" style={{ color: "#9ca3af" }}>
        No colours configured for this field.
      </p>
    );
  }

  return (
    <div
      className="flex flex-wrap gap-3 p-1"
      role="group"
      aria-label={field.label}
    >
      {colours.map((c) => {
        const isSelected = value === c.id;
        // Determine if the chip colour is very light (needs dark ring)
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => handleClick(c.id)}
            title={c.name}
            aria-pressed={isSelected}
            aria-label={`${c.name}${isSelected ? " (selected)" : ""}`}
            className="flex flex-col items-center gap-1.5 cursor-pointer transition-transform duration-150 active:scale-95"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              minWidth: 52,
              minHeight: 52,
            }}
          >
            {/* Colour disc */}
            <span
              className="relative flex items-center justify-center transition-all duration-200"
              style={{
                width: 48,
                height: 48,
                borderRadius: "999px",
                backgroundColor: c.hex,
                border: isSelected
                  ? `3px solid ${BRAND.green}`
                  : "2.5px solid rgba(0,0,0,0.10)",
                boxShadow: isSelected
                  ? `0 0 0 3px ${BRAND.green}35, 0 4px 12px ${c.hex}60`
                  : `0 3px 8px ${c.hex}40, 0 2px 0 rgba(0,0,0,0.08)`,
                transform: isSelected ? "scale(1.1)" : "scale(1)",
              }}
            >
              {/* Checkmark overlay when selected */}
              {isSelected && (
                <Check
                  size={20}
                  strokeWidth={3}
                  className="absolute"
                  style={{
                    color: isLightColor(c.hex) ? BRAND.ink : "#ffffff",
                    filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.3))",
                  }}
                  aria-hidden="true"
                />
              )}
            </span>

            {/* Colour name label */}
            <span
              className="text-center leading-tight transition-colors duration-150"
              style={{
                fontSize: 10,
                fontWeight: isSelected ? 800 : 600,
                color: isSelected ? BRAND.ink : "#6b7280",
                maxWidth: 56,
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

/** Rough lightness check to decide if checkmark should be dark or white */
function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 160;
}

// ============================================================================
// SelectField
// ============================================================================

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
    <div className="flex flex-col gap-1.5">
      <select
        value={value}
        onChange={handleChange}
        className="w-full px-5 py-4 rounded-2xl text-base font-semibold outline-none transition-all duration-200 cursor-pointer appearance-none"
        style={{
          minHeight: 56,
          background: "#fff",
          border: `2.5px solid ${value ? BRAND.blue : "#d1d5db"}`,
          color: value ? BRAND.ink : "#9ca3af",
          boxShadow: value ? `0 0 0 3px ${BRAND.blue}20, 0 4px 0 ${BRAND.blueDark}30` : `0 2px 0 #d1d5db40`,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 16px center",
          paddingRight: 44,
        }}
        aria-label={field.label}
        aria-required={field.required}
      >
        <option value="">Select {field.label.toLowerCase()}…</option>
        {cfg.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
            {opt.priceAdd ? ` (+RM ${opt.priceAdd.toFixed(2)})` : ""}
          </option>
        ))}
      </select>
      {field.helpText ? (
        <p className="text-xs px-1" style={{ color: "#6b7280" }}>{field.helpText}</p>
      ) : null}
    </div>
  );
}

// ============================================================================
// ConfiguratorForm — main export
// ============================================================================

export function ConfiguratorForm({ fields, values, onChange, onTouch, baseClickerFieldId }: Props) {
  const touchedRef = useRef(false);

  if (fields.length === 0) {
    return (
      <p className="text-sm italic" style={{ color: "#9ca3af" }}>
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

        const isBaseClicker = baseClickerFieldId ? field.id === baseClickerFieldId : false;
        const displayLabel = isBaseClicker ? "Base & Clicker Color" : field.label;
        const displayHelp = isBaseClicker
          ? "The carabiner clip and bottom cube share this colour."
          : field.helpText;

        function handleFieldChange(v: string) {
          onChange({ ...values, [field.id]: v });
        }

        return (
          <div key={field.id} className="flex flex-col gap-2.5">
            {/* Field label */}
            <label className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide" style={{ color: BRAND.ink }}>
              {/* Accent dot */}
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: field.fieldType === "colour" ? BRAND.purple : BRAND.blue }}
                aria-hidden="true"
              />
              {displayLabel}
              {field.required && (
                <span aria-hidden="true" className="ml-0.5" style={{ color: "#ef4444" }}>
                  *
                </span>
              )}
            </label>

            {/* Help text above colour/select inputs */}
            {displayHelp && field.fieldType !== "text" && field.fieldType !== "number" ? (
              <p className="text-xs px-1" style={{ color: "#6b7280" }}>{displayHelp}</p>
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

            {/* Required error microcopy */}
            {showRequiredError && (
              <p className="text-xs font-semibold px-1" style={{ color: "#be123c" }}>
                This field is required
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
