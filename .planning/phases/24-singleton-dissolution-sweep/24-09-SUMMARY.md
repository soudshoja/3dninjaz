---
phase: 24-singleton-dissolution-sweep
plan: 09
subsystem: api
tags: [multi-tenant, drizzle, next-route-handlers, transactional-email, webhooks, better-auth]

# Dependency graph
requires:
  - phase: 24-04
    provides: getTenantContext() / resolveTenantContext() extended to return { tenant, db, auth }
  - phase: 24-05
    provides: tenant db threading in order/email/pdf/whatsapp/meshy libs (analog for send-emails.ts)
provides:
  - Category-B route handlers (8 files) resolve db via getTenantContext()/requireAdmin() — no static or dynamic @/lib/db import remains outside the sanctioned resolver layer
  - send-emails.ts senders tenant-threadable (optional trailing tenant?: Tenant); both dynamic db imports converted to getTenantContext().db (B3)
  - admin-whatsapp.ts Evolution webhook-registration URL tenant-derived (W5)
  - auth.ts welcome-email hook threads tenant (discharges 24-02 TODO, B1)
affects: [24-10, 25-webhook-tenant-identity, 27-per-tenant-metadata]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Webhook routes: resolve tenant via getTenantContext() strictly AFTER raw-body signature verification, never before"
    - "Public routes resolve db via getTenantContext(); admin routes via requireAdmin() (already first await)"
    - "Route-level requireAdmin() try/catch rewritten as `.catch(() => null)` + null-guard so db can be captured outside the try block without `let db` type gymnastics"
    - "Exported email senders take an OPTIONAL trailing tenant?: Tenant param threaded into publicUrl/publicOrigin/sendMail — no caller breaks, untreaded callers stay env/global default"

key-files:
  created: []
  modified:
    - src/app/api/webhooks/delyva/route.ts
    - src/app/api/paypal/webhook/route.ts
    - src/app/api/events/track/route.ts
    - src/app/api/subscribe/route.ts
    - src/app/api/unsubscribe/route.ts
    - src/app/api/admin/subscribers/export/route.ts
    - src/app/api/admin/orders/[id]/label/route.ts
    - src/app/api/admin/upload-font/route.ts
    - src/actions/send-emails.ts
    - src/actions/admin-whatsapp.ts
    - src/lib/auth.ts

key-decisions:
  - "Webhook tenant resolution stays Host-based this phase (compat); general model is Phase 25 path-based resolution — recorded as known limitation, not fixed here"
  - "fetchReturnEmailContext() and sendReturnApprovedEmail()'s local approvedAt fetch resolve db via getTenantContext() internally rather than accepting a threaded db param — both run in request context, so headers() is available and this is a mechanical 1:1 swap of the dynamic import"
  - "subscribers/export/route.ts's requireAdmin() try/catch rewritten to `.catch(() => null)` + guard-null-check so db can be captured cleanly outside the try/catch (cleaner than `let db: TenantDb` + destructuring assignment); behavior identical — any thrown error still redirects to /login"
  - "Three outbound-URL sites deferred, not threaded (see ledger below) — all internal same-origin auth-failure redirects or build-time-static metadata, byte-identical in single mode"

requirements-completed: [TEN-02]

# Metrics
duration: ~45min
completed: 2026-07-13
---

# Phase 24 Plan 09: Singleton Dissolution Sweep — Wave 5 (Category B route handlers) Summary

**Closed the request-layer db singleton (8 route handlers + send-emails.ts + admin-whatsapp.ts + auth.ts) — including the two dynamic `await import("@/lib/db")` reads in send-emails.ts that the static-grep sweep in earlier waves could not catch.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Delyva and PayPal webhooks now resolve `{ tenant, db }` via `getTenantContext()` strictly AFTER raw-body signature verification (HMAC-before-resolve preserved byte-for-byte); Delyva's in-process `SEEN_KEYS` idempotency key is now tenant-scoped (`${tenant.id}:...`)
- Public routes (events/track, subscribe, unsubscribe) resolve db via `getTenantContext()`; admin routes (subscribers/export, orders/[id]/label, upload-font) resolve db via `requireAdmin()`
- `send-emails.ts`'s ~20 exported senders each gained an optional trailing `tenant?: Tenant` param, threaded into every `publicUrl`/`publicOrigin`/`sendMail` call
- **B3 (load-bearing):** both dynamic `await import("@/lib/db")` reads in `send-emails.ts` (`fetchReturnEmailContext`, `sendReturnApprovedEmail`) replaced with `getTenantContext().db` — this closes the one dynamic-import class the static `rg "from \"@/lib/db\""` sweep in prior waves could never catch, and which would have silently resolved to `undefined.db` at runtime after 24-10 deletes the `db` export
- `admin-whatsapp.ts`'s module-scope `APP_BASE_URL` (used to build the Evolution webhook-registration URL) moved inside `connectWhatsapp()`, now derived from `publicOrigin(tenant)` using the guard's resolved tenant (W5)
- `auth.ts`'s `buildTenantAuth` welcome-email hook now passes the closed-over `tenant` to `sendWelcomeEmail(user.email, user.name, tenant)`, discharging the 24-02 `TODO(24-09)` (B1)
- Delyva webhook's delivered-order branch threads `tenant` into both `publicUrl(...)` (WhatsApp orderUrl) and `sendOrderDeliveredEmail(...)` (SC5/B1)

## Task Commits

1. **Task 1: Sweep webhook + public routes (5 files)** - `6aaa879` (fix)
2. **Task 2: Sweep admin routes (3 files) + tenant-thread send-emails.ts (incl. B3 dynamic imports) + admin-whatsapp webhook URL (W5)** - `a6c6bbb` (fix)

_No plan-metadata commit made — this SUMMARY.md is intentionally left uncommitted per the plan's `<output>` block; `.planning/` changes are out of scope for this plan's commits._

## Files Created/Modified

- `src/app/api/webhooks/delyva/route.ts` — resolve-after-verify tenant db; tenant-scoped idempotency key; delivered-order `publicUrl`/`sendOrderDeliveredEmail` thread `tenant`
- `src/app/api/paypal/webhook/route.ts` — resolve-after-verify tenant db (no in-process idempotency in this file; DB-level `paypalCaptureId`/`paypalOrderId` checks unchanged)
- `src/app/api/events/track/route.ts` — db resolved via `getTenantContext()` inside the existing fire-and-forget try/catch
- `src/app/api/subscribe/route.ts` — db resolved via `getTenantContext()` before the newsletter-subscriber select/insert
- `src/app/api/unsubscribe/route.ts` — db resolved via `getTenantContext()` before the token lookup/update
- `src/app/api/admin/subscribers/export/route.ts` — `requireAdmin()` try/catch rewritten to `.catch(() => null)` + guard-null-check, `db` captured from the guard result
- `src/app/api/admin/orders/[id]/label/route.ts` — `const { db } = await requireAdmin();`
- `src/app/api/admin/upload-font/route.ts` — `const { db } = await requireAdmin();`; `uniqueSlug()` helper now takes `db: TenantDb` as an explicit parameter (was module-scope)
- `src/actions/send-emails.ts` — every exported sender gained `tenant?: Tenant`; both dynamic `@/lib/db` imports replaced with `getTenantContext().db` (B3)
- `src/actions/admin-whatsapp.ts` — `APP_BASE_URL` resolution moved inside `connectWhatsapp()`, derived from `publicOrigin(tenant)`
- `src/lib/auth.ts` — welcome-email hook threads `tenant`; `TODO(24-09)` removed

## Decisions Made

- See `key-decisions` in frontmatter. All are mechanical/structural choices with no behavior change in single mode.

## Deviations from Plan

None — plan executed exactly as written. The `requireAdmin().catch(() => null)` rewrite in `subscribers/export/route.ts` is a structural implementation detail of the Category-B ADMIN transform the plan specified (`const { db } = await requireAdmin()`), not a deviation from it — the original try/catch semantics (any thrown error → redirect to `/login`) are preserved exactly.

## Issues Encountered

None. `npx tsc --noEmit` was clean on the first full pass after both tasks were applied together (the Task 1 → Task 2 ordering has an intentional cross-task type dependency the plan itself calls out: `sendOrderDeliveredEmail`'s second `tenant` argument in the delyva webhook, added in Task 1, only type-checks once Task 2 adds the optional `tenant?: Tenant` parameter to `send-emails.ts`. Both tasks' edits were made before running `tsc`, then split into two atomic commits by file list — matching the plan's own footnote: "the sender takes an optional trailing tenant after the Task-2 send-emails thread").

## Known Stubs

None — this is a byte-preserving structural refactor; no new UI surfaces or data sources were introduced.

## Threat Flags

None — no new network endpoints, auth paths, file-access patterns, or schema changes were introduced. All 8 route handlers and 3 actions files already existed; only their db-resolution and outbound-URL construction changed.

## Phase-25 Webhook-Identity Limitation (recorded per plan requirement)

Host resolution is correct for exactly one tenant on its own domain — the compat state this phase (and the whole deployed system) is in. **This is NOT the general model.** The fully-general per-tenant webhook design (Phase 25/29) resolves webhook tenant identity from the **registered path** (`/api/webhooks/delyva/[tenantId]` + a per-tenant secret), NOT from the `Host` header — because a shared gateway/aggregator account can legitimately deliver a webhook to a URL whose Host does not match the tenant's own domain. `T-24-09-02` in this plan's threat register records this as an accepted (compat) disposition. Do not treat the current Host-based resolution as safe once a second tenant is onboarded to the webhook-receiving routes.

## SC5 Outbound-URL Threaded-vs-Deferred Ledger (accurate, per plan `decisions_for_review`)

**THREADED** (tenant-derived, byte-identical in single mode):
- PayPal `return_url` + order link — `src/actions/paypal.ts` (24-08)
- `admin-manual-orders.ts` `PUBLIC_LINK_BASE` payment links (24-06); `pos-whatsapp.ts` `PUBLIC_LINK_BASE` WhatsApp payment link (24-08)
- `shipping.ts` `registerWebhooks()` Delyva webhook-registration URL (24-08)
- `email/templates.ts` `store_url` (24-05); `email/order-confirmation.ts` `baseUrl()` order-confirmation links (24-05)
- `sitemap.ts` `resolveBaseUrl()` product/category URLs + `robots.ts` `sitemap:`/`host:` (24-04)
- `admin-whatsapp.ts` Evolution webhook-registration URL (**this plan, Task 2c**)
- `send-emails.ts` ~20 senders' `publicUrl`/`publicOrigin` links (**this plan, Task 2b**)
- admin order-detail page's customer-facing tracking link — `src/app/(admin)/admin/orders/[id]/page.tsx` (24-07)
- Delyva webhook delivered-order `orderUrl` + `sendOrderDeliveredEmail` (**this plan, Task 1**)
- auth-hook welcome email — `sendWelcomeEmail(..., tenant)` (**this plan, Task 2d**, discharging the 24-02 TODO)

**DEFERRED #1 (with rationale — NOT an SC5 cross-channel outbound URL):** `src/app/api/admin/accounting/sales-export/route.ts:28` — `publicOrigin()` inside the `catch` of a FAILED `requireAdmin()` (unauthenticated `/login` redirect). No tenant is resolvable in that catch (the guard already threw); it's an INTERNAL same-origin login redirect, not a cross-channel outbound URL. Already chains `BETTER_AUTH_URL ?? NEXT_PUBLIC_SITE_URL ?? publicOrigin()`, byte-identical in single mode. This file is not in this plan's `files_modified` list and was not touched.

**DEFERRED #2 (identical class to #1):** `src/app/api/admin/subscribers/export/route.ts` — the byte-identical failed-`requireAdmin()` `/login`-redirect `publicOrigin()` catch (same chain, same internal same-origin redirect, no guard-resolved tenant available since the guard already threw). This route's `db` swap DID land in this plan's Task 2a (see `key-files.modified`); only its redirect-catch URL is deferred, alongside #1, for the identical rationale. A one-line code comment was added at the call site documenting the deferral inline.

**DEFERRED #3 (build-time static metadata — Phase-27 cutover concern):** root `src/app/layout.tsx` `metadata` + JSON-LD derive from env `SITE.url`. Unlike `robots.ts`/`sitemap.ts` (made per-tenant dynamic in 24-04), root-layout `metadata` is evaluated build-time-static across ALL routes; making it per-tenant requires the per-tenant metadata cutover, a Phase-27 concern. Registry-mode-only wrongness; byte-identical in single mode; no data leak. Not touched in this plan.

Both DEFERRED #1 and #2 are re-confirmed for Phase 25 when webhook/redirect tenant-identity is generalized.

## Verification

- `npx tsc --noEmit 2>&1 | grep -v '^\.next/'` — clean (0 errors)
- `rg -l 'from "@/lib/db";' <5 Task-1 files>` → 0 matches
- `rg -l 'from "@/lib/db";' <3 Task-2 admin route files>` → 0 matches
- `rg 'import\(\s*["'"'"'`]@/lib/db["'"'"'`]\s*\)' src/actions/send-emails.ts` → 0 matches (both dynamic db imports closed, B3)
- `rg 'import\(\s*["'"'"'`]@/lib/db["'"'"'`]\s*\)' src/` (fleet-wide) → 0 matches
- `rg "from \"@/lib/db\"" src/app src/actions src/lib | rg -v "/lib/db/schema|/lib/db/index|/lib/tenant/"` → returns only `src/lib/auth.ts` (compat-shim `singletonDb`, deleted in 24-10), `src/lib/tenant/pool-manager.ts`, `src/lib/tenant/registry.ts` — the sanctioned resolver layer, unchanged from prior waves
- `rg "tenant.id" src/app/api/webhooks/delyva/route.ts` → matches (idempotency key)
- `rg 'publicUrl\([^)]*tenant' src/app/api/webhooks/delyva/route.ts` → matches (delivered-order orderUrl)
- `rg "tenant\?: Tenant" src/actions/send-emails.ts` → 16 matches
- `rg "publicOrigin\(tenant\)" src/actions/admin-whatsapp.ts` → matches
- `rg "sendWelcomeEmail\(user.email, user.name, tenant\)" src/lib/auth.ts` → matches
- `rg "TODO\(24-09\)" src/lib/auth.ts` → 0 matches
- Guard-count diff vs baseline `9a6dfb3` per file: `requireAdmin()`/`requireUser()` call-site counts unchanged in every already-guarded file (`subscribers/export`: 1→1 call site plus 1 doc-comment mention, unchanged; `orders/[id]/label`: 1→1; `upload-font`: 1→1; `admin-whatsapp.ts`: 7→7). The 5 Task-1 route handlers and `send-emails.ts` gained new `getTenantContext()` call sites (0→1, 0→1, 0→1, 0→1, 0→1, 0→2 respectively) — expected, since Category-B routes had no guard/context-resolution convention before this plan.
- Post-commit deletion check on both commits (`git diff --diff-filter=D --name-only 6aaa879~1 a6c6bbb`) → no deletions.

## Next Phase Readiness

Category B (route handlers) is now fully swept. Combined with prior waves (24-04 through 24-08, Category A/C/D), the entire `src` tree's request-layer surface resolves db via the tenant context/guard layer, with the sole remaining static importers being the sanctioned resolver files (`pool-manager.ts`, `registry.ts`) and `auth.ts`'s compat shim. 24-10 can now safely delete the `export const db` from `src/lib/db/index.ts` — every un-swept site (if any remain in non-request scripts, Category F) will become a hard compile error. The Phase-25 webhook-identity (path-based, not Host-based) and Phase-27 per-tenant root-layout metadata items are recorded above as explicit forward work, not silently dropped.

---
*Phase: 24-singleton-dissolution-sweep*
*Plan: 09*
*Completed: 2026-07-13*
