"use server";

import { db } from "@/lib/db";
import { reconRuns } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";

/**
 * Phase 7 (07-07) — recon read actions.
 *
 * Cron writes recon_runs rows; admin UI reads them. All exports are
 * admin-gated.
 */

export type ReconRow = {
  id: string;
  runDate: string;
  ranAt: Date;
  totalPaypalTxns: number;
  totalLocalTxns: number;
  driftCount: number;
  driftJson: string | null;
  status: string;
  errorMessage: string | null;
};

export async function latestReconRun(): Promise<ReconRow | null> {
  await requireAdmin();
  const rows = await db
    .select()
    .from(reconRuns)
    .orderBy(desc(reconRuns.ranAt))
    .limit(1);
  if (rows.length === 0) return null;
  return mapRow(rows[0]);
}

export async function listReconRuns(limit = 30): Promise<ReconRow[]> {
  await requireAdmin();
  const rows = await db
    .select()
    .from(reconRuns)
    .orderBy(desc(reconRuns.ranAt))
    .limit(Math.min(100, Math.max(1, limit)));
  return rows.map(mapRow);
}

export async function getReconRun(runId: string): Promise<ReconRow | null> {
  await requireAdmin();
  const row = await db.query.reconRuns.findFirst({
    where: eq(reconRuns.id, runId),
  });
  return row ? mapRow(row) : null;
}

function mapRow(r: typeof reconRuns.$inferSelect): ReconRow {
  return {
    id: r.id,
    runDate: r.runDate,
    ranAt: r.ranAt,
    totalPaypalTxns: r.totalPaypalTxns,
    totalLocalTxns: r.totalLocalTxns,
    driftCount: r.driftCount,
    driftJson: r.driftJson ?? null,
    status: r.status,
    errorMessage: r.errorMessage ?? null,
  };
}

/**
 * Returns the latest run's drift count for the sidebar badge. Failure-safe:
 * returns 0 on any error so the admin shell never crashes if recon never
 * ran or the cache is empty.
 */
export async function getReconDriftBadgeCount(): Promise<number> {
  try {
    const row = await latestReconRun();
    return row?.driftCount ?? 0;
  } catch {
    return 0;
  }
}
