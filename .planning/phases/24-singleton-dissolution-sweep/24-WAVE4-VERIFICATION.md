---
phase: 24-singleton-dissolution-sweep
wave: 4
plans: [24-04, 24-05, 24-13]
verified: 2026-07-13T00:00:00Z
status: passed
score: 20/20 must-haves verified
overrides_applied: 0
git_range: daa8718^..6826faf
commits_verified:
  - daa8718  # 24-04 Task 1 — prerender harden (sitemap/robots/layout/page)
  - a257516  # 24-04 Task 2 — store-settings tenant-scoped cache, sync clear
  - ef5e5bf  # 24-04 Task 3 — catalog db dissolution + dual-tag nav cache
  - 0a3fe17  # 24-05 Task 1 — 7 catalog/product-config read helpers
  - b5e6be7  # 24-05 Task 2 — 8 order/email/pdf/whatsapp/meshy libs + W6 + W5
  - 6826faf  # 24-13 — 3 auth-gating RSC surfaces
deferred:
  - truth: "Build-time prerender proof (sitemap.xml carries product URLs; /about renders the full nav mega-menu at build)"
    addressed_in: "Plan 24-11"
    evidence: "24-04 PLAN <verification>: 'Build-time prerender is proven later in 24-11'"
  - truth: "Two-tenant cold-start cross-cache non-bleed runtime proof (store-settings + whatsapp + catalog nav)"
    addressed_in: "Plan 24-12"
    evidence: "24-04/24-05 PLAN <verification>: cross-tenant cache test deferred to 24-12 (W7 battery)"
  - truth: "Full realization of 'only the resolver layer imports the @/lib/auth value' (account.ts, account-close.ts, admin-profile.ts still import it)"
    addressed_in: "Plans 24-07 / 24-08"
    evidence: "24-13 PLAN objective: those files are swept in 24-08 (account/account-close) and 24-07 (admin-profile); 24-13 scope is only the 3 auth-gating RSC surfaces"
---

# Phase 24 Wave 4 Verification Report

**Wave Goal:** First consumer-conversion wave — dissolve the `db`/`auth` singletons from the two Pitfall-8 cache-bearing shared libs (catalog, store-settings), the 15 remaining Category-D shared libs (incl. the second Pitfall-8 cache in whatsapp/settings), and the 3 auth-gating RSC surfaces; harden the storefront prerender surfaces so the sweep does not silently bake an empty sitemap/nav at build. All changes must be byte-identical in the live single-tenant mode.

**Verified:** 2026-07-13
**Status:** passed
**Re-verification:** No — initial verification
**Method:** Static read of the committed working tree (HEAD == 6826faf, clean tree for `src/`), plus `npx tsc --noEmit` (exit 0, `^\.next/` filtered).

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | 3 prerender surfaces re-throw framework errors via `unstable_rethrow` BEFORE their fallback | ✓ VERIFIED | `unstable_rethrow(err)` is the FIRST statement in each catch/`.catch()`: sitemap.ts:123, (store)/layout.tsx:32, (store)/page.tsx:29 — before every `console.warn`/empty fallback |
| 2  | Prerender hardening PRECEDES catalog conversion | ✓ VERIFIED | Commit order in range: daa8718 (harden) → a257516 (store-settings) → ef5e5bf (catalog). `unstable_rethrow` was live before any Category-D read could throw `DynamicServerError` |
| 3  | sitemap.ts is `force-dynamic`; robots.ts is `force-dynamic` + async | ✓ VERIFIED | sitemap.ts:36 `export const dynamic = "force-dynamic"`; robots.ts:37 same + `export default async function robots()` |
| 4  | sitemap + robots base URLs are tenant-derived (`resolveBaseUrl(tenant)`→`publicOrigin(tenant)`), byte-identical in single mode | ✓ VERIFIED | Both files: `resolveBaseUrl(tenant)` returns `publicOrigin(tenant)` only when `tenant.id !== "single"`, else the exact prior env/`SITE.url` chain. Never reads Host |
| 5  | catalog.ts read helpers resolve db internally via optional trailing `db?: TenantDb`; no `@/lib/db` value import | ✓ VERIFIED | catalog.ts:22-23 imports getTenantContext+TenantDb only; 9 exported helpers each `db ??= (await getTenantContext()).db`; only `@/lib/db/schema` imported |
| 6  | catalog nav cache key/tags tenant-scoped via `tenantCacheKey`/`tenantTag` | ✓ VERIFIED | catalog.ts:507-514 `getActiveCategoryTree` resolves tenant, builds per-tenant `unstable_cache(fn, tenantCacheKey(tenant.id,"nav-category-tree"), {...})`; no module-scope `unstable_cache` export remains |
| 7  | catalog nav cache DUAL-tags (tenant tag AND bare `CATEGORY_TREE_TAG`) | ✓ VERIFIED | catalog.ts:512 `tags: [tenantTag(tenant.id, CATEGORY_TREE_TAG), CATEGORY_TREE_TAG]`. 14 bare `revalidateTag(CATEGORY_TREE_TAG)` busting sites still live (categories.ts, products.ts) — dual-tag is load-bearing, not decorative |
| 8  | store-settings cache is `Map<tenantId,{value,expiresAt}>` keyed by tenant.id | ✓ VERIFIED | store-settings.ts:30-36 Map declaration + init; :69/:98 `cache.get(tenantId)`/`cache.set(tenantId,...)` |
| 9  | `clearStoreSettingsCache(tenantId?)` stays SYNC void | ✓ VERIFIED | store-settings.ts:119 `export function clearStoreSettingsCache(tenantId?: string): void`; no `async`/`await` in body; alias `invalidateStoreSettingsCache` still sync |
| 10 | whatsapp/settings.ts global cache → per-tenant `Map<tenantId,...>` | ✓ VERIFIED | settings.ts:28-34 Map declaration + init; keyed by `tenant.id` at :54/:80 (mirrors store-settings exactly) |
| 11 | `clearWhatsappSettingsCache(tenantId?)` stays SYNC void; writers pass tenant.id | ✓ VERIFIED | settings.ts:90 sync void signature; writers `updateWhatsappConnectionState`/`setNotificationsEnabled` call `clearWhatsappSettingsCache(tenant.id)` (:155, :166) |
| 12 | All 15 remaining Category-D libs resolve db via getTenantContext, no `@/lib/db` value import | ✓ VERIFIED | All 15 files: 0 bare `@/lib/db` imports (schema-only), all import+use getTenantContext, all have live `db ??=` resolution (per-file db-resolve counts non-zero) |
| 13 | keychain/vending/meshy keep OPTIONAL trailing `db?` (not unconditional) | ✓ VERIFIED | `seedKeychainFields(...,db?: TenantDb)` :33-38, `seedVendingFields(...,db?)` :24-29, meshy `getGenerationRow(id,db?)`:60 + `advanceGeneration(id,db?)`:155 — each `db ??= (await getTenantContext()).db` (short-circuits when caller passes db; no off-request `headers()`) |
| 14 | email/templates.ts renders tenant store_url via `publicOrigin(tenant)` per-render | ✓ VERIFIED | templates.ts:33-39 `baseTemplateVars(tenant)` returns `store_url: publicOrigin(tenant)`; called fresh inside `renderTemplate` (:280) after resolving tenant. No module-level template cache exists (getOrSeed reads per-render) |
| 15 | email/order-confirmation.ts derives order/admin links from tenant (`baseUrl(tenant)`), env fallback single mode, never Host | ✓ VERIFIED | order-confirmation.ts:41-50 `baseUrl(tenant)` uses `publicOrigin(tenant)` only in registry+non-single, else exact prior env chain; threaded into every link + `sendMail({...,tenant})` |
| 16 | `publicOrigin`/`baseUrl`/`resolveBaseUrl` never derive from the request Host | ✓ VERIFIED | public-url.ts:17-26 — registry branch uses `tenant.primaryDomain`; single/no-tenant uses `NEXT_PUBLIC_SITE_URL ?? NEXT_PUBLIC_BASE_URL ?? SITE.url`. No `headers()`/Host read anywhere in the URL path |
| 17 | 3 auth-gating RSC surfaces resolve auth via `getTenantContext()`; none imports `@/lib/auth` | ✓ VERIFIED | login/page.tsx:36, register/page.tsx:9, (admin)/layout.tsx:70 each `const { auth } = await getTenantContext();`; 0 `@/lib/auth` imports in the 3 files |
| 18 | Auth session/redirect logic byte-identical (only the auth SOURCE changed) | ✓ VERIFIED | Each still calls `auth.api.getSession({ headers: await headers() })`; isSafeNext/`?next=`/`?tab=`/role branches (login), role redirect (register), unauth→/login+non-admin→/account+badge try/catch (admin) all intact |
| 19 | Single-mode collapse is real & byte-identical (tenant.id === "single" ⇒ one cache key, same URLs, same transport) | ✓ VERIFIED | registry.ts synthesizes `{id:"single", settings:{}}`; every cache keys on "single" (one entry === old single value); every URL/base guard falls to the prior env chain; mailer short-circuits (see #20) |
| 20 | Threading the "single" tenant into `sendMail` (24-05 Rule-2 auto-fix) is byte-identical on the live order path | ✓ VERIFIED | mailer-cache.ts:88/:108 — `getTenantMailer`/`getTenantMailFrom` return the exact `getMailer()`/`MAIL_FROM` when `TENANT_MODE !== "registry" OR tenant.id === "single"`. No new transport, no From change in single mode |

**Score:** 20/20 truths verified

### Deferred Items

Items not proven at this wave but explicitly scoped into later plans of the same milestone (Step 9b). These do NOT affect status.

| # | Item | Addressed In | Evidence |
| - | ---- | ------------ | -------- |
| 1 | Build-time prerender proof: sitemap.xml carries product URLs; /about renders the full nav mega-menu | Plan 24-11 | 24-04 PLAN `<verification>`: "Build-time prerender is proven later in 24-11" |
| 2 | Two-tenant cold-start cross-cache non-bleed runtime proof (store-settings + whatsapp + catalog nav) | Plan 24-12 | 24-04/24-05 PLAN: cross-tenant cache test deferred to 24-12 (W7 battery) |
| 3 | Full "only the resolver imports the `@/lib/auth` value" state (account.ts / account-close.ts / admin-profile.ts still import it) | Plans 24-07 / 24-08 | 24-13 objective: those files are swept in 24-07/24-08; 24-13 scope is only the 3 auth-gating RSC surfaces |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/app/sitemap.ts` | force-dynamic + unstable_rethrow + tenant base URL | ✓ VERIFIED | All present; catch re-throws before static-only fallback |
| `src/app/robots.ts` | async + force-dynamic + tenant base URL | ✓ VERIFIED | `sitemap:`/`host:` both from `resolveBaseUrl(tenant)` |
| `src/app/(store)/layout.tsx` | unstable_rethrow before empty-nav fallback | ✓ VERIFIED | :32 |
| `src/app/(store)/page.tsx` | unstable_rethrow before empty featured grid | ✓ VERIFIED | :29 |
| `src/lib/store-settings.ts` | Map<tenantId>; sync clear(tenantId?) | ✓ VERIFIED | db value import removed; schema retained |
| `src/lib/catalog.ts` | optional-db helpers; tenant-scoped dual-tagged nav cache | ✓ VERIFIED | 9 helpers converted; db value import removed |
| `src/lib/whatsapp/settings.ts` | Map<tenantId>; sync clear(tenantId?) | ✓ VERIFIED | 6 exported fns D-D1'd; writers pass tenant.id |
| `src/lib/email/templates.ts` | store_url = publicOrigin(tenant) per-render | ✓ VERIFIED | BASE_TEMPLATE_VARS const → baseTemplateVars(tenant) fn |
| `src/lib/email/order-confirmation.ts` | baseUrl(tenant) + sendMail tenant | ✓ VERIFIED | Links + both sendMail calls tenant-threaded |
| `src/lib/keychain-fields.ts` / `vending-fields.ts` / `meshy/pipeline.ts` | OPTIONAL trailing db? | ✓ VERIFIED | `db?: TenantDb` on all B4 entrypoints |
| 12 other Category-D libs | no @/lib/db value import; getTenantContext resolution | ✓ VERIFIED | variants, colours, configurable-product-data, shipping-config, delyva-filter, order-dedupe, checkout-drafts, accounting, pdf/render-invoice all clean |
| `src/app/(auth)/login/page.tsx` / `register/page.tsx` / `(admin)/layout.tsx` | auth via getTenantContext | ✓ VERIFIED | No @/lib/auth import; gate + redirects preserved |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| (store)/layout.tsx | unstable_rethrow(err) | rethrow before empty-nav fallback | ✓ WIRED | First statement in catch |
| store-settings.ts | getTenantContext().tenant.id | cache key = tenant id | ✓ WIRED | :65/:69/:98 |
| catalog.ts | tenantCacheKey/tenantTag | Phase 23 cache-tags helper | ✓ WIRED | :24 import, :511-512 usage |
| whatsapp/settings.ts | getTenantContext().tenant.id | per-tenant Map key | ✓ WIRED | :50/:54/:80 |
| order-confirmation.ts | publicOrigin(tenant) + sendMail(tenant) | tenant-derived links + per-tenant mailer | ✓ WIRED | :42 URL, :360/:390 sendMail |
| 3 auth surfaces | getTenantContext().auth | per-request auth before getSession | ✓ WIRED | Resolved immediately before getSession in each |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Whole repo typechecks after the wave | `npx tsc --noEmit` (filter `^\.next/`) | exit 0, no output | ✓ PASS |
| No bare `@/lib/db` value import across all 17 Category-D libs | grep (schema/index excluded) | 0 matches | ✓ PASS |
| Cache clears are not async | grep async signatures | 0 matches | ✓ PASS |
| No `@/lib/auth` import in the 3 auth surfaces | grep | 0 matches | ✓ PASS |
| Bare busting sites still live (dual-tag justified) | grep `revalidateTag(CATEGORY_TREE_TAG)` | 14 sites in actions/{categories,products}.ts | ✓ PASS |
| Build-time prerender output | `next build` | not run — deferred to 24-11 | ? SKIP (deferred) |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| TEN-02 | 24-04, 24-05, 24-13 | Requests resolve to the correct tenant by domain, with no cross-tenant data ever returned | ✓ SATISFIED (by construction) | All three Pitfall-8 caches keyed by tenant.id; catalog nav cache KEY tenant-scoped (bare tag can only over-invalidate, never cross-read); auth resolved per-request via tenant context. Runtime 2-tenant proof deferred to 24-12 |

### Data-Flow Trace (Level 4)

Not applicable to this wave's artifacts. All modified files are server-side shared libs / metadata routes / auth gates — no dynamic-data-rendering React components were added or changed. The data these libs feed (nav tree, settings, emails) is exercised by the deferred 24-11 (prerender) and 24-12 (cache non-bleed) proofs.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None blocking | — | No stubs, TODOs, empty returns, or hardcoded-empty data introduced. The `catch → static-routes` / `catch → []` fallbacks in the prerender surfaces are intentional resilience paths, now correctly guarded by `unstable_rethrow` so they never swallow a framework `DynamicServerError` |

Notes checked and cleared:
- `whatsapp/settings.ts` `getWhatsappSettingsCached(db?)` always calls `getTenantContext()` even when `db` is passed (needs `tenant.id` for the key). Intentional per plan; no non-request callers exist today; `getTenantContext` is React.cache-memoized. Not a leak, not a single-mode change.
- `email/order-confirmation.ts` keeps a legacy hardcoded-template fallback on DB-template render failure. Pre-existing (Plan 05-06), intentional, tenant-threaded. Not a stub.
- store-settings/whatsapp hot-reload guard writes `global.__x` only in non-production; production uses the module-local `const cache`. Matches pool-manager pattern; process-singleton in prod; the getter and the clear close over the SAME Map instance. No inconsistency.

### Human Verification Required

None. Every Wave-4-scoped behavior (tenant-scoped cache keying, sync clears, dual-tag, optional-db resolution, prerender `unstable_rethrow` guards, tenant-derived outbound URLs, auth-source swap, single-mode byte-identity) is statically verifiable and was confirmed against the committed code + a clean `tsc`. The remaining runtime/build proofs are explicitly scoped into later automated verification plans (24-11 prerender, 24-12 two-tenant cache) — see Deferred Items.

### Gaps Summary

No gaps. No BLOCKERs. No change to live single-mode behavior and no cross-tenant bleed found.

The two highest-risk live paths for this consumer-conversion wave were traced end-to-end and cleared:

1. **Order-confirmation email (fires on every paid order).** The 24-05 Rule-2 auto-fix threads the resolved tenant into `sendMail`. In single mode the synthesized `"single"` tenant makes `mailer-cache.getTenantMailer/getTenantMailFrom` return the identical `getMailer()` transport and `MAIL_FROM` constant — byte-identical sender. Order/admin link base URLs stay on the exact prior env chain (never Host).

2. **Storefront prerender (sitemap + nav).** `unstable_rethrow` landed (commit daa8718) strictly BEFORE catalog began resolving `db` via `headers()` (commit ef5e5bf), so a build-time `DynamicServerError` is re-thrown into dynamic rendering rather than baked into a product-less sitemap / empty nav. Genuine DB blips (non-framework errors) still fall through to the resilience fallback unchanged.

All three Pitfall-8 caches (store-settings, catalog nav, whatsapp/settings) are tenant-scoped by construction: the cache KEY carries `tenant.id`, so even the transitional bare `CATEGORY_TREE_TAG` can only over-invalidate (a cache miss) in registry mode, never cross-read. In single mode there is exactly one key (`"single"`), collapsing every cache to its pre-sweep single-value behavior.

---

_Verified: 2026-07-13_
_Verifier: Claude (gsd-verifier)_
