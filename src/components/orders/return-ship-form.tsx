"use client";

import { useState, useTransition } from "react";
import { Truck } from "lucide-react";
import { submitReturnTracking } from "@/actions/order-requests";
import { BRAND } from "@/lib/brand";

/**
 * 260601-afs — Shown on /orders/[id] when the customer has an approved return
 * request. Displays the ship-by deadline and the store return address, then
 * collects courier + tracking number.
 *
 * Store return address: hardcoded constant below until a dedicated
 * store_settings.returnAddress field is added in a future plan.
 * ASSUMPTION: Update RETURN_ADDRESS when the actual return address is confirmed.
 */

// TODO: Replace with a db field (store_settings.returnAddress) in a future plan.
// For now this is a clearly-marked constant. Admin can update this string here.
const RETURN_ADDRESS =
  "3D Ninjaz Returns\nPlease contact support@3dninjaz.com for the current return address.";

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function ReturnShipForm({
  requestId,
  approvedAt,
}: {
  requestId: string;
  approvedAt: Date;
}) {
  const [courier, setCourier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const shipBy = addDays(new Date(approvedAt), 3);
  const isOverdue = Date.now() > shipBy.getTime();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const res = await submitReturnTracking(requestId, courier, trackingNumber);
      if (res.ok) {
        setResult({
          type: "success",
          message: "Tracking submitted! We'll email you when we receive your return.",
        });
      } else {
        setResult({ type: "error", message: res.error });
      }
    });
  };

  if (result?.type === "success") {
    return (
      <p
        role="status"
        aria-live="polite"
        className="text-sm rounded-lg px-3 py-2 font-semibold"
        style={{ backgroundColor: `${BRAND.green}25`, color: "#16a34a" }}
      >
        {result.message}
      </p>
    );
  }

  return (
    <div
      className="rounded-2xl p-4 md:p-6 mb-6 border-2"
      style={{ borderColor: BRAND.blue, backgroundColor: `${BRAND.blue}08` }}
    >
      <h2 className="font-[var(--font-heading)] text-xl mb-3 flex items-center gap-2">
        <Truck className="w-5 h-5" aria-hidden />
        Ship your item back
      </h2>

      <div className="mb-4 grid gap-2 text-sm">
        <p>
          <strong>Ship by:</strong>{" "}
          <span
            style={{ color: isOverdue ? "#DC2626" : BRAND.ink }}
            className="font-semibold"
          >
            {shipBy.toLocaleDateString("en-MY", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {isOverdue ? " (window has passed — contact support)" : ""}
          </span>
        </p>
        <div>
          <strong>Return address:</strong>
          <address className="not-italic mt-1 text-slate-700 whitespace-pre-line">
            {RETURN_ADDRESS}
          </address>
        </div>
      </div>

      <form onSubmit={onSubmit} className="grid gap-3">
        <div>
          <label
            htmlFor={`courier-${requestId}`}
            className="block text-sm font-semibold mb-1"
          >
            Courier used
          </label>
          <input
            id={`courier-${requestId}`}
            type="text"
            value={courier}
            onChange={(e) => setCourier(e.target.value)}
            maxLength={120}
            required
            className="w-full rounded-xl border-2 px-4 py-2 text-sm focus:outline-none focus:ring-2 bg-white"
            style={{ borderColor: `${BRAND.ink}22` }}
            placeholder="e.g. Pos Laju, J&T, Ninja Van"
          />
        </div>
        <div>
          <label
            htmlFor={`tracking-${requestId}`}
            className="block text-sm font-semibold mb-1"
          >
            Tracking number
          </label>
          <input
            id={`tracking-${requestId}`}
            type="text"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            maxLength={160}
            required
            className="w-full rounded-xl border-2 px-4 py-2 text-sm font-mono focus:outline-none focus:ring-2 bg-white"
            style={{ borderColor: `${BRAND.ink}22` }}
            placeholder="e.g. EY123456789MY"
          />
        </div>

        {result?.type === "error" ? (
          <p className="text-sm" style={{ color: "#DC2626" }}>
            {result.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center min-h-[48px] px-5 rounded-lg font-bold text-sm disabled:opacity-40 self-start"
          style={{ backgroundColor: BRAND.blue, color: "#ffffff" }}
        >
          {pending ? "Submitting…" : "Submit tracking number"}
        </button>
      </form>
    </div>
  );
}
