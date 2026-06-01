---
phase: 20-admin-pos-draft-order-flow
plan: "08"
subsystem: payment-links
tags: [customer-facing, payment, bank-transfer, ui, mobile-first]
dependency_graph:
  requires: [20-04, 20-06]
  provides: [public-bank-transfer-ui, method-picker, proof-pending-state]
  affects: [payment-links-page, payment-proof-upload]
tech_stack:
  added: []
  patterns: [XHR-progress-upload, two-card-method-picker, copy-to-clipboard-chips, server-component-status-branch]
key_files:
  created:
    - src/components/payment-link/payment-method-picker.tsx
    - src/components/payment-link/bank-transfer-card.tsx
    - src/components/payment-link/proof-pending-state.tsx
    - src/app/api/payment-links/[token]/proof/route.ts
  modified:
    - src/app/payment-links/[token]/page.tsx
    - src/actions/payment-links.ts
decisions:
  - "XHR route shim (/api/payment-links/[token]/proof) chosen over Server Action for upload progress UX"
  - "order.status added to PaymentLinkView so page can branch without a second DB query"
  - "max-h CSS approach for card expand/collapse avoids height animation JS complexity"
metrics:
  duration: "~30 minutes"
  completed: "2026-05-17"
  tasks_completed: 4
  files_changed: 6
---

# Phase 20 Plan 08: Public Draft Page with Method Picker + Bank Transfer Slip Upload — Summary

**One-liner:** Two-card payment method picker (PayPal | Bank Transfer) on the public draft page with XHR slip upload, D-16 server-side bank-empty guard, and post-upload "being reviewed" state.

## Tasks Completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Refactor /payment-links/[token]/page.tsx — render order_items + method-picker mount | Done | 9497152 |
| 2 | Author payment-method-picker.tsx client island | Done | 9497152 |
| 3 | Author bank-transfer-card.tsx + proof-pending-state.tsx | Done | 9497152 |
| 4 | Commit Plan 20-08 | Done | 9497152 |

## What Was Built

### `/payment-links/[token]/page.tsx` (refactored)
- Replaced single PayPal render with `<PaymentMethodPicker>` mount
- Replaced `customItem*` single-blob render with proper `orderItems` list using `isManualLine` guard (D-08)
- D-16 server-side guard: reads `bankName`, `bankAccountNumber`, `bankAccountHolder` from `getStoreSettingsCached()` and passes `bankSettingsComplete: boolean` to the picker
- Status branches: `awaiting_payment_review` + latestProof → `<ProofPendingState>`; all other live statuses → method picker
- Rejection banner (red-50, AlertCircle) shown when `latestProof.status === 'rejected'` with `autoExpandBankTransfer` prop

### `payment-method-picker.tsx` (new)
- "use client" component with `selected: 'paypal' | 'bank_transfer' | null` state
- Two cards side-by-side ≥768px (flex-row), stacked <768px (flex-col)
- Each card: 60px min-height collapsed, 2px brand border (blue for PayPal, purple for Bank Transfer), Lucide `Wallet`/`Landmark` icons, check badge when active
- Smooth 250ms `max-h` expand/collapse transition
- D-16: Bank Transfer card not rendered when `!bankSettingsComplete`
- `prefers-reduced-motion` CSS block drops the transition
- Sharp 4px corners (`rounded-[4px]`) throughout, no scale hover

### `bank-transfer-card.tsx` (new)
- "use client" component with XHR upload + progress events
- 4 copy-to-clipboard chips (bank name, account number monospace 18px, account holder, amount 24px Chakra Petch green-700)
- `navigator.clipboard.writeText` with Copy→Check swap (1.5s)
- Dashed 2px purple drop-zone (160px min-height), `UploadCloud` 32px icon
- File validation: MIME allowlist (`image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`, `application/pdf`) + 10 MB cap
- On select: image thumbnail preview (URL.createObjectURL) or PDF placeholder card
- XHR progress: 4px purple bar along bottom edge of drop-zone during upload
- On success: `router.refresh()` to trigger server re-render as ProofPendingState
- 60px green "Submit proof of payment" button, disabled until file selected

### `proof-pending-state.tsx` (new)
- Server-compatible (no "use client" needed — pure render)
- `CheckCircle2` 56px green icon + "Proof received" heading
- "Admin will confirm within 24 hours" copy
- Re-displays order reference, bank chips (read-only), 96px uploaded slip thumbnail (12px radius — "photo feel" per UI-SPEC)
- WhatsApp outlined deeplink button (MessageCircle icon)

### `/api/payment-links/[token]/proof/route.ts` (new)
- Thin POST route handler shim wrapping `uploadPaymentProofByToken`
- Enables XHR `xhr.upload.onprogress` events (Server Actions don't support this)
- Delegates ALL validation, file caps, and DB writes to the existing server action

### `payment-links.ts` (minor extension)
- Added `status: string` field to `PaymentLinkView.order` (deviation — missing critical data for UI branch)
- Added `status: order.status` to the view-model return

## Deviations from Plan

### Auto-added Missing Critical Functionality

**1. [Rule 2 - Missing Data] Added `order.status` to `PaymentLinkView`**
- **Found during:** Task 1
- **Issue:** The page needs to branch on `awaiting_payment_review` vs other statuses, but `PaymentLinkView.order` did not include `status`
- **Fix:** Added `status: string` to the type definition and `status: order.status` to the return object in `getPaymentLinkByToken`
- **Files modified:** `src/actions/payment-links.ts`
- **Commit:** 9497152

## Known Stubs

None — all data flows from real DB rows. Bank details come from `store_settings`; order items from `order_items` table; proofs from `payment_proofs` table.

## Threat Flags

None — no new trust boundaries introduced. The API route shim at `/api/payment-links/[token]/proof` delegates to the existing token-validated `uploadPaymentProofByToken` action which enforces the same D-25 public-token gate.

## Self-Check: PASSED

Files exist:
- `src/app/payment-links/[token]/page.tsx` — FOUND
- `src/components/payment-link/payment-method-picker.tsx` — FOUND
- `src/components/payment-link/bank-transfer-card.tsx` — FOUND
- `src/components/payment-link/proof-pending-state.tsx` — FOUND
- `src/app/api/payment-links/[token]/proof/route.ts` — FOUND

Commit 9497152 — FOUND (git log confirmed)

TypeScript errors in our files — NONE (pre-existing `pos-builder.tsx` errors from sibling plan 20-09 are out of scope)
