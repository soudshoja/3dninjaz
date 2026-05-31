import { BRAND } from "@/lib/brand";

/**
 * Phase 6 06-06 — customer-side read-only list of past + pending cancel/return
 * requests on a single order.
 * 260601-afs — extended to render shipped/received/expired statuses, returned
 * items, photo thumbnails, tracking info, and ship-by date.
 */
export type OrderRequestRow = {
  id: string;
  type: "cancel" | "return";
  status:
    | "pending"
    | "approved"
    | "rejected"
    | "shipped"
    | "received"
    | "expired";
  reason: string;
  adminNotes: string | null;
  items: Array<{ orderItemId: string; qty: number }>;
  photos: string[];
  returnCourier: string | null;
  returnTrackingNumber: string | null;
  approvedAt: Date | null;
  shippedAt: Date | null;
  createdAt: Date;
  resolvedAt: Date | null;
};

const STATUS_BG: Record<OrderRequestRow["status"], string> = {
  pending: `${BRAND.purple}25`,
  approved: `${BRAND.blue}25`,
  rejected: "rgba(220, 38, 38, 0.18)",
  shipped: `${BRAND.green}25`,
  received: `${BRAND.green}40`,
  expired: "rgba(100, 116, 139, 0.18)",
};
const STATUS_FG: Record<OrderRequestRow["status"], string> = {
  pending: BRAND.purple,
  approved: BRAND.blue,
  rejected: "#DC2626",
  shipped: BRAND.greenDark,
  received: "#16a34a",
  expired: "#64748b",
};
const STATUS_LABEL: Record<OrderRequestRow["status"], string> = {
  pending: "Pending review",
  approved: "Approved — please ship",
  rejected: "Not approved",
  shipped: "Shipped back",
  received: "Received — re-making",
  expired: "Expired",
};

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

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
        Return / cancel history
      </h2>
      <ul className="grid gap-3">
        {requests.map((r) => (
          <li
            key={r.id}
            className="rounded-xl border-2 p-3"
            style={{ borderColor: `${BRAND.ink}11` }}
          >
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <span className="font-bold capitalize">
                {r.type === "return" ? "Return / replacement" : "Cancel"}
              </span>
              <span
                className="text-xs px-2 py-1 rounded-full font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: STATUS_BG[r.status],
                  color: STATUS_FG[r.status],
                }}
              >
                {STATUS_LABEL[r.status]}
              </span>
              <span className="text-xs text-slate-500 ml-auto">
                {new Date(r.createdAt).toLocaleString("en-MY")}
              </span>
            </div>

            <p className="text-sm whitespace-pre-wrap mb-2">{r.reason}</p>

            {/* Return-specific: ship-by date when approved */}
            {r.type === "return" && r.status === "approved" && r.approvedAt ? (
              <p
                className="text-sm font-semibold mb-2 rounded-lg px-3 py-2"
                style={{
                  backgroundColor: `${BRAND.blue}15`,
                  color: BRAND.blue,
                }}
              >
                Ship your item back by:{" "}
                {addDays(new Date(r.approvedAt), 3).toLocaleDateString("en-MY", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            ) : null}

            {/* Return-specific: photo gallery */}
            {r.type === "return" && r.photos.length > 0 ? (
              <div className="flex gap-2 flex-wrap mb-2">
                {r.photos.map((src, idx) => (
                  <a
                    key={src}
                    href={src}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-16 h-16 rounded-lg overflow-hidden border-2 shrink-0"
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
            ) : null}

            {/* Return-specific: tracking info after shipment */}
            {r.type === "return" && r.returnCourier && r.returnTrackingNumber ? (
              <p className="text-sm mb-2">
                <strong>Shipped via:</strong> {r.returnCourier} ·{" "}
                <span className="font-mono">{r.returnTrackingNumber}</span>
                {r.shippedAt ? (
                  <span className="text-slate-500 ml-1">
                    ({new Date(r.shippedAt).toLocaleDateString("en-MY")})
                  </span>
                ) : null}
              </p>
            ) : null}

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
