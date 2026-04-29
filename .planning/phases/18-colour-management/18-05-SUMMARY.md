---
phase: 18-colour-management
plan: 05
subsystem: admin-actions+admin-ui
tags: [colours, picker, modal, shadcn-dialog, db.transaction, requireAdmin, pattern-b-refetch, snapshot, batch-confirm]
requirements_completed: [REQ-5]
dependency_graph:
  requires:
    - "src/actions/admin-colours.ts (Plan 18-03/18-04 — 9 existing server actions; new picker actions extend the file)"
    - "src/lib/colours.ts ColourAdmin type (Plan 18-01)"
    - "src/lib/db/schema.ts colors + productOptions + productOptionValues.colorId (Plan 18-01)"
    - "src/components/ui/dialog.tsx (Base UI Dialog primitive — already used by variant-editor delete dialogs)"
    - "src/components/ui/badge.tsx (already in tree)"
    - "src/lib/brand.ts BRAND palette"
  provides:
    - "src/actions/admin-colours.ts getActiveColoursForPicker — single-fetch active library list"
    - "src/actions/admin-colours.ts attachLibraryColours — batched multi-pov insert in db.transaction"
    - "src/components/admin/colour-picker-dialog.tsx ColourPickerDialog — shadcn Dialog modal"
    - "ColourPickerRow type alias = ColourAdmin (full admin shape, codes visible)"
    - "AttachResult discriminated union — { ok: true, added, skipped } | { ok: false, error }"
  affects:
    - "Plan 18-06 — variant-editor wires the picker behind a 'Pick from library' button on Colour-named options; passes its existing refresh() (Pattern B) as onConfirmed"
    - "T-18-05-admin-leak — picker file lives under /components/admin/ and is never imported by storefront surfaces"
tech_stack:
  added: []
  patterns:
    - "Single fetch on open + client-side filter (D-06 — picker stays instant for ~100-row library)"
    - "Multi-select staged in Set<string>; toggle on row click + native checkbox (D-08)"
    - "Pluralised counter + disabled-when-zero CTA (UI-SPEC §Surface 3 footer)"
    - "Already-attached guard: rows in alreadyAttachedColourIds render aria-disabled, opacity 0.5, with 'Already attached' inline label"
    - "Batched confirm in db.transaction snapshotting name + hex into pov.value + pov.swatchHex with colorId FK link (D-08, D-09, D-10)"
    - "Case-insensitive de-dup pre-check via Set<lower-cased value> to avoid ER_DUP_ENTRY at the latin1_swedish_ci collation boundary"
    - "Native <input type='checkbox'> (no shadcn Checkbox primitive in tree) styled via accentColor: BRAND.ink"
    - "Pattern B refetch handoff: onConfirmed prop awaited before dialog closes; Plan 18-06 wires it to variant-editor refresh()"
key_files:
  created:
    - path: "src/components/admin/colour-picker-dialog.tsx"
      lines: 397
      purpose: "Shadcn Dialog modal that fetches the active colour library once on open, supports search + brand + family filters client-side, stages multi-select with already-attached guard, and confirms via batched attachLibraryColours + onConfirmed Pattern B refetch."
  modified:
    - path: "src/actions/admin-colours.ts"
      lines_added: 134
      lines_removed: 0
      purpose: "Append getActiveColoursForPicker (single-fetch active library) + attachLibraryColours (batched pov insert in db.transaction with snapshot name/hex/colorId, case-insensitive de-dup, productId-aware revalidatePath). ColourPickerRow + AttachResult exported."
decisions:
  - "Native <input type='checkbox'> over a new shadcn Checkbox primitive — Glob shows no checkbox.tsx in src/components/ui/. Adding a new primitive (architectural Rule 4) was overkill for one use site. Native checkbox with accentColor:BRAND.ink delivers identical UX + smaller bundle. Plan 18-06 can swap if a Checkbox primitive lands later."
  - "Server-action signature kept positional: attachLibraryColours(optionId, colourIds[]) per the plan's <interfaces> section. Object-arg refactor was tempting but would have broken the plan's <key_links> pattern matcher and forced an unrelated diff."
  - "AttachResult split from MutateResult — the picker's success path needs added/skipped counts, while the existing MutateResult only carries id. New shape is local; existing callers untouched."
  - "Productid prop accepted on the dialog despite the server action looking it up via optionId — kept for caller symmetry with Plan 18-06's wiring + future productId-scoped concerns. Marked _productId in destructure to silence unused-var warnings while keeping the prop public."
  - "alreadyAttachedColourIds prop typed as Set<string> not string[] — caller (Plan 18-06) will be doing membership tests during render; Set lookups are O(1) vs Array.includes() O(n). Caller hydrates the Set from variant-editor data on mount."
  - "Skipped npm run build — pre-existing 'Can't resolve shadcn/tailwind.css' from globals.css:3 is documented in deferred-items.md (Plans 18-03 / 18-04 same skip). The orchestrator's success_criteria explicitly notes 'Skip npm run build — pre-existing globals.css issue'. tsc --noEmit exit 0 is the binding gate, which PASSES."
metrics:
  duration_minutes: 4
  completed_at: "2026-04-26T07:01:27Z"
  tasks_completed: 3
  files_changed: 2
  commits: 2
---

# Phase 18 Plan 05: Library Picker Modal Summary

**Picker UI surface and its two server actions ship — `getActiveColoursForPicker` (single-fetch active library, brand→name sorted) + `attachLibraryColours` (batched multi-pov insert in `db.transaction`, snapshotting name + hex + `colorId` FK link, case-insensitive de-dup against existing pov values). The `ColourPickerDialog` mounts via shadcn Dialog at max-w-720px (D-05), filters client-side on name + brand + family_subtype + code (D-06) with optional brand/family secondary selects, stages multi-select in a `Set<string>`, renders pluralised counter + disabled-when-zero CTA in the footer (D-08), and exposes an `onConfirmed` prop that Plan 18-06 will wire to variant-editor's existing Pattern B `refresh()`.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-26T06:57:21Z
- **Completed:** 2026-04-26T07:01:27Z
- **Tasks:** 3 (2 code edits + 1 verification-only; build skipped per scope boundary)
- **Files changed:** 2 (1 modified server-action file + 1 new component)

## Accomplishments

- `getActiveColoursForPicker(): Promise<ColourPickerRow[]>` — `requireAdmin()` first await; SELECT all `is_active = true` rows from `colors` ORDER BY brand ASC, name ASC. Returns the full admin shape (`ColourAdmin` aliased as `ColourPickerRow`) so the picker can render brand badge + family_type chip + family_subtype chip + code (mono) per D-07. Picker renders client-side; no server-side filtering needed for ~100-row library per D-06.
- `attachLibraryColours(optionId, colourIds[]): Promise<AttachResult>` — `requireAdmin()` first await; validates `optionId` exists; re-fetches library rows with `is_active = true` (T-18-05-stale-attach defense — admin may have archived a colour after the picker opened); pre-computes case-insensitive de-dup Set against existing pov values; computes next position from `Math.max(existing.position) + 1`; inserts each colour as a pov row inside `db.transaction` with `id = randomUUID()`, `value = c.name`, `swatchHex = c.hex`, `colorId = c.id`. Returns `{ ok: true, added, skipped }`. Revalidates `/admin/products/{productId}/variants`, `/admin/products/{productId}/edit`, `/products/{slug}`, and `/shop`.
- `ColourPickerDialog` client component (~397 lines) — shadcn `<Dialog>` shell at `max-w-[720px] w-[92vw]`, header with title + dynamic "{N} colours available" subtitle, search input with `lucide:Search` prefix and `autoFocus`, brand + family secondary selects, scrollable row list with skeleton/error/zero/empty states, footer with pluralised counter + Cancel + Confirm buttons. Confirm uses `useTransition` to call `attachLibraryColours` then awaits `onConfirmed?.()` (Pattern B refetch hook) before closing.
- TypeScript compiles cleanly (`npx tsc --noEmit` exits 0).
- Both new server actions start with `await requireAdmin()` first await (CVE-2025-29927 / CLAUDE.md mandate).
- All 7 footer-pluralisation states honoured: zero → "Select colours to add" + disabled "Add 0 colours"; one → "1 colour selected" + "Add 1 colour"; many → "N colours selected" + "Add N colours".
- Already-attached rows: opacity 0.5, `aria-disabled`, native checkbox disabled, `cursor: not-allowed`, italicised "Already attached" inline label, tooltip "Already attached to this product".

## Task Commits

| Hash | Message |
|------|---------|
| `96ad510` | feat(phase-18): picker server actions getActiveColoursForPicker + attachLibraryColours |
| `4f0da6a` | feat(phase-18): library picker modal ColourPickerDialog |

(Task 3 = verification-only; no commit. Final SUMMARY commit lands alongside this file.)

## Files Changed

| Path | Status | Lines |
|------|--------|-------|
| `src/actions/admin-colours.ts` | modified | +134 / -0 |
| `src/components/admin/colour-picker-dialog.tsx` | created | +397 |

## API Surface (new exports)

### `getActiveColoursForPicker(): Promise<ColourPickerRow[]>`

```ts
type ColourPickerRow = ColourAdmin; // alias — picker shows the full admin shape

// Returns all is_active = true colours, ordered brand ASC, name ASC.
// Single fetch per picker open (D-06). ~100 rows ≈ 30 KB JSON.
// requireAdmin() first await — admin-only.
```

### `attachLibraryColours(optionId, colourIds): Promise<AttachResult>`

```ts
type AttachResult =
  | { ok: true; added: number; skipped: number }
  | { ok: false; error: string };

// Single transaction insert of N pov rows for the picked colours.
// snapshots name + hex into pov.value + pov.swatchHex.
// FK link via pov.colorId so cascade rename (D-09 / D-10 / D-11) propagates.
// case-insensitive de-dup against existing pov.value on this option.
// re-checks is_active = true (T-18-05-stale-attach).
// requireAdmin() first await.
```

### `ColourPickerDialog` props

```ts
type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  optionId: string;
  productId: string;                    // informational; not yet used by the action
  alreadyAttachedColourIds: Set<string>;
  onConfirmed: () => Promise<void> | void;
};
```

## Filter Logic

```
substring match (case-insensitive) ON name + brand + familySubtype + code
   ∩ brand select (All | Bambu | Polymaker | Other)
   ∩ family select (All | PLA | PETG | TPU | CF | Other)
```

All filters intersect (AND). Empty search + All/All renders the full library. Computed via `useMemo` so re-renders stay cheap as the user types.

## Pattern B Handoff

Plan 18-06 will wire the picker into `variant-editor.tsx`:

```tsx
// inside variant-editor.tsx (Plan 18-06 — NOT yet implemented)
<ColourPickerDialog
  open={pickerOpen}
  onOpenChange={setPickerOpen}
  optionId={colourOption.id}
  productId={productId}
  alreadyAttachedColourIds={new Set(
    colourOption.values.filter((v) => v.colorId).map((v) => v.colorId!)
  )}
  onConfirmed={refresh /* existing useCallback at variant-editor.tsx:108-118 */}
/>
```

The `refresh()` function refetches via `getVariantEditorData(productId)` and resets local options + variants state — picking up the new pov rows (and the cartesian variant matrix regeneration handled by the editor's existing reactivity contract from Phase 17 AD-06).

## Reactivity Contract

This plan ships only the picker primitive — the variant editor mounts/wires happen in Plan 18-06. The picker itself follows Pattern B contract on confirm:

1. Confirm → `useTransition` start → `attachLibraryColours(optionId, ids)`
2. On `{ ok: true }` → `await onConfirmed()` (parent's `getVariantEditorData` refetch)
3. Then `onOpenChange(false)` to close the modal

Errors keep the dialog open with an inline banner so the admin can retry without losing their selection. Selection state is reset only when the dialog re-opens (a successful confirm closes; a future re-open clears).

## Threat Model Mitigations Applied

| Threat ID | Mitigation |
|-----------|-----------|
| T-18-05-admin-bypass | `await requireAdmin()` first await on both `getActiveColoursForPicker` and `attachLibraryColours` |
| T-18-05-pov-collision | Case-insensitive de-dup Set pre-check before insert; skipped count returned in result |
| T-18-05-stale-attach | Server re-checks `is_active = true` via `inArray + and(isActive, true)` before insert |
| T-18-05-cross-product-leak | Only colour-ids (UUIDs) flow from parent; admin-only context |
| T-18-05-admin-leak | Picker file at `/components/admin/`; only imported by admin surfaces |
| T-18-05-public-leak-pov | pov rows snapshot only `value` (name) + `swatchHex` (hex); no `code` / `family_*` / `previous_hex` ever leaves the colors row |

## UI-SPEC §Surface 3 Coverage

| UI-SPEC element | Implemented? | Notes |
|---|---|---|
| max-w-[720px] modal shell | YES | sm:max-w-[720px] override added because base Dialog default is sm:max-w-sm |
| 18px Russo_One title via DialogTitle | YES | className="text-xl" — heading font set globally |
| Search input full-width 48px tap, autoFocus, lucide:Search prefix | YES | min-h-[48px], pl-10 for icon, placeholder "Search by name, code, family…" |
| Brand + Family secondary selects | YES | "All" + 4 options each |
| Picker row: hex chip 24px + name + brand badge + family_type chip + family_subtype chip + code (mono) | YES | Selected adds 2px ink left border + cream background + lucide:Check icon |
| Already-attached row: opacity 0.5, disabled checkbox, "Already attached" badge, tooltip | YES | aria-disabled true; cursor not-allowed |
| Skeleton loader (6 zinc-100 rows) on load | YES | Replaced if loading > expected — fallback covers fetch latency |
| Error banner with retry hint | YES | role="alert"; copy "Could not load colours. Please close and reopen." |
| Zero state (library empty) — points to seed-colours.ts + /admin/colours | YES | Code block formatted |
| Search-miss state | YES | Heading + helper |
| Footer counter pluralisation (0 / 1 / N) | YES | "Select colours to add" / "1 colour selected" / "N colours selected" |
| Footer Confirm pluralisation + disabled-when-zero | YES | "Add 0 colours" disabled / "Add 1 colour" / "Add N colours" |
| Cancel button (ink/33 border, ink text, rounded-full, 48px) | YES | Disabled while pending |

## Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | ColourPickerDialog mounts via shadcn Dialog with max-w-720px | PASS |
| 2 | Modal fetches the library once on open with skeleton loading | PASS |
| 3 | Search filters by name + brand + family_subtype + code (case-insensitive) | PASS |
| 4 | Brand + Family secondary filters narrow further | PASS |
| 5 | Each row shows hex 24px chip + name + brand badge + family_type chip + family_subtype chip + code (mono) | PASS |
| 6 | Already-attached rows render disabled with tooltip | PASS |
| 7 | Footer N counter + disabled-when-zero "Add N colours" button | PASS |
| 8 | Confirm calls attachLibraryColours + onConfirmed (Pattern B refetch) | PASS |
| 9 | Empty/error states render per UI-SPEC §"Empty / error states" | PASS |
| 10 | All new server actions gated by requireAdmin() first await | PASS |
| 11 | npx tsc --noEmit exits 0 | PASS |

## Deviations from Plan

**[Rule 3 — Blocking issue] Native checkbox swapped for shadcn `<Checkbox>` primitive**
- **Found during:** Task 2 — verifying `src/components/ui/checkbox.tsx` exists.
- **Issue:** No `checkbox.tsx` in `src/components/ui/` (Glob confirmed: only button/card/input/label/table/badge/dropdown-menu/tabs/sonner/textarea/select/switch/separator/avatar/skeleton/dialog/drawer present). Plan code body assumed `Checkbox` primitive was already installed.
- **Fix:** Used native `<input type="checkbox">` with `accentColor: BRAND.ink`, `disabled` attribute, `readOnly` when already-attached, and explicit `onClick stopPropagation` so it doesn't double-fire alongside the row click handler. Same a11y surface (implicit checkbox role + checked + disabled states), zero new dependencies, identical visual outcome at the picker scale.
- **Files modified:** `src/components/admin/colour-picker-dialog.tsx`.
- **Commit:** `4f0da6a`.

No other deviations. Plan 18-05 executed substantively as written.

## Deferred Issues

### Pre-existing build issue out of scope (carried from 18-03 / 18-04)

`npm run build` is blocked by `globals.css:3` `@import "shadcn/tailwind.css"`. This predates Phase 18 and is documented in `.planning/phases/18-colour-management/deferred-items.md`. The TypeScript layer is the binding gate per the orchestrator's success criteria:

- `npx tsc --noEmit` → exit 0 (PASSES)
- `npm run build` → skipped per executor SCOPE BOUNDARY rule

## Manual Smoke Checklist (NOT executed in this plan — Plan 18-06 wires the mount point)

1. Plan 18-06 will mount the picker behind a "Pick from library" button on the variant editor when an option is named "Color"/"Colour" (case-insensitive).
2. Open the picker → expect ~100 rows from the seeded library (Plan 18-02 seeded 351 — but `is_active = true` filter may narrow). Subtitle reads "{N} colours available".
3. Type "galaxy" → list filters to rows whose name/brand/family_subtype/code contain "galaxy".
4. Select Brand: Bambu + Family: PLA → list narrows to Bambu PLA only.
5. Tick 3 rows → footer reads "3 colours selected" + Confirm reads "Add 3 colours" (enabled).
6. Confirm → useTransition starts → `attachLibraryColours` runs → on success the dialog closes; variant editor's `refresh()` re-renders with 3 new pov rows + cartesian variants.
7. Re-open the picker → those 3 ids appear in `alreadyAttachedColourIds`; rows render disabled with "Already attached" badge.
8. Try to confirm with 0 selected → button stays disabled; clicking is no-op.
9. Force a network failure (DevTools throttle) → after a confirm timeout the inline error banner appears; modal stays open; selection preserved.
10. Library cleared (DELETE FROM colors) → on open, modal shows the "No colours in the library yet." zero state with the seed CLI hint.

## Decisions Made

- **MutateResult vs AttachResult split** — `attachLibraryColours` needs added/skipped counts on success, which `MutateResult` doesn't carry. Adding a fourth variant to `MutateResult` would have widened the type for every existing call site. Local `AttachResult` keeps the contract clean.
- **Case-insensitive de-dup pre-check over ER_DUP_ENTRY catch** — the latin1_swedish_ci collation makes the DB UNIQUE(option_id, value) constraint case-insensitive. Pre-checking via `Set<lower-cased value>` lets us return a structured `skipped` count cleanly rather than catching mid-loop and risking partial state.
- **Native checkbox over shadcn primitive** — see Deviation note above. Smaller bundle, identical UX, no new dependency. Future Plan 18-06 swap is trivial if the project introduces a Checkbox primitive elsewhere.
- **autoFocus + Set<string> selection model** — autoFocus on the search input matches UI-SPEC §"Search input" focus-on-open; `Set<string>` for selection state gives O(1) toggle/has lookups vs an array. Pattern mirrors variant-editor's `selectedIds` state at lines 124-138.
- **Productid prop kept on signature despite server action looking it up via optionId** — informational; aligns with Plan 18-06's wiring example where the parent already has `productId` in scope.
- **Skipped npm run build** — pre-existing globals.css resolver issue is documented in deferred-items.md from 18-03/18-04. The orchestrator's success_criteria explicitly directs to skip the build. tsc PASSES.

## Issues Encountered

- One read-before-edit reminder fired during Task 1's edit on `admin-colours.ts`. The file had been read at session start in the parallel context-load phase; the reminder is post-hoc. Edit succeeded cleanly.
- No other blockers. Both new server actions and the picker dialog compile and grep-verify against all acceptance criteria.

## Next Phase Readiness

- **Plan 18-06 (variant-editor integration) unblocked.** Mount via `<ColourPickerDialog>` behind a "Pick from library" button shown when option name matches `/^col(or|our)$/i`. Pass productId, optionId, the existing `colourOption.values` `Set<colorId>`, and `refresh` as `onConfirmed`.
- **Plan 18-07 (PDP swatch grid + /shop sidebar) unaffected.** Picker-side surface is admin-only; storefront surfaces consume `getColourPublic` which strips codes / family / previous_hex.
- The seeded 351 rows from Plan 18-02 plus all admin manually-created rows are picker-eligible as long as `is_active = true`.

## Self-Check: PASSED

| Check | Status |
|-------|--------|
| `src/actions/admin-colours.ts` exists with `getActiveColoursForPicker` exported | FOUND (1 grep match) |
| `attachLibraryColours` exported | FOUND (1 grep match) |
| `await requireAdmin()` ≥11 (9 prior + 2 new) | FOUND (11) |
| `db.transaction` ≥3 (rename cascade + attach + comment ref) | FOUND (3) |
| `colorId: c.id` FK link | FOUND (1) |
| `value: c.name` snapshot | FOUND (1) |
| `swatchHex: c.hex` snapshot | FOUND (1) |
| `src/components/admin/colour-picker-dialog.tsx` exists | FOUND |
| First line is `"use client"` | FOUND (1) |
| `export function ColourPickerDialog` | FOUND (1) |
| `max-w-[720px]` (D-05 modal width) | FOUND (1) |
| `getActiveColoursForPicker` referenced in dialog | FOUND (2) |
| `attachLibraryColours` referenced in dialog | FOUND (3) |
| `alreadyAttachedColourIds` ≥2 | FOUND (3) |
| `Already attached` (tooltip + label) | FOUND (3) |
| `min-h-[48px]` ≥3 (search + cancel + confirm tap targets) | FOUND (3) |
| `onConfirmed` ≥2 | FOUND (4) |
| `Add ${selectedCount}` D-08 batch confirm copy | FOUND (1) |
| `npx tsc --noEmit` exits 0 | PASSED |
| Task 1 commit `96ad510` in git log | FOUND |
| Task 2 commit `4f0da6a` in git log | FOUND |

## Threat Flags

None introduced by this plan beyond the threat model declared in 18-05-PLAN.md `<threat_model>`. All 6 listed threats are mitigated or accepted as documented above. No new network endpoints, auth paths, file-access patterns, or schema changes were introduced. Trust boundary unchanged.

## Commits

| Hash | Message |
|------|---------|
| `96ad510` | feat(phase-18): picker server actions getActiveColoursForPicker + attachLibraryColours |
| `4f0da6a` | feat(phase-18): library picker modal ColourPickerDialog |

---

*Phase: 18-colour-management*
*Plan: 05 — Library Picker Modal + Server Actions*
*Completed: 2026-04-26*
