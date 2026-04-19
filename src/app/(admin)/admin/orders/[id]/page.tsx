import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { getAdminOrder } from "@/actions/admin-orders";
import { BRAND } from "@/lib/brand";
import { formatOrderNumber } from "@/lib/orders";
import { formatMYR } from "@/lib/format";
import { AdminOrderStatusBadge } from "@/components/admin/admin-order-status-badge";
import { AdminOrderTimeline } from "@/components/admin/admin-order-timeline";
import { AdminOrderStatusForm } from "@/components/admin/admin-order-status-form";
import { AdminOrderNotesForm } from "@/components/admin/admin-order-notes-form";
// Phase 6 06-06 — admin approval surface for cancel/return requests.
import { listOrderRequestsForOrder } from "@/actions/admin-order-requests";
import { OrderRequestsAdmin } from "@/components/admin/order-requests-admin";

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
            <p className="text-xs text-slate-500 font-mono mt-1 break-all">{row.id}</p>
          </div>
          <AdminOrderStatusBadge status={row.status} />
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <section
            className="rounded-2xl p-4 md:p-6"
            style={{ backgroundColor: "#ffffff" }}
          >
            <h2 className="font-[var(--font-heading)] text-xl mb-3">Customer</h2>
            <p className="font-semibold">{row.user?.name ?? row.shippingName}</p>
            <p className="text-slate-700 break-all">
              {row.user?.email ?? row.customerEmail}
            </p>
            {row.user ? (
              <p className="text-xs text-slate-500 font-mono mt-2 break-all">
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

          <section
            className="rounded-2xl p-4 md:p-6 md:col-span-2"
            style={{ backgroundColor: "#ffffff" }}
          >
            <h2 className="font-[var(--font-heading)] text-xl mb-4">Progress</h2>
            <AdminOrderTimeline status={row.status} />
          </section>

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
                      {i.productImage ? (
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
                      <p className="font-semibold truncate">{i.productName}</p>
                      <p className="text-sm text-slate-600">
                        Size {i.size} · Qty {i.quantity} · {formatMYR(i.unitPrice)} each
                      </p>
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

          <section
            className="rounded-2xl p-4 md:p-6 md:col-span-2"
            style={{ backgroundColor: "#ffffff" }}
          >
            <h2 className="font-[var(--font-heading)] text-xl mb-3">Update status</h2>
            <AdminOrderStatusForm orderId={row.id} current={row.status} />
            {row.paypalOrderId ? (
              <p className="text-xs text-slate-500 mt-3 font-mono break-all">
                PayPal order ID: {row.paypalOrderId}
              </p>
            ) : null}
            {row.paypalCaptureId ? (
              <p className="text-xs text-slate-500 mt-1 font-mono break-all">
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
              requests={orderRequests.map((r) => ({
                id: r.id,
                type: r.type,
                status: r.status,
                reason: r.reason,
                adminNotes: r.adminNotes ?? null,
                createdAt: r.createdAt,
                resolvedAt: r.resolvedAt ?? null,
              }))}
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
