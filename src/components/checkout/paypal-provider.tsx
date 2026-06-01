"use client";

import { useEffect, useMemo, useState } from "react";
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
import { clearDraft } from "@/stores/checkout-draft-store";
import { WhatsAppBankTransferButton } from "./whatsapp-bank-transfer-button";

/**
 * Client-side checkout island (D3-04). Wraps everything in PayPalScriptProvider
 * (clientId from NEXT_PUBLIC_PAYPAL_CLIENT_ID, currency MYR) and composes:
 *   - AddressForm (left column / stacked)
 *   - CheckoutSummary (right column desktop)
 *   - PayPalButton (below address on desktop)
 *   - MobileSummarySheet (sticky dock + bottom sheet on mobile)
 *
 * Flow contracts:
 *   - On first render we wait for Zustand's `persist` hydration before
 *     deciding to redirect the user. If the bag is empty post-hydration we
 *     push the visitor back to /bag (D3-04).
 *   - On successful PayPal capture the server redirectTo is honored after
 *     calling useCartStore.getState().clear() so the next page renders with
 *     an empty bag (D3-10).
 *   - Guest flow: isGuest=true renders a required email input. The email is
 *     passed to createPayPalOrder as customerEmail (the server rejects without it).
 */
export function CheckoutIsland({
  defaultName,
  defaultEmail,
  savedAddresses,
  userId,
  isGuest,
}: {
  defaultName: string;
  defaultEmail: string;
  savedAddresses?: SavedAddress[];
  /** Logged-in user id — forwarded to AddressForm for draft persistence. Null for guests. */
  userId: string | null;
  /** True when the visitor has no session. Shows guest email input + account prompt. */
  isGuest: boolean;
}) {
  const router = useRouter();
  const storeItems = useCartStore((s) => s.items);

  // Guest checkout — email collected in the island so it can be passed to
  // createPayPalOrder. Not needed for authenticated users.
  const [guestEmail, setGuestEmail] = useState("");
  const [guestEmailTouched, setGuestEmailTouched] = useState(false);

  // Defer redirect decisions until after persist hydration to avoid
  // bouncing signed-in users with a still-loading localStorage bag.
  const [hydrated, setHydrated] = useState(false);
  const [hydratedItems, setHydratedItems] = useState<HydratedCartItem[]>([]);

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

  const subtotal = hydratedItems.reduce(
    (sum, i) => sum + parseFloat(i.unitPrice) * i.quantity,
    0,
  );
  const items = hydratedItems;

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
    // userId is null for guests; clearDraft handles null gracefully (no-op).
    if (userId) clearDraft(userId);
    router.push(redirectTo);
  };

  // Derived: guest email is valid (simple format check matching server)
  const guestEmailValid = !isGuest || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim());

  return (
    <PayPalScriptProvider options={initialOptions}>
      {/* Bottom padding reserves room for the mobile sticky dock (≥ 76px) */}
      <div className="grid gap-8 lg:grid-cols-[1fr_420px] pb-24 md:pb-0">
        <section
          aria-labelledby="ship-heading"
          className="order-1"
        >
          {/* Guest banner + email input — shown only when no session */}
          {isGuest && (
            <div className="mb-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm text-zinc-700 mb-3">
                Checking out as guest.{" "}
                <a href="/register?next=/checkout" className="font-medium underline text-zinc-900">
                  Create an account
                </a>{" "}
                to track orders, reorder faster, and keep your order history.
              </p>
              <label className="block text-sm font-medium text-zinc-800 mb-1" htmlFor="guest-email">
                Email address <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-zinc-500 mb-2">
                Your order confirmation and tracking link will be sent here.
              </p>
              <input
                id="guest-email"
                type="email"
                autoComplete="email"
                required
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                onBlur={() => setGuestEmailTouched(true)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
              />
              {guestEmailTouched && !guestEmailValid && (
                <p className="mt-1 text-xs text-red-600">Please enter a valid email address.</p>
              )}
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
                appliedCouponCode={isGuest ? null : (appliedCoupon?.code ?? null)}
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
                customerName={defaultName}
                customerEmail={defaultEmail}
                disabled={items.length === 0}
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
          customerName={defaultName}
          customerEmail={defaultEmail}
          isGuest={isGuest}
          guestEmail={isGuest ? guestEmail : undefined}
          guestEmailValid={guestEmailValid}
        />
      </div>
    </PayPalScriptProvider>
  );
}
