"use client";

import { useState, useTransition } from "react";
import { BRAND } from "@/lib/brand";
import {
  flagAddressCorrection,
  clearAddressCorrection,
} from "@/actions/admin-orders";

/**
 * 260922-shipto — "Address needs correction?" surface for shipped/delivered
 * orders. Rendered on the order VIEW page (the edit page is unreachable for
 * these statuses — see src/lib/order-editable.ts).
 *
 * We deliberately do NOT let an admin silently rewrite the ship-to address
 * once the courier already has the old one on a printed label. Instead this
 * flags that a correction is needed and records what to change; contacting
 * the courier stays a manual, out-of-band step.
 */
export function OrderAddressCorrection({
  orderId,
  flagged,
  note,
  requestedAt,
}: {
  orderId: string;
  flagged: boolean;
  note: string | null;
  requestedAt: Date | null;
}) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (flagged) {
    return (
      <div
        className="rounded-2xl px-4 py-3"
        style={{
          backgroundColor: "#fef3c720",
          border: "1.5px solid #fbbf2460",
        }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
            style={{
              backgroundColor: "#f59e0b",
              color: "#1a1200",
            }}
          >
            Address correction needed
          </span>
          {requestedAt ? (
            <span className="text-xs" style={{ color: "#92620a" }}>
              flagged {new Date(requestedAt).toLocaleString("en-MY")}
            </span>
          ) : null}
        </div>
        <p className="text-sm whitespace-pre-wrap" style={{ color: "#78350f" }}>
          {note}
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setMsg(null);
            startTransition(async () => {
              const res = await clearAddressCorrection(orderId);
              if (!res.ok) setMsg(res.error ?? "Failed.");
            });
          }}
          className="mt-3 rounded-full px-5 py-2.5 text-sm font-bold text-white min-h-[44px] disabled:opacity-50"
          style={{ backgroundColor: BRAND.ink }}
        >
          {pending ? "Saving…" : "Mark as resolved"}
        </button>
        {msg ? (
          <p role="status" aria-live="polite" className="text-sm mt-2" style={{ color: "#b91c1c" }}>
            {msg}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        startTransition(async () => {
          const res = await flagAddressCorrection(orderId, value);
          if (res.ok) {
            setValue("");
          } else {
            setMsg(res.error ?? "Failed.");
          }
        });
      }}
      className="grid gap-2"
    >
      <label
        className="text-xs font-bold uppercase tracking-wider"
        style={{ color: "#64748b" }}
        htmlFor={`addr-correction-${orderId}`}
      >
        Address needs correction?
      </label>
      <textarea
        id={`addr-correction-${orderId}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={2000}
        rows={2}
        className="rounded-xl border-2 px-4 py-3 bg-white text-sm"
        style={{ borderColor: `${BRAND.ink}22`, color: BRAND.ink }}
        placeholder="What's wrong and what it should be — this parcel is already booked, so the courier must be contacted separately."
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs" style={{ color: "#94a3b8" }}>
          {value.length} / 2000
        </p>
        <button
          type="submit"
          disabled={pending || value.trim().length === 0}
          className="rounded-full px-5 py-2.5 text-sm font-bold text-white min-h-[44px] disabled:opacity-50"
          style={{ backgroundColor: "#f59e0b" }}
        >
          {pending ? "Flagging…" : "Flag for correction"}
        </button>
      </div>
      {msg ? (
        <p role="status" aria-live="polite" className="text-sm" style={{ color: "#b91c1c" }}>
          {msg}
        </p>
      ) : null}
    </form>
  );
}
