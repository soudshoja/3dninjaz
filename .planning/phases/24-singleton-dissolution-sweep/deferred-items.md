# Deferred Items — Phase 24 (singleton-dissolution-sweep)

Pre-existing issues discovered during plan execution that are OUT OF SCOPE for
the current plan (not caused by this plan's changes). Logged, not fixed, per
the executor's scope-boundary rule.

## Discovered during 24-03

- **`src/lib/__tests__/config-fields.test.ts` — "parses a valid select config
  with optional priceAdd"**: fails on `master`/pre-24-03 HEAD too (confirmed
  via `git stash` + re-run before committing 24-03 Task 2). `ensureConfigJson`
  drops `priceAdd` from a select option. Unrelated to tenant/auth work.
- **`src/actions/__tests__/configurator-fields.test.ts`,
  `configurator-tier-table.test.ts`, `configurator-update-type.test.ts`** —
  all three fail to load with `Error: This module cannot be imported from a
  Client Component module. It should only be used from a Server Component.`
  (thrown by `node_modules/server-only/index.js`). Also reproduces on
  pre-24-03 HEAD. Unrelated to tenant/auth work; looks like a `server-only`
  import reaching a client-tagged module somewhere in the configurator action
  graph.
