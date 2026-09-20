"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { resendOutboxRow, cancelOutboxRow } from "@/actions/admin-whatsapp-outbox";
import {
  RESENDABLE_STATUSES,
  type OutboxListRow,
  type OutboxStatus,
} from "@/lib/whatsapp/outbox-types";

const BADGE: Record<OutboxStatus, { bg: string; fg: string }> = {
  queued: { bg: "#e0f2fe", fg: "#075985" },
  sending: { bg: "#e0f2fe", fg: "#075985" },
  accepted: { bg: "#dcfce7", fg: "#166534" },
  server_ack: { bg: "#dcfce7", fg: "#166534" },
  delivered: { bg: "#bbf7d0", fg: "#14532d" },
  read: { bg: "#bbf7d0", fg: "#14532d" },
  failed_retryable: { bg: "#fef3c7", fg: "#92400e" },
  failed_final: { bg: "#fee2e2", fg: "#991b1b" },
  undelivered: { bg: "#ffedd5", fg: "#9a3412" },
  cancelled: { bg: "#e5e7eb", fg: "#374151" },
};

const HEADERS = [
  "Created",
  "Event",
  "Order",
  "Recipient",
  "Status",
  "Tries",
  "Next attempt",
  "Ack",
  "Last error",
  "",
];

function fmt(iso: string): string {
  return iso ? new Date(iso).toLocaleString("en-MY") : "-";
}

export function WhatsappOutboxTable({ rows }: { rows: OutboxListRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setErr(r.error ?? "Failed");
      router.refresh();
    });
  }

  return (
    <div>
      {err && (
        <p className="mb-3 text-sm" style={{ color: "#991b1b" }}>
          {err}
        </p>
      )}
      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full text-left text-xs">
          <thead style={{ color: BRAND.ink }}>
            <tr className="border-b">
              {HEADERS.map((h, i) => (
                <th key={i} className="px-3 py-2 font-semibold whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-slate-500">
                  No messages.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const b = BADGE[r.status];
              return (
                <tr key={r.id} className="border-b last:border-0 align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{fmt(r.createdAt)}</td>
                  <td className="px-3 py-2">{r.eventKey}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.orderId ? (
                      <Link
                        href={`/admin/orders/${r.orderId}`}
                        className="underline"
                        style={{ color: BRAND.blue }}
                      >
                        {r.orderNumber}
                      </Link>
                    ) : (
                      (r.orderNumber ?? "-")
                    )}
                    {r.customerName && (
                      <div className="text-slate-500">{r.customerName}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">{r.recipient}</td>
                  <td className="px-3 py-2">
                    <span
                      className="rounded-full px-2 py-0.5 font-semibold whitespace-nowrap"
                      style={{ backgroundColor: b.bg, color: b.fg }}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.attempts}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmt(r.nextAttemptAt)}</td>
                  <td className="px-3 py-2">{r.ackStatus ?? "-"}</td>
                  <td
                    className="px-3 py-2 max-w-[220px] truncate"
                    title={r.lastError ?? ""}
                  >
                    {r.lastError ?? "-"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {RESENDABLE_STATUSES.includes(r.status) && (
                      <button
                        disabled={pending}
                        onClick={() => act(() => resendOutboxRow(r.id))}
                        className="mr-2 underline"
                        style={{ color: BRAND.blue }}
                      >
                        Resend
                      </button>
                    )}
                    {(r.status === "queued" || r.status === "failed_retryable") && (
                      <button
                        disabled={pending}
                        onClick={() => act(() => cancelOutboxRow(r.id))}
                        className="underline text-slate-500"
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
