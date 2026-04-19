/**
 * Plan 05-03 — coupon pricing math.
 *
 * Pure functions only — no DB I/O. Both admin server actions and the
 * customer-side checkout flow call into here so the discount math is
 * defined ONCE.
 *
 * Threat mitigations:
 *   - T-05-03-tampering: every `applyCouponToSubtotal` caller passes a
 *     server-derived subtotal AND a server-loaded coupon row; the client
 *     never supplies the discount amount.
 *   - T-05-03-MYR-math: all internal arithmetic uses JS numbers with
 *     .toFixed(2) for rounding; discount is capped at subtotal so the
 *     final total is never negative.
 */

export type CouponSnapshot = {
  id: string;
  code: string;
  type: "percentage" | "fixed";
  amount: string; // decimal string from Drizzle
  minSpend: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageCap: number | null;
  usageCount: number;
  active: boolean;
};

export type CouponApplied = {
  discount: number;
  finalTotal: number;
};

export class CouponValidationError extends Error {
  constructor(
    public code:
      | "INACTIVE"
      | "NOT_STARTED"
      | "EXPIRED"
      | "EXHAUSTED"
      | "MIN_SPEND",
    public userMessage: string,
  ) {
    super(userMessage);
    this.name = "CouponValidationError";
  }
}

export function applyCouponToSubtotal(
  subtotalMYR: number,
  coupon: CouponSnapshot,
  now: Date = new Date(),
): CouponApplied {
  if (!coupon.active) {
    throw new CouponValidationError("INACTIVE", "Coupon is no longer active");
  }
  if (coupon.startsAt && coupon.startsAt > now) {
    throw new CouponValidationError(
      "NOT_STARTED",
      "Coupon is not yet active",
    );
  }
  if (coupon.endsAt && coupon.endsAt < now) {
    throw new CouponValidationError("EXPIRED", "Coupon has expired");
  }
  if (
    coupon.usageCap !== null &&
    coupon.usageCount >= coupon.usageCap
  ) {
    throw new CouponValidationError(
      "EXHAUSTED",
      "Coupon has been fully redeemed",
    );
  }

  const minSpend = coupon.minSpend ? parseFloat(coupon.minSpend) : 0;
  if (subtotalMYR < minSpend) {
    throw new CouponValidationError(
      "MIN_SPEND",
      `Minimum spend MYR ${minSpend.toFixed(2)}`,
    );
  }

  const amount = parseFloat(coupon.amount);
  let discount: number;
  if (coupon.type === "percentage") {
    discount = +((subtotalMYR * amount) / 100).toFixed(2);
  } else {
    discount = +amount.toFixed(2);
  }
  if (discount > subtotalMYR) discount = subtotalMYR;
  const finalTotal = +(subtotalMYR - discount).toFixed(2);
  return { discount, finalTotal };
}
