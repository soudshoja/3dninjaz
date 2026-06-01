---
phase: 20-admin-pos-draft-order-flow
plan: 10
subsystem: ui
tags: [admin, orders, filter, sidebar, badge, payment-proofs, amber, tailwind]

# Dependency graph
requires:
  - phase: 20-admin-pos-draft-order-flow
    provides: payment_proofs schema + admin-payment-proofs actions (20-01, 20-07)
  - phase: 20-admin-pos-draft-order-flow
    provides: awaiting_payment_review OrderStatus value (20-01)
provides:
  - AdminOrderFilter with awaiting_customer + awaiting_payment_review chips + amber badge
  - getPaymentProofsAwaitingReviewCount() server action helper
  - /admin/orders page wired with pendingProofCount + slip thumbnail hydration
  - SidebarNav paymentProofsAwaitingReview prop + amber pill badge on Orders item
  - AdminOrderRow accepts optional slipThumbnailUrl for 24x24 row-edge thumbnail
affects: [20-admin-pos-draft-order-flow, admin-layout, admin-order-list]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Badge switch pattern extended: paymentProofsAwaitingReview case added to SidebarNav renderItem switch (Phase 7 07-06 pattern)"
    - "Manual hydration for payment_proofs: fetch parent order IDs, then SELECT from payment_proofs WHERE orderId IN (...), join in memory (MariaDB no-LATERAL rule)"
    - "Amber chip styling: active=amber-500 bg+white text, inactive=amber-50 bg+amber-700 text+amber-300 border (UI-SPEC §Surface 4)"

key-files:
  created: []
  modified:
    - src/components/admin/admin-order-filter.tsx
    - src/app/(admin)/admin/orders/page.tsx
    - src/app/(admin)/layout.tsx
    - src/components/admin/admin-order-row.tsx
    - src/components/admin/sidebar-nav.tsx
    - src/actions/admin-payment-proofs.ts

key-decisions:
  - "Count helper placed in admin-payment-proofs.ts (alongside confirm/reject) rather than a new admin-counts.ts — keeps payment-proof concerns co-located"
  - "AdminOrderRow extended with optional slipThumbnailUrl prop rather than a new row variant — preserves single render path"
  - "proofRows sorted DESC createdAt; first match per orderId = latest proof thumbnail (no GROUP BY needed)"
  - "PDF proofs fall back to full imageUrl when thumbnailUrl is null — prevents blank cells for PDF slips"

patterns-established:
  - "Amber badge pattern: SidebarNav badge switch extended with isAmberBadge flag to choose bg-amber-500 vs bg-red-500"
  - "Filter chip amber treatment: conditional chipStyle object based on isPaymentReview flag"

requirements-completed: [REQ-20-9]

# Metrics
duration: 20min
completed: 2026-05-17
---

# Phase 20 Plan 10: Admin Payment-Review Filter + Sidebar Badge + Row Thumbnail Summary

**Amber awaiting-payment-review filter chip with count badge, per-row slip thumbnail hydration, and sidebar Orders badge wired to orders.status count**

## Performance

- **Duration:** 20 min
- **Started:** 2026-05-17T00:00:00Z
- **Completed:** 2026-05-17T00:20:00Z
- **Tasks:** 4 (3 code tasks + 1 commit)
- **Files modified:** 6

## Accomplishments
- `AdminOrderFilter` gains `awaiting_customer` + `awaiting_payment_review` chips; payment-review chip styled amber (inactive: amber-50/amber-700/amber-300 border; active: amber-500/white) with an amber-500 count badge when `pendingProofCount > 0`
- `getPaymentProofsAwaitingReviewCount()` added to `admin-payment-proofs.ts` — single SELECT COUNT(*) on `orders.status`, gated by `requireAdmin()`
- `/admin/orders` page fetches count + manually hydrates latest slip thumbnail per order when filter = `awaiting_payment_review` (no LATERAL; DESC sort + first-match-per-orderId in memory)
- `AdminOrderRow` accepts `slipThumbnailUrl?` prop and renders a 24×24 thumbnail at the left edge of the Order # cell; PDF fallback uses `imageUrl`
- `SidebarNav` gains `paymentProofsAwaitingReview` prop + `paymentProofsAwaitingReview` badge case in the existing badge-switch driver; amber-500 pill (vs red-500 for existing badges)
- Admin layout fetches and passes `paymentProofsAwaitingReview` failure-safely (try/catch → 0)

## Task Commits

Each task was committed atomically:

1. **Tasks 1-3 (filter + page + sidebar)** - `99ab1e0` (feat(20-10))

## Files Created/Modified
- `src/components/admin/admin-order-filter.tsx` - Added two new filter values, pendingProofCount prop, amber chip render logic
- `src/actions/admin-payment-proofs.ts` - Added getPaymentProofsAwaitingReviewCount() helper
- `src/app/(admin)/admin/orders/page.tsx` - Extended VALID array, fetch count, manual proof hydration, pass to filter + rows
- `src/app/(admin)/layout.tsx` - Import + fetch paymentProofsAwaitingReview count failure-safe, pass to SidebarNav
- `src/components/admin/admin-order-row.tsx` - Optional slipThumbnailUrl prop + 24x24 thumbnail render
- `src/components/admin/sidebar-nav.tsx` - Extended NavItem badge union, Orders item badge key, renderItem switch + amber styling

## Decisions Made
- Count helper placed in `admin-payment-proofs.ts` (co-located with confirm/reject actions) rather than a new `admin-counts.ts` file — keeps payment-proof concerns together without introducing a new module for a single function
- `AdminOrderRow` extended with an optional prop rather than a separate row variant — single render path, cleaner API
- No status filter applied to proof query (fetches all proofs for the order IDs); latest proof per order selected by DESC createdAt + first-match-per-orderId map — avoids a subquery

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript error in `src/components/admin/payment-proof-section.tsx` referencing a missing `./payment-proof-lightbox` module (that component is being built in a parallel/prior plan). This error existed before this plan and is not introduced by these changes. All files modified by this plan compile cleanly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Surface 4 (/admin/orders) filter chip + sidebar badge + row thumbnail are complete
- Depends on real `awaiting_payment_review` orders being present in the DB for smoke testing
- No blockers for other Phase 20 plans

---
*Phase: 20-admin-pos-draft-order-flow*
*Completed: 2026-05-17*
