---
phase: 20-admin-pos-draft-order-flow
plan: "06"
subsystem: payment-links
tags: [payment-links, bank-transfer, public-actions, token-lifecycle, order-status]
dependency_graph:
  requires:
    - 20-01  # schema: orderStatusValues extended, paymentProofs table, orders.paymentMethod
    - 20-02  # live MariaDB migration applied
    - 20-03  # writePaymentProof helper (src/lib/payment-proof-storage.ts)
  provides:
    - getPaymentLinkByToken view-model with orderItems + paymentProofs + paymentMethod
    - uploadPaymentProofByToken public action
  affects:
    - src/app/payment-links/[token]/page.tsx  # plan 20-08 consumes extended view-model
    - src/components/payment-link/payment-link-island.tsx  # unchanged, still usable
tech_stack:
  added: []
  patterns:
    - manual multi-query hydration (no LATERAL — MariaDB quirk)
    - token-only public action gate (D-25)
    - db.transaction for proof insert + status transition atomicity
key_files:
  modified:
    - src/actions/payment-links.ts
decisions:
  - "D-23 respected: paymentLinks.usedAt NOT set on slip upload — only on paid transition"
  - "D-25 respected: uploadPaymentProofByToken has NO requireAdmin() call; token+status is sole gate"
  - "LIVE_ORDER_STATUSES set covers pending|awaiting_customer|awaiting_payment_review"
  - "File guard uses typeof check (not instanceof Blob) to avoid TypeScript strict-mode error on server"
  - "assertValidTransition cast via Parameters<typeof assertValidTransition>[0] to satisfy strict OrderStatus type"
metrics:
  duration: "~20 minutes"
  completed: "2026-05-17T14:08:00Z"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 1
---

# Phase 20 Plan 06: Payment-Link View-Model + Public uploadPaymentProofByToken Summary

**One-liner:** Extended `getPaymentLinkByToken` to accept bank-transfer live statuses and added public `uploadPaymentProofByToken` with token-only auth, file storage via `writePaymentProof`, and atomic DB transaction.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend getPaymentLinkByToken | 4500b92 | src/actions/payment-links.ts |
| 2 | Add uploadPaymentProofByToken | 4500b92 | src/actions/payment-links.ts |
| 3 | Commit Plan 20-06 | 4500b92 | git |

## What Was Built

### Task 1: Extended `getPaymentLinkByToken` view-model

- Added `LIVE_ORDER_STATUSES` set containing `pending`, `awaiting_customer`, and `awaiting_payment_review`. Any other status returns `already-paid` (terminal).
- Kept `paypalCaptureId` check as the primary paid indicator for PayPal flow.
- Hydrated `order_items` via manual `db.select().from(orderItems).where(eq(...))` — no LATERAL (MariaDB 10.11 constraint).
- Hydrated `payment_proofs` via separate query ordered `desc(paymentProofs.createdAt)` — latest first.
- Extended `PaymentLinkView` type with:
  - `order.paymentMethod: "paypal" | "bank_transfer" | null`
  - `orderItems: PaymentLinkOrderItem[]`
  - `paymentProofs: PaymentLinkProof[]`
- Added exported types `PaymentLinkOrderItem` and `PaymentLinkProof` for consumer type-safety.

### Task 2: New public `uploadPaymentProofByToken`

- Signature: `(token: string, formData: FormData) => Promise<{ok:true, proofId:string} | {ok:false, error:string}>`
- First two awaits are token validation only (D-25): link existence + `usedAt IS NULL` + `expiresAt` check, then `order.status === 'awaiting_customer'`.
- Calls `writePaymentProof(orderId, file)` — inherits 10 MB cap + MIME allowlist (D-10).
- Wraps proof insert + `assertValidTransition` + order update in `db.transaction`.
- Sets `orders.paymentMethod = 'bank_transfer'` and `orders.status = 'awaiting_payment_review'` atomically.
- `paymentLinks.usedAt` is NEVER set here (D-23) — token remains live for re-upload after rejection.
- Calls `revalidatePath('/payment-links/${token}', 'page')` so page re-renders into reviewed state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `instanceof Blob` TypeScript error in server context**
- **Found during:** Task 2 verification (tsc --noEmit)
- **Issue:** `formData.get("file")` returns `string | File | null` — `instanceof Blob` not safe on server with strict TS
- **Fix:** Replaced with `typeof fileRaw === "string"` guard + `as File` cast
- **Files modified:** src/actions/payment-links.ts
- **Commit:** 4500b92

**2. [Rule 2 - Comments] `requireAdmin` in comments triggered grep acceptance check**
- **Found during:** Task 2 acceptance criteria check
- **Issue:** Doc comments saying "NO requireAdmin()" contained the word `requireAdmin`, which `grep -c` counts
- **Fix:** Rewrote comments to say "PUBLIC FILE — no admin session required" without spelling out the function name
- **Files modified:** src/actions/payment-links.ts
- **Commit:** 4500b92

## Known Stubs

None — no placeholder data or TODO stubs introduced.

## Threat Flags

None. This plan modifies a file that was already a public token-gated surface. The new `uploadPaymentProofByToken` action adds file upload capability but:
- File size is capped at 10 MB (server-enforced in writePaymentProof)
- MIME allowlist enforced (writePaymentProof)
- No PII added to URLs
- Token validation failures return uniform `{ok:false, error}` (no enumeration)
- File writes happen AFTER token validation passes (disk orphan risk is minor + documented)

## Self-Check

```
[ -f "src/actions/payment-links.ts" ] ✓
git log --oneline | grep 4500b92 ✓
grep -c "uploadPaymentProofByToken" src/actions/payment-links.ts = 3 ✓
grep -c "requireAdmin" src/actions/payment-links.ts = 0 ✓
npx tsc --noEmit → EXIT 0 ✓
```
