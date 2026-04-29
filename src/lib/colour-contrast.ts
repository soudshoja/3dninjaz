/**
 * Phase 18 — WCAG 2.2 SC 1.4.11 luminance helper.
 *
 * Returns the readable text colour for a given hex background. Used by the
 * /shop colour chip filter (active-state pill background tinted with hex)
 * and the /admin/colours picker preview chips.
 *
 * Threshold 0.5: dark text on light hex, white text on dark hex.
 * "#0B1020" matches BRAND.ink (src/lib/brand.ts:17) — kept inline (not
 * imported) so this module stays a zero-dep pure helper.
 */

export function getReadableTextOn(hex: string): "#FFFFFF" | "#0B1020" {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const lin = (v: number) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.5 ? "#0B1020" : "#FFFFFF";
}
