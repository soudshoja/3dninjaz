---
phase: 23-tenant-plumbing-behind-compat-flag
plan: 02
subsystem: infra
tags: [multi-tenant, caching, unstable_cache, revalidateTag, vitest, tdd]

# Dependency graph
requires:
  - phase: 23-tenant-plumbing-behind-compat-flag
    provides: (none — standalone utility, no plan dependency)
provides:
  - "tenantTag(tenantId, tag) -> t:<tenantId>:<tag> cache-tag namespacing helper"
  - "tenantCacheKey(tenantId, ...parts) -> [t:<tenantId>, ...parts] unstable_cache keyParts helper"
affects: [24-singleton-sweep]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tenant cache-tag namespacing: t:<tenantId>:<tag> — mandatory prefix, no bare-tag code path exists"

key-files:
  created: [src/lib/tenant/cache-tags.ts, src/lib/tenant/cache-tags.test.ts]
  modified: []

key-decisions:
  - "Helpers throw on empty tenantId rather than silently producing an unprefixed key — an empty prefix would collapse all tenants into one shared cache namespace"
  - "No import \"server-only\" — these are pure string helpers safe in either client or server bundle"
  - "No mode branch inside the helpers — single-mode's synthesized tenant carries a real id (e.g. \"single\"), so tag/key format is byte-identical between single and registry modes, preventing a stale-cache fork at cutover"

patterns-established:
  - "Tenant cache-tag namespacing: every unstable_cache tag/key MUST flow through tenantTag/tenantCacheKey — landed before any consumer so partial prefixing is structurally impossible"

requirements-completed: [TEN-03]

# Metrics
duration: 3min
completed: 2026-07-13
---

# Phase 23 Plan 02: Tenant-Aware Cache-Tag Helpers Summary

**Standalone `tenantTag`/`tenantCacheKey` pure-function helpers that force every future `unstable_cache`/`revalidateTag` tag or key through a mandatory `t:<tenantId>:` prefix, shipped with zero existing consumers.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-13T00:36:00Z
- **Completed:** 2026-07-13T00:37:30Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2 (both new)

## Accomplishments
- `tenantTag(tenantId, tag)` produces `t:<tenantId>:<tag>`, throwing on empty `tenantId`
- `tenantCacheKey(tenantId, ...parts)` produces `["t:<tenantId>", ...parts]` (including the no-parts case: `["t:<tenantId>"]`), throwing on empty `tenantId`
- 8 co-located vitest cases cover the full behavior list from the plan (basic prefixing, an existing repo tag name, per-tenant divergence, single-mode real-id parity, and empty-tenantId rejection for both functions)
- No existing call site touched — `src/lib/catalog.ts` (the repo's only current `unstable_cache`/`revalidateTag` user) is untouched; migration is explicitly deferred to Phase 24's singleton sweep

## Task Commits

TDD RED/GREEN cycle, both scoped to Task 1 (single task in this plan):

1. **Task 1 RED: failing tests for tenantTag/tenantCacheKey** - `73ba5f9` (test)
2. **Task 1 GREEN: implement tenantTag/tenantCacheKey** - `8321a68` (feat)

No REFACTOR commit — implementation was already minimal after GREEN; no cleanup needed.

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `src/lib/tenant/cache-tags.ts` - `tenantTag()` and `tenantCacheKey()` pure-function helpers, with the "landed before any consumer" rationale comment
- `src/lib/tenant/cache-tags.test.ts` - 8 vitest cases (2 describe blocks: `tenantTag`, `tenantCacheKey`)

## Decisions Made
- Helpers throw (rather than defaulting to an empty-string prefix) on empty `tenantId` — matches threat T-23-02-02 (spoofing via blank tenantId collapsing the cache namespace)
- No mode branching inside the helpers themselves — single-mode's synthesized tenant must carry a real id so the key format never forks between `TENANT_MODE=single` and registry mode (threat T-23-02-03)
- Omitted `import "server-only"` per the plan's explicit note — these are pure string functions with no DSN/pool access, safe in either bundle

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `tenantTag`/`tenantCacheKey` are ready for Phase 24 to wire into `src/lib/catalog.ts`'s `CATEGORY_TREE_TAG` and its ~9 `revalidateTag` call sites, plus the planned ESLint ban on direct `revalidateTag`/`unstable_cache` usage (PITFALLS.md Pitfall 8)
- No blockers. This plan has no runtime side effects and no live-DB dependency.

---
*Phase: 23-tenant-plumbing-behind-compat-flag*
*Completed: 2026-07-13*

## Self-Check: PASSED

- FOUND: src/lib/tenant/cache-tags.ts
- FOUND: src/lib/tenant/cache-tags.test.ts
- FOUND: 73ba5f9 (test commit)
- FOUND: 8321a68 (feat commit)
