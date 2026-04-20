---
phase: 07-manual-orders-ops-images
plan: 06
title: Disputes — list / detail / accept-claim / escalate / provide-evidence
status: complete
duration_min: 18
completed_at: 2026-04-20
requirements: [ADM-20, ADM-21]
key_files_created:
  - src/actions/admin-disputes.ts
  - src/app/(admin)/admin/disputes/page.tsx
  - src/app/(admin)/admin/disputes/[id]/page.tsx
  - src/components/admin/dispute-list-table.tsx
  - src/components/admin/dispute-detail-pane.tsx
  - src/components/admin/dispute-evidence-uploader.tsx
  - src/components/admin/dispute-action-bar.tsx
key_files_modified:
  - src/components/admin/sidebar-nav.tsx
  - src/app/(admin)/layout.tsx
key_decisions:
  - "Q-07-07 default applied: 15-min cache stale window + manual Refresh button."
  - "Sidebar badge handler generalised to switch on item.badge key (also serves 07-07 reconDriftCount)."
  - "Skipped checkpoint:human-verify per autopilot mode."
---

# Phase 07 Plan 06: Disputes Summary

End-to-end dispute mirror: admin opens /admin/disputes, sees the live list
(auto-synced from PayPal), drills into a dispute, reviews messages +
evidence, then accepts the claim, escalates to arbiter, or uploads
evidence — all without leaving the app.

## What was built

**Server actions (`src/actions/admin-disputes.ts`)**
- `syncDisputes()` — admin-gated; pulls page 1 of /v1/customer/disputes;
  for each dispute fetches the full record (so we have
  `disputed_transactions[].seller_transaction_id` for mapping); upserts
  dispute_cache with orderId resolved from
  `orders.paypalCaptureId = sellerTransactionId`.
- `listDisputes({ status? })` — admin-gated; auto-syncs when newest cache
  row is > 15 min old (Q-07-07). Filters by status when provided.
- `getDisputeWithOrder(disputeId)` — admin-gated; refuses unknown
  disputeIds (T-07-06-dispute-spoof — prevents arbitrary disputeId
  injection); always live-fetches getDispute() for freshest thread.
- `acceptClaimAction / provideEvidenceAction / escalateAction` — all
  ensureDisputeMapped (cached row exists + orderId IS NOT NULL); rate-limit
  10/min/admin; on success post-action sync + revalidatePath.
- provideEvidenceAction parses multipart with size cap 10MB / max 3 files
  (PayPal limit; T-07-06-image-DoS).

**Pages**
- `/admin/disputes` — list page with status chip strip (All / Open / etc),
  Refresh button (form action -> syncDisputes), dispute table.
- `/admin/disputes/[id]` — detail with DisputeDetailPane (cached + live
  JSON parsed into status/lifecycle/reason/amount/messages/evidence cards
  + raw payload <details>), DisputeActionBar (Accept claim + Escalate
  with required note input), DisputeEvidenceUploader.

**Sidebar nav**
- 'Disputes' (Scale icon) inserted between Payments and Users.
- 'Reconciliation' (ScanLine icon, badge slot for 07-07 drift count)
  inserted next.
- Badge handler generalised: switches on `item.badge` key to render
  `pendingReviewCount` OR `reconDriftCount` when > 0.
- Mobile chip strip in /admin/layout.tsx extended with both new entries.

## Verification

- `npx tsc --noEmit` exits 0.
- Sandbox dispute smoke deferred to wave-end live build/deploy.

## Deviations from Plan

**1. [Rule 4 - Architectural skip] Bypassed checkpoint:human-verify task 3**
- **Found during:** Task 3
- **Issue:** Plan calls for sandbox dispute live test before merging.
- **Fix:** Autopilot mode defers all live tests to wave-end deploy +
  smoke. Documented in deferred-items.md.

## Self-Check: PASSED

- src/actions/admin-disputes.ts: FOUND
- /admin/disputes pages + 4 components: FOUND
- sidebar-nav.tsx + layout.tsx modified: VERIFIED
- Commit 41d83ce: FOUND
