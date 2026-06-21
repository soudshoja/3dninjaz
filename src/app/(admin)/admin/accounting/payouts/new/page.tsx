import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { PayoutForm } from "@/components/admin/accounting/payout-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · New payout",
  robots: { index: false, follow: false },
};

export default async function NewPayoutPage() {
  await requireAdmin();
  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href="/admin/accounting/payouts"
          className="text-sm underline decoration-dotted"
          style={{ color: BRAND.ink }}
        >
          ← Back to payouts
        </Link>
        <h1 className="mt-3 font-[var(--font-heading)] text-3xl md:text-4xl">
          New payout
        </h1>
        <p className="mt-1 mb-6 text-slate-600">
          Record a withdrawal of funds from PayPal into your bank or cash. This
          reduces your PayPal balance and adds to the destination account.
        </p>
        <PayoutForm mode="new" />
      </div>
    </main>
  );
}
