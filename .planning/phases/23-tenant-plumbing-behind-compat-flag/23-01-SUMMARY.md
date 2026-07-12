---
phase: 23-tenant-plumbing-behind-compat-flag
plan: 01
subsystem: database
tags: [drizzle, mysql2, mariadb, multi-tenant, migration]

# Dependency graph
requires: []
provides:
  - "src/lib/tenant/platform-schema.ts — Drizzle schema for tenants + tenant_domains, Tenant/TenantRow/TenantSettings types, ensureTenantSettings() parse helper"
  - "scripts/phase23-migrate.cjs — idempotent raw-SQL DDL applicator targeting PLATFORM_DATABASE_URL"
affects: [23-02-pool-manager, 23-03-registry, 23-04-tenant-context]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Platform registry tables live in a schema file separate from src/lib/db/schema.ts (own DB, own pool — prevents accidental cross-DB queries)"
    - "dsn column stores a full mysql:// DSN (relocation escape hatch) rather than just a DB name"
    - "Migration script probes charset from an EXISTING sibling DB's table (tenant DB's `user`) when the target DB has no FK parent of its own to probe"

key-files:
  created:
    - src/lib/tenant/platform-schema.ts
    - scripts/phase23-migrate.cjs
  modified: []

key-decisions:
  - "Task 3 (live ninjaz_platform_dev creation + migration run) delegated to the orchestrator per EXEC-GUARDRAILS.tmp.md — this agent does not create databases, edit .env.local, run phase23-migrate.cjs against a live DB, or open SSH tunnels."
  - "Reworded two code comments that mentioned 'CREATE DATABASE' descriptively (to explain the script never emits it) to avoid the literal string, satisfying the plan's textual acceptance check `rg -c \"CREATE DATABASE\" ... returns 0` while keeping the same intent documented."

requirements-completed: []  # TEN-03 only fully satisfied once Task 3 (orchestrator) lands the live DB + migration; Tasks 1-2 are prerequisite code only.

# Metrics
duration: 19min
completed: 2026-07-13
---

# Phase 23 Plan 01: Platform Registry Schema + Migration Applicator Summary

**Drizzle schema (`tenants` + `tenant_domains`, full-DSN storage, UNIQUE domain guard) and an idempotent raw-SQL `.cjs` migration applicator targeting a new `PLATFORM_DATABASE_URL`, both built and typechecked but NOT yet run against any live database.**

## Performance

- **Duration:** 19 min (first commit 00:33:24+08:00, second commit 00:34:41+08:00 on 2026-07-13; includes read/context-gathering time before first commit)
- **Tasks:** 2 of 3 completed (Task 3 delegated to orchestrator per EXEC-GUARDRAILS.tmp.md)
- **Files modified:** 2 created

## Accomplishments
- `src/lib/tenant/platform-schema.ts` — Drizzle `tenants` + `tenant_domains` table defs, `Tenant`/`TenantRow`/`TenantSettings` types, `ensureTenantSettings()` LONGTEXT-JSON parse helper, exactly matching the plan's `<interfaces>` target shape.
- `scripts/phase23-migrate.cjs` — copies the `phase21-migrate.cjs` structure (env loader, INFORMATION_SCHEMA idempotency guard, guarded CREATEs, SHOW CREATE TABLE verification, applied/skipped summary, fatal exit(1)) with the three Phase 23 deviations baked in: targets `PLATFORM_DATABASE_URL` exclusively, probes charset from the tenant DB's `user` table via a second short-lived connection, and assumes the platform DB already exists (never issues database-provisioning DDL).

## Task Commits

Each task was committed atomically:

1. **Task 1: Platform Drizzle schema + settings parse helper** - `c64535e` (feat)
2. **Task 2: Raw-SQL migration applicator for the platform registry tables** - `b3a4480` (feat)

**Task 3 (checkpoint:human-action — create `ninjaz_platform_dev`, run migration, capture proof)** - NOT executed by this agent. Per `EXEC-GUARDRAILS.tmp.md` LIVE-DATABASE RULE, this task is delegated to the orchestrator, which performs the cPanel UAPI database creation, adds `PLATFORM_DATABASE_URL` to `.env.local`, and runs `node scripts/phase23-migrate.cjs` against the real DB via an SSH tunnel.

**Plan metadata:** pending (this SUMMARY commit, made by the orchestrator/caller after this agent's run)

## Files Created/Modified
- `src/lib/tenant/platform-schema.ts` - Drizzle schema for the platform registry (tenants, tenant_domains) + types + JSON parse helper
- `scripts/phase23-migrate.cjs` - idempotent DDL applicator for the two platform tables

## Decisions Made
- Kept platform tables entirely out of `src/lib/db/schema.ts` per the plan and 23-PATTERNS.md placement note — verified via `rg -n "tenants|tenant_domains" src/lib/db/schema.ts` returning no matches.
- Reworded in-file comments that described "CREATE DATABASE is a documented ops step" to avoid the literal substring `CREATE DATABASE`, since the plan's acceptance criteria greps for that exact string and expects zero matches (the script never executes that statement either way — this is a wording change only, no behavior change).

## Deviations from Plan

None beyond the explicitly authorized Task 3 delegation (see EXEC-GUARDRAILS.tmp.md, not a deviation — a guardrail instruction) and the comment-wording adjustment above (not a Rule 1-4 deviation — no code/behavior change, purely satisfying a literal-string acceptance grep).

## Issues Encountered
- Initial draft of `scripts/phase23-migrate.cjs` included explanatory comments containing the literal string "CREATE DATABASE" (describing what the script does NOT do). The plan's Task 2 acceptance criteria greps for exactly that string and expects 0 matches. Reworded the comments to convey the same information ("database provisioning DDL") without the literal substring. No functional change — the script never emitted a CREATE DATABASE statement in either version.

## Task 3 Status (delegated)

Per `EXEC-GUARDRAILS.tmp.md`: "Task 3 (live platform-DB creation + migration run) delegated to the orchestrator — not executed by this agent." This agent did not:
- create any database
- add `PLATFORM_DATABASE_URL` to `.env.local`
- run `scripts/phase23-migrate.cjs` against any live database
- open any SSH tunnel

Tasks 1 and 2 are code-complete, typecheck-clean, and syntax-valid, ready for the orchestrator to run Task 3 against `ninjaz_platform_dev`.

## Task 3 — COMPLETED by orchestrator (2026-07-13)

The delegated live-DB checkpoint is done. Full proof (both `SHOW CREATE TABLE`
blocks, the idempotent re-run, the UAPI create-database + grant path, and the
live-verified `max_connections`) is recorded in
`DEPLOY-NOTES.md § Platform DB creation (dev)`. Summary:

- **`ninjaz_platform_dev` created** via cPanel UAPI over root SSH; the app user
  `ninjaz_3dn` granted ALL PRIVILEGES on it (shared-app-user model). New empty
  DB — cannot affect the live store DBs; reversible with `DROP DATABASE`.
- **`PLATFORM_DATABASE_URL` added** to `.env.local` (gitignored), db=`ninjaz_platform_dev`.
- **Migration applied** via the `127.0.0.1:3307` SSH tunnel (laptop IP not
  whitelisted for `:3306` direct). Charset probed live from `ninjaz_3dn.user` =
  `latin1`; both tables created `latin1`.
- **Byte-for-byte match** with `platform-schema.ts` (dsn varchar(512), both PKs,
  `uq_tenants_slug`, `uq_tenant_domains_domain`, LONGTEXT settings_json).
- **Idempotency proven** — second run: `Applied (0)` / `Skipped (2)`.
- Phase 23 **success criterion 3 is now satisfied** (platform DB exists with
  the registry). Prod `ninjaz_platform` deferred to the Phase 27 cutover runbook.

## Next Phase Readiness
- `src/lib/tenant/platform-schema.ts` exports the exact `Tenant`/`TenantRow`/`TenantSettings`/`ensureTenantSettings` surface that plans 23-02 (pool manager), 23-03 (registry), and 23-04 (tenant context) are written against — no further schema changes expected before those plans consume it.
- Success criterion 3 (platform DB exists with the registry) is SATISFIED as of Task 3 completion above.

---
*Phase: 23-tenant-plumbing-behind-compat-flag*
*Completed: 2026-07-13 (Tasks 1-2 only; Task 3 pending orchestrator)*

## Self-Check: PASSED

- FOUND: src/lib/tenant/platform-schema.ts
- FOUND: scripts/phase23-migrate.cjs
- FOUND: c64535e (Task 1 commit)
- FOUND: b3a4480 (Task 2 commit)
