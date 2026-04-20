import type { PaymentDetail } from "@/actions/admin-payments";
import { formatMYR } from "@/lib/format";
import { BRAND } from "@/lib/brand";
import { AlertTriangle } from "lucide-react";

/**
 * Phase 7 (07-04) — payment financials panel.
 *
 * Mirrors the PayPal payment-detail page so admin doesn't need to log into
 * paypal.com. 6 cells: Gross / Fee / Net / Status / Seller protection /
 * Settle date. Refunded amount sub-row when > 0.
 *
 * Mobile (D-04): 2 cols on small screens, 6 cols on lg+.
 */

function statusColor(status: string): string {
  const u = status.toUpperCase();
  if (u === "COMPLETED") return BRAND.green;
  if (u === "REFUNDED" || u === "PARTIALLY_REFUNDED") return "#f59e0b";
  if (u === "PENDING") return BRAND.blue;
  if (u === "DECLINED" || u === "FAILED") return "#dc2626";
  return BRAND.ink;
}

function fmtDate(d: string | Date | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("en-MY");
  } catch {
    return "—";
  }
}

export function PaymentFinancialsPanel({ detail }: { detail: PaymentDetail }) {
  const live = detail.live;
  const gross = live?.grossValue ?? detail.localGross;
  const fee = live?.feeValue ?? detail.cachedFee;
  const net = live?.netValue ?? detail.cachedNet;
  const sellerProtection =
    live?.sellerProtection ?? detail.cachedSellerProtection;
  const settle = live?.settleDate ?? detail.cachedSettleDate;
  const status = live?.status ?? "—";
  const refundedNum = parseFloat(detail.localRefundedAmount);
  const totalNum = parseFloat(detail.localGross);

  return (
    <div className="space-y-4">
      {detail.liveError ? (
        <div
          className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          role="status"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Live data unavailable</p>
            <p className="text-xs">
              Showing last cached values. {detail.liveError}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Cell label="Gross">
          <span className="font-mono">{formatMYR(gross)}</span>
        </Cell>
        <Cell label="PayPal fee">
          <span className="font-mono">{fee ? formatMYR(fee) : "—"}</span>
        </Cell>
        <Cell label="Net to seller">
          <span className="font-mono">{net ? formatMYR(net) : "—"}</span>
        </Cell>
        <Cell label="Status">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold text-white"
            style={{ backgroundColor: statusColor(status) }}
          >
            {status}
          </span>
        </Cell>
        <Cell label="Seller protection">
          <span className="text-xs">{sellerProtection ?? "—"}</span>
        </Cell>
        <Cell label="Settle date">
          <span className="text-xs">{fmtDate(settle)}</span>
        </Cell>
      </div>

      {refundedNum > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">
            Refunded: {formatMYR(detail.localRefundedAmount)} of{" "}
            {formatMYR(detail.localGross)}
          </p>
          {refundedNum >= totalNum - 0.001 ? (
            <p className="mt-1 text-xs text-amber-800">
              This capture is fully refunded; the order has been moved to
              cancelled.
            </p>
          ) : (
            <p className="mt-1 text-xs text-amber-800">
              Remaining refundable:{" "}
              {formatMYR((totalNum - refundedNum).toFixed(2))}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Cell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-[var(--color-brand-border)] bg-white p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold">{children}</p>
    </div>
  );
}
