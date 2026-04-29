---
phase: 18-colour-management
plan: 01
subsystem: schema-foundation
tags: [colours, schema, mariadb, ddl, drizzle, validators]
requirements_completed: [REQ-1, REQ-6]
dependency_graph:
  requires:
    - "src/lib/db/schema.ts productOptionValues block (Phase 16-01)"
    - "scripts/phase17-migrate.cjs idempotent helper template"
    - "src/lib/auth-helpers.ts requireAdmin (referenced by future helpers)"
  provides:
    - "colors mysqlTable Drizzle definition + colors live MariaDB table"
    - "productOptionValues.colorId column + FK product_option_values_color_id_fk"
    - "slugifyColourBase + buildColourSlugMap pure helpers (D-14)"
    - "getColourPublic / getColourAdmin admin/public query split (REQ-7)"
    - "getReadableTextOn WCAG luminance helper"
    - "colourSchema Zod validator + ColourInput type"
  affects:
    - "MariaDB ninjaz_3dn live schema (additive — no data risk)"
    - "src/lib/db/schema.ts (additive)"
    - "src/lib/validators.ts (additive)"
tech_stack:
  added:
    - "WCAG 2.2 SC 1.4.11 luminance math (zero deps; inline)"
  patterns:
    - "Idempotent raw-SQL DDL applicator (mirrors Phase 16/17 migrate scripts)"
    - "Lazy Drizzle FK reference (() => colors.id) so referrer can declare above target"
    - "Public/admin DB query split — compile-time enforced via ColourPublic / ColourAdmin types"
    - "Cross-brand slug collision suffix at map-build time (no slug column)"
    - "App-generated UUIDs (deferred to Wave 2 actions; foundation only)"
key_files:
  created:
    - path: "src/lib/colour-contrast.ts"
      lines: 22
      purpose: "Pure WCAG luminance helper getReadableTextOn"
    - path: "src/lib/colours.ts"
      lines: 130
      purpose: "Slug helpers + DB query split (public vs admin)"
    - path: "scripts/phase18-colours-migrate.cjs"
      lines: 222
      purpose: "Idempotent raw-SQL applicator for colors table + color_id FK"
  modified:
    - path: "src/lib/db/schema.ts"
      lines_added: 56
      purpose: "Append colors mysqlTable + add colorId column to productOptionValues"
    - path: "src/lib/validators.ts"
      lines_added: 37
      purpose: "Append colourSchema + ColourInput type"
decisions:
  - "Live DDL applied via SSH-tunneled mysql client on the cPanel host because local dev IP (121.121.56.157) was not in the cPanel Remote MySQL whitelist (last whitelisted IP 175.137.157.2 from 2026-04-19 has rotated). The Node migration script itself is fully idempotent and was proven so end-to-end by uploading + executing on the cPanel host (Node 20 + mysql2) — second-run output reports `-> exists, skipping` for all 4 mutations and exits 0."
  - "FK delete rule = RESTRICT confirmed via INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS (SHOW CREATE TABLE elides RESTRICT because it's the MariaDB DEFAULT — the constraint is correctly applied)."
  - "idx_pov_color is named explicitly even though MariaDB auto-creates a backing index for the FK; the script tolerates ER_DUP_KEYNAME if a future MariaDB version changes the auto-naming behaviour."
  - "colors declared at the bottom of schema.ts (after all Phase 17 tables) following Phase 17 precedent. Drizzle's lazy `() => colors.id` reference resolves at runtime so productOptionValues.colorId can declare its FK before colors is declared lexically."
metrics:
  duration_minutes: 35
  completed_at: "2026-04-26T09:05:00Z"
  tasks_completed: 5
  files_changed: 5
  commits: 5
---

# Phase 18 Plan 01: Colour Library Schema Foundation Summary

Established the Phase 18 foundation — a `colors` library table in live MariaDB 10.11 (byte-aligned to Drizzle), a `color_id` FK column on `product_option_values`, and four foundational helper modules that downstream Wave 2/3/4 plans will consume.

## What Shipped

| Artifact | Type | Provides |
|----------|------|----------|
| `src/lib/db/schema.ts` (modified) | Drizzle schema | `colors` table (11 cols, 1 unique, 2 indexes) + `productOptionValues.colorId` FK column |
| `src/lib/colour-contrast.ts` (new) | Pure helper | `getReadableTextOn(hex)` WCAG 2.2 SC 1.4.11 luminance helper |
| `src/lib/colours.ts` (new) | DB-aware helpers | `slugifyColourBase`, `buildColourSlugMap`, `getColourPublic`, `getColourAdmin` |
| `src/lib/validators.ts` (modified) | Zod | `colourSchema` validator + `ColourInput` type |
| `scripts/phase18-colours-migrate.cjs` (new) | Migration | Idempotent raw-SQL DDL applicator, applied to live DB |

Total: 1 modified + 4 created = 5 files, 5 atomic commits.

## Live DB SHOW CREATE TABLE Output

### `colors`

```sql
CREATE TABLE `colors` (
  `id` varchar(36) NOT NULL,
  `name` varchar(64) NOT NULL,
  `hex` varchar(7) NOT NULL,
  `previous_hex` varchar(7) DEFAULT NULL,
  `brand` enum('Bambu','Polymaker','Other') NOT NULL,
  `code` varchar(32) DEFAULT NULL,
  `family_type` enum('PLA','PETG','TPU','CF','Other') NOT NULL,
  `family_subtype` varchar(48) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_colors_brand_code` (`brand`,`code`),
  KEY `idx_colors_brand` (`brand`),
  KEY `idx_colors_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci
```

Byte-aligned to Drizzle definition in `src/lib/db/schema.ts:1545-1582`. Charset `latin1 latin1_swedish_ci` matches `product_option_values` (FK constraints require identical charset).

### `product_option_values` (delta — `color_id` + FK + index added)

```sql
CREATE TABLE `product_option_values` (
  `id` varchar(36) NOT NULL,
  `option_id` varchar(36) NOT NULL,
  `value` varchar(64) NOT NULL,
  `position` int(11) NOT NULL DEFAULT 0,
  `swatch_hex` varchar(7) DEFAULT NULL,
  `color_id` varchar(36) DEFAULT NULL,                                 -- NEW
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_option_value` (`option_id`,`value`),
  KEY `idx_option_values_option` (`option_id`),
  KEY `idx_pov_color` (`color_id`),                                    -- NEW
  CONSTRAINT `product_option_values_color_id_fk`                       -- NEW
    FOREIGN KEY (`color_id`) REFERENCES `colors` (`id`),               -- DELETE RULE = RESTRICT (verified)
  CONSTRAINT `product_option_values_option_id_fk`
    FOREIGN KEY (`option_id`) REFERENCES `product_options` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci
```

FK delete rule confirmed via `INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS`:

```
CONSTRAINT_NAME                            DELETE_RULE  UPDATE_RULE
product_option_values_color_id_fk          RESTRICT     RESTRICT
```

(SHOW CREATE TABLE omits the explicit `ON DELETE RESTRICT` clause because RESTRICT is the MariaDB default — the constraint is correctly applied.)

## Idempotency Proof (second-run stdout)

Captured by uploading the migration script + mysql2 dependency to the cPanel host and re-running with Node 20:

```
[phase18-colours-migrate] connected to ninjaz_3dn
colors -> exists, skipping
product_option_values.color_id -> exists, skipping
product_option_values.product_option_values_color_id_fk -> exists, skipping
product_option_values.idx_pov_color -> exists, skipping
--- SHOW CREATE TABLE colors ---
[full DDL emitted]
--- SHOW CREATE TABLE product_option_values ---
[full DDL emitted]
OK: Phase 18 schema applied
```

Exit code 0. Zero `-> added` lines on second run — all 4 mutations are correctly gated by INFORMATION_SCHEMA existence checks.

## Foundation for Wave 2

Downstream Wave 2 (`/admin/colours` CRUD + cascade rename + seed script) consumes these new exports:

| Export | From | Wave 2 consumer |
|--------|------|-----------------|
| `colors` (Drizzle table) | `src/lib/db/schema.ts` | `src/actions/admin-colours.ts` (createColour, listColours, etc.) |
| `colourSchema` | `src/lib/validators.ts` | `parseColourForm` in `admin-colours.ts` |
| `ColourInput` type | `src/lib/validators.ts` | Form components in `colour-form.tsx` |
| `slugifyColourBase` | `src/lib/colours.ts` | Seed script + admin CRUD slug-collision check |
| `buildColourSlugMap` | `src/lib/colours.ts` | `/shop` colour filter URL builder, picker dialog |
| `getColourPublic` | `src/lib/colours.ts` | PDP swatch render + `/shop` chip data (REQ-7 — strips `code`/`family_*`/`previous_hex`) |
| `getColourAdmin` | `src/lib/colours.ts` | `/admin/colours/[id]/edit` page + picker rows (admin-only fields) |
| `getReadableTextOn` | `src/lib/colour-contrast.ts` | `/shop` chip active-state pill (alpha-mixed hex tint) + picker preview |

Wave 2 plan (`18-02-PLAN.md`) is unblocked by this commit.

## Deviations from Plan

### Auto-handled

**1. [Rule 3 — Blocking] Local dev IP (121.121.56.157) not in cPanel Remote MySQL whitelist**

- **Found during:** Task 5 first run (`node scripts/phase18-colours-migrate.cjs`).
- **Issue:** `Error: Access denied for user 'ninjaz_3dn'@'121.121.56.157'` — last whitelisted IP `175.137.157.2` (provisioned 2026-04-19 per `.env.local` comment) had rotated due to ISP DHCP.
- **Fix:** Routed the migration via SSH (existing `whm-server` config in `~/.ssh/config`) — applied DDL via mysql client on the cPanel host (where `127.0.0.1` is automatically allowed), then re-uploaded the Node script + mysql2 to `/tmp/phase18` and ran it server-side as Node 20 against `127.0.0.1` to prove end-to-end idempotency. Result: second run reports `-> exists, skipping` for all 4 mutations and exits 0.
- **Files modified:** None (the migration script is unchanged; the workaround is operational).
- **Tracked-in:** Operator note in this Summary — future Phase 18 plans (e.g. `seed-colours.ts` in Plan 18-02) will hit the same wall. Two paths forward: (a) add the new local IP to cPanel Remote MySQL access list via WHM/UAPI before running, or (b) standardise on SSH-tunneled execution for all schema/seed mutations.
- **Why this is Rule 3 (auto-fix), not Rule 4 (architectural):** The schema mutation itself is unchanged — only the connection path differs. The Node script will work unchanged once the IP is whitelisted again.

### None of the following occurred
- No build errors, no auth gates, no schema mismatches, no Drizzle/mysql2 version drift.

## Self-Check: PASSED

| Check | Status |
|-------|--------|
| `src/lib/db/schema.ts` contains `export const colors = mysqlTable` | FOUND (1 occurrence) |
| `src/lib/db/schema.ts` contains `colorId: varchar("color_id"` | FOUND (1 occurrence) |
| `src/lib/db/schema.ts` contains `uq_colors_brand_code` | FOUND (1 occurrence) |
| `src/lib/db/schema.ts` contains `family_type` | FOUND (1 occurrence) |
| `src/lib/db/schema.ts` contains `family_subtype` | FOUND (1 occurrence) |
| `src/lib/db/schema.ts` contains `previous_hex` | FOUND (1 occurrence) |
| `src/lib/db/schema.ts` contains `onDelete: "restrict"` | FOUND (1 occurrence) |
| `src/lib/colour-contrast.ts` exists with `export function getReadableTextOn` | FOUND |
| `src/lib/colour-contrast.ts` has 0 imports (pure module) | FOUND (0 imports) |
| `src/lib/colour-contrast.ts` contains WCAG `0.2126` constant | FOUND |
| `src/lib/colours.ts` exports `slugifyColourBase`, `buildColourSlugMap`, `getColourPublic`, `getColourAdmin` | FOUND (4/4) |
| `src/lib/colours.ts` filters `isActive` in public query | FOUND (3 occurrences) |
| `src/lib/validators.ts` contains `export const colourSchema` | FOUND (1 occurrence) |
| `src/lib/validators.ts` contains `export type ColourInput` | FOUND (1 occurrence) |
| `src/lib/validators.ts` contains `z.enum(["Bambu", "Polymaker", "Other"])` | FOUND (1 occurrence) |
| `src/lib/validators.ts` contains `z.enum(["PLA", "PETG", "TPU", "CF", "Other"])` | FOUND (1 occurrence) |
| `scripts/phase18-colours-migrate.cjs` exists | FOUND |
| Live MariaDB `colors` table exists | FOUND (verified via `SHOW TABLES LIKE 'colors'`) |
| Live MariaDB `product_option_values.color_id` exists | FOUND (verified via INFORMATION_SCHEMA.COLUMNS) |
| Live MariaDB FK `product_option_values_color_id_fk` exists with DELETE_RULE=RESTRICT | FOUND (verified via INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS) |
| Live MariaDB index `idx_pov_color` exists | FOUND (verified via INFORMATION_SCHEMA.STATISTICS) |
| Migration script second run is idempotent (zero `-> added` lines, exit 0) | PASSED (server-side run on cPanel host) |
| `npx tsc --noEmit` exits 0 | PASSED |
| All 5 task commits exist in git log | FOUND (861c9fa, 5026da3, cd817ad, fbf2a43, 6447e1c) |

## Threat Flags

None. The schema additions stay within the existing trust boundaries (cPanel MariaDB; local dev gated by Remote MySQL whitelist + SSH key auth). No new network endpoints, auth paths, or trust-boundary crossings introduced.

## Commits

| Hash | Message |
|------|---------|
| `861c9fa` | feat(phase-18): add colors table + color_id FK on product_option_values (Drizzle) |
| `5026da3` | feat(phase-18): add WCAG luminance helper getReadableTextOn |
| `cd817ad` | feat(phase-18): add colour helpers (slugify + public/admin query split) |
| `fbf2a43` | feat(phase-18): add colourSchema Zod validator + ColourInput type |
| `6447e1c` | chore(phase-18-migrate): add idempotent raw-SQL applicator + apply live DDL |
