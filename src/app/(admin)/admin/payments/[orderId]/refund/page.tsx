import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { getPaymentDetail } from "@/actions/admin-payments";
import { RefundForm } from "@/components/admin/refund-form";
import { RefundHistoryList } from "@/components/admin/refund-history-list";
import { BRAND } from "@/lib/brand";
import { formatOrderNumber } from "@/lib/orders";
import { formatMYR } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Refund",
  robots: { index: false, follow: false },
};

/**
 * Phase 7 (07-05) — /admin/payments/[orderId]/refund
 *
 * Two-step confirm refund flow per Q-07-01 default. Server-side cap +
 * rate-limit + webhook-idempotent reconciliation are all in place; this
 * page is the admin UI surface.
 */
export default async function AdminRefundPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  await requireAdmin();
  const { orderId } = await params;
  const detail = await getPaymentDetail(orderId);
  if (!detail) notFound();

  const total = parseFloat(detail.localGross);
  const already = parseFloat(detail.localRefundedAmount);
  const remaining = +(total - already).toFixed(2);

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-2xl px-4 py-8">
        <nav className="mb-4 text-sm">
          <Link
            href={`/admin/payments/${orderId}`}
            className="underline decoration-dotted"
          >
            &larr; Back to payment detail
          </Link>
        </nav>

        <header className="mb-6">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
            Refund — {formatOrderNumber(detail.orderId)}
          </h1>
          <p className="mt-1 text-slate-600">
            Capture total: <strong>{formatMYR(detail.localGross)}</strong> ·
            already refunded: <strong>{formatMYR(detail.localRefundedAmount)}</strong>
          </p>
        </header>

        <section className="rounded-2xl bg-white p-4 md:p-6 mb-6">
          <h2 className="font-[var(--font-heading)] text-xl mb-3">
            Issue refund
          </h2>
          {remaining > 0 ? (
            <RefundForm
              orderId={detail.orderId}
              totalAmount={detail.localGross}
              refundedAmount={detail.localRefundedAmount}
            />
          ) : (
            <p className="text-sm text-slate-600">
              This capture is fully refunded. No further refunds can be issued.
            </p>
          )}
        </section>

        <section className="rounded-2xl bg-white p-4 md:p-6 mb-6">
          <h2 className="font-[var(--font-heading)] text-xl mb-3">
            Refund history
          </h2>
          <RefundHistoryList detail={detail} />
        </section>

        <p className="text-xs text-slate-500">
          Refunds are sent to the original PayPal payment method. Allow 1-5
          business days for the buyer to see the credit.
        </p>
      </div>
    </main>
  );
}
