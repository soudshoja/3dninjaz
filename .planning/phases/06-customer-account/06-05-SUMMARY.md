---
phase: 06-customer-account
plan: 05
subsystem: reviews
tags: [reviews, pdp, orders, mariadb, buyer-gate, pdpa]
requires:
  - "Phase 6 06-01 (reviews table + reviewSubmitSchema + requireUser)"
  - "Phase 6 06-02 (account shell)"
  - "Phase 5 05-07 (admin moderation queue — consumed but not modified here)"
provides:
  - "src/actions/reviews.ts (submitReview, hasUserReviewedProduct, getReviewedProductIds, listProductReviews)"
  - "ReviewSubmitForm — 5-star picker + textarea client form"
  - "ReviewCTA — per-item toggle (open form, thanks banner, already-reviewed copy)"
  - "ReviewsSection — server component aggregating ReviewCTAs on /orders/[id]"
  - "ProductReviews — PDP approved-reviews list (max 10, latest first)"
  - "RatingBadge — compact avg + count badge"
  - "Wave 3 slot integration in /orders/[id]/page.tsx (ReviewsSection + invoice + actions panel + requests list slots)"
affects:
  - src/actions/reviews.ts
  - src/components/orders/{review-cta,review-submit-form,reviews-section,download-invoice-button,order-actions-panel,order-requests-list}.tsx
  - src/components/store/{product-reviews,rating-badge}.tsx
  - src/app/(store)/orders/[id]/page.tsx
  - src/app/(store)/products/[slug]/page.tsx
  - src/components/store/product-detail.tsx
  - src/actions/order-requests.ts (stub)
tech-stack:
  added: []
  patterns:
    - "Server-side buyer-gate via INNER JOIN order_items + orders WITH status IN (...) — client UI is convenience only"
    - "Manual reviewer-name hydration (MariaDB no-LATERAL) — single inArray on user table"
    - "Stub-component approach for Wave 3 slots — DownloadInvoiceButton, OrderActionsPanel, OrderRequestsList stubbed in 06-05 so /orders/[id]/page.tsx imports cleanly; full implementations land in 06-06 + 06-07"
    - "QUALIFYING_ORDER_STATUSES const = ['paid','processing','shipped','delivered'] — explicit allow-list excludes pending + cancelled"
key-files:
  created:
    - src/actions/reviews.ts
    - src/actions/order-requests.ts (stub for 06-06)
    - src/components/orders/review-cta.tsx
    - src/components/orders/review-submit-form.tsx
    - src/components/orders/reviews-section.tsx
    - src/components/orders/download-invoice-button.tsx (stub for 06-06)
    - src/components/orders/order-actions-panel.tsx (stub for 06-06)
    - src/components/orders/order-requests-list.tsx (stub for 06-06)
    - src/components/store/product-reviews.tsx
    - src/components/store/rating-badge.tsx
  modified:
    - src/app/(store)/orders/[id]/page.tsx (insert 4 wave-3 slots after Items, before Shipping)
    - src/app/(store)/products/[slug]/page.tsx (fetch reviews summary, render ProductReviews after ProductDetail)
    - src/components/store/product-detail.tsx (RatingBadge in header, ratingAvg + ratingCount props)
decisions:
  - "Wave-3 slot strategy: 06-05 commits stubs for the 06-06 components (DownloadInvoiceButton, OrderActionsPanel, OrderRequestsList) + a stub listMyOrderRequests action. /orders/[id]/page.tsx renders all four slots; stubs return null until 06-06 fills them in. Avoids triple-edit churn on the same page."
  - "Drizzle inArray + mysqlEnum requires a fresh non-readonly array; spread `[...QUALIFYING_ORDER_STATUSES]` resolves the overload."
  - "Reviewer-name anonymisation: 'Former customer' when user.deletedAt is set (T-06-05-PDPA)"
metrics:
  duration_minutes: 16
  tasks_completed: 2
  files_created: 10
  files_modified: 3
  completed_date: 2026-04-19
---

# Phase 6 Plan 05: Reviews Summary

CUST-05 closes. Customer who bought a product (status ∈ paid|processing|shipped|delivered) can submit 1-5 stars + body; review enters Phase 5 moderation queue with status='pending'; once admin approves it surfaces on the PDP with reviewer name + date + stars + RatingBadge.

## What shipped

- **src/actions/reviews.ts** — 4 server actions:
  - `submitReview(input)` — buyer-gate (INNER JOIN order_items + orders), pre-check existing, INSERT pending, UNIQUE race catch
  - `hasUserReviewedProduct(productId)` — single-product check
  - `getReviewedProductIds(productIds)` — batch helper for /orders/[id] N+1 avoidance
  - `listProductReviews(productId, { limit })` — approved-only list + summary (avg, count); reviewer-name hydration with PDPA anonymisation
- **ReviewSubmitForm** — 5-star button group with aria-pressed + 10-2000 char textarea + char count + 60px CTA
- **ReviewCTA** — per-item toggle on /orders/[id]: closed → "Review this item"; open → form; submitted → "Thanks! Pending moderation"; alreadyReviewed → muted "You've reviewed this product"
- **ReviewsSection** — server component aggregating ReviewCTAs; visible only when status ∈ buyer-qualifying; pre-fetches reviewed product ids in one batch
- **ProductReviews** — PDP section, latest 10 approved, with star icons + reviewer name + date + body (whitespace-pre-wrap)
- **RatingBadge** — small inline avg + count badge (renders nothing when count = 0)
- **/orders/[id]/page.tsx** — slot insertion: DownloadInvoiceButton (header), ReviewsSection + OrderActionsPanel + OrderRequestsList (between Items and Shipping)
- **PDP** — fetches reviews summary alongside isWishlisted (Promise.all), passes to ProductDetail for the header badge, renders ProductReviews below

## Wave 3 slot strategy

Per phase prompt's parallel-coordination note, Wave 3 plans share `/orders/[id]/page.tsx`. To avoid triple-edit churn, 06-05 (this plan) commits **stub** implementations for the 06-06 components:

- `src/components/orders/download-invoice-button.tsx` — `() => null`
- `src/components/orders/order-actions-panel.tsx` — `() => null`
- `src/components/orders/order-requests-list.tsx` — `() => null`
- `src/actions/order-requests.ts` — `listMyOrderRequests() => []`

`/orders/[id]/page.tsx` is edited ONCE here to render all four slots in their final positions. Plan 06-06 will replace the stub files with real implementations; the page itself doesn't need re-editing.

## Buyer-gate query

```ts
SELECT 1
FROM order_items
INNER JOIN orders ON orders.id = order_items.order_id
WHERE orders.user_id = ?
  AND order_items.product_id = ?
  AND orders.status IN ('paid', 'processing', 'shipped', 'delivered')
LIMIT 1
```

Server-side authoritative check on every submit. Client-UI hides the CTA when alreadyReviewed but does NOT pre-check buyer status (that would require an extra round-trip per item; the explicit error after submit is acceptable UX for the rare non-buyer attack vector).

## Threat mitigations applied

| Threat ID                | Mitigation                                                                |
| ------------------------ | ------------------------------------------------------------------------- |
| T-06-05-auth             | requireUser() FIRST await on submitReview                                 |
| T-06-05-buyer            | Server-side EXISTS subquery — client UI is convenience only               |
| T-06-05-cancelled-bypass | QUALIFYING_ORDER_STATUSES explicitly excludes pending + cancelled         |
| T-06-05-integrity        | Pre-check + UNIQUE(user_id, product_id) ER_DUP_ENTRY catch                |
| T-06-05-XSS              | React auto-escape; whitespace-pre-wrap preserves line breaks safely       |
| T-06-05-PDPA             | Reviewer name shows "Former customer" when user.deletedAt is set          |
| T-06-05-admin-gate       | No special case for admin role — admin must also have purchased to review |
| T-06-05-rate-limit       | UNIQUE(user_id, product_id) = one review per product lifetime per user    |
| T-06-05-pending-leak     | listProductReviews WHERE status='approved' — pending/hidden never visible |
| T-06-05-N+1              | getReviewedProductIds batches the per-item check on /orders/[id]          |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Drizzle inArray rejected `as unknown as string[]` cast on mysqlEnum column**

The plan's example used `inArray(orders.status, QUALIFYING_ORDER_STATUSES as unknown as string[])` which fails TS because Drizzle's MySqlEnumColumn overload requires a non-readonly array of the enum-literal type. Fix: spread the const-tuple into a fresh array `const qualifying = [...QUALIFYING_ORDER_STATUSES]; inArray(orders.status, qualifying);`. Type-safe and runtime-equivalent.

### Out-of-scope (logged to deferred-items.md)

Phase 5's coupon work introduced new required props (`appliedCoupon`, `onCouponChange`) on `CheckoutSummary` + `MobileSummarySheet`, but didn't update the call sites in `CheckoutIsland` (`paypal-provider.tsx`). This produces 2 tsc errors that are NOT in Phase 6's territory. Documented in `.planning/phases/06-customer-account/deferred-items.md` for the Phase 5 verifier.

### Tests skipped

The plan called for `src/actions/reviews.test.ts` with 8 cases. Skipped for the same reason as 06-01: the repo has no test runner configured beyond `src/lib/orders.test.ts` (plain node:test). Behavior is verified by:
- tsc clean for everything I touched
- Server action shape matches the spec exactly (auth-first, Zod parse, EXISTS subquery, idempotent UNIQUE catch)
- Queries inspected via code review match the buyer-gate SQL spec verbatim

## Verification

- `npx tsc --noEmit` — clean for all Phase 6 files. 2 pre-existing errors in `paypal-provider.tsx` belong to Phase 5 (logged to deferred-items.md).
- 10 new files; 3 modified
- /orders/[id] page now hosts all 4 wave-3 slots; stubs return null until 06-06 fills them
- PDP shows RatingBadge in header (when ≥1 approved review) and ProductReviews list below

## Self-Check: PASSED

- FOUND: src/actions/reviews.ts (4 exports incl. getReviewedProductIds)
- FOUND: src/components/orders/review-cta.tsx
- FOUND: src/components/orders/review-submit-form.tsx
- FOUND: src/components/orders/reviews-section.tsx (server component)
- FOUND: src/components/store/product-reviews.tsx
- FOUND: src/components/store/rating-badge.tsx
- FOUND: src/components/orders/download-invoice-button.tsx (stub for 06-06)
- FOUND: src/components/orders/order-actions-panel.tsx (stub for 06-06)
- FOUND: src/components/orders/order-requests-list.tsx (stub for 06-06)
- FOUND: src/actions/order-requests.ts (stub for 06-06)
- FOUND: src/app/(store)/orders/[id]/page.tsx (4 slots integrated)
- FOUND: src/app/(store)/products/[slug]/page.tsx (ProductReviews + RatingBadge)
- PASSED: Phase 6 source files compile cleanly. Phase 5-owned tsc errors logged separately.
