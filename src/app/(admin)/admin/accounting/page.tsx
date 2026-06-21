import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { getAccountingSummary, getAccountBalances } from "@/lib/accounting";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Accounting",
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

function Card({
  label,
  value,
  accent,
  big,
}: {
  label: string;
  value: string;
  accent?: string;
  big?: boolean;
}) {
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: "#ffffff" }}>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-1 font-bold tabular-nums ${big ? "text-3xl" : "text-xl"}`}
        style={{ color: accent ?? BRAND.ink }}
      >
        {value}
      </p>
    </div>
  );
}

const subLinks = [
  ["/admin/accounting/sales", "Sales report"],
  ["/admin/accounting/expenses", "Expenses"],
  ["/admin/accounting/assets", "Assets"],
  ["/admin/accounting/payouts", "Payouts"],
  ["/admin/accounting/import", "Import invoice"],
] as const;

export default async function AccountingOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const def = defaultRange();
  // Only accept well-formed YYYY-MM-DD; ignore junk so a crafted ?from=foo
  // can't reach new Date() in the query builder.
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const from = sp.from && dateRe.test(sp.from) ? sp.from : def.from;
  const to = sp.to && dateRe.test(sp.to) ? sp.to : def.to;
  const range = { from, to };

  const [summary, balances] = await Promise.all([
    getAccountingSummary(range),
    getAccountBalances(),
  ]);

  const profitColor = summary.profit >= 0 ? BRAND.green : "#dc2626";

  return (
    <main className="min-h-screen" style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-4">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">Accounting</h1>
          <p className="mt-1 text-slate-600">
            Cash-basis profit from paid orders, minus expenses. Assets are tracked
            separately and don&apos;t affect profit.
          </p>
        </header>

        {/* Date-range filter (server-side; no client JS → no hydration risk) */}
        <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
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
        </form>

        {/* Profit cards */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Card label="Sales" value={formatMYR(summary.sales)} />
          <Card label="COGS" value={formatMYR(summary.cogs)} />
          <Card label="Shipping" value={formatMYR(summary.shipping)} />
          <Card label="PayPal fees" value={formatMYR(summary.paypalFees)} />
          <Card label="Expenses" value={formatMYR(summary.expensesTotal)} />
          <Card label="Net profit" value={formatMYR(summary.profit)} accent={profitColor} big />
        </section>

        <p className="mt-2 text-xs text-slate-500">
          {summary.orderCount} paid order{summary.orderCount === 1 ? "" : "s"} in range.
        </p>
        {summary.missingShippingCostCount > 0 ? (
          <p
            className="mt-2 rounded-xl px-3 py-2 text-sm"
            style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
          >
            {summary.missingShippingCostCount} order
            {summary.missingShippingCostCount === 1 ? "" : "s"}: courier cost
            estimated from the markup config (no exact quote stored).
          </p>
        ) : null}
        {summary.missingItemCostCount > 0 ? (
          <p
            className="mt-2 rounded-xl px-3 py-2 text-sm"
            style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
          >
            {summary.missingItemCostCount} line item
            {summary.missingItemCostCount === 1 ? "" : "s"} have no cost price
            recorded — COGS is understated (profit looks higher than it is).
          </p>
        ) : null}
        {summary.missingPaypalFeeCount > 0 ? (
          <p
            className="mt-2 rounded-xl px-3 py-2 text-sm"
            style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
          >
            {summary.missingPaypalFeeCount} paid order
            {summary.missingPaypalFeeCount === 1 ? "" : "s"}: PayPal fee not
            captured yet — fees are understated until each order&apos;s payment
            page is opened or its next webhook lands.
          </p>
        ) : null}

        {/* Account balances + assets */}
        <h2 className="mt-8 mb-3 font-bold text-xl">Balances (all-time)</h2>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card label="PayPal" value={formatMYR(balances.paypal)} accent={BRAND.blue} />
          <Card label="Bank" value={formatMYR(balances.bank)} />
          <Card label="Cash" value={formatMYR(balances.cash)} />
          <Card label="Total assets" value={formatMYR(balances.totalAssets)} accent={BRAND.purple} />
        </section>
        {balances.paypalNetMissingCount > 0 ? (
          <p
            className="mt-2 rounded-xl px-3 py-2 text-sm"
            style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
          >
            PayPal balance excludes {balances.paypalNetMissingCount} paid order
            {balances.paypalNetMissingCount === 1 ? "" : "s"} whose net amount
            isn&apos;t captured yet — it will rise as those orders settle/are
            opened.
          </p>
        ) : null}

        {/* Sub-section links */}
        <h2 className="mt-8 mb-3 font-bold text-xl">Manage</h2>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {subLinks.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-2xl p-4 text-center font-semibold min-h-[64px] flex items-center justify-center"
              style={{ backgroundColor: "#ffffff", color: BRAND.ink }}
            >
              {label}
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
