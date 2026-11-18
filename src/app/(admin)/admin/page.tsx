import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { getAnalytics } from "@/actions/admin-analytics";
import { getAccountingOverview } from "@/lib/accounting";
import { resolveRange, rangeToQuery } from "@/lib/date-range";
import { formatMYR } from "@/lib/format";
import { BRAND } from "@/lib/brand";
import { DateRangePicker } from "@/components/admin/date-range-picker";
import { AnalyticsRevenueChart } from "@/components/admin/analytics-revenue-chart";
import { AnalyticsFunnel } from "@/components/admin/analytics-funnel";
import { AnalyticsTopProducts } from "@/components/admin/analytics-top-products";
// Phase 7 (07-07) — recon drift surface on dashboard.
import { ReconDriftWidget } from "@/components/admin/recon-drift-widget";
// Admin guide launch banner — shown until admin visits /admin/guide/launch.
import { LaunchBanner } from "@/components/admin/guide/launch-banner";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
};

/**
 * /admin — analytics dashboard (Plan 05-02 / REPORT-01).
 *
 * Accounting v2: the shared date-range picker (presets + custom, Malaysia
 * time) drives ?range= / ?from= / ?to=. Sales are product sales EXCLUDING
 * shipping (shipping is a pass-through); receipts including shipping are a
 * subline. Net profit (cash) and gross margin come from src/lib/accounting.ts.
 */
export default async function AdminDashboardPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await searchParams;
  const range = resolveRange(sp, { defaultPreset: "30d" });
  const [analytics, overview] = await Promise.all([
    getAnalytics(sp),
    getAccountingOverview(range),
  ]);
  const { cash, margin } = overview;
  const topProduct = analytics.topProducts[0]?.productName ?? "—";
  const accountingHref = `/admin/accounting?${rangeToQuery(range)}`;

  return (
    <div className="space-y-6">
      {/* Launch checklist banner — dismissible, hidden after visit */}
      <LaunchBanner />

      <header className="space-y-4">
        <div className="flex items-center gap-3">
          <Image
            src="/icons/ninja/emoji/great@128.png"
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 object-contain shrink-0"
          />
          <div>
            <h1
              className="font-[var(--font-heading)] text-3xl"
              style={{ color: BRAND.ink }}
            >
              Dashboard
            </h1>
            <p className="text-sm text-slate-600">
              3D Ninjaz performance · {range.label}
            </p>
          </div>
        </div>
        <DateRangePicker current={range} />
      </header>

      {/* Top stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          className="rounded-2xl bg-white p-5 border-2"
          style={{ borderColor: `${BRAND.green}33` }}
        >
          <p className="text-xs font-bold tracking-[0.18em] text-slate-500">
            SALES (EXCL. SHIPPING)
          </p>
          <p
            className="mt-1 font-[var(--font-heading)] text-3xl tabular-nums"
            style={{ color: BRAND.ink }}
          >
            {formatMYR(analytics.revenue)}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Receipts incl. shipping {formatMYR(analytics.receipts)}
          </p>
        </div>
        <div
          className="rounded-2xl bg-white p-5 border-2"
          style={{ borderColor: `${BRAND.blue}33` }}
        >
          <p className="text-xs font-bold tracking-[0.18em] text-slate-500">
            PAID ORDERS
          </p>
          <p
            className="mt-1 font-[var(--font-heading)] text-3xl tabular-nums"
            style={{ color: BRAND.ink }}
          >
            {analytics.orderCount}
          </p>
        </div>
        <div
          className="rounded-2xl bg-white p-5 border-2"
          style={{ borderColor: `${BRAND.purple}33` }}
        >
          <p className="text-xs font-bold tracking-[0.18em] text-slate-500">
            TOP PRODUCT
          </p>
          <p
            className="mt-1 font-[var(--font-heading)] text-xl truncate"
            style={{ color: BRAND.ink }}
          >
            {topProduct}
          </p>
        </div>
      </div>

      {/*
        Profit cards for the selected range. Net profit (cash) never subtracts
        product cost; gross margin never subtracts expenses. The margin is
        hidden when too few order lines carry a cost.
      */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href={accountingHref}
          className="block rounded-2xl bg-white p-5 border-2 focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            borderColor: cash.netProfit >= 0 ? `${BRAND.green}55` : "rgba(220,38,38,0.5)",
            outlineColor: BRAND.blue,
          }}
        >
          <p className="text-xs font-bold tracking-[0.18em] text-slate-500">
            NET PROFIT (CASH)
          </p>
          <p
            className="mt-2 font-[var(--font-heading)] text-3xl tabular-nums"
            style={{ color: cash.netProfit >= 0 ? BRAND.ink : "#dc2626" }}
          >
            {formatMYR(cash.netProfit)}
          </p>
          <p className="mt-1 text-sm text-slate-600 tabular-nums">
            Sales {formatMYR(cash.productSales)}
            {cash.otherIncome !== 0 ? ` + other income ${formatMYR(cash.otherIncome)}` : ""}
            {" "}− fees {formatMYR(cash.paypalFees)} − expenses {formatMYR(cash.expensesTotal)}
          </p>
        </Link>
        <Link
          href={accountingHref}
          className="block rounded-2xl bg-white p-5 border-2 focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ borderColor: `${BRAND.blue}33`, outlineColor: BRAND.blue }}
        >
          <p className="text-xs font-bold tracking-[0.18em] text-slate-500">
            GROSS MARGIN
          </p>
          {margin.enoughData ? (
            <>
              <p
                className="mt-2 font-[var(--font-heading)] text-3xl tabular-nums"
                style={{ color: margin.margin >= 0 ? BRAND.ink : "#dc2626" }}
              >
                {formatMYR(margin.margin)}
              </p>
              <p className="mt-1 text-sm text-slate-600 tabular-nums">
                {margin.marginPercent != null ? `${margin.marginPercent.toFixed(1)}% of sales · ` : ""}
                product cost {formatMYR(margin.productCost + margin.extraCost)}
              </p>
            </>
          ) : (
            <>
              <p
                className="mt-2 font-[var(--font-heading)] text-2xl"
                style={{ color: BRAND.ink }}
              >
                Not enough cost data
              </p>
              <p className="mt-1 text-sm text-slate-600 tabular-nums">
                {Math.round(margin.coverage * 100)}% of order lines have a cost. Add product
                costs to see a margin.
              </p>
            </>
          )}
        </Link>
      </div>

      {/* Sales chart */}
      <section className="rounded-2xl bg-white p-5">
        <h2
          className="font-[var(--font-heading)] text-xl mb-1"
          style={{ color: BRAND.ink }}
        >
          Sales (excl. shipping)
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          {analytics.bucket === "day"
            ? "Per day"
            : analytics.bucket === "week"
              ? "Per week, weeks start on Monday"
              : "Per month"}
          , Malaysia time
        </p>
        <AnalyticsRevenueChart data={analytics.chartData} />
      </section>

      {/* Top products + Funnel side-by-side on desktop, stacked on mobile */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-5">
          <h2
            className="font-[var(--font-heading)] text-xl mb-3"
            style={{ color: BRAND.ink }}
          >
            Top products
          </h2>
          <AnalyticsTopProducts products={analytics.topProducts} />
        </section>
        <section className="rounded-2xl bg-white p-5">
          <h2
            className="font-[var(--font-heading)] text-xl mb-3"
            style={{ color: BRAND.ink }}
          >
            Funnel
          </h2>
          <AnalyticsFunnel data={analytics.funnel} />
        </section>
      </div>

      {/* Phase 7 (07-07) — recon drift widget */}
      <ReconDriftWidget />
    </div>
  );
}
