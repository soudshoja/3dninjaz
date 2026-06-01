import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { BRAND } from "@/lib/brand";
import { BUSINESS } from "@/lib/business-info";
import { getSiteSettings } from "@/actions/admin-settings";
import { SocialLinks, type SocialConfig } from "@/components/store/social-links";
import { FooterSubscribeForm } from "@/components/store/footer-subscribe-form";

/**
 * Unified customer-facing footer (Phase 4 Plan 04-03 + Phase 11 social wiring).
 *
 * Reads store_settings singleton server-side and renders:
 *   - link groups (Shop / Company / Legal)
 *   - brand row + contact row (email / phone / WhatsApp — each conditional)
 *   - social icon row via <SocialLinks> (Phase 11). Empty settings → no row.
 *
 * If NO social URLs are configured the SocialLinks component returns null and
 * the footer falls back to a quiet "© 3D Ninjaz" line — no empty div, no
 * dangling icons. Same for the contact row: each tile only renders when its
 * field has a value.
 */

// Normalize a URL-like setting. `#` and empty string both mean "not set".
function usable(v: string | null | undefined): v is string {
  if (!v) return false;
  const t = v.trim();
  return t !== "" && t !== "#";
}

export async function SiteFooter() {
  const year = new Date().getFullYear();
  const settings = await getSiteSettings();

  const socialConfig: SocialConfig = {
    twitter: settings.twitterUrl,
    whatsapp: settings.whatsappUrl,
    instagram: settings.instagramUrl,
    facebook: settings.facebookUrl,
    tiktok: settings.tiktokUrl,
    like: settings.likeUrl,
  };

  const hasEmail = !!settings.contactEmail;
  const hasPhone = usable(settings.contactPhone);
  const hasWhatsApp = !!settings.whatsappNumber && settings.whatsappNumber.length > 0;

  return (
    <footer
      className="border-t border-zinc-200"
      style={{
        backgroundColor: "#FAFAFA",
        color: BRAND.ink,
      }}
    >
      <div className="max-w-6xl mx-auto px-6 md:px-8 py-12">
        {/* Newsletter subscribe — Phase 12 */}
        <div className="mb-10 pb-10 border-b border-zinc-200 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/icons/ninja/emoji/hello@128.png"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 object-contain"
            />
            <div>
              <p
                className="font-[var(--font-heading)] text-lg"
                style={{ color: BRAND.ink }}
              >
                Get updates from the ninjaz
              </p>
              <p className="text-xs text-zinc-500">
                New drops, restocks, and the occasional tip. No spam.
              </p>
            </div>
          </div>
          <FooterSubscribeForm />
        </div>

        {/* Link groups */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 mb-10">
          <div>
            <h2 className="font-[var(--font-heading)] text-sm tracking-[0.2em] text-zinc-500 mb-3">
              SHOP
            </h2>
            <ul className="flex flex-col">
              <li>
                <Link
                  href="/"
                  className="block py-3 min-h-[48px] text-zinc-700 hover:text-zinc-900"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  href="/shop"
                  className="block py-3 min-h-[48px] text-zinc-700 hover:text-zinc-900"
                >
                  Shop all
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-[var(--font-heading)] text-sm tracking-[0.2em] text-zinc-500 mb-3">
              COMPANY
            </h2>
            <ul className="flex flex-col">
              <li>
                <Link
                  href="/about"
                  className="block py-3 min-h-[48px] text-zinc-700 hover:text-zinc-900"
                >
                  About
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="block py-3 min-h-[48px] text-zinc-700 hover:text-zinc-900"
                >
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-[var(--font-heading)] text-sm tracking-[0.2em] text-zinc-500 mb-3">
              LEGAL
            </h2>
            <ul className="flex flex-col">
              <li>
                <Link
                  href="/privacy"
                  className="block py-3 min-h-[48px] text-zinc-700 hover:text-zinc-900"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="block py-3 min-h-[48px] text-zinc-700 hover:text-zinc-900"
                >
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Contact details are shown once in the brand bar below (no duplicate row). */}

        {/* Brand + socials row */}
        <div className="flex flex-col md:flex-row items-center md:items-center justify-between gap-6 pt-8 border-t border-zinc-200 text-center md:text-left">
          <div className="flex items-center gap-3">
            <Logo size={40} />
            <Image
              src="/icons/ninja/emoji/thank-you@128.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 object-contain hidden sm:block"
            />
            <div className="flex flex-col">
              <span className="font-[var(--font-heading)] text-lg tracking-wide text-zinc-900">
                3D <span style={{ color: BRAND.green }}>NINJAZ</span>
              </span>
              <span className="mt-0.5 text-xs text-zinc-500">
                © {year} {BUSINESS.legalName} · {BUSINESS.city},{" "}
                {BUSINESS.country}
              </span>
              {/* Inline contact — email + phone alongside the brand line */}
              <span className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-zinc-600 md:justify-start">
                <a
                  href={`mailto:${BUSINESS.contactEmail}`}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-1 transition-colors hover:text-zinc-900"
                  aria-label={`Email ${BUSINESS.contactEmail}`}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  {BUSINESS.contactEmail}
                </a>
                <span className="text-zinc-300" aria-hidden="true">
                  ·
                </span>
                <a
                  href={`tel:+${BUSINESS.whatsappNumber}`}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-1 transition-colors hover:text-zinc-900"
                  aria-label={`Call ${BUSINESS.whatsappNumberDisplay}`}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  {BUSINESS.whatsappNumberDisplay}
                </a>
              </span>
            </div>
          </div>

          {/* SocialLinks returns null when all URLs are blank — no empty div. */}
          <SocialLinks config={socialConfig} size={44} />
        </div>
      </div>
    </footer>
  );
}
