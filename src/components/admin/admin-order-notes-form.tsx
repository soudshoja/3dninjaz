"use client";

import { useState, useTransition } from "react";
import { BRAND } from "@/lib/brand";
import { updateOrderNotes } from "@/actions/admin-orders";

/**
 * Admin-only internal notes form. Notes are capped at 2000 characters on both
 * client (maxLength) and server (T-03-33 Tampering mitigation). The textarea
 * renders the raw value — notes are NEVER rendered as HTML anywhere.
 */
export function AdminOrderNotesForm({
  orderId,
  initial,
}: {
  orderId: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        startTransition(async () => {
          const res = await updateOrderNotes(orderId, value);
          setMsg(res.ok ? "Saved." : res.error ?? "Failed.");
        });
      }}
      className="grid gap-3"
    >
      <label className="text-sm font-semibold" htmlFor={`notes-${orderId}`}>
        Internal notes
      </label>
      <textarea
        id={`notes-${orderId}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={2000}
        rows={4}
        className="rounded-xl border-2 px-4 py-3 bg-white"
        style={{ borderColor: `${BRAND.ink}22`, color: BRAND.ink }}
        placeholder="Courier tracking number, special instructions, etc. Only admins see this."
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">{value.length} / 2000</p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50"
          style={{ backgroundColor: BRAND.ink }}
        >
          {pending ? "Saving…" : "Save notes"}
        </button>
      </div>
      {msg ? (
        <p role="status" aria-live="polite" className="text-sm">
          {msg}
        </p>
      ) : null}
    </form>
  );
}
