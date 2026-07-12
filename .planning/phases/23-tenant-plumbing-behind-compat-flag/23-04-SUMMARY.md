---
phase: 23-tenant-plumbing-behind-compat-flag
plan: 04
subsystem: database
tags: [multi-tenant, react-cache, vitest, ttl-cache, fail-closed, tdd]

# Dependency graph
requires:
  - phase: 23-tenant-plumbing-behind-compat-flag
    provides: "src/lib/tenant/platform-schema.ts (Tenant, tenants, tenantDomains, ensureTenantSettings) — plan 23-01"
  - phase: 23-tenant-plumbing-behind-compat-flag
    provides: "getTenantDb(tenant), getPlatformDb(), TENANT_MODE (from @/lib/db) — plan 23-03"
provides:
  - "resolveDomain(host) — sync-once-warm domain->tenant lookup, fail-closed null on any miss, never a default/first-entry fallback"
  - "warmRegistry()/bustTenantRegistry() — 60s TTL in-process registry cache with explicit invalidation"
  - "TENANT_MODE=single synthesis — one tenant from DATABASE_URL, Host ignored, platform DB never touched"
  - "getTenantContext() — React cache()-wrapped resolver returning { tenant, db }; unknown host hard-404s via notFound(); suspended tenant throws TenantSuspendedError"
  - "resolveTenantContext() — the independently unit-tested inner resolver getTenantContext() wraps"
affects: [24-singleton-sweep, 26-super-admin-tenant-crud, 27-cutover]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Registry cache shape: { map: Map<domain, Tenant>, singleTenant: Tenant | null, expiresAt } — singleTenant is a dedicated field, not a map-fallback, so the miss path (map.get(normalized) ?? null) never accidentally serves a default tenant"
    - "Fail-closed load failure: warmRegistry() only ever assigns global.__tenantRegistry AFTER a successful await loadRegistry() — a thrown/rejected load leaves the previous (or absent) cache untouched, so resolveDomain keeps returning null rather than stamping a fallback"
    - "cache(async () => resolveTenantContext()) — the React cache()-wrapped export stays the literal ARCHITECTURE.md reference shape, while the actual resolution logic lives in a separately-exported, independently-testable resolveTenantContext()"
    - "Host normalization applied identically at both registry-load (write) and resolveDomain (read) time: host.toLowerCase().replace(/:\\d+$/, '')"

key-files:
  created:
    - src/lib/tenant/registry.ts
    - src/lib/tenant/registry.test.ts
    - src/lib/tenant/context.ts
    - src/lib/tenant/context.test.ts
  modified: []

key-decisions:
  - "Empirically verified (throwaway vitest experiment, not committed) that React 19.1.0's cache() does NOT memoize across two calls in a bare vitest/Node harness — no request-scoped AsyncLocalStorage dispatcher is installed outside a real Next.js render. Spy call count was 2 (not 1) and returned object identity was false. Per the 23-04 guardrails, resolved by exporting the inner resolver (resolveTenantContext) as a separate, directly-testable function, and documenting the limitation in context.test.ts's file header instead of faking a call-count assertion on getTenantContext itself."
  - "getTenantContext is still literally `cache(async () => resolveTenantContext())`, not `cache(resolveTenantContext)` directly, so the acceptance-criteria grep for the literal ARCHITECTURE.md reference shape (`cache(async`) still matches, while resolveTenantContext remains independently unit-tested. Purely an indirection choice — no behavior difference for real Next.js request handling, where cache() would memoize both forms identically."
  - "registry.ts's cache stores `singleTenant: Tenant | null` as a field distinct from the domain Map, rather than falling back to `map.values().next()` for single-mode resolution — keeps the 'no default/first-entry fallback on a miss' invariant textually and structurally unambiguous for the T-23-04-01 threat (unrecognized Host must never resolve to an existing tenant)."
  - "Orphaned tenant_domains rows (a domain pointing at a tenantId with no matching tenants row) are silently skipped during registry load rather than synthesizing a partial tenant — added as an extra test case beyond the plan's explicit <behavior> list (Rule 2: correctness requirement implied by the fail-closed threat model, not a scope change)."

patterns-established:
  - "vi.hoisted() + a getter-based mock export (e.g. `get TENANT_MODE() { return tenantModeState.value; }`) for making a named-const module export dynamically test-controllable across test cases within one file, extending the vi.mock('server-only', () => ({})) + vi.hoisted(sentinel) conventions already established in pool-manager.test.ts."
  - "queueLoad()/queueFailure() helper pattern for wiring a two-call select().from() sequence (tenants, then tenantDomains) via mockImplementationOnce chaining, asserting the exact table object passed to .from() by reference equality against the real (unmocked) platform-schema.ts exports."

requirements-completed: [TEN-03]

# Metrics
duration: ~18min
completed: 2026-07-13
---

# Phase 23 Plan 04: Registry TTL Cache + getTenantContext() Summary

**In-process domain->tenant TTL registry cache (`resolveDomain`/`warmRegistry`/`bustTenantRegistry`) plus a React `cache()`-wrapped `getTenantContext()` resolver that hard-404s on any unrecognized Host — the TEN-03 tenant-isolation trust boundary, fully fail-closed and unit-tested (22 new tests, both TDD RED->GREEN).**

## Performance

- **Duration:** ~18 min (commits span 00:58:35 -> 01:02:02+08:00 on 2026-07-13, plus prior guardrails/plan reading, context-gathering reads of 23-01/23-03 outputs, and a throwaway `react` `cache()` memoization experiment run directly in the repo before committing anything)
- **Tasks:** 2 of 2 completed (both TDD: RED then GREEN)
- **Files modified:** 4 (all created; 0 existing files touched)

## Accomplishments
- `src/lib/tenant/registry.ts` — `resolveDomain(host)` (sync-once-warm, case/port-normalized, `null` on any miss — unknown host, cold cache, or a previously failed load), `warmRegistry()` (60s TTL, fail-closed on load error — never stamps a fallback), `bustTenantRegistry()` (Phase 26 super-admin mutation hook), `_resetForTests(seed)`. `TENANT_MODE=single` synthesizes exactly one tenant from `DATABASE_URL` and never calls `getPlatformDb()`.
- `src/lib/tenant/registry.test.ts` — 12 passing tests: seeded-domain resolution, case+port normalization, unknown-host null, orphaned-domain-row handling, load-failure fail-closed, TTL-expiry reload vs stale-serve-from-cache, bust-forces-fresh-load, single-mode synthesis + Host-ignored + never-touches-platform-DB, unset-`TENANT_MODE` defaulting to single, and `_resetForTests` seeding/nulling.
- `src/lib/tenant/context.ts` — `TenantSuspendedError`, `resolveTenantContext()` (the inner resolver: warms the registry, normalizes the request Host, resolves the tenant, hard-404s via `notFound()` on a miss, throws `TenantSuspendedError` on a suspended tenant, else returns `{ tenant, db: getTenantDb(tenant) }`), and `getTenantContext = cache(async () => resolveTenantContext())` — the literal ARCHITECTURE.md reference shape, React-memoized per request.
- `src/lib/tenant/context.test.ts` — 10 passing tests: happy path (`db === getTenantDb(tenant)`), Host case/port normalization, unknown-host `notFound()` (TEN-03), suspended -> `TenantSuspendedError` carrying the tenant id (distinct from `notFound`), single-mode Host-ignored passthrough, missing-Host-header safety, and `getTenantContext` delegation checks (documented, not call-count-asserted — see Decisions).
- Confirmed via `git diff --name-only` across all four 23-04 commits that only the four `src/lib/tenant/{registry,context}.*` files changed — `src/lib/auth-helpers.ts` and `src/middleware.ts` are untouched, satisfying the zero-behavior-change invariant.

## Task Commits

Each task was committed atomically, TDD RED then GREEN:

1. **Task 1 RED: failing test for registry TTL cache** - `00218e5` (test)
2. **Task 1 GREEN: implement registry.ts** - `13188fc` (feat)
3. **Task 2 RED: failing test for getTenantContext()** - `17afa75` (test)
4. **Task 2 GREEN: implement context.ts** - `076ba58` (feat)

**Plan metadata:** pending (this SUMMARY commit, made after this agent's run)

## Files Created/Modified
- `src/lib/tenant/registry.ts` - domain->tenant TTL cache, single-mode synthesis, fail-closed miss/load-failure handling
- `src/lib/tenant/registry.test.ts` - 12 vitest cases covering every `<behavior>` bullet plus orphaned-domain-row and unset-`TENANT_MODE` extra coverage
- `src/lib/tenant/context.ts` - `getTenantContext()` (React `cache()`), `resolveTenantContext()` (inner resolver), `TenantSuspendedError`
- `src/lib/tenant/context.test.ts` - 10 vitest cases covering every `<behavior>` bullet plus Host normalization and missing-Host-header edge cases

## Decisions Made
See `key-decisions` in frontmatter for full detail. Summary:
- Empirically confirmed React `cache()` does not memoize in bare vitest (no request-scoped dispatcher) before writing any assertion depending on it — resolved per the guardrails by testing the inner `resolveTenantContext()` resolver directly and documenting the limitation, rather than faking a memoization assertion on `getTenantContext`.
- Kept `getTenantContext = cache(async () => resolveTenantContext())` (not `cache(resolveTenantContext)` directly) so the plan's literal acceptance-criteria grep (`cache(async`) still matches the ARCHITECTURE.md reference shape while the resolver stays independently testable.
- `registry.ts`'s cache uses a dedicated `singleTenant` field rather than a map-based fallback, to keep "no default/first-entry fallback" structurally unambiguous.
- Orphaned `tenant_domains` rows are silently skipped rather than synthesizing a partial tenant (Rule 2 — correctness requirement implied by the fail-closed threat model; covered by an added test beyond the plan's explicit behavior list).

## Deviations from Plan

None requiring a Rule 1-4 fix. One design-freedom clarification, documented above: the plan's `<action>` text shows `cache(async () => { ... })` as an inline example; this implementation factors the body into a separately-exported `resolveTenantContext()` for direct unit-testability (the guardrails explicitly anticipated and permitted this: "test the inner async resolver directly rather than faking it"), while keeping the `cache(async ...)` literal shape at the export site so the plan's own acceptance-criteria grep still matches. No behavior difference in a real Next.js request.

## Issues Encountered
- Confirmed 4 pre-existing test failures in the full `npx vitest run` suite (`src/actions/__tests__/configurator-{fields,tier-table,update-type}.test.ts` — a `"server-only"`-import error unrelated to tenant plumbing; `src/lib/__tests__/config-fields.test.ts` — a `priceAdd` assertion mismatch in `ensureConfigJson`). Verified these are pre-existing and out of scope: each fails identically when run in isolation, the files were last touched in unrelated Phase 19 (configurator) work per `git log`, and neither this plan's new files nor 23-01/23-02/23-03's prior commits touch anything these tests import. Logged to `.planning/phases/23-tenant-plumbing-behind-compat-flag/deferred-items.md` per the Scope Boundary rule; not fixed.
- The plan's `<verification>` section calls for a manual `curl -H "Host: unknown.test"` negative smoke test against a running dev server with `TENANT_MODE=registry` and a seeded dev registry. Per `EXEC-GUARDRAILS.tmp.md`'s explicit statement that plans 23-02/23-03/23-04 "do not touch a live database" and are "pure code," this manual live smoke was NOT performed (no dev server was started, no `TENANT_MODE=registry` env was set against a live/seeded registry). The equivalent behavior is instead fully covered by the unit tests: `resolveDomain("unknown.test")` returning `null` (registry.test.ts) and `getTenantContext`/`resolveTenantContext` calling `notFound()` on an unresolved host (context.test.ts) — both green. Flagging for orchestrator follow-up once a seeded dev registry + `TENANT_MODE=registry` dev server exists (mirrors 23-01's Task 3 and 23-03's `max_connections` live-value delegation pattern).

## Next Phase Readiness
- `resolveDomain`/`warmRegistry`/`bustTenantRegistry`/`_resetForTests` and `getTenantContext`/`resolveTenantContext`/`TenantSuspendedError` are all live and fully unit-tested — Phase 23's "registered Host -> correct tenant context; unknown Host -> hard 404, never a fallback" success criterion (criterion 2) and the cache half of criterion 3 are both satisfied at the unit level.
- `src/lib/auth-helpers.ts` and `src/middleware.ts` are confirmed untouched — Phase 24 has a clean slate to wire `getTenantContext()`'s `{ tenant, db }` into the existing guard idiom (`requireAdmin`/`requireUser`) and add the `auth` member Phase 23 deliberately omitted.
- Carried-forward blocker (not introduced by this plan, same posture as 23-01/23-03): the live negative-Host `curl` smoke test and a seeded `TENANT_MODE=registry` dev registry are still open — orchestrator action, not a code gap.

---
*Phase: 23-tenant-plumbing-behind-compat-flag*
*Completed: 2026-07-13*

## Self-Check: PASSED

- FOUND: src/lib/tenant/registry.ts
- FOUND: src/lib/tenant/registry.test.ts
- FOUND: src/lib/tenant/context.ts
- FOUND: src/lib/tenant/context.test.ts
- FOUND: .planning/phases/23-tenant-plumbing-behind-compat-flag/deferred-items.md
- FOUND: 00218e5 (Task 1 RED commit)
- FOUND: 13188fc (Task 1 GREEN commit)
- FOUND: 17afa75 (Task 2 RED commit)
- FOUND: 076ba58 (Task 2 GREEN commit)
