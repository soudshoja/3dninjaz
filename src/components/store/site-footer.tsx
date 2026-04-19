import Link from "next/link";
// lucide-react v1 does not ship brand glyphs (no Instagram / TikTok icons).
// Camera reads clearly as "photo social" for Instagram; Music2 as "short-form
// video/audio" for TikTok. Both are neutral — we're not trying to counterfeit
// the brand marks. When lucide-react upgrades or the user provides real
// socials (D-05), swap these for brand icons or a dedicated icon set.
import { Camera, Music2, Mail } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { BRAND } from "@/lib/brand";
import { BUSINESS } from "@/lib/business-info";

/**
 * Unified customer-facing footer (Phase 4 Plan 04-03).
 *
 * Three link groups (Shop / Company / Legal) plus a brand + social row.
 * On mobile each column stacks vertically at block-level tap-target heights
 * (py-3 → ~48px with default line-height). Desktop (≥ 768px) renders the
 * three columns side-by-side under the brand row.
 *
 * Social icons: Instagram + TikTok come from `BUSINESS.socials` (per D-05
 * both are `#` placeholders until the user provides real URLs). While a
 * social URL is a `#` placeholder we render the icon as a muted, non-link
 * span so the empty state looks intentional — clicking a link that 404s
 * to a spoofed profile is worse than showing "coming soon" affordance
 * (threat T-04-03-05). The Email icon is always rendered as a `mailto:`
 * link because `BUSINESS.socials.email` is concrete.
 */
const PLACEHOLDER_SOCIAL = "#";

function isPlaceholderSocial(url: string): boolean {
  return !url || url === PLACEHOLDER_SOCIAL;
}

export function SiteFooter() {
  const year = new Date().getFullYear();

  const socialIconClass =
    "inline-flex items-center justify-center h-11 w-11 rounded-full transition-colors";

  return (
    <footer
      className="border-t-2"
      style={{
        backgroundColor: BRAND.ink,
        color: BRAND.cream,
        borderColor: BRAND.ink,
      }}
    >
      <div className="max-w-6xl mx-auto px-6 md:px-8 py-12">
        {/* Link groups */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 mb-10">
          <div>
            <h2 className="font-[var(--font-heading)] text-sm tracking-[0.2em] text-white/60 mb-3">
              SHOP
            </h2>
            <ul className="flex flex-col">
              <li>
                <Link
                  href="/"
                  className="block py-3 min-h-[48px] hover:text-white text-white/80"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  href="/shop"
                  className="block py-3 min-h-[48px] hover:text-white text-white/80"
                >
                  Shop all
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-[var(--font-heading)] text-sm tracking-[0.2em] text-white/60 mb-3">
              COMPANY
            </h2>
            <ul className="flex flex-col">
              <li>
                <Link
                  href="/about"
                  className="block py-3 min-h-[48px] hover:text-white text-white/80"
                >
                  About
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="block py-3 min-h-[48px] hover:text-white text-white/80"
                >
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-[var(--font-heading)] text-sm tracking-[0.2em] text-white/60 mb-3">
              LEGAL
            </h2>
            <ul className="flex flex-col">
              <li>
                <Link
                  href="/privacy"
                  className="block py-3 min-h-[48px] hover:text-white text-white/80"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="block py-3 min-h-[48px] hover:text-white text-white/80"
                >
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Brand + socials row */}
        <div
          className="flex flex-col md:flex-row items-center md:items-center justify-between gap-6 pt-8 border-t text-center md:text-left"
          style={{ borderColor: "rgba(255,255,255,0.1)" }}
        >
          <div className="flex items-center gap-3">
            <Logo size={40} />
            <div className="flex flex-col">
              <span className="font-[var(--font-heading)] tracking-wide">
                3D <span style={{ color: BRAND.green }}>NINJAZ</span>
              </span>
              <span className="text-xs text-white/60">
                © {year} {BUSINESS.legalName} · {BUSINESS.city},{" "}
                {BUSINESS.country}
              </span>
            </div>
          </div>

          <div
            className="flex items-center gap-2"
            aria-label="Social links"
          >
            {/* Instagram */}
            {isPlaceholderSocial(BUSINESS.socials.instagram) ? (
              // role="img" is required when setting aria-label on a non-
              // interactive <span>; without it, Axe / Lighthouse flag the
              // aria-label as a prohibited attribute on an implicit-generic
              // element (WAI-ARIA 1.2 §5.2.8.4).
              <span
                role="img"
                className={`${socialIconClass} text-white/30`}
                aria-label="Instagram (coming soon)"
                title="Instagram (coming soon)"
              >
                <Camera className="h-5 w-5" aria-hidden />
              </span>
            ) : (
              <a
                href={BUSINESS.socials.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className={`${socialIconClass} text-white/80 hover:bg-white/10 hover:text-white`}
                aria-label="Instagram"
              >
                <Camera className="h-5 w-5" aria-hidden />
              </a>
            )}

            {/* TikTok — lucide-react doesn't ship a TikTok glyph; Music2
                is the closest neutral "social audio/video" icon available
                without adding a new dependency. */}
            {isPlaceholderSocial(BUSINESS.socials.tiktok) ? (
              // role="img" required — see Instagram placeholder above.
              <span
                role="img"
                className={`${socialIconClass} text-white/30`}
                aria-label="TikTok (coming soon)"
                title="TikTok (coming soon)"
              >
                <Music2 className="h-5 w-5" aria-hidden />
              </span>
            ) : (
              <a
                href={BUSINESS.socials.tiktok}
                target="_blank"
                rel="noopener noreferrer"
                className={`${socialIconClass} text-white/80 hover:bg-white/10 hover:text-white`}
                aria-label="TikTok"
              >
                <Music2 className="h-5 w-5" aria-hidden />
              </a>
            )}

            {/* Email — always concrete (D-04) */}
            <a
              href={BUSINESS.socials.email}
              className={`${socialIconClass} text-white/80 hover:bg-white/10 hover:text-white`}
              aria-label={`Email ${BUSINESS.contactEmail}`}
            >
              <Mail className="h-5 w-5" aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
