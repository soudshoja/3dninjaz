import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { getPaymentDetail } from "@/actions/admin-payments";
import { PaymentFinancialsPanel } from "@/components/admin/payment-financials-panel";
import { BRAND } from "@/lib/brand";
import { formatOrderNumber } from "@/lib/orders";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Payment detail",
  robots: { index: false, follow: false },
};

/**
 * Phase 7 (07-04) — /admin/payments/[orderId]
 *
 * Per-payment detail page mirroring the PayPal Activity dashboard:
 * gross/fee/net/seller-protection/settle date + refund history + refund CTA.
 */
export default async function AdminPaymentDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  await requireAdmin();
  const { orderId } = await params;
  const detail = await getPaymentDetail(orderId);
  if (!detail) notFound();

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-4xl px-4 py-8">
        <nav className="mb-4 text-sm">
          <Link href="/admin/payments" className="underline decoration-dotted">
            &larr; All payments
          </Link>
        </nav>

        <header className="mb-6">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
            Payment {formatOrderNumber(detail.orderId)}
          </h1>
          <p className="mt-1 text-xs text-slate-500 font-mono break-all">
            Capture id: {detail.paypalCaptureId}
          </p>
          {detail.paypalOrderId ? (
            <p className="text-xs text-slate-500 font-mono break-all">
              PayPal order id: {detail.paypalOrderId}
            </p>
          ) : null}
        </header>

        <section className="rounded-2xl bg-white p-4 md:p-6 mb-6">
          <h2 className="font-[var(--font-heading)] text-xl mb-4">
            PayPal financials
          </h2>
          <PaymentFinancialsPanel detail={detail} />
        </section>

        <section className="rounded-2xl bg-white p-4 md:p-6 mb-6">
          <h2 className="font-[var(--font-heading)] text-xl mb-3">
            Refund actions
          </h2>
          {parseFloat(detail.localRefundedAmount) >=
          parseFloat(detail.localGross) - 0.001 ? (
            <p className="text-sm text-slate-600">
              This capture is fully refunded. No further refunds possible.
            </p>
          ) : (
            <Link
              href={`/admin/payments/${detail.orderId}/refund`}
              className="inline-flex min-h-[48px] items-center rounded-md px-5 py-3 text-sm font-semibold text-white"
              style={{ backgroundColor: BRAND.blue }}
            >
              Issue refund
            </Link>
          )}
        </section>

        <section className="rounded-2xl bg-white p-4 md:p-6">
          <h2 className="font-[var(--font-heading)] text-xl mb-3">
            Order links
          </h2>
          <Link
            href={`/admin/orders/${detail.orderId}`}
            className="underline decoration-dotted"
          >
            View order detail &rarr;
          </Link>
        </section>
      </div>
    </main>
  );
}
