---
quick_id: 260601-afs
slug: return-replacement-flow
description: Customer return-for-replacement (re-do) flow with per-item picking, photos, 3-day windows, auto-cancel, and process emails
date: 2026-06-01
status: planned
---

# Quick Task 260601-afs — Return-for-replacement (re-do) flow

## Goal

Let a customer request a **return that results in a re-make/replacement (NOT a refund)**
through `/orders/[id]`, building on the EXISTING `order_requests` scaffold. Outcome of an
approved return = store re-makes + reships (operational/manual). The system tracks the
request to "received" and never issues money back.

**Hard rule:** never add/trigger refund logic or use the word "refund" in any new copy.
Leave the existing refund tooling (`admin-refunds.ts`, `order_refunded`) untouched.

## State machine (extend `orderRequestStatusValues`)

```
pending ──approve──► approved ──customer ships+tracking──► shipped ──admin──► received
   │                    │
 reject               (no ship in 3 days)
   ▼                    ▼
rejected             expired   (auto-cancel)
```
Add `"shipped"`, `"received"`, `"expired"` to the existing `pending|approved|rejected`.

## Two 3-day windows (`src/lib/order-windows.ts`)

- `RETURN_WINDOW_MS` → **3 days** (request window: order delivered ≤3 days ago).
- Add `SHIP_WINDOW_MS = 3 days` (ship-by window: from `approvedAt`).

---

## Task 1 — Schema + migration + windows

**`src/lib/db/schema.ts` `orderRequests`** — add columns:
- `items` LONGTEXT — JSON `[{orderItemId, qty}]` (the per-item return selection).
- `photos` LONGTEXT — JSON `string[]` (1–4 stored review-photo paths).
- `returnCourier` varchar(120) null
- `returnTrackingNumber` varchar(160) null
- `approvedAt` timestamp null
- `shippedAt` timestamp null
- extend `orderRequestStatusValues` with `shipped`, `received`, `expired`.

Use the project's JSON-as-LONGTEXT convention (see `text("...")`/LONGTEXT usage + the
`ensureImagesArray`-style parse helpers in `src/actions/products.ts`). Add a small
`ensureReturnItems()` / `ensurePhotoArray()` parse helper (mysql2 returns JSON as string).

**`src/lib/order-windows.ts`** — set request window to 3d, add `SHIP_WINDOW_MS`.

**Migration SQL** — write `260601-afs-migration.sql` in this task dir with raw
`ALTER TABLE order_requests ADD COLUMN ...` + `MODIFY COLUMN status ENUM(...)` matching
Drizzle byte-for-byte (LONGTEXT, varchar lengths, `NULL` timestamps). DO NOT run
`drizzle-kit push` against remote. Include a `SHOW CREATE TABLE order_requests;` check note.
The user applies it via the documented root-SSH path.

**Commit:** `feat(returns): schema + 3-day windows for return-replacement flow`

## Task 2 — Customer request: per-item picker + photo upload

**`src/lib/validators.ts`** — add `returnRequestSchema`: `orderId`, `reason` (10–1000),
`items` (min 1, each `{orderItemId: uuid, qty: int>=1}`), `photos` (min 1, max 4, string paths).
Keep the existing cancel path on `orderRequestSchema` unchanged.

**Customer photo upload action** — new `src/actions/return-uploads.ts` (or extend
`src/actions/uploads.ts`): `requireUser()` FIRST await; verify the order belongs to the user
(SELECT orders.userId); accept one image; validate type (jpg/png/webp/heic) + size using the
SAME caps as the existing pipeline (`src/lib/storage.ts` / `image-pipeline` — read
[[project_image_upload_pipeline]] conventions); persist under `returns/<orderId>/<uuid>.<ext>`;
return the public path. Enumeration-safe (same null shape for missing/not-yours).

**`src/actions/order-requests.ts` `submitOrderRequest`** (return branch):
- Validate with `returnRequestSchema`.
- Eligibility: `order.status === "delivered"` AND `Date.now()-deliveredAt <= RETURN_WINDOW_MS`.
- Validate `items`: every `orderItemId` belongs to this order and `qty <=` that line's ordered qty
  (SELECT order_items WHERE orderId). Reject otherwise.
- Keep the one-pending-per-order guard.
- Insert with `items`/`photos` JSON, `crypto.randomUUID()` id.
- Fire `sendReturnRequestedEmail(...)` (fire-and-forget, try/catch).

**Customer UI** — replace `ReturnRequestButton` form (or add a sibling) with:
per-item checklist (each returnable order line + qty stepper, max = ordered qty) + a 1–4
photo uploader (multi `file` input → calls the upload action, shows thumbnails + remove,
disables submit until ≥1 photo). Reuse existing uploader UI/styling if one exists; otherwise
a minimal accessible file input with object-URL previews. All copy = "return / replacement".

**Commit:** `feat(returns): per-item return request with review photos`

## Task 3 — Approval, ship+tracking, lazy auto-cancel

**`src/lib/order-windows.ts` helper** — `isReturnShipExpired(req)`:
`req.status==="approved" && req.approvedAt && !req.shippedAt && Date.now() > approvedAt + SHIP_WINDOW_MS`.

**Lazy expiry** — `expireStaleReturns(rows)` in `order-requests.ts`: for any row that
`isReturnShipExpired`, UPDATE it to `status="expired", resolvedAt=now()`, fire
`sendReturnExpiredEmail` ONCE, and mutate the in-memory row. Call it inside
`listMyOrderRequests` AND the admin `listOrderRequestsForOrder` so both customer + admin reads
self-heal. (No cron needed.)

**`submitReturnTracking(requestId, courier, trackingNumber)`** in `order-requests.ts`:
`requireUser` + ownership; run expiry check first; require current status `approved`; set
`returnCourier`, `returnTrackingNumber`, `shippedAt=now()`, `status="shipped"`. revalidate
both order pages.

**Customer UI** — `ReturnShipForm` shown on `/orders/[id]` when the order has an `approved`
return request: show **ship-by date** (`approvedAt + 3d`), the **store return address**, and
courier + tracking inputs → `submitReturnTracking`. Find the store return address source
(store settings via `admin-settings`/store-settings; fall back to a clearly-marked constant if
none). `OrderRequestsList` + status timeline must render `shipped`/`received`/`expired` and show
the returned items, photo thumbnails, tracking, and ship-by.

**Commit:** `feat(returns): post-approval ship+tracking submission + auto-cancel`

## Task 4 — Admin review + emails

**`src/actions/admin-order-requests.ts`**:
- `approveOrderRequest` (return): set `approvedAt=now()`, status `approved`; fire
  `sendReturnApprovedEmail` (ship-by date + return address). (Cancel branch unchanged.)
- `rejectOrderRequest`: fire `sendReturnRejectedEmail` (reason = adminNotes).
- `markReturnReceived(requestId)`: requireAdmin; require status `shipped`; set
  `status="received"`; fire `sendReturnReceivedEmail`. Terminal.
- All list/detail reads call `expireStaleReturns`.

**Admin UI** (admin order detail + its requests section): photo gallery, the per-item list
being returned, Approve / Reject; once `shipped` show courier+tracking; **Mark received** button.

**Emails** — add 5 templates to `seedEmailTemplates()` in `schema.ts` via
`brandedEmailTemplate(icon, heading, bodyHtml, cta?)`, matching existing var/branding
conventions: `return_requested`, `return_approved` (vars incl `ship_by_date`, `return_address`),
`return_rejected` (`reason`), `return_received`, `return_expired`. Add matching
`sendReturn*Email` fns to `src/actions/send-emails.ts` (fire-and-forget, skip `@3dninjaz.local`).
**Seed the new rows into the DB**: find how `seedEmailTemplates()` is applied (seed script) and
add an idempotent upsert; if seeding is manual, include `INSERT ... ON DUPLICATE KEY UPDATE`
for the 5 new keys in the migration SQL so `renderTemplate` finds them in prod.

**Commit:** `feat(returns): admin review, mark-received, and process emails`

---

## Constraints / gotchas
- `requireUser()` / `requireAdmin()` as the FIRST await on every server action (CVE-2025-29927).
- MariaDB: no LATERAL (manual multi-query), JSON as LONGTEXT + manual parse, app `crypto.randomUUID()`.
- Ownership + enumeration-safe responses on every customer action.
- `tsc --noEmit` must be clean (ignore pre-existing TS6053 OneDrive "file not found" noise).
- DO NOT push/deploy and DO NOT run drizzle-kit push — user handles dev push + the MariaDB
  migration via root-SSH after review.
- Copy is "return / replacement / re-make" everywhere. Never "refund".

## must_haves
- Truth: a delivered order ≤3 days old can request a per-item return with 1–4 photos.
- Truth: approving sets a 3-day ship-by; missing it auto-expires the request on next read.
- Truth: customer can submit return courier + tracking number after approval.
- Truth: admin can approve/reject (seeing photos) and mark received.
- Truth: each transition fires its branded email; no refund logic touched.
- Artifact: `260601-afs-migration.sql` with ALTER TABLE + new email-template upserts.
