---
phase: 05
plan: 01
status: complete
subsystem: schema + validators + dependencies
tags: [schema, drizzle, mariadb, validators, deps]
dependency_graph:
  requires: []
  provides:
    - "6 new tables (coupons, coupon_redemptions, email_templates, store_settings, shipping_rates, events)"
    - "2 new columns (product_variants.in_stock, product_variants.low_stock_threshold)"
    - "11 new Zod schemas + 4 enums in validators.ts"
    - "4 new npm deps (papaparse, csv-parse, recharts, isomorphic-dompurify) + @types/papaparse"
  affects:
    - "Wave 2 plans 05-02, 05-03, 05-04 (parallel)"
    - "Wave 3 plans 05-05, 05-06, 05-07 (parallel)"
tech_stack:
  added: [recharts, papaparse, csv-parse, isomorphic-dompurify]
  patterns:
    - "MariaDB 10.11 raw-SQL migration script as drizzle-kit fallback (Phase 3/6 precedent)"
    - "Singleton row table (store_settings) with id='default' for cached lookups"
    - "Atomic counter (coupons.usage_count + usage_cap) for race-safe redemption"
    - "PDPA audit (no cascade on userId FKs in coupon_redemptions, reviews, order_requests)"
key_files:
  created:
    - scripts/phase5-migrate.cjs
  modified:
    - src/lib/db/schema.ts
    - src/lib/validators.ts
    - package.json
    - package-lock.json
decisions:
  - "Schema additions and Zod schemas were merged into Phase 6's commit d9bf71a because both executors edited schema.ts/validators.ts in parallel — append-only writes meant the merged file is correct without conflicts."
  - "Used raw SQL migration (scripts/phase5-migrate.cjs) instead of drizzle-kit push, matching Phase 3/6 precedent (drizzle-kit push hangs against cPanel MariaDB)."
  - "shipping_rates seeded with 16 MY states at 0.00 inside the migration script (admin edits in Wave 2 plan 05-04)."
  - "store_settings + email_templates seeded LAZILY by Wave 2/3 callers (seed helpers exported from schema.ts; not executed at migration time)."
  - "events table records sha256(ip+salt) — never raw IP (PDPA, T-05-02-PDPA)."
metrics:
  duration: ~25 min
  completed: 2026-04-19
---

# Phase 5 Plan 05-01: Schema + Validators + Dependencies Summary

**One-liner:** Six new tables (coupons, coupon_redemptions, email_templates, store_settings, shipping_rates, events), two new product_variants columns (in_stock, low_stock_threshold), eleven new Zod schemas, and four new npm deps land in one coordinated migration so Wave 2 + Wave 3 can run fully in parallel.

## Schema additions

### New tables

| Table | Purpose | Key columns |
|---|---|---|
| `coupons` | Marketing promo codes | code (unique), type (percentage\|fixed), amount decimal, min_spend, starts_at/ends_at, usage_cap, usage_count, active |
| `coupon_redemptions` | Per-redemption audit trail | coupon_id FK CASCADE, order_id FK CASCADE, user_id FK NO CASCADE (PDPA), amount_applied, redeemed_at |
| `email_templates` | Editable transactional emails | `key` PK (order_confirmation\|password_reset), subject, html MEDIUMTEXT, variables JSON, updated_at |
| `store_settings` | Singleton row for site-wide config | id='default' PK, businessName, contactEmail, whatsappNumber, instagramUrl, tiktokUrl, bannerText/Enabled, freeShipThreshold, sstEnabled, sstRate |
| `shipping_rates` | Per-state flat rate lookup | state UNIQUE varchar(64), flat_rate decimal(10,2) |
| `events` | Client-side analytics | event ENUM, session_id, ip_hash sha256, path, created_at + composite index |

### New columns on `product_variants`

| Column | Type | Default | Purpose |
|---|---|---|---|
| `in_stock` | BOOLEAN NOT NULL | TRUE | Per-variant inventory toggle (INV-01) |
| `low_stock_threshold` | INT NULL | NULL | Optional admin alert threshold (INV-02) |

### Seed helpers exported (not executed)

- `seedStoreSettings()` — returns the single-row insert payload mirroring current `business-info.ts`
- `seedShippingRates()` — returns 16 MY state rows at "0.00"
- `seedEmailTemplates()` — returns 2 stub rows (Wave 3 plan 05-06 replaces with real templates)

## Validator additions (`src/lib/validators.ts`)

| Schema | Purpose |
|---|---|
| `couponSchema` | Admin coupon create/edit (Zod superRefine: percent ≤ 100, endsAt > startsAt) |
| `couponRedemptionInputSchema` | Customer-side coupon code at checkout |
| `couponTypeEnum` | percentage \| fixed |
| `reviewModerationSchema` + `reviewStatusEnum` | Admin moderation queue (`reviewSubmitSchema` already added by Phase 6) |
| `storeSettingsSchema` | `/admin/settings` form |
| `shippingRateSchema` | `/admin/shipping` per-state rate form |
| `emailTemplateSchema` + `emailTemplateKeyEnum` | `/admin/email-templates/[key]/edit` form (HTML capped 100KB, T-05-01-HTML) |
| `variantInventorySchema` | Per-variant in_stock + threshold toggle |
| `userSuspendSchema` | Admin user suspend/unsuspend payload |
| `bulkImportRowSchema` | One CSV row at a time during preview pass (ADM-14) |

Phase 6's `reviewSubmitSchema` is reused — both phases agreed on the shape via the 06-CONTEXT and validators.ts header note.

## Dependencies installed

```
papaparse           ^5.x   (client CSV preview, safe MIT)
csv-parse           ^5.x   (server streaming CSV parse)
recharts            ^2.x   (analytics charts via shadcn Charts)
isomorphic-dompurify ^2.x  (email template HTML sanitisation)
@types/papaparse    ^5.x   (devDep)
```

## Migration applied

Used `scripts/phase5-migrate.cjs` (raw SQL, idempotent, INFORMATION_SCHEMA guard on column ALTERs) — drizzle-kit push hangs against the cPanel MariaDB host (Phase 3/6 precedent).

```
Connected to ninjaz_3dn
product_variants.in_stock  -> added
product_variants.low_stock_threshold  -> added
coupons          -> ensured
coupon_redemptions -> ensured
email_templates  -> ensured
store_settings   -> ensured
shipping_rates   -> ensured
shipping_rates   -> seeded 16 rows
events           -> ensured
OK: all Phase 5 tables + variant columns present
```

Live verification (`SHOW TABLES`): `account, addresses, categories, coupon_redemptions, coupons, email_templates, events, order_items, order_requests, orders, product_variants, products, reviews, session, shipping_rates, store_settings, user, verification, wishlists` — all 19 tables present.

## Threat mitigations engaged

| Threat ID | Mitigation |
|---|---|
| T-05-01-schema-drift | Idempotent migration script + INFORMATION_SCHEMA column guard |
| T-05-01-PDPA | `coupon_redemptions.user_id` and `reviews.user_id` use NO cascade — audit survives user deletion |
| T-05-01-tampering | `couponSchema.superRefine` rejects percent > 100 and endsAt ≤ startsAt |
| T-05-01-HTML | `emailTemplateSchema.html` capped at 100KB; Wave 3 layers DOMPurify on top |
| T-05-01-state | `coupons.usage_count` + `usage_cap` are int → Wave 2 plan 05-03 uses atomic `UPDATE WHERE usage_count < usage_cap` |
| T-05-01-dep-supply-chain | All four new deps are npm-popular libraries with active maintainers; lockfile committed |

## Coordination with Phase 6

Phase 6 executor was running in parallel and edited `schema.ts` + `validators.ts` + `auth-helpers.ts` simultaneously. Both executors followed APPEND-ONLY writes (per phase prompt rule), so when Phase 6 committed `d9bf71a` (`feat(06-01): add Phase 6 schema...`) the file already contained both Phase 5 + Phase 6 additions. **Result: Phase 5 schema/validator/dep changes are persisted in commit d9bf71a; only the migration script `scripts/phase5-migrate.cjs` was committed separately as `81a5c81`.**

This is a clean coordination outcome — no merge conflict, no rollback, no lost work. The Phase 6 commit message explicitly attributes the Phase 6 work; this SUMMARY records the Phase 5 share.

## Self-Check: PASSED

- ✅ scripts/phase5-migrate.cjs exists (commit 81a5c81)
- ✅ src/lib/db/schema.ts contains coupons, coupon_redemptions, email_templates, store_settings, shipping_rates, events (commit d9bf71a)
- ✅ src/lib/db/schema.ts contains productVariants.inStock + lowStockThreshold (commit d9bf71a)
- ✅ src/lib/validators.ts contains couponSchema, storeSettingsSchema, shippingRateSchema, emailTemplateSchema, etc. (commit d9bf71a)
- ✅ Live MariaDB has all 6 new tables + 16 seeded shipping rates
- ✅ tsc --noEmit clean
