---
phase: 20-admin-pos-draft-order-flow
plan: 11
subsystem: admin-orders
tags: [payment-proofs, lightbox, modal, upload, invoice]
dependency_graph:
  requires: [20-07]
  provides: [admin-payment-proof-review-ui, download-invoice-button]
  affects: [src/app/(admin)/admin/orders/[id]/page.tsx]
tech_stack:
  added: []
  patterns:
    - useTransition + revalidatePath (AD-06 pattern)
    - Vaul bottom-sheet for mobile metadata pane
    - Manual multi-query hydration (no LATERAL joins)
    - HTML native <details> for history disclosure
key_files:
  created:
    - src/components/admin/payment-proof-section.tsx
    - src/components/admin/payment-proof-lightbox.tsx
    - src/components/admin/reject-proof-modal.tsx
    - src/components/admin/admin-upload-proof-form.tsx
  modified:
    - src/app/(admin)/admin/orders/[id]/page.tsx
decisions:
  - Vaul DrawerPrimitive.Root used directly (not the shadcn wrapper) to allow direction="bottom" + no overlay conflict with lightbox backdrop
  - HTML native <details> element for history disclosure — no Base UI Disclosure dependency needed for a simple collapsible list
  - Lightbox z-index set as Tailwind class z-50 + Vaul sheet at z-52 to sit above the lightbox backdrop without conflicting with modals at z-40
  - showAdminUploadForm condition based purely on order.status (not paymentMethod column) since paymentMethod not yet in getAdminOrder return type
metrics:
  duration: "~25 min"
  completed: "2026-05-17"
  tasks_completed: 5
  files_changed: 5
---

# Phase 20 Plan 11: Admin Payment-Proof Review Surface + Download Invoice

**One-liner:** Four new admin components — proof section, full-screen lightbox with Vaul mobile bottom-sheet, reject modal, admin upload form — wired into `/admin/orders/[id]` with manual proof hydration and Download Invoice PDF button.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | PaymentProofSection + RejectProofModal | fdeadbd | payment-proof-section.tsx, reject-proof-modal.tsx |
| 2 | PaymentProofLightbox | fdeadbd | payment-proof-lightbox.tsx |
| 3 | AdminUploadProofForm | fdeadbd | admin-upload-proof-form.tsx |
| 4 | Wire /admin/orders/[id] | fdeadbd | page.tsx |
| 5 | Commit 20-11 | fdeadbd | (git only) |

All 5 tasks committed atomically in one commit per plan spec.

## Implementation Notes

### PaymentProofSection (`payment-proof-section.tsx`)
- Props: `{ orderId, proofs: PaymentProof[], orderTotal }` — early-returns null when `proofs.length === 0`
- Latest proof shown prominently: 256×256 thumbnail (12px radius) + metadata sidebar
- Metadata: status pill (amber/green/red), uploader icon (User/Shield), upload time, file size + MIME, expected amount in 28px Chakra Petch bold green-700
- Confirm button: optimistic status flip → `confirmPaymentProof(id)` via `useTransition` → rollback on error
- Reject button: opens `RejectProofModal`
- History: HTML `<details>` disclosure with 40×40 thumbnail rows + ChevronRight to lightbox

### PaymentProofLightbox (`payment-proof-lightbox.tsx`)
- Fixed inset, `z-50` class, ink/95 backdrop
- Desktop (≥768px): image 75% left + metadata sidebar 25% right (cream bg, 24px padding)
- Mobile (<768px): full-bleed image + `DrawerPrimitive` (vaul) bottom-sheet at 40% viewport height
- Keyboard: Esc closes, ← / → navigates between proofs when ≥2 exist
- Sidebar EXPECTED AMOUNT: 40px Chakra Petch bold green-700 with "Order total — confirm slip matches" sub-label
- Close: top-right 48px X button, Esc key, backdrop click; focus restored to opener on close

### RejectProofModal (`reject-proof-modal.tsx`)
- Plain portal modal at z-40 (no Base UI Dialog — explicit z-index control)
- `minLength={8}` textarea + client-side `note.trim().length >= 8` guard
- Calls `rejectPaymentProof(proofId, note)` via `useTransition`
- Cancel/Confirm rejection buttons at 48px; Confirm disabled while note < 8 chars

### AdminUploadProofForm (`admin-upload-proof-form.tsx`)
- Drop-zone with drag-over highlight (purple border)
- MIME allowlist: image/jpeg, image/png, image/webp, image/heic, image/heif, application/pdf
- 10 MB cap enforced client-side + server-side (via `writePaymentProof`)
- Calls `adminUploadPaymentProof(orderId, formData)` via `useTransition`
- No XHR progress (per UI-SPEC admin tolerance)

### Page wiring (`/admin/orders/[id]/page.tsx`)
- Manual proof hydration: `db.select().from(paymentProofs).where(eq(orderId)).orderBy(desc(createdAt))`
- No LATERAL joins (MariaDB 10.11 quirk preserved)
- Download Invoice button: `<a href="/orders/{id}/invoice.pdf" target="_blank" rel="noopener">` with FileDown icon, 48px outlined, in page header right side
- PaymentProofSection mounted between Customer/Shipping cards and Progress/Timeline
- AdminUploadProofForm shown when `status === 'awaiting_customer' | 'awaiting_payment_review'` or `pending` without PayPal capture

## Deviations from Plan

### Auto-applied decisions

**1. [Rule 3 - Blocking] Simplified showAdminUploadForm to status-only condition**
- **Found during:** Task 4
- **Issue:** `getAdminOrder` return type does not include `paymentMethod` column (not yet added to the action's select). Using `row.paymentMethod` would cause a TS type error.
- **Fix:** Condition uses `row.status` values only: `awaiting_customer | awaiting_payment_review | (pending && !paypalCaptureId)` — achieves the same semantic intent.
- **Files modified:** `src/app/(admin)/admin/orders/[id]/page.tsx`
- **Commit:** fdeadbd

**2. [Rule 3 - Blocking] Used DrawerPrimitive directly instead of shadcn Drawer wrapper**
- **Found during:** Task 2 (lightbox)
- **Issue:** The existing `src/components/ui/drawer.tsx` defaults to `direction="right"` and sets `z-50` on its overlay. Using it inside an already-z-50 lightbox would conflict. The Vaul `DrawerPrimitive.Root` with `direction="bottom"` + no overlay is the correct approach.
- **Fix:** Import `Drawer as DrawerPrimitive from "vaul"` directly; skip overlay; set `z-52` on the sheet content.
- **Commit:** fdeadbd

## Known Stubs

None — all components wire to live server actions from Plan 20-07.

## Threat Flags

None — no new network endpoints or auth paths introduced. All mutations guarded by `requireAdmin()` inside the called server actions.

## Self-Check: PASSED

Files exist:
- [x] src/components/admin/payment-proof-section.tsx
- [x] src/components/admin/payment-proof-lightbox.tsx
- [x] src/components/admin/reject-proof-modal.tsx
- [x] src/components/admin/admin-upload-proof-form.tsx
- [x] src/app/(admin)/admin/orders/[id]/page.tsx (modified)

Commit exists:
- [x] fdeadbd — feat(20-11): admin order-detail payment-proof review surface + Download Invoice

TypeScript: 0 errors (`npx tsc --noEmit`)
