---
phase: 23-tenant-plumbing-behind-compat-flag
verified: 2026-07-12T17:15:04Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
---

# Phase 23: Tenant Plumbing Behind Compat Flag — Verification Report

**Phase Goal:** The multi-tenant request path exists — registry, host resolution, per-tenant pools, tenant-scoped caching — while the deployed app's behavior is provably unchanged under the default `TENANT_MODE=single`.

**Verified:** 2026-07-12T17:15:04Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth (Success Criterion) | Status | Evidence |
|---|---------------------------|--------|----------|
| 1 | Zero behavior change under `TENANT_MODE=single` (default) — deployed app behaves identically to today | ✓ VERIFIED | `db/index.ts` edit is strictly additive (commit `3589516`: `@@ -44,3 +44,16 @@`, 0 deletions; existing `db`/`pool` exports byte-for-byte). `getTenantDb()` short-circuits to `singletonDb` when `TENANT_MODE !== "registry"` OR `tenant.id === "single"` — no `mysql.createPool` (pool-manager.ts:54-57). No existing route/action/guard modified: only `src/lib/tenant/*` + additive `db/index.ts` + `package.json` (mysql2 bump) changed; `src/lib/auth-helpers.ts` last touched by `d421bd9` (pre-Phase-23). `npx tsc --noEmit` clean (exit 0). |
| 2 | TEN-03 — unrecognized Host hard-fails (404/421), NEVER falls back to an existing tenant | ✓ VERIFIED | `resolveDomain()` returns `null` on any miss — `cache.map.get(normalized) ?? null`, never a first/default entry (registry.ts:113-119). `loadRegistry()` failure leaves the cache untouched — `global.__tenantRegistry` is only assigned after `loadRegistry()` resolves (registry.ts:132-133), so a bad platform-DB read fails closed. Orphaned domain rows (no matching tenant) are skipped, never synthesize a tenant (registry.ts:96-101). `resolveTenantContext()` calls `notFound()` on a null tenant and never calls `getTenantDb` (context.ts:53). Tests assert all four paths. |
| 3 | Platform DB exists with registry (full DSNs) + domains tables; in-process TTL cache + explicit bust | ✓ VERIFIED (LIVE) | Connected live through the SSH tunnel (`127.0.0.1:3307`, user `ninjaz_3dn`) to `ninjaz_platform_dev`. `SHOW TABLES` → `tenant_domains`, `tenants`. `dsn` column is `varchar(512)` (full DSN, not a db name). Live DDL matches `platform-schema.ts` + DEPLOY-NOTES byte-for-byte (column order/types, both PKs, both UNIQUE keys, LONGTEXT `settings_json`, latin1 charset). Registry empty (0 tenant rows — expected; Tenant #1 seeded in Phase 27). TTL cache = 60_000ms + `bustTenantRegistry()` explicit bust (registry.ts:30,140-142). |
| 4 | Pool manager: lazy per-tenant pools with exact `connectionLimit: 3` / `maxIdle: 1` / `idleTimeout`; `max_connections` verified + budget recorded | ✓ VERIFIED | `pool-manager.ts:72-74` uses `connectionLimit: 3, maxIdle: 1, idleTimeout: 60_000` exactly; test asserts these exact values (pool-manager.test.ts:102-114). DEPLOY-NOTES records live-measured `max_connections = 151` with corroborating live readings (`max_user_connections = 0`, `Threads_connected = 14`) — a measured reading, not a placeholder. Fleet burst-budget math (`2 × (4 + N×3)`, crossover N≈24) recorded. |
| 5 | Cache-tag helpers exist, prefix every key/tag with `t:<tenantId>:`, landed before any consumer | ✓ VERIFIED | `cache-tags.ts` `tenantTag("abc","settings") → "t:abc:settings"`, `tenantCacheKey("abc","products") → ["t:abc","products"]`, both throw on empty `tenantId`. Grep across `src/` for `cache-tags` / `tenantTag` / `tenantCacheKey` returns ZERO consumers (catalog.ts and all existing files do not import it). Tests green. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/tenant/platform-schema.ts` | Drizzle tenants + tenant_domains + `Tenant`/`ensureTenantSettings` | ✓ VERIFIED | `dsn varchar(512)`, `settingsJson` LONGTEXT, `uq_tenant_domains_domain` unique; `import "server-only"`; comment forbids adding to `db/schema.ts`. |
| `src/lib/tenant/cache-tags.ts` | `t:<tenantId>:` prefix helpers | ✓ VERIFIED | Substantive, no consumers (criterion 5). |
| `src/lib/tenant/pool-manager.ts` | Lazy per-tenant pools, single-mode short-circuit, platform singleton | ✓ VERIFIED | Exact pool values; LRU eviction past `TENANT_POOL_MAX`; `getPlatformDb()` lazy `connectionLimit: 4`. |
| `src/lib/tenant/registry.ts` | Domain→tenant TTL cache, fail-closed | ✓ VERIFIED | Sync `resolveDomain` returns null on miss; single-mode synthesis ignores Host; fail-closed on load error. |
| `src/lib/tenant/context.ts` | `getTenantContext()` React `cache()` resolver | ✓ VERIFIED | `notFound()` on unknown Host; `TenantSuspendedError` distinct from notFound; returns `{ tenant, db }` only. |
| `scripts/phase23-migrate.cjs` | Idempotent raw-SQL DDL applicator (platform DB) | ✓ VERIFIED | Tracked; targets `PLATFORM_DATABASE_URL`; INFORMATION_SCHEMA idempotency guard; live-charset probe (no hardcode); never provisions a DB. |
| `src/lib/db/index.ts` (additive edit) | `TENANT_MODE` + `getPlatformDb` re-export, existing exports untouched | ✓ VERIFIED | Git diff: 0 deletions, 13 lines appended below existing `export { pool }`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| context.ts | registry.ts | `resolveDomain` + `warmRegistry` | ✓ WIRED | Warms then resolves; null → `notFound()`. |
| context.ts | pool-manager.ts | `getTenantDb(tenant)` | ✓ WIRED | Only reached for a resolved tenant. |
| registry.ts | pool-manager.ts | `getPlatformDb()` (registry mode only) | ✓ WIRED | Never called in single mode (`TENANT_MODE !== "registry"` short-circuit). |
| db/index.ts | pool-manager.ts | `export { getPlatformDb }` re-export | ✓ WIRED | Plain function reference — stays lazy, single-mode boots without `PLATFORM_DATABASE_URL`. |
| pool-manager.ts | src/lib/db (singleton) | `getTenantDb` single-mode return | ✓ WIRED | Returns existing `db` — zero new pools in single mode. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| registry.ts | `map: Map<domain,Tenant>` | `getPlatformDb().select().from(tenants/tenantDomains)` | Live `ninjaz_platform_dev` (currently 0 rows by design; queries the real tables) | ✓ FLOWING (empty registry is intended pre-Phase-27) |
| platform-schema.ts DDL | tenants/tenant_domains | Live migration applied | Tables exist live, DDL byte-matches | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Tenant test suites | `npx vitest run src/lib/tenant/` | 4 files, 42 tests passed | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | exit 0, clean | ✓ PASS |
| Platform DB tables live | tunnel `SHOW TABLES` on `ninjaz_platform_dev` | `tenants`, `tenant_domains` | ✓ PASS |
| `dsn` full-DSN width | `SHOW CREATE TABLE tenants` | `dsn varchar(512)` | ✓ PASS |
| No cache-tags consumers | grep `src/` for helper usage | 0 matches | ✓ PASS |
| db/index.ts additive-only | `git show 3589516 -- src/lib/db/index.ts` | 0 deletions | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TEN-03 | 23-04 (ROADMAP Phase 23 Requirements) | Unrecognized domain hard-fails (404/421), never falls back to an existing tenant's data | ✓ SATISFIED | registry.ts fail-closed on miss/error/orphan; context.ts `notFound()`; 3 dedicated tests (`unknown host … TEN-03 hard-fail`, `returns null for an unregistered host — fail closed`, `does not populate a fallback tenant when the platform DB load fails`). REQUIREMENTS.md maps TEN-03 → Phase 23. |

### Anti-Patterns Found

None blocking. Single-mode `synthesizeSingleTenant()` returning one tenant for ANY Host is intentional (today's behavior; only one tenant = the deployed store, no cross-tenant surface). The TEN-03 hard-fail applies to registry mode, which is verified fail-closed. Empty `settings: {}` / empty registry map are correct initial states, not stubs (populated by real DB reads in registry mode).

### Scope Discipline

No Phase 24 scope crept in: existing `db` call sites untouched (no singleton dissolution), `cache-tags` helpers have no consumers, `context.ts` returns exactly `{ tenant, db }` (no `auth` — deferred to Phase 24), `middleware.ts` and `auth-helpers.ts` untouched (CVE-2025-29927 discipline preserved).

### Human Verification (non-blocking recommendations)

The following are OPTIONAL dev smokes — they do NOT gate the phase, as each is either structurally guaranteed or out of this phase's deployable scope by design:

1. **Single-mode storefront/admin/checkout smoke on dev.** Structurally guaranteed: the change is additive-only (0 deletions), no existing code path was modified, `tsc` is clean, and `getTenantDb` short-circuits to today's singleton in single mode. The 23-03 commit already recorded a clean `next dev` boot. A manual click-through is belt-and-suspenders, not a verification gap.
2. **Registry-mode live resolution + unknown-Host 404 on dev.** Not exercisable this phase by design — the deployed default stays `TENANT_MODE=single` and the platform registry is intentionally empty (0 rows) until the Phase 27 Tenant #1 cutover. The resolution and hard-fail LOGIC is fully covered by the registry/context unit tests with seeded data.

### Gaps Summary

None. All 5 ROADMAP success criteria verified (criterion 3 verified LIVE through the SSH tunnel), TEN-03 delivered and fail-closed on every path (miss, load error, orphan domain, unknown Host), 42/42 tenant tests green, `tsc` clean, and the multi-tenant plumbing is additive-only with a provable single-mode no-op. The React `cache()` per-request memoization is not assertable in a bare vitest harness (documented in `context.test.ts`); the resolution logic it wraps is fully unit-tested via the exported `resolveTenantContext`, and the `cache()` wrapper matches the ARCHITECTURE.md reference shape — a known, honestly-documented caveat, not a gap.

---

_Verified: 2026-07-12T17:15:04Z_
_Verifier: Claude (gsd-verifier)_
