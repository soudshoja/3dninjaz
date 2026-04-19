---
phase: 06-customer-account
plan: 06
subsystem: invoice-pdf-cancel-return
tags: [invoice, pdf, react-pdf, cancel, return, admin, mariadb, transactions]
requires:
  - "Phase 6 06-01 (orderRequests table, orderRequestSchema, requireUser, @react-pdf/renderer)"
  - "Phase 6 06-05 (page slot scaffolding for /orders/[id])"
  - "Phase 3 03-04 (assertValidTransition state machine)"
provides:
  - "GET /orders/[id]/invoice.pdf — server-rendered PDF invoice (CUST-06)"
  - "src/actions/order-requests.ts (submitOrderRequest, listMyOrderRequests)"
  - "src/actions/admin-order-requests.ts (listOrderRequestsForOrder, approveOrderRequest, rejectOrderRequest)"
  - "Cancel + Return forms on /orders/[id] (CUST-07)"
  - "Admin approve/reject UI on /admin/orders/[id] with admin-notes textarea"
  - "InvoiceDocument React-PDF component with CANCELLED watermark + business footer + getStoreSettings fallback"
affects:
  - src/lib/pdf/invoice.tsx
  - src/app/(store)/orders/[id]/invoice.pdf/route.tsx
  - src/actions/order-requests.ts
  - src/actions/admin-order-requests.ts
  - src/components/orders/{cancel-request-button,return-request-button,download-invoice-button,order-actions-panel,order-requests-list}.tsx
  - src/components/admin/order-requests-admin.tsx
  - src/app/(admin)/admin/orders/[id]/page.tsx
tech-stack:
  added: []
  patterns:
    - "renderToStream + Buffer.concat for the PDF response (avoids streaming-Response edge cases on cPanel Node)"
    - "In-process Map rate limit (10 invoices/user/hour) — single-instance v1; document Redis migration when scaling out"
    - "Cache-Control: private, no-store on the invoice route to prevent shared-proxy leakage of one user's PDF to another"
    - "db.transaction wraps approve-cancel: status flip + request flip atomic (no half-updated state)"
    - "Dynamic import + try/catch for getStoreSettings (Phase 5 05-04) — falls back silently to BUSINESS"
    - "RETURN_WINDOW_MS = 14 days from orders.updatedAt (Q-06-05)"
key-files:
  created:
    - src/lib/pdf/invoice.tsx
    - src/app/(store)/orders/[id]/invoice.pdf/route.tsx
    - src/actions/admin-order-requests.ts
    - src/components/orders/cancel-request-button.tsx
    - src/components/orders/return-request-button.tsx
    - src/components/admin/order-requests-admin.tsx
  modified:
    - src/actions/order-requests.ts (replace 06-05 stub with full submitOrderRequest + listMyOrderRequests)
    - src/components/orders/download-invoice-button.tsx (replace 06-05 stub)
    - src/components/orders/order-actions-panel.tsx (replace 06-05 stub with eligibility-gated cancel/return panel)
    - src/components/orders/order-requests-list.tsx (replace 06-05 stub with full read-only list)
    - src/app/(admin)/admin/orders/[id]/page.tsx (insert OrderRequestsAdmin section above notes)
decisions:
  - "Renamed route handler from .ts to .tsx because the JSX in renderToStream(<InvoiceDocument ... />) requires JSX support (Rule 1 fix)"
  - "Widened business object types from BUSINESS as-const literal types to mutable string fields so getStoreSettings fallback assignment compiles"
  - "Cancel/Return action panel computes eligibility server-side and only renders qualifying buttons — no client-side bypass possible"
  - "Admin approve-cancel uses assertValidTransition from Phase 3 — admin cannot cancel an already-shipped order even via the button"
  - "Admin notes are visible to the customer (rendered in /orders/[id] OrderRequestsList) — keep them factual"
metrics:
  duration_minutes: 22
  tasks_completed: 2
  files_created: 6
  files_modified: 5
  completed_date: 2026-04-19
---

# Phase 6 Plan 06: Invoice PDF + Cancel/Return Requests Summary

CUST-06 + CUST-07 close. Two features land:

1. **PDF invoice** — `/orders/[id]/invoice.pdf` route handler renders an A4 invoice via `@react-pdf/renderer`. Pure React, no headless browser. Includes order metadata, shipping address, line items, totals, payment status, business footer with PDPA notice. Cancelled orders carry a "CANCELLED" watermark.

2. **Cancel/return requests** — customer submits a cancel (status ∈ pending|paid) or return (status=delivered AND age ≤ 14d) with a 10-1000 char reason. Admin sees pending requests on `/admin/orders/[id]`, approves or rejects with optional admin notes. Approve-cancel atomically flips order.status via the Phase 3 state machine.

## What shipped

### Invoice PDF
- `src/lib/pdf/invoice.tsx` — `InvoiceDocument` component (Page, Text, View, StyleSheet) with watermark conditional on cancelled status
- `src/app/(store)/orders/[id]/invoice.pdf/route.tsx` — GET handler with requireUser + getMyOrder ownership gate + 10/hr in-process rate limiter + dynamic getStoreSettings fallback
- `DownloadInvoiceButton` — Link with target=_blank + rel=noopener noreferrer

### Cancel/return requests
- `src/actions/order-requests.ts` — `submitOrderRequest` (ownership + status + 14d eligibility + one-pending block + insert) and `listMyOrderRequests`
- `src/actions/admin-order-requests.ts` — `listOrderRequestsForOrder`, `approveOrderRequest` (db.transaction wrapping order.status flip via assertValidTransition + request status flip), `rejectOrderRequest`
- `CancelRequestButton` / `ReturnRequestButton` — collapsible textarea forms with Cancel button on close
- `OrderActionsPanel` — server component computing eligibility (status + age + pending) and rendering only qualifying buttons; pending-state copy when a request is in flight
- `OrderRequestsList` — customer-side history of past + pending requests with status pills and admin notes
- `OrderRequestsAdmin` — client component on `/admin/orders/[id]` with Approve/Reject buttons + admin-notes textarea per pending request

## Threat mitigations applied

| Threat ID                | Mitigation                                                                |
| ------------------------ | ------------------------------------------------------------------------- |
| T-06-06-auth             | requireUser() / requireAdmin() FIRST await on all 5 server actions + invoice route |
| T-06-06-IDOR             | getMyOrder ownership gate; 404 for non-owner = 404 for missing            |
| T-06-06-enumeration      | submitOrderRequest returns "Order not found." for both missing AND not-yours |
| T-06-06-rate-limit       | 10 invoices/user/hour via in-process Map; 429 on excess                  |
| T-06-06-cache-leak       | Cache-Control: private, no-store on PDF response                          |
| T-06-06-state-machine    | assertValidTransition reuses Phase 3 validator on approve-cancel          |
| T-06-06-transaction      | db.transaction wraps order-status + request-status flip atomically        |
| T-06-06-one-pending      | Pre-insert SELECT blocks duplicate pending requests on same order         |
| T-06-06-XSS              | All admin notes / customer reasons via React JSX — auto-escaped           |
| T-06-06-PDF-injection    | react-pdf Text nodes escape strings — no template-string concat sink      |
| T-06-06-PII-log          | console.error logs only error object string — never reason / notes / email |
| T-06-06-supply-chain     | @react-pdf/renderer 4.5.1 installed in 06-01 with lockfile committed      |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] route.ts file extension rejected JSX**

The plan called for `src/app/(store)/orders/[id]/invoice.pdf/route.ts` containing `renderToStream(<InvoiceDocument ... />)`. JSX requires `.tsx`. Renamed to `route.tsx`. tsc clean afterward.

**2. [Rule 1 - Bug] BUSINESS as-const literal types narrowed return type**

Initial `let business = { businessName: BUSINESS.legalName, ... }` produced literal types like `"3D Ninjaz"` because BUSINESS is `as const`. The fallback assignment `business = { businessName: s.businessName ?? business.businessName }` failed because `string` isn't assignable to `"3D Ninjaz"`. Fix: explicit annotation `let business: { businessName: string; ... }` widens the field types.

### Out-of-scope (logged to deferred-items.md)

- `src/actions/admin-shipping.ts` line 53 — Phase 5 territory; needs the same `[...MALAYSIAN_STATES]` spread pattern used in src/actions/reviews.ts to satisfy Drizzle's mysqlEnum overload.

### Stub replacement

This plan replaces 4 stub files committed in 06-05 (`download-invoice-button.tsx`, `order-actions-panel.tsx`, `order-requests-list.tsx`, `actions/order-requests.ts`) with full implementations. The /orders/[id] page itself was edited only once (in 06-05) — no churn here.

## Verification

- `npx tsc --noEmit` — Phase 6 surface clean. Only 2 remaining errors are in `src/actions/admin-shipping.ts` (Phase 5 file, logged to deferred-items.md).
- 6 new files; 5 modified
- Invoice route auth-gated by requireUser; ownership-gated by getMyOrder; rate-limited 10/hr per user
- Admin approve-cancel transitions only run inside db.transaction with assertValidTransition guard
- One-pending-per-order rule enforced at app layer (pre-insert SELECT)
- 14-day return window enforced server-side via RETURN_WINDOW_MS

## Self-Check: PASSED

- FOUND: src/lib/pdf/invoice.tsx (InvoiceDocument with watermark + footer)
- FOUND: src/app/(store)/orders/[id]/invoice.pdf/route.tsx (GET handler with renderToStream + rate limit + ownership gate)
- FOUND: src/actions/order-requests.ts (submitOrderRequest, listMyOrderRequests)
- FOUND: src/actions/admin-order-requests.ts (listOrderRequestsForOrder, approveOrderRequest with db.transaction, rejectOrderRequest)
- FOUND: src/components/orders/cancel-request-button.tsx
- FOUND: src/components/orders/return-request-button.tsx
- FOUND: src/components/orders/download-invoice-button.tsx (replaces 06-05 stub)
- FOUND: src/components/orders/order-actions-panel.tsx (replaces 06-05 stub)
- FOUND: src/components/orders/order-requests-list.tsx (replaces 06-05 stub)
- FOUND: src/components/admin/order-requests-admin.tsx
- FOUND: src/app/(admin)/admin/orders/[id]/page.tsx (OrderRequestsAdmin section integrated)
- PASSED: Phase 6 source files compile cleanly. Phase 5-owned errors logged separately.
