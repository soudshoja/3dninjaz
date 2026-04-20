---
phase: 07-manual-orders-ops-images
plan: 09
title: Branded 404/500/maintenance pages + maintenance-mode middleware
status: complete
duration_min: 9
completed_at: 2026-04-20
requirements: [ERR-01, ERR-02, ERR-03]
key_files_created:
  - src/lib/error-reporting.ts
  - src/actions/client-error-reporter.ts
  - src/components/error/branded-404.tsx
  - src/components/error/branded-500.tsx
  - src/components/error/branded-maintenance.tsx
  - src/app/not-found.tsx
  - src/app/error.tsx
  - src/app/global-error.tsx
  - src/app/(store)/maintenance/page.tsx
  - src/middleware.ts
  - public/ninja-lost.svg
key_decisions:
  - "Q-07-05 default applied: env-only MAINTENANCE_MODE toggle (no DB switch)."
  - "BrandedFiveHundred props are STRICTLY { requestId, reset? }. error.message/stack NEVER passed."
  - "/payment-links/** added to maintenance allowlist — customers paying for manual orders shouldn't be blocked."
---

# Phase 07 Plan 09: Branded errors + maintenance Summary

Generic Next.js error frames replaced with brand-coloured ninja-themed
pages. 500 page renders ONLY `Reference: <8-char-id>` to the user; full
stack/message logged server-side via reportClientError server action.
MAINTENANCE_MODE env flag flips a middleware that redirects every non-
allowlisted route to /maintenance.

## What was built

**Helpers**
- `src/lib/error-reporting.ts` — generateRequestId() (8-char UUID
  slice) + logError() structured server-side log.
- `src/actions/client-error-reporter.ts` — server action wrapper so
  client error.tsx can ship error details to server. Returns void.

**Branded SVG (`public/ninja-lost.svg`)**
- 200×200 viewBox, ink background, cream ninja silhouette with floating
  question marks in brand blue/green/purple. One eye open / one eye
  closed = lost expression.

**Components**
- BrandedNotFound (server) — illustration + heading "The ninja went
  stealth on this page" + Back to homepage / Browse shop CTAs.
- BrandedFiveHundred (server) — illustration + "Something went wrong" +
  monospace `Reference: <id>`. Try again button (when reset prop
  supplied) + Back to homepage. Props strictly { requestId, reset? }
  — error object NEVER reaches the rendered tree (T-07-09-error-page-leak
  / D-07-12).
- BrandedMaintenance (server) — illustration + "We are training the
  ninja" + WhatsApp CTA pulled from getStoreSettingsCached().

**App router pages**
- src/app/not-found.tsx — renders BrandedNotFound.
- src/app/error.tsx (client) — generates client-side requestId, ships
  error details to server via reportClientError, renders BrandedFiveHundred
  with ONLY requestId + reset.
- src/app/global-error.tsx (client) — root-layout fallback with inline
  styles (cannot depend on layout.tsx).
- src/app/(store)/maintenance/page.tsx — renders BrandedMaintenance.

**Middleware (`src/middleware.ts`)**
- Reads MAINTENANCE_MODE env on hot path (truthy = "true"/"1"/"yes").
- Allowlist (NOT redirected): /admin, /api/paypal/webhook, /api/health,
  /api/events/track, /payment-links, /maintenance, /_next, /uploads,
  /favicon.
- Matcher: `/((?!_next/static|_next/image).*)`.
- When disabled, middleware is a no-op.

## Verification

- `npx tsc --noEmit` exits 0.
- Stack-trace assertion (manual grep): branded-500.tsx contains zero
  references to `error.message` or `error.stack`.
- Live test of /this-route-does-not-exist + maintenance toggle deferred
  to wave-end deploy.

## Deviations from Plan

**1. [Rule 2 - Critical] /payment-links/** added to maintenance allowlist**
- **Found during:** Task 2 middleware design
- **Issue:** Plan allowlist did not include /payment-links — customers
  paying via manual-order links during maintenance would be blocked.
- **Fix:** Added /payment-links to ALLOWLIST_PREFIXES. Documented in
  middleware comments.
- **Commit:** 51036bf

## Self-Check: PASSED

- error-reporting.ts + client-error-reporter.ts: FOUND
- 3 branded components: FOUND
- not-found.tsx + error.tsx + global-error.tsx + maintenance/page.tsx: FOUND
- middleware.ts: FOUND
- public/ninja-lost.svg: FOUND
- Commit 51036bf: FOUND
