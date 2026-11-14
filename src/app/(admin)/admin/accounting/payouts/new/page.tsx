import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { PayoutForm } from "@/components/admin/accounting/payout-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · New transfer",
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
          ← Back to transfers
        </Link>
        <h1 className="mt-3 font-[var(--font-heading)] text-3xl md:text-4xl">
          New transfer
        </h1>
        <p className="mt-1 mb-6 text-slate-600">
          Record money you moved between two of your own accounts, for example
          PayPal to bank. It reduces the account it left and adds to the one it
          reached. It is not income and not an expense.
        </p>
        <PayoutForm mode="new" />
      </div>
    </main>
  );
}
