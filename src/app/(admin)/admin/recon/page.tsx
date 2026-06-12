import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listReconRuns } from "@/actions/admin-recon";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Reconciliation",
  robots: { index: false, follow: false },
};

function statusColor(status: string): string {
  if (status === "ok") return BRAND.green;
  if (status === "drift") return "#f59e0b";
  if (status === "error") return "#dc2626";
  return BRAND.ink;
}

/**
 * Phase 7 (07-07) — /admin/recon list page.
 */
export default async function AdminReconListPage() {
  await requireAdmin();
  const rows = await listReconRuns(30);
  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-4xl px-4 py-8">
        <header className="mb-4">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
            Reconciliation runs
          </h1>
          <p className="mt-1 text-slate-600">
            Nightly recon compares PayPal Reporting transactions against
            local orders. Cron runs at 03:00 MYT.
          </p>
        </header>

        {rows.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: "#ffffff" }}
          >
            <p className="text-lg font-bold mb-2">No runs yet.</p>
            <p className="text-sm text-slate-600">
              The cron is scheduled for 03:00 MYT (19:00 UTC). Manual run
              command:
            </p>
            <pre className="mt-2 inline-block rounded-md bg-slate-900 px-3 py-2 text-xs text-white">
              node scripts/cron/reconcile-paypal.cjs
            </pre>
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
                    <th className="p-3">Run date</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">PayPal txns</th>
                    <th className="p-3">Local txns</th>
                    <th className="p-3">Drift</th>
                    <th className="p-3">Ran at</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-black/10 hover:bg-slate-50"
                    >
                      <td className="p-3">
                        <Link
                          href={`/admin/recon/${r.id}`}
                          className="font-mono text-xs underline decoration-dotted"
                        >
                          {r.runDate}
                        </Link>
                      </td>
                      <td className="p-3">
                        <span
                          className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white"
                          style={{ backgroundColor: statusColor(r.status) }}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {r.totalPaypalTxns}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {r.totalLocalTxns}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {r.driftCount}
                      </td>
                      <td className="p-3 whitespace-nowrap text-xs text-slate-700">
                        {new Date(r.ranAt).toLocaleString("en-MY")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list — shown below md */}
            <div className="md:hidden divide-y divide-black/10">
              {rows.map((r) => (
                <Link
                  key={r.id}
                  href={`/admin/recon/${r.id}`}
                  className="block p-3 space-y-1"
                  style={{ color: BRAND.ink }}
                >
                  {/* Run date + status */}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="font-mono text-xs font-semibold">
                      {r.runDate}
                    </span>
                    <span
                      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: statusColor(r.status) }}
                    >
                      {r.status}
                    </span>
                  </div>

                  {/* Txn counts */}
                  <p className="text-xs text-slate-600">
                    PayPal:{" "}
                    <span className="font-mono font-semibold">
                      {r.totalPaypalTxns}
                    </span>
                    {" · Local: "}
                    <span className="font-mono font-semibold">
                      {r.totalLocalTxns}
                    </span>
                    {" · Drift: "}
                    <span
                      className="font-mono font-semibold"
                      style={{
                        color: r.driftCount > 0 ? "#f59e0b" : "inherit",
                      }}
                    >
                      {r.driftCount}
                    </span>
                  </p>

                  {/* Ran at */}
                  <p className="text-xs text-slate-500">
                    {new Date(r.ranAt).toLocaleString("en-MY")}
                  </p>

                  {/* View button */}
                  <div className="pt-1">
                    <span
                      className="inline-flex items-center justify-center rounded-full px-4 text-sm font-semibold min-h-[44px] w-full"
                      style={{ backgroundColor: BRAND.ink, color: "#ffffff" }}
                    >
                      View run
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
