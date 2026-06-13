"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PayPalScriptProvider,
  type ReactPayPalScriptOptions,
} from "@paypal/react-paypal-js";
import { useCartStore } from "@/stores/cart-store";
import { hydrateCartItems, type HydratedCartItem } from "@/actions/cart";
import { AddressForm, type AddressFormValues } from "./address-form";
import { CheckoutSummary } from "./checkout-summary";
import { PayPalButton } from "./paypal-button";
import { MobileSummarySheet } from "./mobile-summary-sheet";
import {
  ShippingRatePicker,
  type SelectedShipping,
} from "./shipping-rate-picker";
import type { SavedAddress } from "@/actions/addresses";
import type { AppliedCoupon } from "@/components/store/coupon-apply";
import { clearDraft, type AddressDraft } from "@/stores/checkout-draft-store";
import { WhatsAppBankTransferButton } from "./whatsapp-bank-transfer-button";
import { saveCheckoutDraft } from "@/actions/checkout-drafts";

/**
 * Client-side checkout island (D3-04). Wraps everything in PayPalScriptProvider
 * (clientId from NEXT_PUBLIC_PAYPAL_CLIENT_ID, currency MYR) and composes:
 *   - AddressForm (left column / stacked)
 *   - CheckoutSummary (right column desktop)
 *   - PayPalButton (below address on desktop) — hidden for guests
 *   - MobileSummarySheet (sticky dock + bottom sheet on mobile)
 *
 * Flow contracts:
 *   - On first render we wait for Zustand's `persist` hydration before
 *     deciding to redirect the user. If the bag is empty post-hydration we
 *     push the visitor back to /bag (D3-04).
 *   - On successful PayPal capture the server redirectTo is honored after
 *     calling useCartStore.getState().clear() so the next page renders with
 *     an empty bag (D3-10).
 *   - Guest flow: isGuest=true renders a "Your details" form with name
 *     (required) and email (OPTIONAL). Both PayPal and WhatsApp work for
 *     guests; email is collected only for the confirmation/tracking link.
 */
export function CheckoutIsland({
  defaultName,
  defaultEmail,
  savedAddresses,
  userId,
  isGuest,
  whatsappNumber,
  bankName,
  bankAccountNumber,
  bankAccountHolder,
}: {
  defaultName: string;
  defaultEmail: string;
  savedAddresses?: SavedAddress[];
  /** Logged-in user id — forwarded to AddressForm for draft persistence. Null for guests. */
  userId: string | null;
  /** True when the visitor has no session. Shows guest details form (name required, email optional). */
  isGuest: boolean;
  whatsappNumber: string;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountHolder?: string | null;
}) {
  const router = useRouter();
  const storeItems = useCartStore((s) => s.items);

  // Defer redirect decisions until after persist hydration to avoid
  // bouncing signed-in users with a still-loading localStorage bag.
  const [hydrated, setHydrated] = useState(false);
  const [hydratedItems, setHydratedItems] = useState<HydratedCartItem[]>([]);

  // Guest details — name (required) + email (optional). Collected in the
  // island so both the PayPal and WhatsApp paths can read them.
  const [guestEmail, setGuestEmail] = useState(defaultEmail);

  useEffect(() => setHydrated(true), []);

  // Hydrate display data from server once store is rehydrated.
  useEffect(() => {
    if (!hydrated || storeItems.length === 0) {
      setHydratedItems([]);
      return;
    }
    hydrateCartItems(storeItems)
      .then(setHydratedItems)
      .catch(() => {});
  }, [hydrated, storeItems.length]);

  // Merge live store quantities into hydrated data so +/- buttons reflect
  // instantly without waiting for a server re-hydration (which only re-runs
  // when the item COUNT changes, not when a quantity changes). Matches the
  // pattern in cart-drawer.tsx + bag/page.tsx.
  const items = useMemo(
    () =>
      hydratedItems.map((h) => {
        const match = storeItems.find(
          (si) => si.key === (h.storeKey ?? h.variantId),
        );
        return match ? { ...h, quantity: match.quantity } : h;
      }),
    [hydratedItems, storeItems],
  );

  const subtotal = items.reduce(
    (sum, i) => sum + parseFloat(i.unitPrice) * i.quantity,
    0,
  );

  useEffect(() => {
    if (hydrated && storeItems.length === 0) {
      router.replace("/bag");
    }
  }, [hydrated, storeItems.length, router]);

  // Collected + validated address — only non-null when the form reports valid.
  const [address, setAddress] = useState<AddressFormValues | null>(null);
  // Plan 05-03 — applied coupon state shared between desktop summary card
  // and mobile bottom-sheet. Null if no coupon, or if user removed it.
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(
    null,
  );
  // Phase 9b — customer-selected Delyva courier + price. Null until quote
  // returns options + user picks one. PayPal button stays disabled while null.
  const [shipping, setShipping] = useState<SelectedShipping | null>(null);

  // ---- Server-side checkout draft (2026-06-13) ----
  // As soon as the customer has typed name + phone, upsert a draft row so the
  // admin can see "had a booking but didn't pay" even if no pay button is
  // ever pressed. Keyed per browser via localStorage.
  const latestRef = useRef({ items, subtotal, guestEmail });
  latestRef.current = { items, subtotal, guestEmail };
  const handlePartialAddress = useMemo(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const keyFor = () => {
      try {
        let k = localStorage.getItem("checkout-draft-key");
        if (!k) {
          k = crypto.randomUUID();
          localStorage.setItem("checkout-draft-key", k);
        }
        return k;
      } catch {
        return null;
      }
    };
    return (partial: AddressDraft) => {
      const phoneDigits = (partial.phone ?? "").replace(/\D+/g, "");
      if (!(partial.recipientName ?? "").trim() || phoneDigits.length < 9) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const key = keyFor();
        if (!key) return;
        const { items: curItems, subtotal: curSubtotal, guestEmail: curEmail } =
          latestRef.current;
        void saveCheckoutDraft({
          draftKey: key,
          recipientName: partial.recipientName ?? "",
          phone: partial.phone ?? "",
          email: curEmail?.trim() || null,
          address: {
            line1: partial.addressLine1,
            line2: partial.addressLine2,
            city: partial.city,
            state: partial.state,
            postcode: partial.postcode,
          },
          items: curItems.map((i) => ({
            name: i.variantLabel
              ? `${i.productName} — ${i.variantLabel}`
              : i.productName,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            lineTotal: (parseFloat(i.unitPrice) * i.quantity).toFixed(2),
            // Catalog linkage + thumbnail so an admin-converted order shows the
            // product image and links to the product.
            image: i.productImage ?? null,
            productId: i.productId ?? null,
            variantId: i.variantId ?? null,
            productSlug: i.productSlug ?? null,
            configJson: i.configurationData
              ? JSON.stringify(i.configurationData)
              : null,
          })),
          subtotal: curSubtotal,
        }).catch(() => {});
      }, 1500);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolved display name / email for submission and WhatsApp message.
  // For guests the name comes from the (mandatory) shipping address recipient.
  const resolvedName = isGuest ? (address?.recipientName ?? "") : defaultName;
  const resolvedEmail = isGuest ? guestEmail : defaultEmail;

  const initialOptions = useMemo<ReactPayPalScriptOptions>(
    () => ({
      clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "",
      currency: "MYR",
      intent: "capture",
      components: "buttons",
      // Malaysian PayPal merchant accounts do NOT have Advanced Card
      // capability — the default "Debit or Credit Card" button renders a
      // hosted-fields form that PayPal then rejects ("This card can't be
      // used for your payment"). Disable unsupported funding sources so
      // customers only see the PayPal wallet button that actually works
      // for MY merchants.
      disableFunding: "card,credit,paylater,venmo",
    }),
    [],
  );

  if (!hydrated || storeItems.length === 0) {
    return <p className="text-sm text-slate-600">Redirecting to your bag…</p>;
  }

  const handlePaid = (redirectTo: string) => {
    // D3-10: clear the bag BEFORE navigating so the confirmation page renders
    // with an empty bag drawer.
    useCartStore.getState().clear();
    // Clear the address draft — order is complete, no need to restore.
    // Guests use the shared "guest" key (see address-form.tsx).
    clearDraft(userId || "guest");
    router.push(redirectTo);
  };

  // Email is OPTIONAL for guests: valid when not a guest, when left blank,
  // or when it is a well-formed address. Never blocks PayPal on empty email.
  const guestEmailValid =
    !isGuest ||
    guestEmail.trim() === "" ||
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim());

  return (
    <PayPalScriptProvider options={initialOptions}>
      {/* Bottom padding reserves room for the mobile sticky dock (≥ 76px) */}
      <div className="grid gap-8 lg:grid-cols-[1fr_420px] pb-24 md:pb-0">
        <section
          aria-labelledby="ship-heading"
          className="order-1"
        >
          {/* Guest box — name/phone come from the (mandatory) shipping address
              below, so we only collect an OPTIONAL email here for the order
              confirmation. PayPal and WhatsApp both work without an email. */}
          {isGuest && (
            <div className="mb-8 p-5 rounded-2xl border-2" style={{ borderColor: "#BFDBFE", backgroundColor: "#EFF6FF" }}>
              <p className="text-sm text-zinc-600 mb-4">
                Checking out as guest.{" "}
                <a href="/register?next=/checkout" className="font-medium underline text-zinc-900">
                  Create an account
                </a>{" "}
                to track orders and reorder faster.
              </p>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="guest-email">
                  Email <span className="text-slate-400 text-xs font-normal">(optional — for order confirmation)</span>
                </label>
                <input
                  id="guest-email"
                  type="email"
                  autoComplete="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border-2 px-4 py-3 text-sm outline-none focus:border-blue-400"
                  style={{ borderColor: "#BFDBFE" }}
                />
                {isGuest && !guestEmailValid && (
                  <p className="mt-1 text-xs text-red-600">Please enter a valid email address (or leave blank).</p>
                )}
              </div>
            </div>
          )}

          <h2
            id="ship-heading"
            className="font-[var(--font-heading)] text-2xl mb-4"
          >
            Shipping address
          </h2>
          <AddressForm
            defaultName={defaultName}
            onValidChange={setAddress}
            onPartialChange={handlePartialAddress}
            savedAddresses={savedAddresses}
            userId={userId ?? ""}
          />

          {/* Phase 9b — shipping-rate picker. Renders only once the address is
              filled in; on postcode change it debounces + calls Delyva. */}
          <div className="mt-8">
            <ShippingRatePicker
              address={address}
              items={items}
              onChange={setShipping}
            />
          </div>

        </section>

        {/* Desktop order summary + pay section — right column */}
        <aside
          aria-labelledby="summary-heading"
          className="order-2 hidden md:block"
        >
          <div
            className="sticky top-6 rounded-2xl border border-black/8 shadow-sm overflow-hidden"
            style={{ backgroundColor: "#ffffff" }}
          >
            {/* Order summary */}
            <div className="p-5 pb-4">
              <h2
                id="summary-heading"
                className="font-[var(--font-heading)] text-2xl mb-3"
              >
                Your order
              </h2>
              <CheckoutSummary
                items={items}
                subtotal={subtotal}
                appliedCoupon={appliedCoupon}
                onCouponChange={setAppliedCoupon}
                shipping={shipping}
                isGuest={isGuest}
              />
            </div>

            {/* Pay section — divider + eyebrow + buttons */}
            <div className="border-t border-black/10 px-5 pt-4 pb-5">
              <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-3 font-medium">
                Pay
              </p>
              <PayPalButton
                address={address}
                items={items}
                appliedCouponCode={appliedCoupon?.code ?? null}
                shipping={shipping}
                onPaid={handlePaid}
                guestEmail={isGuest ? guestEmail : undefined}
                guestEmailValid={guestEmailValid}
              />
              <WhatsAppBankTransferButton
                items={items}
                subtotal={subtotal}
                shipping={shipping}
                address={address}
                customerName={resolvedName}
                customerEmail={resolvedEmail}
                couponCode={appliedCoupon?.code ?? null}
                discount={appliedCoupon?.discount ?? 0}
                waNumber={whatsappNumber}
                bankName={bankName}
                bankAccountNumber={bankAccountNumber}
                bankAccountHolder={bankAccountHolder}
                guestName={isGuest ? resolvedName : undefined}
                guestEmail={isGuest ? guestEmail : undefined}
                disabled={items.length === 0 || (isGuest && !resolvedName.trim())}
              />
            </div>
          </div>
        </aside>

        <MobileSummarySheet
          subtotalMyr={subtotal}
          address={address}
          items={items}
          appliedCoupon={appliedCoupon}
          onCouponChange={setAppliedCoupon}
          shipping={shipping}
          onPaid={handlePaid}
          customerName={resolvedName}
          customerEmail={resolvedEmail}
          couponCode={appliedCoupon?.code ?? null}
          waNumber={whatsappNumber}
          bankName={bankName}
          bankAccountNumber={bankAccountNumber}
          bankAccountHolder={bankAccountHolder}
          isGuest={isGuest}
          guestName={resolvedName}
          guestEmail={guestEmail}
          guestEmailValid={guestEmailValid}
        />
      </div>
    </PayPalScriptProvider>
  );
}
