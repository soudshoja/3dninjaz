---
phase: 20-admin-pos-draft-order-flow
plan: 13
subsystem: ui
tags: [order-items, invoice, email, manual-line, render-guard, isManualLine]

# Dependency graph
requires:
  - phase: 20-admin-pos-draft-order-flow (plan 20-01)
    provides: isManualLine helper in src/lib/orders.ts

provides:
  - isManualLine render guard on all 4 order-item rendering surfaces
  - Invoice PDF: manual lines render name/qty/price only, no variant/config lookup
  - Customer order detail: manual lines show plain span (no Link to /products/<slug>), no image
  - Admin order detail: manual lines skip image, variant/config summary, config JSON block
  - Order-confirmation email: manual lines render name+qty only in HTML and plain-text

affects:
  - Any future surface that renders order_items rows (must follow isManualLine pattern)
  - Phase 20 POS flow (manual lines now safe to render across all surfaces)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-08 isManualLine render guard: import isManualLine from @/lib/orders; if (isManualLine(item)) { render plain name/qty/price } else { existing path with link/image/config }"

key-files:
  created: []
  modified:
    - src/lib/pdf/invoice.tsx
    - src/app/(store)/orders/[id]/invoice.pdf/route.tsx
    - src/app/(store)/orders/[id]/page.tsx
    - src/app/(admin)/admin/orders/[id]/page.tsx
    - src/lib/email/order-confirmation.ts

key-decisions:
  - "Added productId + variantId to InvoiceOrder.items type so invoice PDF can call isManualLine"
  - "Added productId + variantId to OrderWithItems.items type in order-confirmation.ts for same reason"
  - "Customer order page also filters manual lines from ReviewsSection (ReviewCTA links to /products/<slug>)"
  - "Manual line image thumbnail is skipped (no productImage lookup), not just the Link"

patterns-established:
  - "isManualLine guard pattern: check first in any item render loop before any variant/config/image logic"

requirements-completed:
  - REQ-20-2
  - REQ-20-11

# Metrics
duration: 15min
completed: 2026-05-17
---

# Phase 20 Plan 13: isManualLine Render Guard Sweep Summary

**D-08 sentinel guard applied across all 4 order-item render surfaces — invoice PDF, customer order detail, admin order detail, and order-confirmation email — preventing /products/manual 404s and phantom product lookups**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-17T00:00:00Z
- **Completed:** 2026-05-17T00:15:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Invoice PDF: `productId`/`variantId` threaded through route.tsx mapping; render loop branches on `isManualLine` to skip variant/config summary for free-text POS lines
- Customer order detail: `<Link href="/products/...">` wrapped in `isManualLine` discriminator; plain `<span>` for manual lines; productImage skipped; manual lines filtered from ReviewsSection CTA
- Admin order detail: productImage, variant/config summary, and Configuration JSON block all gated by `isManualLine`
- Order-confirmation email: `productId`/`variantId` added to `OrderWithItems.items` type; all three item renderers (HTML, plain-text, DB-template fragment) guard manual lines

## Task Commits

1. **Task 1: invoice PDF + customer order detail** — `26dbffd` (feat)
2. **Task 2: admin order detail + email template** — `352da95` (feat)

## Files Created/Modified

- `src/lib/pdf/invoice.tsx` — Added isManualLine import; productId/variantId to InvoiceOrder.items type; guard in render loop
- `src/app/(store)/orders/[id]/invoice.pdf/route.tsx` — Pass productId/variantId through item mapping to InvoiceDocument
- `src/app/(store)/orders/[id]/page.tsx` — isManualLine guard on product link, product image, variant/config summary, and ReviewsSection filter
- `src/app/(admin)/admin/orders/[id]/page.tsx` — isManualLine guard on image, variant/config summary, Configuration JSON block
- `src/lib/email/order-confirmation.ts` — productId/variantId added to OrderWithItems.items; isManualLine guard in all 3 item renderers

## Decisions Made

- Extended `InvoiceOrder.items` and `OrderWithItems.items` types with `productId` + `variantId` rather than adding a separate `isManual` boolean flag — keeps the guard logic consistent with the D-07 sentinel approach
- Customer `ReviewsSection` receives a filtered list (manual lines excluded) since `ReviewCTA` links to `/products/${productSlug}` and would produce a broken link for the `manual` sentinel

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Filtered manual lines from ReviewsSection in customer order detail**
- **Found during:** Task 1 (customer order detail review)
- **Issue:** `ReviewsSection` passes items to `ReviewCTA` which links to `/products/${productSlug}`. Manual lines have `productSlug = 'manual'`, producing a broken link to `/products/manual`.
- **Fix:** Added `.filter((i) => !isManualLine(i))` before the items map passed to `ReviewsSection`
- **Files modified:** `src/app/(store)/orders/[id]/page.tsx`
- **Verification:** grep confirms no unguarded `/products/${...}` links in order rendering paths
- **Committed in:** `26dbffd`

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing guard)
**Impact on plan:** Essential correctness fix. No scope creep.

## Issues Encountered

None — all target files were straightforward to patch.

## Known Stubs

None — all 4 surfaces fully guarded. Real lines continue to render unchanged.

## Threat Flags

None — this plan adds guards to prevent bad renders; no new network endpoints, auth paths, or trust boundaries.

## Self-Check: PASSED

- `src/lib/pdf/invoice.tsx` — FOUND, isManualLine present (4 occurrences)
- `src/app/(store)/orders/[id]/page.tsx` — FOUND, isManualLine present (5 occurrences)
- `src/app/(admin)/admin/orders/[id]/page.tsx` — FOUND, isManualLine present (4 occurrences)
- `src/lib/email/order-confirmation.ts` — FOUND, isManualLine present (6 occurrences)
- Commit `26dbffd` — FOUND in git log
- Commit `352da95` — FOUND in git log
- `npx tsc --noEmit` — PASS (no output)
- Unguarded product link grep — PASS (no output)

## Next Phase Readiness

- All 4 order-item render surfaces are safe for Phase 20-05 manual order rows
- The `isManualLine` guard pattern is documented and ready to extend to any future surfaces

---
*Phase: 20-admin-pos-draft-order-flow*
*Completed: 2026-05-17*
