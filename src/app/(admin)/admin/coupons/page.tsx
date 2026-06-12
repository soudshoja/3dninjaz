import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listCoupons } from "@/actions/admin-coupons";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { CouponRowActions } from "@/components/admin/coupon-row-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Coupons",
  robots: { index: false, follow: false },
};

export default async function AdminCouponsPage() {
  await requireAdmin();
  const rows = await listCoupons();

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-baseline md:justify-between">
          <div>
            <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
              Coupons
            </h1>
            <p className="mt-1 text-slate-600">
              {rows.length} {rows.length === 1 ? "coupon" : "coupons"}
            </p>
          </div>
          <Link
            href="/admin/coupons/new"
            className="inline-flex items-center rounded-full px-6 py-3 text-sm font-bold text-white whitespace-nowrap min-h-[48px]"
            style={{ backgroundColor: BRAND.green }}
          >
            + New coupon
          </Link>
        </header>

        {rows.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: "#ffffff" }}
          >
            <p className="text-lg font-bold mb-2">No coupons yet.</p>
            <p className="text-sm text-slate-600">
              Create your first promo code to start running campaigns.
            </p>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#ffffff" }}
          >
            {/* ── Desktop table (md+) ── */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-[820px] w-full text-sm">
                <thead>
                  <tr
                    className="text-left"
                    style={{ backgroundColor: `${BRAND.ink}0d` }}
                  >
                    <th className="p-3">Code</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Min spend</th>
                    <th className="p-3">Usage</th>
                    <th className="p-3">Status</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="border-t border-black/10">
                      <td className="p-3 font-mono text-sm">{c.code}</td>
                      <td className="p-3 text-sm capitalize">{c.type}</td>
                      <td className="p-3 text-sm whitespace-nowrap">
                        {c.type === "percentage"
                          ? `${parseFloat(c.amount)}%`
                          : formatMYR(c.amount)}
                      </td>
                      <td className="p-3 text-sm whitespace-nowrap">
                        {c.minSpend ? formatMYR(c.minSpend) : "—"}
                      </td>
                      <td className="p-3 text-sm whitespace-nowrap font-mono">
                        {c.usageCount}
                        {c.usageCap !== null ? ` / ${c.usageCap}` : ""}
                      </td>
                      <td className="p-3">
                        {c.active ? (
                          <span
                            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white"
                            style={{ backgroundColor: BRAND.green }}
                          >
                            Active
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white"
                            style={{ backgroundColor: "#6b7280" }}
                          >
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <CouponRowActions
                          row={{
                            id: c.id,
                            code: c.code,
                            active: c.active,
                            usageCount: c.usageCount,
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Mobile cards (below md) ── */}
            <div className="md:hidden divide-y divide-black/10">
              {rows.map((c) => (
                <div key={c.id} className="p-4 flex flex-col gap-3">
                  {/* Code + status */}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="font-mono text-base font-bold break-words min-w-0">
                      {c.code}
                    </span>
                    {c.active ? (
                      <span
                        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white shrink-0"
                        style={{ backgroundColor: BRAND.green }}
                      >
                        Active
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white shrink-0"
                        style={{ backgroundColor: "#6b7280" }}
                      >
                        Inactive
                      </span>
                    )}
                  </div>

                  {/* Secondary fields */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    <span>
                      <span className="font-semibold text-slate-800">Type:</span>{" "}
                      <span className="capitalize">{c.type}</span>
                    </span>
                    <span>
                      <span className="font-semibold text-slate-800">
                        Amount:
                      </span>{" "}
                      {c.type === "percentage"
                        ? `${parseFloat(c.amount)}%`
                        : formatMYR(c.amount)}
                    </span>
                    <span>
                      <span className="font-semibold text-slate-800">
                        Min spend:
                      </span>{" "}
                      {c.minSpend ? formatMYR(c.minSpend) : "—"}
                    </span>
                    <span>
                      <span className="font-semibold text-slate-800">
                        Usage:
                      </span>{" "}
                      <span className="font-mono">
                        {c.usageCount}
                        {c.usageCap !== null ? ` / ${c.usageCap}` : ""}
                      </span>
                    </span>
                  </div>

                  {/* Actions */}
                  <CouponRowActions
                    row={{
                      id: c.id,
                      code: c.code,
                      active: c.active,
                      usageCount: c.usageCount,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
