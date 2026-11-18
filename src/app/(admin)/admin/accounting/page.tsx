import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { getAccountingOverview, getAccountBalances, getSstEnabled } from "@/lib/accounting";
import { resolveRange } from "@/lib/date-range";
import { DateRangePicker } from "@/components/admin/date-range-picker";
import { StatCard, Notice } from "@/components/admin/accounting-ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Accounting",
  robots: { index: false, follow: false },
};

const subLinks = [
  ["/admin/accounting/summary", "Net position"],
  ["/admin/accounting/sales", "Sales report"],
  ["/admin/accounting/expenses", "Expenses"],
  ["/admin/accounting/income", "Income"],
  ["/admin/accounting/assets", "Assets"],
  ["/admin/accounting/payouts", "Transfers"],
  ["/admin/accounting/paypal", "PayPal ledger"],
  ["/admin/accounting/import", "Import invoice"],
] as const;

export default async function AccountingOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const range = resolveRange(sp, { defaultPreset: "this_month" });

  const [{ cash, margin }, balances, sstEnabled] = await Promise.all([
    getAccountingOverview(range),
    getAccountBalances(),
    getSstEnabled(),
  ]);

  return (
    <main className="min-h-screen" style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-4">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">Accounting</h1>
          <p className="mt-1 text-slate-600">
            {range.label}. Cash-basis profit from paid orders, other income and expenses.
            Shipping is passed through to the courier, so it is left out of sales and cost.
          </p>
        </header>

        <div className="mb-6">
          <DateRangePicker current={range} />
        </div>

        {sstEnabled ? (
          <Notice>
            SST is switched on in store settings. These figures do not model SST, so treat
            sales and profit as before-tax approximations.
          </Notice>
        ) : null}

        {/* View A: Net profit (cash) */}
        <h2 className="mt-4 mb-3 font-bold text-xl">Net profit (cash)</h2>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            label="Sales excl. shipping"
            value={formatMYR(cash.productSales)}
            sub={`${cash.orderCount} paid order${cash.orderCount === 1 ? "" : "s"}`}
          />
          <StatCard label="Other income" value={formatMYR(cash.otherIncome)} />
          <StatCard label="PayPal fees" value={formatMYR(cash.paypalFees)} />
          <StatCard label="Expenses" value={formatMYR(cash.expensesTotal)} />
          <StatCard
            label="Net profit (cash)"
            value={formatMYR(cash.netProfit)}
            accent={cash.netProfit >= 0 ? BRAND.green : "#dc2626"}
            big
          />
        </section>
        <p className="mt-2 text-xs text-slate-500 tabular-nums">
          Net profit = sales + other income − PayPal fees − expenses. Product cost is not
          subtracted here. Shipping collected {formatMYR(cash.shippingCollected)} is not counted.
        </p>
        {cash.estimatedDateAmount > 0 ? (
          <Notice>
            Includes {formatMYR(cash.estimatedDateAmount)} at estimated dates. Those rows may
            move between periods once the real dates are known.
          </Notice>
        ) : null}
        {cash.missingPaypalFeeCount > 0 ? (
          <Notice>
            {cash.missingPaypalFeeCount} paid order{cash.missingPaypalFeeCount === 1 ? "" : "s"}:
            PayPal fee not captured yet, so fees are understated until the order payment page
            is opened or its next webhook lands.
          </Notice>
        ) : null}
        {cash.unknownMethodCount > 0 ? (
          <Notice>
            {cash.unknownMethodCount} paid order{cash.unknownMethodCount === 1 ? "" : "s"} with
            unknown payment method. {cash.unknownMethodCount === 1 ? "It counts" : "They count"}{" "}
            as sales but reach no balance.{" "}
            <Link href="/admin/orders" className="underline">
              Open orders to tag the payment method
            </Link>
            .
          </Notice>
        ) : null}

        {/* View B: Gross margin */}
        <h2 className="mt-8 mb-3 font-bold text-xl">Gross margin</h2>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Sales excl. shipping" value={formatMYR(margin.productSales)} />
          <StatCard label="Product cost" value={formatMYR(margin.productCost)} />
          <StatCard label="Extra order cost" value={formatMYR(margin.extraCost)} />
          <StatCard label="PayPal fees" value={formatMYR(margin.paypalFees)} />
          {margin.enoughData ? (
            <StatCard
              label="Gross margin"
              value={formatMYR(margin.margin)}
              sub={margin.marginPercent != null ? `${margin.marginPercent.toFixed(1)}% of sales` : undefined}
              accent={margin.margin >= 0 ? BRAND.green : "#dc2626"}
              big
            />
          ) : (
            <StatCard
              label="Gross margin"
              value="Not enough cost data"
              sub={`${Math.round(margin.coverage * 100)}% of order lines have a cost, 90% needed`}
            />
          )}
        </section>
        <p className="mt-2 text-xs text-slate-500 tabular-nums">
          Gross margin = sales − product cost − extra order cost − PayPal fees. Expenses are
          not subtracted here. Cost coverage {Math.round(margin.coverage * 100)}% (
          {margin.linesWithCost} of {margin.linesTotal} order lines).
        </p>
        <p className="mt-1 text-xs text-slate-500 tabular-nums">
          Memo: materials bought {formatMYR(margin.materialsBought)}, materials used in orders{" "}
          {formatMYR(margin.materialsUsed)}. For information only.
        </p>

        {/* Balances */}
        <h2 className="mt-8 mb-1 font-bold text-xl">Balances</h2>
        <p className="mb-3 text-xs text-slate-500">
          Net movement since records began. These ignore the date range.
        </p>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="PayPal" value={formatMYR(balances.paypal)} accent={BRAND.blue} />
          <StatCard label="Bank" value={formatMYR(balances.bank)} />
          <StatCard label="Cash" value={formatMYR(balances.cash)} />
          <StatCard
            label="Credit card owed"
            value={formatMYR(balances.creditCard)}
            accent={BRAND.purple}
          />
        </section>
        {balances.notes.map((n) => (
          <Notice key={n}>{n}</Notice>
        ))}

        {/* Sub-section links */}
        <h2 className="mt-8 mb-3 font-bold text-xl">Manage</h2>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {subLinks.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-2xl p-4 text-center font-semibold min-h-[64px] flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ backgroundColor: "#ffffff", color: BRAND.ink, outlineColor: BRAND.blue }}
            >
              {label}
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
