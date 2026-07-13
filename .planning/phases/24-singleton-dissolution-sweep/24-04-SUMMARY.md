---
phase: 24-singleton-dissolution-sweep
plan: 04
subsystem: catalog
tags: [multi-tenant, cache-tags, unstable_rethrow, prerender, pitfall-8, catalog, store-settings]

# Dependency graph
requires:
  - phase: 24-singleton-dissolution-sweep
    plan: 03
    provides: "getTenantContext() returning { tenant, db, auth }"
  - phase: 23-multi-tenant-plumbing
    provides: "tenantTag/tenantCacheKey helpers (src/lib/tenant/cache-tags.ts), getTenantDb/TenantDb (pool-manager.ts), publicOrigin(tenant) (public-url.ts)"
provides:
  - "src/lib/catalog.ts read helpers resolve db internally via getTenantContext() with an optional trailing db param (D-D1); db value import dissolved"
  - "getActiveCategoryTree is a tenant-resolving function whose unstable_cache key/tags are namespaced via tenantCacheKey/tenantTag, dual-tagged (tenant + bare CATEGORY_TREE_TAG) during the wave-4->wave-5 window (W3)"
  - "src/lib/store-settings.ts cache is a Map<tenantId, {value,expiresAt}>; clearStoreSettingsCache(tenantId?) stays synchronous (W4); db value import dissolved"
  - "sitemap.ts, (store)/layout.tsx, (store)/page.tsx re-throw framework control-flow errors via unstable_rethrow before their fallback (B1)"
  - "sitemap.ts and robots.ts derive their base URL from the resolved tenant (resolveBaseUrl(tenant) -> publicOrigin(tenant) in registry mode, byte-identical env chain in single mode) (SC5/B1)"
affects: [24-05, 24-06, 24-07, 24-08, 24-09, 24-10, 24-11, 24-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-D1 optional-trailing-db pattern: shared read helpers resolve db internally (`db ??= (await getTenantContext()).db`) with an optional trailing db param, so request-caller signatures ripple zero changes while non-request callers can pass an explicit db"
    - "Dual-tag cache transition (W3): a converted cache definition carries both the new tenant-scoped tag and the still-bare legacy tag until the busting side of the codebase catches up in a later wave — prevents indefinite staleness without requiring both sides to convert atomically"
    - "unstable_rethrow-before-fallback: every catch/`.catch()` wrapping a Category-D catalog read on a prerenderable surface re-throws framework control-flow errors as its first statement, before any console.warn/empty-fallback logic"

key-files:
  created: []
  modified:
    - src/app/sitemap.ts
    - src/app/robots.ts
    - src/app/(store)/layout.tsx
    - src/app/(store)/page.tsx
    - src/lib/store-settings.ts
    - src/lib/catalog.ts

key-decisions:
  - "D-D1 (locked, applied as-is): catalog.ts's read helpers resolve db via getTenantContext() internally, with `db ??= (await getTenantContext()).db` as the first statement, rather than pure parameter-threading — preserves every existing request-caller signature (zero ripple across the tree between waves)"
  - "W3 (locked, applied as-is): getActiveCategoryTree's unstable_cache tags carry BOTH tenantTag(tenant.id, CATEGORY_TREE_TAG) and the bare CATEGORY_TREE_TAG, since the revalidateTag busting side (admin product/category mutations) isn't converted to tenantTag(...) until 24-07 and unstable_cache has no TTL"
  - "W4 (locked, applied as-is): clearStoreSettingsCache(tenantId?) stays synchronous — a no-id call does cache.clear() (byte-identical to the old `= null` in single mode); made async would create a floating-promise cache-bust class at mutation call sites (PR #39 precedent)"
  - "Task order enforced exactly per plan: Task 1 (prerender hardening) committed BEFORE Task 3 (catalog Category-D conversion) so a build-time DynamicServerError from the now-tenant-resolving catalog reads is re-thrown, not swallowed into a static/empty fallback"

requirements-completed: [TEN-02]

# Metrics
duration: ~25min
completed: 2026-07-13
---

# Phase 24 Plan 04: Catalog + Store-Settings Cache Tenant-Scoping + Prerender Hardening Summary

**Tenant-scoped `unstable_cache`/store-settings caches (Pitfall 8) plus `unstable_rethrow` hardening on the 3 storefront surfaces that catch a catalog read, landed in the plan-mandated order so build-time `DynamicServerError` from the now-tenant-aware catalog never bakes an empty sitemap/nav/featured-grid.**

## Performance

- **Duration:** ~25 min (Task 1 commit 2026-07-13, Task 2 commit 2026-07-13, Task 3 commit 2026-07-13, all sequential on `docs/milestone-multi-tenant`)
- **Completed:** 2026-07-13
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- **Task 1 (B1/SC5 — prerender hardening, ran FIRST):** `src/app/sitemap.ts`, `src/app/(store)/layout.tsx`, `src/app/(store)/page.tsx` each gained `unstable_rethrow(err)` as the first statement inside their existing catch/`.catch()` fallback — a no-op for genuine DB blips (unchanged fallback behavior), but re-throws a build-time `DynamicServerError` so Next renders the surface dynamically instead of baking a product-less sitemap / empty nav mega-menu / empty featured-products grid. `sitemap.ts` gained `export const dynamic = "force-dynamic"` and a tenant-derived `resolveBaseUrl(tenant)` (registry mode -> `publicOrigin(tenant)`; the synthesized `"single"` tenant keeps the exact old `NEXT_PUBLIC_SITE_URL ?? SITE.url` chain — no `NEXT_PUBLIC_BASE_URL` fallback introduced, preserving byte-identical single-mode output). `robots.ts` was converted from a sync to an async default export, gained `force-dynamic` and the same `resolveBaseUrl(tenant)` shape (no try/catch needed — no catalog read is wrapped there, so a build-time error propagates naturally). An audit (`rg` across `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/(store)/**`) confirmed no other prerenderable surface catches a Category-D catalog read — `bag/page.tsx`'s `.catch(() => {})` is client-side cart-sync (unrelated), and `orders/[id]/invoice.pdf/route.tsx`'s catch wraps a dynamic `import()`, not a catalog call.
- **Task 2 (Pitfall 8 + W4 — store-settings):** `src/lib/store-settings.ts`'s single-value `global.__storeSettingsCache` became `Map<tenantId, {value, expiresAt}>`, mirroring `registry.ts`'s cache shape and `pool-manager.ts`'s hot-reload guard. `getStoreSettingsCached(ctx?: { db: TenantDb; tenantId: string })` resolves `{ tenant, db }` via `getTenantContext()` first when no ctx is passed, then keys the cache lookup/write by `tenant.id`; the 60s TTL and lazy-seed-on-empty logic are preserved verbatim. `clearStoreSettingsCache(tenantId?: string): void` stays fully synchronous per W4 — `cache.delete(tenantId)` with an id, `cache.clear()` without one (byte-identical to the old `= null` in single mode, since there is exactly one entry). The `db` value import was removed; `@/lib/db/schema` remains.
- **Task 3 (D-D1 + W3 — catalog):** `src/lib/catalog.ts`'s module-scope `import { db } from "@/lib/db"` was removed. Every exported read helper (`getActiveProducts`, `searchActiveProducts`, `getActiveFeaturedProducts`, `getActiveProductBySlug`, `getActiveCategories`, `getActiveProductsByCategorySlug`, `getActiveProductsBySubcategorySlug`, `getActiveProductColourChips`, `getProductIdsByColourSlugs`) gained an optional trailing `db?: TenantDb` param resolved via `db ??= (await getTenantContext()).db` as its first statement — every existing request caller (RSC pages, `searchActiveProducts`/colour-filter call sites in `shop/page.tsx`, `getActiveProductBySlug` in `products/[slug]/page.tsx`, etc.) continues calling with the same positional args, unchanged. The internal `hydrateProducts(rows, db)` helper takes `db` as a required param, threaded from each caller's resolved value. `getActiveCategoryTree` was converted from a module-scope `unstable_cache(...)` export (which could only ever cache one tenant's tree) into an `async function` that resolves `{ tenant, db }` first, then builds a per-tenant memoized reader via `unstable_cache(() => getActiveCategoryTreeUncached(db), tenantCacheKey(tenant.id, "nav-category-tree"), { tags: [tenantTag(tenant.id, CATEGORY_TREE_TAG), CATEGORY_TREE_TAG] })()` — the dual-tag array (W3) keeps the still-bare `revalidateTag(CATEGORY_TREE_TAG)` busting sites (unconverted until 24-07) working, avoiding an indefinitely-stale nav across the wave gap.

## Task Commits

Each task was committed atomically:

1. **Task 1: Harden the 3 storefront prerender surfaces (B1) + robots.ts tenant-derived URLs (SC5)** - `daa8718` (fix)
2. **Task 2: store-settings.ts tenant-scoped cache with sync clear (Pitfall 8, W4)** - `a257516` (fix)
3. **Task 3: catalog.ts internal db resolution + tenant-scoped cache keys/tags (D-D1, W3)** - `ef5e5bf` (fix)

## Files Created/Modified

- `src/app/sitemap.ts` (modified) - `unstable_rethrow` guard, `force-dynamic`, tenant-derived `resolveBaseUrl(tenant)`
- `src/app/robots.ts` (modified) - async default export, `force-dynamic`, tenant-derived `resolveBaseUrl(tenant)` for `sitemap`/`host`
- `src/app/(store)/layout.tsx` (modified) - `unstable_rethrow` guard before the empty-nav fallback
- `src/app/(store)/page.tsx` (modified) - `unstable_rethrow` guard before the empty-featured-grid fallback
- `src/lib/store-settings.ts` (modified) - `Map<tenantId, {...}>` cache; `getStoreSettingsCached(ctx?)`; `clearStoreSettingsCache(tenantId?)` stays sync; `db` value import removed
- `src/lib/catalog.ts` (modified) - `db` value import removed; every read helper gains optional trailing `db?: TenantDb` (D-D1); `getActiveCategoryTree` converted to a tenant-resolving function with dual-tagged, tenant-scoped `unstable_cache` (W3)

## Decisions Made

- Task order enforced exactly per plan: Task 1 (prerender hardening) landed and was committed BEFORE Task 3 (catalog conversion), so `unstable_rethrow` was already in place on all 3 catch sites before any Category-D read could throw `DynamicServerError` at build time.
- `resolveBaseUrl(tenant)` in both `sitemap.ts` and `robots.ts` deliberately does NOT delegate to `publicOrigin`'s full fallback chain (which also checks `NEXT_PUBLIC_BASE_URL`) when the tenant is `"single"` — it keeps the exact prior literal chain (`NEXT_PUBLIC_SITE_URL ?? SITE.url` for sitemap, `SITE.url` for robots) so single-mode output is byte-identical, only calling `publicOrigin(tenant)` for an actual non-`"single"` registry-mode tenant.
- `getProductIdsByColourSlugs` keeps its `slugs.length === 0` early return BEFORE resolving `db` (unchanged from the original), avoiding an unnecessary `getTenantContext()`/`headers()` call on the common empty-filter path.

## Deviations from Plan

None — plan executed exactly as written, task order preserved, all `<action>` code shapes applied essentially verbatim (D-D1 optional-db pattern, W3 dual-tag, W4 sync clear).

## Issues Encountered

- One `Edit` tool call against `src/app/robots.ts` failed on an exact-string match (likely an invisible whitespace/em-dash mismatch in the original file's comment block copied into `old_string`). Resolved by using `Write` to replace the full file content instead — the resulting file was verified against the plan's required shape via the acceptance-criteria `rg` checks and a full `npx tsc --noEmit` pass. No functional impact.

## User Setup Required

None. `TENANT_MODE` stays unset/`single` in every deployed environment; `resolveDomain()` synthesizes the `"single"` tenant for every request, so `getTenantContext().tenant.id === "single"` everywhere — both the store-settings and catalog caches collapse to exactly one keyed entry, and `resolveBaseUrl(tenant)` in sitemap/robots falls through to the unchanged env-driven chain.

## Next Phase Readiness

- Both Pitfall-8 cache sites (`store-settings.ts`, `catalog.ts`'s nav cache) are now tenant-scoped by construction; the two-tenant cold-start cross-cache-read test is deferred to 24-12 per the plan's `<verification>` section.
- The nav cache's bare `CATEGORY_TREE_TAG` busting sites (admin product/category mutation `revalidateTag` calls) remain unconverted — scheduled for 24-07, which must also convert `store-settings.ts`'s mutation call sites (`admin-settings.ts`, `admin-store-settings-bank.ts`) to pass `tenant.id` explicitly to `clearStoreSettingsCache`.
- Build-time sitemap/nav prerender-safety (sitemap.xml contains product URLs; `/about` renders the full nav mega-menu) is proven later in 24-11 per the plan's `<verification>` section.

## Verification

- `npx tsc --noEmit | grep -v '^\.next/'` — **clean (0 lines of output)**, run after each of the 3 tasks and once more as a final full-repo gate after all 3 commits landed.
- `rg "unstable_rethrow" src/app/sitemap.ts "src/app/(store)/layout.tsx" "src/app/(store)/page.tsx"` — matched in all three.
- `rg "export const dynamic" src/app/sitemap.ts` — matched (`force-dynamic`).
- `rg "resolveBaseUrl\(tenant\)|publicOrigin\(tenant\)" src/app/sitemap.ts` and same against `src/app/robots.ts` — both matched.
- `rg "Map<string" src/lib/store-settings.ts` — matched (per-tenant map, 2 occurrences: type + init).
- `rg "getTenantContext" src/lib/store-settings.ts` — matched.
- `rg "export function clearStoreSettingsCache\(tenantId\?: string\): void" src/lib/store-settings.ts` — matched exactly.
- `rg "async function clearStoreSettingsCache|clearStoreSettingsCache = async" src/lib/store-settings.ts` — 0 matches (clear did NOT become async).
- `rg "from \"@/lib/db\";" src/lib/store-settings.ts` and same against `src/lib/catalog.ts` — 0 matches in both (db value import gone from both files; `@/lib/db/schema` retained).
- `rg "tenantCacheKey|tenantTag" src/lib/catalog.ts` — matched (import + 2 call sites).
- `rg "tags: \[tenantTag\(tenant.id, CATEGORY_TREE_TAG\), CATEGORY_TREE_TAG\]" src/lib/catalog.ts` — matched exactly (W3 dual-tag).
- `rg "^export const \w+ = unstable_cache" src/lib/catalog.ts` — 0 matches (no module-scope `unstable_cache` export remains).
- `git diff --diff-filter=D --name-only HEAD~1 HEAD` (checked after each of the 3 task commits) — empty every time, no accidental deletions.

**Proof (a) — prerender hardening precedes catalog conversion:** `git log --oneline` shows `daa8718` (Task 1, prerender surfaces) committed strictly before `ef5e5bf` (Task 3, catalog conversion), with `a257516` (Task 2, store-settings) in between — matching the plan's mandated task order exactly. `unstable_rethrow` was live on all 3 catch sites for the entire duration that catalog.ts's read helpers were converted to resolve `db` via `getTenantContext()`.

**Proof (b) — caches are tenant-scoped with single-mode byte-identical behavior:** `src/lib/store-settings.ts`'s cache is `Map<string, {value, expiresAt}>` keyed by `tenant.id`; `src/lib/catalog.ts`'s `getActiveCategoryTree` cache key is `tenantCacheKey(tenant.id, "nav-category-tree")` -> `["t:<id>", "nav-category-tree"]`. Since `resolveDomain()` (`src/lib/tenant/registry.ts`) synthesizes exactly one tenant with `id: "single"` for every request under the deployed `TENANT_MODE` (unset/`single`), both maps collapse to exactly one key (`"single"`) — identical to the pre-plan single-value cache and single-key `unstable_cache` entry.

**Proof (c) — clearStoreSettingsCache stays sync:** `export function clearStoreSettingsCache(tenantId?: string): void { if (tenantId) { cache.delete(tenantId); } else { cache.clear(); } }` — no `async` keyword, no `await` inside the function body, confirmed by the `rg "async function clearStoreSettingsCache|clearStoreSettingsCache = async"` zero-match check above.

## Self-Check: PASSED

- `src/app/sitemap.ts` — FOUND (modified, contains `unstable_rethrow`, `force-dynamic`, `resolveBaseUrl(tenant)`)
- `src/app/robots.ts` — FOUND (modified, async, `force-dynamic`, `resolveBaseUrl(tenant)`)
- `src/app/(store)/layout.tsx` — FOUND (modified, contains `unstable_rethrow`)
- `src/app/(store)/page.tsx` — FOUND (modified, contains `unstable_rethrow`)
- `src/lib/store-settings.ts` — FOUND (modified, `Map<string`, sync `clearStoreSettingsCache(tenantId?: string): void`)
- `src/lib/catalog.ts` — FOUND (modified, `tenantTag`/`tenantCacheKey`, no `@/lib/db` value import)
- Commit `daa8718` — FOUND in `git log --oneline`
- Commit `a257516` — FOUND in `git log --oneline`
- Commit `ef5e5bf` — FOUND in `git log --oneline`

---
*Phase: 24-singleton-dissolution-sweep*
*Completed: 2026-07-13*
