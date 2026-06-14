import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { getAdminOrder } from "@/actions/admin-orders";
import { SendInvoiceButton } from "@/components/admin/send-invoice-button";
import { ensureOrderItemConfigData, ensureImagesV2 } from "@/lib/config-fields";
import { BRAND } from "@/lib/brand";
import { formatOrderNumber, isManualLine } from "@/lib/orders";
import { formatMYR } from "@/lib/format";
import { AdminOrderStatusBadge } from "@/components/admin/admin-order-status-badge";
import { AdminOrderTimeline } from "@/components/admin/admin-order-timeline";
import { AdminOrderStatusForm } from "@/components/admin/admin-order-status-form";
import { AdminOrderManage } from "@/components/admin/admin-order-manage";
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
import { RefreshShippingButton } from "@/components/admin/refresh-shipping-button";
// Phase 10 (10-01) — cost + profit panel with inline edits.
import { OrderCostsPanel } from "@/components/admin/order-costs-panel";
// Phase 20 (20-11) — payment proof review surface + Download Invoice button.
import { db } from "@/lib/db";
import { paymentProofs, products, orders } from "@/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { publicUrl } from "@/lib/public-url";
import { CopyTrackingButton } from "@/components/orders/copy-tracking-button";
import { FileDown, User, MapPin, Package, CreditCard, Truck, Activity, Settings, MessageSquare, RotateCcw, ChevronLeft, Send } from "lucide-react";
import { PaymentProofSection } from "@/components/admin/payment-proof-section";
import { AdminUploadProofForm } from "@/components/admin/admin-upload-proof-form";
// Order editability gates — used to show/hide the "Edit order" button.
import { isOrderEditable, canAddItems } from "@/lib/order-editable";
// Keychain production — production floor toggle + badge.
import { OrderProductionToggle } from "@/components/admin/order-production-toggle";

// WhatsApp SVG logo (official green brand mark, no external dependency)
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Order detail",
  robots: { index: false, follow: false },
};

// ── Shared card shell ──────────────────────────────────────────────────────────
// Claymorphism treatment: chunky rounded-3xl, layered shadows, thick ink border.
function AdminCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl p-5 md:p-6 ${className}`}
      style={{
        backgroundColor: "#ffffff",
        border: `2.5px solid ${BRAND.ink}12`,
        boxShadow: `0 6px 0 ${BRAND.ink}0e, 0 16px 32px ${BRAND.ink}0a`,
      }}
    >
      {children}
    </div>
  );
}

// ── Section header with coloured accent bar ────────────────────────────────────
function SectionHeader({
  icon: Icon,
  label,
  accent = BRAND.blue,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div
        className="flex items-center justify-center rounded-xl"
        style={{
          width: 36,
          height: 36,
          backgroundColor: `${accent}18`,
          border: `1.5px solid ${accent}30`,
          color: accent,
          flexShrink: 0,
        }}
      >
        <Icon size={17} strokeWidth={2.2} />
      </div>
      <h2
        className="font-[var(--font-heading)] text-lg font-bold tracking-tight"
        style={{ color: BRAND.ink }}
      >
        {label}
      </h2>
      {/* Accent bar */}
      <div
        className="flex-1 h-px ml-1"
        style={{ backgroundColor: `${accent}25` }}
      />
    </div>
  );
}

/**
 * /admin/orders/[id] — full admin detail view (ui-ux-pro-max / Claymorphism).
 *
 * Layout zones:
 *   1. Page header  — order number, status badge, Download Invoice, meta
 *   2. Summary row  — Customer card + Ship-to card (2-col on desktop)
 *   3. Items + totals (full width)
 *   4. Payment zone — proof + upload form + payment link + PayPal financials
 *   5. Fulfilment   — progress timeline + status update form
 *   6. Courier      — shipment panel + refresh button
 *   7. Financials   — costs + profit panel
 *   8. Admin tools  — manage/discount + cancel/return requests + notes
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

  // Customer-facing tracking link — shown so the admin can copy/send it when
  // a customer asks. Guest/manual orders get the tokenized `?t=` form (works
  // without login — same token path the order emails use); account orders get
  // the plain link (customer logs in).
  const [tokenRow] = await db
    .select({ guestAccessToken: orders.guestAccessToken })
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);
  const customerTrackingUrl = publicUrl(
    `/orders/${row.id}${tokenRow?.guestAccessToken ? `?t=${tokenRow.guestAccessToken}` : ""}`,
  );

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

  // Product-image fallback: configurable/keychain items don't snapshot a
  // product_image at add-to-bag, so order_items.product_image is NULL. Look up
  // each product's primary image by product_id so the thumbnail still shows.
  const missingImgProductIds = Array.from(
    new Set(
      row.items
        .filter((i) => !i.productImage && !isManualLine(i) && i.productId)
        .map((i) => i.productId as string),
    ),
  );
  const productImageFallback = new Map<string, string>();
  if (missingImgProductIds.length > 0) {
    const imgRows = await db
      .select({ id: products.id, images: products.images })
      .from(products)
      .where(inArray(products.id, missingImgProductIds));
    for (const p of imgRows) {
      const first = ensureImagesV2(p.images)[0]?.url;
      if (first) productImageFallback.set(p.id, first);
    }
  }

  // Mount admin upload form when order is still awaiting payment confirmation
  // or is an unconfirmed bank-transfer order (no PayPal capture yet and not paid).
  // Status-based guard: show for pending / awaiting_customer / awaiting_payment_review.
  const showAdminUploadForm =
    row.status === "awaiting_customer" ||
    row.status === "awaiting_payment_review" ||
    (row.status === "pending" && !row.paypalCaptureId);

  // Gate for the "Edit order" / "Add items" button in the view.
  const editable = isOrderEditable({
    status: row.status,
    paypalCaptureId: row.paypalCaptureId,
  });
  const canAdd = canAddItems({ status: row.status });
  // Amount-paid display (read-only informational, view page).
  const amountPaidNum = Number(row.amountPaid ?? "0");
  const balanceDue =
    Math.round((Number(row.totalAmount) - amountPaidNum) * 100) / 100;

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-5xl px-4 py-8">

        {/* ── Breadcrumb ────────────────────────────────────────────────────── */}
        <nav className="mb-5">
          <Link
            href="/admin/orders"
            className="inline-flex items-center gap-1.5 text-sm font-semibold transition-opacity hover:opacity-70"
            style={{ color: BRAND.blue }}
          >
            <ChevronLeft size={16} strokeWidth={2.5} />
            All orders
          </Link>
        </nav>

        {/* ══ ZONE 1 — Page header ═════════════════════════════════════════════ */}
        <div
          className="rounded-3xl px-6 py-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          style={{
            background: `linear-gradient(135deg, ${BRAND.ink}f5 0%, ${BRAND.ink}e8 100%)`,
            border: `2.5px solid ${BRAND.ink}`,
            boxShadow: `0 8px 0 ${BRAND.ink}cc, 0 20px 40px ${BRAND.ink}40`,
          }}
        >
          {/* Left — order identity */}
          <div className="min-w-0">
            <p
              className="text-xs font-bold uppercase tracking-[0.18em] mb-1"
              style={{ color: `${BRAND.blue}cc` }}
            >
              Order
            </p>
            <h1
              className="font-[var(--font-heading)] text-3xl md:text-4xl font-extrabold tracking-tight break-words"
              style={{ color: "#ffffff" }}
            >
              {formatOrderNumber(row.id)}
            </h1>
            <p className="text-sm mt-1" style={{ color: "#ffffff99" }}>
              Placed {new Date(row.createdAt).toLocaleString("en-MY")}
            </p>
            <p
              className="text-xs font-mono mt-1 break-words"
              style={{ color: "#ffffff55" }}
            >
              {row.id}
            </p>
            {row.paypalCaptureId ? (
              <p className="text-xs mt-1.5" style={{ color: "#ffffff70" }}>
                Payment ref:{" "}
                <span className="font-mono break-words">{row.paypalCaptureId}</span>
              </p>
            ) : null}
          </div>

          {/* Right — badge + invoice download */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {/* Phase 20 (20-11) — Download Invoice PDF button.
                The ?t= cache-buster (re-stamped on every force-dynamic render)
                guarantees the browser fetches a freshly-rendered PDF after the
                admin changes shipping, discount, or items — never a cached tab. */}
            <a
              href={`/orders/${row.id}/invoice.pdf?t=${Date.now()}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition-opacity hover:opacity-80"
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1.5px solid rgba(255,255,255,0.25)",
                color: "#ffffff",
                minHeight: 44,
              }}
            >
              <FileDown size={16} strokeWidth={2.2} />
              Invoice PDF
            </a>
            <SendInvoiceButton
              orderId={row.id}
              hasPhone={Boolean(row.shippingPhone)}
            />
            {row.productionAddedAt ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
                style={{
                  background: "rgba(163,85,247,0.20)",
                  border: "1.5px solid rgba(163,85,247,0.40)",
                  color: "#a855f7",
                }}
              >
                In production
              </span>
            ) : null}
            <AdminOrderStatusBadge status={row.status} />
          </div>
        </div>

        {/* ══ ZONE 2 — Summary: Customer + Ship-to ════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

          {/* Customer card */}
          <AdminCard>
            <SectionHeader icon={User} label="Customer" accent={BRAND.blue} />
            <p className="font-bold text-base" style={{ color: BRAND.ink }}>
              {row.user?.name ?? row.shippingName}
            </p>
            <p className="text-sm mt-0.5 break-words" style={{ color: "#475569" }}>
              {(() => {
                const email = row.user?.email ?? row.customerEmail;
                // Guest checkout with no email uses a sentinel address — don't
                // show the fake address; say "No email (guest)" instead.
                return email.endsWith("@3dninjaz.local") ? (
                  <span style={{ fontStyle: "italic", color: "#94a3b8" }}>
                    No email (guest)
                  </span>
                ) : (
                  email
                );
              })()}
            </p>
            {row.shippingPhone ? (
              <p className="text-sm mt-0.5 font-mono break-words" style={{ color: "#475569" }}>
                {row.shippingPhone}
              </p>
            ) : null}
            {/* Guest / deleted-user disambiguation */}
            {row.user ? (
              <p
                className="text-xs font-mono mt-2 break-words px-2 py-1 rounded-lg"
                style={{
                  color: BRAND.blue,
                  backgroundColor: `${BRAND.blue}10`,
                  border: `1px solid ${BRAND.blue}20`,
                }}
              >
                uid: {row.user.id}
              </p>
            ) : row.userId === null ? (
              <p
                className="text-xs mt-2 px-2 py-1.5 rounded-lg"
                style={{
                  color: "#b45309",
                  backgroundColor: "#fef3c720",
                  border: "1px solid #fbbf2440",
                }}
              >
                Guest checkout — no account. Contact details are from the order.
              </p>
            ) : (
              <p
                className="text-xs mt-2 px-2 py-1.5 rounded-lg"
                style={{
                  color: "#dc2626",
                  backgroundColor: "#fee2e220",
                  border: "1px solid #fca5a540",
                }}
              >
                User record has been deleted — using snapshotted contact info.
              </p>
            )}

            {/* Customer tracking link — copy/send when a customer asks where
                their parcel is. Tokenized for guest orders (no login needed). */}
            <div
              className="mt-4 pt-3 flex flex-wrap items-center gap-2"
              style={{ borderTop: `1.5px solid ${BRAND.ink}0c` }}
            >
              <div className="flex-1 min-w-0">
                <p
                  className="text-xs font-bold uppercase tracking-wider mb-1"
                  style={{ color: "#64748b" }}
                >
                  Customer tracking link
                </p>
                <p
                  className="text-xs font-mono break-all"
                  style={{ color: BRAND.blue }}
                >
                  {customerTrackingUrl}
                </p>
              </div>
              <CopyTrackingButton value={customerTrackingUrl} />
            </div>
          </AdminCard>

          {/* Ship-to card — read-only on the view page; edit via "Edit order" */}
          <AdminCard>
            <SectionHeader icon={MapPin} label="Ship to" accent={BRAND.purple} />
            <address
              className="not-italic text-sm leading-relaxed"
              style={{ color: "#334155" }}
            >
              <span className="font-bold text-base" style={{ color: BRAND.ink }}>{row.shippingName}</span><br />
              {row.shippingLine1}<br />
              {row.shippingLine2 ? <>{row.shippingLine2}<br /></> : null}
              {row.shippingCity} {row.shippingPostcode}<br />
              {row.shippingState}, {row.shippingCountry}<br />
              <span className="font-mono text-xs" style={{ color: BRAND.blue }}>{row.shippingPhone}</span>
            </address>
          </AdminCard>
        </div>

        {/* ══ ZONE 3 — Items + totals ══════════════════════════════════════════ */}
        <AdminCard className="mb-4">
          <div className="flex items-center justify-between gap-3">
            <SectionHeader icon={Package} label="Items" accent={BRAND.green} />
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <OrderProductionToggle
                orderId={row.id}
                inProduction={!!row.productionAddedAt}
              />
              {(editable || canAdd) && (
                <Link
                  href={`/admin/orders/${row.id}/edit`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition-opacity hover:opacity-80"
                  style={{
                    backgroundColor: BRAND.ink,
                    color: "#ffffff",
                    minHeight: 44,
                  }}
                >
                  {editable ? "Edit order" : "Add items"}
                </Link>
              )}
            </div>
          </div>

          {/* Custom item details (manual orders) */}
          {row.sourceType === "manual" ? (
            <div
              className="mb-4 px-4 py-3 rounded-2xl"
              style={{
                backgroundColor: `${BRAND.purple}08`,
                border: `1.5px solid ${BRAND.purple}20`,
              }}
            >
              <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: BRAND.purple }}>
                Custom item
              </p>
              <p className="font-semibold" style={{ color: BRAND.ink }}>
                {row.customItemName ?? "(unnamed)"}
              </p>
              {row.customItemDescription ? (
                <p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: "#475569" }}>
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
                      className="block aspect-square overflow-hidden rounded-xl border"
                      style={{
                        borderColor: `${BRAND.ink}15`,
                        backgroundColor: `${BRAND.blue}10`,
                      }}
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
            </div>
          ) : null}

          {row.items.length === 0 ? (
            <p className="text-sm" style={{ color: "#64748b" }}>No line items on this order.</p>
          ) : (
            <ul
              className="divide-y"
              style={{ borderColor: `${BRAND.ink}0c` }}
            >
              {row.items.map((i) => {
                // Prefer the snapshotted image — including on manual lines, so
                // draft-converted orders (which carry a product_image) show a
                // thumbnail. Only the product-id fallback is restricted to
                // non-manual lines (manual ids aren't real products).
                const itemImage =
                  i.productImage ||
                  (!isManualLine(i) && i.productId
                    ? productImageFallback.get(i.productId)
                    : null) ||
                  null;
                return (
                  <li key={i.id} className="flex gap-4 py-3.5">
                    <div
                      className="h-14 w-14 md:h-16 md:w-16 rounded-2xl overflow-hidden shrink-0 relative"
                      style={{
                        backgroundColor: `${BRAND.blue}12`,
                        border: `1.5px solid ${BRAND.ink}10`,
                      }}
                    >
                      {itemImage ? (
                        <Image
                          src={itemImage}
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
                      <p className="font-semibold truncate" style={{ color: BRAND.ink }}>{i.productName}</p>
                      <p className="text-sm mt-0.5" style={{ color: "#64748b" }}>
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
                          <details className="mt-1 text-xs" style={{ color: "#94a3b8" }}>
                            <summary className="cursor-pointer font-medium">Configuration JSON (printer manifest)</summary>
                            <pre
                              className="text-[11px] mt-1 p-2 rounded-xl overflow-x-auto"
                              style={{ backgroundColor: `${BRAND.ink}05`, color: "#475569" }}
                            >
                              {JSON.stringify(cfg.values, null, 2)}
                            </pre>
                          </details>
                        );
                      })()}
                    </div>
                    <p
                      className="font-[var(--font-heading)] text-lg whitespace-nowrap font-bold"
                      style={{ color: BRAND.ink }}
                    >
                      {formatMYR(i.lineTotal)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Totals block */}
          <div
            className="mt-4 pt-4 rounded-2xl px-4 py-3 grid gap-2 text-sm"
            style={{
              backgroundColor: `${BRAND.ink}04`,
              border: `1.5px solid ${BRAND.ink}0c`,
            }}
          >
            <div className="flex justify-between">
              <span style={{ color: "#64748b" }}>Subtotal</span>
              <span className="font-semibold">{formatMYR(row.subtotal)}</span>
            </div>
            {parseFloat(row.discountAmount || "0") > 0 ? (
              <div className="flex justify-between font-semibold" style={{ color: BRAND.greenDark }}>
                <span>
                  Discount
                  {row.discountCode ? ` (${row.discountCode})` : ""}
                </span>
                <span>-{formatMYR(row.discountAmount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span style={{ color: "#64748b" }}>
                Shipping
                {row.shippingServiceName ? (
                  <span className="block text-xs" style={{ color: "#94a3b8" }}>
                    {row.shippingServiceName}
                    {row.shippingServiceCode ? ` (${row.shippingServiceCode})` : ""}
                  </span>
                ) : null}
              </span>
              <span className="font-semibold">{formatMYR(row.shippingCost)}</span>
            </div>
            <div
              className="flex justify-between pt-2.5 mt-1 font-extrabold text-base"
              style={{
                borderTop: `1.5px solid ${BRAND.ink}12`,
                color: BRAND.ink,
              }}
            >
              <span>Total</span>
              <span>{formatMYR(row.totalAmount)} {row.currency}</span>
            </div>

            {/* Amount paid + balance due — shown once any payment is recorded
                (so admins see what's still owed after adding items). */}
            {amountPaidNum > 0 ? (
              <>
                <div className="flex justify-between text-sm mt-1" style={{ color: "#64748b" }}>
                  <span>Amount paid</span>
                  <span>− {formatMYR(row.amountPaid)}</span>
                </div>
                <div
                  className="flex justify-between font-bold text-base mt-1 pt-2"
                  style={{
                    borderTop: `1.5px solid ${BRAND.ink}12`,
                    color: balanceDue > 0 ? "#b91c1c" : BRAND.greenDark,
                  }}
                >
                  <span>{balanceDue > 0 ? "Balance due" : "Fully paid"}</span>
                  <span>{balanceDue > 0 ? formatMYR(balanceDue.toFixed(2)) : formatMYR("0.00")}</span>
                </div>
                {/* MarkBalancePaidButton moved to the dedicated edit page */}
              </>
            ) : null}
          </div>

        </AdminCard>

        {/* ══ ZONE 4 — Payment: proof + upload + payment link + PayPal ════════ */}
        <div className="mb-4 flex flex-col gap-4">
          {/* Phase 20 (20-11) — Payment Proof review section.
              PaymentProofSection early-returns null when proofRows is empty. */}
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

          {/* Payment link (manual unpaid orders only) */}
          {isManualUnpaid ? (
            <AdminCard>
              <SectionHeader icon={CreditCard} label="Payment link" accent={BRAND.purple} />
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
            </AdminCard>
          ) : null}

          {/* PayPal financials (paid orders only) */}
          {paymentDetail ? (
            <AdminCard>
              <SectionHeader icon={CreditCard} label="PayPal financials" accent={BRAND.green} />
              <PaymentFinancialsPanel detail={paymentDetail} />
              <p className="mt-3 text-xs" style={{ color: "#64748b" }}>
                <Link
                  href={`/admin/payments/${row.id}`}
                  className="underline decoration-dotted hover:opacity-70 transition-opacity"
                  style={{ color: BRAND.blue }}
                >
                  Open payment detail page &rarr;
                </Link>
              </p>
            </AdminCard>
          ) : null}
        </div>

        {/* ══ ZONE 5 — Fulfilment: timeline + status update ═══════════════════ */}
        <AdminCard className="mb-4">
          <SectionHeader icon={Activity} label="Fulfilment" accent={BRAND.blue} />

          {/* Progress timeline */}
          <AdminOrderTimeline status={row.status} />

          {/* Status update form — separated visually */}
          <div
            className="mt-5 pt-5"
            style={{ borderTop: `1.5px solid ${BRAND.ink}0c` }}
          >
            <p
              className="text-xs font-bold uppercase tracking-wider mb-3"
              style={{ color: "#64748b" }}
            >
              Update status
            </p>
            <AdminOrderStatusForm
              orderId={row.id}
              current={row.status}
              paymentMethod={row.paymentMethod ?? null}
            />
            {row.paypalOrderId ? (
              <p className="text-xs font-mono mt-3 break-words" style={{ color: "#94a3b8" }}>
                PayPal order ID: {row.paypalOrderId}
              </p>
            ) : null}
            {row.paypalCaptureId ? (
              <p className="text-xs font-mono mt-1 break-words" style={{ color: "#94a3b8" }}>
                PayPal capture ID: {row.paypalCaptureId}
              </p>
            ) : null}
          </div>
        </AdminCard>

        {/* ══ ZONE 6 — Courier / Shipping ══════════════════════════════════════ */}
        <AdminCard className="mb-4">
          <SectionHeader icon={Truck} label="Courier & shipping" accent={BRAND.purple} />
          <OrderShipmentPanel
            orderId={row.id}
            shipment={shipment}
            tracking={tracking}
          />
          {/* Re-quote the selected courier live from Delyva and persist the
              corrected shipping + total (the checkout quote can go stale).
              Updates the order totals and the downloadable invoice. */}
          {row.shippingServiceCode ? (
            <div className="mt-3">
              <RefreshShippingButton orderId={row.id} />
            </div>
          ) : null}
        </AdminCard>

        {/* ══ ZONE 7 — Costs + profit ══════════════════════════════════════════ */}
        {/* Phase 10 (10-01) — profit panel. Always rendered; numbers go
            to RM 0 for manual orders with no line items + no extra cost. */}
        <AdminCard className="mb-4">
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
        </AdminCard>

        {/* ══ ZONE 8 — Admin tools: manage + requests + notes ════════════════ */}
        <div className="flex flex-col gap-4">

          {/* Manage order (discount / cancel / delete) */}
          <AdminCard>
            <SectionHeader icon={Settings} label="Manage order" accent={BRAND.ink} />
            <AdminOrderManage
              orderId={row.id}
              status={row.status}
              discountAmount={row.discountAmount}
              discountCode={row.discountCode}
            />
          </AdminCard>

          {/* Cancel / return requests */}
          <AdminCard>
            <SectionHeader icon={RotateCcw} label="Cancel / return requests" accent={BRAND.purple} />
            <OrderRequestsAdmin
              requests={orderRequests as AdminOrderRequestRow[]}
            />
          </AdminCard>

          {/* Internal notes */}
          <AdminCard>
            <SectionHeader icon={MessageSquare} label="Internal notes" accent={BRAND.blue} />
            <AdminOrderNotesForm orderId={row.id} initial={row.notes ?? ""} />
          </AdminCard>

        </div>
      </div>
    </main>
  );
}
