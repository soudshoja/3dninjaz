"use client";

import { useState, useTransition } from "react";
import {
  approveOrderRequest,
  rejectOrderRequest,
} from "@/actions/admin-order-requests";
import { BRAND } from "@/lib/brand";

export type AdminOrderRequest = {
  id: string;
  type: "cancel" | "return";
  status: "pending" | "approved" | "rejected";
  reason: string;
  adminNotes: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
};

const STATUS_BG: Record<AdminOrderRequest["status"], string> = {
  pending: `${BRAND.purple}25`,
  approved: `${BRAND.green}30`,
  rejected: "rgba(220, 38, 38, 0.18)",
};
const STATUS_FG: Record<AdminOrderRequest["status"], string> = {
  pending: BRAND.purple,
  approved: "#16a34a",
  rejected: "#DC2626",
};

function RequestCard({ request }: { request: AdminOrderRequest }) {
  const [notes, setNotes] = useState(request.adminNotes ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isPending = request.status === "pending";

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

  return (
    <li
      className="rounded-xl border-2 p-3"
      style={{ borderColor: `${BRAND.ink}11` }}
    >
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <span className="font-bold capitalize">{request.type}</span>
        <span
          className="text-xs px-2 py-1 rounded-full font-bold uppercase tracking-wider"
          style={{
            backgroundColor: STATUS_BG[request.status],
            color: STATUS_FG[request.status],
          }}
        >
          {request.status}
        </span>
        <span className="text-xs text-slate-500 ml-auto">
          {new Date(request.createdAt).toLocaleString("en-MY")}
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap mb-3">{request.reason}</p>

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
        </>
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
    </li>
  );
}

export function OrderRequestsAdmin({
  requests,
}: {
  requests: AdminOrderRequest[];
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
