import { BRAND } from "@/lib/brand";

/**
 * Phase 6 06-06 — customer-side read-only list of past + pending cancel/return
 * requests on a single order. Each row shows type + status pill + reason +
 * createdAt, plus admin notes when the request is resolved.
 */
export type OrderRequestRow = {
  id: string;
  type: "cancel" | "return";
  status: "pending" | "approved" | "rejected";
  reason: string;
  adminNotes: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
};

const STATUS_BG: Record<OrderRequestRow["status"], string> = {
  pending: `${BRAND.purple}25`,
  approved: `${BRAND.green}30`,
  rejected: "rgba(220, 38, 38, 0.18)",
};
const STATUS_FG: Record<OrderRequestRow["status"], string> = {
  pending: BRAND.purple,
  approved: "#16a34a",
  rejected: "#DC2626",
};

export function OrderRequestsList({
  requests,
}: {
  requests: OrderRequestRow[];
}) {
  if (requests.length === 0) return null;

  return (
    <section
      aria-labelledby="order-requests"
      className="rounded-2xl p-4 md:p-6 mb-6 bg-white"
    >
      <h2
        id="order-requests"
        className="font-[var(--font-heading)] text-xl mb-4"
      >
        Cancel / return history
      </h2>
      <ul className="grid gap-3">
        {requests.map((r) => (
          <li
            key={r.id}
            className="rounded-xl border-2 p-3"
            style={{ borderColor: `${BRAND.ink}11` }}
          >
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <span className="font-bold capitalize">{r.type}</span>
              <span
                className="text-xs px-2 py-1 rounded-full font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: STATUS_BG[r.status],
                  color: STATUS_FG[r.status],
                }}
              >
                {r.status}
              </span>
              <span className="text-xs text-slate-500 ml-auto">
                {new Date(r.createdAt).toLocaleString("en-MY")}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{r.reason}</p>
            {r.adminNotes ? (
              <p
                className="text-sm mt-2 rounded-lg p-2"
                style={{
                  backgroundColor: `${BRAND.ink}08`,
                  color: BRAND.ink,
                }}
              >
                <strong>Note from us:</strong> {r.adminNotes}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
