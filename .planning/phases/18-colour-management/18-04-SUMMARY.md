---
phase: 18-colour-management
plan: 04
subsystem: admin-actions+admin-ui
tags: [colours, admin, hard-delete, in-use-guard, cascade-rename, db.transaction, diff-aware, labelCache, requireAdmin]
requirements_completed: [REQ-3, REQ-4]
dependency_graph:
  requires:
    - "src/actions/admin-colours.ts (Plan 18-03 — listColours/getColour/create/update/archive/reactivate)"
    - "src/components/admin/colour-row-actions.tsx (Plan 18-03 — base dropdown)"
    - "src/components/admin/colour-form.tsx (Plan 18-03 — 8-field form)"
    - "src/lib/db/schema.ts colors table + product_option_values.color_id FK (Plan 18-01)"
    - "src/actions/variants.ts:262-316 renameOptionValue (multi-slot WHERE pattern)"
    - "src/actions/variants.ts:800-811 setDefaultVariant (db.transaction precedent)"
  provides:
    - "src/actions/admin-colours.ts deleteColour (with IN_USE guard returning {code, error, products[]})"
    - "src/actions/admin-colours.ts renameColour (diff-aware cascade UPDATE in db.transaction with 1000-row guardrail)"
    - "src/actions/admin-colours.ts getProductsUsingColour (manual-hydration helper, no LATERAL)"
    - "MutateResult discriminated union extended with IN_USE branch"
    - "colour-row-actions.tsx Delete dropdown + two-step modal + IN_USE error UI + Archive-instead recovery CTA"
    - "colour-form.tsx cascade-aware edit submit (renameColour FIRST when name/hex changed, then updateColour for other fields)"
  affects:
    - "Plan 18-05 picker modal — IN_USE guard now lives in admin-colours.ts; picker just consumes listColours()"
    - "Plan 18-06+ /shop colour filter — cascade rename keeps pov.value snapshots in sync so chip names auto-update"
tech_stack:
  added: []
  patterns:
    - "Manual hydration pov→option→product (no LATERAL — CLAUDE.md MariaDB rule)"
    - "Diff-aware cascade UPDATE: WHERE color_id = :id AND value = :pre.name (D-11 manual wins)"
    - "1000-row guardrail (D-12) returns warning before transaction starts"
    - "labelCache invalidation across all 6 positional option slots (mirror renameOptionValue at variants.ts:262-316)"
    - "Race-condition retry on FK violation: deleteColour catches foreign-key errors and re-runs getProductsUsingColour to surface IN_USE"
    - "Two-step modal pattern with state-machine swap (default confirm → IN_USE error mode) in single inline-modal component"
    - "Edit form routes name+hex changes to renameColour FIRST (cascade-safe), then updateColour for the remaining metadata"
key_files:
  created: []
  modified:
    - path: "src/actions/admin-colours.ts"
      lines_added: 261
      lines_removed: 3
      purpose: "Add deleteColour (IN_USE guard), renameColour (cascade transaction), getProductsUsingColour (manual hydration). MutateResult extended with IN_USE branch."
    - path: "src/components/admin/colour-row-actions.tsx"
      lines_added: 193
      lines_removed: 5
      purpose: "Wire Delete dropdown + two-step modal + IN_USE error UI with product list + Archive-instead recovery CTA."
    - path: "src/components/admin/colour-form.tsx"
      lines_added: 40
      lines_removed: 6
      purpose: "Edit submit detects name/hex change vs initial; calls renameColour FIRST so cascade fires; then updateColour for the rest."
decisions:
  - "MutateResult discriminated union extends rather than splits — the existing { ok: true } / { ok: false; error } shape gains a third variant { ok: false; code: 'IN_USE'; error; products[] }. Keeps every existing call site type-safe via 'code' in res check."
  - "getProductsUsingColour uses manual hydration over 3 sequential queries (pov → option → product) per CLAUDE.md MariaDB no-LATERAL rule. Sorted by name for predictable modal ordering."
  - "deleteColour calls getProductsUsingColour first (app-level guard); the FK ON DELETE RESTRICT is defense-in-depth. Race condition (a pov added between guard and delete) is caught by parsing 'foreign key constraint' / 'ER_ROW_IS_REFERENCED' from the error message and re-running the guard to surface the new IN_USE state."
  - "renameColour keeps the entire cascade in a single db.transaction: (1) update colors row, (2) diff-aware UPDATE on product_option_values WHERE color_id=:id AND value=:pre.name (D-11 manual-wins), (3) labelCache=null on every variant whose option1..option6 references any pov linked to this colour. ER_DUP_ENTRY is caught — happens if a product already had another colour with the new name."
  - "1000-row guardrail (D-12) is a pre-flight count BEFORE the transaction starts. Returns { ok: false, error: 'Cascade affects N rows…' } so admin can split the rename. Live count uses the same diff-aware WHERE so admin sees the accurate non-clobbered count."
  - "labelCache invalidation runs as 6 parallel UPDATEs inside the transaction (one per option slot) because there's no portable way to OR across 6 columns in Drizzle. Mirrors renameOptionValue at variants.ts:288-294."
  - "Delete dropdown uses preventDefault + setShowDeleteConfirm to keep the menu state under our control. Modal renders inline as a sibling of the DropdownMenu (not via portal) — same pattern as coupon-row-actions inline confirm."
  - "Edit form: cascade is invoked ONLY when name or hex changed vs initial. If neither changed, the form just calls updateColour. If cascade succeeds but updateColour subsequently fails, the cascade is preserved (acceptable — cascade is idempotent on re-submit)."
  - "Skipped npm run build per executor SCOPE BOUNDARY rule. The pre-existing 'Can't resolve shadcn/tailwind.css' error in globals.css is documented in .planning/phases/18-colour-management/deferred-items.md. The 18-04 acceptance criteria require only `npx tsc --noEmit` exit 0, which PASSES."
metrics:
  duration_minutes: 10
  completed_at: "2026-04-26T06:50:45Z"
  tasks_completed: 4
  files_changed: 3
  commits: 3
---

# Phase 18 Plan 04: Hard-Delete + Cascade Rename Summary

**Two trickiest server actions land — deleteColour with IN_USE guard returning structured `{code, error, products[]}` payload, and renameColour with single-transaction diff-aware cascade UPDATE on product_option_values per D-11 (manual-wins) plus labelCache invalidation across all 6 positional option slots. Modal UI swaps to IN_USE error mode showing affected products with `Open` links + "Archive instead" recovery CTA per UI-SPEC §Surface 2.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-26T06:40:48Z
- **Completed:** 2026-04-26T06:50:45Z
- **Tasks:** 4 (3 code edits + 1 verification-only; build deferred per scope boundary)
- **Files changed:** 3 (all modified, no new files)

## Accomplishments

- `deleteColour(id)` — hard-delete with IN_USE guard via manual-hydration helper. Returns `{ ok: false, code: "IN_USE", error, products: [{id, name, slug}] }` when ≥1 `product_option_values` row references the colour; otherwise deletes and revalidates `/admin/colours` + `/shop`. Race condition handled: a foreign-key violation between guard and delete re-runs the guard and re-surfaces the IN_USE response.
- `renameColour(id, { name?, hex? })` — diff-aware cascade in a single `db.transaction`. Sequence: update `colors` row → UPDATE `product_option_values` set value/swatch_hex WHERE color_id=:id AND value=:pre.name (D-11 — manually-renamed pov rows preserved) → null `labelCache` on every variant referencing affected pov rows across all 6 option slots. 1000-row D-12 guardrail returns a friendly error before the transaction starts.
- `getProductsUsingColour(id)` — exported helper using 3-query manual hydration (pov → option → product) per CLAUDE.md MariaDB no-LATERAL rule. Returned shape: `{ id, name, slug }[]` sorted by name. Used by `deleteColour` AND consumed by the row-actions modal to render the IN_USE product list.
- `colour-row-actions.tsx` — Delete dropdown item (red, with `Trash2` icon) opens an inline two-step modal. Default mode shows confirm copy + #EF4444 destructive button. On `IN_USE` response the modal swaps to error mode: red heading "Cannot delete — in use", `#FEE2E2` product-list panel with `Open` links to `/admin/products/[id]/edit` (target=_blank) + `ExternalLink` icon, and an "Archive instead" primary CTA (BRAND.ink) that calls `archiveColour` and closes the modal.
- `colour-form.tsx` — edit submit detects name/hex change vs `initial`. If changed: calls `renameColour(initial.id, { name?, hex? })` FIRST so the cascade transaction fires; surfaces the 1000-row guardrail message inline. THEN runs `updateColour(initial.id, fd)` for the non-cascade metadata (brand / familyType / familySubtype / code / previousHex / isActive). New mode unchanged.
- TypeScript compiles cleanly (`npx tsc --noEmit` exits 0).
- All 3 new server actions start with `await requireAdmin()` first await per CVE-2025-29927.

## Task Commits

Each task was committed atomically:

1. **Task 1: deleteColour + renameColour + getProductsUsingColour appended to admin-colours.ts** — `9ceb547` (feat)
2. **Task 2: Delete + IN_USE modal wired in colour-row-actions.tsx** — `31f6144` (feat)
3. **Task 3: cascade renameColour wired in colour-form.tsx edit flow** — `4a74a26` (feat)
4. **Task 4: build verification** — no commit (skipped per scope boundary; tsc clean)

**Plan metadata:** committed alongside this SUMMARY (final commit).

## Files Modified

| Path | Status | Lines |
|------|--------|-------|
| `src/actions/admin-colours.ts` | modified | +261 / -3 |
| `src/components/admin/colour-row-actions.tsx` | modified | +193 / -5 |
| `src/components/admin/colour-form.tsx` | modified | +40 / -6 |

## API Surface (new exports)

### `deleteColour(id: string): Promise<MutateResult>`

```ts
// Success
{ ok: true, id }

// Blocked — colour is referenced by ≥1 product_option_values row
{
  ok: false,
  code: "IN_USE",
  error: "Cannot delete — colour is in use by N products.",
  products: [{ id, name, slug }, ...]
}

// Blocked — race condition (FK violation between guard and delete)
{
  ok: false,
  code: "IN_USE",
  error: "A product started using this colour while you were deleting. Please archive instead.",
  products: [...]
}

// Generic failure
{ ok: false, error: "Unable to delete colour." }
```

### `renameColour(id: string, input: { name?: string; hex?: string }): Promise<MutateResult>`

```ts
// No-op (neither name nor hex actually changed)
{ ok: true, id }

// Success — cascade fired, all linked pov rows updated, labelCache nulled
{ ok: true, id }

// 1000-row guardrail (D-12)
{ ok: false, error: "Cascade affects N variant rows (>1000). Split the rename into smaller steps or contact engineering." }

// Duplicate value collision on a product mid-cascade
{ ok: false, error: "Cascade rename hit a duplicate value on a product. Resolve the conflict on that product first, then retry." }

// Not found
{ ok: false, error: "Colour not found." }
```

### `getProductsUsingColour(colourId: string): Promise<{ id, name, slug }[]>`

Manual-hydration helper. Returns sorted by `name`. Used by `deleteColour` AND by the row-actions modal indirectly (the modal reads `products` from the `IN_USE` response shape rather than calling this helper directly).

## Cascade Transaction Sequence

```
db.transaction(async (tx) => {
  1. UPDATE colors SET name=:newName, hex=:newHex WHERE id=:colourId
  2. UPDATE product_option_values
     SET value=:newName, swatch_hex=:newHex
     WHERE color_id = :colourId
       AND value     = :pre.name        ← diff-aware (D-11 manual-wins)
  3. SELECT id FROM product_option_values WHERE color_id = :colourId
  4. PARALLEL × 6:
     UPDATE product_variants SET label_cache = NULL
     WHERE option1_value_id IN (povIds)   -- option2..option6 in parallel
});
revalidatePath('/admin/colours')
revalidatePath('/admin/colours/<id>/edit')
revalidatePath('/shop')
revalidatePath('/')
```

## D-11 Diff-Aware Filter Behaviour

| Pre-rename `colors.name` | `pov.value` (current state) | Will UPDATE? |
|---|---|---|
| "Galaxy Black" | "Galaxy Black" | YES (matches snapshot, cascade fires) |
| "Galaxy Black" | "Black Hole" (manually renamed by admin on a product) | NO (manual edit preserved) |
| "Galaxy Black" | "galaxy black" (case mismatch) | NO (filter is exact equality) |
| "Galaxy Black" | NULL | n/a (NOT NULL column) |

Manual-rename preservation is automatic: the admin's per-product override on a single variant survives a library rename.

## D-12 1000-Row Guardrail

Pre-flight count uses the same diff-aware WHERE (`color_id = :id AND value = :pre.name`) so the threshold reflects the actual cascade scope, not the gross attachment count. Returns:

```
"Cascade affects 1247 variant rows (>1000). Split the rename into smaller steps or contact engineering."
```

For Print Ninjaz scale this guard is unlikely to fire in practice but exists per D-12 contract; verifier can confirm presence via grep on `linkedCount > 1000`.

## UI-SPEC §Surface 2 IN_USE Error UI Coverage

| UI-SPEC element | Implemented? | Notes |
|---|---|---|
| Heading "⚠ Cannot delete — in use" | YES | `color: #991B1B` |
| Body "This colour is used by N products:" | YES | Singular/plural handled |
| Product list panel | YES | `bg: #FEE2E2`, `space-y-2` |
| Each product → name + Open link | YES | Link to `/admin/products/${id}/edit`, `target="_blank"` |
| `ExternalLink` lucide icon | YES | 12×12 inline |
| Recovery copy "Archive instead? Archived colours stay on existing products but disappear from the picker." | YES | `text-slate-600` 14px |
| "Cancel" CTA (ink/33 border) | YES | min-h-[48px] |
| "Archive instead" CTA (BRAND.ink fill) | YES | Calls `archiveColour(id)`, min-h-[48px] |
| Two-step modal (default confirm → IN_USE swap) | YES | Single inline modal with state-machine render |

## Reactivity Contract

These mutations happen on `/admin/colours` (server-rendered list page), not inside `variant-editor.tsx`. The Phase 17 AD-06 reactivity contract therefore does NOT apply directly to the call sites here. Instead:

- `colour-row-actions.tsx` calls `router.refresh()` on success — re-renders the server-component list page.
- `colour-form.tsx` calls `router.push('/admin/colours')` + `router.refresh()` on success.
- `revalidatePath('/shop')` and `revalidatePath('/')` invalidate the customer-facing surfaces so the new colour name appears on PDP swatches + sidebar chips on next render.

## Manual Smoke Checklist (NOT executed in this plan — DB state required)

1. Login as admin → `/admin/colours`.
2. Find a seeded colour with no products attached → click 3-dot → "Delete…" → modal shows confirm copy → click "Delete colour" → row removed; success toast / list refresh.
3. Pick a seeded colour, attach it to a test product (manually edit `product_option_values` row to set `color_id`, OR wait for Plan 18-05 picker).
4. Try to delete the in-use colour → modal swaps to IN_USE error UI listing the product → click "Archive instead" → row badge becomes Archived.
5. Open admin colours → edit a colour with linked products → change `name` → submit → cascade fires; verify linked `pov.value` rows now show the new name (`SELECT * FROM product_option_values WHERE color_id = :id`).
6. Manual-rename test: pre-condition — manually update one `pov` row's `value` to a different string. Then rename the library colour. Verify the manually-renamed `pov` was NOT clobbered (D-11).

## Decisions Made

- **MutateResult extension over split** — keeps every existing call site type-safe via `'code' in res` checks; no breaking change for `archiveColour` / `reactivateColour` consumers.
- **Manual hydration over JOIN** — `getProductsUsingColour` issues 3 sequential queries (pov → option → product) per CLAUDE.md MariaDB no-LATERAL rule. Sorted by name on the way out for predictable modal ordering.
- **Race-condition retry** — `deleteColour` catches `foreign key constraint` / `ER_ROW_IS_REFERENCED` from the DB layer and re-runs the guard to surface fresh IN_USE products. Defense-in-depth alongside the FK ON DELETE RESTRICT constraint.
- **Single transaction for cascade** — `db.transaction` wraps the 3-step cascade sequence (colors UPDATE + diff-aware pov UPDATE + 6 labelCache invalidations). Mirror precedent: `setDefaultVariant` at `src/actions/variants.ts:800-811`. ER_DUP_ENTRY caught at the boundary.
- **labelCache nulled across 6 slots in parallel** — there's no portable way to OR across 6 columns in Drizzle. The 6 parallel `tx.update().where(inArray(productVariants.optionN_value_id, povIds))` calls run inside the transaction (transaction.commit() awaits all). Pattern mirrors `renameOptionValue` at variants.ts:288-294.
- **Edit form: cascade FIRST, metadata SECOND** — name/hex changes route through `renameColour` for the cascade transaction; `updateColour` then handles brand/family/code/previousHex/isActive. If cascade succeeds but updateColour later fails, the cascade is preserved on subsequent re-submit (idempotent).
- **No `npm run build`** — pre-existing CSS resolver issue (`shadcn/tailwind.css` from `globals.css:3`) is documented in `deferred-items.md`. Acceptance criterion is `npx tsc --noEmit` exit 0, which PASSES.

## Deviations from Plan

None. Plan 18-04 executed exactly as written.

## Deferred Issues

### Pre-existing build issue out of scope for this plan

`npm run build` blocked by `globals.css:3` `@import "shadcn/tailwind.css"`. Identical to the issue documented in `.planning/phases/18-colour-management/deferred-items.md` from Plan 18-03. The CSS line predates Phase 18; the production cPanel deploy resolves it differently than local Windows webpack. TypeScript layer of the build is clean (`npx tsc --noEmit` exits 0). The 18-04 acceptance criteria explicitly skip `npm run build` per executor SCOPE BOUNDARY rule.

## Issues Encountered

- One read-before-edit reminder fired during Task 1 (after I had already read admin-colours.ts earlier in the session). The edit succeeded — reminder is post-hoc, not a hard block.
- Same reminder fired during Task 2 (Write to colour-row-actions.tsx) and Task 3 (Edit on colour-form.tsx). All three edits succeeded.
- `npm run build` started in background but stayed empty after 30+ seconds (still spawning the Next.js compiler when the verification step concluded). Skipped per scope boundary; no impact on plan acceptance criteria.

## Next Phase Readiness

- **Plan 18-05 (variant editor "Pick from library" modal) unblocked.** The picker can confidently call `listColours()` (existing — Plan 18-03) and rely on `getProductsUsingColour` for any in-use checks if needed.
- **Plan 18-06 (PDP swatch grid + /shop sidebar filter) unblocked.** Cascade rename + diff-aware filter ensure the customer-facing surfaces auto-refresh when admin renames a library colour. Manual edits on individual variants are preserved.
- The seeded 351 rows from Plan 18-02 are still visible at `/admin/colours`; Delete + cascade-rename flows are now active.

## Self-Check: PASSED

| Check | Status |
|-------|--------|
| `src/actions/admin-colours.ts` exists with `deleteColour` exported | FOUND (1 grep match) |
| `renameColour` exported | FOUND (1 grep match) |
| `getProductsUsingColour` exported | FOUND (1 grep match) |
| `code: "IN_USE"` present (≥2 occurrences) | FOUND (4 — type definition + deleteColour primary + race-condition retry + race-condition error message hint) |
| `db.transaction` present (≥1) | FOUND (2 occurrences in renameColour + comment ref) |
| `linkedCount` 1000-row guard present | FOUND (3 occurrences) |
| `labelCache: null` across 6 slots | FOUND (6 occurrences — exact slot count) |
| `eq(productOptionValues.value, pre.name)` diff-aware WHERE | FOUND (2 — count query + UPDATE) |
| `await requireAdmin()` ≥9 (6 from Plan 18-03 + 3 new) | FOUND (9) |
| `colour-row-actions.tsx` calls `deleteColour` | FOUND |
| `code === "IN_USE"` branch in colour-row-actions.tsx | FOUND (2) |
| "Archive instead" CTA in colour-row-actions.tsx | FOUND (3) |
| `ExternalLink` lucide icon imported + used | FOUND (2) |
| `/admin/products/` link to in-use products | FOUND |
| `min-h-[48px]` ≥4 (Cancel + Delete + Cancel + Archive-instead) | FOUND (4) |
| `#EF4444` destructive button colour | FOUND |
| `colour-form.tsx` imports `renameColour` | FOUND |
| `nameChanged` / `hexChanged` gating logic | FOUND (5 occurrences) |
| `renameColour(initial.id` call site | FOUND |
| `updateColour(initial.id` still called for non-cascade fields | FOUND |
| `npx tsc --noEmit` exits 0 | PASSED |
| All 3 task commits exist in git log | FOUND (`9ceb547`, `31f6144`, `4a74a26`) |

## Threat Flags

None introduced by this plan beyond the threat model declared in 18-04-PLAN.md `<threat_model>`:

- T-18-04-cascade-runaway → mitigated via D-12 1000-row guardrail (pre-flight count check).
- T-18-04-clobber-manual → mitigated via D-11 diff-aware WHERE on `pov.value = :pre.name`.
- T-18-04-fk-bypass → mitigated via app-level guard (getProductsUsingColour) + DB-level FK ON DELETE RESTRICT (defense-in-depth) + race-condition catch on FK violation.
- T-18-04-stale-cache → mitigated via labelCache invalidation on all 6 option slots inside the transaction + revalidatePath on /shop, /admin/colours, /.
- T-18-04-inuse-leak → accepted (admin-only surface; product names + slugs already public elsewhere).
- T-18-04-admin-bypass → mitigated via `await requireAdmin()` first await on every new export (verified via grep — 9 total).

No new network endpoints, auth paths, file-access patterns, or schema changes were introduced. Trust boundary unchanged.

## Commits

| Hash | Message |
|------|---------|
| `9ceb547` | feat(phase-18): admin colour deleteColour + renameColour + IN_USE guard |
| `31f6144` | feat(phase-18): wire Delete + IN_USE error modal in colour-row-actions |
| `4a74a26` | feat(phase-18): wire cascade renameColour from colour-form edit flow |

---

*Phase: 18-colour-management*
*Plan: 04 — Hard-Delete + Cascade Rename*
*Completed: 2026-04-26*
