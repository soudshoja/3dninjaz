import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { getShippingConfig } from "@/actions/shipping";
import { BRAND } from "@/lib/brand";
import { DelyvaConfigForm } from "@/components/admin/delyva-config-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Delyva courier config",
  robots: { index: false, follow: false },
};

/**
 * Phase 9 (09-01) — Delyva courier configuration surface.
 *
 * Complements /admin/shipping (per-state flat rates) with the live-quote
 * Delyva integration: origin address, package defaults, price markup,
 * enabled-service allowlist, and webhook registration. Checkout-time
 * rate display is a follow-up — the action layer (quoteForCart) exists but
 * the storefront wiring is deferred to the theme agent's next pass.
 */
export default async function AdminDelyvaConfigPage() {
  await requireAdmin();
  const cfg = await getShippingConfig();

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-3xl px-4 py-8">
        <nav className="mb-4 text-sm">
          <Link href="/admin/shipping" className="underline decoration-dotted">
            &larr; Back to shipping rates
          </Link>
        </nav>

        <header className="mb-6">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
            Delyva courier integration
          </h1>
          <p className="mt-1 text-slate-600">
            Live-rate courier booking (J&amp;T, GrabExpress, Lalamove, MyPos…)
            via Delyva. Storefront rate display is wired in a follow-up —
            admin can already book shipments from the order detail page.
          </p>
        </header>

        <DelyvaConfigForm initial={cfg} />
      </div>
    </main>
  );
}
