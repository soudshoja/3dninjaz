---
id: 260815-rsk
mode: quick-full
description: Daily WhatsApp digest of stale checkout drafts
date: 2026-08-15
branch: feat/draft-stale-digest
base: origin/dev
must_haves:
  truths:
    - A draft is reported at most once, ever — enforced by notified_at, not by luck of timing.
    - Nothing is stamped unless the WhatsApp send actually succeeded.
    - Zero eligible drafts sends no message at all (no "0 drafts" spam) and exits 0.
    - Eligibility is exact 24h from created_at, NOT "yesterday's calendar date".
    - Digest lines are grouped by MYT date, matching what /admin/drafts shows the admin.
    - The cron never bootstraps Next.js and never throws unhandled.
    - Dev only — prod DB and master branch untouched.
  artifacts:
    - src/lib/db/schema.ts — notifiedAt column on checkoutDrafts
    - scripts/migrations/260815-rsk-drafts-notified-at.cjs — idempotent DDL
    - scripts/cron/draft-stale-digest.cjs — the cron
  key_links:
    - scripts/cron/reconcile-paypal.cjs (structure + env-loading pattern to copy)
    - src/lib/whatsapp/client.ts (Evolution endpoint shape + apikey header)
    - src/lib/whatsapp/types.ts (WHATSAPP_INSTANCE_NAME = "3dninjaz")
---

# Quick Task 260815-rsk — Daily stale-draft WhatsApp digest

## Goal

At 09:00 MYT daily, WhatsApp the admin one message listing every checkout draft that
is still `open` and is more than 24h old, then never report those rows again.

## Locked decisions (from user)

| Decision | Value |
|---|---|
| Channel | WhatsApp via Evolution API |
| Recipient | `601125434730` (store number = self-message) |
| Cadence | Once daily, 09:00 MYT |
| Clock basis | `created_at`, exact 24h |
| Grouping | by MYT creation date |

## Environment facts (verified, not assumed)

- Box TZ is **GMT**; MySQL `@@global.time_zone` / `@@session.time_zone` = `SYSTEM` → also GMT.
  `date` on the box returned `Sat Aug 15 12:00:06 PM GMT 2026`. Therefore 09:00 MYT = **01:00 UTC**
  → crontab `0 1 * * *`.
- `created_at` is stored UTC. `/admin/drafts` renders it with `toLocaleString("en-MY")`, so the
  admin reads MYT. Grouping must use `DATE(created_at + INTERVAL 8 HOUR)` or labels drift a day.
- Evolution instance name is `3dninjaz` (`src/lib/whatsapp/types.ts:8`).
- Existing cron precedent is `scripts/cron/reconcile-paypal.cjs`: plain CJS, `mysql.createConnection(process.env.DATABASE_URL)`, inline `.env.local` parser, `process.exit()` at the end.
- `checkout_drafts` status enum is exactly `open|converted|dismissed`. **Not adding a 4th value** —
  a notified draft is still open; the fact is a timestamp, not a state.

## Tasks

### T1 — `notified_at` column

- **files**: `src/lib/db/schema.ts`, `scripts/migrations/260815-rsk-drafts-notified-at.cjs`
- **action**: Add `notifiedAt: timestamp("notified_at")` (nullable, no default) to the
  `checkoutDrafts` table definition, documented as "digest bookkeeping — set once the stale-draft
  WhatsApp digest has reported this row; NULL = never reported". Write an idempotent CJS migration
  that checks `information_schema.COLUMNS` first and only then runs
  `ALTER TABLE checkout_drafts ADD COLUMN notified_at TIMESTAMP NULL DEFAULT NULL`, then prints
  `SHOW CREATE TABLE checkout_drafts`. No `drizzle-kit push` (MariaDB 10.11 + remote latency).
- **verify**: Run against dev DB twice — second run is a no-op, exit 0. `SHOW CREATE TABLE` shows
  the column as `NULL DEFAULT NULL`. `npx tsc --noEmit` exits 0.
- **done**: Column exists on `ninjaz_3dn`; prod `ninjaz_3dnp` deliberately untouched.

### T2 — the cron script

- **files**: `scripts/cron/draft-stale-digest.cjs`
- **action**: Plain Node CJS, no Next bootstrap. Steps:
  1. Load `.env.local` with the same inline parser as `reconcile-paypal.cjs`.
  2. `SELECT id, recipient_name, phone, subtotal, items_json, created_at,
     TIMESTAMPDIFF(HOUR, created_at, UTC_TIMESTAMP()) AS age_hours,
     DATE(created_at + INTERVAL 8 HOUR) AS myt_date
     FROM checkout_drafts
     WHERE status='open' AND notified_at IS NULL AND created_at <= UTC_TIMESTAMP() - INTERVAL 24 HOUR
     ORDER BY created_at ASC` — cap at 50 rows and note the remainder in the message footer rather
     than silently truncating.
  3. If zero rows → log `[draft-digest] 0 stale drafts` and `process.exit(0)` **without sending**.
  4. Gate on the instance being live: `GET ${EVOLUTION_API_URL}/instance/connectionState/3dninjaz`;
     if state !== "open", log and exit 0 **without stamping** (so the drafts are retried tomorrow).
  5. Build the message: header with count, then one block per MYT date, each line
     `• {name} — {phone} — {n} item(s): {names} — RM{subtotal} ({age}h old)`. `items_json` is
     LONGTEXT on MariaDB → `JSON.parse` inside try/catch, fall back to "bag unavailable".
  6. `POST ${EVOLUTION_API_URL}/message/sendText/3dninjaz` with header `apikey: EVOLUTION_API_KEY`,
     body `{ number, text }`. Only on HTTP 2xx:
     `UPDATE checkout_drafts SET notified_at = UTC_TIMESTAMP() WHERE id IN (...)` over exactly the
     reported ids (parameterised placeholders, not string-built).
  7. `--dry-run` prints the composed message and the ids it *would* stamp, sends nothing, stamps
     nothing.
  8. Wrap `main()` in `.catch()` → log + `process.exit(1)`. Close the connection in `finally`.
- **verify**: `node scripts/cron/draft-stale-digest.cjs --dry-run` against dev prints a plausible
  message and stamps nothing (`SELECT COUNT(*) FROM checkout_drafts WHERE notified_at IS NOT NULL`
  stays 0). A real run then sends one message and stamps exactly those ids; an immediate second run
  reports 0 and sends nothing.
- **done**: Script is idempotent, silent on empty, and safe to re-run.

### T3 — register on the dev box

- **files**: none in-repo (server config)
- **action**: Apply T1's migration to dev DB `ninjaz_3dn`. Add to the `ninjaz` user crontab:
  `0 1 * * * cd /home/ninjaz/apps/3dninjaz_v1 && /home/ninjaz/nodevenv/apps/3dninjaz/20/bin/node scripts/cron/draft-stale-digest.cjs >> /home/ninjaz/apps/3dninjaz_v1/draft-digest.log 2>&1`
  (resolve the real node binary path before writing the line). Preserve every existing crontab
  entry — read, append, write back; never overwrite blind.
- **verify**: `crontab -u ninjaz -l` shows the new line **and** all four pre-existing lines
  (`@reboot` prod-start, watchdog `*/2`, evolution `@reboot`, evolution `*/2`).
- **done**: Cron registered on dev only. Prod deferred until the user has seen it work.

## Out of scope

- Prod DB migration + prod cron — deferred to promotion, on the user's word.
- Notification Center integration (`/admin/notifications` per-event toggle + editable template).
  All 9 existing event keys are customer-facing per-order; an admin digest has a different variable
  set and would need registry changes. Flag as a follow-up, do not build now.
- Nudging the *customer* (abandoned-cart recovery). User asked for "send me a message" — admin only.
- Fixing the pre-existing 200-row cap on `/admin/drafts`, and the shared-browser `draft_key`
  overwrite/resurrect quirk. Both noted, neither in this task.
