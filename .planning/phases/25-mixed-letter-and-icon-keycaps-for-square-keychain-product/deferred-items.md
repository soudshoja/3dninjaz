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
