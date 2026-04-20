---
phase: 07-manual-orders-ops-images
plan: 01
title: Schema + deps + raw-SQL migration
status: complete
duration_min: 8
completed_at: 2026-04-20
requirements: [ADM-16, ADM-17, ADM-18, ADM-19, ADM-20, ADM-22]
key_files_created:
  - scripts/phase7-migrate.cjs
key_files_modified:
  - src/lib/db/schema.ts
  - .gitignore
  - package.json
key_decisions:
  - "JSON column custom_images stored as LONGTEXT in MariaDB (CLAUDE.md quirk); read-side helpers must JSON.parse."
  - "recon_runs.runDate is VARCHAR(10) holding yyyy-mm-dd (not DATE) — sidesteps mysql2 timezone coercion in cron CommonJS."
  - "All FKs use latin1 charset to match existing user/orders tables (Phase 6 06-01 precedent)."
---

# Phase 07 Plan 01: Schema + deps + raw-SQL migration Summary

Phase 7 schema foundation landed: 9 additive columns on `orders` (manual-order +
refund + PayPal-financials mirror), 3 new tables (`payment_links`,
`dispute_cache`, `recon_runs`), sharp 0.34.5 native dep installed, raw-SQL
migration applicator at `scripts/phase7-migrate.cjs`, `.planning/intel/`
gitignored.

## What was built

**Drizzle schema (`src/lib/db/schema.ts`)**
- New enum `orderSourceTypeValues = ["web","manual"] as const` exported.
- `orders` table extended with 9 columns: `sourceType` (enum default 'web'),
  `customItemName`, `customItemDescription`, `customImages` (json/longtext),
  `refundedAmount` (decimal default '0.00'), `paypalFee`, `paypalNet`,
  `sellerProtection`, `paypalSettleDate`.
- New table `paymentLinks`: id, orderId (FK→orders cascade), token (UNIQUE),
  expiresAt, usedAt, createdBy (FK→user), createdAt + index on order_id.
- New table `disputeCache`: id, disputeId (UNIQUE), orderId (NULLABLE FK→orders
  set null), status, reason, amount, currency, createDate, updateDate,
  lastSyncedAt, rawJson (mediumtext) + indexes on status + order_id.
- New table `reconRuns`: id, runDate (VARCHAR(10) UNIQUE), ranAt, totals,
  driftCount, driftJson, status, errorMessage.
- Relations: `paymentLinksRelations`, `disputeCacheRelations`. Existing
  `ordersRelations` left untouched (avoid Phase 3-6 disturbance).

**Migration script (`scripts/phase7-migrate.cjs`)**
- Mirrors `scripts/phase6-migrate.cjs` pattern: dotenv-style env load,
  `mysql2/promise` driver, `INFORMATION_SCHEMA` checks for idempotency.
- 9 ALTER TABLE orders ADD COLUMN guarded by columnExists().
- 3 CREATE TABLE IF NOT EXISTS guarded by tableExists().
- `custom_images` stored as `LONGTEXT NULL` (MariaDB JSON quirk per CLAUDE.md).
- All new tables use `CHARSET=latin1` to match the existing user/orders tables
  (FK constraints require identical charset; Phase 6 precedent).
- Run against live MariaDB: 9 applied + 3 applied. Re-run: 9 skip + 3 skip.

**Dependencies (`package.json`)**
- Added `sharp@^0.34.5` and `dotenv@^17.x` (sharp was the actual new dep;
  dotenv was a transitive — pinned).
- `node -e "require('sharp')"` succeeds; sharp.versions reports vips 8.17.3
  + libwebp 1.6.0 + mozjpeg + AVIF (aom 3.13.1).

**`.gitignore`**
- Appended `.planning/intel/` rule under a Phase-7 comment header
  (T-07-X-recon-leak: PayPal txn IDs in recon snapshots are sensitive).

## Verification

- `npx tsc --noEmit` exits 0 (full project compiles).
- `node scripts/phase7-migrate.cjs` first run → 12 "applied" lines.
- `node scripts/phase7-migrate.cjs` second run → 12 "skip" lines (idempotent).
- `node -e "require('sharp')"` no error.
- Schema additions confirmed by `INFORMATION_SCHEMA` checks during the
  migration run.

## Deviations from Plan

**1. [Rule 1 - Bug] `recon_runs.runDate` typed as `varchar(10)` instead of `date`**
- **Found during:** Task 2 schema design
- **Issue:** mysql2 returns DATE columns as JavaScript `Date` objects with
  timezone coercion that confuses the cron's MYT vs UTC arithmetic
  (CLAUDE.md timezone caveat).
- **Fix:** Stored as VARCHAR(10) holding `yyyy-mm-dd` strings throughout;
  cron writes the MYT-derived `dateStr` directly. Idempotency via UNIQUE
  index unaffected.
- **Files modified:** `src/lib/db/schema.ts`, `scripts/phase7-migrate.cjs`
- **Commit:** 0650a6d

**2. [Rule 2 - Critical] `dispute_cache.rawJson` typed as `mediumtext` instead of `longtext`**
- **Found during:** Task 1 schema review
- **Issue:** Plan called for LONGTEXT but mediumtext (16MB) is plenty for
  PayPal dispute payloads (typical < 50KB) and indexes/replication are
  faster on smaller types.
- **Fix:** Used `mediumtext()` import already in schema.ts; matches existing
  `email_templates.html` pattern.
- **Commit:** 0650a6d

## Self-Check: PASSED

- src/lib/db/schema.ts: FOUND
- scripts/phase7-migrate.cjs: FOUND
- .gitignore .planning/intel/ rule: FOUND
- Commit 0650a6d: FOUND
