# Phase 25 — Deferred / Out-of-Scope Items

Discovered during execution but NOT owned by the current plan's tasks.

## Pre-existing test failure (out of scope — Plan 25-01)

- **File:** `src/lib/__tests__/config-fields.test.ts` (line ~47)
- **Symptom:** SelectFieldConfig parse test expects an option with `priceAdd: 2`,
  but the current `SelectFieldConfigSchema` strips unknown keys (the option shape
  uses `price`, not `priceAdd`). 1 pre-existing failing assertion.
- **Why deferred:** Predates Plan 25-01 (both `config-fields.ts` and this test
  file are unmodified by 25-01). SCOPE BOUNDARY — not caused by the keycapseq work.
  The new keycapseq contract lives in the sibling `src/lib/config-fields.test.ts`
  which passes green.
- **Suggested owner:** a separate quick task to reconcile the stale `priceAdd`
  expectation with the current `price` option field.

## Pre-existing server-only test-collection failures (out of scope — Plan 25-01)

- **Files:** `src/actions/__tests__/configurator-fields.test.ts`,
  `configurator-tier-table.test.ts`, `configurator-update-type.test.ts`
- **Symptom:** each collects `(0 test)` — vitest import fails with
  "This module cannot be imported from a Client Component module. It should only
  be used from a Server Component" (`node_modules/server-only/index.js`).
- **Why deferred:** Verified identical failure at base commit `6ad4996` (before
  any Plan 25-01 work) — these import `@/actions/configurator` (a "use server"
  module whose dependency graph pulls `server-only`), which the current vitest
  environment does not shim. SCOPE BOUNDARY — pre-existing, not caused by the
  keycapseq FieldType widening.
- **Suggested owner:** a test-infra quick task to add a `server-only` mock in
  `vitest.config.mts` so server-action unit tests can collect.
