import type { PaymentDetail } from "@/actions/admin-payments";
import { formatMYR } from "@/lib/format";

/**
 * Phase 7 (07-05) — refund history (v1).
 *
 * Currently a single-row summary using orders.refundedAmount + last
 * settle/update timestamp. Future iterations may add a per-refund history
 * table; out of scope for ADM-19 v1.
 */
export function RefundHistoryList({ detail }: { detail: PaymentDetail }) {
  const refundedNum = parseFloat(detail.localRefundedAmount);
  if (refundedNum <= 0) {
    return (
      <p className="text-sm text-slate-500">
        No refunds have been issued for this capture.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-black/10">
      <li className="py-2 flex items-center justify-between">
        <span className="text-sm font-medium">
          Total refunded
        </span>
        <span className="font-mono text-sm">
          {formatMYR(detail.localRefundedAmount)}
        </span>
      </li>
      {detail.cachedSettleDate ? (
        <li className="py-2 flex items-center justify-between text-xs text-slate-500">
          <span>Last PayPal sync</span>
          <span>
            {new Date(detail.cachedSettleDate).toLocaleString("en-MY")}
          </span>
        </li>
      ) : null}
    </ul>
  );
}
