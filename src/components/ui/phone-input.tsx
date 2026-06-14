"use client";

/**
 * PhoneInput — controlled phone number field with country-code selector.
 *
 * Props:
 *   value     — stored MSISDN (digits only, no +), e.g. "60123456789" or ""
 *   onChange  — called with the new MSISDN when valid, or "" when invalid
 *   id        — optional id for the national number input
 *   required  — marks the national input as required
 *   label     — rendered as a <label> above the field
 *   error     — external error string (e.g. from RHF validation)
 *
 * Behaviour:
 *   - Country-code <select> (all world countries, default MY +60) sits left
 *     of the national number <input>.
 *   - While the user types, raw text is kept in local state (so partial input
 *     is preserved). On blur, sanitizeToMsisdn is run and the cleaned national
 *     number is written back into the field.
 *   - onChange is called on every keystroke with the sanitized MSISDN when
 *     valid, or "" when invalid — lets callers update their form state
 *     continuously without forcing premature error display.
 *   - A helper line tells the user to double-check their WhatsApp number.
 *   - When a valid MSISDN is present, a confirmation line shows the formatted
 *     number so the user can confirm it looks right.
 *   - Errors (internal sanitize errors OR external `error` prop) are shown in
 *     red below the helper line.
 */

import { type ReactNode, useEffect, useId, useState } from "react";
import { COUNTRY_CODES, DEFAULT_DIAL } from "@/lib/country-codes";
import { sanitizeToMsisdn, splitMsisdn, formatNational } from "@/lib/phone";
import { BRAND } from "@/lib/brand";

// All dial codes (deduplicated by dial string for the splitMsisdn lookup)
const ALL_DIALS = Array.from(new Set(COUNTRY_CODES.map((c) => c.dial)));

interface PhoneInputProps {
  value: string;          // stored MSISDN ("60123456789" or "")
  onChange: (msisdn: string) => void;
  id?: string;
  required?: boolean;
  label?: ReactNode;
  error?: string | null;
}

export function PhoneInput({
  value,
  onChange,
  id,
  required,
  label,
  error: externalError,
}: PhoneInputProps) {
  const autoId = useId();
  const inputId = id ?? `phone-${autoId}`;

  // Derive initial dial + national from the stored MSISDN
  const { dial: initDial, national: initNational } = splitMsisdn(value, ALL_DIALS);

  const [selectedDial, setSelectedDial] = useState(initDial || DEFAULT_DIAL);
  const [nationalRaw, setNationalRaw] = useState(initNational);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // Sync when `value` changes externally (e.g. form reset, autofill)
  useEffect(() => {
    const { dial, national } = splitMsisdn(value, ALL_DIALS);
    setSelectedDial(dial || DEFAULT_DIAL);
    setNationalRaw(national);
    if (!value) {
      setInternalError(null);
      setTouched(false);
    }
  // Only sync on external value changes, not our own emits
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleDialChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newDial = e.target.value;
    setSelectedDial(newDial);
    // Re-sanitize with the new dial code
    const result = sanitizeToMsisdn(nationalRaw, newDial);
    if (result.ok) {
      setInternalError(null);
      onChange(result.msisdn);
    } else {
      // If national is empty we still allow — user may not have typed yet
      if (!nationalRaw.trim()) {
        onChange("");
        setInternalError(null);
      } else {
        setInternalError(result.error ?? null);
        onChange("");
      }
    }
  }

  function handleNationalChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setNationalRaw(raw);

    const result = sanitizeToMsisdn(raw, selectedDial);
    if (result.ok) {
      setInternalError(null);
      onChange(result.msisdn);
    } else {
      // While typing, only propagate error after the user has touched the field
      onChange("");
      if (touched || raw.trim()) {
        setInternalError(result.error ?? null);
      } else {
        setInternalError(null);
      }
    }
  }

  function handleBlur() {
    setTouched(true);
    if (!nationalRaw.trim()) {
      setInternalError(null);
      return;
    }
    const result = sanitizeToMsisdn(nationalRaw, selectedDial);
    if (result.ok) {
      // Write back cleaned national (strips leading 0, spaces, etc.)
      setNationalRaw(result.national);
      setInternalError(null);
      onChange(result.msisdn);
    } else {
      setInternalError(result.error ?? null);
      onChange("");
    }
  }

  // Compute confirmation string for valid MSISDN
  const confirmDisplay = (() => {
    if (!nationalRaw.trim()) return null;
    const r = sanitizeToMsisdn(nationalRaw, selectedDial);
    if (!r.ok) return null;
    return `+${selectedDial} ${formatNational(r.national, selectedDial)}`;
  })();

  const showError = (touched || !!nationalRaw.trim()) && (internalError || externalError);
  const activeError = externalError || internalError;

  // Shared input style — matches checkout/address-form.tsx idiom
  const inputBase =
    "w-full rounded-xl border-2 px-4 py-3 min-h-[48px] focus:outline-none focus:ring-2 bg-white transition-colors text-sm";
  const borderNormal = { borderColor: `${BRAND.ink}22` } as React.CSSProperties;
  const borderError = {} as React.CSSProperties; // Tailwind handles red border
  const ringNormal = "focus:ring-[#1E8BFF40]";
  const ringError = "border-red-500 focus:ring-red-300 bg-red-50";

  const selectCls = [
    "shrink-0 rounded-xl border-2 px-2 py-3 min-h-[48px] focus:outline-none focus:ring-2 bg-white transition-colors text-sm cursor-pointer pr-6",
    showError ? ringError : ringNormal,
  ].join(" ");

  const inputCls = [inputBase, showError ? ringError : ringNormal].join(" ");

  return (
    <div className="space-y-1">
      {label ? (
        <label
          htmlFor={inputId}
          className="block text-sm font-semibold mb-1"
          style={{ color: BRAND.ink }}
        >
          {label}
          {required ? (
            <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>
          ) : null}
        </label>
      ) : null}

      <div className="flex gap-2 items-stretch">
        {/* Country-code selector */}
        <select
          aria-label="Country code"
          value={selectedDial}
          onChange={handleDialChange}
          className={selectCls}
          style={showError ? borderError : borderNormal}
        >
          {COUNTRY_CODES.map((c) => (
            <option key={`${c.iso2}-${c.dial}`} value={c.dial}>
              {c.name} +{c.dial}
            </option>
          ))}
        </select>

        {/* National number input */}
        <input
          id={inputId}
          type="text"
          inputMode="tel"
          autoComplete="tel-national"
          value={nationalRaw}
          onChange={handleNationalChange}
          onBlur={handleBlur}
          required={required}
          aria-invalid={!!showError}
          aria-describedby={showError ? `${inputId}-err` : `${inputId}-hint`}
          placeholder={selectedDial === "60" ? "12-345 6789" : "National number"}
          className={inputCls}
          style={showError ? borderError : borderNormal}
        />
      </div>

      {/* Helper / confirmation line */}
      {!showError ? (
        <p
          id={`${inputId}-hint`}
          className="text-xs mt-1"
          style={{ color: "#64748b" }}
        >
          {confirmDisplay
            ? `We’ll save this as ${confirmDisplay}`
            : "Double-check your WhatsApp number — this is how we’ll contact you."}
        </p>
      ) : null}

      {/* Error message */}
      {showError && activeError ? (
        <p
          id={`${inputId}-err`}
          className="text-xs text-red-600 mt-1"
          role="alert"
        >
          {activeError}
        </p>
      ) : null}
    </div>
  );
}
