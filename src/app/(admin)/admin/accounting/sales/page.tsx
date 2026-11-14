import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { getSalesReport } from "@/lib/accounting";
import { resolveRange, rangeToQuery } from "@/lib/date-range";
import { DateRangePicker } from "@/components/admin/date-range-picker";
import { Notice } from "@/components/admin/accounting-ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Sales report",
  robots: { index: false, follow: false },
};

const BUCKET_NOUN = { day: "day", week: "week", month: "month" } as const;

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const range = resolveRange(sp, { defaultPreset: "this_month" });

  const rows = await getSalesReport({ from: range.from, to: range.to, bucket: range.bucket });
  const lowCoverage = rows.some((r) => r.grossMargin == null);
  const noun = BUCKET_NOUN[range.bucket];

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link
          href="/admin/accounting"
          className="text-sm underline decoration-dotted"
          style={{ color: BRAND.ink }}
        >
          ← Back to accounting
        </Link>
        <h1 className="mt-3 font-[var(--font-heading)] text-3xl md:text-4xl">
          Sales report
        </h1>
        <p className="mt-1 text-slate-600">
          {range.label}, one row per {noun}. Sales exclude shipping, which is passed through to
          the courier.
        </p>

        <div className="mb-6 mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <DateRangePicker current={range} />
          <a
            href={`/api/admin/accounting/sales-export?${rangeToQuery(range)}`}
            className="inline-flex items-center justify-center rounded-full border-2 px-5 py-2 font-semibold min-h-[44px] shrink-0"
            style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
          >
            Export CSV
          </a>
        </div>

        {rows.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: "#ffffff" }}
          >
            <p className="text-lg font-bold">No paid orders in this range.</p>
            <p className="mt-1 text-sm text-slate-600">
              Pick a longer range, or All time, to see earlier sales.
            </p>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#ffffff" }}
          >
            {/* Desktop table — hidden on mobile */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-[700px] w-full text-sm">
                <thead>
                  <tr
                    className="text-left"
                    style={{ backgroundColor: `${BRAND.ink}0d` }}
                  >
                    <th className="p-3 capitalize">{noun}</th>
                    <th className="p-3 text-right">Orders</th>
                    <th className="p-3 text-right">Sales excl. shipping</th>
                    <th className="p-3 text-right">Shipping collected</th>
                    <th className="p-3 text-right">PayPal fees</th>
                    <th className="p-3 text-right">Product cost</th>
                    <th className="p-3 text-right">Gross margin</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.bucket}
                      className="border-t border-black/10 hover:bg-slate-50"
                    >
                      <td className="p-3 font-semibold whitespace-nowrap">{r.label}</td>
                      <td className="p-3 text-right tabular-nums">{r.orderCount}</td>
                      <td className="p-3 text-right tabular-nums">{formatMYR(r.sales)}</td>
                      <td className="p-3 text-right tabular-nums text-slate-500">
                        {formatMYR(r.shippingCollected)}
                      </td>
                      <td className="p-3 text-right tabular-nums">{formatMYR(r.paypalFees)}</td>
                      <td className="p-3 text-right tabular-nums">{formatMYR(r.productCost)}</td>
                      <td
                        className="p-3 text-right tabular-nums font-semibold"
                        style={{
                          color:
                            r.grossMargin == null
                              ? "#64748b"
                              : r.grossMargin >= 0
                                ? BRAND.green
                                : "#dc2626",
                        }}
                      >
                        {r.grossMargin == null ? "Not enough cost data" : formatMYR(r.grossMargin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list — shown below md */}
            <div className="md:hidden divide-y divide-black/10">
              {rows.map((r) => (
                <div key={r.bucket} className="p-4 space-y-2">
                  <p className="font-bold text-base">{r.label}</p>
                  <dl className="space-y-1 text-sm">
                    <Line label="Orders" value={String(r.orderCount)} />
                    <Line label="Sales excl. shipping" value={formatMYR(r.sales)} strong />
                    <Line label="Shipping collected" value={formatMYR(r.shippingCollected)} />
                    <Line label="PayPal fees" value={formatMYR(r.paypalFees)} />
                    <Line label="Product cost" value={formatMYR(r.productCost)} />
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-600">Gross margin</dt>
                      <dd
                        className="tabular-nums font-semibold text-right"
                        style={{
                          color:
                            r.grossMargin == null
                              ? "#64748b"
                              : r.grossMargin >= 0
                                ? BRAND.green
                                : "#dc2626",
                        }}
                      >
                        {r.grossMargin == null ? "Not enough cost data" : formatMYR(r.grossMargin)}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </div>
        )}

        {lowCoverageNote(lowCoverage)}
      </div>
    </main>
  );
}

function lowCoverageNote(low: boolean) {
  if (!low) return null;
  return (
    <Notice>
      Gross margin is hidden for periods where fewer than 90% of order lines have a product
      cost. Add product costs to fill it in.
    </Notice>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}
