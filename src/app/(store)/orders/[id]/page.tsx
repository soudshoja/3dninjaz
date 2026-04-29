import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getSessionUser } from "@/lib/auth-helpers";
import { getMyOrder } from "@/actions/orders";
import { ensureOrderItemConfigData } from "@/lib/config-fields";
import { BRAND } from "@/lib/brand";
import { formatOrderNumber } from "@/lib/orders";
import { formatMYR } from "@/lib/format";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { ResendReceiptButton } from "@/components/orders/resend-receipt-button";
// Phase 6 Wave 3 — feature sections injected by 06-05 / 06-06 / 06-07
import { ReviewsSection } from "@/components/orders/reviews-section";
import { DownloadInvoiceButton } from "@/components/orders/download-invoice-button";
import { OrderActionsPanel } from "@/components/orders/order-actions-panel";
import { OrderRequestsList } from "@/components/orders/order-requests-list";
import { listMyOrderRequests } from "@/actions/order-requests";
// Phase 9 (09-02) — live courier tracking timeline (customer view).
import { getMyOrderTracking } from "@/actions/shipping";
import { OrderTracking } from "@/components/store/order-tracking";

/**
 * /orders/[id] — doubles as post-checkout confirmation (PAY-04) AND long-lived
 * order detail (ORD-02).
 *
 * Behaviour:
 *  - Auth gate: unauthenticated -> /login?next=/orders/[id] (D3-03).
 *  - Ownership gate via getMyOrder (T-03-21/D3-22). Non-owner non-admin gets
 *    the same notFound() response as a missing ID — blocks email enumeration.
 *  - `?from=checkout` OR "paid within 2 minutes" renders the green confirmation
 *    banner. T-03-24: spoofing the flag is cosmetic only.
 *  - Resend-receipt button shown only for orders that have actually been paid
 *    (paid/processing/shipped/delivered).
 *
 * force-dynamic because we read the session cookie and the order status may
 * change between requests (admin updates).
 */

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const user = await getSessionUser();
  const { id } = await params;
  if (!user) {
    redirect(`/login?next=/orders/${id}`);
  }

  const { from } = await searchParams;
  const row = await getMyOrder(id);
  if (!row) notFound();

  // "Just paid" shows the green banner. Either the capture action tacked
  // `?from=checkout` on the redirect, or the order transitioned to paid
  // less than 2 minutes ago (handles direct navigation after checkout).
  const justPaid =
    from === "checkout" ||
    (row.status === "paid" &&
      Date.now() - new Date(row.updatedAt).getTime() < 120_000);

  const canResend =
    row.status === "paid" ||
    row.status === "processing" ||
    row.status === "shipped" ||
    row.status === "delivered";

  // Phase 6 06-06 / 06-07 — past + pending cancel/return requests on this
  // order. The OrderActionsPanel uses the pending flag to gate the form.
  const myRequests = await listMyOrderRequests(row.id);
  const hasPendingRequest = myRequests.some((r) => r.status === "pending");

  // Phase 9 (09-02) — live courier tracking view. Ownership re-checked inside
  // getMyOrderTracking (first await, CVE-2025-29927). Returns an empty-shape
  // view (hasShipment: false) when no courier has been booked yet, which
  // renders the friendly "being prepared" panel.
  const tracking = await getMyOrderTracking(row.id);

  return (
    <main
      className="min-h-screen bg-white"
      style={{ color: BRAND.ink }}
    >
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-14">
        {justPaid ? (
          <div
            className="rounded-2xl p-5 mb-6 flex items-center gap-4 flex-wrap"
            style={{ backgroundColor: `${BRAND.green}30`, color: BRAND.ink }}
            role="status"
          >
            <Image
              src="/icons/ninja/emoji/success.png"
              alt=""
              width={72}
              height={72}
              priority
              className="h-[72px] w-[72px] object-contain shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-lg">Payment confirmed. Thank you!</p>
              <p className="text-slate-700 text-sm mt-0.5">
                We&apos;ll email your receipt in a moment.
              </p>
            </div>
          </div>
        ) : null}

        <nav className="mb-4 text-sm">
          <Link href="/orders" className="text-slate-600 hover:text-slate-900">
            &larr; All orders
          </Link>
        </nav>

        <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
              {formatOrderNumber(row.id)}
            </h1>
            <p className="text-slate-600 mt-1">
              Placed {new Date(row.createdAt).toLocaleString("en-MY")}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <OrderStatusBadge status={row.status} />
            {/* Phase 6 06-06 — invoice download for any status */}
            <DownloadInvoiceButton orderId={row.id} />
          </div>
        </header>

        {row.paypalCaptureId ? (
          <p className="mb-4 text-xs text-slate-600">
            Payment reference:{" "}
            <span className="font-mono break-all">{row.paypalCaptureId}</span>
          </p>
        ) : null}

        <section
          aria-labelledby="progress"
          className="rounded-2xl p-4 md:p-6 mb-6"
          style={{ backgroundColor: "#ffffff" }}
        >
          <h2
            id="progress"
            className="font-[var(--font-heading)] text-xl mb-4"
          >
            Progress
          </h2>
          <OrderTimeline status={row.status} />
        </section>

        {tracking ? (
          <section
            aria-labelledby="tracking"
            className="rounded-2xl p-4 md:p-6 mb-6 border"
            style={{
              backgroundColor: "#ffffff",
              borderColor: "#e4e4e7",
            }}
          >
            <h2
              id="tracking"
              className="font-[var(--font-heading)] text-xl mb-4"
            >
              Tracking
            </h2>
            <OrderTracking view={tracking} />
          </section>
        ) : null}

        <section
          aria-labelledby="items"
          className="rounded-2xl p-4 md:p-6 mb-6"
          style={{ backgroundColor: "#ffffff" }}
        >
          <h2 id="items" className="font-[var(--font-heading)] text-xl mb-4">
            Items
          </h2>
          <ul className="divide-y divide-black/10">
            {row.items.map((i) => (
              <li key={i.id} className="flex gap-4 py-4">
                <div
                  className="h-16 w-16 md:h-20 md:w-20 rounded-xl overflow-hidden shrink-0"
                  style={{ backgroundColor: `${BRAND.blue}15` }}
                >
                  {i.productImage ? (
                    // eslint-disable-next-line @next/next/no-img-element -- product may be deleted
                    <img
                      src={i.productImage}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/products/${i.productSlug}`}
                    className="font-bold truncate block hover:underline"
                  >
                    {i.productName}
                  </Link>
                  <p className="text-sm text-slate-600 mt-0.5">
                    {(() => {
                      const cfg = ensureOrderItemConfigData(i.configurationData);
                      const summary = cfg?.computedSummary ?? i.variantLabel ?? (i.size ? `Size ${i.size}` : null);
                      return <>{summary ? `${summary} · ` : ""}Qty {i.quantity} · {formatMYR(i.unitPrice)} each</>;
                    })()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-[var(--font-heading)] text-lg">
                    {formatMYR(i.lineTotal)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Subtotal</span>
              <span>{formatMYR(row.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Shipping</span>
              <span>{formatMYR(row.shippingCost)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-black/10 font-bold text-base">
              <span>Total</span>
              <span>
                {formatMYR(row.totalAmount)} {row.currency}
              </span>
            </div>
          </div>
        </section>

        {/* Phase 6 06-05 — per-item Review your items section. Hidden when
            order isn't in a buyer-qualifying status. */}
        <ReviewsSection
          status={row.status}
          items={row.items.map((i) => ({
            id: i.id,
            productId: i.productId,
            productSlug: i.productSlug,
            productName: i.productName,
            size: i.size,
            variantLabel: i.variantLabel ?? null,
          }))}
        />

        {/* Phase 6 06-06 / 06-07 — Cancel / return action panel. Renders only
            when the status + recency rules allow at least one of the actions. */}
        <OrderActionsPanel
          orderId={row.id}
          status={row.status}
          updatedAt={row.updatedAt}
          hasPendingRequest={hasPendingRequest}
        />

        {/* Phase 6 06-06 — past requests (pending / approved / rejected). */}
        <OrderRequestsList requests={myRequests} />

        <section
          aria-labelledby="ship"
          className="rounded-2xl p-4 md:p-6 mb-6"
          style={{ backgroundColor: "#ffffff" }}
        >
          <h2 id="ship" className="font-[var(--font-heading)] text-xl mb-3">
            Shipping to
          </h2>
          <address className="not-italic leading-relaxed text-slate-800">
            {row.shippingName}
            <br />
            {row.shippingLine1}
            <br />
            {row.shippingLine2 ? (
              <>
                {row.shippingLine2}
                <br />
              </>
            ) : null}
            {row.shippingCity} {row.shippingPostcode}
            <br />
            {row.shippingState}, {row.shippingCountry}
            <br />
            {row.shippingPhone}
          </address>
        </section>

        {canResend ? (
          <section
            aria-labelledby="receipt"
            className="rounded-2xl p-4 md:p-6"
            style={{ backgroundColor: "#ffffff" }}
          >
            <h2
              id="receipt"
              className="font-[var(--font-heading)] text-xl mb-3"
            >
              Receipt
            </h2>
            <p className="text-slate-600 mb-4">
              Lost the confirmation email? Resend it to{" "}
              <strong>{row.customerEmail}</strong>.
            </p>
            <ResendReceiptButton orderId={row.id} />
          </section>
        ) : null}
      </div>
    </main>
  );
}
