---
phase: 25-mixed-letter-and-icon-keycaps-for-square-keychain-product
plan: 05
subsystem: ui
tags: [admin, config-field, keycapseq, icon-picker, shadcn-dialog, zod, react]

# Dependency graph
requires:
  - phase: 25-01
    provides: "KeycapSeqConfig type + KeycapSeqConfigSchema; pickSchemaByFieldType keycapseq case (added as a 25-01 Rule 3 deviation)"
  - phase: 25-02
    provides: "KEYCAP_ICONS / KEYCAP_ICON_BY_ID static 34-icon catalog module"
provides:
  - "src/components/admin/icon-picker-dialog.tsx — admin multi-select IconPickerDialog (static-catalog adaptation of ColourPickerDialog)"
  - "KeycapSeqConfigForm inside config-field-modal.tsx — letter constraints + allowed-icon allow-list editor"
  - "keycapseq threaded through all 6 config-field-modal integration points (FIELD_TYPES, schema import, useState init, getConfig, validateConfig, render dispatch)"
  - "Server-side keycapseq config validation already routed via pickSchemaByFieldType (verified; no change needed)"
affects:
  - "25-07 storefront mixed-slot render + PDP icon picker (consumes the persisted allowedIconIds)"
  - "25-08 order capture re-derive (validates icon ids against allowedIconIds)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static-catalog admin multi-select dialog: adapts ColourPickerDialog's Set<string> staged selection + pluralised footer + disabled-when-zero CTA, but renders a static import (KEYCAP_ICONS) as a thumbnail grid instead of an async fetch"
    - "keycapseq wired through the same six-point config-field-modal path used by textarea/colour (FIELD_TYPES + schema + state init + getConfig + validateConfig + render dispatch)"
    - "Config form rendered inside the shared ConfigFieldFormBody so it works in BOTH the add/edit modal and the locked-field inline drawer"

key-files:
  created:
    - "src/components/admin/icon-picker-dialog.tsx"
  modified:
    - "src/components/admin/config-field-modal.tsx"

key-decisions:
  - "Task 1 required no code change — Plan 25-01 already added the keycapseq case + import to pickSchemaByFieldType (documented there as a Rule 3 deviation). Acceptance criteria re-verified, not re-implemented."
  - "IconPickerDialog uses a clean 4-prop shape { open, onOpenChange, initialSelectedIds, onConfirm } (per the plan's explicit prop spec) rather than ColourPickerDialog's dual attach-to-option/select-multiple prop surface — no DB write, no attach mode needed for a static catalog"
  - "keycapseq IS listed in FIELD_TYPES (add-mode picker) per the plan's explicit instruction; the primary use is editing the locked seeded square-keychain field via the shared ConfigFieldFormBody drawer"
  - "Icon allow-list button + accent use BRAND.purple (UI-SPEC S4/colour contract assigns purple to icon affordances); selected-state ring in the dialog uses BRAND.green (matches colour-chip selected treatment)"

patterns-established:
  - "Admin static-catalog allow-list picker: import the catalog module directly, filter by label, stage in a Set, return Array.from() on confirm — no server action, no CRUD"

requirements-completed: [D-05, D-09]

# Metrics
duration: ~15min
completed: 2026-07-19
---

# Phase 25 Plan 05: Admin keycapseq Field Config + Icon Allow-List Summary

**Admins can now configure a `keycapseq` field end-to-end — set its letter constraints (maxSlots / allowedChars / uppercase / profanity) and multi-select which of the 34 catalog icons its icon slots may offer — via a new `IconPickerDialog` and a `KeycapSeqConfigForm` wired through every config-field-modal integration point, including the locked square-keychain inline drawer.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-19 (approx.)
- **Completed:** 2026-07-19
- **Tasks:** 3 (1 pre-satisfied by 25-01, 2 implemented)
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Built `IconPickerDialog` — a near-verbatim adaptation of `ColourPickerDialog` that renders the static 34-entry `KEYCAP_ICONS` catalog as a thumbnail grid, with client-side name filter, `Set<string>` staged multi-select, native-checkbox brand accent, pluralised footer counter, and a confirm CTA disabled at zero selection. Returns the staged ids via `onConfirm(Array.from(selected))`. No async fetch, no CRUD, no IP-status badges (D-08).
- Added `KeycapSeqConfigForm` to `config-field-modal.tsx`, combining `TextConfigForm`'s letter-constraint inputs with a `ColourConfigForm`-style "Select icons" button that opens the dialog and renders the chosen icons back as a `KEYCAP_ICON_BY_ID`-resolved thumbnail strip with a count `Badge`.
- Threaded `keycapseq` through all six field-modal integration points and confirmed the form renders inside the shared `ConfigFieldFormBody` (used by both the modal and the locked-field inline drawer), so the admin can edit `allowedIconIds` on the seeded, locked square-keychain field.
- Re-verified that server-side config validation already routes `keycapseq` to `KeycapSeqConfigSchema` via `pickSchemaByFieldType`, with `requireAdmin()` preserved as the first await in `addConfigField`/`updateConfigField` (CVE-2025-29927).

## Task Commits

1. **Task 1: keycapseq case in pickSchemaByFieldType** — already present from `fb8ebe7` (25-01, Rule 3); acceptance re-verified, no new commit
2. **Task 2: IconPickerDialog admin multi-select** — `01e2d7f` (feat)
3. **Task 3: wire KeycapSeqConfigForm into config-field-modal** — `daaadd8` (feat)

**Plan metadata:** _(this SUMMARY + STATE/ROADMAP/REQUIREMENTS)_

## Files Created/Modified

- `src/components/admin/icon-picker-dialog.tsx` — NEW admin multi-select dialog over the static keycap-icon catalog
- `src/components/admin/config-field-modal.tsx` — added `KeycapSeqConfigForm`, imports (`IconPickerDialog`, `KEYCAP_ICON_BY_ID`, `KeycapSeqConfigSchema`, `KeycapSeqConfig`, `Keyboard` icon), FIELD_TYPES entry, useState init, getConfig / validateConfig branches, settings-card header label, and the render dispatch

## Decisions Made

- **Task 1 was already done** — Plan 25-01 added the `keycapseq` case and `KeycapSeqConfigSchema` import to `pickSchemaByFieldType` as a Rule 3 blocking-fix (to keep tsc green after widening the `FieldType` union). This plan re-verified all four Task-1 acceptance criteria (case present + returns schema, import present, requireAdmin-first ordering intact, tsc exit 0) rather than re-implementing.
- **Clean 4-prop IconPickerDialog** — followed the plan's explicit prop spec `{ open, onOpenChange, initialSelectedIds, onConfirm }`. The static catalog needs no DB write, no `attach-to-option` mode, and no `myColoursPrompt` branch, so those parts of the source were intentionally dropped.
- **keycapseq in FIELD_TYPES** — kept per the plan's explicit instruction and acceptance grep (≥3 `"keycapseq"` sites). Its primary surface is the locked-field edit drawer, not the add-mode grid.
- **Accent colours** — purple for the icon affordance (UI-SPEC colour contract), green for the dialog's selected ring (matches existing colour-chip selection).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] IP-language grep tripped by an explanatory comment**
- **Found during:** Task 2 acceptance verification
- **Issue:** The Task 2 acceptance criterion greps `franchise|licensed|trademark|upload` and expects zero matches; my file header comment described the D-08 constraint using the literal words "franchise / licensed / trademark" and "upload".
- **Fix:** Reworded the comment to "no file-import, no CRUD" + "no IP-status badge or grouping of any kind" — no code change. (Same class of fix as 25-01's docstring rewording.)
- **Files modified:** `src/components/admin/icon-picker-dialog.tsx`
- **Verification:** `grep -i "franchise\|licensed\|trademark\|upload"` returns nothing; `npx tsc --noEmit` exits 0.
- **Committed in:** `01e2d7f` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking, cosmetic comment reword to satisfy the plan's own acceptance grep).
**Impact on plan:** No scope change. No behavioural difference.

## Issues Encountered

None. `npx tsc --noEmit` was clean at baseline and after each task.

## Known Stubs

None. `allowedIconIds` defaults to `[]` on a new keycapseq field, which is the intended graceful-degrade state (empty allow-list → storefront `+ Icon` affordance hidden, per D-09 / UI-SPEC S2) — not a stub. The admin populates it via the new dialog; the seeded square field ships with `[]` by design (25-03).

## Next Phase Readiness

- The admin side of the keycapseq feature is configurable end-to-end. Persisted `allowedIconIds` is now available for 25-07 (storefront PDP slot builder + icon picker) and 25-08 (capture re-derive) to consume.
- No blockers. The locked square-keychain field editing path is live via the shared `ConfigFieldFormBody`.

---
*Phase: 25-mixed-letter-and-icon-keycaps-for-square-keychain-product*
*Completed: 2026-07-19*

## Self-Check: PASSED

All created/modified files exist on disk (`icon-picker-dialog.tsx`, `config-field-modal.tsx`, `25-05-SUMMARY.md`); both task commits (`01e2d7f`, `daaadd8`) present in git history. Task 1 verified as pre-satisfied by 25-01's `fb8ebe7`.
