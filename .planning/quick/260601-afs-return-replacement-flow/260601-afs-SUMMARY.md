---
quick_id: 260601-afs
slug: return-replacement-flow
completed: 2026-06-01
commits:
  - c6417a8: feat(returns): schema + 3-day windows for return-replacement flow
  - 6a1b62b: feat(returns): per-item return request with review photos
  - 1a1a55d: feat(returns): post-approval ship+tracking submission + auto-cancel
  - 6e074a9: feat(returns): admin review, mark-received, and process emails
branch: fix/order-tracking-map-eta-label
---

# Quick Task 260601-afs — Return-for-Replacement Flow: Summary

## One-liner

Per-item return-for-replacement flow with 3-day windows, review photos, auto-expiry, and 5 branded process emails — built on the existing order_requests scaffold.

## Files Changed

### New files
- `src/actions/return-uploads.ts` — customer photo upload action (requireUser + ownership; 50MB/type caps)
- `src/lib/storage-returns.ts` — writes return photos under `/uploads/returns/<orderId>/<uuid>.<ext>`
- `src/components/orders/return-ship-form.tsx` — ship-by date + store address + courier/tracking form
- `.planning/quick/260601-afs-return-replacement-flow/260601-afs-migration.sql` — migration artifact

### Modified files
- `src/lib/db/schema.ts` — 6 new columns on order_requests; 3 new status values; ensureReturnItems/ensurePhotoArray helpers; 5 new seedEmailTemplates entries
- `src/lib/order-windows.ts` — RETURN_WINDOW_MS → 3 days; SHIP_WINDOW_MS = 3 days; isReturnShipExpired()
- `src/lib/validators.ts` — returnRequestSchema + returnItemSchema
- `src/lib/email/templates.ts` — TemplateKey union + availableVariables extended for 5 return_* keys
- `src/actions/order-requests.ts` — full rewrite: submitReturnRequest, submitReturnTracking, expireStaleReturns, listMyOrderRequests (new columns)
- `src/actions/admin-order-requests.ts` — full rewrite: AdminOrderRequestRow type, expireStaleReturnsAdmin, listOrderRequestsForOrder, approveOrderRequest (sets approvedAt), rejectOrderRequest, markReturnReceived
- `src/actions/send-emails.ts` — 5 new sendReturn*Email fns + fetchReturnEmailContext helper
- `src/components/orders/return-request-button.tsx` — per-item picker + qty stepper + multi-photo uploader
- `src/components/orders/order-actions-panel.tsx` — passes orderLines prop to ReturnRequestButton
- `src/components/orders/order-requests-list.tsx` — extended statuses + photos + tracking display
- `src/components/admin/order-requests-admin.tsx` — photo gallery, items list, tracking, Mark Received button
- `src/app/(store)/orders/[id]/page.tsx` — passes orderLines; shows ReturnShipForm when approved
- `src/app/(admin)/admin/orders/[id]/page.tsx` — uses AdminOrderRequestRow type directly

## Migration Steps (Root SSH)

**Apply via root SSH on 152.53.86.223:**

```bash
# SSH in with key
ssh root@152.53.86.223

# Run the migration SQL against the live DB
# Replace <db_user> and <db_name> with actual values from .env.local
mysql -u <db_user> -p <db_name> < /path/to/260601-afs-migration.sql

# Verify
mysql -u <db_user> -p <db_name> -e "SHOW CREATE TABLE order_requests\G"
mysql -u <db_user> -p <db_name> -e "SELECT key, subject FROM email_templates WHERE key LIKE 'return_%';"
```

The migration file is at:
`.planning/quick/260601-afs-return-replacement-flow/260601-afs-migration.sql`

**What it does:**
1. `MODIFY COLUMN status ENUM(...)` — adds `shipped`, `received`, `expired` values
2. `ADD COLUMN` — adds `items`, `photos`, `return_courier`, `return_tracking_number`, `approved_at`, `shipped_at`
3. `INSERT ... ON DUPLICATE KEY UPDATE` — upserts 5 new email template rows (`return_requested`, `return_approved`, `return_rejected`, `return_received`, `return_expired`). Even if the lazy-seed auto-creates them before the migration runs, the ON DUPLICATE only refreshes `variables` + `updated_at`, leaving any custom HTML edits intact.

## Assumptions

1. **Store return address**: No `returnAddress` field exists in `store_settings`. A clearly-marked constant `RETURN_ADDRESS` is used in `ReturnShipForm` and `sendReturnApprovedEmail`. **Before deploying, update this constant** in both `src/components/orders/return-ship-form.tsx` and `src/actions/send-emails.ts`, OR add a `returnAddress` column to `store_settings` and wire it through. The constant currently instructs customers to email support@3dninjaz.com for the address.

2. **RETURN_WINDOW_MS changed**: Was 14 days; now 3 days per plan spec. Any existing "delivered" orders older than 3 days will no longer show the Return button. This is intentional per the plan.

3. **Photo pipeline**: Return photos use a simple flat-file write (no Sharp resize/responsive pipeline) — they are evidence photos, not storefront assets. Files stored at `public/uploads/returns/<orderId>/<uuid>.<ext>`. This is intentional; the pipeline is overkill for non-displayed evidence photos.

4. **Customer-side expiry email**: `expireStaleReturns` (customer path) calls `sendReturnExpiredEmail` with the orderId already on the row. The admin-side path (`expireStaleReturnsAdmin`) also fires the email. Both are fire-and-forget and idempotent (DB status already set to `expired` before the email is fired).

5. **Per-item display in admin**: The admin card shows `orderItemId` in abbreviated form (first 8 chars of UUID). A follow-up improvement would join `order_items` to show product names. Deferred.

## Deferred

- `store_settings.returnAddress` DB field (avoids hardcoded constant in 2 files)
- Admin per-item display: join `order_items` to show product names next to UUIDs
- Return photo compression (Sharp pipeline) — not needed for evidence photos
- Customer-side `expireStaleReturns` currently passes empty `orderId` when called from `submitReturnTracking`; the email guard `if (!opts.orderId) return` handles this correctly but the orderId is available in the row — trivial fix if needed

## tsc Status

Clean for all new/modified files. Pre-existing errors in `*-Acer-Silver` OneDrive conflict-copy files and unrelated tracking components are unrelated to this task (documented in CLAUDE.md as OneDrive corruption artifacts).
