import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { formatOrderNumber } from "@/lib/orders";
import type { DisputeRow } from "@/actions/admin-disputes";

/**
 * Phase 7 (07-06) — disputes list table.
 *
 * Mobile: wrapped in overflow-x-auto so the table scrolls horizontally
 * without breaking page layout (D-04 mobile-first pattern).
 */

function statusColor(status: string): string {
  const u = status.toUpperCase();
  if (u === "RESOLVED") return BRAND.green;
  if (u === "OPEN" || u === "WAITING_FOR_SELLER_RESPONSE") return "#f59e0b";
  if (u === "WAITING_FOR_BUYER_RESPONSE") return BRAND.blue;
  if (u === "UNDER_REVIEW") return BRAND.purple;
  return BRAND.ink;
}

export function DisputeListTable({ rows }: { rows: DisputeRow[] }) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{ backgroundColor: "#ffffff" }}
      >
        <p className="text-lg font-bold mb-2">No disputes.</p>
        <p className="text-sm text-slate-600">
          PayPal disputes opened by buyers will appear here. Refresh to pull
          the latest from PayPal.
        </p>
      </div>
    );
  }
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: "#ffffff" }}
    >
      <div className="overflow-x-auto">
        <table className="min-w-[860px] w-full text-sm">
          <thead>
            <tr
              className="text-left"
              style={{ backgroundColor: `${BRAND.ink}0d` }}
            >
              <th className="p-3">Dispute ID</th>
              <th className="p-3">Status</th>
              <th className="p-3">Reason</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Created</th>
              <th className="p-3">Linked order</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr
                key={d.id}
                className="border-t border-black/10 hover:bg-slate-50"
              >
                <td className="p-3">
                  <Link
                    href={`/admin/disputes/${encodeURIComponent(d.disputeId)}`}
                    className="font-mono text-xs underline decoration-dotted break-all"
                  >
                    {d.disputeId}
                  </Link>
                </td>
                <td className="p-3">
                  <span
                    className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white"
                    style={{ backgroundColor: statusColor(d.status) }}
                  >
                    {d.status}
                  </span>
                </td>
                <td className="p-3 text-xs text-slate-700">
                  {d.reason ?? "—"}
                </td>
                <td className="p-3 whitespace-nowrap font-semibold">
                  {d.amount
                    ? `${formatMYR(d.amount)} ${d.currency ?? ""}`
                    : "—"}
                </td>
                <td className="p-3 whitespace-nowrap text-slate-700">
                  {new Date(d.createDate).toLocaleDateString("en-MY")}
                </td>
                <td className="p-3">
                  {d.orderId ? (
                    <Link
                      href={`/admin/orders/${d.orderId}`}
                      className="underline decoration-dotted text-xs"
                    >
                      {formatOrderNumber(d.orderId)}
                    </Link>
                  ) : (
                    <span className="text-xs text-amber-700">Not mapped</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
