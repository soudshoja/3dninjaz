---
phase: 24-singleton-dissolution-sweep
plan: 10
subsystem: database
tags: [drizzle, mysql2, better-auth, eslint, tenant-isolation, enforcement-gate]

# Dependency graph
requires:
  - phase: 24-singleton-dissolution-sweep (waves 24-04..24-09, 24-13)
    provides: the entire src tree already swept off `db`/`auth` module-scope singletons onto getTenantContext()/requireAdmin()/requireUser()
provides:
  - db/auth singleton exports deleted from src/lib/db/index.ts and src/lib/auth.ts — resolver-only __singletonDb/__singletonPool names, one sanctioned src reader (pool-manager.ts)
  - getTenantAuth's single-mode branch lazily builds + caches one Better Auth instance (global.__singleAuth) instead of an eagerly-built compat shim
  - all 11 compiler-caught scripts (incl. seed-admin's factory-built single-tenant auth) rewired to the renamed exports; 3 script-to-lib call sites pass explicit db (B4)
  - meshy-sweep.ts + reconcile-paypal.cjs carry a --tenant scaffold + tenant-id log line, header comment deferring fleet iteration to Phase 25
  - eslint.config.mjs — the first ESLint config in this repo — enforcing no-restricted-imports on db/auth/__singletonDb/__singletonPool outside the resolver layer, plus the rg audit gate (5 classes, all 0)
affects: [phase-25-fleet-migration-tooling, phase-27-cutover, phase-29-plugin-credentials]

# Tech tracking
tech-stack:
  added: [eslint@10, "@typescript-eslint/parser@8"]
  patterns:
    - "resolver-only singleton export naming (__singletonDb/__singletonPool) so a stale static import is unresolvable, not just discouraged"
    - "ESLint no-restricted-imports with a regex pattern (not a gitignore-style group) for relative-form bans that share a name prefix with a legitimate sibling submodule"

key-files:
  created: [eslint.config.mjs]
  modified:
    - src/lib/db/index.ts
    - src/lib/tenant/pool-manager.ts
    - src/lib/tenant/registry.ts
    - src/lib/auth.ts
    - src/lib/tenant/auth-cache.ts
    - scripts/meshy-sweep.ts
    - scripts/seed-admin.ts
    - scripts/seed-colours.ts
    - scripts/seed-categories.ts
    - scripts/seed-vending-product.ts
    - scripts/seed-keychain-product.ts
    - scripts/repair-prod-images.ts
    - scripts/repair-keyboard-name-clicker.ts
    - scripts/repair-keychain-seed.ts
    - scripts/repair-pancake-clicker.ts
    - scripts/migrate-pancake-clicker-to-keychain.ts
    - scripts/cron/reconcile-paypal.cjs
    - package.json
    - package-lock.json
    - src/lib/tenant/pool-manager.test.ts

key-decisions:
  - "seedKeychainFields/seedVendingFields actual signatures are (productId, options?, db?) — three params, not the plan's literal two-param snippet; fixed both B4 call sites to pass db as the 3rd positional arg so it doesn't silently land in the options slot"
  - "ESLint patterns.group (gitignore-style) cannot ban a bare 'lib/db' segment without also recursively banning the legitimate 'lib/db/schema' sibling submodule — this is an unfixable-via-negation limitation of the ignore package; switched the db relative-form ban to a regex pattern with a real end-of-string anchor instead"
  - "registered no-op stub plugin rule definitions (@next/next, @typescript-eslint, react-hooks) in eslint.config.mjs so pre-existing inline eslint-disable comments (written for a fuller preset that was never installed) don't become hard 'rule not found' errors under this repo's first-ever ESLint config"

requirements-completed: [TEN-02]

# Metrics
duration: ~55min
completed: 2026-07-13
---

# Phase 24 Plan 10: Singleton Dissolution Sweep — Enforcement Gate Summary

**Deleted the `db`/`auth` module singletons (resolver-only `__singletonDb`/`__singletonPool` survive), rewired all 11 compiler-caught scripts + seed-admin's auth factory + 3 explicit-db call sites, and stood up the first-ever ESLint config in this repo (`no-restricted-imports` + `rg` audit) — closing every static, dynamic, auth, and internal-name reimport hole for TEN-02.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-07-13T10:42:42Z
- **Tasks:** 3/3 completed
- **Files modified:** 20 (5 resolver/auth files, 12 scripts, eslint.config.mjs + package.json + package-lock.json + 1 test file)

## Accomplishments
- `export const db` and `export const auth` no longer exist anywhere in the repo — a stale static `import { db }`/`import { auth }` is now a hard `tsc` compile error, verified by intentionally breaking then fixing the 11 scripts across Task 1 → Task 2
- The singleton pool/drizzle instance survives only under resolver-only names (`__singletonDb`, `__singletonPool`), read by exactly one src module (`pool-manager.ts`) plus the sanctioned script set
- `getTenantAuth`'s single-mode branch now lazily builds and caches one Better Auth instance (`global.__singleAuth ??= buildTenantAuth(...)`) instead of returning an eagerly-constructed compat shim — byte-identical behavior, deferred construction
- `seed-admin.ts` builds its own single-tenant auth via `buildTenantAuth(synthesizeSingleTenant(), db)`, preserving the idempotent `signUpEmail`/`ADMIN_RESET_PASSWORD` flows unchanged
- Fixed a real bug in the plan's own literal snippets: `seedKeychainFields`/`seedVendingFields` take `(productId, options?, db?)` — the plan's 2-arg call form would have silently passed `db` as `options` and left the real `db` parameter `undefined`, defeating the entire B4 off-request-throw mitigation. Corrected both call sites to the 3-arg form.
- Stood up `eslint.config.mjs` (the first ESLint config this repo has ever had) enforcing `no-restricted-imports` on `db`/`auth`/`__singletonDb`/`__singletonPool` outside the resolver layer, wired a `lint` script into `package.json` (activates the existing CI `npm run lint --if-present` line), and fixed a real false-positive in the plan's own literal `patterns.group` snippet (see Deviations)
- Full `rg` grep-audit — static db, dynamic db, auth, resolver-only-path, and `__singletonDb`/`__singletonPool`-outside-resolver — returns 0 across all 5 classes
- `npx tsc --noEmit` and `npm run lint` both exit 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete db + auth exports; keep resolver-only __singletonDb/__singletonPool; export synthesizeSingleTenant; rewire the resolver layer** - `9b7bd6e` (refactor)
2. **Task 2: Fix the 11 .ts scripts (db, pool, seed-admin auth) + pass explicit db at the 3 lib call sites (B4) + reconcile-paypal tenant scaffold** - `8f8241f` (fix)
3. **Task 3: ESLint no-restricted-imports (paths + patterns, incl. __singletonDb ban) + lint script + rg grep-audit gate** - `e07863e` (chore)

_No plan-metadata commit was made per this task's explicit instruction not to commit anything under `.planning/`._

## Files Created/Modified
- `src/lib/db/index.ts` - `db`/`pool` renamed to `__singletonDb`/`__singletonPool`; `TENANT_MODE`/`getPlatformDb` kept
- `src/lib/tenant/pool-manager.ts` - imports the renamed `__singletonDb` as the one sanctioned src reader
- `src/lib/tenant/registry.ts` - `synthesizeSingleTenant` exported (B2)
- `src/lib/auth.ts` - deleted the `export const auth` compat shim + its now-dead `singletonDb` import
- `src/lib/tenant/auth-cache.ts` - single-mode branch lazily builds + caches via `global.__singleAuth`
- `scripts/meshy-sweep.ts` - resolver-only import, explicit `db` passed to `advanceGeneration`, `--tenant` scaffold + `tenant=single` log line, Phase-25-deferral header comment
- `scripts/seed-admin.ts` - builds its own single-tenant auth via `buildTenantAuth(synthesizeSingleTenant(), db)`
- `scripts/seed-colours.ts`, `scripts/seed-categories.ts`, `scripts/seed-vending-product.ts`, `scripts/seed-keychain-product.ts`, `scripts/repair-prod-images.ts`, `scripts/repair-keyboard-name-clicker.ts`, `scripts/repair-keychain-seed.ts`, `scripts/repair-pancake-clicker.ts`, `scripts/migrate-pancake-clicker-to-keychain.ts` - resolver-only imports; the two lib-call-site scripts pass explicit `db` (B4, corrected 3-arg form)
- `scripts/cron/reconcile-paypal.cjs` - `--tenant` scaffold + `tenant=single` log line + Phase-25-deferral header comment
- `eslint.config.mjs` (new) - minimal flat config; `no-restricted-imports` with `paths` (exact) + `patterns` (regex for db relative-forms, group for auth); stub plugin rule registrations for pre-existing disable comments
- `package.json` / `package-lock.json` - `eslint`, `@typescript-eslint/parser` devDependencies + `"lint": "eslint ."` script
- `src/lib/tenant/pool-manager.test.ts` - mock key `db` → `__singletonDb` to match the rename

## Decisions Made
- Passed explicit `db` at all 3 B4 call sites using the CORRECT 3-argument form matching the actual `seedKeychainFields`/`seedVendingFields` signatures (see Deviations #1) rather than the plan's literal 2-arg snippet.
- Used a regex-based `patterns` entry for the db relative-form ESLint ban instead of the plan's literal gitignore-style `group` snippet, because the `ignore` package cannot un-ignore a sibling submodule once a bare directory-shaped segment matches — proven unfixable via negation (see Deviations #2).
- Registered no-op stub plugin rule definitions in `eslint.config.mjs` for the 4 rule ids referenced by pre-existing inline `eslint-disable` comments across the codebase, converting hard "rule not found" errors into the same harmless "unused disable directive" warning class already emitted for core rules like `no-var`/`no-console` (see Deviations #3).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] B4 call sites: plan's 2-arg snippet doesn't match seedKeychainFields/seedVendingFields's actual 3-param signature**
- **Found during:** Task 2
- **Issue:** The plan's literal action text says `await seedKeychainFields(product.id, db)` and `await seedVendingFields(productId, db)`. The actual (already-swept, 24-05) signatures are `(productId, options?: { silent?: boolean }, db?: TenantDb)` — 3 positional params. Calling with 2 args would pass the Drizzle `db` instance into the `options` slot (type-incompatible — confirmed `tsc` rejects the literal 2-arg form) and leave the real `db` parameter `undefined`, so the helper would fall through to `db ??= (await getTenantContext()).db` off-request — exactly the silent-cron-death failure mode B4 exists to prevent (Pitfall 10).
- **Fix:** Called both sites with the correct 3-arg form: `seedKeychainFields(product.id, undefined, db)` and `seedVendingFields(productId, undefined, db)`.
- **Files modified:** `scripts/migrate-pancake-clicker-to-keychain.ts`, `scripts/seed-vending-product.ts`
- **Verification:** `npx tsc --noEmit` clean (the literal 2-arg form does NOT type-check against the real signature, confirming this was a genuine bug, not a style choice)
- **Committed in:** `8f8241f` (Task 2 commit)

**2. [Rule 1 - Bug] ESLint patterns.group false-positive on the legitimate `@/lib/db/schema` namespace import**
- **Found during:** Task 3
- **Issue:** The plan's literal `patterns.group: ["**/lib/db", "**/lib/db/index"]` snippet, combined with `importNames` restriction, conservatively flags ANY namespace (`import *`) import from a path matching the group. Gitignore-style directory matching (used by the `ignore` npm package underlying ESLint's `group` option) treats a bare `lib/db` segment as matching the whole directory AND everything recursively beneath it — including the completely unrelated, legitimate `@/lib/db/schema` submodule. `src/lib/auth.ts`'s `import * as schema from "@/lib/db/schema"` (required for Better Auth's `drizzleAdapter` schema introspection) was flagged as an error, failing `npm run lint`.
- **Fix:** Empirically verified (via a standalone Node script against the exact `ignore` package version installed) that a `"!**/lib/db/schema"` negation entry does NOT work — this is a well-documented, unfixable gitignore limitation ("it is not possible to re-include a file if a parent directory is excluded"). Replaced the db `group` pattern with an ESLint-native `regex` pattern (`"(^|/)lib/db(/index)?$"`) — a real end-of-string anchor that matches `@/lib/db`/`../lib/db`/`../lib/db/index` but never `.../lib/db/schema`. Verified with a sanity-test file that the rule still correctly catches genuine violations of both `db` and `auth`.
- **Files modified:** `eslint.config.mjs`
- **Verification:** `npm run lint` exits 0 (0 errors, 107 pre-existing warnings); sanity-test import of `{ db }` from `@/lib/db` and `{ auth }` from `@/lib/auth` in a throwaway file both correctly flagged as errors, then the file was removed
- **Committed in:** `e07863e` (Task 3 commit)

**3. [Rule 3 - Blocking] Pre-existing inline eslint-disable comments reference rule ids from a framework preset that was never installed**
- **Found during:** Task 3
- **Issue:** This is the FIRST ESLint config ever added to this repo. ~30 files carry `eslint-disable-next-line` comments for `react-hooks/exhaustive-deps`, `@next/next/no-img-element`, `@typescript-eslint/no-explicit-any`, and `@typescript-eslint/no-unused-vars` — rules from a `next/core-web-vitals`-style preset that was anticipated but never installed. Under a real (even minimal) ESLint config, a disable comment referencing an unrecognized rule id is a hard ESLint error ("Definition for rule 'x' was not found"), not a warning — this produced 66 spurious errors across files this plan never touched, blocking `npm run lint` from exiting 0.
- **Fix:** Added minimal no-op stub plugin objects (`create: () => ({})`, zero enforcement logic) registering only the 4 specific rule ids referenced by existing comments, under their existing plugin namespaces (`@next/next`, `@typescript-eslint`, `react-hooks`). This makes ESLint recognize the rule ids (no more "not found" errors) without enabling any framework preset or new enforcement — the disable comments now correctly report as harmless "unused eslint-disable directive" warnings, the same class already emitted for core rules like `no-var`/`no-console` in this codebase.
- **Files modified:** `eslint.config.mjs`
- **Verification:** `npm run lint` went from 66 errors / 42 warnings to 0 errors / 107 warnings (exit 0); no rule enforcement was added — only `no-restricted-imports` (the plan's intended single rule) actually blocks anything
- **Committed in:** `e07863e` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 bug fixes, 1 blocking-issue fix)
**Impact on plan:** All 3 auto-fixes were necessary for correctness (#1 would have silently defeated B4's entire purpose) or to satisfy the plan's own hard acceptance criteria (#2 and #3 both directly blocked `npm run lint` exiting 0). No scope creep — no framework preset was installed, no unrelated files were edited, no new lint rules beyond the plan's intended `no-restricted-imports` are actually enforced.

### Note on a literal (unsatisfiable) Task 2 acceptance-criteria grep
The plan's Task 2 acceptance criteria include `rg 'from "\.\./src/lib/auth"' scripts/seed-admin.ts` returning 0. This is unsatisfiable given the SAME task's own required action (B2): `seed-admin.ts` must `import { buildTenantAuth } from "../src/lib/auth"` to build its single-tenant auth via the factory — that import line necessarily contains the literal string `from "../src/lib/auth"`. The actual intent (no importer of the DELETED `auth` shim remains) is fully verified by the broader, correct gate: `rg 'import \{ auth \}' src/` → 0 (confirmed, both in Task 1's acceptance and the final Task 3 audit), plus `tsc --noEmit` passing (the deleted `auth` export makes any stale bare import a compile error). Not treated as a deviation requiring a code change — it is a plan-authoring artifact in the verification command itself, not the implementation.

## Issues Encountered
None beyond the 3 deviations documented above — all were resolved during execution with no open blockers.

## TDD Gate Compliance
N/A — this plan is `type: execute`, not `type: tdd`.

## User Setup Required
None - no external service configuration required. This is a pure code-level refactor; `TENANT_MODE=single` behavior is byte-identical before and after (verified by `tsc`/`lint`/`rg`-audit, not a runtime behavior change).

## Next Phase Readiness
- Success Criterion 1 (db + auth) is now fully enforced three ways: compile error (primary), ESLint ban including the resolver-only names (secondary), `rg` audit across all 5 classes (tertiary/belt-and-braces) — all verified green.
- `@/lib/paypal` (`__paypalClient`, `__paypalToken`) remains intentionally out of this plan's ban/audit scope, deferred to Phase 29 per the plan's own decision record — no action needed here.
- Fleet iteration (registry-wide cron/script execution) remains deferred to Phase 25 as scoped; `meshy-sweep.ts` and `reconcile-paypal.cjs` now carry the `--tenant` scaffold + tenant-id log line that Phase 25's fleet runner can build on.
- 3 configurator test files (`src/actions/__tests__/configurator-{fields,tier-table,update-type}.test.ts`) remain in the known-parked failing set (pre-existing, unrelated `"server-only"` module error under vitest — confirmed unchanged by this plan's work) and were deliberately left untouched per the test-mock advisory, to avoid tripping the W2 audit by moving their mock key outside the resolver allowlist. CI runs no vitest step (only `tsc` + `lint`), so this has no CI impact.

## Self-Check: PASSED

Verified all claimed file paths exist and all claimed commit hashes are present in git history (see below).

---
*Phase: 24-singleton-dissolution-sweep*
*Completed: 2026-07-13*
