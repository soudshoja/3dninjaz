"use client";

import { useCallback, useRef, useState } from "react";
import { PayPalButtons } from "@paypal/react-paypal-js";
import { createPayPalOrder, capturePayPalOrder } from "@/actions/paypal";
import type { CartItem } from "@/stores/cart-store";
import type { AddressFormValues } from "./address-form";
import type { SelectedShipping } from "./shipping-rate-picker";
import { BRAND } from "@/lib/brand";

/**
 * PayPal Smart Buttons for /checkout (D3-04).
 *
 * Security contract (D3-07, T-03-10): the createOrder callback sends ONLY
 * { variantId, quantity } per line — the client never sends unit price.
 * The server re-derives pricing from the DB.
 *
 * Failure surface:
 *   - If the server refuses (bag empty, inactive product, CURRENCY_NOT_SUPPORTED)
 *     we show the error inline below the button.
 *   - PayPal's own button errors (popup closed, network) go through onError
 *     and surface a generic message without leaking internals.
 */
export function PayPalButton({
  address,
  items,
  appliedCouponCode,
  shipping,
  onPaid,
}: {
  address: AddressFormValues | null;
  items: CartItem[];
  appliedCouponCode?: string | null;
  shipping: SelectedShipping | null;
  onPaid: (redirectTo: string) => void;
}) {
  // Phase 9b — require a shipping service selection before PayPal is usable.
  const disabled =
    address === null || items.length === 0 || shipping === null;
  const addressRef = useRef(address);
  addressRef.current = address;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const couponRef = useRef(appliedCouponCode ?? null);
  couponRef.current = appliedCouponCode ?? null;
  const shippingRef = useRef(shipping);
  shippingRef.current = shipping;

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const createOrder = useCallback(async () => {
    setErrorMsg(null);
    if (!addressRef.current) {
      throw new Error("Enter a valid address first.");
    }
    const res = await createPayPalOrder({
      address: addressRef.current,
      // ONLY variantId + quantity cross the trust boundary (D3-07)
      items: itemsRef.current.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
      })),
      // Plan 05-03: optional coupon code; server re-validates + recomputes
      // discount; client-supplied amount is never trusted (T-05-03-tampering)
      couponCode: couponRef.current ?? null,
      // Phase 9b: the customer-selected Delyva service. The server
      // re-quotes with this serviceCode (and falls back to the cheapest if
      // it's no longer offered) — the client-supplied price is ignored.
      shippingServiceCode: shippingRef.current?.serviceCode ?? null,
    });
    if (!res.ok) {
      setErrorMsg(res.error);
      throw new Error(res.error);
    }
    return res.paypalOrderId;
  }, []);

  const onApprove = useCallback(
    async (data: { orderID: string }) => {
      setErrorMsg(null);
      const res = await capturePayPalOrder({ paypalOrderId: data.orderID });
      if (!res.ok) {
        setErrorMsg(res.error);
        throw new Error(res.error);
      }
      onPaid(res.redirectTo);
    },
    [onPaid],
  );

  // User-facing hints deliberately don't mention PayPal — the button's
  // visible disabled/enabled state already conveys that. The shipping
  // address hint lives in shipping-rate-picker.tsx so we avoid duplicating
  // the same message in two places; here we only surface the "pick a
  // courier" nudge once the address is filled in.
  const disabledReason =
    address === null || items.length === 0
      ? null
      : shipping === null
        ? "Pick a courier above to continue."
        : null;

  return (
    <div aria-live="polite">
      {disabled && disabledReason ? (
        <div
          className="rounded-2xl p-4 text-sm border-2"
          style={{ borderColor: `${BRAND.ink}22`, color: BRAND.ink }}
        >
          {disabledReason}
        </div>
      ) : disabled ? null : (
        <>
          <PayPalButtons
            style={{
              shape: "pill",
              layout: "vertical",
              color: "gold",
              label: "paypal",
              height: 55,
            }}
            createOrder={createOrder}
            onApprove={onApprove}
            onError={(err) => {
              console.error("[paypal] button error:", err);
              setErrorMsg(
                "Payment could not be completed. Please try again.",
              );
            }}
            onCancel={() => {
              console.info("[paypal] cancelled");
            }}
          />
          {errorMsg ? (
            <p
              className="mt-3 rounded-xl p-3 text-sm font-semibold"
              style={{
                backgroundColor: "#fee",
                color: "#991b1b",
                borderLeft: `4px solid #dc2626`,
              }}
              role="alert"
            >
              {errorMsg}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
