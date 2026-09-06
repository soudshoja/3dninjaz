---
phase: 21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-
plan: 05
subsystem: infra
tags: [cron, tsx, meshy, drizzle, mysql2, deploy-notes, mariadb]

# Dependency graph
requires:
  - phase: 21-03
    provides: "src/lib/meshy/pipeline.ts — advanceGeneration(id), the ONE state machine (0 next/* imports, tsx-loadable)"
provides:
  - "scripts/meshy-sweep.ts — 5-minute cron reconciliation sweep for generations stuck in an active status (closed-tab orphans), reusing advanceGeneration(id) with zero duplicated state logic"
  - "21-DEPLOY-NOTES.md — verified-against-the-live-box prod cutover checklist (env vars, one-time mkdir, exact crontab lines for both dev and prod, post-cutover verification, rollback)"
affects: [21-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Third-caller pattern for advanceGeneration(id): scripts/meshy-sweep.ts is the second caller (after pollGeneration) proving the state machine is truly environment-agnostic — a future webhook route would be the third, no rework needed"
    - "tsx cron scripts use RELATIVE imports (../src/lib/...) and the NODE_OPTIONS=\"--require ./scripts/_mock-server-only.cjs\" require-hook to neutralize import \"server-only\" outside the Next.js runtime — same convention as scripts/seed-admin.ts / scripts/repair-pancake-clicker.ts"

key-files:
  created:
    - scripts/meshy-sweep.ts
    - .planning/phases/21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-/21-DEPLOY-NOTES.md
  modified: []

key-decisions:
  - "Cron header comment written as line comments (//), not a /* */ block — a block comment containing the literal cron schedule '*/5 * * * *' terminates itself early at the '*/' inside '*/5', corrupting everything after it into a syntax error. Line comments have no such terminator ambiguity."
  - "Staleness filter (updatedAt < now - 2min) implemented as a second drizzle-orm `and()` condition alongside the inArray(status, ...) filter in a single query, rather than filtering in JS after fetch — matches the plan's literal query shape and keeps the DB (not the script) doing the bounding via LIMIT."
  - "21-DEPLOY-NOTES.md verified live app-dir names, node binaries, and tsx presence via a real SSH session against the cPanel box (152.53.86.223) rather than assuming the values from CLAUDE.md prose, which turned out to differ in one respect: the actual persistent-uploads convention on disk today is /home/ninjaz/uploads/<appdir>/products, not the older /home/ninjaz/persistent_uploads/ path CLAUDE.md still describes. The plan's literal required value (MESHY_STORAGE_DIR=/home/ninjaz/persistent_meshy) was used as-is per its explicit acceptance criterion, with a note recommending a dev-specific sibling path so dev's fake test-mode files never share a directory with real prod model data."

requirements-completed: [REQ-21-4]

# Metrics
duration: ~25min
completed: 2026-07-07
---

# Phase 21 Plan 05: Meshy Cron Sweep + Deploy Notes Summary

**5-minute `scripts/meshy-sweep.ts` cron reconciliation sweep that re-drives closed-tab-orphaned Meshy generations via the exact shared `advanceGeneration(id)` state machine (proven runnable locally under tsx against the live dev DB through an SSH tunnel), plus a deploy-notes checklist verified against the real cPanel box's actual app directories, node binaries, and env state.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-07
- **Tasks:** 3/3 completed
- **Files modified:** 2 created (`scripts/meshy-sweep.ts`, `21-DEPLOY-NOTES.md`)

## Accomplishments

- `scripts/meshy-sweep.ts` selects up to 10 `meshy_generations` rows in an active status (`generating`/`revising`/`analyzing`/`repairing`/`processing_multicolor`) with `updated_at` older than 2 minutes, then calls `advanceGeneration(id)` — the SAME function `pollGeneration` (21-03) calls — sequentially per row inside a try/catch so one bad row never blocks the rest of the batch
- Proved the script runs cleanly under the exact runtime prod cron will use: `NODE_OPTIONS="--require ./scripts/_mock-server-only.cjs" npx tsx --env-file=.env.local scripts/meshy-sweep.ts` — no `server-only` import crash, DB connectivity confirmed, output `[meshy-sweep] nothing to do`, exit code 0 (dev DB currently has zero in-flight generations, which is the expected/correct "nothing to do" path)
- Wrote `21-DEPLOY-NOTES.md` with the prod cutover checklist: env vars (`MESHY_API_KEY` real key placement, `MESHY_STORAGE_DIR=/home/ninjaz/persistent_meshy`), one-time `mkdir`+`chown`, the exact `*/5` crontab line for both dev and prod (verified against the box's real app directory names — `3dninjaz_v1` and `3dninjaz_prod` — rather than assumed from documentation), post-cutover verification steps (manual sweep run, log tail check, anonymous-download-route curl check), and a rollback section
- Confirmed the sweep contains zero direct Meshy API calls of its own (`grep -c "meshyFetch\|api\.meshy\.ai"` = 0) — the whole point of the shared state-machine design holds

## Task Commits

Each task was committed atomically:

1. **Task 1: scripts/meshy-sweep.ts** - `de6d6f8` (feat)
2. **Task 2: Prove the sweep runs locally against the dev DB** - no commit (plan specifies "(no file changes)" — verification-only task; see Issues Encountered for the SSH-tunnel step taken to actually prove it)
3. **Task 3: 21-DEPLOY-NOTES.md** - `34cccac` (feat)

## Files Created/Modified

- `scripts/meshy-sweep.ts` - 5-min cron reconciliation sweep: bounded `SELECT ... WHERE status IN (...) AND updated_at < ? ORDER BY updated_at ASC LIMIT 10`, sequential per-row `advanceGeneration(id)` calls with per-row error isolation, `[meshy-sweep]`-prefixed logging, exit 0 on both the nothing-to-do and completed-batch paths, exit 1 only on an initial DB-connection/query failure
- `.planning/phases/21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-/21-DEPLOY-NOTES.md` - prod cutover checklist: env vars, one-time directory setup, exact crontab lines (dev + prod, both verified live), post-cutover verification steps, rollback notes, and an "Outstanding launch-day blockers" checklist tying it back to `.planning/GO-LIVE-READINESS.md`-style tracking

## Decisions Made

- **Block comment vs line comments for the header:** the plan's required cron entry (`*/5 * * * * ...`) cannot live inside a `/* */` JSDoc block because the literal substring `*/` inside `*/5` closes the comment early, producing a cascade of TypeScript syntax errors starting mid-header. Switched the entire header to `//` line comments, which have no such terminator collision. Caught via `npx tsc --noEmit` on the first draft, fixed before the Task 1 commit — not a deviation worth a numbered entry below since it was corrected within the same task before anything was committed.
- **Live-verified deploy topology instead of trusting CLAUDE.md prose verbatim:** SSH'd into the cPanel box to confirm the actual app directory names (`3dninjaz_v1` dev / `3dninjaz_prod` prod), node binaries (CloudLinux nodevenv Node 20 for dev, standalone alt-node for prod), tsx binary presence, and current `.env.local` `MESHY_*` state (confirmed empty on both — a real launch blocker, not an assumption) before writing the crontab lines into 21-DEPLOY-NOTES.md. This also surfaced that the box's actual persistent-uploads convention today (`/home/ninjaz/uploads/<appdir>/products`) has drifted from the older `/home/ninjaz/persistent_uploads/` path CLAUDE.md still documents — noted inline in the deploy notes rather than silently using stale info.
- **Separate dev/prod persistent-meshy directories recommended:** the plan's literal required env value (`MESHY_STORAGE_DIR=/home/ninjaz/persistent_meshy`) is used as-is for prod (matches the acceptance criterion), but the deploy notes flag that dev needs its own sibling directory (e.g. `persistent_meshy_dev`) so dev's fake test-mode-key output never shares a folder with real prod model files.

## Deviations from Plan

None — plan executed exactly as written. The block-comment-vs-line-comment fix above was corrected pre-commit during normal task execution (first-draft syntax error caught by `tsc`), not a post-hoc deviation from a committed state, so it isn't logged as a numbered Rule 1/2/3 deviation.

## Issues Encountered

- **Local DB unreachable via the plain `DATABASE_URL` in `.env.local`.** The dev DB (`ninjaz_3dn` at `152.53.86.223:3306`) rejected the laptop's current public IP with `ER_ACCESS_DENIED_ERROR` (cPanel Remote MySQL access-host whitelist, not a connectivity/firewall issue — matches the class of problem in memory `reference_local_dev_db_tunnel.md`). Resolved by reusing an already-open SSH tunnel (`ssh -N -L 3307:127.0.0.1:3306 root@152.53.86.223`, found already bound on port 3307 from a prior session) and overriding `DATABASE_URL` to `127.0.0.1:3307` for the one-off proof run. This is exactly the SSH-tunnel fallback the plan's Task 2 `read_first` anticipated. No code change was needed; this only affected how Task 2 was executed, not what was committed.

## User Setup Required

None for this plan's code changes. However, `21-DEPLOY-NOTES.md` documents real, currently-outstanding manual steps required before prod cutover (real `MESHY_API_KEY`, `MESHY_STORAGE_DIR` + one-time `mkdir`, and cron registration on both dev and prod) — these are launch-day blockers, not applied by this plan, and are listed under "Outstanding launch-day blockers tracked here" at the bottom of that document.

## Next Phase Readiness

- `scripts/meshy-sweep.ts` is ready to be registered on dev's crontab as soon as a human wants to smoke-test it end-to-end (create a generation, close the tab, wait 5+ minutes, confirm it reaches `awaiting_review`/`ready` without the client ever polling again) — no code changes needed for that smoke test, only the one-time crontab registration documented in `21-DEPLOY-NOTES.md` §3.
- `21-DEPLOY-NOTES.md` is ready to hand to whoever owns the prod cutover (referenced from `.planning/GO-LIVE-READINESS.md`-style launch checklists going forward, same pattern as the Phase 4 `DEPLOY-NOTES.md`).
- No blockers for Plan 21-06 (list + upload UI) or 21-07 (detail cockpit) — this plan touched no shared UI/action files, only a new standalone script and a docs deliverable.
- Flag for 21-08 (CI + smoke): the deploy notes' step 4 anonymous-download-route curl check is a good candidate to fold into that plan's smoke-test suite once the admin UI pages exist.

---
*Phase: 21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-*
*Completed: 2026-07-07*

## Self-Check: PASSED

- FOUND: `scripts/meshy-sweep.ts`
- FOUND: `.planning/phases/21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-/21-DEPLOY-NOTES.md`
- FOUND: `.planning/phases/21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-/21-05-SUMMARY.md`
- FOUND commit: `de6d6f8` (Task 1)
- FOUND commit: `34cccac` (Task 3)
- `npx tsc --noEmit` exits 0
