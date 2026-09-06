---
phase: 21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-
plan: 01
subsystem: database
tags: [drizzle, mysql2, mariadb, meshy, schema, migration]

# Dependency graph
requires: []
provides:
  - meshy_generations table live on dev MariaDB (ninjaz_3dn) — 9-value workflow status enum, per-stage Meshy task-id columns, printability + local-file JSON columns, credits tracking
  - meshy_revisions table live on dev MariaDB — retexture/regenerate history, FK to meshy_generations ON DELETE CASCADE
  - Drizzle mirror (meshyGenerations, meshyRevisions, relations) in src/lib/db/schema.ts, byte-aligned with SHOW CREATE TABLE
  - scripts/phase21-migrate.cjs — idempotent, charset-probe-driven raw-SQL applicator (reusable pattern for future re-runs)
  - REQ-21-1..9 recorded in .planning/REQUIREMENTS.md
affects: [21-02, 21-03, 21-04, 21-05, 21-06, 21-07, 21-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Raw-SQL migration applicator with live charset probe (SHOW CREATE TABLE user) instead of a hardcoded DEFAULT CHARSET — extends the Phase 18/20 precedent"
    - "$onUpdateFn as the datetime()-column equivalent of timestamp().onUpdateNow() in drizzle-orm 0.45.2"

key-files:
  created:
    - scripts/phase21-migrate.cjs
    - .planning/phases/21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-/21-01-SUMMARY.md
  modified:
    - src/lib/db/schema.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Live-probed FK-parent (user) charset = latin1 (collation latin1_swedish_ci auto-selected) — both new tables created with DEFAULT CHARSET=latin1 to match, confirmed via two full migration runs against the live dev DB"
  - "drizzle-orm 0.45.2's datetime() column builder has no .onUpdateNow() (that helper only exists on timestamp() columns) — used the documented $onUpdateFn(() => sql`CURRENT_TIMESTAMP`) equivalent instead; the live DDL's ON UPDATE CURRENT_TIMESTAMP clause (enforced by MariaDB itself) remains the authoritative source of truth"
  - "product_id and approved_by carry no FK constraint (app-layer only), per 21-CONTEXT resolved open question #2 — no v1 admin UI links a generation to a catalog product"

patterns-established:
  - "Charset must always be read live via SHOW CREATE TABLE on the FK parent before any CREATE TABLE against this MariaDB remote — never hardcode latin1 or any other charset, even though latin1 has been the observed value on every table probed so far"

requirements-completed: [REQ-21-1]

# Metrics
duration: ~4min (task execution); preceded by an unrelated worktree-infrastructure recovery detour (see Issues Encountered)
completed: 2026-07-07
---

# Phase 21 Plan 01: Meshy Schema Foundation Summary

**meshy_generations (9-value workflow enum, parent) + meshy_revisions (child, FK ON DELETE CASCADE) shipped as raw-SQL DDL applied live to dev MariaDB via SSH tunnel, plus a byte-aligned Drizzle mirror in schema.ts — charset probed live as latin1, idempotency proven across two full runs.**

## Performance

- **Duration:** ~4 min of task execution (schema.ts edit → migration script → live DB run ×2 → REQUIREMENTS.md), spread across 3 commits between 23:03 and 23:07 (+0800) on 2026-07-07
- **Tasks:** 4/4 completed
- **Files modified:** 3 (schema.ts, REQUIREMENTS.md) + 1 created (phase21-migrate.cjs)

## Accomplishments

- `meshy_generations` + `meshy_revisions` tables live on dev MariaDB (`ninjaz_3dn`), created via raw SQL (no `drizzle-kit push`, per CLAUDE.md's documented hang against this remote)
- Drizzle schema mirror added to `src/lib/db/schema.ts`, column-for-column matching the live `SHOW CREATE TABLE` output (verified by direct comparison, not just visual inspection)
- Migration re-run twice: first run applied both tables (0 skipped), second run skipped both (0 applied) — full idempotency proven
- Live charset probe confirmed `latin1` (matching the `user` table, the FK parent for `admin_user_id`) — never hardcoded
- Runtime sanity check: `db.select().from(meshyGenerations)` and `db.select().from(meshyRevisions)` both executed successfully against the live dev DB via `tsx` (0 rows, as expected for freshly created tables) — confirms downstream plans can read/write without a runtime error
- REQ-21-1 through REQ-21-9 appended to `.planning/REQUIREMENTS.md`

## Task Commits

Each task was committed atomically (Task 2 and Task 3 combined into one commit per the plan's explicit Task 4 instruction — migration script + live-run proof must land together, only after the live run succeeded):

1. **Task 1: Add meshyGenerations + meshyRevisions to Drizzle schema** - `6a16378` (feat)
2. **Task 2 + Task 3: [BLOCKING] Write phase21-migrate.cjs + run against live dev MariaDB (proof captured, idempotency proven)** - `f57ea46` (feat)
3. **Task 4: Append Phase 21 requirements to REQUIREMENTS.md** - `db56722` (docs)

_No separate "plan metadata" commit — SUMMARY.md is committed as part of this same session's final commit per the parallel-worktree/direct-main-repo instructions for this run (orchestrator owns STATE.md/ROADMAP.md separately)._

## Files Created/Modified

- `src/lib/db/schema.ts` - Added `meshyGenerations` (parent, 26 columns, 9-value status enum, 3 indexes) + `meshyRevisions` (child, FK ON DELETE CASCADE, 1 composite index) + both `relations()` exports, inserted directly below the `paymentProofs` block per the plan's read_first convention
- `scripts/phase21-migrate.cjs` - New idempotent raw-SQL applicator: probes `user` table charset live, creates both tables gated by `tableExists()`, prints `SHOW CREATE TABLE` for both post-creation, applied/skipped summary
- `.planning/REQUIREMENTS.md` - Appended `## Phase 21 — Admin Meshy AI 3D Generation` section with REQ-21-1..9

## Decisions Made

- **Charset (live-probed, not assumed):** `SHOW CREATE TABLE user` returned `DEFAULT CHARSET=latin1` (collation `latin1_swedish_ci` auto-selected by MariaDB for that charset). Both `meshy_generations` and `meshy_revisions` were created with `DEFAULT CHARSET=latin1` to match, satisfying the FK constraint between `meshy_generations.admin_user_id` and `user.id`.
- **DB connectivity:** Direct connection to `152.53.86.223:3306` from this machine was rejected (`Access denied for user 'ninjaz_3dn'@'175.138.93.81'`) — the cPanel Remote MySQL IP whitelist doesn't include this session's egress IP (same wall hit in Phase 18 Plan 01 per STATE.md precedent). Resolved via `ssh -L 3307:127.0.0.1:3306 root@152.53.86.223` (root SSH key access, already confirmed working per project memory) + `DATABASE_URL` host/port override to `127.0.0.1:3307` for the duration of the migration run and verification queries. No changes made to the whitelist itself; the tunnel is the documented workaround and requires no persistent server-side change.
- **`$onUpdateFn` vs `.onUpdateNow()`:** see Deviations below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `datetime().onUpdateNow()` does not exist in installed drizzle-orm 0.45.2**
- **Found during:** Task 1 (`npx tsc --noEmit` after adding `meshyGenerations`)
- **Issue:** The plan's Task 1 action specified `updatedAt: datetime("updated_at").notNull().default(sql\`CURRENT_TIMESTAMP\`).onUpdateNow()`. TypeScript rejected this: `Property 'onUpdateNow' does not exist on type 'HasDefault<NotNull<MySqlDateTimeBuilderInitial<"updated_at">>>'. Did you mean '$onUpdateFn'?`. Inspecting `node_modules/drizzle-orm/mysql-core/columns/date.common.d.ts` confirmed `onUpdateNow()` is only declared on the date-common base class that `timestamp()` extends — `datetime()`'s builder (`MySqlDateTimeBuilder`) extends the plain `MySqlColumnBuilder` and never gained that convenience method in this version.
- **Fix:** Replaced with `.$onUpdateFn(() => sql\`CURRENT_TIMESTAMP\`)`, the documented ORM-level equivalent available on the base `ColumnBuilder` class (works for any column type, not just `timestamp()`). Added an inline comment explaining the substitution and noting the live DDL (created in Task 2/3) is the actual source of truth for the `ON UPDATE CURRENT_TIMESTAMP` behavior enforced by MariaDB — the Drizzle-side annotation only affects Drizzle-issued UPDATE statements that omit the column.
- **Files modified:** `src/lib/db/schema.ts` (single column definition, `meshyGenerations.updatedAt`)
- **Verification:** `npx tsc --noEmit` exits 0; all Task 1 acceptance-criteria greps (including `grep -c "onUpdateNow" >= 1`, already satisfied by 23 pre-existing `timestamp().onUpdateNow()` usages elsewhere in the file, now 24 including this comment) pass
- **Committed in:** `6a16378` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — library API surface mismatch between the plan's assumption and the installed drizzle-orm version)
**Impact on plan:** Cosmetic/mechanical fix only. The live database DDL (the actual runtime behavior contract) is unaffected — `ON UPDATE CURRENT_TIMESTAMP` is declared and confirmed present in the live `SHOW CREATE TABLE meshy_generations` output. No scope creep.

## Issues Encountered

**Worktree infrastructure failure (pre-execution, resolved by coordinator, not a plan deviation):** Before any plan work began, the mandatory worktree branch check found this session's assigned parallel-executor worktree (and a sibling worktree for Plan 21-02) had been branched from `master`/`abab004` instead of the intended `docs/phase21-plans`/`1dcf704` base — the plan files didn't exist in that tree. A `git reset --hard 1dcf704` was applied per coordinator instruction, after which the worktree directory itself disappeared from disk between tool calls (replaced by an empty, non-`git`-initialized stub directory) — a worktree-isolation flake the coordinator confirmed independently and then resolved by abandoning worktree isolation for this plan entirely and directing execution straight into the main project directory (`docs/phase21-plans` branch, confirmed clean, confirmed at `1dcf704`) with normal (non-`--no-verify`) commits, holding the sibling 21-02 agent back to avoid working-tree contention. No files were modified and no commits were made during the period this was being diagnosed; once redirected, the four plan tasks executed cleanly with no further infrastructure issues.

- Direct DATABASE_URL connection to the live dev DB from this machine's egress IP was rejected by the Remote MySQL whitelist — resolved via the documented SSH-tunnel workaround (see Decisions Made above). No blocker remained after the tunnel was established.

## User Setup Required

None - no external service configuration required. (The live DB migration required an SSH tunnel for this session's connectivity only; no persistent environment or whitelist change was made.)

## Next Phase Readiness

- `meshyGenerations` / `meshyRevisions` are live, typed, and readable/writable — Plan 21-02 (Meshy client + storage libs) and downstream plans (21-03 pipeline/actions onward) can build directly on top without any further schema work.
- The `phase21-migrate.cjs` script is safe to re-run at any time (fully idempotent) if it needs to be applied again on another environment (e.g., prod, once this phase is ready to ship there) — prod's `user` table charset should be re-probed independently; do not assume it matches dev's `latin1`.
- No blockers for Plan 21-02.

---
*Phase: 21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-*
*Completed: 2026-07-07*

## Self-Check: PASSED

- FOUND: `src/lib/db/schema.ts`
- FOUND: `scripts/phase21-migrate.cjs`
- FOUND: `.planning/REQUIREMENTS.md`
- FOUND: `.planning/phases/21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-/21-01-SUMMARY.md`
- FOUND commit: `6a16378` (Task 1)
- FOUND commit: `f57ea46` (Task 2+3)
- FOUND commit: `db56722` (Task 4)
