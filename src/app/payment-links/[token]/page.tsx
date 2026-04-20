import type { Metadata } from "next";
import Link from "next/link";
import { getPaymentLinkByToken } from "@/actions/payment-links";
import { PaymentLinkIsland } from "@/components/payment-link/payment-link-island";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "3D Ninjaz · Payment",
  robots: { index: false, follow: false },
};

/**
 * Phase 7 (07-03) — PUBLIC payment-link page.
 *
 * Lives at the root, NOT inside (store) or (admin), so the storefront nav
 * + footer don't render here. URL contains ONLY the token (D-07-13,
 * T-07-X-PII-on-payment-link). Customer doesn't need to log in.
 *
 * Renders:
 *   - Order summary (item name + description + image gallery + total)
 *   - PayPal Smart Button via PaymentLinkIsland
 *
 * NEVER renders: customer email, phone, address, internal order id,
 * sourceType.
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
            className="inline-flex min-h-[48px] items-center rounded-md px-5 py-3 text-white"
            style={{ backgroundColor: BRAND.blue }}
          >
            Visit shop
          </Link>
        </div>
      </main>
    );
  }

  const { order } = view;
  const clientId =
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ??
    process.env.PAYPAL_CLIENT_ID_SANDBOX ??
    "";

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-2xl px-4 py-8">
        <header className="mb-6 text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            3D Ninjaz · Order {order.orderNumber}
          </p>
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl mt-2">
            Complete your payment
          </h1>
        </header>

        <section className="rounded-2xl bg-white p-4 md:p-6 space-y-4">
          <div>
            <h2 className="font-[var(--font-heading)] text-xl">
              {order.customItemName ?? "Custom 3D print"}
            </h2>
            {order.customItemDescription ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                {order.customItemDescription}
              </p>
            ) : null}
          </div>

          {order.customImages.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {order.customImages.map((url) => (
                <div
                  key={url}
                  className="aspect-square overflow-hidden rounded-md border border-[var(--color-brand-border)] bg-slate-50"
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

          <div className="border-t border-black/10 pt-4 flex items-center justify-between">
            <span className="text-slate-600">Total</span>
            <span className="font-[var(--font-heading)] text-2xl">
              {formatMYR(order.totalAmount)} {order.currency}
            </span>
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-4 md:p-6">
          <h2 className="font-[var(--font-heading)] text-lg mb-3">
            Pay with PayPal
          </h2>
          <PaymentLinkIsland
            token={view.link.token}
            clientId={clientId}
            currency={order.currency}
          />
          <p className="mt-3 text-xs text-slate-500">
            Link expires {view.link.expiresAt.toLocaleString("en-MY")}.
          </p>
        </section>
      </div>
    </main>
  );
}
