/**
 * Pure phone-number helpers — no I/O, no side effects.
 *
 * Storage format: MSISDN = country code + national digits, digits only, NO "+".
 * e.g. "60123456789"  (Malaysia, matches normalizeMsisdn in whatsapp/events.ts)
 *      "447911123456" (UK)
 *      "14155552671"  (US)
 *
 * Also re-exports the original MY-only helper for backwards compatibility.
 */

import { DEFAULT_DIAL } from "@/lib/country-codes";

export interface SanitizeResult {
  ok: boolean;
  msisdn: string;
  national: string;
  error?: string;
}

/**
 * Convert a raw user-typed phone string + a selected dial code into a stored
 * MSISDN (digits only, country-code prefix, no +).
 *
 * Rules (match normalizeMsisdn behaviour from whatsapp/events.ts for dial="60"):
 *  1. Strip all non-digits.
 *  2. If empty → error.
 *  3. If starts with "00" → strip the 00 (international dialling prefix).
 *  4. If starts with "0" → replace leading 0 with the dial code (trunk prefix).
 *  5. If does NOT already start with the dial code → prepend it.
 *  6. Else (already has the dial code) → leave as-is.
 *  7. national = msisdn.slice(dial.length)
 *  8. Validate national length: 6–14 digits.
 */
export function sanitizeToMsisdn(
  raw: string,
  dial: string,
): SanitizeResult {
  let digits = raw.replace(/\D/g, "");

  if (!digits) {
    return { ok: false, msisdn: "", national: "", error: "Enter a phone number." };
  }

  // International dialling prefix 00 → strip and treat remainder as full MSISDN
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  // Trunk zero → replace with country code
  else if (digits.startsWith("0")) {
    digits = dial + digits.slice(1);
  }
  // Bare national (doesn't start with the country code) → prepend
  else if (!digits.startsWith(dial)) {
    digits = dial + digits;
  }
  // else: already has the country code — leave as-is

  const national = digits.slice(dial.length);

  // Malaysian mobile numbers MUST be 01X-XXXXXXX(X) — i.e. national part starts
  // with "1" and is 9–10 digits (MSISDN 60 + 9/10 = 11/12 digits). This catches
  // mistyped short numbers like "607024276" (national "7024276") that the old
  // generic 6–14 rule let through, which then silently fail WhatsApp delivery
  // (normalizeMsisdn rejects them). Other countries keep the generic rule.
  if (dial === "60") {
    if (!/^1\d{8,9}$/.test(national)) {
      return {
        ok: false,
        msisdn: digits,
        national,
        error: "Enter a valid Malaysian mobile number, e.g. 012-345 6789.",
      };
    }
    return { ok: true, msisdn: digits, national };
  }

  if (national.length < 6 || national.length > 14) {
    return {
      ok: false,
      msisdn: digits,
      national,
      error: "That number looks too short or too long — please check it.",
    };
  }

  return { ok: true, msisdn: digits, national };
}

/**
 * Split a stored MSISDN back into { dial, national } by trying the longest
 * matching dial from knownDials first (greedy, to avoid "1" eating "1242").
 * Falls back to DEFAULT_DIAL ("60") if nothing matches.
 */
export function splitMsisdn(
  msisdn: string,
  knownDials: string[],
): { dial: string; national: string } {
  if (!msisdn) return { dial: DEFAULT_DIAL, national: "" };

  // Sort by length descending so longer prefixes (e.g. "1242") win over "1"
  const sorted = [...knownDials].sort((a, b) => b.length - a.length);

  for (const d of sorted) {
    if (msisdn.startsWith(d)) {
      return { dial: d, national: msisdn.slice(d.length) };
    }
  }

  // No match — fall back to Malaysia
  return { dial: DEFAULT_DIAL, national: msisdn };
}

/**
 * Format a national number for display readability.
 * e.g. MY "123456789" → "12-345 6789"
 */
export function formatNational(national: string, dial: string): string {
  const digits = national.replace(/\D/g, "");

  // MY mobile: 9–10 national digits
  if (dial === "60") {
    if (digits.length >= 9) {
      const prefix = digits.slice(0, 2);
      const mid = digits.slice(2, 5);
      const end = digits.slice(5);
      return `${prefix}-${mid} ${end}`.trim();
    }
  }

  // Generic grouping
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)} ${digits.slice(6)}`;
}

/**
 * Backwards-compat: MY-only normalizer used by guest-order linking.
 * Prefer sanitizeToMsisdn for new code.
 */
export function normalizePhoneMy(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.startsWith("60")) return digits;
  if (digits.startsWith("0")) return "60" + digits.slice(1);
  return digits;
}
