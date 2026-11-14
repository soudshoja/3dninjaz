import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { formatOrderNumber } from "@/lib/orders";
import { getSalesOrders } from "@/lib/sales-orders";
import {
  resolveRange,
  rangeToQuery,
  bucketBounds,
  bucketKey,
  bucketLabel,
  isValidYmd,
  mytYmd,
  formatYmd,
  type RangeBucket,
} from "@/lib/date-range";
import { StatCard } from "@/components/admin/accounting-ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Orders in period",
  robots: { index: false, follow: false },
};

const BUCKETS: RangeBucket[] = ["day", "week", "month"];

function statusLabel(s: string): string {
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function itemText(r: { itemLabel: string | null; itemCount: number }): string {
  return r.itemLabel ?? `${r.itemCount} ${r.itemCount === 1 ? "item" : "items"}`;
}

export default async function SalesPeriodOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; bucket?: string; key?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const bucket = BUCKETS.find((b) => b === sp.bucket);
  // Only a real bucket start is accepted (a month key must be the 1st, a week key a Monday).
  if (!bucket || !isValidYmd(sp.key) || bucketKey(sp.key, bucket) !== sp.key) notFound();
  const key = sp.key;

  // The report's own range, so the rows here are clipped exactly like the report row was.
  const range = resolveRange(sp, { defaultPreset: "this_month" });
  const b = bucketBounds(key, bucket);
  const from = range.from && range.from > b.from ? range.from : b.from;
  const to = range.to && range.to < b.to ? range.to : b.to;

  const { rows, totals } = await getSalesOrders({ from, to });
  const title = bucketLabel(key, bucket);
  const back = `/admin/accounting/sales?${rangeToQuery(range)}`;
  const countText = `${totals.orders} ${totals.orders === 1 ? "order" : "orders"}`;

  return (
    <main className="min-h-screen" style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link href={back} className="text-sm underline decoration-dotted" style={{ color: BRAND.ink }}>
          ← Back to sales report
        </Link>
        <h1 className="mt-3 font-[var(--font-heading)] text-3xl md:text-4xl">{title}</h1>
        <p className="mt-1 text-slate-600">
          {formatYmd(from)} to {formatYmd(to)}. Every paid order in this {bucket}, website and
          manual together. Sales exclude shipping.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Orders" value={String(totals.orders)} />
          <StatCard label="Sales excl. shipping" value={formatMYR(totals.sales)} />
          <StatCard label="Shipping collected" value={formatMYR(totals.shipping)} />
          <StatCard label="PayPal fees" value={formatMYR(totals.paypalFees)} />
        </div>

        {rows.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-white p-8 text-center">
            <p className="text-lg font-bold">No paid orders in this period.</p>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-2xl bg-white">
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="text-left" style={{ backgroundColor: `${BRAND.ink}0d` }}>
                    <th className="p-3">Order</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Sales</th>
                    <th className="p-3 text-right">Shipping</th>
                    <th className="p-3 text-right">PayPal fee</th>
                    <th className="p-3 text-right">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-black/10 hover:bg-slate-50">
                      <td className="whitespace-nowrap p-3 font-semibold">
                        <Link
                          href={`/admin/orders/${r.id}`}
                          className="underline decoration-dotted underline-offset-4"
                          style={{ color: BRAND.ink }}
                        >
                          {formatOrderNumber(r.id)}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap p-3">{formatYmd(mytYmd(r.createdAt))}</td>
                      <td className="p-3">
                        <p className="max-w-[220px] truncate font-semibold">{r.customer}</p>
                        <p className="text-xs text-slate-500">{itemText(r)}</p>
                      </td>
                      <td className="p-3">{r.source === "manual" ? "Manual" : "Website"}</td>
                      <td className="p-3">{statusLabel(r.status)}</td>
                      <td className="p-3 text-right font-semibold tabular-nums">{formatMYR(r.sales)}</td>
                      <td className="p-3 text-right tabular-nums text-slate-500">{formatMYR(r.shipping)}</td>
                      <td className="p-3 text-right tabular-nums">
                        {r.paypalFee == null ? "-" : formatMYR(r.paypalFee)}
                      </td>
                      <td className="p-3 text-right tabular-nums">{formatMYR(r.receipts)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr
                    className="border-t-2 border-black/20 font-bold"
                    style={{ backgroundColor: `${BRAND.ink}0d` }}
                  >
                    <td className="p-3" colSpan={5}>
                      Total, {countText}
                    </td>
                    <td className="p-3 text-right tabular-nums">{formatMYR(totals.sales)}</td>
                    <td className="p-3 text-right tabular-nums">{formatMYR(totals.shipping)}</td>
                    <td className="p-3 text-right tabular-nums">{formatMYR(totals.paypalFees)}</td>
                    <td className="p-3 text-right tabular-nums">{formatMYR(totals.receipts)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="divide-y divide-black/10 md:hidden">
              {rows.map((r) => (
                <Link
                  key={r.id}
                  href={`/admin/orders/${r.id}`}
                  className="block space-y-1 p-4"
                  style={{ color: BRAND.ink }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-bold">{formatOrderNumber(r.id)}</span>
                    <span className="text-lg font-bold tabular-nums">{formatMYR(r.sales)}</span>
                  </div>
                  <p className="truncate font-semibold">{r.customer}</p>
                  <p className="text-xs text-slate-500">
                    {formatYmd(mytYmd(r.createdAt))} · {r.source === "manual" ? "Manual" : "Website"} ·{" "}
                    {statusLabel(r.status)} · {itemText(r)}
                  </p>
                  <p className="text-xs tabular-nums text-slate-500">
                    Shipping {formatMYR(r.shipping)} · PayPal fee{" "}
                    {r.paypalFee == null ? "-" : formatMYR(r.paypalFee)} · Paid {formatMYR(r.receipts)}
                  </p>
                </Link>
              ))}
              <div
                className="flex items-center justify-between gap-2 p-4 font-bold"
                style={{ backgroundColor: `${BRAND.ink}0d` }}
              >
                <span>Total, {countText}</span>
                <span className="tabular-nums">{formatMYR(totals.sales)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
