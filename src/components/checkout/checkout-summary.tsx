"use client";

import { CartLineRow } from "@/components/store/cart-line-row";
import type { CartItem } from "@/stores/cart-store";
import { formatMYR } from "@/lib/format";
import { BRAND } from "@/lib/brand";
import { CouponApply, type AppliedCoupon } from "@/components/store/coupon-apply";
import type { SelectedShipping } from "./shipping-rate-picker";

/**
 * Order summary on /checkout. Reuses the Phase 2 CartLineRow (compact variant)
 * so the bag and checkout render each line identically.
 *
 * Plan 05-03: integrates CouponApply. Discount line is shown when an
 * applied coupon is present; total reflects the discounted amount. The
 * server independently re-derives the discount in createPayPalOrder.
 *
 * Phase 9b: shipping is a live Delyva rate. Until the user picks one, the
 * line reads "Choose a courier" and the total omits shipping. The server
 * independently re-quotes shipping on createPayPalOrder.
 */
export function CheckoutSummary({
  items,
  subtotal,
  appliedCoupon,
  onCouponChange,
  shipping,
}: {
  items: CartItem[];
  subtotal: number;
  appliedCoupon: AppliedCoupon | null;
  onCouponChange: (next: AppliedCoupon | null) => void;
  shipping: SelectedShipping | null;
}) {
  const discounted = appliedCoupon ? appliedCoupon.finalTotal : subtotal;
  const shippingNum = shipping?.price ?? 0;
  const total = discounted + shippingNum;
  return (
    <div>
      <div className="divide-y divide-black/10 max-h-[40vh] overflow-y-auto">
        {items.map((i) => (
          <CartLineRow key={i.key} item={i} variant="compact" />
        ))}
      </div>

      <div className="mt-4">
        <CouponApply
          subtotal={subtotal}
          applied={appliedCoupon}
          onChange={onCouponChange}
        />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-slate-600">Subtotal</span>
        <span className="font-[var(--font-heading)] text-2xl">
          {formatMYR(subtotal)}
        </span>
      </div>
      {appliedCoupon ? (
        <div className="mt-1 flex items-center justify-between text-sm font-semibold">
          <span style={{ color: BRAND.green }}>
            Discount ({appliedCoupon.code})
          </span>
          <span style={{ color: BRAND.green }}>
            -{formatMYR(appliedCoupon.discount)}
          </span>
        </div>
      ) : null}
      <div className="mt-1 flex items-center justify-between text-sm text-slate-600">
        <span>
          Shipping
          {shipping ? (
            <span className="block text-xs text-slate-500">
              {shipping.serviceName}
            </span>
          ) : null}
        </span>
        <span className="font-semibold">
          {shipping
            ? shipping.price === 0
              ? "Free"
              : formatMYR(shipping.price)
            : "Choose a courier"}
        </span>
      </div>
      <div className="mt-3 pt-3 border-t border-black/10 flex items-center justify-between">
        <span className="font-semibold">Total</span>
        <span className="font-[var(--font-heading)] text-2xl">
          {formatMYR(total)}
        </span>
      </div>
    </div>
  );
}
