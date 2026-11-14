import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { getPayoutById } from "@/actions/admin-accounting";
import { PayoutForm } from "@/components/admin/accounting/payout-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Edit transfer",
  robots: { index: false, follow: false },
};

export default async function EditPayoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const row = await getPayoutById(id);
  if (!row) notFound();

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
          Edit transfer
        </h1>
        <p className="mt-1 mb-6 text-slate-600">
          A transfer moves money between two of your own accounts. Editing it
          re-balances both.
        </p>
        <PayoutForm mode="edit" initial={row} />
      </div>
    </main>
  );
}
