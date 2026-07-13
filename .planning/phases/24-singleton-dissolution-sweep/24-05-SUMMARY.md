---
phase: 24-singleton-dissolution-sweep
plan: 05
subsystem: database
tags: [multi-tenant, pitfall-8, tenant-context, d-d1, whatsapp, email-templates, meshy, accounting, order-dedupe]

# Dependency graph
requires:
  - phase: 24-singleton-dissolution-sweep
    plan: 03
    provides: "getTenantContext() returning { tenant, db, auth }"
  - phase: 24-singleton-dissolution-sweep
    plan: 04
    provides: "D-D1 optional-trailing-db pattern precedent (catalog.ts); store-settings.ts per-tenant Map + sync clear precedent (W4) mirrored here for whatsapp/settings.ts (W6)"
provides:
  - "15 remaining Category D shared libs resolve db via getTenantContext() internally, optional trailing db param (D-D1); db value import dissolved from all 15"
  - "whatsapp/settings.ts's global.__whatsappSettingsCache converted to a per-tenant Map<tenantId, {value, expiresAt}> with a SYNC clearWhatsappSettingsCache(tenantId?) — mirrors 24-04 store-settings exactly (W6)"
  - "email/templates.ts renders the TENANT's store_url via publicOrigin(tenant), resolved per-render (was a static module-scope const) (W5)"
  - "email/order-confirmation.ts's baseUrl(tenant?) threads the tenant into every order-link/admin-link, and into sendMail()'s tenant param for per-tenant mailer routing (SC5/B1)"
  - "meshy/pipeline.ts's advanceGeneration/getGenerationRow keep an OPTIONAL trailing db param so the non-request meshy cron (24-10) can pass an explicit db without an off-request headers() throw (B4/Pitfall 10)"
  - "keychain-fields.ts/vending-fields.ts's seedKeychainFields/seedVendingFields keep an OPTIONAL trailing db param for the same reason (B4)"
affects: [24-06, 24-07, 24-08, 24-09, 24-10, 24-11, 24-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-D1 optional-trailing-db (applied to all 15 files): `db ??= (await getTenantContext()).db;` as the first statement of every exported read/write helper; internal module-private helper functions thread db as a REQUIRED positional param since they are only ever called from the already-resolved public entrypoint"
    - "W6 per-tenant cache with sync clear (whatsapp/settings.ts): identical shape to 24-04's store-settings.ts — `Map<tenantId, {value, expiresAt}>` + `clearXCache(tenantId?: string): void` staying synchronous"
    - "Per-render tenant-derived template vars (email/templates.ts): replaced a static module-scope `BASE_TEMPLATE_VARS` const with a `baseTemplateVars(tenant)` function so store_url reflects the resolved tenant, not a value frozen at module load"
    - "resolveBaseUrl-style tenant threading (email/order-confirmation.ts): `baseUrl(tenant?)` only delegates to `publicOrigin(tenant)` in actual registry mode with a non-'single' tenant, otherwise keeps the exact prior env chain — byte-identical single-mode output, same pattern as 24-04's sitemap.ts/robots.ts"

key-files:
  created: []
  modified:
    - src/lib/variants.ts
    - src/lib/colours.ts
    - src/lib/configurable-product-data.ts
    - src/lib/keychain-fields.ts
    - src/lib/vending-fields.ts
    - src/lib/shipping-config.ts
    - src/lib/delyva-filter.ts
    - src/lib/order-dedupe.ts
    - src/lib/checkout-drafts.ts
    - src/lib/accounting.ts
    - src/lib/email/templates.ts
    - src/lib/email/order-confirmation.ts
    - src/lib/pdf/render-invoice.tsx
    - src/lib/whatsapp/settings.ts
    - src/lib/meshy/pipeline.ts

key-decisions:
  - "D-D1 (locked, applied as-is to all 15 files): every exported Category-D helper resolves db internally via `db ??= (await getTenantContext()).db` rather than pure parameter-threading — zero ripple to existing request callers (all verified via grep: every current call site passes no db arg)"
  - "meshy/pipeline.ts internal state machine (advanceGenerating/Revising/Analyzing/Repairing/Multicolor, refetch, latestRevision) threads db as a REQUIRED param rather than optional — these are module-private (not exported) and only ever called from advanceGeneration's already-resolved db, so no headers()-off-request risk exists for them; only the exported advanceGeneration/getGenerationRow needed the optional-db D-D1 shape for the 24-10 cron"
  - "whatsapp/settings.ts's getWhatsappSettingsCached(db?) always resolves { tenant, db } via getTenantContext() even when a db arg is passed, because the cache key needs tenant.id regardless — unlike store-settings.ts's ctx-object shape, there are currently zero non-request callers of any whatsapp/settings.ts export (verified via grep across src/ and scripts/), so this simpler shape is safe for now"
  - "email/order-confirmation.ts: sendMail() calls now pass the resolved tenant (mailer.ts's existing optional tenant? param, added in 24-01) so both the customer receipt and the admin new-order notification route through the tenant mailer, not just the URLs inside them — Rule 2 (missing critical functionality) since the module already resolves tenant for baseUrl() and mailer.ts already supports it; byte-identical in single mode per mailer.ts's own documented short-circuit"

requirements-completed: [TEN-02]

# Metrics
duration: ~35min
completed: 2026-07-13
---

# Phase 24 Plan 05: Wave 4 — 15 Category-D Shared Read Helpers + WhatsApp/Email Tenant-Scoping Summary

**All 15 remaining Category-D shared libs (catalog-adjacent read helpers, order/accounting/email/pdf/whatsapp/meshy) resolve `db` via `getTenantContext()` internally with the D-D1 optional-trailing-db shape; `whatsapp/settings.ts`'s process-global cache is now a per-tenant `Map` with a sync clear (mirroring 24-04's store-settings.ts), and `email/templates.ts` + `email/order-confirmation.ts` derive customer-facing URLs from the resolved tenant instead of a static env-only constant.**

## Performance

- **Duration:** ~35 min (Task 1 commit, Task 2 commit, both sequential on `docs/milestone-multi-tenant`)
- **Completed:** 2026-07-13
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

- **Task 1 (7 catalog-adjacent + product-config read helpers):** `variants.ts`, `colours.ts`, `configurable-product-data.ts`, `keychain-fields.ts`, `vending-fields.ts`, `shipping-config.ts`, `delyva-filter.ts` each had their module-scope `import { db } from "@/lib/db"` removed and every exported function gained an optional trailing `db?: TenantDb` resolved via `db ??= (await getTenantContext()).db`. `keychain-fields.ts`'s `seedKeychainFields` and `vending-fields.ts`'s `seedVendingFields` specifically kept the OPTIONAL shape (not unconditional resolution) so the 24-10 non-request migration/seed scripts can pass an explicit db later. No module-level mutable caches were found in any of the 7 (Pitfall-8 audit clean).
- **Task 2 (8 order/accounting/email/pdf/whatsapp/meshy libs + W6 + W5):**
  - `order-dedupe.ts`, `checkout-drafts.ts`: D-D1 trailing optional `db?: TenantDb` appended after the existing single-object-destructure param.
  - `accounting.ts`: `getAccountingSummary`, `getSalesReport`, `getAccountBalances` gained optional trailing db; the private helpers `getMarkupConfig`, `fetchOrderFinancials`, `sumExpenses` thread db as a required param (module-private, only called from the three public entrypoints).
  - `pdf/render-invoice.tsx`: `renderInvoicePdfBuffer`/`renderInvoicePdfBase64` gained optional trailing db; private `fetchOrderForPdf` threads db as a required param.
  - `whatsapp/settings.ts` (**W6**): `global.__whatsappSettingsCache` (a single-value `{value, expiresAt} | null`) converted to `Map<string, {value, expiresAt}>` keyed by `tenant.id` — the second concrete Pitfall-8 first-request-wins global cache after 24-04's store-settings.ts, now fixed identically. `clearWhatsappSettingsCache(tenantId?: string): void` stays fully synchronous (`cache.delete(id)` / `cache.clear()`). `getWhatsappSettingsCached`, `getWhatsappStateFresh`, `updateWhatsappConnectionState`, `setNotificationsEnabled`, `getWhatsappNotificationsAll`, `getWhatsappNotification` all gained the D-D1 optional-db treatment; the two writers (`updateWhatsappConnectionState`, `setNotificationsEnabled`) resolve `{ tenant, db }` and pass `tenant.id` into `clearWhatsappSettingsCache(tenant.id)`.
  - `email/templates.ts` (**W5**): the module-scope `BASE_TEMPLATE_VARS` const (evaluated once at module load, so `store_url` was frozen to whatever `publicOrigin()` returned at boot) became a `baseTemplateVars(tenant)` function called fresh inside `renderTemplate` on every render, after `renderTemplate` resolves `{ tenant, db }` via `getTenantContext()`. `getOrSeed` threads db as a required param.
  - `email/order-confirmation.ts` (**SC5/B1**): the module-scope `baseUrl()` helper (env-only) became `baseUrl(tenant?: Tenant)` — delegates to `publicOrigin(tenant)` only in actual `TENANT_MODE=registry` with a non-`"single"` tenant, otherwise preserves today's exact `BETTER_AUTH_URL ?? NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"` chain byte-for-byte (same pattern as 24-04's sitemap.ts/robots.ts `resolveBaseUrl`). `renderOrderConfirmationHtml`/`renderOrderConfirmationText` gained an optional trailing `tenant?: Tenant` param, threaded through every internal `baseUrl()` call site. `sendOrderConfirmationEmail` resolves `{ tenant, db }` via `getTenantContext()` (optional trailing db param, D-D1) and passes `tenant` into both `sendMail()` calls (customer receipt + admin notification) so per-tenant mailer routing (mailer.ts, 24-01) actually engages once registry mode ships.
  - `meshy/pipeline.ts` (**B4/Pitfall 10**): `advanceGeneration(id, db?: TenantDb)` and `getGenerationRow(id, db?: TenantDb)` — the two functions called from BOTH request context (admin-meshy.ts actions, the download route) AND the non-request `scripts/meshy-sweep.ts` cron — kept the OPTIONAL db shape exactly as B4 requires; an unconditional `getTenantContext()` here would throw off-request (no `headers()`) and silently strand the cron. The five internal state-machine helpers (`advanceGenerating`, `advanceRevising`, `advanceAnalyzing`, `advanceRepairing`, `advanceMulticolor`) plus `refetch` and `latestRevision` are module-private (never exported, only called from `advanceGeneration`'s already-resolved db) and thread db as a REQUIRED positional param — no optional-db ambiguity needed there since they can never be called off-request independently.

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert catalog-adjacent + product-config read helpers (7 files)** - `0a3fe17` (fix)
2. **Task 2: Convert order/accounting/email/pdf/whatsapp/meshy libs (8 files) + whatsapp cache (W6) + email store_url thread (W5)** - `b5e6be7` (fix)

## Files Created/Modified — full enumeration (15/15 per plan frontmatter)

1. `src/lib/variants.ts` — `hydrateProductVariants(productId, db?)`
2. `src/lib/colours.ts` — `getColourPublic(id, db?)`, `getColourAdmin(id, db?)`
3. `src/lib/configurable-product-data.ts` — `getConfigurableProductData(productId, db?)`
4. `src/lib/keychain-fields.ts` — `seedKeychainFields(productId, options?, db?)` — **optional db confirmed** (B4)
5. `src/lib/vending-fields.ts` — `seedVendingFields(productId, options?, db?)` — **optional db confirmed** (B4)
6. `src/lib/shipping-config.ts` — `loadShippingConfig(db?)`
7. `src/lib/delyva-filter.ts` — `filterByEnabledCatalog(services, cfg, db?)`
8. `src/lib/order-dedupe.ts` — `dedupeUnpaidOrders({...}, db?)`
9. `src/lib/checkout-drafts.ts` — `markDraftsConverted({...}, db?)`
10. `src/lib/accounting.ts` — `getAccountingSummary(range, db?)`, `getSalesReport(range, db?)`, `getAccountBalances(db?)` + 3 private helpers threading required db
11. `src/lib/email/templates.ts` — `renderTemplate(key, variables, db?)`; `store_url` now `publicOrigin(tenant)` per-render (W5)
12. `src/lib/email/order-confirmation.ts` — `sendOrderConfirmationEmail(orderId, db?)`; `baseUrl(tenant?)` threaded into every link + `sendMail()` tenant param (SC5/B1)
13. `src/lib/pdf/render-invoice.tsx` — `renderInvoicePdfBuffer(orderId, db?)`, `renderInvoicePdfBase64(orderId, db?)`
14. `src/lib/whatsapp/settings.ts` — per-tenant `Map<tenantId, {...}>` cache + sync `clearWhatsappSettingsCache(tenantId?)` (W6); all 6 exported functions D-D1'd
15. `src/lib/meshy/pipeline.ts` — `advanceGeneration(id, db?)`, `getGenerationRow(id, db?)` — **optional db confirmed** (B4); private state-machine helpers thread required db

## Proof — keychain/vending/meshy kept OPTIONAL db (not unconditional getTenantContext)

`db?: TenantDb` (a `?` — not a required param) appears on all three B4-flagged public entrypoints:
- `src/lib/keychain-fields.ts:36` — `seedKeychainFields(productId: string, options?: { silent?: boolean }, db?: TenantDb)`
- `src/lib/vending-fields.ts:27` — `seedVendingFields(productId: string, options?: { silent?: boolean }, db?: TenantDb)`
- `src/lib/meshy/pipeline.ts:60,155` — `getGenerationRow(id: string, db?: TenantDb)` and `advanceGeneration(id: string, db?: TenantDb)`

None of these four functions calls `getTenantContext()` unconditionally before checking the passed-in `db` — each starts with `db ??= (await getTenantContext()).db;`, which short-circuits to the caller-supplied db and never touches `headers()` when a script/cron passes one explicitly in 24-10.

## Decisions Made

See `key-decisions` in frontmatter. Summary: D-D1 applied uniformly across all 15 files; meshy's private state-machine helpers thread db as required (module-private, safe); whatsapp/settings.ts always resolves tenant via context (no non-request callers exist today, verified by grep); order-confirmation.ts additionally threads `tenant` into `sendMail()` calls as a Rule 2 completion of tenant-aware mail routing already supported by mailer.ts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Threaded `tenant` into `sendMail()` calls in `email/order-confirmation.ts`**
- **Found during:** Task 2 (email/order-confirmation.ts baseUrl threading)
- **Issue:** The plan's action item only asked for `baseUrl(tenant?)` to be threaded into order-link/admin-link URL construction. But `mailer.ts`'s `sendMail()` (built in 24-01) already accepts an optional `tenant?: Tenant` param to route through the per-tenant mailer cache — leaving it unpassed here would mean the URLs inside the email were tenant-correct but the email itself still sent via the global singleton transport once registry mode ships.
- **Fix:** Added `tenant` to both `sendMail()` call sites (customer receipt, admin new-order notification) in `sendOrderConfirmationEmail`.
- **Files modified:** `src/lib/email/order-confirmation.ts` (same file/commit as the rest of Task 2 — no separate commit)
- **Verification:** `npx tsc --noEmit` clean; `mailer.ts`'s own docstring confirms `resolveSender(tenant)` short-circuits back to the identical global transport under `TENANT_MODE=single`, so single-mode behavior is unaffected.
- **Committed in:** `b5e6be7` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical / Rule 2)
**Impact on plan:** Low-risk completion of tenant-mail-routing already scaffolded in 24-01; byte-identical in single mode; no scope creep beyond the file already being edited for this exact purpose.

## Issues Encountered

None — all edits compiled clean on first `npx tsc --noEmit` pass after each task; no build errors, no test regressions to chase (no test suite touches these files directly).

## User Setup Required

None. `TENANT_MODE` stays unset/`single` in every deployed environment; every helper's `db ??= (await getTenantContext()).db` short-circuits to today's singleton pool, and both tenant-scoped caches (`store-settings.ts` from 24-04, `whatsapp/settings.ts` here) collapse to exactly one `"single"` key.

## Next Phase Readiness

- All 17 Category-D shared libs (2 from 24-04 + 15 here) now dissolve the `db` singleton import — verified via `rg "from \"@/lib/db\"" src/lib | rg -v "/lib/db/schema|/lib/db/index" | rg -v "src/lib/tenant/"`, which returns only `src/lib/auth.ts` (Category E singleton/factory file, explicitly out of scope for this Category-D wave).
- Both Pitfall-8 process-global caches (`store-settings.ts`, `whatsapp/settings.ts`) are now tenant-scoped Maps with synchronous clears — the tenant-B non-bleed check for WhatsApp settings is deferred to 24-12's W7 battery per the plan.
- `keychain-fields.ts`/`vending-fields.ts`/`meshy/pipeline.ts`'s optional-db shape is ready for 24-10's non-request scripts (`migrate-pancake-clicker-to-keychain.ts`, `seed-vending-product.ts`, `scripts/meshy-sweep.ts`) to pass an explicit per-tenant db without triggering an off-request `headers()` throw.
- Categories A/B/C (guarded server actions, route handlers, RSC pages) that call into these 15 files are unaffected — every current call site passes zero args beyond what existed before, verified via grep across `src/actions/**`, `src/app/**` for each function name before editing.

## Verification

- `npx tsc --noEmit` — **clean (exit 0)**, run after each of the 2 tasks and once more as a final gate.
- `rg -l "from \"@/lib/db\";" <all 15 files>` — 0 matches (db value import gone from every file; `@/lib/db/schema` retained where needed).
- `rg -L "getTenantContext" <all 15 files>` — 0 files missing it (every file resolves tenant context).
- `rg "db\?: TenantDb" src/lib/keychain-fields.ts src/lib/vending-fields.ts` — matched in both.
- `rg "Map<string" src/lib/whatsapp/settings.ts` — matched (2 occurrences: type decl + init).
- `rg "clearWhatsappSettingsCache\(tenantId\?: string\): void" src/lib/whatsapp/settings.ts` — matched exactly.
- `rg "async function clearWhatsappSettingsCache|clearWhatsappSettingsCache = async"` — 0 matches (clear did NOT become async).
- `rg "publicOrigin\(tenant\)" src/lib/email/templates.ts` — matched.
- `rg "publicOrigin\(tenant\)" src/lib/email/order-confirmation.ts` — matched.
- `rg "db\?: TenantDb" src/lib/meshy/pipeline.ts` — matched (both `getGenerationRow` and `advanceGeneration`).
- `rg "from \"@/lib/db\"" src/lib | rg -v "/lib/db/schema|/lib/db/index"` — only `src/lib/tenant/pool-manager.ts` (sanctioned resolver) and `src/lib/auth.ts` (Category E, out of scope) remain.
- `git diff --diff-filter=D --name-only HEAD~1 HEAD` (checked after both task commits) — empty both times, no accidental deletions.
- `git status --short` before each commit — confirmed only the intended files were staged (no `.planning/**`, no `.agents/`, no `skills-lock.json`).

## Self-Check: PASSED

- `src/lib/variants.ts` — FOUND (modified, `getTenantContext`, no `@/lib/db` value import)
- `src/lib/colours.ts` — FOUND (modified, `getTenantContext`, no `@/lib/db` value import)
- `src/lib/configurable-product-data.ts` — FOUND (modified, `getTenantContext`, no `@/lib/db` value import)
- `src/lib/keychain-fields.ts` — FOUND (modified, `db?: TenantDb`)
- `src/lib/vending-fields.ts` — FOUND (modified, `db?: TenantDb`)
- `src/lib/shipping-config.ts` — FOUND (modified, `getTenantContext`, no `@/lib/db` value import)
- `src/lib/delyva-filter.ts` — FOUND (modified, `getTenantContext`, no `@/lib/db` value import)
- `src/lib/order-dedupe.ts` — FOUND (modified, `getTenantContext`, no `@/lib/db` value import)
- `src/lib/checkout-drafts.ts` — FOUND (modified, `getTenantContext`, no `@/lib/db` value import)
- `src/lib/accounting.ts` — FOUND (modified, `getTenantContext`, no `@/lib/db` value import)
- `src/lib/email/templates.ts` — FOUND (modified, `publicOrigin(tenant)`)
- `src/lib/email/order-confirmation.ts` — FOUND (modified, `publicOrigin(tenant)`)
- `src/lib/pdf/render-invoice.tsx` — FOUND (modified, `getTenantContext`, no `@/lib/db` value import)
- `src/lib/whatsapp/settings.ts` — FOUND (modified, `Map<string`, sync `clearWhatsappSettingsCache(tenantId?: string): void`)
- `src/lib/meshy/pipeline.ts` — FOUND (modified, `db?: TenantDb` on both public entrypoints)
- Commit `0a3fe17` — FOUND in `git log --oneline`
- Commit `b5e6be7` — FOUND in `git log --oneline`

---
*Phase: 24-singleton-dissolution-sweep*
*Completed: 2026-07-13*
