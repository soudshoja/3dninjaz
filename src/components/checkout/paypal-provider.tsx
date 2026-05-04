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
 */
export function CheckoutIsland({
  defaultName,
  defaultEmail: _defaultEmail,
  savedAddresses,
  userId,
}: {
  defaultName: string;
  defaultEmail: string;
  savedAddresses?: SavedAddress[];
  /** Logged-in user id — forwarded to AddressForm for draft persistence. */
  userId: string;
}) {
  const router = useRouter();
  const storeItems = useCartStore((s) => s.items);

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
    clearDraft(userId);
    router.push(redirectTo);
  };

  return (
    <PayPalScriptProvider options={initialOptions}>
      {/* Bottom padding reserves room for the mobile sticky dock (≥ 76px) */}
      <div className="grid gap-8 lg:grid-cols-[1fr_420px] pb-24 md:pb-0">
        <section
          aria-labelledby="ship-heading"
          className="order-1"
        >
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
            userId={userId}
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

          {/* PayPal button area — desktop only; mobile uses the sticky sheet */}
          <div className="hidden md:block mt-8">
            <PayPalButton
              address={address}
              items={items}
              appliedCouponCode={appliedCoupon?.code ?? null}
              shipping={shipping}
              onPaid={handlePaid}
            />
          </div>
        </section>

        <aside
          aria-labelledby="summary-heading"
          className="order-2 hidden md:block"
        >
          <div
            className="sticky top-6 rounded-2xl p-5"
            style={{ backgroundColor: "#ffffff" }}
          >
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
            />
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
        />
      </div>
    </PayPalScriptProvider>
  );
}
