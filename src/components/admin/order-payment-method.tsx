"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { setOrderPaymentMethod } from "@/actions/admin-order-payment-method";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/accounting-types";

/**
 * Tag how a paid order was paid (PayPal / Bank transfer / Cash / Other) so it
 * lands in the right account balance. Shown on /admin/orders/[id] for paid
 * orders. A PayPal-captured order is locked to PayPal on the server.
 */
export function OrderPaymentMethod({
  orderId,
  current,
  locked,
}: {
  orderId: string;
  current: string | null;
  /** True when PayPal captured the payment (method cannot change). */
  locked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // A PayPal-captured order is always PayPal, even if the column is still NULL.
  const [value, setValue] = useState<string>(locked ? "paypal" : (current ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = value !== (current ?? "");
  const noMethodYet = current == null && !locked;

  const save = () => {
    if (!value) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await setOrderPaymentMethod(orderId, value);
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div>
      {noMethodYet ? (
        <p
          role="note"
          className="mb-3 rounded-xl px-3 py-2 text-sm"
          style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
        >
          This order is paid but has no payment method yet. It counts as a sale but sits in no account balance until you
          choose one.
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-64">
          <label htmlFor={`pm-${orderId}`} className="block text-sm font-semibold mb-1">
            Paid by
          </label>
          <select
            id={`pm-${orderId}`}
            value={value}
            disabled={locked || pending}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            className="w-full rounded-xl border-2 bg-white px-4 py-3 text-sm min-h-[48px] disabled:opacity-60"
            style={{ borderColor: `${BRAND.ink}33` }}
          >
            {noMethodYet ? <option value="">Choose a method</option> : null}
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        {!locked ? (
          <button
            type="button"
            onClick={save}
            disabled={pending || !value || !dirty}
            className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50"
            style={{ backgroundColor: BRAND.ink }}
          >
            {pending ? "Saving..." : "Save method"}
          </button>
        ) : null}
        <span className="text-sm min-h-[20px]" aria-live="polite" style={{ color: "#166534" }}>
          {saved ? "Saved" : ""}
        </span>
      </div>
      {locked ? (
        <p className="mt-2 text-xs text-slate-500">PayPal captured this payment, so the method stays PayPal.</p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-xl px-3 py-2 text-sm"
          style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
