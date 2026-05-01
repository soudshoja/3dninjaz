/**
 * Single source of truth for 3D Ninjaz business information.
 *
 * Referenced by:
 *   - src/app/(store)/about/page.tsx
 *   - src/app/(store)/contact/page.tsx
 *   - src/app/(store)/privacy/page.tsx
 *   - src/app/(store)/terms/page.tsx
 *   - src/components/store/whatsapp-cta.tsx
 *
 * Decisions reflected here (Phase 4 DECISIONS.md, 2026-04-20):
 *   D-01  WhatsApp number — placeholder `60000000000`; user to supply real
 *         MY-format number before launch. Plan 04-04 treats the placeholder
 *         as a hard blocker.
 *   D-02  Legal / trading name — "3D Ninjaz" (no Sdn Bhd / Enterprise suffix).
 *   D-03  SST / tax status — NOT registered. No SST or tax-number references
 *         anywhere in copy.
 *   D-04  DPO / data-request inbox — info@3dninjaz.com.
 *   D-05  Social handles — pending; use `#` placeholders until user provides
 *         Instagram + TikTok URLs.
 *   D-06  Retention — 7 years orders, 3 years accounts post-last-login.
 */
export const BUSINESS = {
  legalName: "3D Ninjaz",
  tradingName: "3D Ninjaz",
  city: "Kuala Lumpur",
  country: "Malaysia",
  // Operations + general customer contact. D-04.
  contactEmail: "info@3dninjaz.com",
  // Data-protection officer / PDPA data-request inbox. D-04.
  dpoEmail: "info@3dninjaz.com",
  // TODO: Q4-01 / D-01 — replace before public launch (Plan 04-04 hard blocker).
  whatsappNumber: "60000000000",
  whatsappNumberDisplay: "+60 00 000 0000",
  socials: {
    // TODO: D-05 — replace `#` with real Instagram URL once handle confirmed.
    instagram: "#",
    // TODO: D-05 — replace `#` with real TikTok URL once handle confirmed.
    tiktok: "#",
    email: "mailto:info@3dninjaz.com",
  },
  retention: {
    orders:
      "7 years from the date of the order (Malaysian accounting and record-keeping practice)",
    account:
      "3 years after your last sign-in; you can request earlier deletion at any time",
    marketing: "Until you unsubscribe",
  },
  hours: "Mon-Fri 11 AM – 6 PM MYT (Malaysia Time)",
} as const;

export type BusinessInfo = typeof BUSINESS;

/**
 * Build a wa.me deep-link with a URL-encoded pre-filled message.
 *
 * Usage: `<a href={whatsappLink("Hi 3D Ninjaz, I have a question.")}>`
 *
 * Security note (threat T-04-02-02): `encodeURIComponent` neutralises any
 * injection attempts even if future callers pass user-supplied content.
 * Today every caller passes a hard-coded string from a page component.
 */
export function whatsappLink(
  message = "Hi 3D Ninjaz, I have a question.",
): string {
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${BUSINESS.whatsappNumber}?text=${encoded}`;
}

/**
 * Returns true while the WhatsApp number is still the placeholder value.
 * UI can use this to render a "pending" badge so customers (and QA) know
 * the link is not yet the real destination.
 */
export function isWhatsAppPlaceholder(): boolean {
  return BUSINESS.whatsappNumber === "60000000000";
}
