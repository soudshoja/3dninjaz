import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-helpers";
import { getAnalyticsForRangeParam } from "@/actions/admin-analytics";
import { parseRange } from "@/lib/analytics";
import { formatMYR } from "@/lib/format";
import { BRAND } from "@/lib/brand";
import { AnalyticsRangeTabs } from "@/components/admin/analytics-range-tabs";
import { AnalyticsRevenueChart } from "@/components/admin/analytics-revenue-chart";
import { AnalyticsFunnel } from "@/components/admin/analytics-funnel";
import { AnalyticsTopProducts } from "@/components/admin/analytics-top-products";
// Phase 7 (07-07) — recon drift surface on dashboard.
import { ReconDriftWidget } from "@/components/admin/recon-drift-widget";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  robots: { index: false, follow: false },
};

type PageProps = { searchParams: Promise<{ range?: string }> };

/**
 * /admin — analytics dashboard (Plan 05-02 / REPORT-01).
 *
 * Replaced the Phase 1 stat-card placeholder with revenue total + chart +
 * top products + funnel. Range tabs (7d/30d/90d) drive the URL ?range= param;
 * the server action `getAnalytics` is the single aggregator.
 */
export default async function AdminDashboardPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await searchParams;
  const range = parseRange(sp.range);
  const analytics = await getAnalyticsForRangeParam(range);
  const topProduct = analytics.topProducts[0]?.productName ?? "—";

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-baseline md:justify-between">
        <div>
          <h1
            className="font-[var(--font-heading)] text-3xl"
            style={{ color: BRAND.ink }}
          >
            Dashboard
          </h1>
          <p className="text-sm text-slate-600">
            3D Ninjaz performance · last {range === "7d" ? 7 : range === "30d" ? 30 : 90}{" "}
            days
          </p>
        </div>
        <AnalyticsRangeTabs current={range} />
      </header>

      {/* Top stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          className="rounded-2xl bg-white p-5 border-2"
          style={{ borderColor: `${BRAND.green}33` }}
        >
          <p className="text-xs font-bold tracking-[0.18em] text-slate-500">
            REVENUE
          </p>
          <p
            className="mt-1 font-[var(--font-heading)] text-3xl"
            style={{ color: BRAND.ink }}
          >
            {formatMYR(analytics.revenue)}
          </p>
        </div>
        <div
          className="rounded-2xl bg-white p-5 border-2"
          style={{ borderColor: `${BRAND.blue}33` }}
        >
          <p className="text-xs font-bold tracking-[0.18em] text-slate-500">
            ORDERS
          </p>
          <p
            className="mt-1 font-[var(--font-heading)] text-3xl"
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

      {/* Revenue chart */}
      <section className="rounded-2xl bg-white p-5">
        <h2
          className="font-[var(--font-heading)] text-xl mb-3"
          style={{ color: BRAND.ink }}
        >
          Revenue
        </h2>
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
