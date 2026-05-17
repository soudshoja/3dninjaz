---
phase: 20-admin-pos-draft-order-flow
plan: "07"
subsystem: payments
tags: [bank-transfer, payment-proofs, admin-moderation, server-actions, drizzle, file-upload]

# Dependency graph
requires:
  - phase: 20-admin-pos-draft-order-flow plan 01
    provides: "schema — paymentProofs table, orderStatusValues extended, orders.paymentMethod column"
  - phase: 20-admin-pos-draft-order-flow plan 02
    provides: "ORDER_STATUS_FLOW extended with awaiting_payment_review edges, assertValidTransition updated"
  - phase: 20-admin-pos-draft-order-flow plan 03
    provides: "writePaymentProof helper (src/lib/payment-proof-storage.ts)"
provides:
  - "confirmPaymentProof server action: approves slip, transitions order to paid, consumes payment link token, fires post-paid email"
  - "rejectPaymentProof server action: rejects slip with admin_note, returns order to awaiting_customer, token stays alive for re-upload"
  - "adminUploadPaymentProof server action: admin attaches slip on behalf of customer, no auto-transition"
affects: [20-08, 20-09, 20-10, 20-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-23 token lifecycle: paymentLinks.usedAt set ONLY by confirmPaymentProof — reject MUST NOT touch it"
    - "Fire-and-forget post-paid email: void sendOrderConfirmationEmail(id).catch(...) after transaction commits"
    - "requireAdmin() as absolute first await in every exported action (CVE-2025-29927)"
    - "db.transaction wraps multi-table state change (proof + order + paymentLink in confirm; proof + order in reject)"

key-files:
  created:
    - src/actions/admin-payment-proofs.ts
  modified: []

key-decisions:
  - "paidAt column does not exist in orders schema — skipped; updatedAt auto-updates on orders.set()"
  - "usedAt UPDATE uses eq(paymentLinks.orderId, order.id) without isNull guard to cover all unused links for the order atomically"
  - "instanceof Blob removed — File is sufficient and Blob type causes TS2358 in server-only context"

patterns-established:
  - "Admin payment-proof result types: ConfirmPaymentProofResult | RejectPaymentProofResult | AdminUploadPaymentProofResult"
  - "revalidatePath on /admin/orders, /admin/orders/[id], and /payment-links/[token] page after each state change"

requirements-completed:
  - REQ-20-8
  - REQ-20-9
  - REQ-20-12

# Metrics
duration: 18min
completed: 2026-05-17
---

# Phase 20 Plan 07: Admin Payment Proof Moderation Actions Summary

**Three admin server actions for bank-transfer slip review: Confirm (paid + email + token consumed), Reject (back to awaiting_customer + token preserved), and admin slip upload (pending row, no auto-transition)**

## Performance

- **Duration:** 18 min
- **Started:** 2026-05-17T00:00:00Z
- **Completed:** 2026-05-17T00:18:00Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- `confirmPaymentProof`: db.transaction atomically approves proof, transitions order `awaiting_payment_review → paid`, sets `paymentMethod='bank_transfer'`, consumes payment link token via `usedAt=NOW()` (D-23), then fires `sendOrderConfirmationEmail` fire-and-forget identical to PayPal capture path
- `rejectPaymentProof`: validates `adminNote ≥ 8 chars` server-side, db.transaction rejects proof and returns order to `awaiting_customer`; DOES NOT touch `paymentLinks.usedAt` (D-23 — customer re-opens same URL to re-upload)
- `adminUploadPaymentProof`: requires admin, extracts File from FormData, delegates to `writePaymentProof` for cap/MIME enforcement, inserts `payment_proofs` row with `uploaded_by='admin'`; does not auto-transition order status

## Task Commits

1. **Task 1 + 2: Author confirmPaymentProof + rejectPaymentProof + adminUploadPaymentProof** - `956d16f` (feat)
2. **Task 3: Commit Plan 20-07** - included in `956d16f`

**Plan metadata:** (this SUMMARY commit)

## Files Created/Modified

- `src/actions/admin-payment-proofs.ts` - All three admin payment proof moderation server actions

## Decisions Made

- `paidAt` column referenced in plan behavior spec does not exist in the `orders` schema — omitted. The `updatedAt` timestamp column auto-updates via `onUpdateNow()` when `status='paid'` is written.
- `usedAt` UPDATE uses a single `eq(paymentLinks.orderId, order.id)` condition (without `isNull`) — this atomically covers all links for the order regardless of prior state, which is safe because confirm only fires after a successful `assertValidTransition` to `paid` (meaning the order was in `awaiting_payment_review`).
- Removed `instanceof Blob` check in `adminUploadPaymentProof` — `Blob` type is not globally available in the server-only Next.js context and caused TS2358. `File` (which extends Blob) is sufficient for FormData file entries.

## Deviations from Plan

None - plan executed as specified, with one minor schema-reality adjustment (paidAt column absent; auto-deviation documented above as a decision).

## Issues Encountered

- Pre-existing TypeScript error in `src/actions/admin-store-settings-bank.ts` (wrong export name `invalidateStoreSettingsCache` vs `clearStoreSettingsCache`) existed before this plan. Out of scope per SCOPE BOUNDARY rule — logged here for awareness. No errors in `admin-payment-proofs.ts`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 20-11 (admin order detail UI) can import and call all three actions without further server-side authoring
- `confirmPaymentProof(proofId)`, `rejectPaymentProof(proofId, adminNote)`, `adminUploadPaymentProof(orderId, formData)` are all exported and typed
- Pre-existing TS error in `admin-store-settings-bank.ts` should be fixed in Plan 20-08 or whichever plan authors that file

---
*Phase: 20-admin-pos-draft-order-flow*
*Completed: 2026-05-17*
