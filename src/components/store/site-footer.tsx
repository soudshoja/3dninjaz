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
  const hasWhatsApp = !!settings.whatsappNumber && settings.whatsappNumber !== "60000000000";

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

        {/* Contact row — each tile conditional. If none set, block is omitted. */}
        {(hasEmail || hasPhone || hasWhatsApp) && (
          <div
            className="mb-8 grid gap-3 sm:grid-cols-3 pt-6 border-t border-zinc-200"
            aria-label="Contact"
          >
            {hasEmail && (
              <a
                href={`mailto:${settings.contactEmail}`}
                className="inline-flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-white min-h-[48px]"
              >
                <Image
                  src="/icons/ninja/emoji/contact.png"
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 object-contain"
                />
                <span className="text-sm font-semibold break-words">
                  {settings.contactEmail}
                </span>
              </a>
            )}
            {hasPhone && (
              <a
                href={`tel:${settings.contactPhone.replace(/[^\d+]/g, "")}`}
                className="inline-flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-white min-h-[48px]"
              >
                <Image
                  src="/icons/ninja/emoji/hello@128.png"
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 object-contain"
                />
                <span className="text-sm font-semibold">
                  {settings.contactPhone}
                </span>
              </a>
            )}
            {hasWhatsApp && (
              <a
                href={`https://wa.me/${settings.whatsappNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-white min-h-[48px]"
              >
                <Image
                  src="/icons/ninja/social/whatsapp.png"
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 object-contain"
                />
                <span className="text-sm font-semibold">
                  {settings.whatsappNumberDisplay || "WhatsApp us"}
                </span>
              </a>
            )}
          </div>
        )}

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
              <span className="font-[var(--font-heading)] tracking-wide text-zinc-900">
                3D <span style={{ color: BRAND.green }}>NINJAZ</span>
              </span>
              <span className="text-xs" style={{ color: BRAND.blue }}>
                © {year} {BUSINESS.legalName} · {BUSINESS.city},{" "}
                {BUSINESS.country}
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
