import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { getAdminOrder } from "@/actions/admin-orders";
import { ensureOrderItemConfigData } from "@/lib/config-fields";
import { BRAND } from "@/lib/brand";
import { formatOrderNumber, isManualLine } from "@/lib/orders";
import { formatMYR } from "@/lib/format";
import { AdminOrderStatusBadge } from "@/components/admin/admin-order-status-badge";
import { AdminOrderTimeline } from "@/components/admin/admin-order-timeline";
import { AdminOrderStatusForm } from "@/components/admin/admin-order-status-form";
import { AdminOrderNotesForm } from "@/components/admin/admin-order-notes-form";
// Phase 6 06-06 — admin approval surface for cancel/return requests.
// 260601-afs — listOrderRequestsForOrder now returns AdminOrderRequestRow[]
import { listOrderRequestsForOrder } from "@/actions/admin-order-requests";
import { OrderRequestsAdmin, type AdminOrderRequestRow } from "@/components/admin/order-requests-admin";
// Phase 7 (07-03) — manual order payment-link surface.
import { listOrderPaymentLinks } from "@/actions/admin-manual-orders";
import { PaymentLinkCard } from "@/components/admin/payment-link-card";
// Phase 7 (07-04) — PayPal financials mirror for paid orders.
import { getPaymentDetail } from "@/actions/admin-payments";
import { PaymentFinancialsPanel } from "@/components/admin/payment-financials-panel";
// Phase 9 (09-01) — Delyva shipment panel (book / print label / track).
// Phase 9 (09-02) — live tracking view shared with the customer page.
import { getOrderShipment, getAdminOrderTracking } from "@/actions/shipping";
import { OrderShipmentPanel } from "@/components/admin/order-shipment-panel";
// Phase 10 (10-01) — cost + profit panel with inline edits.
import { OrderCostsPanel } from "@/components/admin/order-costs-panel";
// Phase 20 (20-11) — payment proof review surface + Download Invoice button.
import { db } from "@/lib/db";
import { paymentProofs } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { FileDown } from "lucide-react";
import { PaymentProofSection } from "@/components/admin/payment-proof-section";
import { AdminUploadProofForm } from "@/components/admin/admin-upload-proof-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Order detail",
  robots: { index: false, follow: false },
};

/**
 * /admin/orders/[id] — full admin detail view. Combines customer + address
 * snapshot + progress timeline + line items + status-transition form +
 * internal notes. Layout is one-column below 768px and two-column above
 * (D3-20 mobile-first rule).
 *
 * requireAdmin() gates the page; getAdminOrder does it again at the action
 * layer so an attacker cannot reach this data via a direct server-action call.
 */
export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const row = await getAdminOrder(id);
  if (!row) notFound();

  // Phase 6 06-06 — pending + resolved cancel/return requests for the
  // approve/reject UI. Empty state handled inside OrderRequestsAdmin.
  const orderRequests = await listOrderRequestsForOrder(id);

  // Phase 7 (07-03) — for manual orders without capture, fetch the link
  // history. Cheap query (one indexed SELECT); skipped for web orders.
  const isManualUnpaid = row.sourceType === "manual" && !row.paypalCaptureId;
  const paymentLinks = isManualUnpaid
    ? await listOrderPaymentLinks(row.id)
    : [];

  // Phase 7 (07-04) — for paid orders, fetch the live PayPal financials.
  // Lazy: only call PayPal when paypalCaptureId is set.
  const paymentDetail = row.paypalCaptureId
    ? await getPaymentDetail(row.id)
    : null;

  // Phase 9 (09-01) — load the Delyva shipment mirror (1:1 with orders).
  // Cheap indexed SELECT; no API call here — actual Delyva calls happen
  // on the client when the admin clicks "Book courier" or "Refresh status".
  const shipment = await getOrderShipment(row.id);

  // Phase 9 (09-02) — server-side normalized tracking view (live Delyva data
  // with 5s timeout + cached-fallback). Wrapped in try/catch so a transient
  // Delyva outage never breaks the admin page — we fall back to null and the
  // panel shows the legacy minimal display.
  let tracking = null as Awaited<ReturnType<typeof getAdminOrderTracking>> | null;
  try {
    tracking = await getAdminOrderTracking(row.id);
  } catch (e) {
    console.warn("getAdminOrderTracking failed", (e as Error).message);
  }

  // Phase 20 (20-11) — manual multi-query hydration (no LATERAL joins per
  // MariaDB 10.11 quirk). Fetches payment proofs for this order ordered by
  // created_at DESC (latest first).
  const proofRows = await db
    .select()
    .from(paymentProofs)
    .where(eq(paymentProofs.orderId, id))
    .orderBy(desc(paymentProofs.createdAt));

  // Mount admin upload form when order is still awaiting payment confirmation
  // or is an unconfirmed bank-transfer order (no PayPal capture yet and not paid).
  // Status-based guard: show for pending / awaiting_customer / awaiting_payment_review.
  const showAdminUploadForm =
    row.status === "awaiting_customer" ||
    row.status === "awaiting_payment_review" ||
    (row.status === "pending" && !row.paypalCaptureId);

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-4xl px-4 py-8">
        <nav className="mb-4 text-sm">
          <Link href="/admin/orders" className="underline decoration-dotted">
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
            <p className="text-xs text-slate-500 font-mono mt-1 break-words">{row.id}</p>
            {row.paypalCaptureId ? (
              <p className="text-xs text-slate-600 mt-2">
                Payment reference:{" "}
                <span className="font-mono break-words">{row.paypalCaptureId}</span>
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Phase 20 (20-11) — Download Invoice PDF button */}
            <a
              href={`/orders/${row.id}/invoice.pdf`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 px-4 font-semibold rounded-[4px] border-2 border-slate-700 text-slate-700 hover:bg-slate-100 transition-colors duration-150"
              style={{ minHeight: 48 }}
            >
              <FileDown size={20} />
              Download Invoice (PDF)
            </a>
            <AdminOrderStatusBadge status={row.status} />
          </div>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <section
            className="rounded-2xl p-4 md:p-6"
            style={{ backgroundColor: "#ffffff" }}
          >
            <h2 className="font-[var(--font-heading)] text-xl mb-3">Customer</h2>
            <p className="font-semibold">{row.user?.name ?? row.shippingName}</p>
            <p className="text-slate-700 break-words">
              {row.user?.email ?? row.customerEmail}
            </p>
            {row.user ? (
              <p className="text-xs text-slate-500 font-mono mt-2 break-words">
                user id: {row.user.id}
              </p>
            ) : (
              <p className="text-xs text-slate-500 mt-2">
                User record has been deleted — using snapshotted contact info.
              </p>
            )}
          </section>

          <section
            className="rounded-2xl p-4 md:p-6"
            style={{ backgroundColor: "#ffffff" }}
          >
            <h2 className="font-[var(--font-heading)] text-xl mb-3">Ship to</h2>
            <address className="not-italic leading-relaxed text-slate-800">
              {row.shippingName}<br />
              {row.shippingLine1}<br />
              {row.shippingLine2 ? <>{row.shippingLine2}<br /></> : null}
              {row.shippingCity} {row.shippingPostcode}<br />
              {row.shippingState}, {row.shippingCountry}<br />
              {row.shippingPhone}
            </address>
          </section>

          {/* Phase 20 (20-11) — Payment Proof review section.
              Rendered between Customer/Shipping cards and Order timeline.
              PaymentProofSection early-returns null when proofRows is empty. */}
          <div className="md:col-span-2 flex flex-col gap-4">
            <PaymentProofSection
              orderId={row.id}
              proofs={proofRows.map((p) => ({
                id: p.id,
                imageUrl: p.imageUrl,
                thumbnailUrl: p.thumbnailUrl ?? null,
                mimeType: p.mimeType,
                sizeBytes: p.sizeBytes,
                uploadedBy: p.uploadedBy,
                uploadedByUserId: p.uploadedByUserId ?? null,
                status: p.status,
                adminNote: p.adminNote ?? null,
                createdAt: p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt),
              }))}
              orderTotal={row.totalAmount}
            />

            {/* Admin slip upload — shown when order is still awaiting payment.
                onSuccess is intentionally omitted: revalidatePath inside
                adminUploadPaymentProof triggers the RSC re-render automatically.
                Passing a function prop across the Server→Client boundary would
                cause a runtime crash on force-dynamic pages (RSC boundary rule). */}
            {showAdminUploadForm && (
              <AdminUploadProofForm orderId={row.id} />
            )}
          </div>

          <section
            className="rounded-2xl p-4 md:p-6 md:col-span-2"
            style={{ backgroundColor: "#ffffff" }}
          >
            <h2 className="font-[var(--font-heading)] text-xl mb-4">Progress</h2>
            <AdminOrderTimeline status={row.status} />
          </section>

          {row.sourceType === "manual" ? (
            <section
              className="rounded-2xl p-4 md:p-6 md:col-span-2"
              style={{ backgroundColor: "#ffffff" }}
            >
              <h2 className="font-[var(--font-heading)] text-xl mb-3">
                Custom item
              </h2>
              <p className="font-semibold">
                {row.customItemName ?? "(unnamed)"}
              </p>
              {row.customItemDescription ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  {row.customItemDescription}
                </p>
              ) : null}
              {row.customImages.length > 0 ? (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {row.customImages.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="block aspect-square overflow-hidden rounded-md border border-[var(--color-brand-border)] bg-slate-50"
                    >
                      {/* Plain img — these uploads may be legacy/raw paths */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {isManualUnpaid ? (
            <section
              className="rounded-2xl p-4 md:p-6 md:col-span-2"
              style={{ backgroundColor: "#ffffff" }}
            >
              <h2 className="font-[var(--font-heading)] text-xl mb-3">
                Payment link
              </h2>
              <PaymentLinkCard
                orderId={row.id}
                existingLinks={paymentLinks}
                customerEmail={
                  row.customerEmail.endsWith("@3dninjaz.local")
                    ? null
                    : row.customerEmail
                }
                itemName={row.customItemName}
                totalAmount={row.totalAmount}
              />
            </section>
          ) : null}

          <section
            className="rounded-2xl p-4 md:p-6 md:col-span-2"
            style={{ backgroundColor: "#ffffff" }}
          >
            <h2 className="font-[var(--font-heading)] text-xl mb-4">Items</h2>
            {row.items.length === 0 ? (
              <p className="text-sm text-slate-600">No line items on this order.</p>
            ) : (
              <ul className="divide-y divide-black/10">
                {row.items.map((i) => (
                  <li key={i.id} className="flex gap-4 py-3">
                    <div
                      className="h-14 w-14 md:h-16 md:w-16 rounded-xl overflow-hidden shrink-0 relative"
                      style={{ backgroundColor: `${BRAND.blue}15` }}
                    >
                      {/* D-08 (Phase 20): manual lines have no product image — skip fetch */}
                      {i.productImage && !isManualLine(i) ? (
                        <Image
                          src={i.productImage}
                          alt=""
                          fill
                          sizes="64px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* D-08: manual lines render name directly — no Link to /products/<id> */}
                      <p className="font-semibold truncate">{i.productName}</p>
                      <p className="text-sm text-slate-600">
                        {(() => {
                          // D-08: manual lines have no variant/config data
                          if (isManualLine(i)) {
                            return <>Qty {i.quantity} · {formatMYR(i.unitPrice)} each</>;
                          }
                          const cfg = ensureOrderItemConfigData(i.configurationData);
                          const summary = cfg?.computedSummary ?? i.variantLabel ?? (i.size ? `Size ${i.size}` : null);
                          return <>{summary ? `${summary} · ` : ""}Qty {i.quantity} · {formatMYR(i.unitPrice)} each</>;
                        })()}
                      </p>
                      {(() => {
                        // D-08: skip configuration JSON block for manual lines
                        if (isManualLine(i)) return null;
                        const cfg = ensureOrderItemConfigData(i.configurationData);
                        if (!cfg) return null;
                        return (
                          <details className="mt-1 text-xs text-slate-500">
                            <summary className="cursor-pointer">Configuration JSON (printer manifest)</summary>
                            <pre className="text-[11px] mt-1 p-2 bg-slate-50 rounded overflow-x-auto">
                              {JSON.stringify(cfg.values, null, 2)}
                            </pre>
                          </details>
                        );
                      })()}
                    </div>
                    <p className="font-[var(--font-heading)] text-lg whitespace-nowrap">
                      {formatMYR(i.lineTotal)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 pt-3 border-t border-black/10 grid gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Subtotal</span>
                <span>{formatMYR(row.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">
                  Shipping
                  {row.shippingServiceName ? (
                    <span className="block text-xs text-slate-500">
                      {row.shippingServiceName}
                      {row.shippingServiceCode
                        ? ` (${row.shippingServiceCode})`
                        : ""}
                    </span>
                  ) : null}
                </span>
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

          {/* Phase 10 (10-01) — profit panel. Always rendered; numbers go
              to RM 0 for manual orders with no line items + no extra cost. */}
          <section
            className="rounded-2xl p-4 md:p-6 md:col-span-2"
            style={{ backgroundColor: "#ffffff" }}
          >
            <OrderCostsPanel
              orderId={row.id}
              items={row.items.map((i) => ({
                id: i.id,
                productName: i.productName,
                size: i.size,
                unitPrice: i.unitPrice,
                unitCost: i.unitCost,
                quantity: i.quantity,
              }))}
              extraCost={row.extraCost}
              extraCostNote={row.extraCostNote}
            />
          </section>

          {paymentDetail ? (
            <section
              className="rounded-2xl p-4 md:p-6 md:col-span-2"
              style={{ backgroundColor: "#ffffff" }}
            >
              <h2 className="font-[var(--font-heading)] text-xl mb-4">
                PayPal financials
              </h2>
              <PaymentFinancialsPanel detail={paymentDetail} />
              <p className="mt-3 text-xs text-slate-500">
                <Link
                  href={`/admin/payments/${row.id}`}
                  className="underline decoration-dotted"
                >
                  Open payment detail page &rarr;
                </Link>
              </p>
            </section>
          ) : null}

          <section
            className="rounded-2xl p-4 md:p-6 md:col-span-2"
            style={{ backgroundColor: "#ffffff" }}
          >
            <h2 className="font-[var(--font-heading)] text-xl mb-3">Shipping</h2>
            <OrderShipmentPanel
              orderId={row.id}
              shipment={shipment}
              tracking={tracking}
            />
          </section>

          <section
            className="rounded-2xl p-4 md:p-6 md:col-span-2"
            style={{ backgroundColor: "#ffffff" }}
          >
            <h2 className="font-[var(--font-heading)] text-xl mb-3">Update status</h2>
            <AdminOrderStatusForm orderId={row.id} current={row.status} />
            {row.paypalOrderId ? (
              <p className="text-xs text-slate-500 mt-3 font-mono break-words">
                PayPal order ID: {row.paypalOrderId}
              </p>
            ) : null}
            {row.paypalCaptureId ? (
              <p className="text-xs text-slate-500 mt-1 font-mono break-words">
                PayPal capture ID: {row.paypalCaptureId}
              </p>
            ) : null}
          </section>

          <section
            className="rounded-2xl p-4 md:p-6 md:col-span-2"
            style={{ backgroundColor: "#ffffff" }}
          >
            <h2 className="font-[var(--font-heading)] text-xl mb-3">
              Cancel / return requests
            </h2>
            <OrderRequestsAdmin
              requests={orderRequests as AdminOrderRequestRow[]}
            />
          </section>

          <section
            className="rounded-2xl p-4 md:p-6 md:col-span-2"
            style={{ backgroundColor: "#ffffff" }}
          >
            <AdminOrderNotesForm orderId={row.id} initial={row.notes ?? ""} />
          </section>
        </div>
      </div>
    </main>
  );
}
