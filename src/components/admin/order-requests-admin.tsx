"use client";

import { useState, useTransition } from "react";
import {
  approveOrderRequest,
  rejectOrderRequest,
  markReturnReceived,
  type AdminOrderRequestRow,
} from "@/actions/admin-order-requests";
import { BRAND } from "@/lib/brand";

// Re-export so admin order detail page can import from one place
export type { AdminOrderRequestRow };

const STATUS_BG: Record<AdminOrderRequestRow["status"], string> = {
  pending: `${BRAND.purple}25`,
  approved: `${BRAND.blue}25`,
  rejected: "rgba(220, 38, 38, 0.18)",
  shipped: `${BRAND.green}25`,
  received: `${BRAND.green}40`,
  expired: "rgba(100, 116, 139, 0.18)",
};
const STATUS_FG: Record<AdminOrderRequestRow["status"], string> = {
  pending: BRAND.purple,
  approved: BRAND.blue,
  rejected: "#DC2626",
  shipped: BRAND.greenDark,
  received: "#16a34a",
  expired: "#64748b",
};
const STATUS_LABEL: Record<AdminOrderRequestRow["status"], string> = {
  pending: "Pending",
  approved: "Approved — awaiting shipment",
  rejected: "Rejected",
  shipped: "Shipped back",
  received: "Received — re-making",
  expired: "Expired (ship window missed)",
};

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function RequestCard({ request }: { request: AdminOrderRequestRow }) {
  const [notes, setNotes] = useState(request.adminNotes ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isPending = request.status === "pending";
  const isShipped = request.status === "shipped";

  const onApprove = () => {
    setError(null);
    startTransition(async () => {
      const res = await approveOrderRequest(request.id, notes || undefined);
      if (!res.ok) setError(res.error);
    });
  };

  const onReject = () => {
    setError(null);
    startTransition(async () => {
      const res = await rejectOrderRequest(request.id, notes || undefined);
      if (!res.ok) setError(res.error);
    });
  };

  const onMarkReceived = () => {
    setError(null);
    startTransition(async () => {
      const res = await markReturnReceived(request.id);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <li
      className="rounded-xl border-2 p-3"
      style={{ borderColor: `${BRAND.ink}11` }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <span className="font-bold capitalize">
          {request.type === "return" ? "Return / Replacement" : "Cancel"}
        </span>
        <span
          className="text-xs px-2 py-1 rounded-full font-bold uppercase tracking-wider"
          style={{
            backgroundColor: STATUS_BG[request.status],
            color: STATUS_FG[request.status],
          }}
        >
          {STATUS_LABEL[request.status]}
        </span>
        <span className="text-xs text-slate-500 ml-auto">
          {new Date(request.createdAt).toLocaleString("en-MY")}
        </span>
      </div>

      {/* Reason */}
      <p className="text-sm whitespace-pre-wrap mb-3">{request.reason}</p>

      {/* Return-specific: items being returned */}
      {request.type === "return" && request.items.length > 0 ? (
        <div className="mb-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Items to return
          </p>
          <ul className="grid gap-1">
            {request.items.map((item) => (
              <li
                key={item.orderItemId}
                className="text-sm rounded-lg px-2 py-1"
                style={{ backgroundColor: `${BRAND.ink}06` }}
              >
                <span className="font-mono text-xs text-slate-500">
                  {item.orderItemId.slice(0, 8)}…
                </span>{" "}
                — qty: <strong>{item.qty}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Return-specific: review photos */}
      {request.type === "return" && request.photos.length > 0 ? (
        <div className="mb-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Review photos
          </p>
          <div className="flex gap-2 flex-wrap">
            {request.photos.map((src, idx) => (
              <a
                key={src}
                href={src}
                target="_blank"
                rel="noreferrer"
                className="block w-20 h-20 rounded-lg overflow-hidden border-2 shrink-0"
                style={{ borderColor: `${BRAND.ink}18` }}
                aria-label={`Review photo ${idx + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {/* Return-specific: ship-by date when approved */}
      {request.type === "return" &&
        request.status === "approved" &&
        request.approvedAt ? (
        <p
          className="text-sm mb-3 rounded-lg px-2 py-1 font-semibold"
          style={{ backgroundColor: `${BRAND.blue}15`, color: BRAND.blue }}
        >
          Customer ship-by:{" "}
          {addDays(new Date(request.approvedAt), 3).toLocaleDateString("en-MY", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
      ) : null}

      {/* Return-specific: tracking info once shipped */}
      {request.type === "return" &&
        request.returnCourier &&
        request.returnTrackingNumber ? (
        <div
          className="mb-3 rounded-lg px-3 py-2 text-sm"
          style={{ backgroundColor: `${BRAND.green}15` }}
        >
          <p>
            <strong>Courier:</strong> {request.returnCourier}
          </p>
          <p>
            <strong>Tracking:</strong>{" "}
            <span className="font-mono">{request.returnTrackingNumber}</span>
          </p>
          {request.shippedAt ? (
            <p className="text-xs text-slate-500 mt-1">
              Shipped{" "}
              {new Date(request.shippedAt).toLocaleString("en-MY")}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Admin actions */}
      {isPending ? (
        <>
          <label
            className="block text-xs font-semibold mb-1"
            htmlFor={`admin-notes-${request.id}`}
          >
            Admin notes (optional, visible to customer)
          </label>
          <textarea
            id={`admin-notes-${request.id}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full rounded-lg border-2 px-3 py-2 min-h-[60px] focus:outline-none focus:ring-2 bg-white text-sm mb-3"
            style={{ borderColor: `${BRAND.ink}22` }}
          />
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={onApprove}
              disabled={pending}
              className="inline-flex items-center justify-center min-h-[48px] px-4 rounded-lg font-bold text-sm disabled:opacity-40"
              style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
            >
              {pending ? "…" : "Approve"}
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={pending}
              className="inline-flex items-center justify-center min-h-[48px] px-4 rounded-lg font-bold text-sm border-2 disabled:opacity-40"
              style={{ borderColor: "#DC2626", color: "#DC2626" }}
            >
              {pending ? "…" : "Reject"}
            </button>
          </div>
        </>
      ) : isShipped ? (
        <div>
          <button
            type="button"
            onClick={onMarkReceived}
            disabled={pending}
            className="inline-flex items-center justify-center min-h-[48px] px-4 rounded-lg font-bold text-sm disabled:opacity-40"
            style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
          >
            {pending ? "…" : "Mark as received"}
          </button>
          <p className="text-xs text-slate-500 mt-1">
            Click after physically receiving the customer&apos;s returned items.
            This will trigger the re-make process email.
          </p>
        </div>
      ) : (
        <>
          {request.adminNotes ? (
            <p
              className="text-sm rounded-lg p-2"
              style={{
                backgroundColor: `${BRAND.ink}08`,
                color: BRAND.ink,
              }}
            >
              <strong>Notes:</strong> {request.adminNotes}
            </p>
          ) : null}
          {request.resolvedAt ? (
            <p className="text-xs text-slate-500 mt-2">
              Resolved {new Date(request.resolvedAt).toLocaleString("en-MY")}
            </p>
          ) : null}
        </>
      )}
      {error ? (
        <p
          role="status"
          aria-live="polite"
          className="text-sm mt-2"
          style={{ color: "#DC2626" }}
        >
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function OrderRequestsAdmin({
  requests,
}: {
  requests: AdminOrderRequestRow[];
}) {
  if (requests.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        No cancel or return requests on this order.
      </p>
    );
  }
  return (
    <ul className="grid gap-3">
      {requests.map((r) => (
        <RequestCard key={r.id} request={r} />
      ))}
    </ul>
  );
}
