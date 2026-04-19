"use client";

import { useState, useTransition } from "react";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { validateCoupon } from "@/actions/coupons";

export type AppliedCoupon = {
  code: string;
  discount: number;
  finalTotal: number;
};

/**
 * /checkout coupon-code input. Renders a single-row input + Apply button.
 *
 * Behaviour:
 *   - On Apply: server `validateCoupon(code, subtotal)` is called; on
 *     success the component swaps to a green pill with X-to-clear; on
 *     failure inline red error.
 *   - The applied state is lifted via `onChange` so the parent can include
 *     `couponCode` in the createPayPalOrder payload.
 *
 * Tap targets: Apply button min-h-[48px], input min-h-[48px] (D-04).
 */
export function CouponApply({
  subtotal,
  applied,
  onChange,
}: {
  subtotal: number;
  applied: AppliedCoupon | null;
  onChange: (next: AppliedCoupon | null) => void;
}) {
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onApply = (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!code.trim()) {
      setError("Enter a code first");
      return;
    }
    const trimmed = code.trim().toUpperCase();
    startTransition(async () => {
      const res = await validateCoupon(trimmed, subtotal);
      if (res.ok) {
        onChange({
          code: res.code,
          discount: res.discount,
          finalTotal: res.finalTotal,
        });
        setCode("");
      } else {
        setError(res.error);
      }
    });
  };

  const onClear = () => {
    onChange(null);
    setError(null);
  };

  if (applied) {
    return (
      <div className="rounded-2xl border-2 p-3 flex items-center justify-between gap-2"
        style={{
          borderColor: `${BRAND.green}66`,
          backgroundColor: `${BRAND.green}10`,
        }}
      >
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-slate-500">
            COUPON APPLIED
          </p>
          <p className="font-mono text-sm font-bold" style={{ color: BRAND.ink }}>
            {applied.code}
            <span className="ml-2 text-sm font-bold" style={{ color: BRAND.green }}>
              -{formatMYR(applied.discount)}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label={`Remove coupon ${applied.code}`}
          className="rounded-full px-3 py-2 text-sm font-semibold border-2 min-h-[48px]"
          style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onApply} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          aria-label="Coupon code"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 32))}
          placeholder="Coupon code"
          className="flex-1 rounded-xl border-2 px-4 py-3 text-sm font-mono uppercase tracking-wider min-h-[48px]"
          style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
        />
        <button
          type="submit"
          disabled={pending || code.trim().length === 0}
          className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50"
          style={{ backgroundColor: BRAND.ink }}
        >
          {pending ? "Applying…" : "Apply"}
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          className="text-sm font-semibold"
          style={{ color: "#dc2626" }}
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
