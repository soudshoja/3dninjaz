import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { BRAND } from "@/lib/brand";

/**
 * Store footer. Ink background, cream text — closes the page on brand.
 * Brand/trust pages (About, Privacy, WhatsApp) are Phase 4 work.
 */
export function StoreFooter() {
  return (
    <footer className="py-10 px-6" style={{ backgroundColor: BRAND.ink, color: BRAND.cream }}>
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
        <div className="flex items-center gap-3">
          <Logo size={36} />
          <span className="font-[var(--font-heading)] tracking-wide">3D NINJAZ</span>
        </div>
        <p className="text-sm text-white/60">© 2026 3D Ninjaz · Kuala Lumpur, MY</p>
        <div className="flex gap-5 text-sm">
          <Link href="/shop" className="hover:text-white">
            Shop
          </Link>
          <a href="mailto:hello@3dninjaz.com" className="hover:text-white">
            hello@3dninjaz.com
          </a>
        </div>
      </div>
    </footer>
  );
}
