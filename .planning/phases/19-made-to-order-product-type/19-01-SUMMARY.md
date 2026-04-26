---
phase: 19
plan: "01"
subsystem: database
tags: [schema, migration, mariadb, drizzle, made-to-order]
dependency_graph:
  requires: []
  provides: [products.productType, product_config_fields, products.priceTiers, order_items.configuration_data]
  affects: [src/lib/db/schema.ts, scripts/]
tech_stack:
  added: []
  patterns: [idempotent-raw-sql-migration, information-schema-gates, drizzle-mirror]
key_files:
  created:
    - scripts/phase19-migrate.cjs
    - scripts/migrate-add-product-type.ts
    - scripts/migrate-add-config-fields-table.ts
    - scripts/migrate-add-tier-pricing-cols.ts
    - scripts/migrate-add-order-line-config.ts
  modified:
    - src/lib/db/schema.ts
decisions:
  - "productType ENUM column added AFTER material_type — all existing rows default to 'stocked' via MariaDB DEFAULT, no UPDATE needed"
  - "product_config_fields uses CHAR(36) (not VARCHAR(36)) for id/productId to match D-02 spec exactly"
  - "priceTiers stored as LONGTEXT (text in Drizzle) not JSON column — mysql2 returns JSON as LONGTEXT anyway; consumers use ensureTiers()"
  - "Charset latin1 on product_config_fields matches products table — required for FK constraint (Phase 18 precedent)"
metrics:
  duration: "~15 min"
  completed: "2026-04-26"
  tasks_completed: 3
  files_changed: 6
---

# Phase 19 Plan 01: Schema Foundation Summary

**One-liner:** Raw-SQL idempotent applicator adds productType discriminator, product_config_fields table, tier-pricing columns, and order config snapshot column — Drizzle schema mirrors SHOW CREATE TABLE.

## Tasks Completed

| # | Task | Commit | Key Output |
|---|------|--------|-----------|
| 1 | Raw-SQL applicator scripts/phase19-migrate.cjs | 15fbcad | 4 INFORMATION_SCHEMA-gated mutations |
| 2 | TS wrapper scripts (4 files) | 15fbcad | migrate-add-*.ts thin wrappers |
| 3 | Drizzle schema sync | 15fbcad | productType + productConfigFields + configurationData |

## Acceptance Criteria

- [x] scripts/phase19-migrate.cjs ≥150 LOC (237 LOC)
- [x] INFORMATION_SCHEMA gates ≥4 in cjs (4 lines)
- [x] ENUM('stocked','configurable') present in cjs
- [x] fk_pcf_product constraint defined in cjs
- [x] configuration_data referenced in cjs
- [x] All 4 TS wrapper files exist at locked paths
- [x] INFORMATION_SCHEMA gate in each TS wrapper (all 4)
- [x] ENUM in migrate-add-product-type.ts
- [x] CREATE TABLE product_config_fields in migrate-add-config-fields-table.ts (comment line)
- [x] configuration_data in migrate-add-order-line-config.ts
- [x] Each TS wrapper ≤60 LOC (38, 54, 57, 35 LOC respectively)
- [x] `grep -n "productType: mysqlEnum"` returns 1
- [x] `grep -n "productConfigFields = mysqlTable"` returns 1
- [x] `grep -n "configurationData: text"` returns 1
- [x] maxUnitCount, priceTiers, unitField all present in schema
- [x] Zero changes to productOptions/productOptionValues/productVariants
- [x] `npx tsc --noEmit` passes

## Deviations from Plan

None — plan executed exactly as written.

Note: The ENUM acceptance criterion for the cjs file counts 3 occurrences (1 in comment header + 1 in SQL string + the function which is called multiple times) — the core SQL mutation contains the ENUM exactly once as required.

## Self-Check: PASSED

- [x] scripts/phase19-migrate.cjs exists
- [x] scripts/migrate-add-product-type.ts exists
- [x] scripts/migrate-add-config-fields-table.ts exists
- [x] scripts/migrate-add-tier-pricing-cols.ts exists
- [x] scripts/migrate-add-order-line-config.ts exists
- [x] src/lib/db/schema.ts modified (additive only)
- [x] commit 15fbcad exists
