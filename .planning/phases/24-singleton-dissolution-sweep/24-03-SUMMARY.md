---
phase: 24-singleton-dissolution-sweep
plan: 03
subsystem: auth
tags: [multi-tenant, better-auth, tenant-context, auth-helpers, guards]

# Dependency graph
requires:
  - phase: 24-singleton-dissolution-sweep
    plan: 02
    provides: "buildTenantAuth(tenant, db) factory + getTenantAuth(tenant, db) cache (src/lib/tenant/auth-cache.ts), single-mode short-circuit to the `auth` compat shim"
  - phase: 23-multi-tenant-plumbing
    provides: "getTenantContext()/resolveTenantContext() returning { tenant, db } (src/lib/tenant/context.ts)"
provides:
  - "getTenantContext()/resolveTenantContext() now return { tenant, db, auth } — auth resolved via getTenantAuth(tenant, db)"
  - "requireAdmin()/requireUser() resolve tenant BEFORE session lookup and return a backward-compatible spread { ...session, tenant, db } -> { session, user, tenant, db }"
  - "getSessionUser() resolves auth via getTenantContext, unchanged user|null return shape"
  - "src/lib/auth-helpers.ts no longer imports @/lib/db or @/lib/auth (both singletons dissolved from this file)"
affects: [24-04, 24-05, 24-06, 24-07, 24-08, 24-09, 24-10, 25-super-admin-provisioning, 26-super-admin-panel, 27-tenant-cutover]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tenant-before-session guard ordering: every guard's first await is getTenantContext(), only then auth.api.getSession() — the same discipline as CVE-2025-29927 handler-level re-verification, extended to tenant identity"
    - "Backward-compatible flat-spread guard return: { ...session, tenant, db } rather than a nested { session: {...}, tenant, db } — preserves every existing call site's `.user`/`.session` access without a codebase-wide rewrite (D-A2, locked in the plan)"

key-files:
  created: []
  modified:
    - src/lib/tenant/context.ts
    - src/lib/tenant/context.test.ts
    - src/lib/auth-helpers.ts

key-decisions:
  - "D-A2 (from plan, applied as-is): guard return is the flat spread { ...session, tenant, db }, yielding { session, user, tenant, db } since Better Auth's getSession() returns { session, user }. This is what keeps ~120 existing `await requireAdmin()`/`await requireUser()` call sites compiling with zero changes — confirmed by a clean `npx tsc --noEmit` after the guard-shape change."
  - "getSessionUser (locked per plan decisions_for_review): left returning user | null unchanged, NOT upgraded to { user, tenant, db } — its 18 callers keep compiling, and null-user (anonymous/guest) flows aren't forced into a shape that can't express 'no user, but still need tenant/db'. Deferred to those 12 db-importing callers adding their own getTenantContext() call in a later wave (React cache()-memoized, so the double resolve is free)."
  - "context.ts's resolveTenantContext computes db once (`const db = getTenantDb(tenant)`) and passes it into getTenantAuth(tenant, db), matching auth-cache.ts's signature and avoiding a second getTenantDb call"

patterns-established:
  - "Tenant-first guard pattern: any future guard/handler that needs both tenant identity and session validation must call getTenantContext() first, never resolve a session against a bare/singleton auth instance"

requirements-completed: [TEN-02]

# Metrics
duration: ~5min
completed: 2026-07-13
---

# Phase 24 Plan 03: Tenant-Aware Guards (getTenantContext + auth) Summary

**getTenantContext() now resolves `{ tenant, db, auth }` (auth added via 24-02's getTenantAuth); `requireAdmin`/`requireUser`/`getSessionUser` bind tenant identity before session lookup and return a backward-compatible spread that keeps all ~120 existing call sites compiling unchanged.**

## Performance

- **Duration:** ~5 min (Task 1 commit 16:20:28, Task 2 commit 16:22:12, both +08:00)
- **Completed:** 2026-07-13
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `src/lib/tenant/context.ts`: `resolveTenantContext()`'s return type extended to `{ tenant, db, auth }`; the body now computes `db` once and calls `getTenantAuth(tenant, db)` from 24-02's auth-cache to populate `auth`. `notFound()`/`TenantSuspendedError` (TEN-03 boundary) untouched — same order, same conditions. Header comment updated: the Phase 23 "Phase 24 adds auth ... do not add it here" deferral note is now marked satisfied, and `auth-helpers.ts` is documented as consuming the resolved shape directly.
- `src/lib/tenant/context.test.ts`: added a hoisted `getTenantAuthMock`/`authSentinel` pair mirroring the existing `getTenantDbMock`/`dbSentinel`, plus `vi.mock("./auth-cache", ...)` so the real Better Auth graph never loads during this unit test. Reset in `beforeEach`. Happy-path assertions (both `resolveTenantContext` and `getTenantContext` describe blocks, plus the single-mode test) now also assert `result.auth === authSentinel` and `getTenantAuthMock` was called with `(tenant, dbSentinel)`. The two hard-fail tests (unknown host, suspended tenant) additionally assert `getTenantAuthMock` was never called. All existing notFound/suspended assertions preserved verbatim.
- `src/lib/auth-helpers.ts` rewritten: `requireAdmin()`, `requireUser()`, `getSessionUser()` all now call `const { tenant, db, auth } = await getTenantContext()` (or `{ auth }` for `getSessionUser`) as the FIRST await, before `auth.api.getSession(...)`. `requireAdmin`/`requireUser` return `{ ...session, tenant, db }` — the locked D-A2 backward-compatible flat spread. `requireUser`'s hot-path (`surface.deletedAt` truthy → Unauthorized) and cold-path (`deletedAt === undefined` → one SELECT of `{ deletedAt, banned }` against the context `db`, reject on missing/deleted/banned row) are byte-identical to the pre-plan logic, just now running against the tenant-scoped `db` instead of the module singleton. `getSessionUser()` keeps its exact `session?.user ?? null` return. The file no longer imports `@/lib/db` (the `db` singleton value) or `@/lib/auth` (the `auth` singleton) — only the schema-object import `@/lib/db/schema` remains, which is metadata, not the dissolved singleton.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend getTenantContext()/resolveTenantContext() to return auth** - `fdd45e0` (feat)
2. **Task 2: Evolve the three guards to be tenant-aware (backward-compatible return)** - `51ee978` (feat)

## Files Created/Modified

- `src/lib/tenant/context.ts` (modified) - `resolveTenantContext()` returns `{ tenant, db, auth }`; `auth: getTenantAuth(tenant, db)` added; TEN-03 notFound/suspended boundary unchanged
- `src/lib/tenant/context.test.ts` (modified) - `./auth-cache` mocked with `authSentinel`; happy-path + not-called assertions extended
- `src/lib/auth-helpers.ts` (modified) - `requireAdmin`/`requireUser`/`getSessionUser` resolve tenant via `getTenantContext()` first, then session; guards return `{ ...session, tenant, db }`; no more `@/lib/db`/`@/lib/auth` singleton imports

## Decisions Made

- Applied D-A2 exactly as locked in the plan: flat spread `{ ...session, tenant, db }`, not a nested shape. Verified by a clean full-repo `npx tsc --noEmit` after the guard-shape change (see Verification below) — this is the direct proof that no existing call site broke.
- `getSessionUser` left with its unchanged `user | null` return per the plan's locked decision, rather than the pattern-mapper's originally-preferred `{ user, tenant, db }` shape.
- Logged (did not fix) two pre-existing, unrelated test failures discovered while running the full `npx vitest run` sanity pass — see Deviations below.

## Deviations from Plan

### Deferred (out of scope, logged not fixed)

**1. [Scope boundary — pre-existing, unrelated] Two pre-existing test failures found during a full `npx vitest run` sanity check**
- **Found during:** post-Task-2 full test suite run (sanity check beyond the plan's `context.test.ts`-only requirement)
- **Issue:** `src/lib/__tests__/config-fields.test.ts` ("parses a valid select config with optional priceAdd") fails, and `src/actions/__tests__/configurator-fields.test.ts` / `configurator-tier-table.test.ts` / `configurator-update-type.test.ts` fail to load with a `server-only` "cannot be imported from a Client Component" error.
- **Verification these are NOT caused by this plan:** `git stash` (reverting the uncommitted Task 2 diff back to just the Task 1 commit, `fdd45e0`) and re-running the same test files reproduced the identical failures. Confirmed pre-existing and unrelated to tenant/auth/context work.
- **Action:** Logged to `.planning/phases/24-singleton-dissolution-sweep/deferred-items.md`. Not fixed — out of scope per the executor's scope-boundary rule (these files are not in this plan's `files_modified` and the failures are unrelated to guard/context changes).

No other deviations. Both tasks matched the plan's `<action>`/`<interfaces>` code blocks essentially verbatim.

## Issues Encountered

None blocking. See the deferred pre-existing test failures above.

## User Setup Required

None. `TENANT_MODE` stays unset/`single` in every deployed environment; `getTenantAuth`'s single-mode short-circuit (from 24-02) means `auth` in the resolved context is the existing compat shim, unchanged behavior.

## Next Phase Readiness

- `src/lib/auth-helpers.ts`'s three guards are now tenant-aware and import neither `@/lib/db` nor `@/lib/auth` — the Category A "guards hand back db for free" insertion point the rest of the sweep (24-04 onward) depends on is in place.
- `getTenantContext()` is now the single resolved shape `{ tenant, db, auth }` for every downstream plan in this phase.
- `export const auth` (src/lib/auth.ts) and `export const db` (src/lib/db.ts) singletons are still present as compat shims for any not-yet-swept importer outside `auth-helpers.ts` — their removal is scheduled later in the phase (per 24-02's SUMMARY, ~24-10).

## Verification

- `npx tsc --noEmit` (raw, unfiltered): **exit 0 — CLEAN**, run after Task 1 and again after Task 2 (final check against the full tree with both commits applied). This is the load-bearing proof that all ~120 existing `await requireAdmin()`/`await requireUser()` call sites still compile against the new backward-compatible guard return shape — no call site was rewritten.
- `npx vitest run src/lib/tenant/context.test.ts` → **10/10 passed**, both before Task 2 (guard rewrite) and again after, confirming the auth-cache mock and extended assertions hold.
- `rg "getTenantAuth" src/lib/tenant/context.ts` → matched (import, comment, type, call site)
- `rg "auth:" src/lib/tenant/context.ts` → matched (`ReturnType<typeof getTenantAuth>` field + return-object key)
- `rg "notFound\(\)" src/lib/tenant/context.ts` → matched (TEN-03 boundary intact)
- `rg "auth-cache" src/lib/tenant/context.test.ts` → matched (doc comment + `vi.mock` call)
- `grep -c 'from "@/lib/db"' src/lib/auth-helpers.ts` → 0 matches (db singleton import gone)
- `grep -c 'from "@/lib/auth"' src/lib/auth-helpers.ts` → 0 matches (auth singleton import gone)
- `grep -c "await getTenantContext()" src/lib/auth-helpers.ts` → 3 (one per guard, first await in each)
- `grep "\.\.\.session, tenant, db" src/lib/auth-helpers.ts` → 2 matches (requireAdmin, requireUser)
- `grep "surface.deletedAt === undefined" src/lib/auth-helpers.ts` → matched (cold-path preserved verbatim)
- `git diff --diff-filter=D --name-only HEAD~1 HEAD` (checked after each of the two task commits) → empty both times, no accidental deletions

**Backward-compatibility proof (guard-shape spread):** the flat spread `{ ...session, tenant, db }` was the ONLY change to what `requireAdmin()`/`requireUser()` return, and a full-repo `npx tsc --noEmit` (exit 0, zero errors) after that change is the direct evidence that every one of the ~120 existing `const session = await requireAdmin()` / `await requireUser()` call sites across `src/` — which destructure/access `.user`, `.session`, or use the returned object as a Better-Auth-session-shaped value — still typechecks unchanged. If the spread had broken the shape (e.g. lost `.user`), those call sites would fail to compile; they did not.

## Self-Check: PASSED

- `src/lib/tenant/context.ts` — FOUND (modified, contains `getTenantAuth`)
- `src/lib/tenant/context.test.ts` — FOUND (modified, contains `auth-cache` mock)
- `src/lib/auth-helpers.ts` — FOUND (modified, no `@/lib/db`/`@/lib/auth` imports)
- Commit `fdd45e0` — FOUND in `git log --oneline`
- Commit `51ee978` — FOUND in `git log --oneline`

---
*Phase: 24-singleton-dissolution-sweep*
*Completed: 2026-07-13*
