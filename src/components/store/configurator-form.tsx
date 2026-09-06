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
 *   - Field label and helpText used directly (no overrides).
 */

import { useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { VariantOptionPicker } from "@/components/store/variant-option-picker";
import { customKey } from "@/lib/custom-text";
import { ensureKeycapSequence } from "@/lib/config-fields";
import { KEYCAP_ICON_BY_ID } from "@/lib/keycap-icons";
import type { PublicConfigField } from "@/lib/configurable-product-data";
import type {
  TextFieldConfig,
  NumberFieldConfig,
  ColourFieldConfig,
  SelectFieldConfig,
  KeycapSeqConfig,
  KeycapSlot,
} from "@/lib/config-fields";

type Props = {
  fields: PublicConfigField[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  onTouch: () => void;
  /**
   * Base price (MYR) — passed to SelectField so VariantOptionPicker can show
   * per-option price override pills relative to the current base price.
   * Optional: omit when no base price is known yet (e.g. tier-based products
   * where no unit value has been entered).
   */
  basePrice?: number;
  /**
   * Override for text-field character cap. When provided, takes precedence over
   * the per-field config.maxLength. Driven by product.maxUnitCount so the tier
   * table and the input limit stay in sync.
   */
  textMaxLength?: number;
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

/**
 * Build a dynamic constraints hint from the text field config so the line
 * under the input always reflects the configured max + allowed characters
 * (e.g. "Letters & numbers (uppercase), max 10 characters.") instead of a
 * static, hand-written string.
 */
function textFieldHint(allowedChars: string | undefined, uppercase: boolean, maxLen: number): string {
  const chars = allowedChars ?? "";
  const hasLetters = /a-z/i.test(chars);
  const hasDigits = /0-9/.test(chars);
  let label: string;
  if (hasLetters && hasDigits) label = "Letters & numbers";
  else if (hasDigits) label = "Numbers";
  else if (hasLetters) label = "Letters A–Z";
  else label = "Text";
  const caseSuffix = uppercase ? " (uppercase)" : "";
  return `${label}${caseSuffix}, max ${maxLen} character${maxLen === 1 ? "" : "s"}.`;
}

function TextField({
  field,
  value,
  onChange,
  onTouch,
  touched,
  textMaxLength,
}: {
  field: PublicConfigField;
  value: string;
  onChange: (v: string) => void;
  onTouch: () => void;
  touched: React.MutableRefObject<boolean>;
  textMaxLength?: number;
}) {
  const cfg = field.config as TextFieldConfig;
  const maxLen = textMaxLength ?? cfg.maxLength ?? 20;
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
          placeholder={cfg.placeholder?.trim() || "Enter your text…"}
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

      {/* Dynamic constraints hint derived from the live config (max length +
          allowed chars), not a static string. Limit warnings on the right. */}
      <div className="flex justify-between items-center px-1">
        <p className="text-xs" style={{ color: "#6b7280" }}>
          {textFieldHint(cfg.allowedChars, !!cfg.uppercase, maxLen)}
        </p>
        {atLimit ? (
          <span className="text-xs font-semibold" style={{ color: "#be123c" }}>
            Maximum reached
          </span>
        ) : remaining <= 3 && value.length > 0 ? (
          <span className="text-xs font-semibold" style={{ color: "#f59e0b" }}>
            {remaining} left
          </span>
        ) : null}
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
  allValues,
  onValuesChange,
  onTouch,
  touched,
  basePrice,
}: {
  field: PublicConfigField;
  value: string;
  /** Full values map — needed to read/write the __custom sibling key. */
  allValues: Record<string, string>;
  /** Replaces the full values map (option value + optional __custom text). */
  onValuesChange: (next: Record<string, string>) => void;
  onTouch: () => void;
  touched: React.MutableRefObject<boolean>;
  basePrice?: number;
}) {
  const cfg = field.config as SelectFieldConfig;
  const selectedOpt = cfg.options.find((o) => o.value === value);
  const customValue = allValues[customKey(field.id)] ?? "";

  // Derived named boolean — "option chosen but required text is blank"
  const customTextError = !!selectedOpt?.customInput && customValue.trim().length === 0;

  function handleOptionChange(v: string) {
    // When option changes, clear any stale __custom text from the previous selection.
    const next = { ...allValues, [field.id]: v };
    delete next[customKey(field.id)];
    onValuesChange(next);
    if (!touched.current && v) {
      touched.current = true;
      onTouch();
    }
  }

  function handleCustomTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    const maxLen = selectedOpt?.customMaxLength ?? 30;
    const typed = e.currentTarget.value.slice(0, maxLen);
    onValuesChange({ ...allValues, [customKey(field.id)]: typed });
    if (!touched.current) {
      touched.current = true;
      onTouch();
    }
  }

  const maxLen = selectedOpt?.customMaxLength ?? 30;
  const remaining = maxLen - customValue.length;
  const atLimit = customValue.length >= maxLen;

  return (
    <div className="flex flex-col gap-1.5">
      <VariantOptionPicker
        options={cfg.options}
        value={value}
        onChange={handleOptionChange}
        label={field.label}
        placeholder={`Select ${field.label.toLowerCase()}…`}
        basePrice={basePrice}
      />
      {field.helpText ? (
        <p className="text-xs px-1" style={{ color: "#6b7280" }}>{field.helpText}</p>
      ) : null}

      {/* quick task 260610-kh3 — custom text input revealed when the selected option has customInput */}
      {selectedOpt?.customInput && (
        <div className="flex flex-col gap-1 mt-1">
          <div className="relative">
            <input
              type="text"
              value={customValue}
              onChange={handleCustomTextChange}
              maxLength={maxLen}
              placeholder={selectedOpt?.customPlaceholder?.trim() || "Type your text here…"}
              aria-required
              aria-label={`${field.label} — your text`}
              aria-invalid={customTextError ? "true" : undefined}
              className="w-full px-5 py-4 rounded-2xl text-lg font-bold tracking-widest outline-none transition-all duration-200"
              style={{
                minHeight: 56,
                background: "#fff",
                border: `2.5px solid ${customValue.length > 0 ? BRAND.blue : (customTextError ? "#be123c" : "#d1d5db")}`,
                color: BRAND.ink,
                boxShadow: customValue.length > 0
                  ? `0 0 0 3px ${BRAND.blue}20, 0 4px 0 ${BRAND.blueDark}30`
                  : customTextError
                  ? `0 0 0 3px #be123c18`
                  : `0 2px 0 #d1d5db40`,
              }}
            />
            {/* Character count badge inside input */}
            <span
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold tabular-nums"
              style={{ color: atLimit ? "#be123c" : "#94a3b8", pointerEvents: "none" }}
              aria-hidden="true"
            >
              {customValue.length}/{maxLen}
            </span>
          </div>
          {/* Limit warning */}
          {atLimit && (
            <span className="text-xs font-semibold px-1" style={{ color: "#be123c" }}>
              Maximum reached
            </span>
          )}
          {!atLimit && remaining <= 3 && customValue.length > 0 && (
            <span className="text-xs font-semibold px-1" style={{ color: "#f59e0b" }}>
              {remaining} left
            </span>
          )}
          {/* Named customTextError microcopy — independent of showRequiredError */}
          {customTextError && (
            <p className="text-xs font-semibold px-1" style={{ color: "#be123c" }}>
              This field is required
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// KeycapSeqField — mixed letter + icon slot-rail builder (Phase 25, S1)
// ============================================================================

/**
 * The customer-facing sequence builder for square keychains (D-02/D-04/D-06).
 *
 * Renders an ordered, wrapping rail of 56×56 slot tiles (letters = blue accent,
 * icons = purple accent) followed by `+ Letter` (blue) and `+ Icon` (purple)
 * add affordances. A single shared counter enforces `maxSlots` across letters +
 * icons combined; at the cap both add buttons disable. Icon slots carry NO
 * colour controls (those live only on the 3 global colour fields, D-04).
 *
 * The sequence is written back through the existing `onChange` contract as a
 * JSON string in `values[fieldId]` (empty string when zero slots so a required
 * field still reads as unfilled). Reordering is out of scope for v1 — slots
 * append in tap order.
 */
function KeycapSeqField({
  field,
  value,
  onChange,
  onTouch,
  touched,
  textMaxLength,
}: {
  field: PublicConfigField;
  value: string;
  onChange: (v: string) => void;
  onTouch: () => void;
  touched: React.MutableRefObject<boolean>;
  textMaxLength?: number;
}) {
  const cfg = field.config as KeycapSeqConfig;
  const slots = ensureKeycapSequence(value);
  const maxSlots = textMaxLength ?? cfg.maxSlots;
  const atCap = slots.length >= maxSlots;
  const hasIcons = cfg.allowedIconIds.length > 0;
  const allowedPattern = cfg.allowedChars ? new RegExp(`[^${cfg.allowedChars}]`, "g") : null;

  // When a letter tile is tapped, the next typed char replaces THAT slot.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  // Brief highlight on the last inline-grid icon tapped (dialog-free "confirm").
  const [flashIconId, setFlashIconId] = useState<string | null>(null);
  const bufferRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function touchOnce() {
    if (!touched.current) {
      touched.current = true;
      onTouch();
    }
  }
  function commit(next: KeycapSlot[]) {
    // Empty sequence writes "" so a required field still reads as unfilled.
    onChange(next.length === 0 ? "" : JSON.stringify(next));
  }

  function handleLetterInput(e: React.ChangeEvent<HTMLInputElement>) {
    // The buffer input is kept empty; read the typed delta, filter, then clear.
    let v = e.currentTarget.value;
    if (cfg.uppercase) v = v.toUpperCase();
    if (allowedPattern) v = v.replace(allowedPattern, "");
    e.currentTarget.value = "";
    if (!v) return;
    const next = [...slots];
    for (const ch of v) {
      if (editingIndex != null && next[editingIndex] && next[editingIndex].t === "L") {
        next[editingIndex] = { t: "L", ch };
        setEditingIndex(null);
      } else {
        if (next.length >= maxSlots) break;
        next.push({ t: "L", ch });
      }
    }
    commit(next);
    touchOnce();
  }

  function handleLetterKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Buffer is always empty → Backspace removes the editing slot, else the last.
    if (e.key === "Backspace" && slots.length > 0) {
      e.preventDefault();
      const idx = editingIndex ?? slots.length - 1;
      setEditingIndex(null);
      commit(slots.filter((_, i) => i !== idx));
      touchOnce();
    }
  }

  function startEditLetter(i: number) {
    setEditingIndex(i);
    bufferRef.current?.focus();
  }
  function removeSlot(i: number) {
    if (editingIndex === i) setEditingIndex(null);
    commit(slots.filter((_, idx) => idx !== i));
    touchOnce();
  }
  function addIcon(id: string) {
    if (slots.length >= maxSlots) return;
    commit([...slots, { t: "I", id }]);
    touchOnce();
    // Lightweight visual acknowledgement (there is no dialog to close now).
    setFlashIconId(id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashIconId(null), 450);
  }

  const removeBtnClass =
    "absolute -top-2 -right-2 z-10 flex items-center justify-center rounded-full text-white " +
    "before:content-[''] before:absolute before:-inset-2.5";

  return (
    <div className="flex flex-col gap-3">
      {/* Built sequence rail — only shown once at least one keycap exists. Letter
          tiles are tap-to-edit; icon tiles are display-only + removable (there
          is no dialog on the customer builder — change an icon by removing it
          and tapping another from the inline grid below). */}
      {slots.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Your keycaps">
          {slots.map((slot, i) => {
            if (slot.t === "L") {
              const isEditing = editingIndex === i;
              return (
                <div key={i} className="relative shrink-0" style={{ width: 56, height: 56 }}>
                  <button
                    type="button"
                    onClick={() => startEditLetter(i)}
                    aria-label={`Letter ${slot.ch}`}
                    className="relative w-full h-full flex items-center justify-center rounded-xl font-black"
                    style={{
                      minWidth: 56,
                      minHeight: 56,
                      background: "#fff",
                      border: `2.5px solid ${BRAND.blue}`,
                      color: BRAND.ink,
                      fontSize: 24,
                      boxShadow: isEditing
                        ? `0 0 0 3px ${BRAND.blue}35, 0 2px 0 ${BRAND.blueDark}30`
                        : `0 2px 0 ${BRAND.blueDark}30`,
                    }}
                  >
                    <span
                      className="absolute left-1.5 top-1.5 rounded-full"
                      style={{ width: 6, height: 6, background: BRAND.blue }}
                      aria-hidden="true"
                    />
                    {slot.ch}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSlot(i)}
                    aria-label="Remove keycap"
                    className={removeBtnClass}
                    style={{ width: 22, height: 22, background: "#be123c" }}
                  >
                    <X size={12} strokeWidth={3} aria-hidden="true" />
                  </button>
                </div>
              );
            }
            // Icon slot — NO colour controls (D-04), display-only + removable.
            const icon = KEYCAP_ICON_BY_ID[slot.id];
            const label = icon?.label ?? slot.id;
            return (
              <div key={i} className="relative shrink-0" style={{ width: 56, height: 56 }}>
                <div
                  aria-label={`Icon: ${label}`}
                  className="relative w-full h-full flex items-center justify-center rounded-xl"
                  style={{
                    minWidth: 56,
                    minHeight: 56,
                    background: "#fff",
                    border: `2.5px solid ${BRAND.purple}`,
                    boxShadow: `0 2px 0 ${BRAND.purple}30`,
                  }}
                >
                  <span
                    className="absolute left-1.5 top-1.5 rounded-full"
                    style={{ width: 6, height: 6, background: BRAND.purple }}
                    aria-hidden="true"
                  />
                  {icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={icon.imageUrl}
                      alt=""
                      style={{ width: 44, height: 44, objectFit: "contain" }}
                    />
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 700, color: BRAND.ink }}>{label}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeSlot(i)}
                  aria-label="Remove keycap"
                  className={removeBtnClass}
                  style={{ width: 22, height: 22, background: "#be123c" }}
                >
                  <X size={12} strokeWidth={3} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Visible text input — the primary "type your name" affordance. Typing
          appends letter tiles above via the unchanged handleLetterInput logic
          (the field itself stays empty by design — the letters live as tiles).
          Backspace removes the last / editing tile. */}
      <div
        className="flex items-center gap-2 rounded-xl px-3"
        style={{
          minHeight: 56,
          background: atCap ? "#f8fafc" : "#fff",
          border: `2px solid ${editingIndex != null ? BRAND.blue : "rgba(11,16,32,0.14)"}`,
          boxShadow: editingIndex != null ? `0 0 0 3px ${BRAND.blue}22` : "0 1px 2px rgba(11,16,32,0.05)",
          opacity: atCap ? 0.7 : 1,
        }}
      >
        <span
          className="rounded-full shrink-0"
          style={{ width: 8, height: 8, background: BRAND.blue }}
          aria-hidden="true"
        />
        <input
          ref={bufferRef}
          type="text"
          value=""
          onChange={handleLetterInput}
          onKeyDown={handleLetterKeyDown}
          disabled={atCap}
          inputMode="text"
          autoCapitalize={cfg.uppercase ? "characters" : "off"}
          aria-label="Type letters to add keycaps"
          placeholder={
            atCap
              ? "Maximum keycaps reached"
              : slots.some((s) => s.t === "L")
                ? "Keep typing…"
                : "Type your name…"
          }
          className="flex-1 min-w-0 bg-transparent outline-none text-base font-bold disabled:cursor-not-allowed"
          style={{ color: BRAND.ink, caretColor: BRAND.blue }}
        />
      </div>

      {/* Always-visible inline icon selector (no dialog on the customer builder).
          Tapping a thumbnail appends that icon to the sequence. Hidden entirely
          when the admin allowed no icons (letter-only graceful degrade). */}
      {hasIcons && (
        <div className="flex flex-col gap-1.5">
          <p
            className="text-xs font-bold uppercase tracking-wide px-1"
            style={{ color: BRAND.purple }}
          >
            Or tap an icon to add it
          </p>
          <div
            className="rounded-xl p-2"
            style={{ background: "#fff", border: "2px solid rgba(11,16,32,0.10)" }}
          >
            <div
              role="listbox"
              aria-label="Available icons"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(48px, 1fr))",
                gap: 8,
              }}
            >
              {cfg.allowedIconIds.map((id) => {
                const icon = KEYCAP_ICON_BY_ID[id];
                if (!icon) return null;
                const isFlash = flashIconId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    disabled={atCap}
                    onClick={() => addIcon(id)}
                    title={icon.label}
                    aria-label={`Add icon: ${icon.label}`}
                    className="relative flex items-center justify-center rounded-lg transition-transform active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      minWidth: 48,
                      minHeight: 48,
                      background: "#fff",
                      border: isFlash
                        ? `2.5px solid ${BRAND.green}`
                        : "2px solid rgba(115,96,242,0.25)",
                      boxShadow: isFlash
                        ? `0 0 0 3px ${BRAND.green}35`
                        : "0 1px 2px rgba(11,16,32,0.05)",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={icon.imageUrl}
                      alt=""
                      style={{ width: 40, height: 40, objectFit: "contain" }}
                    />
                    {isFlash && (
                      <Check
                        size={16}
                        strokeWidth={3}
                        className="absolute -top-1.5 -right-1.5 rounded-full"
                        style={{ color: BRAND.green, background: "#fff" }}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Shared counter + hint + Maximum-reached chip */}
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs" style={{ color: "#6b7280" }}>
          {hasIcons
            ? `Type letters above and tap icons — up to ${maxSlots} keycaps, mixed in any order.`
            : `Type up to ${maxSlots} letters for your keychain.`}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {atCap && (
            <span
              className="text-xs font-semibold rounded-full px-2 py-0.5"
              style={{ color: "#be123c", background: "#fff1f2", border: "1px solid #fecdd3" }}
            >
              Maximum reached
            </span>
          )}
          <span
            className="text-xs font-bold tabular-nums"
            style={{ color: atCap ? "#be123c" : "#94a3b8" }}
            aria-hidden="true"
          >
            {slots.length}/{maxSlots}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ConfiguratorForm — main export
// ============================================================================

export function ConfiguratorForm({ fields, values, onChange, onTouch, basePrice, textMaxLength }: Props) {
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

        const displayLabel = field.label;
        const displayHelp = field.helpText;

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
                textMaxLength={textMaxLength}
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
                allValues={values}
                onValuesChange={onChange}
                onTouch={onTouch}
                touched={touchedRef}
                basePrice={basePrice}
              />
            )}
            {field.fieldType === "keycapseq" && (
              <KeycapSeqField
                field={field}
                value={value}
                onChange={handleFieldChange}
                onTouch={onTouch}
                touched={touchedRef}
                textMaxLength={textMaxLength}
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
