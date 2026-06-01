import type { Metadata } from "next";
import Link from "next/link";
import { getPaymentLinkByToken } from "@/actions/payment-links";
import { getStoreSettingsCached } from "@/lib/store-settings";
import { PaymentMethodPicker } from "@/components/payment-link/payment-method-picker";
import { ProofPendingState } from "@/components/payment-link/proof-pending-state";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { isManualLine } from "@/lib/orders";
import { whatsappLink } from "@/lib/business-info";
import Image from "next/image";
import { CheckCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "3D Ninjaz · Payment",
  robots: { index: false, follow: false },
};

/**
 * Phase 7 (07-03) — PUBLIC payment-link page.
 * Phase 20 (20-08) — Extended with two-card method picker (PayPal | Bank Transfer).
 *
 * Lives at the root, NOT inside (store) or (admin), so the storefront nav
 * + footer don't render here. URL contains ONLY the token (D-07-13,
 * T-07-X-PII-on-payment-link). Customer doesn't need to log in.
 *
 * Status branches:
 *   - pending / awaiting_customer   → method picker (two cards or PayPal-only per D-16)
 *   - awaiting_payment_review       → ProofPendingState (being-reviewed card)
 *   - latest proof rejected + order back to awaiting_customer → rejection banner + picker
 *   - paid / link.usedAt set        → existing "already paid" page
 */
export default async function PaymentLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await getPaymentLinkByToken(token);

  if (!view.ok) {
    const heading =
      view.error === "expired"
        ? "This payment link has expired"
        : view.error === "used" || view.error === "already-paid"
          ? "This order has already been paid"
          : "Payment link not found";
    return (
      <main
        className="min-h-screen flex items-center justify-center px-4"
        style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
      >
        <div className="max-w-md text-center">
          <h1 className="font-[var(--font-heading)] text-3xl mb-3">
            {heading}
          </h1>
          <p className="text-slate-600 mb-6">
            Please contact 3D Ninjaz on WhatsApp if you believe this is a
            mistake.
          </p>
          <Link
            href="/"
            className="inline-flex min-h-[48px] items-center rounded-[4px] px-5 py-3 text-white"
            style={{ backgroundColor: BRAND.blue }}
          >
            Visit shop
          </Link>
        </div>
      </main>
    );
  }

  const { order, orderItems, paymentProofs } = view;

  // ── Thank You branch — paid orders render a receipt instead of the payment form ──
  if (view.paid) {
    return (
      <main
        className="min-h-screen"
        style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
      >
        <div className="mx-auto max-w-2xl px-4 py-8">
          {/* Header */}
          <header className="mb-6 flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="3D Ninjaz"
                width={32}
                height={32}
                className="rounded-[4px]"
              />
              <span className="text-sm font-medium text-slate-500 uppercase tracking-wide">
                3D Ninjaz
              </span>
            </div>
          </header>

          {/* Success card */}
          <div
            className="rounded-[4px] border-2 border-green-300 bg-green-50 p-6 text-center mb-6"
          >
            <CheckCircle
              className="mx-auto mb-3 text-green-600"
              size={48}
              aria-hidden
            />
            <h1 className="font-[var(--font-heading)] text-2xl md:text-3xl font-semibold text-green-900 mb-2">
              Payment received — thank you!
            </h1>
            <p className="text-green-800 text-sm">
              Your order <span className="font-semibold">{order.orderNumber}</span> has been confirmed.
            </p>
            {order.shippingServiceName ? (
              <p className="text-green-700 text-sm mt-1">
                Courier: {order.shippingServiceName}
              </p>
            ) : null}
            <p className="text-green-700 text-xs mt-3">
              A receipt has been sent to your email.
            </p>
          </div>

          {/* Order summary card (reuse same card as pre-payment) */}
          <section
            className="rounded-[4px] border-2 border-slate-200 p-4 md:p-6 space-y-4"
            style={{ backgroundColor: "#fff" }}
          >
            <h2 className="font-[var(--font-heading)] text-[18px] font-semibold">
              Order summary
            </h2>

            {orderItems.length > 0 ? (
              <ul className="divide-y divide-slate-100 space-y-0">
                {orderItems.map((item) => {
                  const manual = isManualLine(item);
                  return (
                    <li
                      key={item.id}
                      className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex-shrink-0 h-10 w-10 rounded-[4px] bg-slate-100 flex items-center justify-center overflow-hidden">
                        {item.productImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.productImage}
                            alt={item.productName ?? "Product"}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-xs text-slate-400">
                            {manual ? "Item" : "img"}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight">
                          {item.productName || "Item"}
                        </p>
                        {item.variantLabel ? (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {item.variantLabel}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-sm font-semibold">
                          {formatMYR(item.lineTotal)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {item.quantity} × {formatMYR(item.unitPrice)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : order.customItemName ? (
              <div>
                <p className="font-medium">{order.customItemName}</p>
                {order.customItemDescription ? (
                  <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                    {order.customItemDescription}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Totals */}
            <div className="border-t border-slate-200 pt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Subtotal</span>
                <span className="tabular-nums" style={{ fontFeatureSettings: "'tnum'" }}>
                  {formatMYR(order.subtotal)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">
                  Shipping
                  {order.shippingServiceName ? (
                    <span className="text-slate-400"> ({order.shippingServiceName})</span>
                  ) : null}
                </span>
                <span className="tabular-nums" style={{ fontFeatureSettings: "'tnum'" }}>
                  {Number(order.shippingCost) > 0
                    ? formatMYR(order.shippingCost)
                    : "Free"}
                </span>
              </div>
              {Number(order.discountAmount) > 0 ? (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Discount</span>
                  <span
                    className="tabular-nums text-emerald-700"
                    style={{ fontFeatureSettings: "'tnum'" }}
                  >
                    −{formatMYR(order.discountAmount)}
                  </span>
                </div>
              ) : null}
              <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
                <span className="text-slate-600">Total</span>
                <span
                  className="font-[var(--font-heading)] text-2xl font-semibold"
                  style={{ fontFeatureSettings: "'tnum'" }}
                >
                  {formatMYR(order.totalAmount)} {order.currency}
                </span>
              </div>
            </div>
          </section>

          {/* Visit shop CTA */}
          <div className="mt-6 text-center">
            <Link
              href="/"
              className="inline-flex min-h-[48px] items-center rounded-[4px] px-5 py-3 text-white"
              style={{ backgroundColor: BRAND.blue }}
            >
              Visit shop
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // D-16: Server-side guard — hide Bank Transfer if any bank field is null/empty.
  const settings = await getStoreSettingsCached();
  const { bankName, bankAccountNumber, bankAccountHolder } = settings;
  const bankSettingsComplete = !!(
    bankName &&
    bankAccountNumber &&
    bankAccountHolder
  );

  const bankSettings = bankSettingsComplete
    ? {
        bankName: bankName!,
        bankAccountNumber: bankAccountNumber!,
        bankAccountHolder: bankAccountHolder!,
      }
    : null;

  const clientId =
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ??
    process.env.PAYPAL_CLIENT_ID_SANDBOX ??
    "";

  // Determine the latest payment proof (if any).
  const latestProof = paymentProofs.length > 0 ? paymentProofs[0] : null;

  // Determine if there's a rejected proof (for rejection banner).
  const latestRejected =
    latestProof?.status === "rejected" ? latestProof : null;

  // Build WhatsApp href for support.
  const whatsAppHref = whatsappLink(
    `Hi 3D Ninjaz, I have a question about my order ${order.orderNumber}.`,
  );

  // WhatsApp number from settings or fallback to business-info default.
  const waNumber = settings.whatsappNumber || "601125434730";

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header */}
        <header className="mb-6 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="3D Ninjaz"
              width={32}
              height={32}
              className="rounded-[4px]"
            />
            <span className="text-sm font-medium text-slate-500 uppercase tracking-wide">
              3D Ninjaz
            </span>
          </div>
          <p className="text-sm text-slate-500">Order {order.orderNumber}</p>
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
            Complete your payment
          </h1>
        </header>

        {/* Order summary card */}
        <section
          className="rounded-[4px] border-2 border-slate-200 p-4 md:p-6 space-y-4"
          style={{ backgroundColor: "#fff" }}
        >
          <h2 className="font-[var(--font-heading)] text-[18px] font-semibold">
            Order summary
          </h2>

          {/* Order items list — from real order_items rows (D-08, 20-08) */}
          {orderItems.length > 0 ? (
            <ul className="divide-y divide-slate-100 space-y-0">
              {orderItems.map((item) => {
                const manual = isManualLine(item);
                return (
                  <li
                    key={item.id}
                    className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    {/* Product image — snapshot URL on the order_item row.
                        Manual lines or missing snapshots fall back to a label. */}
                    <div className="flex-shrink-0 h-10 w-10 rounded-[4px] bg-slate-100 flex items-center justify-center overflow-hidden">
                      {item.productImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.productImage}
                          alt={item.productName ?? "Product"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-xs text-slate-400">
                          {manual ? "Item" : "img"}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight">
                        {item.productName || "Item"}
                      </p>
                      {item.variantLabel ? (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {item.variantLabel}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-sm font-semibold">
                        {formatMYR(item.lineTotal)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.quantity} × {formatMYR(item.unitPrice)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : /* Legacy: fall back to customItem* fields if no orderItems rows */
          order.customItemName ? (
            <div>
              <p className="font-medium">{order.customItemName}</p>
              {order.customItemDescription ? (
                <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                  {order.customItemDescription}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Legacy custom images (Phase 7 orders) */}
          {order.customImages.length > 0 && orderItems.length === 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {order.customImages.map((url) => (
                <div
                  key={url}
                  className="aspect-square overflow-hidden rounded-[4px] border-2 border-slate-200 bg-slate-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          ) : null}

          {/* Totals — Subtotal / Shipping (with courier name) / Discount /
              Total. Discount row only appears when any coupon was applied. */}
          <div className="border-t border-slate-200 pt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Subtotal</span>
              <span
                className="tabular-nums"
                style={{ fontFeatureSettings: "'tnum'" }}
              >
                {formatMYR(order.subtotal)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">
                Shipping
                {order.shippingServiceName ? (
                  <span className="text-slate-400">
                    {" "}
                    ({order.shippingServiceName})
                  </span>
                ) : null}
              </span>
              <span
                className="tabular-nums"
                style={{ fontFeatureSettings: "'tnum'" }}
              >
                {Number(order.shippingCost) > 0
                  ? formatMYR(order.shippingCost)
                  : "Free"}
              </span>
            </div>
            {Number(order.discountAmount) > 0 ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Discount</span>
                <span
                  className="tabular-nums text-emerald-700"
                  style={{ fontFeatureSettings: "'tnum'" }}
                >
                  −{formatMYR(order.discountAmount)}
                </span>
              </div>
            ) : null}
            <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
              <span className="text-slate-600">Total</span>
              <span
                className="font-[var(--font-heading)] text-2xl font-semibold"
                style={{ fontFeatureSettings: "'tnum'" }}
              >
                {formatMYR(order.totalAmount)} {order.currency}
              </span>
            </div>
          </div>
        </section>

        {/* Payment method section — branch by order status */}

        {/* awaiting_payment_review → show "being reviewed" state */}
        {order.status === "awaiting_payment_review" && latestProof ? (
          <section className="mt-6">
            <ProofPendingState
              orderNumber={order.orderNumber}
              orderTotal={order.totalAmount}
              currency={order.currency}
              bankSettings={bankSettings}
              latestProof={latestProof}
              whatsAppHref={`https://wa.me/${waNumber}?text=${encodeURIComponent(`Hi 3D Ninjaz, I have a question about my order ${order.orderNumber}.`)}`}
            />
          </section>
        ) : (
          /* pending / awaiting_customer → method picker (or PayPal-only per D-16) */
          <section className="mt-6 space-y-4">
            {/* Rejection banner — shown when latest proof is rejected and order is back to awaiting_customer */}
            {latestRejected ? (
              <div
                className="flex items-start gap-3 rounded-[4px] border-2 border-red-300 bg-red-50 px-4 py-3"
                role="alert"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="flex-shrink-0 mt-0.5 text-red-600"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-red-700">
                    Payment proof rejected
                  </p>
                  {latestRejected.adminNote ? (
                    <p className="mt-1 text-sm text-red-700">
                      {latestRejected.adminNote}
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm text-red-600">
                    Please upload a new payment proof.
                  </p>
                </div>
              </div>
            ) : null}

            <PaymentMethodPicker
              token={token}
              clientId={clientId}
              currency={order.currency}
              bankSettingsComplete={bankSettingsComplete}
              bankSettings={bankSettings}
              orderTotal={order.totalAmount}
              orderId={order.id}
              latestProof={latestProof}
              orderStatus={order.status}
              autoExpandBankTransfer={!!latestRejected}
            />

            <p className="text-center text-xs text-slate-500">
              Link expires {view.link.expiresAt.toLocaleString("en-MY")}.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
