import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { getAdminOrder } from "@/actions/admin-orders";
import { BRAND } from "@/lib/brand";
import { formatOrderNumber, isManualLine } from "@/lib/orders";
import { formatMYR } from "@/lib/format";
import { isOrderEditable, canAddItems } from "@/lib/order-editable";
import { OrderCustomerEdit } from "@/components/admin/order-customer-edit";
import { OrderShipToEdit } from "@/components/admin/order-shipto-edit";
import { OrderItemsEdit } from "@/components/admin/order-items-edit";
import { MarkBalancePaidButton } from "@/components/admin/mark-balance-paid-button";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Edit order",
  robots: { index: false, follow: false },
};

export default async function AdminOrderEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const row = await getAdminOrder(id);
  if (!row) notFound();

  const editable = isOrderEditable({
    status: row.status,
    paypalCaptureId: row.paypalCaptureId,
  });
  const canAdd = canAddItems({ status: row.status });
  const amountPaidNum = Number(row.amountPaid ?? "0");
  const balanceDue =
    Math.round((Number(row.totalAmount) - amountPaidNum) * 100) / 100;

  // Nothing editable — bounce back to the view page.
  if (!editable && !canAdd) {
    redirect(`/admin/orders/${id}`);
  }

  const orderTitle = formatOrderNumber(row.id);

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-3xl px-4 py-8">

        {/* Breadcrumb */}
        <nav className="mb-5">
          <Link
            href={`/admin/orders/${id}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold transition-opacity hover:opacity-70"
            style={{ color: BRAND.blue }}
          >
            <ChevronLeft size={16} strokeWidth={2.5} />
            Back to order
          </Link>
        </nav>

        {/* Page heading */}
        <div
          className="rounded-3xl px-6 py-5 mb-6"
          style={{
            background: `linear-gradient(135deg, ${BRAND.ink}f5 0%, ${BRAND.ink}e8 100%)`,
            border: `2.5px solid ${BRAND.ink}`,
            boxShadow: `0 8px 0 ${BRAND.ink}cc, 0 20px 40px ${BRAND.ink}40`,
          }}
        >
          <p
            className="text-xs font-bold uppercase tracking-[0.18em] mb-1"
            style={{ color: `${BRAND.blue}cc` }}
          >
            Edit order
          </p>
          <h1
            className="font-[var(--font-heading)] text-3xl md:text-4xl font-extrabold tracking-tight"
            style={{ color: "#ffffff" }}
          >
            {orderTitle}
          </h1>
          <p className="text-sm mt-1" style={{ color: "#ffffff80" }}>
            {editable
              ? "Unpaid — full edit: update customer details, add or remove items."
              : "Paid — you can add items (creates a balance due). Address corrections allowed."}
          </p>
        </div>

        {/* ── Section 1: Customer / Ship-to ──────────────────────────────────── */}
        <div
          className="rounded-3xl p-5 md:p-6 mb-4"
          style={{
            backgroundColor: "#ffffff",
            border: `2.5px solid ${BRAND.ink}12`,
            boxShadow: `0 6px 0 ${BRAND.ink}0e, 0 16px 32px ${BRAND.ink}0a`,
          }}
        >
          <h2
            className="font-[var(--font-heading)] text-base font-bold mb-4"
            style={{ color: BRAND.ink }}
          >
            Customer details
          </h2>
          {editable ? (
            // Unpaid → full edit including email.
            <OrderCustomerEdit
              orderId={row.id}
              initial={{
                shippingName: row.shippingName,
                customerEmail: row.customerEmail,
                shippingPhone: row.shippingPhone ?? "",
                shippingLine1: row.shippingLine1,
                shippingLine2: row.shippingLine2,
                shippingCity: row.shippingCity,
                shippingState: row.shippingState,
                shippingPostcode: row.shippingPostcode,
              }}
            />
          ) : (
            // Paid → ship-to address correction only (not email).
            <OrderShipToEdit
              orderId={row.id}
              initial={{
                shippingName: row.shippingName,
                shippingPhone: row.shippingPhone ?? "",
                shippingLine1: row.shippingLine1,
                shippingLine2: row.shippingLine2 ?? null,
                shippingCity: row.shippingCity,
                shippingState: row.shippingState,
                shippingPostcode: row.shippingPostcode,
              }}
            />
          )}
        </div>

        {/* ── Section 2: Items ───────────────────────────────────────────────── */}
        <div
          className="rounded-3xl p-5 md:p-6 mb-4"
          style={{
            backgroundColor: "#ffffff",
            border: `2.5px solid ${BRAND.ink}12`,
            boxShadow: `0 6px 0 ${BRAND.ink}0e, 0 16px 32px ${BRAND.ink}0a`,
          }}
        >
          <h2
            className="font-[var(--font-heading)] text-base font-bold mb-4"
            style={{ color: BRAND.ink }}
          >
            Items
          </h2>

          {/* Read-only current item list */}
          {row.items.length === 0 ? (
            <p className="text-sm mb-4" style={{ color: "#64748b" }}>
              No line items on this order.
            </p>
          ) : (
            <ul
              className="divide-y mb-4"
              style={{ borderColor: `${BRAND.ink}0c` }}
            >
              {row.items.map((i) => (
                <li
                  key={i.id}
                  className="flex justify-between items-baseline gap-4 py-2.5 text-sm"
                >
                  <span className="font-medium truncate" style={{ color: BRAND.ink }}>
                    {i.productName}
                  </span>
                  <span className="whitespace-nowrap shrink-0" style={{ color: "#64748b" }}>
                    ×{i.quantity} · {formatMYR(i.unitPrice)}
                  </span>
                  <span
                    className="font-semibold whitespace-nowrap shrink-0"
                    style={{ color: BRAND.ink }}
                  >
                    {formatMYR(i.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Interactive add/remove surface */}
          <OrderItemsEdit
            orderId={row.id}
            allowRemove={editable}
            items={row.items.map((i) => ({
              id: i.id,
              productName: i.productName,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              isManual: isManualLine(i),
            }))}
          />
        </div>

        {/* ── Section 3: Totals + balance ────────────────────────────────────── */}
        <div
          className="rounded-3xl p-5 md:p-6 mb-6"
          style={{
            backgroundColor: "#ffffff",
            border: `2.5px solid ${BRAND.ink}12`,
            boxShadow: `0 6px 0 ${BRAND.ink}0e, 0 16px 32px ${BRAND.ink}0a`,
          }}
        >
          <h2
            className="font-[var(--font-heading)] text-base font-bold mb-4"
            style={{ color: BRAND.ink }}
          >
            Totals
          </h2>

          <div
            className="rounded-2xl px-4 py-3 grid gap-2 text-sm"
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
                  Discount{row.discountCode ? ` (${row.discountCode})` : ""}
                </span>
                <span>-{formatMYR(row.discountAmount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span style={{ color: "#64748b" }}>Shipping</span>
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
                  <span>
                    {balanceDue > 0
                      ? formatMYR(balanceDue.toFixed(2))
                      : formatMYR("0.00")}
                  </span>
                </div>
                {balanceDue > 0 ? (
                  <div className="mt-3">
                    <MarkBalancePaidButton orderId={row.id} />
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        {/* Done button */}
        <div className="flex justify-end">
          <Link
            href={`/admin/orders/${id}`}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-opacity hover:opacity-80"
            style={{
              backgroundColor: BRAND.ink,
              color: "#ffffff",
              minHeight: 44,
              border: `2px solid ${BRAND.ink}`,
            }}
          >
            Done — back to order
          </Link>
        </div>
      </div>
    </main>
  );
}
