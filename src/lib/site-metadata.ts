/**
 * Site-wide brand metadata for 3D Ninjaz.
 *
 * Single source of truth for name, URL, description, keywords, locale, theme
 * color, social handles, and default Open Graph image. Imported by
 * `src/app/layout.tsx` and any page-level `generateMetadata()` helpers.
 *
 * Per Phase 4 DECISIONS.md (2026-04-20):
 *   - D-02: trading name is "3D Ninjaz" (no Sdn Bhd / Enterprise suffix)
 *   - D-04: DPO / data-request mailbox is info@3dninjaz.com
 *   - D-05: Instagram / TikTok handles pending — leave empty placeholders
 *
 * TODO: replace /og-default.png with a dedicated 1200x630 social card in a
 * future plan (v1 uses public/logo.png as a placeholder).
 */

export const SITE = {
  name: "3D Ninjaz",
  legalName: "3D Ninjaz",
  url: "https://3dninjaz.com",
  tagline: "Stealthy 3D-printed goods, made in Malaysia.",
  description:
    "Playful, kid-friendly 3D-printed goods. Ninja crafted in Kuala Lumpur. Shop unique designs with Small / Medium / Large sizing and fast PayPal checkout in MYR.",
  keywords: [
    "3D printing Malaysia",
    "3D printed products",
    "Kuala Lumpur 3D print",
    "PLA prints",
    "custom 3D prints",
    "ninja designs",
  ],
  locale: "en_MY",
  themeColor: "#0B1020",
  socials: {
    // Q4-05 pending — user will provide Instagram + TikTok URLs later.
    instagram: "",
    tiktok: "",
    // D-04: DPO / data-request mailbox.
    email: "info@3dninjaz.com",
  },
  ogImage: "/og-default.png",
} as const;

export type SiteMetadata = typeof SITE;
