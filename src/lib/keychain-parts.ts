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

import { ensureOrderItemConfigData } from "@/lib/config-fields";

export type KeychainParts = {
  /** Quoted customer name — first token in double-quotes, e.g. "ATHIYYA". */
  name: string;
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
  const name = nameMatch ? nameMatch[1] : "";

  return {
    name: name.trim(),
    base: base.trim(),
    clicker: clicker.trim(),
    letter: letter.trim(),
  };
}
