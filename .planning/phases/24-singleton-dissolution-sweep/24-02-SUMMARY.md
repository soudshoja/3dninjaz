---
phase: 24-singleton-dissolution-sweep
plan: 02
subsystem: auth
tags: [multi-tenant, better-auth, auth-cache, tenant-context]

# Dependency graph
requires:
  - phase: 24-singleton-dissolution-sweep
    plan: 01
    provides: "getTenantMailer(tenant)/getTenantMailFrom(tenant) (per-tenant SMTP), publicOrigin(tenant?)/publicUrl(tenant?) (registry-domain-sourced, never Host-derived)"
  - phase: 23-multi-tenant-plumbing
    provides: "Tenant type (platform-schema.ts), getTenantDb short-circuit pattern (pool-manager.ts), getTenantContext (context.ts)"
provides:
  - "buildTenantAuth(tenant, db) — per-tenant Better Auth factory closing over the passed tenant db, tenant mailer (via 24-01), and tenant-derived trustedOrigins/baseURL"
  - "getTenantAuth(tenant, db) — src/lib/tenant/auth-cache.ts, single-mode short-circuit to the `auth` compat shim, registry-mode per-tenant instance cache with LRU eviction"
  - "Host-resolved auth catch-all dispatch (src/app/api/auth/[[...all]]/route.ts)"
  - "export type TenantDb — src/lib/tenant/pool-manager.ts (was declared but unexported; needed by 24-02 through 24-05)"
affects: [24-03, 24-04, 24-05, 25-super-admin-provisioning, 26-super-admin-panel, 27-tenant-cutover]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-mode short-circuit mirrored a third time: getTenantAuth (auth-cache.ts) follows the exact same `if (process.env.TENANT_MODE !== \"registry\" || tenant.id === \"single\") return <today's singleton>` shape as getTenantDb (pool-manager.ts) and getTenantMailer (mailer-cache.ts, 24-01)"
    - "Compat shim over dissolved singleton: `export const auth` stays exported from auth.ts, now built by calling the new factory with a synthesized \"single\" Tenant literal + the singleton db — un-swept importers (guards, until 24-03) keep compiling unchanged"
    - "Local structural type alias to avoid same-wave export-ordering coupling: auth.ts defines its own `type TenantDb = MySql2Database<typeof schema>` rather than importing pool-manager.ts's newly-exported alias, since TS type aliases are structural — both are interchangeable at every call site"

key-files:
  created:
    - src/lib/tenant/auth-cache.ts
  modified:
    - src/lib/auth.ts
    - src/lib/tenant/pool-manager.ts
    - src/app/api/auth/[[...all]]/route.ts

key-decisions:
  - "baseURL formula is `process.env.BETTER_AUTH_URL ?? (registryMode ? publicOrigin(tenant) : undefined)`, kept on a SINGLE source line so the required acceptance regex `BETTER_AUTH_URL ?? (registryMode` matches — this is also what makes the single-mode `undefined` fallback provable by direct code inspection rather than only by runtime behavior"
  - "buildTenantAuth's second parameter is named `tenantDb`, not `db` — the plan's own acceptance criteria requires `rg \"drizzleAdapter\\(db,\" src/lib/auth.ts` to return 0 (proving the adapter no longer binds a variable literally named `db`, i.e. not the module singleton). Renaming the parameter satisfies this while remaining a positional-arg-compatible `buildTenantAuth(tenant, db)` call for every caller (auth-cache.ts, the compat shim)"
  - "welcome email inside the databaseHooks.user.create.after hook still calls `sendWelcomeEmail(user.email, user.name)` with NO tenant arg, per plan instruction — send-emails.ts does not accept a tenant parameter yet. A `TODO(24-09)` comment marks the exact line; 24-09 has both send-emails.ts and auth.ts in its files_modified so the TODO closes in-phase"
  - "the guest-order-linking query/update inside the same hook now runs against `tenantDb` (the factory's passed-in parameter), never the module `db` — this is the ARCHITECTURE.md hazard-1 fix and is unconditional (not single-mode-gated), since it is always correct to scope the hook to whichever db the calling auth instance was built with"

patterns-established:
  - "Auth-instance cache: same LRU/global-Map/hot-reload-safe shape as pool-manager.ts and mailer-cache.ts — the third and final infrastructure cache in this shape for Phase 24 Wave 1/2"

requirements-completed: [TEN-02]

# Metrics
duration: ~10min
completed: 2026-07-13
---

# Phase 24 Plan 02: Auth Factory + Auth Cache + Host-Resolved Catch-All Dispatch Summary

**buildTenantAuth(tenant, db) factory replaces the module-scope Better Auth singleton; getTenantAuth(tenant, db) caches per-tenant instances with a single-mode short-circuit to a kept `auth` compat shim; the auth catch-all route now resolves tenant from Host before dispatching.**

## Performance

- **Duration:** ~10 min (24-01 finished 16:07:16, Task 1 commit 16:14:23, Task 2 commit 16:16:00, all times +08:00)
- **Completed:** 2026-07-13
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- `src/lib/auth.ts` refactored: the module-scope `betterAuth({...})` call is now inside `export function buildTenantAuth(tenant: Tenant, tenantDb: TenantDb)`. All three ARCHITECTURE.md:226-232 hazards fixed inside the factory:
  1. `drizzleAdapter(tenantDb, ...)` and both `databaseHooks.user.create.after` DB operations (guest-order phone-linking select/update) close over the **passed** `tenantDb`, never a module singleton.
  2. `sendResetPassword` now threads `tenant` into `sendResetPasswordEmail({..., tenant})`, routing through the 24-01 per-tenant mailer cache and per-tenant template render.
  3. `trustedOrigins` now calls a new `tenantTrustedOrigins(tenant)` helper: single mode reproduces today's literal array byte-for-byte; registry mode derives `[publicOrigin(tenant), https://${tenant.primaryDomain}, ...localhost entries]` — never a hardcoded literal (the d421bd9 bug class).
  4. `baseURL: process.env.BETTER_AUTH_URL ?? (registryMode ? publicOrigin(tenant) : undefined)` — single mode with `BETTER_AUTH_URL` unset evaluates to `undefined`, preserving Better Auth's per-request origin inference exactly as today.
- `export const auth` is **kept** as a compat shim: `buildTenantAuth(SINGLE_SHIM_TENANT, singletonDb)`, where `SINGLE_SHIM_TENANT.id === "single"` — this pins `registryMode` to `false` inside the factory regardless of the `TENANT_MODE` env var, guaranteeing the shim is always byte-identical to the pre-refactor object. Not deleted this wave (scheduled for 24-10, alongside the `db` export).
- `src/lib/tenant/pool-manager.ts`: `type TenantDb` → `export type TenantDb` (was declared but unexported; 24-02 through 24-05 all need to import it).
- `src/lib/tenant/auth-cache.ts` created: `getTenantAuth(tenant, db)` mirrors `getTenantDb`'s (pool-manager.ts) and `getTenantMailer`'s (24-01 mailer-cache.ts) exact single-mode short-circuit + hot-reload-safe global Map + insertion-order LRU shape. Single mode / `tenant.id === "single"` → returns the `auth` compat shim untouched. Registry mode → lazily builds + caches a per-tenant instance via `buildTenantAuth`, evicting the oldest entry past `TENANT_POOL_MAX` (default 20). A `bustTenantAuthCache()` export is provided but has no caller yet (left for Phase 26, alongside `bustTenantRegistry()`).
- `src/app/api/auth/[[...all]]/route.ts` rewritten: replaces `toNextJsHandler(auth.handler)` with a `handler(req)` function that calls `const { tenant, db } = await getTenantContext()` then `getTenantAuth(tenant, db).handler(req)`, exported as `{ GET, POST }` — the same two methods the old `toNextJsHandler` destructuring exposed. In single mode, `getTenantContext()` always resolves the synthesized single tenant (Host ignored, per registry.ts) and `getTenantAuth()` short-circuits to `auth`, so `auth.handler(req)` is invoked exactly as before.

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert auth.ts to buildTenantAuth(tenant, db) factory; keep `auth` as compat shim** - `940e327` (feat)
2. **Task 2: auth-cache.ts (getTenantAuth) + catch-all Host dispatch** - `0ceceff` (feat)

## Files Created/Modified

- `src/lib/auth.ts` (modified) - `buildTenantAuth(tenant, tenantDb)` factory + `tenantTrustedOrigins(tenant)` helper; `export const auth` compat shim retained
- `src/lib/tenant/pool-manager.ts` (modified) - `TenantDb` type now exported (single-line change, no other edits)
- `src/lib/tenant/auth-cache.ts` (created) - `getTenantAuth(tenant, db)`, `bustTenantAuthCache()`, hot-reload-safe `global.__tenantAuths` Map with LRU cap
- `src/app/api/auth/[[...all]]/route.ts` (modified) - Host-resolved per-tenant dispatch replacing `toNextJsHandler(auth.handler)`

## Decisions Made

- `baseURL` expression kept on one source line (`process.env.BETTER_AUTH_URL ?? (registryMode ? publicOrigin(tenant) : undefined)`) rather than wrapped, to satisfy the plan's literal acceptance regex `BETTER_AUTH_URL \?\? \(registryMode` and to keep the single-mode-preserving logic visually atomic at the call site.
- `buildTenantAuth`'s db parameter renamed from the plan's illustrative `db` to `tenantDb` inside the function body, so `drizzleAdapter(db,` (the module-singleton-binding pattern being removed) no longer appears anywhere in the file — this is what the acceptance criterion `rg "drizzleAdapter\(db," → 0` actually proves. External call sites (`buildTenantAuth(tenant, db)` in the compat shim and in auth-cache.ts) are unaffected since parameter names aren't part of the call signature.
- `auth.ts` defines its own local `TenantDb` type alias (`MySql2Database<typeof schema>`) instead of importing the pool-manager.ts export, keeping Task 1 independently compilable before Task 2's pool-manager.ts export change lands within the same plan. TypeScript's structural typing makes the two aliases interchangeable everywhere they meet (auth-cache.ts imports the pool-manager.ts alias and passes values into `buildTenantAuth` without friction).
- `sendWelcomeEmail(user.email, user.name)` inside the hook is left without a tenant argument, exactly as the plan specifies (send-emails.ts doesn't accept one yet); a `TODO(24-09)` comment marks the line for that plan to close.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking/verification] Reformatted the `baseURL` line to a single line**
- **Found during:** Task 1 self-verification (acceptance grep)
- **Issue:** The initial implementation wrapped `baseURL: process.env.BETTER_AUTH_URL ??` and `(registryMode ? publicOrigin(tenant) : undefined)` across two lines for readability. The plan's acceptance criterion `rg "BETTER_AUTH_URL \?\? \(registryMode" src/lib/auth.ts` is a single-line regex and did not match across the line break.
- **Fix:** Collapsed to one line: `baseURL: process.env.BETTER_AUTH_URL ?? (registryMode ? publicOrigin(tenant) : undefined),`
- **Files modified:** `src/lib/auth.ts`
- **Commit:** `940e327` (folded into the Task 1 commit before it was made — no separate commit)

**2. [Rule 3 - Blocking/verification] Removed a `toNextJsHandler` mention from a route.ts comment**
- **Found during:** Task 2 self-verification (acceptance grep)
- **Issue:** The route.ts doc comment explaining the before/after behavior referenced the literal string `toNextJsHandler(auth.handler)` for context. The plan's acceptance criterion `rg "toNextJsHandler" src/app/api/auth` requires 0 matches anywhere in the directory, including comments.
- **Fix:** Reworded the comment to describe the old pattern without using the literal function name (`"the previous direct-handler-dispatch setup"`).
- **Files modified:** `src/app/api/auth/[[...all]]/route.ts`
- **Commit:** `0ceceff` (folded into the Task 2 commit before it was made — no separate commit)

## Issues Encountered

None beyond the two acceptance-grep deviations above, both resolved before committing.

## User Setup Required

None. No external service configuration required; `TENANT_MODE` stays unset/`single` in every deployed environment for this wave.

## Next Phase Readiness

- `buildTenantAuth(tenant, db)` and `getTenantAuth(tenant, db)` exist and are ready for 24-03's guard evolution (`requireAdmin`/`requireUser`/`getSessionUser` returning `{ session, tenant, db, auth }`) and for `context.ts` to add `auth` to its resolved shape (per 24-PATTERNS.md's "Guards" shared pattern — deliberately NOT done in this plan, `context.ts` was untouched).
- The `export const auth` compat shim remains fully live for every currently un-swept importer (`src/lib/auth-helpers.ts`, `src/app/(admin)/layout.tsx`, `src/app/(auth)/{login,register}/page.tsx`, `src/actions/{account,admin-profile,account-close}.ts`) — none of these were touched this wave, matching the plan's `files_modified` scope exactly.
- `TenantDb` is now exported from `pool-manager.ts` for 24-03/24-04/24-05 to import directly.

## Verification

- `npx tsc --noEmit` (filtered `| grep -v '^\.next/'` per plan note): **0 output, exits 0 — CLEAN**, confirmed after Task 1, after Task 2, and again as a final check.
- `rg "export function buildTenantAuth" src/lib/auth.ts` → matched (line 66)
- `rg -c "trustedOrigins: \[" src/lib/auth.ts` → 0 (the array literal moved inside `tenantTrustedOrigins`'s two `return [...]` branches; the `betterAuth({...})` call site itself uses `trustedOrigins: tenantTrustedOrigins(tenant)`)
- `rg "tenantTrustedOrigins" src/lib/auth.ts` → matched (definition line 36, call site line 197)
- `rg "BETTER_AUTH_URL \?\? \(registryMode" src/lib/auth.ts` → matched (line 83)
- `rg "drizzleAdapter\(db," src/lib/auth.ts` → 0 matches
- `rg "export type TenantDb" src/lib/tenant/pool-manager.ts` → matched (line 25)
- `rg "export function getTenantAuth" src/lib/tenant/auth-cache.ts` → matched (line 48)
- `rg -c "TENANT_MODE" src/lib/tenant/auth-cache.ts` → 4 (>=1 required)
- `rg "getTenantContext" "src/app/api/auth/[[...all]]/route.ts"` → matched (import + 2 comment references + call site)
- `rg -rc "toNextJsHandler" src/app/api/auth` → 0
- `git diff --diff-filter=D --name-only HEAD~2 HEAD` → empty (no accidental file deletions across both task commits)
- `git status --short` after both commits shows only pre-existing untracked `.agents/`, `skills-lock.json`, and this phase's `24-01-SUMMARY.md` (out of scope for this plan, not staged/committed)

**Single-mode byte-identical proof:** `rg "TENANT_MODE" src/lib/tenant/auth-cache.ts` (4 matches, all inside `getTenantAuth`'s guard clause `if (process.env.TENANT_MODE !== "registry" || tenant.id === SINGLE_TENANT_ID) { return auth; }`) proves the registry-mode branch (`buildTenantAuth(tenant, db)`, cache insert, LRU evict) is dead code under the deployed `TENANT_MODE` (unset/`single`) — every request returns the exact same `auth` object reference. Combined with `rg "BETTER_AUTH_URL \?\? \(registryMode" src/lib/auth.ts` (line 83 — the compat shim's `SINGLE_SHIM_TENANT.id === "single"` forces `registryMode` to `false` inside `buildTenantAuth` regardless of the `TENANT_MODE` env var), `baseURL` on the shim evaluates to `process.env.BETTER_AUTH_URL ?? undefined`, i.e. `undefined` whenever `BETTER_AUTH_URL` is unset — Better Auth's per-request origin inference is preserved exactly as it was before this refactor.

## Self-Check: PASSED

- `src/lib/auth.ts` — FOUND (modified)
- `src/lib/tenant/pool-manager.ts` — FOUND (modified)
- `src/lib/tenant/auth-cache.ts` — FOUND (created)
- `src/app/api/auth/[[...all]]/route.ts` — FOUND (modified)
- Commit `940e327` — FOUND in `git log --oneline`
- Commit `0ceceff` — FOUND in `git log --oneline`

---
*Phase: 24-singleton-dissolution-sweep*
*Completed: 2026-07-13*
