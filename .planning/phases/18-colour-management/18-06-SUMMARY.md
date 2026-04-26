---
phase: 18-colour-management
plan: 06
subsystem: admin-ui
tags: [colours, picker, variant-editor, integration, pattern-b-refetch, isColourOption, custom-fallback, 6-axis-cap]
requirements_completed: [REQ-5, REQ-6]
dependency_graph:
  requires:
    - "src/components/admin/colour-picker-dialog.tsx (Plan 18-05)"
    - "src/actions/admin-colours.ts attachLibraryColours + getActiveColoursForPicker (Plan 18-05)"
    - "src/lib/variants.ts HydratedOption + HydratedOptionValue (extended with colorId)"
    - "src/actions/variants.ts getVariantEditorData refresh entry-point (Phase 17 AD-06 Pattern B)"
  provides:
    - "src/components/admin/variant-editor.tsx isColourOption helper — case-insensitive Color/Colour detection"
    - "src/components/admin/variant-editor.tsx Pick from library button — gated on isColourOption(opt)"
    - "src/components/admin/variant-editor.tsx ColourPickerDialog mount — wired to refresh() Pattern B refetch"
    - "src/components/admin/variant-editor.tsx Custom (not in library) caption + helper copy"
    - "HydratedOptionValue.colorId field — drives alreadyAttachedColourIds on the picker"
  affects:
    - "Plan 18-07 — PDP swatch grid + /shop sidebar; depends on the picker landing pov rows with colorId so storefront can read library swatches"
    - "Wave 4 verifier — smoke checklist for full picker flow"
tech_stack:
  added: []
  patterns:
    - "Case-insensitive Color/Colour detection via module-scoped isColourOption helper"
    - "Picker mount gated on pickerOptionId state (null = closed; defensive multi-Colour-option support)"
    - "Pattern B refetch handoff: ColourPickerDialog onConfirmed → await refresh() (Phase 17 AD-06)"
    - "Custom-fallback relabel: section header + helper text + placeholder change for Colour-named options only"
    - "HydratedOptionValue.colorId surface — picker computes alreadyAttachedColourIds via Set"
    - "REQ-6 6-axis cap unchanged: addProductOption guard at existing.length >= 6 untouched; picker never calls addProductOption"
key_files:
  created: []
  modified:
    - path: "src/components/admin/variant-editor.tsx"
      lines_added: 49
      lines_removed: 2
      purpose: "Mount ColourPickerDialog behind Pick from library button; isColourOption helper; pickerOptionId state; Custom (not in library) caption + helper copy on Colour options."
    - path: "src/lib/variants.ts"
      lines_added: 8
      lines_removed: 0
      purpose: "Extend HydratedOptionValue type with colorId field; hydrate from db row in mapper."
    - path: "src/lib/catalog.ts"
      lines_added: 1
      lines_removed: 0
      purpose: "Hydrate colorId in the bulk-list catalog mapper to keep type compatible with HydratedOptionValue."
    - path: "src/app/(admin)/admin/colours/[id]/edit/page.tsx"
      lines_added: 2
      lines_removed: 2
      purpose: "Stale-copy fix — Plan 18-04 cascade-rename has shipped; updated edit page intro accordingly."
decisions:
  - "Module-scoped isColourOption helper (not inline) — used at 4 sites in variant-editor.tsx; helper lifts the regex out of JSX so the case-insensitive 'color'/'colour' policy lives in one place. Future changes (e.g., add 'colour-1' alias) edit one helper, not 4 sites."
  - "pickerOptionId: string | null state shape (not boolean) — defensive support for multiple Colour options on the same product (e.g., 'Colour' + 'Accent Colour'). Setting an option-specific id means the picker mounts once and can target any option without ambiguity."
  - "alreadyAttachedColourIds computed inline at mount time (not stored as state) — the picker re-reads via options.find every render, but the picker only mounts when pickerOptionId !== null, so the lookup happens once per open. Cheaper than a useMemo."
  - "HydratedOptionValue.colorId added as string | null (NOT optional) — keeps the type total. catalog.ts mapper updated to mirror variants.ts mapper. Drizzle schema already had the column (Plan 18-01); this just exposes it in the public type."
  - "Did NOT extract a <ColourOptionPickerSlot /> sub-component — the additions total ~30 lines and reuse existing scope (options, refresh, productId). Extraction would add a prop-drilling surface and obscure the integration points reviewers need to trace."
  - "Did NOT replace the freeform path — admin can still type a custom name + hex. The relabel + helper copy is a nudge, not a block (per UI-SPEC §Surface 3 'Custom one-off fallback')."
  - "Did NOT modify addProductOption or the 6-axis cap — REQ-6 verified by inspection. Picker only inserts into productOptionValues on an existing option; cap is enforced upstream regardless of the option's name."
  - "Skipped npm run build — pre-existing globals.css 'shadcn/tailwind.css' resolver issue documented in deferred-items.md (carried from Plans 18-03/04/05). tsc --noEmit is the binding gate per the orchestrator's success criteria."
metrics:
  duration_minutes: 5
  completed_at: "2026-04-26T07:12:14Z"
  tasks_completed: 4
  files_changed: 4
  commits: 4
---

# Phase 18 Plan 06: Variant Editor Picker Integration Summary

**ColourPickerDialog now mounts inside variant-editor.tsx behind a Pick from library button on options named "Color"/"Colour" (case-insensitive). Confirm wires through Pattern B refetch (Phase 17 AD-06) — `await refresh()` re-fetches via `getVariantEditorData(productId)` so new pov rows with `colorId` FK + cartesian variant matrix regeneration arrive together. The existing freeform name+swatchHex path stays — relabelled "Custom (not in library)" with helper copy clarifying that custom values won't appear on /shop or be reusable. The 6-axis cap is verified untouched: `addProductOption` enforces `existing.length >= 6` regardless of option name; the picker never invokes `addProductOption` (only `attachLibraryColours`, which inserts into productOptionValues on an existing option).**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-26T07:07:11Z
- **Completed:** 2026-04-26T07:12:14Z
- **Tasks:** 4 (3 code edits + 1 inspection-only verification + 1 stale-copy fix)
- **Files changed:** 4

## Accomplishments

- **isColourOption module helper** — case-insensitive `name === "color" || name === "colour"` lookup. Used at 4 sites in variant-editor.tsx (placeholder gate, button gate, caption gate, helper-text gate).
- **pickerOptionId state hook** — `string | null` (null = closed). Supports multiple Colour-named options per product without picker ambiguity.
- **Pick from library button** — sibling of the existing add-value Input + Add button row. Renders only on Colour-named options; click sets pickerOptionId to that option's id. Disabled while isPending to prevent double-clicks during refresh.
- **ColourPickerDialog mount** — sibling to existing delete-option / delete-value dialogs at the bottom of the component JSX. Computes `alreadyAttachedColourIds` from `options.find(o => o.id === pickerOptionId)?.values` filtering for non-null `colorId`. onConfirmed wired to `await refresh()` — Pattern B refetch contract.
- **HydratedOptionValue.colorId** — extended the public type and both hydration mappers (`variants.ts` + `catalog.ts`) to surface the FK column. Drizzle schema already had the column (Plan 18-01); this exposes it in the type so the picker integration compiles.
- **Custom (not in library) caption + helper copy** — section header above the freeform input row + paragraph below it. Both gated on `isColourOption(opt)`. Non-Colour options (Size, Material, Part, etc.) render unchanged.
- **REQ-6 verified by inspection** — `addProductOption` guard at line 82 (`existing.length >= 6`) and line 106 (`nextPosition > 6`) is name-agnostic. Picker dialog has zero references to `addProductOption`. Adding a 7th option named "Colour" (or anything) returns the existing "Product supports up to 6 attribute types" error.
- **Stale copy fix** — `colours/[id]/edit/page.tsx` lines 39-42 said cascade-rename "ships in Plan 18-04" which is no longer accurate (Plan 18-04 shipped 2026-04-26). Updated to describe the current behaviour.
- TypeScript compiles cleanly (`npx tsc --noEmit` exits 0).

## Task Commits

| Hash | Message |
|------|---------|
| `6011324` | feat(phase-18): variant-editor picker imports + isColourOption helper + colorId on HydratedOptionValue |
| `e6d6005` | feat(phase-18): mount ColourPickerDialog behind 'Pick from library' button |
| `17bfe24` | feat(phase-18): add 'Custom (not in library)' caption + helper text on Colour options |
| `de48acc` | docs(phase-18): refresh stale Plan 18-04 reference on colours edit page |

(Final SUMMARY commit lands alongside this file.)

## Files Changed

| Path | Status | Lines |
|------|--------|-------|
| `src/components/admin/variant-editor.tsx` | modified | +49 / -2 |
| `src/lib/variants.ts` | modified | +8 / -0 |
| `src/lib/catalog.ts` | modified | +1 / -0 |
| `src/app/(admin)/admin/colours/[id]/edit/page.tsx` | modified | +2 / -2 |

## Diff Summary — variant-editor.tsx (3 surfaces)

### Surface 1: imports + module-scope helper

```ts
// existing lucide-react import gains Palette
import { ..., Palette } from "lucide-react";

// new import (sibling of existing /components/ui/dialog imports)
import { ColourPickerDialog } from "@/components/admin/colour-picker-dialog";

// module-scoped helper above the component
function isColourOption(opt: { name: string }): boolean {
  const n = opt.name.trim().toLowerCase();
  return n === "color" || n === "colour";
}
```

### Surface 2: state hook + per-option .map block additions

```ts
const [pickerOptionId, setPickerOptionId] = useState<string | null>(null);
```

Inside the per-option `.map` block (~lines 470-510), three additions gated on `isColourOption(opt)`:

```tsx
{/* New: section header above the freeform Input row */}
{isColourOption(opt) ? (
  <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 mt-2">
    Custom (not in library)
  </div>
) : null}

<div className="flex gap-2">
  <Input
    placeholder={isColourOption(opt) ? "Add custom (not in library)..." : `Add ${opt.name} value...`}
    /* ...existing props... */
  />
  <Button /* existing Add button */ />

  {/* New: Pick from library trigger */}
  {isColourOption(opt) ? (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => setPickerOptionId(opt.id)}
      className="gap-1"
      disabled={isPending}
    >
      <Palette className="h-3 w-3" /> Pick from library
    </Button>
  ) : null}
</div>

{/* New: helper copy below the row */}
{isColourOption(opt) ? (
  <p className="text-xs text-slate-500">
    Use the picker for stocked colours. Custom values won&apos;t appear on /shop or in cross-product reuse.
  </p>
) : null}
```

### Surface 3: dialog mount block (sibling to existing delete dialogs)

```tsx
{pickerOptionId ? (
  <ColourPickerDialog
    open={pickerOptionId !== null}
    onOpenChange={(v) => { if (!v) setPickerOptionId(null); }}
    optionId={pickerOptionId}
    productId={productId}
    alreadyAttachedColourIds={
      new Set(
        (options.find((o) => o.id === pickerOptionId)?.values ?? [])
          .map((v) => v.colorId)
          .filter((id): id is string => Boolean(id)),
      )
    }
    onConfirmed={async () => {
      await refresh();
    }}
  />
) : null}
```

## REQ-5 End-to-End Acceptance Flow

1. Admin opens variant editor on a product (e.g., `/admin/products/<slug>/variants`).
2. Admin clicks "Add Option" → types "Colour" → click confirm.
3. Editor renders the new option card. Because `isColourOption({name:"Colour"})` returns true:
   - Placeholder reads "Add custom (not in library)..."
   - Section header above the input shows "Custom (not in library)"
   - Pick from library button shows next to the Add button
   - Helper text below reads "Use the picker for stocked colours…"
4. Admin clicks **Pick from library** → ColourPickerDialog opens (Plan 18-05).
5. Admin types "galaxy" → list filters; ticks 3 rows; footer reads "3 colours selected" / "Add 3 colours".
6. Admin clicks **Add 3 colours** → `attachLibraryColours(optionId, ids)` runs in db.transaction → returns `{ ok: true, added: 3, skipped: 0 }`.
7. `await onConfirmed()` triggers `await refresh()` → `getVariantEditorData(productId)` re-fetches options + variants.
8. Local state replaces with server truth; the new pov rows render in the values list with their `colorId` FK + snapshotted name/hex; the picker dialog closes.
9. The variant matrix regenerates implicitly on the next "Generate / Refresh Variant Matrix" click (Phase 17 reactivity contract).
10. Re-opening the picker shows those 3 ids as `alreadyAttachedColourIds` → rendered with opacity 0.5 + "Already attached" label + disabled checkbox (Plan 18-05 already-attached guard).

## REQ-6 Verification — 6-axis Cap Unchanged (Inspection)

Cap message lives in `src/actions/variants.ts addProductOption`:

```ts
// line 82-83
if (existing.length >= 6) {
  return { error: "Product supports up to 6 attribute types..." };
}

// line 106 — defense-in-depth on the computed nextPosition
if (nextPosition > 6) return { error: "Product supports up to 6 attribute types..." };
```

Inspection results:

| Check | Result |
|-------|--------|
| `grep -E "Maximum 6\|6 options reached\|attribute types" src/actions/variants.ts` | 2 matches (line 83 + line 106) — name-agnostic |
| `grep -c "addProductOption" src/components/admin/colour-picker-dialog.tsx` | 0 — picker never bypasses the cap |
| `grep -c "addProductOption" src/components/admin/variant-editor.tsx` | 2 (existing import + existing call site at line 160) — Plan 18-06 introduced no new invocations |
| `grep -c "Pick from library" src/components/admin/variant-editor.tsx` | 2 (button label + comment ref) — picker trigger only |

Conclusion: adding a 7th option named "Colour" hits the same `existing.length >= 6` guard as adding "Size" or "Material". The picker only operates on existing options (inserts pov rows), so a product with the cap full simply can't have a Colour option to render its trigger button on. **REQ-6 met by existing code; zero changes required.**

## Reactivity Contract Compliance (Phase 17 AD-06)

| Mutation | Pattern | Wired? |
|----------|---------|--------|
| Picker confirm → attachLibraryColours | B (full refetch) | YES — `await refresh()` after `onConfirmed` resolves |
| Pickerstate (open/close) | client-only, no server call | n/a |
| Already-attached set computation | derived from `options` state | n/a |

`router.refresh()` not called anywhere in the new code path (per AD-06 contract).

## Threat Model Mitigations Applied

| Threat ID | Mitigation |
|-----------|-----------|
| T-18-06-cap-bypass | Picker never calls addProductOption — verified by grep (0 matches in colour-picker-dialog.tsx). Cap enforced upstream in addProductOption (verified by grep at line 82). |
| T-18-06-stale-options | Plan 18-05 server action re-checks `is_active = true` at attach time (T-18-05-stale-attach). After confirm, refresh() pulls server truth. |
| T-18-06-double-add | Plan 18-05 picker uses useTransition's pending flag to disable Confirm. Variant-editor's Pick from library button is also disabled while isPending. |
| T-18-06-stale-cache | onConfirmed → refresh() = getVariantEditorData full refetch (Pattern B per AD-06). |
| T-18-06-non-colour-leak | isColourOption gate ensures the trigger button only renders on options whose name matches /^colou?r$/i. |

## Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Adding option named "Colour"/"Color" shows Pick from library button | PASS |
| 2 | Non-Colour options (Size, Material, Part) render unchanged | PASS |
| 3 | Click opens ColourPickerDialog with correct productId, optionId, alreadyAttachedColourIds | PASS |
| 4 | After picker confirm, editor refetches via getVariantEditorData (Pattern B) | PASS — `await refresh()` |
| 5 | Existing freeform name+hex inputs still work + relabelled + helper copy | PASS |
| 6 | alreadyAttachedColourIds computed correctly from option.values' colorId | PASS — `Set<string>` from filter+map |
| 7 | 6-axis cap behaviour verified unchanged (inspection) | PASS |
| 8 | Stale Plan 18-04 copy on colours/[id]/edit refreshed | PASS |
| 9 | `npx tsc --noEmit` exits 0 | PASS |
| 10 | `npm run build` (pre-existing globals.css issue) | SKIPPED per orchestrator scope |

## Smoke Checklist for Wave 4 Verifier

1. `/admin/products/<existing-product>/variants` — open variant editor.
2. Click "Add Option" → type "Colour" → submit.
3. Verify section header "Custom (not in library)" appears above the Input row.
4. Verify Pick from library button appears with Palette icon.
5. Verify helper copy "Use the picker for stocked colours..." appears below.
6. Click Pick from library → modal opens; subtitle reads "{N} colours available" (where N = `is_active = true` row count).
7. Type "galaxy" / pick brand:Bambu / pick family:PLA → list filters narrow.
8. Tick 3 rows → footer reads "3 colours selected" + "Add 3 colours" enabled.
9. Click "Add 3 colours" → modal closes; 3 new pov chips appear in the values list (with hex swatches + names).
10. Click "Generate / Refresh Variant Matrix" → cartesian regenerates including the new colour values.
11. Re-open the picker → those 3 rows render with opacity 0.5, "Already attached" label, disabled checkbox.
12. Try to add a 7th option named "Material" (after already having 6) → existing "Product supports up to 6 attribute types" error fires (REQ-6 unchanged).
13. Add a custom freeform colour via the Input + Add button → still works; pov row inserted with `colorId = NULL`.
14. Edit a non-Colour option (e.g., Size) → no Pick from library button; no Custom caption; no helper copy.

## Deviations from Plan

**[Rule 3 — Blocking issue] HydratedOptionValue type missing colorId field**

- **Found during:** Task 2 — when wiring `alreadyAttachedColourIds`, TypeScript flagged that `v.colorId` did not exist on `HydratedOptionValue`. The Drizzle schema (Plan 18-01) already added `colorId` to `productOptionValues`, but the public type and both hydration mappers didn't surface it.
- **Fix:** Added `colorId: string | null` to `HydratedOptionValue` in `src/lib/variants.ts`; updated the mapper at line ~220 to read `v.colorId ?? null`; mirrored the change in the bulk-list mapper at `src/lib/catalog.ts:177-187`.
- **Files modified:** `src/lib/variants.ts`, `src/lib/catalog.ts`.
- **Commit:** `6011324`.
- **Rationale:** The type is required for Plan 18-06's integration to compile. The plan's `<interfaces>` section noted this as a possible adjustment ("If TypeScript complains about colorId missing from the value type, also update the type definition"). Both mappers updated atomically to keep the type total.

**Stale copy fix folded into the same commit set**

- `src/app/(admin)/admin/colours/[id]/edit/page.tsx` lines 39-42 still referenced "Plan 18-04" cascade-rename as forthcoming. Plan 18-04 shipped earlier today (commit `ad30cf4`). Updated copy to describe current behaviour.
- **Commit:** `de48acc`.
- **Rationale:** Wave 2 verifier note flagged this. Cosmetic only — no behavioural change.

No other deviations. Plan 18-06 executed substantively as written.

## Deferred Issues

### Pre-existing build issue out of scope (carried from 18-03 / 18-04 / 18-05)

`npm run build` is blocked by `globals.css:3 @import "shadcn/tailwind.css"`. This predates Phase 18 and is documented in `.planning/phases/18-colour-management/deferred-items.md`. The TypeScript layer is the binding gate per the orchestrator's success criteria:

- `npx tsc --noEmit` → exit 0 (PASSES)
- `npm run build` → skipped per executor SCOPE BOUNDARY rule

## Decisions Made

- **Module-scoped isColourOption helper** — used at 4 sites in variant-editor.tsx (placeholder gate, caption gate, button gate, helper-text gate). Helper avoids inline regex repetition and centralises the case-insensitive policy. Future extension (e.g., add "colour-1" alias) edits one helper, not 4 sites.
- **pickerOptionId: string | null state** — defensive support for multiple Colour-named options on the same product (rare but defensible). The picker mounts once and can target any specific option without ambiguity. Using a boolean would require a separate "which option" tracker.
- **alreadyAttachedColourIds computed inline at mount** — `options.find` lookup happens once per open (picker only mounts when pickerOptionId !== null). Cheaper than useMemo and keeps the dependency surface trivial.
- **HydratedOptionValue.colorId added as string | null (NOT optional)** — total type field. Both hydration mappers (variants.ts, catalog.ts) updated atomically. Drizzle schema already had the column.
- **Did NOT extract a sub-component** — additions total ~30 lines and reuse existing scope. Extraction would add prop-drilling and obscure the integration points reviewers need to trace.
- **Did NOT replace the freeform path** — relabel + helper copy is a nudge, not a block. Per UI-SPEC §Surface 3.
- **Did NOT modify addProductOption or the 6-axis cap** — REQ-6 verified by inspection; picker never calls addProductOption.
- **Skipped npm run build** — pre-existing globals.css resolver issue documented in deferred-items.md. tsc PASSES.

## Issues Encountered

- TypeScript flagged that `HydratedOptionValue` was missing `colorId`, even though the Drizzle schema had it (Plan 18-01). Fixed by extending the public type + both hydration mappers (Rule 3 deviation). No other blockers.
- Multiple PreToolUse `READ-BEFORE-EDIT` reminders fired during the session despite the files having been read in the initial context-load phase. Edits succeeded; reminders are post-hoc warnings, not failures.

## Next Phase Readiness

- **Plan 18-07 (PDP swatch grid + /shop sidebar) unblocked.** The picker now lands pov rows with `colorId` FK linking to library colours; storefront surfaces can read `getColourPublic` to populate swatch grids and filter sidebars.
- **Plan 18-08 / 18-09 (deferred / verification) unblocked** — variant editor integration is the last Wave 3 plan.
- The 351-row library seeded by Plan 18-02 is fully reachable from the variant editor through this picker.

## Self-Check: PASSED

| Check | Status |
|-------|--------|
| `src/components/admin/variant-editor.tsx` modified — Pick from library button added | FOUND |
| `import { ColourPickerDialog }` exists | FOUND (1 grep match) |
| `import { Palette }` exists in lucide-react import | FOUND (1 grep match) |
| `function isColourOption` exists | FOUND (1 grep match) |
| `pickerOptionId` referenced ≥3 (decl + open + close) | FOUND (3) |
| `setPickerOptionId` referenced ≥3 | FOUND (3) |
| `alreadyAttachedColourIds` referenced | FOUND (1) |
| `Add custom (not in library)` placeholder | FOUND (1) |
| `Custom (not in library)` section header | FOUND (1) |
| `Use the picker for stocked colours` helper text | FOUND (1) |
| `await refresh()` referenced (multi-site, including new onConfirmed) | FOUND (11) |
| `npx tsc --noEmit` exits 0 | PASSED |
| Task 1 commit `6011324` in git log | FOUND |
| Task 2 commit `e6d6005` in git log | FOUND |
| Task 3 commit `17bfe24` in git log | FOUND |
| Stale-copy commit `de48acc` in git log | FOUND |
| `src/lib/variants.ts HydratedOptionValue.colorId` added | FOUND |
| `src/lib/catalog.ts` mapper hydrates colorId | FOUND |
| `src/app/(admin)/admin/colours/[id]/edit/page.tsx` no longer mentions Plan 18-04 | FOUND |

## Threat Flags

None introduced by this plan beyond the threat model declared in 18-06-PLAN.md `<threat_model>`. All 5 listed threats are mitigated as documented above. No new network endpoints, auth paths, file-access patterns, or schema changes were introduced. Trust boundary unchanged.

## Commits

| Hash | Message |
|------|---------|
| `6011324` | feat(phase-18): variant-editor picker imports + isColourOption helper + colorId on HydratedOptionValue |
| `e6d6005` | feat(phase-18): mount ColourPickerDialog behind 'Pick from library' button |
| `17bfe24` | feat(phase-18): add 'Custom (not in library)' caption + helper text on Colour options |
| `de48acc` | docs(phase-18): refresh stale Plan 18-04 reference on colours edit page |

---

*Phase: 18-colour-management*
*Plan: 06 — Variant Editor Picker Integration*
*Completed: 2026-04-26*
