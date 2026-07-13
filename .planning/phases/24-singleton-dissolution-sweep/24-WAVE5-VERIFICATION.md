---
phase: 24-singleton-dissolution-sweep
scope: WAVE 5 (plans 24-06, 24-07, 24-08, 24-09)
verified: 2026-07-13T00:00:00Z
verifier: Claude (independent Wave-5 pre-deletion verification)
commit_range: a8c293c^..a6c6bbb
baseline: 9a6dfb3
working_tree: a6c6bbb (source files clean — verification ran against the exact Wave-5 end state)
verdict: GO
tsc: pass (npx tsc --noEmit exit 0)
guard_count_invariant: pass (0/68 mismatches vs baseline)
blockers: []
advisories:
  - "Test-file vi.mock('@/lib/db') factories (5 files) return { db } — after Wave 6 renames the export to __singletonDb these mocks go stale. NOT a blocker: no static import (tsc-safe), CI runs no vitest, zero production/runtime impact. Recommend 24-10 update the mock keys or note it."
---

# Phase 24 — WAVE 5 Pre-Deletion Verification

**Contract:** behavior-preserving refactor on a LIVE store; under `TENANT_MODE=single` every runtime behavior must be BYTE-IDENTICAL. This report certifies whether the destructive Wave 6 (24-10, which deletes `export const db` and `export const auth`) is safe to proceed.

**Working tree state:** HEAD == `a6c6bbb` (last Wave-5 commit). `git status` shows only planning docs modified; all 68 source files are clean. Verification therefore ran against the exact Wave-5 end state. `git diff --stat 9a6dfb3 a6c6bbb -- src/` = 68 files, matching the union of the four plans' `files_modified` exactly (24-06:18, 24-07:20, 24-08:19, 24-09:11, with `src/lib/auth.ts` shared into 24-09).

## VERDICT: GO for Wave 6 deletion

`tsc --noEmit` is green, so Wave 6's compile-error gate will function. Every remaining reference to the `db`/`auth` singletons is either (a) the sanctioned resolver/factory layer that 24-10 explicitly rewires, or (b) a STATIC import that the compiler will surface the instant the export is renamed/deleted. There are **zero compiler-invisible surviving references** — no dynamic `import("@/lib/db")`/`import("@/lib/auth")`, no barrel re-exports, no aliasing that would silently yield `undefined`.

---

## CENTRAL RISK — compiler-invisible surviving references (all ruled out)

| Path class | Method | Result |
|---|---|---|
| Dynamic `import("@/lib/db")` value import | grep `import\(...@/lib/db...\)` in src | **0** — send-emails.ts's two former `await import("@/lib/db")` (baseline lines 383, 452) are now `getTenantContext()` (lines 401, 472). Only `@/lib/db/schema` dynamic imports remain (intentional, B3). |
| Dynamic `import("@/lib/auth")` value import | grep in src | **0** |
| Barrel / re-export (`export { db } from`, `export … from "@/lib/db"`) | grep in src | **0** |
| `require("@/lib/db"|"@/lib/auth")` | grep in src | **0** |
| String/template module refs | grep `"@/lib/db"`/`"@/lib/auth"` | Only test-file `vi.mock("@/lib/db")` (5 files) — advisory, see below |
| `global.__*` singleton coupling to the deleted exports | grep all `global.__*` | None couple to `export const db`/`auth`. Deferred globals documented + untouched (below). |

### global.__* singleton audit (which touch the deletion vs deferred)

| Global | File | Disposition |
|---|---|---|
| `__mysqlPool` | db/index.ts | Module-internal to the db module; wrapped by the `pool` const. Untouched by db/auth export deletion. |
| `__paypalClient`, `__paypalToken` | src/lib/paypal.ts | **DEFERRED to Phase 29** (PLUGIN-02/03). Documented in 24-08 + 24-10 decisions. `src/lib/paypal.ts` is UNTOUCHED in Wave 5 (`git diff --stat` empty). Not in 24-10 ESLint ban / rg audit by design. Byte-identical in single mode. |
| `__mailTransport` | src/lib/mailer.ts | Deferred — enforced by `getMailer()` encapsulation (zero external importers), not export deletion. Untouched by db/auth deletion. |
| `__storeSettingsCache`, `__whatsappSettingsCache` | store-settings.ts, whatsapp/settings.ts | Now tenant-scoped `Map` (Pitfall-8 fix from earlier waves). Untouched by db/auth deletion. |
| `__tenantRegistry`, `__tenantPools`, `__platformPool`, `__tenantMailers`, `__tenantAuths` | resolver layer | Resolver caches — correct. `__singleAuth` (24-10) does not yet exist (created in Wave 6) — correct. |

**Conclusion:** deleting `export const db`/`export const auth` in Wave 6 does not touch any of the deferred globals.

---

## Definitive remaining `@/lib/db` and `@/lib/auth` value-importers

| Importer | Line | Import | Classification | 24-10 handling |
|---|---|---|---|---|
| `src/lib/tenant/pool-manager.ts` | 8 | `import { db as singletonDb } from "@/lib/db"` | **(a) SANCTIONED** — the ONE src reader of the singleton | Task 1(b): rename to `import { __singletonDb as singletonDb }`. STATIC → compiler-caught if missed. |
| `src/lib/auth.ts` | 5 | `import { db as singletonDb } from "@/lib/db"` (sole consumer = the `export const auth` compat shim at line 223) | **(a) SANCTIONED** factory file; STATIC compiler-visible | Task 1(d): delete `export const auth` shim + `SINGLE_SHIM_TENANT` + this import. STATIC → compiler-caught if missed. |
| `src/lib/tenant/registry.ts` | 3 | `import { TENANT_MODE } from "@/lib/db"` | **(a) SANCTIONED** — imports `TENANT_MODE`, NOT the `db` value | 24-10 keeps `export const TENANT_MODE`. No action needed. |
| `src/lib/tenant/auth-cache.ts` | 2 | `import { auth, buildTenantAuth } from "@/lib/auth"` | **(a) SANCTIONED** resolver; STATIC compiler-visible | Task 1(e): rewire single-mode branch to `global.__singleAuth ??= buildTenantAuth(...)`; remove the `auth` import. STATIC → compiler-caught if missed. |

**Type-(b) MISSes (would be a BLOCKER): 0.** All four are the sanctioned resolver/factory layer, all STATIC, all named in 24-10's `files_modified` and tasks.

---

## Behavior-preservation spot-checks

| # | Check | Verdict | Evidence |
|---|---|---|---|
| 1 | `requireUser` rest-spread — `session.user.id` resolves the same value | **PASS** | `requireUser()` returns `{ ...session, tenant, db }` = `{ session, user, tenant, db }` (auth-helpers.ts:89). All sites use safe forms: `const { db, ...session }` (addresses ×6, wishlist ×3, reviews ×1, order-requests ×4, return-uploads ×1), `const { db, ...s }` (account-close:37), whole-object `const session = await requireUser()` (account.ts:82 — `session.user.email` correct via backward-compat spread), or bare `await requireUser()` discard (account.ts:47, auth-only). **The dangerous `const { db, session }` form appears in ZERO files** (targeted grep = 0 matches). |
| 2 | addresses.ts IDOR predicate intact | **PASS** | All 9 `eq(addresses.userId, session.user.id)` predicates present (lines 34,45,62,77,118,134,148,165,170). Only change per export: `const session =` → `const { db, ...session } =`. |
| 3 | PER-EXPORT guard preservation (no guard added/removed) | **PASS** | Automated: for all 68 files `git show 9a6dfb3:<f> \| grep -c "requireAdmin(\|requireUser("` == working-tree count. **0/68 mismatches.** |
| 4 | Mixed public reads resolve via `getTenantContext()`, NOT a new guard | **PASS** | reviews.ts `listProductReviews`(191)/`hasUserReviewedProduct`(51)/`getReviewedProductIds`(73) → getTenantContext; wishlist.ts `isWishlisted`(52)/`getWishlistedProductIds`(74) → getTenantContext; custom-fonts.ts `getActiveCustomFontsForLoader`(30)/`listCustomFonts`(17) → getTenantContext. getSessionUser null-guards preserved BEFORE db resolve (e.g. `if (!user) return false;` then `getTenantContext()`). Guards only on the mutations (submitReview→requireUser, toggle/delete font→requireAdmin). |
| 5 | PayPal money path + return_url/order link tenant-threaded; `src/lib/paypal.ts` untouched | **PASS** | paypal.ts: capture/price-derivation logic unchanged; `getSessionUser()` kept; only `db` source + `orderUrl: publicUrl(..., tenant)` (line 917) changed. No un-threaded `publicUrl` remains (only 1 call). `src/lib/paypal.ts` (`__paypalClient`) UNTOUCHED — `git diff --stat` empty. |
| 6 | coupons.ts atomic redemption byte-identical | **PASS** | `redeemCoupon` `db.transaction(...)` body (incl. race-safe `UPDATE ... usage_count`) unchanged; only added `const { db } = await getTenantContext()` before the transaction. |
| 7 | Webhook HMAC-before-resolve; idempotency tenant-scoped | **PASS** | delyva/route.ts: `verifySignature(raw,...)` at line 100 → `getTenantContext()` at line 111 (verify FIRST); idempotency key `${tenant.id}:...` (line 127); `sendOrderDeliveredEmail(..., tenant)` + `publicUrl(..., tenant)` threaded. paypal/webhook/route.ts: `verifyWebhookSignature(req, rawBody)` at line 142 (returns 400 with NO db write on failure) → `getTenantContext()` at line 157. DB-level UNIQUE (delyvaShipmentId / capture) idempotency intact. |
| 8 | subscribers/export/route.ts catch-rewrite preserves /login redirect | **PASS (confirmed, not a fall-through)** | `const guard = await requireAdmin().catch(() => null); if (!guard) { …return /login redirect }; const { db } = guard;`. requireAdmin only ever returns a truthy object or throws → `!guard` fires on EXACTLY the auth-failure path (same as old try/catch), and the early `return` prevents any fall-through to the export with a null session. Behaviorally identical. |
| 9 | send-emails.ts B3 — both dynamic db imports converted; schema imports kept; optional tenant param | **PASS** | Both `await import("@/lib/db")` → `getTenantContext()` (lines 401, 472). Inline `@/lib/db/schema` + `drizzle-orm` dynamic imports kept (402-404, 473-474). Senders carry optional trailing `tenant?: Tenant` — no caller breaks. |
| 10 | account.ts / account-close.ts auth from context; transaction/banUser verbatim | **PASS** | Both dropped `import { auth } from "@/lib/auth"`; resolve `const { auth } = await getTenantContext()` before change*/banUser. account-close.ts `db.transaction` (anonymize + address/wishlist/session delete) + best-effort banUser flow unchanged; uses `const { db, ...s }` with `s.user.id`. |
| 11 | auth.ts welcome-email threads tenant; TODO(24-09) gone; no other buildTenantAuth line changed | **PASS** | Line 117 `await sendWelcomeEmail(user.email, user.name, tenant)`; no `TODO(24-09)`; guest-order linking + reset-password already threaded from earlier waves; diff = 11 lines (welcome thread + TODO removal). Compat-shim deletion correctly left to 24-10. |
| 12 | MariaDB 10.11 — no LATERAL join introduced; JSON parse helpers intact | **PASS** | `git diff 9a6dfb3 a6c6bbb -- src/` added lines contain no `.query.*.findMany/findFirst({ with })`. Pure source-swap; paypal.ts manual two-query hydration comment preserved. |
| 13 | `getTenantContext()` returns `auth` (prerequisite for the `{ auth }` destructures) | **PASS** | context.ts:60 `return { tenant, db, auth: getTenantAuth(tenant, db) }`. In single mode `getTenantAuth` returns the same compat-shim instance (auth-cache.ts:50) → the `{ auth }` resolved in Wave 5 is byte-identical to the old `import { auth }`. |
| 14 | Single-mode Host-ignore — webhooks don't `notFound()` | **PASS** | registry.ts:116 `if (cache.singleTenant) return cache.singleTenant; // Host ignored`. Webhooks with arbitrary Host resolve to the single tenant (= singleton pool) — byte-identical. |
| 15 | `tsc --noEmit` green (the load-bearing Wave-6 gate) | **PASS** | Exit 0. Whole tree type-checks; Wave 6's compile-error safety net is armed. |

---

## Advisory (NOT a blocker)

Five test files carry `vi.mock("@/lib/db", () => ({ db: … }))`:
`src/lib/tenant/pool-manager.test.ts`, `registry.test.ts`, `src/actions/__tests__/configurator-{fields,tier-table,update-type}.test.ts`.

After Wave 6 renames the export to `__singletonDb`, these mock factories return a stale `db` key. This is **not a Wave-6 blocker**:
- No **static** `import { db } from "@/lib/db"` in any test file → `tsc --noEmit` (the branch-protection gate) does not fail.
- CI has **no `test` script and runs no vitest** (`.github/workflows/deploy.yml` verify job = `tsc --noEmit` + `lint --if-present`; no test invocation) → no CI failure.
- Test files are not in the production runtime → the live store cannot be affected (the central risk is not triggered).

Recommend 24-10 update the mock keys to `__singletonDb` (or record the deferral) so a future local `vitest` run stays green.

---

## Gaps blocking Wave 6

**None.** No type-(b) MISS, no compiler-invisible surviving reference, no behavior change detected. Proceed with the 24-10 deletion.

---

_Verified: 2026-07-13 — Claude (independent Wave-5 verification). NOT committed (verification only; no source modified)._
