"use client";

import { useState, useTransition } from "react";
import { Undo2 } from "lucide-react";
import { submitOrderRequest } from "@/actions/order-requests";
import { BRAND } from "@/lib/brand";

/**
 * Return request form — collapsible. Visible only when the parent panel
 * decides the order qualifies (status='delivered' AND age <= 14d AND no
 * pending request). Server-side eligibility re-validated.
 */
export function ReturnRequestButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const res = await submitOrderRequest({
        orderId,
        type: "return",
        reason,
      });
      if (res.ok) {
        setStatus({ type: "success", message: res.message });
        setReason("");
        setOpen(false);
      } else {
        setStatus({ type: "error", message: res.error });
      }
    });
  };

  return (
    <div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 min-h-[60px] px-5 rounded-lg font-bold border-2"
          style={{ borderColor: BRAND.purple, color: BRAND.purple }}
        >
          <Undo2 className="h-5 w-5" aria-hidden />
          Request return
        </button>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-3">
          <label
            className="text-sm font-semibold"
            htmlFor={`return-reason-${orderId}`}
          >
            Why do you want to return this order?
          </label>
          <textarea
            id={`return-reason-${orderId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            rows={3}
            required
            minLength={10}
            className="w-full rounded-xl border-2 px-4 py-3 min-h-[96px] focus:outline-none focus:ring-2 bg-white"
            style={{ borderColor: `${BRAND.ink}22` }}
            placeholder="Tell us what went wrong (damaged, wrong size, etc) — 10-1000 chars."
          />
          <div className="flex gap-3 flex-wrap items-center">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center justify-center min-h-[60px] px-5 rounded-lg font-bold disabled:opacity-40"
              style={{ backgroundColor: BRAND.purple, color: "#ffffff" }}
            >
              {pending ? "Submitting…" : "Submit return request"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setStatus(null);
                setReason("");
              }}
              className="inline-flex items-center justify-center min-h-[60px] px-5 rounded-lg font-bold border-2"
              style={{ borderColor: BRAND.ink, color: BRAND.ink }}
            >
              Never mind
            </button>
          </div>
        </form>
      )}
      {status ? (
        <p
          role="status"
          aria-live="polite"
          className="text-sm mt-2"
          style={{
            color: status.type === "success" ? "#16a34a" : "#DC2626",
          }}
        >
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
