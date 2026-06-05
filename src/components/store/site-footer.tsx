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
 * Redesigned (ui-ux-pro-max) for clearer organisation:
 *   - A soft rounded newsletter panel up top.
 *   - A 4-column grid: brand + socials, then Shop / Company / Legal link groups.
 *   - A clean bottom bar: copyright on the left, contact (email · phone) on the
 *     right — no longer all crammed into one stacked block.
 *
 * Reads the store_settings singleton server-side. SocialLinks returns null when
 * no social URLs are configured; each contact link only renders when its field
 * has a value.
 */

// Resayil brand orange (developer credit link) — https://resayil.io/
const RESAYIL_ORANGE = "#FF6A00";

// Normalize a URL-like setting. `#` and empty string both mean "not set".
function usable(v: string | null | undefined): v is string {
  if (!v) return false;
  const t = v.trim();
  return t !== "" && t !== "#";
}

const LINK_GROUPS = [
  {
    title: "SHOP",
    links: [
      { href: "/", label: "Home" },
      { href: "/shop", label: "Shop all" },
    ],
  },
  {
    title: "COMPANY",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "LEGAL",
    links: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
    ],
  },
] as const;

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

  const hasEmail = !!settings.contactEmail || !!BUSINESS.contactEmail;
  const email = settings.contactEmail || BUSINESS.contactEmail;
  const hasPhone =
    usable(settings.contactPhone) ||
    (!!BUSINESS.whatsappNumber && BUSINESS.whatsappNumber.length > 0);
  const phoneHref = `tel:+${BUSINESS.whatsappNumber}`;
  const phoneDisplay = BUSINESS.whatsappNumberDisplay;

  return (
    <footer
      className="border-t border-zinc-200"
      style={{ backgroundColor: "#FAFAFA", color: BRAND.ink }}
    >
      <div className="max-w-6xl mx-auto px-6 md:px-8 py-12">
        {/* ── Newsletter panel ─────────────────────────────────────────── */}
        <div
          className="rounded-3xl px-6 py-7 md:px-8 md:py-8 flex flex-col gap-5 md:flex-row md:items-center md:justify-between"
          style={{
            background: "#ffffff",
            border: `2px solid ${BRAND.ink}10`,
            boxShadow: `0 5px 0 ${BRAND.ink}0a, 0 14px 30px ${BRAND.ink}0a`,
          }}
        >
          <div className="flex items-center gap-3">
            <Image
              src="/icons/ninja/emoji/hello@128.png"
              alt=""
              width={44}
              height={44}
              className="h-11 w-11 object-contain shrink-0"
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
          <div className="w-full md:w-auto md:min-w-[320px]">
            <FooterSubscribeForm />
          </div>
        </div>

        {/* ── Main grid: brand + link groups ───────────────────────────── */}
        <div className="mt-12 grid grid-cols-2 gap-8 sm:grid-cols-2 md:grid-cols-4 md:gap-12">
          {/* Brand + socials */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5">
              <Logo size={40} />
              <span className="font-[var(--font-heading)] text-lg tracking-wide text-zinc-900">
                3D <span style={{ color: BRAND.green }}>NINJAZ</span>
              </span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-zinc-500">
              Unique 3D-printed products, made to order in Kuala Lumpur.
            </p>
            {/* SocialLinks returns null when all URLs are blank. */}
            <div className="mt-4">
              <SocialLinks config={socialConfig} size={44} />
            </div>
          </div>

          {/* Link groups */}
          {LINK_GROUPS.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="font-[var(--font-heading)] text-xs tracking-[0.2em] text-zinc-500 mb-2">
                {group.title}
              </h2>
              <ul className="flex flex-col">
                {group.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="block py-2.5 min-h-[44px] text-sm text-zinc-700 transition-colors hover:text-zinc-900"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* ── Bottom bar: copyright + contact ──────────────────────────── */}
        <div className="mt-10 pt-6 border-t border-zinc-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-center sm:text-left">
          <div className="text-xs text-zinc-500">
            <p>
              © {year} {BUSINESS.legalName}. All rights reserved. ·{" "}
              {BUSINESS.city}, {BUSINESS.country}
            </p>
            <p className="mt-1">
              Developed by{" "}
              <a
                href="https://resayil.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold transition-opacity hover:opacity-80"
                style={{ color: RESAYIL_ORANGE }}
              >
                Resayil
              </a>
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-zinc-600 sm:justify-end">
            {hasEmail ? (
              <a
                href={`mailto:${email}`}
                className="inline-flex items-center gap-1.5 min-h-[40px] transition-colors hover:text-zinc-900"
                aria-label={`Email ${email}`}
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
                {email}
              </a>
            ) : null}
            {hasEmail && hasPhone ? (
              <span className="text-zinc-300" aria-hidden="true">
                ·
              </span>
            ) : null}
            {hasPhone ? (
              <a
                href={phoneHref}
                className="inline-flex items-center gap-1.5 min-h-[40px] transition-colors hover:text-zinc-900"
                aria-label={`Call ${phoneDisplay}`}
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
                {phoneDisplay}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </footer>
  );
}
