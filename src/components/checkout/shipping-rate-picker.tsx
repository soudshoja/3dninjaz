"use client";

import { useEffect, useRef, useState } from "react";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { quoteForCart, type QuoteOption } from "@/actions/shipping-quote";
import type { AddressFormValues } from "./address-form";
import type { HydratedCartItem } from "@/actions/cart";

/**
 * Phase 9b — checkout shipping-rate picker.
 *
 * Contract:
 *   - When the shipping postcode (and other required address fields) are
 *     valid, we debounce 500ms then call quoteForCart() — a server action
 *     that runs Delyva's live quote.
 *   - Renders a radio list of returned services with ETA + MYR price.
 *     Default-selects the cheapest option.
 *   - On selection, emits { serviceCode, serviceName, price } upward so the
 *     PayPal order total can reflect the shipping cost.
 *   - If Delyva's quote fails (no service to area, bad postcode), we show
 *     a friendly inline error and emit null so the parent can keep the
 *     PayPal button disabled.
 *
 * This is INSTALLED on the checkout island alongside AddressForm. The old
 * flat-rate getShippingRate() path inside createPayPalOrder() is preserved
 * as a fallback when no serviceCode is supplied (backwards compat).
 */

export type SelectedShipping = {
  serviceCode: string;
  serviceName: string;
  price: number; // MYR — this is the final price (after markup + free-shipping)
};

type Props = {
  address: AddressFormValues | null;
  items: HydratedCartItem[];
  onChange: (sel: SelectedShipping | null) => void;
};

export function ShippingRatePicker({ address, items, onChange }: Props) {
  const [options, setOptions] = useState<QuoteOption[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeyRef = useRef<string>("");

  // Stable key for debouncing. Re-run only when the fields that affect the
  // Delyva quote change (postcode, city, state, line1, and the cart).
  const key = address
    ? JSON.stringify({
        postcode: address.postcode,
        city: address.city,
        state: address.state,
        addressLine1: address.addressLine1,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: Number(i.unitPrice),
        })), // HydratedCartItem has productId + unitPrice
      })
    : "";

  useEffect(() => {
    // No address or cart — clear everything.
    if (!address || !address.postcode || items.length === 0) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setOptions([]);
      setSelectedCode(null);
      setError(null);
      setLoading(false);
      onChange(null);
      lastKeyRef.current = "";
      return;
    }

    if (key === lastKeyRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      lastKeyRef.current = key;
      setLoading(true);
      setError(null);
      try {
        const res = await quoteForCart(
          items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: Number(i.unitPrice),
          })),
          {
            address1: address.addressLine1,
            address2: address.addressLine2 ?? null,
            city: address.city,
            state: address.state,
            postcode: address.postcode,
            country: "MY",
          },
        );
        if (!res.ok) {
          setOptions([]);
          setSelectedCode(null);
          setError(
            "Sorry, we couldn't get shipping rates for this address. Please double-check your postcode or contact us.",
          );
          onChange(null);
          return;
        }
        setOptions(res.options);
        if (res.options.length === 0) {
          setError(
            "No couriers deliver to this area. Please contact us to arrange delivery.",
          );
          setSelectedCode(null);
          onChange(null);
          return;
        }
        // Default-select the cheapest.
        const sorted = [...res.options].sort(
          (a, b) => a.finalPrice - b.finalPrice,
        );
        const cheapest = sorted[0];
        setSelectedCode(cheapest.serviceCode);
        onChange({
          serviceCode: cheapest.serviceCode,
          serviceName: cheapest.serviceName,
          price: cheapest.finalPrice,
        });
      } catch (e) {
        setOptions([]);
        setSelectedCode(null);
        setError(
          "Shipping rates temporarily unavailable. Please try again in a moment.",
        );
        onChange(null);
        console.error("[shipping-rate-picker] quote failed:", e);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Don't render anything until the user has started filling the address.
  if (!address) {
    return (
      <div
        className="rounded-2xl border-2 p-4 text-sm"
        style={{ borderColor: `${BRAND.ink}22`, color: BRAND.ink }}
      >
        Fill in your shipping address to see courier rates.
      </div>
    );
  }

  return (
    <div>
      <h3 className="font-[var(--font-heading)] text-xl mb-3">
        Courier &amp; shipping rate
      </h3>

      {loading ? (
        <div
          className="rounded-2xl border-2 p-4 text-sm"
          style={{ borderColor: `${BRAND.ink}22`, color: BRAND.ink }}
          aria-live="polite"
        >
          Fetching live rates from Delyva…
        </div>
      ) : null}

      {!loading && error ? (
        <div
          className="rounded-2xl p-3 text-sm font-semibold"
          role="alert"
          style={{
            backgroundColor: "#fee",
            color: "#991b1b",
            borderLeft: `4px solid #dc2626`,
          }}
        >
          {error}
        </div>
      ) : null}

      {!loading && !error && options.length > 0 ? (
        <fieldset className="grid gap-2">
          <legend className="sr-only">Choose a courier</legend>
          {options.map((opt) => {
            const selected = selectedCode === opt.serviceCode;
            const eta =
              opt.etaMin && opt.etaMax
                ? `${opt.etaMin}–${opt.etaMax} min`
                : opt.etaMin
                  ? `${opt.etaMin} min`
                  : null;
            return (
              <label
                key={opt.serviceCode}
                className="flex items-center gap-3 rounded-2xl border-2 p-3 cursor-pointer transition-colors"
                style={{
                  borderColor: selected ? BRAND.green : `${BRAND.ink}22`,
                  backgroundColor: selected ? `${BRAND.green}10` : "#ffffff",
                }}
              >
                <input
                  type="radio"
                  name="shipping_service"
                  value={opt.serviceCode}
                  checked={selected}
                  onChange={() => {
                    setSelectedCode(opt.serviceCode);
                    onChange({
                      serviceCode: opt.serviceCode,
                      serviceName: opt.serviceName,
                      price: opt.finalPrice,
                    });
                  }}
                  className="h-4 w-4"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-zinc-900">
                    {opt.serviceName}
                  </div>
                  {eta ? (
                    <div className="text-xs text-zinc-700">ETA {eta}</div>
                  ) : null}
                </div>
                <div className="font-[var(--font-heading)] text-lg text-zinc-900">
                  {opt.freeShipApplied ? (
                    <span style={{ color: BRAND.green }}>FREE</span>
                  ) : (
                    formatMYR(opt.finalPrice)
                  )}
                </div>
              </label>
            );
          })}
        </fieldset>
      ) : null}
    </div>
  );
}
