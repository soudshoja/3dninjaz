import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { getSalesReport } from "@/lib/accounting";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Sales report",
  robots: { index: false, follow: false },
};

/** Default range: first day of current month → today (YYYY-MM-DD). */
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  return { from: iso(from), to: iso(now) };
}

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const def = defaultRange();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const from = sp.from && dateRe.test(sp.from) ? sp.from : def.from;
  const to = sp.to && dateRe.test(sp.to) ? sp.to : def.to;

  const rows = await getSalesReport({ from, to });

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
          Monthly revenue, COGS, shipping, PayPal fees and profit from paid
          orders in the selected range.
        </p>

        {/* Date-range filter (server-side; no client JS → no hydration risk) */}
        <form method="get" className="mb-6 mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="from" className="block text-xs font-semibold mb-1">
              From
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={from}
              className="rounded-xl border-2 px-3 py-2 text-sm min-h-[44px]"
              style={{ borderColor: `${BRAND.ink}33` }}
            />
          </div>
          <div>
            <label htmlFor="to" className="block text-xs font-semibold mb-1">
              To
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={to}
              className="rounded-xl border-2 px-3 py-2 text-sm min-h-[44px]"
              style={{ borderColor: `${BRAND.ink}33` }}
            />
          </div>
          <button
            type="submit"
            className="rounded-full px-5 py-2 font-semibold text-white min-h-[44px]"
            style={{ backgroundColor: BRAND.ink }}
          >
            Apply
          </button>
          <a
            href={`/api/admin/accounting/sales-export?from=${from}&to=${to}`}
            className="inline-flex items-center justify-center rounded-full border-2 px-5 py-2 font-semibold min-h-[44px]"
            style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
          >
            Export CSV
          </a>
        </form>

        {rows.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: "#ffffff" }}
          >
            <p className="text-lg font-bold">No paid orders in this range.</p>
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
                    <th className="p-3">Month</th>
                    <th className="p-3 text-right">Revenue</th>
                    <th className="p-3 text-right">COGS</th>
                    <th className="p-3 text-right">Shipping</th>
                    <th className="p-3 text-right">PayPal fees</th>
                    <th className="p-3 text-right">Profit</th>
                    <th className="p-3 text-right">Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.month}
                      className="border-t border-black/10 hover:bg-slate-50"
                    >
                      <td className="p-3 font-semibold">{r.month}</td>
                      <td className="p-3 text-right tabular-nums">
                        {formatMYR(r.revenue)}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {formatMYR(r.cogs)}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {formatMYR(r.shipping)}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {formatMYR(r.paypalFees)}
                      </td>
                      <td
                        className="p-3 text-right tabular-nums font-semibold"
                        style={{ color: r.profit >= 0 ? BRAND.green : "#dc2626" }}
                      >
                        {formatMYR(r.profit)}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {r.orderCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list — shown below md */}
            <div className="md:hidden divide-y divide-black/10">
              {rows.map((r) => (
                <div key={r.month} className="p-4 space-y-2">
                  <p className="font-bold text-base">{r.month}</p>
                  <dl className="space-y-1 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-600">Revenue</dt>
                      <dd className="tabular-nums font-semibold">
                        {formatMYR(r.revenue)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-600">COGS</dt>
                      <dd className="tabular-nums">{formatMYR(r.cogs)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-600">Shipping</dt>
                      <dd className="tabular-nums">{formatMYR(r.shipping)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-600">PayPal fees</dt>
                      <dd className="tabular-nums">{formatMYR(r.paypalFees)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-600">Profit</dt>
                      <dd
                        className="tabular-nums font-semibold"
                        style={{ color: r.profit >= 0 ? BRAND.green : "#dc2626" }}
                      >
                        {formatMYR(r.profit)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-600">Orders</dt>
                      <dd className="tabular-nums">{r.orderCount}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
