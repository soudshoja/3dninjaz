---
phase: 24-singleton-dissolution-sweep
plan: 08
subsystem: multi-tenant
tags: [multi-tenant, category-a, category-a2, category-c, customer-actions, guest-actions, requireUser, getTenantContext, tenant-db, sc4-money-path, sc5-outbound-urls, b2-auth-singleton]

# Dependency graph
requires:
  - phase: 24-singleton-dissolution-sweep
    plan: 04
    provides: "getTenantContext() extended to return { tenant, db, auth }; tenant-aware publicUrl/publicOrigin(tenant)"
  - phase: 24-singleton-dissolution-sweep
    plan: 05
    provides: "guard-supplied-db precedent for optional-trailing-db (D-D1) shared-lib shapes reused by internal helpers in this plan"
provides:
  - "17 customer/guest server-action files + 2 store RSC pages source db from const { db, ...session } = await requireUser() / const { db } = await requireAdmin() / const { db } = await getTenantContext() (per-export, VARIANT 1 vs VARIANT 2) — zero @/lib/db value imports remain in this batch"
  - "account.ts + account-close.ts resolve Better Auth's auth client from getTenantContext() instead of the @/lib/auth singleton (B2) — closes the last customer-side auth-singleton importer"
  - "PayPal checkout money path (paypal.ts createPayPalOrder/capturePayPalOrder/getOrderForCurrentUser) sources db from tenant context; capturePayPalOrder's order-confirmation WhatsApp link is tenant-derived via publicUrl(path, tenant) (SC5)"
  - "pos-whatsapp.ts's module-scope PUBLIC_LINK_BASE const eliminated — payment-link base now resolved inside the guarded function via publicOrigin(tenant) (B1/SC5)"
  - "shipping.ts's registerWebhooks Delyva webhook-registration URL derives from publicOrigin(tenant) fallback (B1/SC5)"
  - "reviews.ts + wishlist.ts (MIXED files): public/getSessionUser reads (listProductReviews, hasUserReviewedProduct, getReviewedProductIds, isWishlisted, getWishlistedProductIds) resolve db via getTenantContext() with NO guard added — anonymous PDP/shop rendering preserved"
affects: [24-09, 24-10, 24-11, 24-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TRANSFORM VARIANT 1 (requireUser-guarded): const { db, ...session } = await requireUser(); — REST-spread (not { db, session }) because requireUser()'s return is a flattened spread of Better Auth's { session, user } plus { tenant, db }; the composite object's own `session` key is Better Auth's session-metadata row, NOT the wrapper. REST-excluding-db preserves whole-object .user access exactly like the pre-refactor `const session = await requireUser()` pattern (verified against the already-merged admin-profile.ts analog, which uses the identical `const { db, ...session } = await requireAdmin();` shape)"
    - "TRANSFORM VARIANT 2 (anonymous / getSessionUser-only): const { db } = await getTenantContext(); resolved alongside (not replacing) the existing getSessionUser() call — both are React.cache-memoized so the double resolve is free"
    - "PER-EXPORT RULE applied to 3 MIXED files: reviews.ts, wishlist.ts, checkout-drafts.ts — guarded mutations keep VARIANT 1/requireAdmin capture; unguarded public/getSessionUser reads resolve via VARIANT 2. No guard added anywhere; guard-count-unchanged verified per-file against baseline 9a6dfb3"
    - "Internal (non-exported) helper functions that read db and lost the module-scope import thread db as a required first param, mirroring the 24-06/24-07 precedent: sumOrderWeight, _bookShipmentInternal, hydrateTrackingView (shipping.ts); expireStaleReturns (order-requests.ts, mirrors admin-order-requests.ts's sibling expireStaleReturnsAdmin(db, ...) from 24-07); productImageFallback ((store)/orders/[id]/page.tsx)"
    - "B2: account.ts + account-close.ts resolve `const { auth } = await getTenantContext();` immediately before each auth.api.changeEmail/changePassword/banUser call — React.cache-memoized, free since requireUser() already resolved tenant context upstream"
    - "SC5 outbound-URL threading confined to the plan's named channels only: paypal.ts (order-confirmation WhatsApp link), pos-whatsapp.ts (POS payment link), shipping.ts (Delyva webhook registration). payment-links.ts's own publicUrl(...) call was left single-arg (untouched) — not named in the plan's SC5 scope for this batch"
    - "src/lib/paypal.ts (the __paypalClient SDK singleton + __paypalToken OAuth cache) intentionally NOT touched — explicitly deferred to Phase 29 per the plan's decisions_for_review block"

key-files:
  created: []
  modified:
    - src/actions/paypal.ts
    - src/actions/orders.ts
    - src/actions/order-requests.ts
    - src/actions/checkout-drafts.ts
    - src/actions/coupons.ts
    - src/actions/cart.ts
    - src/actions/shipping.ts
    - src/actions/shipping-quote.ts
    - src/actions/whatsapp-order.ts
    - src/actions/pos-whatsapp.ts
    - src/actions/payment-links.ts
    - src/actions/wishlist.ts
    - src/actions/reviews.ts
    - src/actions/addresses.ts
    - src/actions/account.ts
    - src/actions/account-close.ts
    - src/actions/return-uploads.ts
    - "src/app/(store)/orders/[id]/page.tsx"
    - "src/app/(store)/account/page.tsx"

key-decisions:
  - "Corrected a mid-execution destructuring bug: initially wrote `const { db, session } = await requireUser();` across 6 files (addresses.ts, order-requests.ts, return-uploads.ts, wishlist.ts, reviews.ts, account.ts) — this extracts requireUser()'s own nested `session` key (Better Auth session-metadata, no `.user`), which would have made every `session.user.id` access a tsc compile error. Caught before committing by cross-checking the already-merged admin-profile.ts analog (`const { db, ...session } = await requireAdmin();`), which uses REST-spread. Fixed all 6 files to the REST-spread form before running tsc/acceptance checks — tsc came back clean on the corrected version."
  - "account.ts's changePassword needs session.user.email/name but NOT db (original code never touched the DB in this function) — resolved as plain `const session = await requireUser();` (whole-object, backward-compatible pattern) rather than forcing an unused `db` destructure."
  - "shipping.ts's registerWebhooks: replaced the 3-env-var chain (NEXT_PUBLIC_SITE_URL ?? NEXT_PUBLIC_BASE_URL ?? BETTER_AUTH_URL ?? \"\") by appending publicOrigin(tenant) as the final fallback (was \"\"). Preserves the exact original priority order and byte-identical behavior whenever any of the three env vars is set (the deployed reality in both dev and prod); only diverges from the pre-refactor code in the never-occurring all-three-unset case, where it now resolves to publicOrigin's own SITE.url fallback instead of returning an error. tenant is captured via `const { tenant } = await requireAdmin();` — db is not needed in this function so it is not destructured."
  - "shipping.ts's _bookShipmentInternal, sumOrderWeight, and hydrateTrackingView are called from a mix of requireAdmin-guarded exports and 2 no-guard exports (autoBookShipmentAfterPayment — trusted server-only caller; getMyOrderTracking — getSessionUser-guarded). Rather than resolving db independently inside each internal helper (which would silently re-derive a possibly-different tenant db per call in a future registry-mode world), db is threaded as a required first parameter from each caller's own already-resolved guard/context — same shape as the 24-06/24-07 Category-D precedent (TenantDb param threading)."
  - "Per-file guard-count-unchanged proof (B2, the load-bearing check): computed grep -cE 'requireAdmin\\(|requireUser\\(' against baseline commit 9a6dfb3 for every one of the 17 action files — all 17 identical before vs after (see Verification). No requireAdmin/requireUser call was added to, or removed from, any export."

requirements-completed: [TEN-02]

# Metrics
duration: ~70min
completed: 2026-07-13
---

# Phase 24 Plan 08: Wave 5 — Customer Checkout Money Path + Guest Actions + Account Auth (B2) Summary

**17 customer/guest server-action files plus 2 store RSC pages now source `db` from the guard (`requireUser`/`requireAdmin`) or `getTenantContext()` per-export; PayPal checkout + POS WhatsApp payment link + Delyva webhook registration URLs are tenant-derived (SC5); `account.ts`/`account-close.ts` resolve Better Auth's `auth` client from tenant context instead of the `@/lib/auth` singleton (B2).**

## Performance

- **Duration:** ~70 min (Task 1 commit `8b04179`, Task 2 commit `5190992`)
- **Completed:** 2026-07-13
- **Tasks:** 2
- **Files modified:** 19

## Accomplishments

- **Task 1 (9 checkout/guest action files — SC4 money-path + SC5 outbound URLs):** `paypal.ts`, `orders.ts`, `coupons.ts`, `cart.ts`, `shipping.ts`, `shipping-quote.ts`, `whatsapp-order.ts`, `pos-whatsapp.ts`, `payment-links.ts`. Anonymous/`getSessionUser`-only exports resolve `db` via `getTenantContext()` (VARIANT 2). `shipping.ts` and `pos-whatsapp.ts`'s `requireAdmin`-guarded exports capture `db` (and `tenant` where needed) from the guard — never downgraded to `getTenantContext()`. `paypal.ts`'s `capturePayPalOrder` threads `tenant` into its `publicUrl(...)` WhatsApp order-link call (SC5). `pos-whatsapp.ts`'s module-scope `PUBLIC_LINK_BASE` const is eliminated; the POS payment-link base is now resolved inside `sendPosPaymentLinkWhatsApp` via `process.env.NEXT_PUBLIC_BASE_URL ?? publicOrigin(tenant)`. `shipping.ts`'s `registerWebhooks` derives its Delyva webhook-registration base with `publicOrigin(tenant)` as the final fallback in its existing env chain. `shipping.ts`'s internal (non-exported) helpers `_bookShipmentInternal`, `sumOrderWeight`, and `hydrateTrackingView` — shared by both guarded and no-guard exports — now take `db: TenantDb` as a required first parameter. `coupons.ts`'s atomic race-safe `usage_count` UPDATE inside `redeemCoupon`'s `db.transaction` is preserved byte-identical; only the `db` source changed.
- **Task 2 (7 requireUser actions + checkout-drafts + 2 store pages — B2 account auth):** `addresses.ts`, `order-requests.ts`, `return-uploads.ts` — every `requireUser()`-guarded export captures `const { db, ...session } = await requireUser();`; every ownership predicate (`eq(addresses.userId, session.user.id)`, `eq(orders.userId, session.user.id)`, etc.) preserved verbatim (IDOR). `order-requests.ts`'s `expireStaleReturns` threads `db` as a parameter, mirroring `admin-order-requests.ts`'s sibling `expireStaleReturnsAdmin(db, ...)` from 24-07. `reviews.ts` + `wishlist.ts` (MIXED, per-export): `submitReview`/`toggleWishlist`/`removeFromWishlist`/`listMyWishlist` (guarded) capture `db` from `requireUser()`; `listProductReviews`, `hasUserReviewedProduct`, `getReviewedProductIds`, `isWishlisted`, `getWishlistedProductIds` (public or `getSessionUser`-gated, no guard) resolve `db` via `getTenantContext()` — NO guard added to any of these, confirmed by guard-count-unchanged (reviews.ts 2/2, wishlist.ts 4/4). `checkout-drafts.ts` (MIXED): `saveCheckoutDraft` (guest, `getSessionUser`) resolves `db` via `getTenantContext()`; `listCheckoutDrafts`/`convertDraftToOrder`/`dismissCheckoutDraft` (`requireAdmin`) capture `db` from the guard, unchanged guard count (3/3). **`account.ts` + `account-close.ts` (B2):** removed `import { auth } from "@/lib/auth"` from both; `account.ts`'s `changeEmail`/`changePassword` and `account-close.ts`'s best-effort `banUser` call now resolve `const { auth } = await getTenantContext();` immediately before each `auth.api.*` call (React.cache-memoized, free — the guard already resolved tenant context). `account-close.ts`'s `db.transaction` (anonymize + address/wishlist cascade delete + session hard-delete) and the best-effort `banUser` flow are preserved verbatim; only the `db`/`auth` sources changed. Store pages `(store)/orders/[id]/page.tsx` and `(store)/account/page.tsx`: `import { db }` deleted, `const { db } = await getTenantContext();` added alongside the existing `getSessionUser()` identity check; both already had `export const dynamic = "force-dynamic"` (confirmed present, unchanged). `(store)/orders/[id]/page.tsx`'s internal `productImageFallback` helper now takes `db: TenantDb` as its first parameter.

## Task Commits

Each task was committed atomically:

1. **Task 1: Sweep the customer checkout money path + guest actions (9 files)** - `8b04179` (fix)
2. **Task 2: Sweep requireUser-guarded account actions + store pages (10 files) — incl. account auth (B2)** - `5190992` (fix)

Note: the Task 2 commit message was accidentally shell-mangled (backticks inside the `-m` string triggered bash command substitution, silently dropping two code-fragment phrases — "`import { auth } from "@/lib/auth"`" and "`const { auth } = await getTenantContext()`" — from two sentences). The diff content committed is 100% correct and verified (tsc clean, all acceptance criteria pass); only the prose commit message lost two inline code references. Not amended per the project's git-safety protocol (never amend without explicit user request) — documented here for the record.

## Files Modified — full enumeration (19/19 per plan frontmatter)

**Task 1 (9):**
1. `src/actions/paypal.ts` — `getTenantContext()` (createPayPalOrder, capturePayPalOrder + tenant, getOrderForCurrentUser); `publicUrl(path, tenant)` threaded (SC5)
2. `src/actions/orders.ts` — `getTenantContext()` in listMyOrders/getMyOrder/resendOrderConfirmationEmail
3. `src/actions/coupons.ts` — `getTenantContext()` in validateCoupon/redeemCoupon; atomic redemption UPDATE verbatim
4. `src/actions/cart.ts` — `getTenantContext()` in hydrateCartItems
5. `src/actions/shipping.ts` — 18 `requireAdmin`-guarded exports capture db (1 captures tenant only — registerWebhooks); 2 no-guard exports (`autoBookShipmentAfterPayment`, `getMyOrderTracking`) resolve via `getTenantContext()`; 3 internal helpers take `db: TenantDb` param; `publicOrigin(tenant)` in registerWebhooks (SC5)
6. `src/actions/shipping-quote.ts` — `getTenantContext()` in quoteForCart (public checkout path)
7. `src/actions/whatsapp-order.ts` — `getTenantContext()` in createWhatsAppOrder
8. `src/actions/pos-whatsapp.ts` — `PUBLIC_LINK_BASE` module const removed; `publicOrigin(tenant)` inside sendPosPaymentLinkWhatsApp; both exports capture `db` from `requireAdmin()`
9. `src/actions/payment-links.ts` — `getTenantContext()` in getPaymentLinkByToken/uploadPaymentProofByToken/createPaymentLinkPayPalOrder/capturePaymentLinkPayment (fully public file, no guard anywhere)

**Task 2 (10):**
10. `src/actions/addresses.ts` — `const { db, ...session } = await requireUser();` in all 6 exports; IDOR predicates verbatim
11. `src/actions/wishlist.ts` — MIXED: 3 guarded exports capture db; 2 unguarded reads resolve via `getTenantContext()`
12. `src/actions/reviews.ts` — MIXED: submitReview captures db from requireUser(); listProductReviews/hasUserReviewedProduct/getReviewedProductIds resolve via `getTenantContext()`
13. `src/actions/account.ts` — **`import { auth } from "@/lib/auth"` REMOVED**; `getTenantContext()` resolves auth before changeEmail/changePassword
14. `src/actions/account-close.ts` — **`import { auth } from "@/lib/auth"` REMOVED**; `getTenantContext()` resolves auth before best-effort banUser; db.transaction verbatim
15. `src/actions/order-requests.ts` — `const { db, ...session } = await requireUser();` in all 4 exports; `expireStaleReturns` threads db param
16. `src/actions/return-uploads.ts` — `const { db, ...session } = await requireUser();` in uploadReturnPhoto
17. `src/actions/checkout-drafts.ts` — MIXED: saveCheckoutDraft resolves via `getTenantContext()`; 3 admin exports capture db from requireAdmin()
18. `src/app/(store)/orders/[id]/page.tsx` — `getTenantContext()` alongside getSessionUser; productImageFallback takes db param; force-dynamic already present
19. `src/app/(store)/account/page.tsx` — `getTenantContext()` alongside getSessionUser; force-dynamic already present

No `files_modified` entry from the plan frontmatter was skipped — this list is a 1:1 match.

**`src/lib/paypal.ts` (the `__paypalClient` SDK singleton + `__paypalToken` OAuth cache) was intentionally NOT touched** — per the plan's `decisions_for_review` block, per-tenant PayPal credentials are a Phase 29 deliverable (PLUGIN-02/03); in `TENANT_MODE=single` the client is byte-identical, so dissolving it now would be pure churn. It remains excluded from 24-10's ESLint ban + `rg` audit per the plan.

## Decisions Made

See `key-decisions` in frontmatter. Summary: corrected a self-caught destructuring bug (REST-spread `{ db, ...session }` vs plain `{ db, session }`) before committing anything; `changePassword` uses the whole-object backward-compatible pattern since it never touches `db`; `registerWebhooks`' env chain gets `publicOrigin(tenant)` appended as the final fallback (preserves original priority order, byte-identical whenever any of the 3 original env vars is set); `shipping.ts`'s 3 internal helpers thread `db` as a required param rather than re-resolving tenant context independently; B2 auth resolution is React.cache-memoized and free after the guard already ran.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrong destructuring pattern initially applied across 6 requireUser-guarded files**
- **Found during:** Self-review before running `tsc --noEmit`, cross-checked against the already-merged `admin-profile.ts` analog
- **Issue:** Initial edits used `const { db, session } = await requireUser();` in `addresses.ts`, `order-requests.ts`, `return-uploads.ts`, `wishlist.ts`, `reviews.ts`, and `account.ts` (updateProfile). `requireUser()`'s return shape is `{ ...bettterAuthSessionResult, tenant, db }` where the Better Auth result itself already has top-level `session` and `user` keys — so plain-destructuring the composite object's `session` field extracts Better Auth's *session-metadata* row (no `.user`), not the whole wrapper. Every subsequent `session.user.id` access would have been a `tsc` compile error.
- **Fix:** Changed to REST-spread `const { db, ...session } = await requireUser();` in all 6 files (7 call sites total across the 6 files, since `addresses.ts` and `order-requests.ts` each have multiple exports), matching the exact pattern used by the already-merged `admin-profile.ts` (`const { db, ...session } = await requireAdmin();`). `account.ts`'s `changePassword` (which needs `session.user.email/name` but not `db`) was fixed instead to the simpler whole-object `const session = await requireUser();` since it never touches `db`.
- **Files modified:** `src/actions/addresses.ts`, `src/actions/order-requests.ts`, `src/actions/return-uploads.ts`, `src/actions/wishlist.ts`, `src/actions/reviews.ts`, `src/actions/account.ts`
- **Verification:** `npx tsc --noEmit` clean after the fix; re-ran all acceptance-criteria greps.
- **Commit:** fixed before either task commit was made (no separate follow-up commit needed — corrected pre-commit)

**2. [Rule 3 - blocking] `rg -L` acceptance-criteria commands in the plan do not mean "files without match" in ripgrep 14.1.1**
- **Found during:** Running the plan's literal acceptance-criteria `rg -L "..." <files>` commands
- **Issue:** `-L` in ripgrep is `--follow` (follow symlinks), not `--files-without-match`. Running the plan's literal commands printed matching *content* instead of listing non-matching files, which would have produced a false "FAIL" read (non-empty output) even though every file actually satisfied the criterion.
- **Fix:** Re-ran the same checks using `rg --files-without-match "<pattern>" <files>` (the correct flag for "list files that do NOT contain a match"), which returned empty output as expected — all files pass. No source-code change; this is a verification-tooling correction only, same class of issue 24-07 hit twice for different reasons.
- **Files modified:** None (verification-only)

---

**Total deviations:** 2 auto-fixed (1 self-caught pre-commit code correction, 1 verification-tooling flag correction) — zero behavior change to committed code in either case.
**Impact on plan:** Neither deviation affected the final committed diffs; both were caught and resolved before any commit that would have shipped the bug.

## Issues Encountered

- `shipping.ts` is the largest file in this batch (1680 lines, 18 `requireAdmin`-guarded exports + 3 shared internal helpers + 1 registry-URL-building export + 2 no-guard exports). Threading `db` through `_bookShipmentInternal`, `sumOrderWeight`, and `hydrateTrackingView` required tracing every call site (3, 2, and 2 respectively) to keep the parameter threading consistent — done via full-file line-number verification after each edit rather than trusting a single grep pass, since ripgrep's default single-line matching misses the codebase's common `db\n  .select()` multi-line chain style (confirmed via `\bdb\.` grep undercount, cross-verified with `await db\b` instead).
- `registerWebhooks`' original `base` chain could legitimately go empty-string in the pathological case where all of `NEXT_PUBLIC_SITE_URL`/`NEXT_PUBLIC_BASE_URL`/`BETTER_AUTH_URL` are unset (the code had an explicit `if (!base) return { ok: false, error: "..." }` guard for this). Appending `publicOrigin(tenant)` as the final fallback makes that branch effectively unreachable in practice (deployed dev/prod always have at least one of the three env vars set, confirmed via CLAUDE.md deploy-topology notes and the pervasive existing use of `publicUrl()`/`publicOrigin()` elsewhere in the app) — flagging this as a theoretical, not practical, single-mode behavior difference.

## User Setup Required

None. `TENANT_MODE` stays unset/`single` in every deployed environment; every guard's/`getTenantContext()`'s resolved `db` short-circuits to today's singleton pool (per 24-03), so all 19 files in this batch are byte-identical in behavior today.

## Next Phase Readiness

- The customer/guest side of the sweep is complete: every `src/actions/*.ts` file serving a customer or guest checkout/account flow now sources `db` from context or a guard.
- `account.ts` + `account-close.ts` are off the `@/lib/auth` singleton — `rg 'from "@/lib/auth"' src/actions/account.ts src/actions/account-close.ts` returns 0, closing out B2 for the customer-side action set (24-07 already closed it for the admin side via `admin-profile.ts`).
- SC5 (outbound URLs tenant-derived, never Host-derived) now covers the PayPal checkout path, the POS WhatsApp payment link, and the Delyva webhook-registration URL — matching the plan's stated scope for this batch.
- `src/lib/paypal.ts`'s SDK/token singletons remain, tracked explicitly for Phase 29 (not this sweep's scope).
- Per `24-PATTERNS.md`'s global verification (`rg "from \"@/lib/db\"" src/actions src/app | rg -v "/lib/db/schema"`), only the 8 Category B route-handler files remain (`webhooks/delyva`, `paypal/webhook`, `events/track`, `subscribe`, `unsubscribe`, `admin/upload-font`, `admin/subscribers/export`, `admin/orders/[id]/label`) — exactly the set deferred to 24-09.

## Verification

- `npx tsc --noEmit` (raw, unfiltered, `| grep -v '^\.next/'`) — **exit clean, zero output** — run after the destructuring fix, after Task 1 staging, and once more as a final full-batch gate. `echo $?` confirmed `0`.
- `rg -l 'from "@/lib/db";' <all 19 files>` — 0 matches (db value import gone from every file; `@/lib/db/schema` type/table imports retained where needed).
- `rg --files-without-match "await getTenantContext\(\)|await requireAdmin\(\)" <9 Task-1 files>` — 0 matches (every file resolves db via context or the requireAdmin guard).
- `rg "^const PUBLIC_LINK_BASE" src/actions/pos-whatsapp.ts` — 0 matches; `rg "publicOrigin\(tenant\)" src/actions/pos-whatsapp.ts` — 1 match.
- `rg "publicOrigin\(tenant\)" src/actions/shipping.ts` — 1 match (registerWebhooks).
- `rg "publicUrl\([^)]*tenant" src/actions/paypal.ts` — 1 match (capturePayPalOrder order-link, SC5).
- `rg -l 'from "@/lib/auth"' src/actions/account.ts src/actions/account-close.ts` — 0 matches (auth singleton import gone — B2).
- `rg "getTenantContext" src/actions/account.ts src/actions/account-close.ts` — matches in both (import + resolve call sites).
- `rg --files-without-match "await requireUser\(\)" <7 requireUser files>` — 0 matches (every file still contains its guarded export).
- `rg "getTenantContext" src/actions/reviews.ts` / `src/actions/wishlist.ts` — matches in both (public/getSessionUser reads resolve via context).
- `rg "eq\(addresses.userId, session.user.id\)" src/actions/addresses.ts` — matches (IDOR ownership predicate preserved).
- **Guard-count-unchanged proof (B2, the load-bearing per-file check):** `grep -cE 'requireAdmin\(|requireUser\('` computed against baseline commit `9a6dfb3` (via `git show 9a6dfb3:<file>`) vs the current working tree, IDENTICAL for all 17 action files:
  - paypal.ts: 0/0 — orders.ts: 0/0 — coupons.ts: 0/0 — cart.ts: 0/0 — shipping.ts: 26/26 — shipping-quote.ts: 0/0 — whatsapp-order.ts: 0/0 — pos-whatsapp.ts: 3/3 — payment-links.ts: 0/0 — addresses.ts: 7/7 — wishlist.ts: 4/4 — reviews.ts: 2/2 — account.ts: 4/4 — account-close.ts: 3/3 — order-requests.ts: 5/5 — return-uploads.ts: 2/2 — checkout-drafts.ts: 3/3.
- `rg "from \"@/lib/db\"" src/actions src/app | rg -v "/lib/db/schema"` (fleet-wide) — only the 8 Category B route-handler files remain, exactly the 24-09 scope.
- `git diff --diff-filter=D --name-only HEAD~1 HEAD` (checked after both task commits) — empty both times, no accidental deletions.
- `git status --short` before each commit — confirmed only the intended files per task were staged (no `.planning/**`, no `.agents/`, no `skills-lock.json`).

## Self-Check: PASSED

- `src/actions/paypal.ts` — FOUND (modified, `getTenantContext()`, `publicUrl(path, tenant)`)
- `src/actions/orders.ts` — FOUND (modified)
- `src/actions/coupons.ts` — FOUND (modified)
- `src/actions/cart.ts` — FOUND (modified)
- `src/actions/shipping.ts` — FOUND (modified, `publicOrigin(tenant)`, `TenantDb` param threading)
- `src/actions/shipping-quote.ts` — FOUND (modified)
- `src/actions/whatsapp-order.ts` — FOUND (modified)
- `src/actions/pos-whatsapp.ts` — FOUND (modified, `PUBLIC_LINK_BASE` const gone, `publicOrigin(tenant)`)
- `src/actions/payment-links.ts` — FOUND (modified)
- `src/actions/wishlist.ts` — FOUND (modified, MIXED per-export)
- `src/actions/reviews.ts` — FOUND (modified, MIXED per-export)
- `src/actions/addresses.ts` — FOUND (modified, IDOR predicates verbatim)
- `src/actions/account.ts` — FOUND (modified, no `@/lib/auth` import)
- `src/actions/account-close.ts` — FOUND (modified, no `@/lib/auth` import, db.transaction verbatim)
- `src/actions/order-requests.ts` — FOUND (modified, `expireStaleReturns(db, ...)`)
- `src/actions/return-uploads.ts` — FOUND (modified)
- `src/actions/checkout-drafts.ts` — FOUND (modified, MIXED per-export)
- `src/app/(store)/orders/[id]/page.tsx` — FOUND (modified, `getTenantContext()`, force-dynamic present)
- `src/app/(store)/account/page.tsx` — FOUND (modified, `getTenantContext()`, force-dynamic present)
- Commit `8b04179` — FOUND in `git log --oneline`
- Commit `5190992` — FOUND in `git log --oneline`

---
*Phase: 24-singleton-dissolution-sweep*
*Completed: 2026-07-13*
