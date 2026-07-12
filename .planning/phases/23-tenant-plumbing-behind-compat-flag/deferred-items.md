# Deferred Items — Phase 23

Out-of-scope discoveries logged during plan execution, per the Scope Boundary
rule (fix only issues directly caused by the current task's changes).

## 23-04: Pre-existing failing tests (unrelated to tenant plumbing)

Found while running the full `npx vitest run` suite after completing 23-04
Tasks 1-2 (`src/lib/tenant/registry.ts` + `src/lib/tenant/context.ts`, both
green). These 4 failures are **pre-existing** — confirmed by running each
failing file in isolation (same failures) and by `git log` showing the
files were last touched in unrelated Phase 19 (configurator) work, long
before Phase 23 existed. Not caused by, and not fixed by, this plan.

- `src/actions/__tests__/configurator-fields.test.ts` — whole suite fails
  to load: `Error: This module cannot be imported from a Client Component
  module. It should only be used from a Server Component.` at
  `node_modules/server-only/index.js:1:7`. The test file (or a module it
  imports) pulls in a `"server-only"`-guarded module without mocking
  `server-only`, the same class of issue documented in
  `src/lib/tenant/pool-manager.test.ts`'s header comment — but for a
  configurator module, not tenant plumbing.
- `src/actions/__tests__/configurator-tier-table.test.ts` — same
  `server-only` import error, whole suite fails to load.
- `src/actions/__tests__/configurator-update-type.test.ts` — same
  `server-only` import error, whole suite fails to load.
- `src/lib/__tests__/config-fields.test.ts` — 1 assertion failure:
  `ensureConfigJson > parses a valid select config with optional
  priceAdd` expects a `priceAdd: 2` field on the "Blue" option that the
  current `ensureConfigJson` output omits. Likely related to the
  "Variant Select fields: price/SKU/imageUrl per option" work noted in
  project memory (`configJson` per-option overrides) — looks like a
  schema/behavior drift in `ensureConfigJson`, not something touched by
  Phase 23.

**Action:** none taken (out of scope for 23-04). Recommend a follow-up
`/gsd-debug` pass on the configurator test suite outside the milestone
v2.0 tenant-plumbing track.
