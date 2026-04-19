import { BRAND } from "@/lib/brand";

type FunnelData = {
  visits: number;
  addToBag: number;
  checkoutStarted: number;
  paid: number;
};

/**
 * Pure-CSS conversion funnel — no Recharts dep needed for 4 horizontal bars.
 * Each step shows count + % of step-1 visits.
 */
export function AnalyticsFunnel({ data }: { data: FunnelData }) {
  const steps = [
    { label: "Visits", value: data.visits, color: BRAND.blue },
    { label: "Add to bag", value: data.addToBag, color: BRAND.purple },
    {
      label: "Checkout started",
      value: data.checkoutStarted,
      color: BRAND.green,
    },
    { label: "Paid", value: data.paid, color: BRAND.ink },
  ];
  const top = steps[0].value || 0;

  return (
    <div className="space-y-3">
      {steps.map((s, i) => {
        const pct = top > 0 ? Math.min(100, (s.value / top) * 100) : 0;
        return (
          <div key={s.label}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold">{s.label}</span>
              <span className="font-mono">
                {s.value.toLocaleString("en-MY")}
                {i > 0 && top > 0 ? (
                  <span className="ml-2 text-slate-500">
                    ({pct.toFixed(1)}%)
                  </span>
                ) : null}
              </span>
            </div>
            <div
              className="mt-1 h-2 w-full rounded-full"
              style={{ backgroundColor: `${BRAND.ink}11` }}
            >
              <div
                className="h-2 rounded-full transition-[width]"
                style={{
                  width: `${pct}%`,
                  backgroundColor: s.color,
                }}
              />
            </div>
          </div>
        );
      })}
      {data.addToBag === 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          Add-to-bag instrumentation is live; events will populate as customers
          interact with product pages.
        </p>
      ) : null}
    </div>
  );
}
