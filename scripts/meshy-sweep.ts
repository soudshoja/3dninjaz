// Phase 21 (21-05) — 5-minute orphan reconciliation cron for Meshy
// generations.
//
// A generation can get stuck in an active status (generating / revising /
// analyzing / repairing / processing_multicolor) if the admin closes the
// browser tab before the client-side poll (pollGeneration, src/actions/
// admin-meshy.ts) reaches a terminal state. This sweep is the closed-tab
// safety net: it re-drives any row that hasn't been touched in a while by
// calling the exact SAME advanceGeneration(id) state machine the client
// poll action uses — no duplicated status logic, no direct Meshy API calls
// of its own (21-CONTEXT: "designed around one shared advanceGeneration(id)
// state-machine function... a webhook route later is just a third caller of
// the same function, no rework").
//
// Bounded work per run (MAX_PER_RUN), one bad row never blocks the rest
// (per-row try/catch), exits 0 when there is nothing to do — same shape as
// scripts/log-alert.cjs's MAX_ALERTS_PER_RUN convention.
//
// Cron entry (ninjaz user, prod — see 21-DEPLOY-NOTES.md for the full
// cutover checklist):
//   */5 * * * * cd /home/ninjaz/apps/<appdir> && NODE_OPTIONS="--require ./scripts/_mock-server-only.cjs" ./node_modules/.bin/tsx --env-file=.env.local scripts/meshy-sweep.ts >> /home/ninjaz/scripts/meshy-sweep.out 2>&1
//
// Local dev invocation (Git Bash — PowerShell must set $env:NODE_OPTIONS
// first):
//   NODE_OPTIONS="--require ./scripts/_mock-server-only.cjs" npx tsx --env-file=.env.local scripts/meshy-sweep.ts
//
// tsx-script convention: RELATIVE imports only (no "@/" alias — that's a
// Next.js webpack/tsconfig path alias, not resolvable by plain tsx). Mirrors
// scripts/seed-admin.ts:26-28. The "server-only" import inside src/lib/meshy/
// client.ts and storage.ts is neutralized via the _mock-server-only.cjs
// require hook (scripts/_mock-server-only.cjs), the repo's established
// escape hatch for running server-only-guarded libs under tsx.

import { and, asc, inArray, lt } from "drizzle-orm";
import { advanceGeneration } from "../src/lib/meshy/pipeline";
import { db } from "../src/lib/db";
import { meshyGenerations } from "../src/lib/db/schema";
import { MESHY_ACTIVE_STATUSES } from "../src/lib/meshy/types";

const STALE_MS = 2 * 60 * 1000;
const MAX_PER_RUN = 10;

async function main(): Promise<void> {
  const staleCutoff = new Date(Date.now() - STALE_MS);

  const rows = await db
    .select({ id: meshyGenerations.id })
    .from(meshyGenerations)
    .where(
      and(
        inArray(meshyGenerations.status, MESHY_ACTIVE_STATUSES),
        lt(meshyGenerations.updatedAt, staleCutoff),
      ),
    )
    .orderBy(asc(meshyGenerations.updatedAt))
    .limit(MAX_PER_RUN);

  if (rows.length === 0) {
    console.log("[meshy-sweep] nothing to do");
    process.exit(0);
  }

  let errors = 0;
  for (const row of rows) {
    try {
      await advanceGeneration(row.id);
      console.log(`[meshy-sweep] advanced ${row.id}`);
    } catch (e) {
      errors += 1;
      console.log(`[meshy-sweep] ERROR ${row.id}: ${(e as Error).message}`);
      // One bad row must never block the rest of the batch.
      continue;
    }
  }

  console.log(`[meshy-sweep] done: ${rows.length} checked, ${errors} errors`);
  process.exit(0);
}

main().catch((err) => {
  // Only reached if the initial DB connection/select itself fails.
  console.error(`[meshy-sweep] FATAL: ${(err as Error).message ?? err}`);
  process.exit(1);
});
