---
phase: 24-singleton-dissolution-sweep
plan: 06
subsystem: admin-actions
tags: [multi-tenant, category-a, admin-actions, money-path, requireAdmin, tenant-db]

# Dependency graph
requires:
  - phase: 24-singleton-dissolution-sweep
    plan: 03
    provides: "requireAdmin()/requireUser() resolve tenant BEFORE session and return backward-compatible { session, user, tenant, db }"
  - phase: 24-singleton-dissolution-sweep
    plan: 04
    provides: "D-D1 optional-trailing-db pattern precedent (catalog.ts)"
  - phase: 24-singleton-dissolution-sweep
    plan: 05
    provides: "accounting.ts / meshy/pipeline.ts exported helpers accept optional trailing db (getAccountingSummary/getSalesReport/getAccountBalances/advanceGeneration)"
provides:
  - "18 Category-A admin server-action files source db from const { db } = await requireAdmin() (or { db, ...session } / { db, tenant, ...session } where the guard result was already captured) — zero @/lib/db value imports remain in this batch"
  - "admin-manual-orders.ts payment-link base URL (PUBLIC_LINK_BASE) is now resolved per-guarded-function via publicOrigin(tenant) — no module-scope env-origin const (B1/SC5)"
  - "Private helper functions that lost the module db import now thread db as a required positional param: recomputeOrderProfit (admin-orders.ts), recomputeOrderTotals (admin-order-edit.ts), resolveOrderIdForDispute (admin-disputes.ts), expireStaleReturnsAdmin (admin-order-requests.ts)"
affects: [24-07, 24-08, 24-09, 24-10, 24-11, 24-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Category-A guard-capture transform: await requireAdmin() (discarded) -> const { db } = await requireAdmin(); where the export already captured the guard as `session` and used session.user.id, transform to const { db, ...session } = await requireAdmin() (rest-spread keeps session.user.id working unchanged since the guard's flat-spread return already puts user at the top level)"
    - "Where BOTH session.user and tenant are needed in the same export (admin-manual-orders.ts generatePaymentLink, admin-payment-proofs.ts confirmPaymentProof): const { db, tenant, ...session } = await requireAdmin()"
    - "Private (non-exported) helpers that read db and lost the module-scope import thread db as a REQUIRED positional first param — they are only ever called from an already-guarded export's resolved db, never off-request"
    - "publicUrl()/publicOrigin() calls threaded with the guard's tenant wherever an export already had one in scope (admin-orders.ts updateOrderStatus/approveWhatsAppOrder, admin-payment-proofs.ts confirmPaymentProof)"
    - "admin-accounting.ts read wrappers (readAccountingSummary/readSalesReport/readAccountBalances) thread the guard's db into the already-optional-db D-D1 shared-lib calls from 24-05, avoiding a second getTenantContext() resolve"
    - "admin-meshy.ts pollGeneration threads the guard's db into advanceGeneration(id, db) (24-05 optional-db shape)"

key-files:
  created: []
  modified:
    - src/actions/admin-orders.ts
    - src/actions/admin-order-edit.ts
    - src/actions/admin-manual-orders.ts
    - src/actions/admin-payment-proofs.ts
    - src/actions/admin-pos.ts
    - src/actions/admin-payments.ts
    - src/actions/admin-refunds.ts
    - src/actions/admin-disputes.ts
    - src/actions/admin-recon.ts
    - src/actions/admin-invoice-import.ts
    - src/actions/admin-accounting.ts
    - src/actions/admin-production.ts
    - src/actions/admin-order-requests.ts
    - src/actions/admin-bulk-import.ts
    - src/actions/admin-meshy.ts
    - src/actions/admin-subscribers.ts
    - src/actions/admin-email-templates.ts
    - src/actions/admin-analytics.ts

key-decisions:
  - "Applied the PER-EXPORT RULE verbatim: never added a requireAdmin()/requireUser() call that wasn't already present. Every one of the 18 files' requireAdmin(/requireUser( call counts is byte-identical before vs after this plan (verified via git-show diff of counts against the pre-plan commit — see Verification)."
  - "For exports that capture db but don't otherwise reference it in the function body (e.g. admin-pos.ts getDraftLinkTemplate, admin-invoice-import.ts previewInvoice — both delegate fully to already-tenant-aware helpers), captured db uniformly per the plan's literal transform text and marked `void db;` rather than leaving the call discarded, for consistency across the whole sweep."
  - "admin-email-templates.ts: audited src/lib/email/templates.ts for a cache to bust per the plan's conditional instruction — none exists (confirmed via grep for cache/Cache — zero matches), so no cache-bust action was added, per the plan's own \"otherwise no cache action\" fallback."
  - "admin-pos.ts resolvePosCustomerId's tx parameter type (previously `Parameters<Parameters<typeof db.transaction>[0]>[0]`, referencing the now-deleted module db) was retyped to `Parameters<Parameters<TenantDb[\"transaction\"]>[0]>[0]` using the imported TenantDb type — required for the file to compile after the db import was removed; the transaction body and all call sites are unchanged (Rule 3 — blocking compile issue)."

requirements-completed: [TEN-02]

# Metrics
duration: ~55min
completed: 2026-07-13
---

# Phase 24 Plan 06: Wave 5 — Admin Actions Batch 1, Money Paths Summary

**18 Category-A admin server-action files (money-path order/payment/refund/dispute/recon actions plus ops/reporting actions) now source `db` from the guard's `const { db } = await requireAdmin()` instead of the `@/lib/db` singleton; `admin-manual-orders.ts`'s payment-link base URL is tenant-derived via `publicOrigin(tenant)` instead of a module-scope env-origin const.**

## Performance

- **Duration:** ~55 min (Task 1 commit `a8c293c`, Task 2 commit `a0925f2`)
- **Completed:** 2026-07-13
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments

- **Task 1 (9 money-path admin action files):** `admin-orders.ts`, `admin-order-edit.ts`, `admin-manual-orders.ts`, `admin-payment-proofs.ts`, `admin-pos.ts`, `admin-payments.ts`, `admin-refunds.ts`, `admin-disputes.ts`, `admin-recon.ts` — every export's `await requireAdmin()` (previously discarded or captured only as `session`) now captures `db` (and `tenant`/`...session` where needed). `import { db } from "@/lib/db"` deleted from all 9 files. `admin-manual-orders.ts`'s module-scope `PUBLIC_LINK_BASE` const (rule 8/B1/SC5) is gone — each of the three functions that build a payment-link URL (`generatePaymentLink`, `listOrderPaymentLinks`, `getActivePaymentLink`) now resolves `const base = process.env.NEXT_PUBLIC_BASE_URL ?? publicOrigin(tenant);` locally from its own guard. `publicUrl()` calls in `admin-orders.ts` (`updateOrderStatus`, `approveWhatsAppOrder`) and `admin-payment-proofs.ts` (`confirmPaymentProof`) threaded with `tenant`. Private helpers that lost the module `db` import now take it as a required first param: `recomputeOrderProfit(db, orderId)` (admin-orders.ts), `recomputeOrderTotals(db, orderId)` (admin-order-edit.ts), `resolveOrderIdForDispute(db, raw)` (admin-disputes.ts). `admin-pos.ts`'s `resolvePosCustomerId` tx-parameter type was retyped off the deleted module `db` onto the imported `TenantDb` type (compile fix, Rule 3).
- **Task 2 (9 ops/reporting admin action files):** `admin-invoice-import.ts`, `admin-accounting.ts`, `admin-production.ts`, `admin-order-requests.ts`, `admin-bulk-import.ts`, `admin-meshy.ts`, `admin-subscribers.ts`, `admin-email-templates.ts`, `admin-analytics.ts` — same transform. `admin-accounting.ts`'s three read wrappers (`readAccountingSummary`/`readSalesReport`/`readAccountBalances`) thread the guard's `db` into the already-D-D1'd shared-lib calls from 24-05 (`getAccountingSummary(range, db)` etc.) instead of letting those helpers re-resolve `getTenantContext()` internally. `admin-meshy.ts`'s `pollGeneration` threads `db` into `advanceGeneration(id, db)` (24-05's optional-db shape). `admin-order-requests.ts`'s module-private `expireStaleReturnsAdmin` now takes `db` as a required first param, called from `listOrderRequestsForOrder`. `admin-email-templates.ts` audited for a template cache to bust (plan's conditional instruction) — none exists in `src/lib/email/templates.ts`, so no cache action was added.

## Task Commits

Each task was committed atomically:

1. **Task 1: Sweep admin order/payment money-path actions (9 files)** - `a8c293c` (fix)
2. **Task 2: Sweep admin ops/reporting actions (9 files)** - `a0925f2` (fix)

## Files Modified — full enumeration (18/18 per plan frontmatter)

**Task 1 (9):**
1. `src/actions/admin-orders.ts`
2. `src/actions/admin-order-edit.ts`
3. `src/actions/admin-manual-orders.ts`
4. `src/actions/admin-payment-proofs.ts`
5. `src/actions/admin-pos.ts`
6. `src/actions/admin-payments.ts`
7. `src/actions/admin-refunds.ts`
8. `src/actions/admin-disputes.ts`
9. `src/actions/admin-recon.ts`

**Task 2 (9):**
10. `src/actions/admin-invoice-import.ts`
11. `src/actions/admin-accounting.ts`
12. `src/actions/admin-production.ts`
13. `src/actions/admin-order-requests.ts`
14. `src/actions/admin-bulk-import.ts`
15. `src/actions/admin-meshy.ts`
16. `src/actions/admin-subscribers.ts`
17. `src/actions/admin-email-templates.ts`
18. `src/actions/admin-analytics.ts`

## Decisions Made

See `key-decisions` in frontmatter. Summary: PER-EXPORT RULE applied literally (no guard added/removed, verified by count-diff against the pre-plan commit for all 18 files); db captured uniformly even in the handful of exports that don't reference it directly (delegate fully to already-tenant-aware helpers), marked `void db;` for those; admin-manual-orders.ts rule 8 fully applied (module const removed, tenant-derived per-function); admin-pos.ts's `resolvePosCustomerId` tx type retyped onto `TenantDb` as a required compile fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `admin-pos.ts` `resolvePosCustomerId`'s tx parameter type referenced the deleted module `db`**
- **Found during:** Task 1 (admin-pos.ts)
- **Issue:** `tx: Parameters<Parameters<typeof db.transaction>[0]>[0]` used `typeof db.transaction` against the module-scope `db` singleton, which this plan deletes. Left unfixed, this would be a `tsc` compile error (blocking).
- **Fix:** Imported `TenantDb` from `@/lib/tenant/pool-manager` and retyped the parameter as `Parameters<Parameters<TenantDb["transaction"]>[0]>[0]` — identical resolved type (both `TenantDb` and the old module `db` value are `MySql2Database<typeof schema>`), zero behavior change.
- **Files modified:** `src/actions/admin-pos.ts`
- **Verification:** `npx tsc --noEmit` clean.
- **Commit:** `a8c293c`

No other deviations. Both tasks matched the plan's `<action>`/`<interfaces>` code blocks (THE CATEGORY-A TRANSFORM + rules 1-8) verbatim, including the money-path special-attention items (transactions/idempotency guards/PayPal helper calls preserved verbatim; only the db SOURCE changed).

## Issues Encountered

None blocking. No test suite touches these 18 files directly (no `*.test.ts` siblings found for any of them).

## User Setup Required

None. `TENANT_MODE` stays unset/`single` in every deployed environment; `requireAdmin()`'s resolved `db` short-circuits to today's singleton pool (per 24-03), so every one of these 18 files is byte-identical in behavior today.

## Next Phase Readiness

- 18 of the ~51 Category-A guarded server-action files are now swept — the remaining Category-A batch (customer-facing + a second admin batch) is scheduled for 24-07/24-08 per the wave plan.
- The `admin-manual-orders.ts` payment-link base-URL pattern (rule 8 — module-scope outbound-URL const moved inside the guarded function, `publicOrigin(tenant)`) is now a concrete precedent for any other Category-A file discovered to have a similar module-scope env-origin const in later waves.
- `src/lib/db/index.ts`'s `export const db` singleton still cannot be deleted yet — this batch closes 18 more call sites but ~33 Category-A files plus Categories B/C and the non-request Category F surfaces remain (scheduled 24-07 onward per 24-PATTERNS.md's suggested wave structure).

## Verification

- `npx tsc --noEmit` (raw, unfiltered) — **exit 0 — CLEAN**, run after Task 1, after Task 2, and once more as a final full-repo gate after both commits.
- `rg -l 'from "@/lib/db";' <all 18 files>` — 0 matches (db value import gone from every file; `@/lib/db/schema` retained where needed).
- Guard-capture presence check (manual cross-check against ripgrep's actual `-L`/`--follow` semantics, not GNU grep's files-without-match): `rg '\{ db(, tenant)?(, \.\.\.session)? \} = await requireAdmin\(\)' <file>` for each of the 18 files individually confirmed at least one match per file — all 18 present.
- `rg -n '^\s*await requireAdmin\(\);\s*$' <all 18 files>` — 0 matches (no discarded/bare guard calls remain anywhere in the batch).
- `rg '^const PUBLIC_LINK_BASE' src/actions/admin-manual-orders.ts` — 0 matches (module-scope env-origin const removed, B1/SC5).
- `rg 'publicOrigin\(tenant\)' src/actions/admin-manual-orders.ts` — 3 matches (generatePaymentLink, listOrderPaymentLinks, getActivePaymentLink each resolve their own tenant-derived base).
- **Guard-count-unchanged proof (B2, the load-bearing per-file check):** for every one of the 18 files, `grep -oE 'requireAdmin\(|requireUser\(' <file> | wc -l` computed against the pre-plan commit (`9a6dfb3`, via `git show <base>:<file>`) and against the current working tree, are IDENTICAL — see the exact counts below. No guard was added or removed in any file.
  - admin-orders.ts: 15 / 15 — admin-order-edit.ts: 8 / 8 — admin-manual-orders.ts: 6 / 6 — admin-payment-proofs.ts: 5 / 5 — admin-pos.ts: 8 / 8 — admin-payments.ts: 3 / 3 — admin-refunds.ts: 1 / 1 — admin-disputes.ts: 6 / 6 — admin-recon.ts: 3 / 3 — admin-invoice-import.ts: 3 / 3 — admin-accounting.ts: 20 / 20 — admin-production.ts: 9 / 9 — admin-order-requests.ts: 5 / 5 — admin-bulk-import.ts: 3 / 3 — admin-meshy.ts: 10 / 10 — admin-subscribers.ts: 5 / 5 — admin-email-templates.ts: 4 / 4 — admin-analytics.ts: 3 / 3
- `git diff --stat HEAD~2 HEAD` — confirms exactly `18 files changed` (matches `files_modified` in the plan frontmatter 1:1, no silent skip).
- `git diff --diff-filter=D --name-only HEAD~1 HEAD` (checked after each of the two task commits) — empty both times, no accidental deletions.
- `git status --short` before each commit — confirmed only the intended 9 files per task were staged (no `.planning/**`, no `.agents/`, no `skills-lock.json`).

## Self-Check: PASSED

- `src/actions/admin-orders.ts` — FOUND (modified, no `@/lib/db` value import, `{ db } = await requireAdmin()`)
- `src/actions/admin-order-edit.ts` — FOUND (modified, `recomputeOrderTotals(db, orderId)`)
- `src/actions/admin-manual-orders.ts` — FOUND (modified, `publicOrigin(tenant)`, no `PUBLIC_LINK_BASE`)
- `src/actions/admin-payment-proofs.ts` — FOUND (modified, `publicUrl(..., tenant)`)
- `src/actions/admin-pos.ts` — FOUND (modified, `TenantDb` import, no `@/lib/db` value import)
- `src/actions/admin-payments.ts` — FOUND (modified)
- `src/actions/admin-refunds.ts` — FOUND (modified)
- `src/actions/admin-disputes.ts` — FOUND (modified, `resolveOrderIdForDispute(db, raw)`)
- `src/actions/admin-recon.ts` — FOUND (modified)
- `src/actions/admin-invoice-import.ts` — FOUND (modified)
- `src/actions/admin-accounting.ts` — FOUND (modified, `getAccountingSummary(range, db)`)
- `src/actions/admin-production.ts` — FOUND (modified)
- `src/actions/admin-order-requests.ts` — FOUND (modified, `expireStaleReturnsAdmin(db, result)`)
- `src/actions/admin-bulk-import.ts` — FOUND (modified)
- `src/actions/admin-meshy.ts` — FOUND (modified, `advanceGeneration(id, db)`)
- `src/actions/admin-subscribers.ts` — FOUND (modified)
- `src/actions/admin-email-templates.ts` — FOUND (modified)
- `src/actions/admin-analytics.ts` — FOUND (modified)
- Commit `a8c293c` — FOUND in `git log --oneline`
- Commit `a0925f2` — FOUND in `git log --oneline`

---
*Phase: 24-singleton-dissolution-sweep*
*Completed: 2026-07-13*
