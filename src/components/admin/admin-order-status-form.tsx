"use client";

import { useState, useTransition } from "react";
import { BRAND } from "@/lib/brand";
import { updateOrderStatus } from "@/actions/admin-orders";
import { nextAllowedStatuses, type OrderStatus } from "@/lib/orders";

const LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/**
 * Status-transition form on the admin order detail page. The <select> only
 * lists statuses allowed from the current one (per D3-12 state machine).
 * Server-side `assertValidTransition` is still the authoritative gate —
 * this UI is just a UX hint.
 *
 * Terminal statuses (delivered, cancelled) render a plain "no further
 * changes allowed" message instead of an empty form.
 */
export function AdminOrderStatusForm({
  orderId,
  current,
}: {
  orderId: string;
  current: OrderStatus;
}) {
  const allowed = nextAllowedStatuses(current);
  const [next, setNext] = useState<OrderStatus | "">("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (allowed.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        No further status changes are allowed from <strong>{LABELS[current]}</strong>.
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!next) return;
        setMsg(null);
        startTransition(async () => {
          const res = await updateOrderStatus(orderId, next as OrderStatus);
          setMsg(res.ok ? "Status updated." : res.error ?? "Failed.");
          if (res.ok) setNext("");
        });
      }}
      className="flex flex-col sm:flex-row gap-3"
    >
      <label className="sr-only" htmlFor={`next-${orderId}`}>Next status</label>
      <select
        id={`next-${orderId}`}
        value={next}
        onChange={(e) => setNext(e.target.value as OrderStatus | "")}
        className="rounded-xl border-2 px-4 py-3 min-h-[48px] flex-1 bg-white"
        style={{ borderColor: `${BRAND.ink}22`, color: BRAND.ink }}
      >
        <option value="">Move to…</option>
        {allowed.map((s) => (
          <option key={s} value={s}>{LABELS[s]}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={!next || pending}
        className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50"
        style={{ backgroundColor: BRAND.ink }}
      >
        {pending ? "Updating…" : "Update status"}
      </button>
      {msg ? (
        <p role="status" aria-live="polite" className="text-sm self-center">
          {msg}
        </p>
      ) : null}
    </form>
  );
}
