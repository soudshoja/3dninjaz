/**
 * Shade-aware colour sorting.
 *
 * Pure module — NO DB / node-only imports. Safe to import from client
 * components or server actions.
 *
 * `sortByShade(colours)` orders an array of colour-like records (anything
 * with a `hex` and `name` property) by:
 *   1. Hue family bucket  (red → orange → yellow → green → cyan → blue
 *                          → purple → pink/magenta, then achromatic last)
 *   2. Lightness DESC within each chromatic bucket (light pastels first,
 *      dark shades last)
 *   3. Saturation DESC tiebreaker
 *   4. Name ASC final stable tiebreaker
 *
 * The achromatic bucket (saturation < 10%) is appended at the end and is
 * sorted by lightness DESC (white → grey → black) so the rainbow flows
 * and ends with neutrals.
 *
 * Hue bucket cutoffs:
 *   Red       0–15° + 345–360°
 *   Orange    15–45°
 *   Yellow    45–70°
 *   Green     70–170°
 *   Cyan      170–200°
 *   Blue      200–250°
 *   Purple    250–290°
 *   Pink/Mag. 290–345°
 *
 * Names / hex / schema are never mutated — the function returns a NEW
 * array; the input is not sorted in place.
 */

export type Hsl = { h: number; s: number; l: number };

/**
 * Convert a `#RRGGBB` hex string to HSL ({h: 0-360, s: 0-100, l: 0-100}).
 * Handles 3-digit shorthand (#RGB) and is case-insensitive. Falls back to
 * black ({h:0,s:0,l:0}) for malformed input rather than throwing — keeps
 * a single bad row from breaking a whole picker.
 */
export function hexToHsl(hexInput: string): Hsl {
  let hex = hexInput.trim().replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex.split("").map((c) => c + c).join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return { h: 0, s: 0, l: 0 };
  }
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

/**
 * Map an HSL tuple to a numeric bucket index. Lower index = earlier in the
 * sorted output. The achromatic bucket is given the highest index so it
 * always lands at the end of the rainbow.
 *
 * Achromatic = saturation < 10% (covers near-white, grey, black, and very
 * desaturated tints that read as "neutral" to the eye).
 */
export function hueBucket({ h, s }: Hsl): number {
  if (s < 10) return 8; // Achromatic — last
  // Red wraps the 0/360 boundary
  if (h >= 345 || h < 15) return 0; // Red
  if (h < 45) return 1;              // Orange
  if (h < 70) return 2;              // Yellow
  if (h < 170) return 3;             // Green
  if (h < 200) return 4;             // Cyan
  if (h < 250) return 5;             // Blue
  if (h < 290) return 6;             // Purple
  return 7;                          // Pink / Magenta (290-345)
}

/**
 * Stable shade-aware sort. Returns a new array; input is not mutated.
 *
 * Within each chromatic bucket: lightness DESC (light → dark), then
 * saturation DESC, then name ASC for deterministic ordering.
 *
 * Achromatic bucket (last): lightness DESC (white → grey → black), then
 * name ASC.
 */
export function sortByShade<T extends { hex: string; name: string }>(
  colours: readonly T[],
): T[] {
  // Pre-compute HSL + bucket once per row to avoid recomputing in O(n log n)
  // comparator calls.
  const decorated = colours.map((c) => {
    const hsl = hexToHsl(c.hex);
    return { c, hsl, bucket: hueBucket(hsl) };
  });

  decorated.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket - b.bucket;
    // Lightness DESC for ALL buckets — chromatic light-to-dark, achromatic
    // white-to-black.
    if (a.hsl.l !== b.hsl.l) return b.hsl.l - a.hsl.l;
    // Saturation DESC tiebreaker (chromatic only — for achromatics this is
    // ~0 on both sides so it's a no-op).
    if (a.hsl.s !== b.hsl.s) return b.hsl.s - a.hsl.s;
    return a.c.name.localeCompare(b.c.name);
  });

  return decorated.map((d) => d.c);
}
