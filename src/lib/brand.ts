/**
 * Unified brand color palette for 3D Ninjaz.
 * Source of truth — referenced by every customer-facing and admin surface
 * (D-01, Phase 2 DECISIONS.md).
 *
 * Hex values are also mirrored as CSS custom properties in globals.css
 * (--brand-blue, --brand-green, --brand-purple, --brand-ink, --brand-cream)
 * and exposed to Tailwind v4 utilities via @theme inline.
 */
export const BRAND = {
  blue: "#1877F2",
  green: "#25D366",
  purple: "#7360F2",
  blueDark: "#0B5ED7",
  greenDark: "#1AAE54",
  purpleDark: "#5546B3",
  ink: "#0B1020",
  cream: "#F7FAF4",
} as const;

export type BrandColor = keyof typeof BRAND;
