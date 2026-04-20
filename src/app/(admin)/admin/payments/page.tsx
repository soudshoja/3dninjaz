import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  listAdminPayments,
  type PaymentStatusFilter,
} from "@/actions/admin-payments";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { formatOrderNumber } from "@/lib/orders";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Payments",
  robots: { index: false, follow: false },
};

const STATUS_TABS: Array<{ key: PaymentStatusFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "cancelled", label: "Cancelled" },
];

// Phase 7 (07-04) — refund-status chip strip.
const REFUND_TABS: Array<{ key: "any" | "none" | "partial" | "full"; label: string }> = [
  { key: "any", label: "All" },
  { key: "none", label: "No refunds" },
  { key: "partial", label: "Partial" },
  { key: "full", label: "Full" },
];

function isStatusFilter(v: string | undefined): v is PaymentStatusFilter {
  return v === "all" || v === "active" || v === "cancelled";
}

function isRefundFilterValue(
  v: string | undefined,
): v is "any" | "none" | "partial" | "full" {
  return v === "any" || v === "none" || v === "partial" || v === "full";
}

/**
 * /admin/payments — captured PayPal transactions report.
 *
 * Mirrors what the admin would otherwise pull from the PayPal dashboard:
 * one row per captured order with the order #, customer, MYR amount, date,
 * PayPal Order ID + Capture ID, and order status (paid/processing/shipped/
 * delivered/cancelled). Refunded support is deferred until the refund flow
 * ships (no DB column for it yet).
 *
 * URL state:
 *   ?status=all|active|cancelled  (default: all)
 *   ?from=YYYY-MM-DD              (inclusive)
 *   ?to=YYYY-MM-DD                (inclusive — end-of-day handled in action)
 *   ?page=N                       (zero-indexed)
 *
 * requireAdmin() at the top is belt-and-braces (the layout already redirects
 * unauthenticated users) — CVE-2025-29927 mitigation.
 */
export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    from?: string;
    to?: string;
    page?: string;
    refunded?: string;
  }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const status: PaymentStatusFilter = isStatusFilter(sp.status)
    ? sp.status
    : "all";
  const refunded: "any" | "none" | "partial" | "full" = isRefundFilterValue(
    sp.refunded,
  )
    ? sp.refunded
    : "any";
  const page = Math.max(0, Math.floor(Number(sp.page) || 0));

  const result = await listAdminPayments({
    status,
    from: sp.from,
    to: sp.to,
    page,
    refunded,
  });

  function withParams(over: Partial<Record<string, string | undefined>>) {
    const merged: Record<string, string> = {};
    if (status !== "all") merged.status = status;
    if (refunded !== "any") merged.refunded = refunded;
    if (sp.from) merged.from = sp.from;
    if (sp.to) merged.to = sp.to;
    for (const [k, v] of Object.entries(over)) {
      if (v === undefined) delete merged[k];
      else merged[k] = v;
    }
    const qs = new URLSearchParams(merged).toString();
    return qs ? `?${qs}` : "";
  }

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-4">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
            Payments
          </h1>
          <p className="mt-1 text-slate-600">
            Captured PayPal transactions. Showing {result.rows.length} of page{" "}
            {result.page + 1}.
          </p>
        </header>

        {/* Filters — status tabs + date range */}
        <section
          className="rounded-2xl p-4 md:p-5 mb-4"
          style={{ backgroundColor: "#ffffff" }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-wrap gap-2">
              {STATUS_TABS.map((tab) => {
                const active = tab.key === status;
                return (
                  <Link
                    key={tab.key}
                    href={`/admin/payments${withParams({ status: tab.key === "all" ? undefined : tab.key, page: undefined })}`}
                    className="inline-flex items-center rounded-full border px-4 min-h-[40px] text-sm font-semibold"
                    style={{
                      backgroundColor: active ? BRAND.ink : "transparent",
                      color: active ? BRAND.cream : BRAND.ink,
                      borderColor: active ? BRAND.ink : "#0B102022",
                    }}
                    aria-current={active ? "page" : undefined}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="self-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                Refunds:
              </span>
              {REFUND_TABS.map((tab) => {
                const active = tab.key === refunded;
                return (
                  <Link
                    key={tab.key}
                    href={`/admin/payments${withParams({ refunded: tab.key === "any" ? undefined : tab.key, page: undefined })}`}
                    className="inline-flex items-center rounded-full border px-3 min-h-[40px] text-xs font-semibold"
                    style={{
                      backgroundColor: active ? BRAND.blue : "transparent",
                      color: active ? "#ffffff" : BRAND.ink,
                      borderColor: active ? BRAND.blue : "#0B102022",
                    }}
                    aria-current={active ? "page" : undefined}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>

            <form
              action="/admin/payments"
              method="get"
              className="flex flex-wrap items-end gap-3"
            >
              {status !== "all" ? (
                <input type="hidden" name="status" value={status} />
              ) : null}
              <label className="text-xs font-semibold text-slate-700">
                From
                <input
                  type="date"
                  name="from"
                  defaultValue={sp.from ?? ""}
                  className="block min-h-[40px] rounded-md border px-2 text-sm"
                  style={{ borderColor: "#0B102022" }}
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                To
                <input
                  type="date"
                  name="to"
                  defaultValue={sp.to ?? ""}
                  className="block min-h-[40px] rounded-md border px-2 text-sm"
                  style={{ borderColor: "#0B102022" }}
                />
              </label>
              <button
                type="submit"
                className="min-h-[40px] rounded-md px-4 text-sm font-semibold text-white"
                style={{ backgroundColor: BRAND.blue }}
              >
                Apply
              </button>
              {sp.from || sp.to ? (
                <Link
                  href={`/admin/payments${withParams({ from: undefined, to: undefined, page: undefined })}`}
                  className="min-h-[40px] inline-flex items-center px-3 text-sm underline"
                >
                  Clear dates
                </Link>
              ) : null}
            </form>
          </div>
        </section>

        {result.rows.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: "#ffffff" }}
          >
            <p className="text-lg font-bold mb-2">No captured transactions.</p>
            <p className="text-sm text-slate-600">
              When customers complete a PayPal purchase, the transaction will
              appear here.
            </p>
          </div>
        ) : (
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
                    <th className="p-3">Order #</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Gross</th>
                    <th className="p-3">Fee</th>
                    <th className="p-3">Net</th>
                    <th className="p-3">Refunded</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Capture ID</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => {
                    const refundedNum = parseFloat(r.refundedAmount);
                    const totalNum = parseFloat(r.amount);
                    const isFullyRefunded =
                      refundedNum >= totalNum - 0.001 && refundedNum > 0;
                    const isPartiallyRefunded =
                      refundedNum > 0 && !isFullyRefunded;
                    return (
                      <tr key={r.orderId} className="border-t border-black/10">
                        <td className="p-3">
                          <Link
                            href={`/admin/payments/${r.orderId}`}
                            className="font-semibold underline decoration-dotted"
                          >
                            {formatOrderNumber(r.orderId)}
                          </Link>
                          <p className="text-xs text-slate-500">
                            {r.itemCount} {r.itemCount === 1 ? "item" : "items"}
                          </p>
                        </td>
                        <td className="p-3">
                          <p className="font-semibold truncate max-w-[180px]">
                            {r.customerName}
                          </p>
                          <p className="text-xs text-slate-600 truncate max-w-[200px]">
                            {r.customerEmail}
                          </p>
                        </td>
                        <td className="p-3 whitespace-nowrap font-semibold">
                          {formatMYR(r.amount)}
                        </td>
                        <td className="p-3 whitespace-nowrap text-xs text-slate-700">
                          {r.paypalFee ? formatMYR(r.paypalFee) : "—"}
                        </td>
                        <td className="p-3 whitespace-nowrap text-xs text-slate-700">
                          {r.paypalNet ? formatMYR(r.paypalNet) : "—"}
                        </td>
                        <td className="p-3 whitespace-nowrap text-xs">
                          {refundedNum > 0 ? (
                            <span
                              className="inline-flex items-center rounded-full px-2 py-0.5 font-bold text-white"
                              style={{
                                backgroundColor: isFullyRefunded
                                  ? "#dc2626"
                                  : "#f59e0b",
                              }}
                            >
                              {formatMYR(r.refundedAmount)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap text-slate-700">
                          {new Date(r.createdAt).toLocaleDateString("en-MY")}
                        </td>
                        <td className="p-3">
                          <code className="text-xs break-all">
                            {r.paypalCaptureId}
                          </code>
                        </td>
                        <td className="p-3">
                          <span
                            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white"
                            style={{
                              backgroundColor:
                                r.status === "cancelled"
                                  ? "#dc2626"
                                  : r.status === "delivered"
                                    ? BRAND.green
                                    : BRAND.blue,
                            }}
                          >
                            {r.status}
                            {isPartiallyRefunded ? " · partial" : ""}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination — prev/next with no count call (cheap on growing data) */}
        <nav className="mt-4 flex items-center justify-between gap-3">
          <Link
            href={`/admin/payments${withParams({ page: result.page === 0 ? undefined : String(result.page - 1) })}`}
            className="inline-flex items-center min-h-[40px] rounded-md border px-3 text-sm font-semibold"
            style={{
              borderColor: "#0B102022",
              opacity: result.page === 0 ? 0.4 : 1,
              pointerEvents: result.page === 0 ? "none" : undefined,
            }}
            aria-disabled={result.page === 0}
          >
            ← Previous
          </Link>
          <span className="text-sm text-slate-600">Page {result.page + 1}</span>
          <Link
            href={`/admin/payments${withParams({ page: String(result.page + 1) })}`}
            className="inline-flex items-center min-h-[40px] rounded-md border px-3 text-sm font-semibold"
            style={{
              borderColor: "#0B102022",
              opacity: result.hasMore ? 1 : 0.4,
              pointerEvents: result.hasMore ? undefined : "none",
            }}
            aria-disabled={!result.hasMore}
          >
            Next →
          </Link>
        </nav>
      </div>
    </main>
  );
}
