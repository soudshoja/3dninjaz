import Link from "next/link";
import { latestReconRun } from "@/actions/admin-recon";
import { BRAND } from "@/lib/brand";

/**
 * Phase 7 (07-07) — admin dashboard recon drift widget.
 *
 * Shows the latest run timestamp + status pill + drift count + deep link.
 * Empty state when no run yet: instructions for first-run timing.
 */
function statusColor(status: string): string {
  if (status === "ok") return BRAND.green;
  if (status === "drift") return "#f59e0b";
  if (status === "error") return "#dc2626";
  return BRAND.ink;
}

export async function ReconDriftWidget() {
  const row = await latestReconRun();
  return (
    <section
      className="rounded-2xl p-4 md:p-5"
      style={{ backgroundColor: "#ffffff" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-[var(--font-heading)] text-lg">
            Reconciliation
          </h2>
          {row ? (
            <p className="mt-1 text-xs text-slate-500">
              Last run {row.runDate} at{" "}
              {new Date(row.ranAt).toLocaleString("en-MY")}
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">
              Reconciliation has not run yet. First run is scheduled for
              03:00 MYT.
            </p>
          )}
        </div>
        <Link
          href="/admin/recon"
          className="text-xs underline decoration-dotted"
        >
          View runs →
        </Link>
      </div>

      {row ? (
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white"
            style={{ backgroundColor: statusColor(row.status) }}
          >
            {row.status}
          </span>
          <span className="text-sm">
            <strong>{row.driftCount}</strong> drift{" "}
            {row.driftCount === 1 ? "item" : "items"}
          </span>
          <span className="text-xs text-slate-500">
            ({row.totalPaypalTxns} PayPal · {row.totalLocalTxns} local)
          </span>
        </div>
      ) : null}

      {row?.errorMessage ? (
        <p className="mt-2 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800">
          {row.errorMessage}
        </p>
      ) : null}
    </section>
  );
}
