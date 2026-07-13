---
phase: 24-singleton-dissolution-sweep
plan: 07
subsystem: multi-tenant
tags: [multi-tenant, category-a, category-c, admin-actions, admin-pages, requireAdmin, getTenantContext, tenant-db, cache-tags]

# Dependency graph
requires:
  - phase: 24-singleton-dissolution-sweep
    plan: 04
    provides: "tenant-scoped CATEGORY_TREE_TAG contract (tenantTag helper, dual-tag cache entry) + store-settings cache made sync + tenant-scoped (clearStoreSettingsCache(tenantId?))"
  - phase: 24-singleton-dissolution-sweep
    plan: 05
    provides: "getWhatsappNotificationsAll / seedKeychainFields / seedVendingFields / hydrateProductVariants optional-trailing-db (D-D1) shapes"
  - phase: 24-singleton-dissolution-sweep
    plan: 06
    provides: "Category-A guard-capture transform precedent (18 money-path/ops admin actions), PER-EXPORT RULE discipline, guard-count-unchanged verification method"
provides:
  - "20 files (16 admin server-action files + 4 admin RSC pages) source db from const { db } = await requireAdmin() (or getTenantContext() for unguarded public reads) — zero @/lib/db value imports remain in this batch"
  - "admin-profile.ts resolves auth from getTenantContext() instead of the @/lib/auth singleton (B2) — last direct auth-singleton importer in the admin action set is swept"
  - "Every revalidateTag(CATEGORY_TREE_TAG) bust in products.ts/categories.ts (14 call sites) replaced with revalidateTag(tenantTag(tenant.id, CATEGORY_TREE_TAG)) — closes the catalog cache-tag loop opened by 24-04"
  - "admin-settings.ts / admin-store-settings-bank.ts store-settings cache busts pass tenant.id synchronously (W4)"
  - "custom-fonts.ts's two storefront-facing unguarded reads (getActiveCustomFontsForLoader, listCustomFonts) resolve db via getTenantContext(), confirmed NOT guarded (anonymous-visitor font loading preserved)"
  - "admin/orders/[id]/page.tsx's customer-facing tracking link threads publicUrl(path, tenant) (SC5/B1)"
affects: [24-08, 24-09, 24-10, 24-11, 24-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Category-A guard-capture transform applied to 16 more files: await requireAdmin() (discarded) -> const { db } = await requireAdmin(); where tenant is also needed (revalidateTag tenantTag wrap, store-settings sync bust, publicUrl thread), const { db, tenant } = await requireAdmin()"
    - "Private (non-exported) helper functions that read db and lost the module-scope import thread db as a REQUIRED positional first param: generateUniqueProductSlug/resolveParentCategoryId/reconcileInlineFields/cloneConfigFields/cloneVariantTree (products.ts), nextCategoryPosition/nextSubcategoryPosition (categories.ts), revalidateProductSurfaces (variants.ts)"
    - "PER-EXPORT RULE applied to MIXED files with unguarded public reads alongside guarded admin mutations: custom-fonts.ts (getActiveCustomFontsForLoader/listCustomFonts -> getTenantContext()), products.ts (getProduct/getProducts -> getTenantContext()), categories.ts (getCategories/getSubcategoriesByCategory/getAllSubcategories/getCategoriesWithSubcategories/getCategoriesWithCounts/getSubcategoryBySlug -> getTenantContext()), admin-shipping.ts (getShippingRate, customer-safe checkout read, -> getTenantContext())"
    - "admin/products/[id]/edit/page.tsx has NO direct guard (relies on nested getConfiguratorData's internal requireAdmin()) — per PER-EXPORT rule, resolved db via getTenantContext() rather than adding a guard that wasn't there before"
    - "Tenant-scoped catalog cache bust: revalidateTag(CATEGORY_TREE_TAG) -> revalidateTag(tenantTag(tenant.id, CATEGORY_TREE_TAG)) — the bare-literal form is now ELIMINATED fleet-wide (grep across src/ returns 0 functional matches, only 2 explanatory comment mentions in src/lib/catalog.ts)"
    - "Guard-count-unchanged verified per-file against pre-plan-baseline commit (a0925f2) for all 20 files — zero guards added or removed anywhere in the batch"

key-files:
  created: []
  modified:
    - src/actions/admin-users.ts
    - src/actions/admin-user-detail.ts
    - src/actions/admin-settings.ts
    - src/actions/admin-store-settings-bank.ts
    - src/actions/admin-shipping.ts
    - src/actions/admin-inventory.ts
    - src/actions/admin-reviews.ts
    - src/actions/admin-whatsapp-notifications.ts
    - src/actions/admin-profile.ts
    - src/actions/admin-coupons.ts
    - src/actions/admin-colours.ts
    - src/actions/products.ts
    - src/actions/categories.ts
    - src/actions/variants.ts
    - src/actions/configurator.ts
    - src/actions/custom-fonts.ts
    - "src/app/(admin)/admin/products/[id]/edit/page.tsx"
    - "src/app/(admin)/admin/orders/[id]/page.tsx"
    - "src/app/(admin)/admin/orders/page.tsx"
    - "src/app/(admin)/admin/inventory/page.tsx"

key-decisions:
  - "Applied the PER-EXPORT RULE verbatim: never added a requireAdmin()/requireUser() call that wasn't already present. Every one of the 20 files' requireAdmin(/requireUser( literal call counts is byte-identical before vs after this plan, verified against the pre-plan commit a0925f2 (see Verification)."
  - "admin-shipping.ts's getShippingRate (customer-safe checkout read, no requireAdmin in the original) resolves db via getTenantContext() rather than being folded into an admin guard — this file wasn't explicitly named in the plan's custom-fonts-style special-attention text but the PER-EXPORT RULE / critical invariant applies file-wide, not just to the files the plan called out by name."
  - "revalidateTag(CATEGORY_TREE_TAG) calls were REPLACED with the tenantTag-wrapped form (not kept alongside), matching the plan's literal interfaces code block and the acceptance criterion that greps for zero remaining bare-literal busts. 24-04's cache-entry DEFINITION intentionally still carries both tags transitionally — only the BUSTING side (this plan) is now tenant-scoped-only."
  - "admin-store-settings-bank.ts's two exports use the extended `const { db, tenant, ...session } = await requireAdmin();` destructure (both db AND tenant AND the flat session spread are needed) — this doesn't literally match the plan's shorthand acceptance-criteria regex (`{ db }` / `{ db, tenant }` with no trailing spread), but does satisfy the intent (guard-supplied db present); same precedent 24-06 hit and resolved with a broader per-file presence check (see Verification)."
  - "Found and fixed a self-introduced false positive: an explanatory comment in admin-profile.ts originally read '// React.cache-memoized — free after requireAdmin()', which contains the literal substring 'requireAdmin()' and would inflate the guard-count-unchanged check from 2 to 3. Reworded to '// React.cache-memoized — free, guard already resolved it above' with a small follow-up commit (3cf53d0) — no code behavior change, comment-only."

requirements-completed: [TEN-02]

# Metrics
duration: ~45min
completed: 2026-07-13
---

# Phase 24 Plan 07: Wave 5 — Admin Actions Batch 2 + Admin RSC Pages Summary

**16 admin server-action files (settings/users/reviews/coupons/colours/catalog) plus 4 admin RSC pages now source `db` from the guard's `const { db } = await requireAdmin()` (or `getTenantContext()` for unguarded public/storefront reads); `admin-profile.ts`'s Better Auth `auth` client is resolved from tenant context instead of the `@/lib/auth` singleton; every `revalidateTag(CATEGORY_TREE_TAG)` catalog bust is now tenant-scoped via `tenantTag(tenant.id, ...)`.**

## Performance

- **Duration:** ~45 min (Task 1 commit `4552275`, Task 2 commit `9d6b2f5`, follow-up fix `3cf53d0`)
- **Completed:** 2026-07-13
- **Tasks:** 2 (+ 1 small follow-up fix commit)
- **Files modified:** 20

## Accomplishments

- **Task 1 (9 admin settings/user/review/profile action files):** `admin-users.ts`, `admin-user-detail.ts`, `admin-settings.ts`, `admin-store-settings-bank.ts`, `admin-shipping.ts`, `admin-inventory.ts`, `admin-reviews.ts`, `admin-whatsapp-notifications.ts`, `admin-profile.ts` — every guarded export's `await requireAdmin()` now captures `db` (and `tenant`/`...session` where needed). `import { db } from "@/lib/db"` deleted from all 9 files. `admin-shipping.ts`'s unguarded `getShippingRate` (customer-safe checkout read) resolves `db` via `getTenantContext()`. `admin-settings.ts`'s `updateStoreSettings`/`invalidateSettingsCache` and `admin-store-settings-bank.ts`'s `saveStoreBankDetails`/`saveDraftLinkTemplate` now call `clearStoreSettingsCache(tenant.id)` / `invalidateStoreSettingsCache(tenant.id)` synchronously (W4 — no floating promise, no unkeyed cross-tenant clear). `admin-profile.ts` no longer imports `auth` from `@/lib/auth`; `changeAdminPassword` resolves `const { auth } = await getTenantContext();` (React.cache-memoized, free after the guard already ran) immediately before the `auth.api.changePassword(...)` call.
- **Task 2 (5 catalog actions + 2 coupons/colours + 4 admin pages):** `products.ts`, `categories.ts`, `variants.ts`, `configurator.ts`, `custom-fonts.ts`, `admin-coupons.ts`, `admin-colours.ts`, and the 4 admin RSC pages (`admin/products/[id]/edit/page.tsx`, `admin/orders/[id]/page.tsx`, `admin/orders/page.tsx`, `admin/inventory/page.tsx`) all swept. `products.ts`'s private helpers (`generateUniqueProductSlug`, `resolveParentCategoryId`, `reconcileInlineFields`, `cloneConfigFields`, `cloneVariantTree`) and `categories.ts`'s (`nextCategoryPosition`, `nextSubcategoryPosition`) and `variants.ts`'s (`revalidateProductSurfaces`) now take `db: TenantDb` as a required first param, since they lost the module-scope import and are only ever called from an already-guarded export's resolved `db`. Every one of the 14 `revalidateTag(CATEGORY_TREE_TAG)` calls across `products.ts` (6) and `categories.ts` (8) is now `revalidateTag(tenantTag(tenant.id, CATEGORY_TREE_TAG))`. `custom-fonts.ts`'s `getActiveCustomFontsForLoader` + `listCustomFonts` (unguarded, rendered by `<FontFaceLoader>` on every storefront page) resolve `db` via `getTenantContext()` — confirmed NO guard added (guard count 2/2 unchanged: only `toggleCustomFontActive`/`deleteCustomFont` remain `requireAdmin`-gated). `products.ts`/`categories.ts` also had several unguarded public reads (`getProduct`, `getProducts`, `getCategories`, `getSubcategoriesByCategory`, `getAllSubcategories`, `getCategoriesWithSubcategories`, `getCategoriesWithCounts`, `getSubcategoryBySlug`) that now resolve `db` via `getTenantContext()` per-export, never a blanket guard. `admin/orders/[id]/page.tsx`'s customer-facing tracking link now calls `publicUrl(path, tenant)` (collapsed to a single source line so the tenant-thread is greppable on one line — SC5/B1). `admin/products/[id]/edit/page.tsx` had zero direct `requireAdmin()` calls in the original (it relies on the nested `getConfiguratorData` action's own internal guard) — per the PER-EXPORT rule this plan does NOT add a guard that wasn't there; it resolves `db` via `getTenantContext()` instead, and gains `export const dynamic = "force-dynamic"` (previously absent).

## Task Commits

Each task was committed atomically:

1. **Task 1: Sweep admin settings/users/reviews/profile actions (9 files)** - `4552275` (fix)
2. **Task 2: Sweep catalog + coupons/colours actions + 4 admin RSC pages (11 files)** - `9d6b2f5` (fix)
3. **Follow-up: reword false-positive comment in admin-profile.ts** - `3cf53d0` (fix)

## Files Modified — full enumeration (20/20 per plan frontmatter)

**Task 1 (9):**
1. `src/actions/admin-users.ts`
2. `src/actions/admin-user-detail.ts`
3. `src/actions/admin-settings.ts`
4. `src/actions/admin-store-settings-bank.ts`
5. `src/actions/admin-shipping.ts`
6. `src/actions/admin-inventory.ts`
7. `src/actions/admin-reviews.ts`
8. `src/actions/admin-whatsapp-notifications.ts`
9. `src/actions/admin-profile.ts` — **confirmed swept off the `@/lib/auth` singleton (B2)**

**Task 2 (11):**
10. `src/actions/admin-coupons.ts` — **confirmed swept (previously-missed db-importer)**
11. `src/actions/admin-colours.ts` — **confirmed swept (previously-missed db-importer)**
12. `src/actions/products.ts`
13. `src/actions/categories.ts`
14. `src/actions/variants.ts`
15. `src/actions/configurator.ts`
16. `src/actions/custom-fonts.ts`
17. `src/app/(admin)/admin/products/[id]/edit/page.tsx`
18. `src/app/(admin)/admin/orders/[id]/page.tsx`
19. `src/app/(admin)/admin/orders/page.tsx`
20. `src/app/(admin)/admin/inventory/page.tsx`

No `files_modified` entry from the plan frontmatter was skipped — this list is a 1:1 match.

## Decisions Made

See `key-decisions` in frontmatter. Summary: PER-EXPORT RULE applied literally across all 20 files (no guard added/removed, verified by count-diff against the pre-plan baseline commit `a0925f2`); private helpers that lost the module `db` import thread it as a required first param; every unguarded public/storefront read (custom-fonts loaders, products/categories reads, admin-shipping's checkout read) resolves `db` via `getTenantContext()` rather than gaining a guard; catalog cache-tag busting side is now exclusively tenant-scoped (definition side from 24-04 unaffected); store-settings cache busts pass `tenant.id` synchronously; `admin-profile.ts` auth resolved from context; a self-introduced comment-text false positive was caught and fixed before finalizing this summary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment text in admin-profile.ts collided with the guard-count-unchanged textual check**
- **Found during:** Post-Task-1 verification (guard-count-unchanged proof)
- **Issue:** The explanatory comment added next to the `getTenantContext()` call in `changeAdminPassword` originally read `// React.cache-memoized — free after requireAdmin()`. The literal substring `requireAdmin()` in that comment inflated the file's `grep -oE "requireAdmin\(|requireUser\("` count from 2 (the two real guard calls) to 3, which would have failed the B2 guard-count-unchanged acceptance criterion even though zero actual guards were added.
- **Fix:** Reworded the comment to `// React.cache-memoized — free, guard already resolved it above` — same meaning, no `requireAdmin(` substring, no code behavior change.
- **Files modified:** `src/actions/admin-profile.ts`
- **Verification:** Re-ran the guard-count-unchanged diff against baseline `a0925f2` — now 2/2. `npx tsc --noEmit` clean.
- **Commit:** `3cf53d0`

**2. [Rule 1 - Bug] `publicUrl(path, tenant)` call in admin/orders/[id]/page.tsx initially split across 3 lines, breaking the plan's single-line grep acceptance check**
- **Found during:** Task 2 acceptance-criteria verification (`rg "publicUrl\([^)]*tenant"`)
- **Issue:** The tenant-threaded `publicUrl(...)` call was written with the URL argument and `tenant` argument on separate lines (matching the pre-existing multi-line call-site style). Ripgrep's default single-line matching mode does not match `publicUrl\([^)]*tenant` across a newline, so the acceptance grep returned zero matches even though the call was correctly tenant-threaded.
- **Fix:** Collapsed the call onto a single source line: `publicUrl(\`/orders/${row.id}...\`, tenant)`.
- **Files modified:** `src/app/(admin)/admin/orders/[id]/page.tsx`
- **Verification:** `rg "publicUrl\([^)]*tenant" "src/app/(admin)/admin/orders/[id]/page.tsx"` now matches. `npx tsc --noEmit` clean.
- **Commit:** included in `9d6b2f5` (Task 2 commit — caught before that commit was made)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — self-caught verification-tooling mismatches, zero behavior change)
**Impact on plan:** Neither deviation touches runtime behavior; both are text/formatting fixes discovered while proving the plan's own acceptance criteria pass literally, not just in spirit.

## Issues Encountered

- The plan's Task 1 acceptance-criteria regex (`rg -L "\{ db \} = await requireAdmin\(\)|\{ db, tenant \} = await requireAdmin\(\)"`) does not account for the extended `const { db, tenant, ...session } = await requireAdmin();` destructure used in `admin-store-settings-bank.ts` (both `saveStoreBankDetails` and `saveDraftLinkTemplate` need `db`, `tenant`, AND the flat `session` spread). This is the same gap 24-06 encountered and documented; resolved the same way — a broader per-file presence check (`\{ db(, tenant)?(, \.\.\.session)? \} = await (requireAdmin|getTenantContext)\(\)`) confirms guard-supplied `db` is present in every one of the 20 files. Not a code defect — a plan-shorthand-vs-actual-code-shape mismatch, consistent with precedent.

## User Setup Required

None. `TENANT_MODE` stays unset/`single` in every deployed environment; `requireAdmin()`'s resolved `db` short-circuits to today's singleton pool (per 24-03), so every one of these 20 files is byte-identical in behavior today.

## Next Phase Readiness

- 20 more Category-A/C files swept in this plan, on top of 24-06's 18 — the admin side of the sweep (all admin server actions + all admin RSC pages that directly imported `@/lib/db`) is now complete per the plan's stated success criterion.
- `admin-profile.ts` is off the `@/lib/auth` singleton — `rg 'from "@/lib/auth"' src/actions/admin-profile.ts` returns 0, closing out B2 for the admin action set.
- The catalog cache-tag loop is closed end-to-end: 24-04 added the tenant-scoped tag to the cache-entry DEFINITION (keeping the bare tag too, transitionally), and this plan converts every BUSTING call site to the tenant-scoped form exclusively. `rg "revalidateTag\(CATEGORY_TREE_TAG\)" src/` returns 0 functional matches fleet-wide (only 2 explanatory comment mentions in `src/lib/catalog.ts`) — the two-tenant catalog-leakage test planned for 24-12 has its prerequisite in place.
- `src/lib/db/index.ts`'s `export const db` singleton still cannot be deleted yet — Category B/D/E/F non-request surfaces (crons, scripts, webhooks) and any remaining Category-A files outside this wave's scope are tracked for 24-08 onward per `24-PATTERNS.md`'s wave structure.

## Verification

- `npx tsc --noEmit` (raw, unfiltered, `| grep -v '^\.next/'`) — **exit clean, zero output** — run after Task 1, after Task 2, after both follow-up fixes, and once more as a final full-repo gate.
- `rg -l 'from "@/lib/db";' <all 20 files>` — 0 matches (db value import gone from every file; `@/lib/db/schema` type/table imports retained where needed).
- **Guard-count-unchanged proof (B2, the load-bearing per-file check):** for every one of the 20 files, `grep -oE 'requireAdmin\(|requireUser\(' <file> | wc -l` computed against the pre-plan baseline commit (`a0925f2`, via `git show <base>:<file>`) and against the current working tree, are IDENTICAL:
  - admin-users.ts: 3/3 — admin-user-detail.ts: 4/4 — admin-settings.ts: 4/4 — admin-store-settings-bank.ts: 3/3 — admin-shipping.ts: 4/4 — admin-inventory.ts: 3/3 — admin-reviews.ts: 6/6 — admin-whatsapp-notifications.ts: 3/3 — admin-profile.ts: 2/2 — products.ts: 8/8 — categories.ts: 9/9 — variants.ts: 16/16 — configurator.ts: 10/10 — custom-fonts.ts: 2/2 — admin-coupons.ts: 8/8 — admin-colours.ts: 16/16 — admin/products/[id]/edit/page.tsx: 1/1 (comment-only reference, no real guard in either version) — admin/orders/[id]/page.tsx: 2/2 — admin/orders/page.tsx: 2/2 — admin/inventory/page.tsx: 1/1.
- **Guard-supplied-db presence proof (broader pattern, per 24-06 precedent):** `grep -cE "\{ db(, tenant)?(, \.\.\.session)? \} = await (requireAdmin|getTenantContext)\(\)"` returns ≥1 for all 20 files.
- `rg "revalidateTag\(CATEGORY_TREE_TAG\)" src/actions/products.ts src/actions/categories.ts` — 0 matches (bare-literal busts fully replaced).
- `rg "revalidateTag\(CATEGORY_TREE_TAG\)" src/` (fleet-wide) — 0 functional matches (2 comment-only mentions in `src/lib/catalog.ts`, not busting calls).
- `rg "tenantTag" src/actions/products.ts` — 7 matches (import + 6 call sites: createProduct, updateProduct, deleteProduct, toggleProductActive, toggleProductFeatured, duplicateProduct).
- `rg "getTenantContext" src/actions/custom-fonts.ts` — 3 matches (import + 2 unguarded-read resolves).
- `rg -c "requireAdmin\(" src/actions/custom-fonts.ts` — 2/2 unchanged (loader reads did NOT gain a guard).
- `rg "clearStoreSettingsCache\(tenant" src/actions/admin-settings.ts src/actions/admin-store-settings-bank.ts` — 3 matches (2 + 1 — W4 sync tenant-scoped bust); `invalidateStoreSettingsCache(tenant.id)` (the Phase-20 alias) also present in `admin-store-settings-bank.ts`.
- `rg "await clearStoreSettingsCache|await invalidateStoreSettingsCache" src/actions/admin-settings.ts src/actions/admin-store-settings-bank.ts` — 0 matches (confirmed NOT awaited — sync, W4).
- `rg 'from "@/lib/auth"' src/actions/admin-profile.ts` — 0 matches (auth singleton import gone — B2).
- `rg "getTenantContext" src/actions/admin-profile.ts` — 2 matches (import + resolve).
- `rg "publicUrl\([^)]*tenant" "src/app/(admin)/admin/orders/[id]/page.tsx"` — 1 match (customer-facing tracking link tenant-threaded — SC5/B1).
- `git diff --diff-filter=D --name-only HEAD~1 HEAD` (checked after both task commits) — empty both times, no accidental deletions.
- `git status --short` before each commit — confirmed only the intended files per task were staged (no `.planning/**`, no `.agents/`, no `skills-lock.json`).

## Self-Check: PASSED

- `src/actions/admin-users.ts` — FOUND (modified, no `@/lib/db` value import)
- `src/actions/admin-user-detail.ts` — FOUND (modified)
- `src/actions/admin-settings.ts` — FOUND (modified, `clearStoreSettingsCache(tenant.id)`)
- `src/actions/admin-store-settings-bank.ts` — FOUND (modified, `invalidateStoreSettingsCache(tenant.id)` / `clearStoreSettingsCache(tenant.id)`)
- `src/actions/admin-shipping.ts` — FOUND (modified, `getShippingRate` -> `getTenantContext()`)
- `src/actions/admin-inventory.ts` — FOUND (modified)
- `src/actions/admin-reviews.ts` — FOUND (modified)
- `src/actions/admin-whatsapp-notifications.ts` — FOUND (modified, `getWhatsappNotificationsAll(db)`)
- `src/actions/admin-profile.ts` — FOUND (modified, no `@/lib/auth` import, `getTenantContext()` resolves `auth`)
- `src/actions/admin-coupons.ts` — FOUND (modified, no `@/lib/db` value import)
- `src/actions/admin-colours.ts` — FOUND (modified, no `@/lib/db` value import)
- `src/actions/products.ts` — FOUND (modified, `tenantTag(tenant.id, CATEGORY_TREE_TAG)` x6, private helpers take `db: TenantDb`)
- `src/actions/categories.ts` — FOUND (modified, `tenantTag(tenant.id, CATEGORY_TREE_TAG)` x8, private helpers take `db: TenantDb`)
- `src/actions/variants.ts` — FOUND (modified, `revalidateProductSurfaces(db, productId)`)
- `src/actions/configurator.ts` — FOUND (modified, no `@/lib/db` value import)
- `src/actions/custom-fonts.ts` — FOUND (modified, unguarded loader reads use `getTenantContext()`, guard count 2/2 unchanged)
- `src/app/(admin)/admin/products/[id]/edit/page.tsx` — FOUND (modified, `getTenantContext()`, `export const dynamic = "force-dynamic"` added)
- `src/app/(admin)/admin/orders/[id]/page.tsx` — FOUND (modified, `publicUrl(path, tenant)`)
- `src/app/(admin)/admin/orders/page.tsx` — FOUND (modified)
- `src/app/(admin)/admin/inventory/page.tsx` — FOUND (modified)
- Commit `4552275` — FOUND in `git log --oneline`
- Commit `9d6b2f5` — FOUND in `git log --oneline`
- Commit `3cf53d0` — FOUND in `git log --oneline`

---
*Phase: 24-singleton-dissolution-sweep*
*Completed: 2026-07-13*
