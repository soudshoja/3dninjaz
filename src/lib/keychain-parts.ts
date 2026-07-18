/**
 * Keychain batch production — part extraction helpers.
 *
 * A "Keyboard Clicker" keychain prints as TWO physical parts:
 *   1. BASE — one colour, printed alone.
 *   2. CLICKER + LETTER — printed together as one piece.
 *
 * The customer name and colour choices are encoded in the order item's
 * configurationData.computedSummary, e.g.:
 *   "ATHIYYA" (7 your name) · Magenta base · Matte Pastel Periwinkle clicker · Matte Pastel Candy letter
 */

import {
  ensureOrderItemConfigData,
  ensureConfigurationData,
  ensureKeycapSequence,
  type KeycapSlot,
} from "@/lib/config-fields";

export type KeychainParts = {
  /** Quoted customer name — first token in double-quotes, e.g. "ATHIYYA". */
  name: string;
  /**
   * Number of keycap boxes to print = number of letters in the name. Each
   * letter is its own keycap, so a 9-letter name = 9 boxes. Read from the
   * "(N your name)" token in the summary; falls back to name.length.
   */
  letters: number;
  /** Base colour, e.g. "Magenta". */
  base: string;
  /** Clicker colour, e.g. "Matte Pastel Periwinkle". */
  clicker: string;
  /** Letter colour, e.g. "Matte Pastel Candy". */
  letter: string;
};

const PARTS_RE =
  /·\s*(.+?)\s+base\s*·\s*(.+?)\s+clicker\s*·\s*(.+?)\s+letter/i;
const NAME_RE = /"([^"]*)"/;
const LETTER_COUNT_RE = /\((\d+)\s+your name\)/i;

/**
 * Parse keychain part details from an order item's configurationData blob.
 *
 * Returns null when the configurationData is absent, cannot be parsed, or the
 * computedSummary doesn't match the expected keychain pattern (i.e. the item
 * is not a keychain line — skip it).
 */
export function parseKeychainParts(
  configurationData: string | null | undefined,
): KeychainParts | null {
  const cfg = ensureOrderItemConfigData(configurationData);
  if (!cfg?.computedSummary) return null;

  const summary = cfg.computedSummary;

  const partsMatch = PARTS_RE.exec(summary);
  if (!partsMatch) return null;

  const [, base, clicker, letter] = partsMatch;

  const nameMatch = NAME_RE.exec(summary);
  const name = (nameMatch ? nameMatch[1] : "").trim();

  // Box count = letters in the name. Prefer the "(N your name)" token; fall
  // back to the trimmed name length (no spaces — names are A-Z only).
  const countMatch = LETTER_COUNT_RE.exec(summary);
  const letters = countMatch
    ? parseInt(countMatch[1], 10)
    : name.replace(/\s/g, "").length;

  return {
    name,
    letters,
    base: base.trim(),
    clicker: clicker.trim(),
    letter: letter.trim(),
  };
}

// ============================================================================
// Phase 25 (25-03) — structured keycap sequence parser (NEW, parallel path).
//
// D-06 backwards-compat: this is ADDITIVE. It reads the mixed letter+icon
// sequence directly from the structured `configurationData.values[seqFieldId]`
// (a JSON-array-in-string decoded by the fail-soft ensureKeycapSequence) rather
// than regex-parsing the human summary. The legacy PARTS_RE / parseKeychainParts
// path above is untouched — existing ROUND and historical letter-only SQUARE
// orders keep parsing exactly as before. Production batching (Plan 25-04) reads
// letters vs icons through THIS path, falling back to parseKeychainParts when
// the sequence is absent (returns null).
// ============================================================================

export type KeycapSequenceParts = {
  /** The decoded, validated slot list in customer order. */
  slots: KeycapSlot[];
  /** Total keycaps = letters + icons (D-12 pricing keys off this). */
  slotCount: number;
  /** Letter-slot count — drives BASE/CLICKER print batches (Pitfall 1). */
  letterCount: number;
  /** Icon-slot count — drives the icon print batch. */
  iconCount: number;
  /** The letter characters, in order. */
  letters: string[];
  /** The icon catalog ids, in order. */
  icons: string[];
};

/**
 * Structured-first read of a keycap sequence from an order item's / cart line's
 * configurationData blob.
 *
 * Returns null when the field carries no keycap sequence (absent value or empty
 * array) — the caller then falls back to the legacy `parseKeychainParts`. The
 * three counts are kept EXPLICIT and distinct (Pitfall 1): never conflate
 * `slotCount` with `letterCount`.
 */
export function parseKeycapSequence(
  raw: unknown,
  seqFieldId: string,
): KeycapSequenceParts | null {
  const cfg = ensureConfigurationData(raw);
  const slots = ensureKeycapSequence(cfg?.values?.[seqFieldId]);
  if (slots.length === 0) return null;

  const letters = slots
    .filter((s): s is { t: "L"; ch: string } => s.t === "L")
    .map((s) => s.ch);
  const icons = slots
    .filter((s): s is { t: "I"; id: string } => s.t === "I")
    .map((s) => s.id);

  return {
    slots,
    slotCount: slots.length,
    letterCount: letters.length,
    iconCount: icons.length,
    letters,
    icons,
  };
}
