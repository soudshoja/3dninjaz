---
phase: 25-mixed-letter-and-icon-keycaps-for-square-keychain-product
plan: 01
subsystem: database
tags: [drizzle, mariadb, mysql2, zod, config-fields, keychain, migration, vitest]

# Dependency graph
requires:
  - phase: 19-made-to-order-product-type
    provides: "productConfigFields table, FieldType enum + schemaByFieldType dispatch, ConfigurationData shape, ensure* fail-soft parse helpers, lookupTierPrice"
  - phase: 24-keychain-shape-split
    provides: "order_items base_done / clicker_letter_done part-tick columns (icon_done mirrors them); scripts/migrate-add-keychain-shape.ts idempotent migration scaffold"
provides:
  - "Dev DB product_config_fields.fieldType ENUM widened to include 'keycapseq'"
  - "Dev DB order_items.icon_done TINYINT(1) NOT NULL DEFAULT 0 column"
  - "Idempotent scripts/phase25-fieldtype-migrate.ts (dev-first, SHOW CREATE TABLE verify)"
  - "config-fields.ts keycapseq contract: KeycapSlot union, KeycapSeqConfig type, KeycapSeqConfigSchema, ensureKeycapSequence (fail-soft decoder), lookupTierPriceBySlotCount, buildKeycapSequenceSummary"
  - "validators.ts fields[].fieldType enum accepts 'keycapseq'"
  - "Drizzle schema.ts byte-aligned to the applied dev DDL"
affects:
  - "25-02 icon catalog + extraction"
  - "25-03 keychain-fields seeding (keycapseq at position 0 for square)"
  - "25-07 storefront mixed-slot render + admin config UI"
  - "25-08 order capture re-derive (paypal/pos/whatsapp)"
  - "25-production-batching (icon batch group, icon_done tick)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "keycapseq fieldType threaded through the textarea-precedent six-point path (config-fields type+schema+dispatch, DB enum, validators)"
    - "JSON-array-in-string sequence encoding decoded by a fail-soft ensure* helper (T-25-01-01)"
    - "slot-count price keying (lookupTierPriceBySlotCount) separate from length-keyed lookupTierPrice"
    - "shared summary builder takes an injected icon-label map to avoid a catalog import in the shared lib"

key-files:
  created:
    - "scripts/phase25-fieldtype-migrate.ts"
  modified:
    - "src/lib/db/schema.ts"
    - "src/lib/config-fields.ts"
    - "src/lib/config-fields.test.ts"
    - "src/lib/validators.ts"
    - "src/actions/configurator.ts"
    - "src/components/admin/inline-fields-editor.tsx"

key-decisions:
  - "keycapseq appended at the END of the fieldType ENUM list — metadata-only ALTER in MariaDB 10.11, no table rebuild"
  - "Sequence encoded as a JSON array of {t:'L',ch} | {t:'I',id} slots in the single values[fieldId] string (D-06); decoded by fail-soft ensureKeycapSequence"
  - "lookupTierPrice left untouched (still length-keyed for text fields); a sibling lookupTierPriceBySlotCount keys off slot count for keycapseq (D-02/D-12)"
  - "buildKeycapSequenceSummary takes an injected iconLabelById map so config-fields.ts does NOT import the icon catalog module"
  - "Migration applied to dev (ninjaz_3dn) ONLY via 3307 SSH tunnel; prod (ninjaz_3dnp) deferred to a separate gated deploy"

patterns-established:
  - "Fail-soft sequence decoder: ensureKeycapSequence never throws, drops malformed slots, returns [] on parse failure — the single gate all downstream capture/render/production paths reuse"
  - "Widening a shared union (FieldType) requires making all exhaustive Record<FieldType,...>/switch consumers whole in the same change to keep tsc green"

requirements-completed: [D-05, D-06, D-12]

# Metrics
duration: 25min
completed: 2026-07-19
---

# Phase 25 Plan 01: keycapseq Foundation Summary

**Migrated the dev DB (widened fieldType ENUM to `keycapseq` + added `order_items.icon_done`) and shipped the shared `keycapseq` field-config contract — type, Zod schema, JSON-array slot encoding, fail-soft decoder, slot-count price lookup, and mixed-summary builder — that every downstream Phase 25 plan consumes.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-18T17:15Z (approx.)
- **Completed:** 2026-07-18T17:38Z
- **Tasks:** 2 (1 auto + 1 TDD)
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments

- Applied an idempotent two-step raw-SQL migration to the **dev** DB `ninjaz_3dn` (via the 3307 SSH tunnel): widened `product_config_fields.fieldType` to include `keycapseq` and added `order_items.icon_done`. Verified via `SHOW CREATE TABLE`; a second run no-ops both steps. **Prod (`ninjaz_3dnp`) untouched.**
- Byte-aligned the Drizzle schema to the live DDL (`fieldType` mysqlEnum + new `iconDone` boolean column).
- Shipped the full `keycapseq` contract in `config-fields.ts` behind a RED→GREEN TDD cycle (20 tests): `KeycapSlot`, `KeycapSeqConfig`, `KeycapSeqConfigSchema`, `ensureKeycapSequence`, `lookupTierPriceBySlotCount`, `buildKeycapSequenceSummary` — with the original length-keyed `lookupTierPrice` left intact.
- `validators.ts` now accepts the `keycapseq` fieldType; downstream exhaustive consumers (`configurator.ts`, `inline-fields-editor.tsx`) made whole to keep `tsc --noEmit` green.

## Task Commits

1. **Task 1: Widen fieldType ENUM + add icon_done, migrate dev DB, align Drizzle schema** — `ba11ba0` (feat)
2. **Task 2 (RED): failing tests for keycapseq config contract** — `5227336` (test)
3. **Task 2 (GREEN): implement keycapseq config contract** — `fb8ebe7` (feat)

_No REFACTOR commit — the GREEN implementation needed no cleanup._

## Migration Evidence (dev `ninjaz_3dn`)

First run (applied both steps):
```
[phase25-migrate] step 1 fieldType ENUM widened to include keycapseq
[phase25-migrate] product_config_fields.fieldType => `fieldType` enum('text','number','colour','select','textarea','keycapseq') NOT NULL,
[phase25-migrate] step 2 order_items.icon_done column added
[phase25-migrate] order_items.icon_done => `icon_done` tinyint(1) NOT NULL DEFAULT 0,
```

Second run (idempotency proven — both steps no-op):
```
[phase25-migrate] step 1 fieldType ENUM already includes keycapseq — no-op: enum('text','number','colour','select','textarea','keycapseq')
[phase25-migrate] product_config_fields.fieldType => `fieldType` enum('text','number','colour','select','textarea','keycapseq') NOT NULL,
[phase25-migrate] step 2 order_items.icon_done already exists — no-op
[phase25-migrate] order_items.icon_done => `icon_done` tinyint(1) NOT NULL DEFAULT 0,
```

## Files Created/Modified

- `scripts/phase25-fieldtype-migrate.ts` — NEW idempotent migration (INFORMATION_SCHEMA guards for both DDL steps + SHOW CREATE TABLE verification logging)
- `src/lib/db/schema.ts` — fieldType mysqlEnum widened; new `iconDone` boolean column on orderItems
- `src/lib/config-fields.ts` — keycapseq type/schema/dispatch, `ensureKeycapSequence`, `lookupTierPriceBySlotCount`, `buildKeycapSequenceSummary`
- `src/lib/config-fields.test.ts` — 10 new tests covering the keycapseq contract + a `lookupTierPrice` regression guard
- `src/lib/validators.ts` — `fields[].fieldType` enum += `keycapseq`
- `src/actions/configurator.ts` — `pickSchemaByFieldType` keycapseq case (Rule 3)
- `src/components/admin/inline-fields-editor.tsx` — exhaustive `TYPE_ICONS` + `defaultConfigFor` entries (Rule 3)

## Decisions Made

- **ENUM append, not reorder** — `keycapseq` at the end of the ENUM list keeps the ALTER metadata-only on MariaDB 10.11 (no rebuild/lock on the live table).
- **JSON-array-in-string encoding** — round-trips losslessly, avoids delimiter-collision, matches the project's universal "JSON-in-LONGTEXT parsed via an ensure* helper" convention.
- **Separate slot-count price helper** — `lookupTierPrice` stays length-keyed for text fields; `lookupTierPriceBySlotCount` keys off the decoded slot count for keycapseq (D-02/D-12). No behavioural change to existing field types.
- **Injected icon-label map** — `buildKeycapSequenceSummary` takes `iconLabelById` so the shared lib carries no dependency on the (future) icon catalog module; client PDP and server capture both pass a map derived from the catalog.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Non-exhaustive FieldType consumers broke tsc after widening the union**
- **Found during:** Task 2 (GREEN, after adding `keycapseq` to the `FieldType` union)
- **Issue:** `npx tsc --noEmit` failed with 4 errors: `pickSchemaByFieldType`'s switch (`configurator.ts`) now fell through to `undefined` (2 sites), and `inline-fields-editor.tsx`'s `Record<FieldType, …> TYPE_ICONS` map + `defaultConfigFor` switch were non-exhaustive. All are direct consequences of widening the shared `FieldType` union.
- **Fix:** Added the `keycapseq` case to `pickSchemaByFieldType` (returns the now-existing `KeycapSeqConfigSchema`); added exhaustiveness entries to `TYPE_ICONS` (neutral placeholder icon) and `defaultConfigFor` (sensible defaults). keycapseq is a locked/seeded field, so it is intentionally NOT offered by the generic add-field dropdown — these entries exist only for type exhaustiveness; the real admin UI + seeding land in Plans 25-03/25-07.
- **Files modified:** `src/actions/configurator.ts`, `src/components/admin/inline-fields-editor.tsx`
- **Verification:** `npx tsc --noEmit` exits 0; all 20 config-fields tests pass.
- **Committed in:** `fb8ebe7` (Task 2 GREEN commit)

**2. [Rule 3 - Blocking] Docstring literal tripped the "no icon-catalog import" acceptance grep**
- **Found during:** Task 2 acceptance verification
- **Issue:** The acceptance criterion greps `keycap-icons` and expects zero matches; my explanatory docstrings referenced the filename `keycap-icons.ts` literally (comment text only — there was never an actual import).
- **Fix:** Reworded the three comment mentions to "the keycap icon catalog"/"the icon catalog module". No code change.
- **Files modified:** `src/lib/config-fields.ts`
- **Verification:** `grep keycap-icons src/lib/config-fields.ts` returns nothing; the module has no icon-catalog import.
- **Committed in:** `fb8ebe7` (Task 2 GREEN commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking).
**Impact on plan:** Both were required to satisfy the plan's own `npx tsc --noEmit` verification gate and acceptance greps; the code additions to the two extra files are minimal exhaustiveness stubs, not new features. No scope creep — the real keycapseq admin/seed behaviour remains owned by later plans.

## Issues Encountered

- **Pre-existing test failures (NOT introduced by this plan)** — logged to `deferred-items.md`:
  1. `src/lib/__tests__/config-fields.test.ts` has 1 failing assertion about a stale `priceAdd` option key (unrelated to keycapseq; both `config-fields.ts` and that test file were unmodified before this plan touched them).
  2. Three `src/actions/__tests__/configurator-*.test.ts` files collect `(0 test)` due to a `server-only` import boundary error under vitest. Verified identical at base commit `6ad4996` (before any Plan 25-01 work). Not caused by the FieldType widening.
- The intended `src/lib/config-fields.test.ts` suite (the keycapseq contract) is fully green (20/20).

## Known Stubs

- `inline-fields-editor.tsx` `TYPE_ICONS.keycapseq` reuses the `Type` icon and `defaultConfigFor`'s `keycapseq` case returns generic defaults. These are exhaustiveness stubs only — keycapseq is a locked, seeded field not created via the inline dropdown. The real seeding (`keychain-fields.ts`, Plan 25-03) and admin config UI (Plan 25-07) supersede them. Documented, intentional, and resolved downstream.

## Next Phase Readiness

- The type contract + migrated dev ENUM/column are in place — downstream Phase 25 plans (icon catalog/extraction, square-keychain seeding, storefront render, capture re-derive, icon production batching) can now compile and run against the dev DB.
- **Blocker for prod promotion (later, out of scope here):** `scripts/phase25-fieldtype-migrate.ts` must be run against prod `ninjaz_3dnp` before any keycapseq-writing code deploys to prod (Pitfall 4). The script is idempotent and prod-safe.

---
*Phase: 25-mixed-letter-and-icon-keycaps-for-square-keychain-product*
*Completed: 2026-07-19*

## Self-Check: PASSED

All created/modified files exist on disk; all three task commits (ba11ba0, 5227336, fb8ebe7) present in git history.
