import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { ManualOrderForm } from "@/components/admin/manual-order-form";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · New manual order",
  robots: { index: false, follow: false },
};

/**
 * Phase 7 (07-03) — /admin/orders/new
 *
 * Admin books a one-off custom order (e.g. WhatsApp customer requests a
 * bespoke 3D print). After submission the admin generates a payment link
 * from /admin/orders/[id] and sends it to the customer manually (Q-07-02
 * default).
 */
export default async function AdminNewOrderPage() {
  await requireAdmin();
  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-3xl px-4 py-8">
        <nav className="mb-4 text-sm">
          <Link href="/admin/orders" className="underline decoration-dotted">
            &larr; All orders
          </Link>
        </nav>

        <header className="mb-6">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
            New manual order
          </h1>
          <p className="text-slate-600 mt-1">
            Book a custom 3D print order on behalf of a customer. After saving,
            generate a PayPal payment link from the order detail page and send
            it to the customer via WhatsApp or email.
          </p>
        </header>

        <ManualOrderForm />
      </div>
    </main>
  );
}
