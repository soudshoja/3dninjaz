---
phase: 25-mixed-letter-and-icon-keycaps-for-square-keychain-product
plan: 06
subsystem: ui
tags: [react, keychain, configurator, keycaps, icons, storefront, base-ui, dialog]

# Dependency graph
requires:
  - phase: 25-01
    provides: KeycapSlot type, ensureKeycapSequence, KeycapSeqConfig, lookupTierPriceBySlotCount, buildKeycapSequenceSummary
  - phase: 25-02
    provides: KEYCAP_ICONS / KEYCAP_ICON_BY_ID static catalog + committed WebP assets
provides:
  - "KeycapIconPicker — customer-facing single-select icon grid (S2), Dialog-based, minmax(64px) WebP thumbnails"
  - "KeycapSeqField — 56x56 slot-rail builder (S1) with + Letter / + Icon affordances, shared maxSlots cap, blue/purple accents, remove + empty-state"
  - "keycapseq dispatch branch in configurator-form.tsx serializing the ordered sequence into values[fieldId] as JSON"
affects: [25-07-preview-wiring, 25-08-server-capture, 25-09-dev-smoke]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Customer-facing picker reuses the shadcn/Base-UI Dialog primitive via DialogTrigger render prop (no hand-rolled modal)"
    - "Transparent buffer input overlaying the + Letter button as the char-entry focus target (type-to-append tiles, backspace-to-remove)"
    - "Empty sequence serialized as '' (not '[]') so a required field still reads as unfilled"

key-files:
  created:
    - src/components/store/keycap-icon-picker.tsx
  modified:
    - src/components/store/configurator-form.tsx

key-decisions:
  - "Used the Dialog primitive (same overlay as ColourPickerDialog) for the icon picker — no Popover primitive exists in the repo; Dialog satisfies 'do not hand-roll a modal'"
  - "Letter entry via a transparent buffer input overlaying + Letter; typing appends tiles char-by-char (feels like today's name field), backspace removes last/editing slot"
  - "Empty sequence writes '' so required validation (isFilled) treats zero slots as unfilled"
  - "maxSlots resolves textMaxLength ?? cfg.maxSlots so the tier-driven cap (wired in a later plan) can override the config default"

patterns-established:
  - "Slot tile accent contract: letter = blue border + blue dot, icon = purple border + purple dot, selected icon = green ring + Check (UI-SPEC color contract)"

requirements-completed: [D-02, D-04, D-10]

# Metrics
duration: 12min
completed: 2026-07-18
---

# Phase 25 Plan 06: Customer Slot-Sequence Builder + Icon Picker Summary

**Square-keychain PDP now builds an ordered mix of letter and icon keycaps via a 56×56 slot rail (KeycapSeqField) with a shared maxSlots cap and a Dialog-based icon grid (KeycapIconPicker), serialized as a JSON sequence into values[fieldId] with letter-only graceful degrade when no icons are allowed.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-18T18:14:30Z
- **Completed:** 2026-07-18T18:17:08Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `KeycapIconPicker` (S2): single-select customer picker built on the existing Dialog primitive — responsive `minmax(64px, 1fr)` grid of committed WebP thumbnails + 12px truncated labels, tap fills the slot and closes, green selected ring + Check on the current icon, renders null on an empty allow-list, no IP badges/grouping (D-08).
- `KeycapSeqField` (S1): wrapping rail of 56×56 tiles in sequence order — letter tiles (blue accent, editable) and icon tiles (purple accent, tap-to-replace via the picker), a transparent buffer input behind `+ Letter` for uppercase/`allowedChars`-filtered char entry, `+ Icon` gated on `cfg.allowedIconIds.length`, per-slot remove `×` (`aria-label="Remove keycap"`, no confirmation), and a dashed empty-state placeholder with "Start your keychain" copy.
- Shared `N/maxSlots` counter (letters + icons combined, D-02) in `tabular-nums`; at the cap both add buttons disable and a rose "Maximum reached" chip appears.
- `keycapseq` dispatch branch wired into `ConfiguratorForm` writing the ordered sequence through the existing `onChange` contract as a JSON string in `values[field.id]` (empty string when zero slots), with no colour controls on icon slots (D-04).

## Task Commits

1. **Task 1: KeycapIconPicker — customer icon grid (S2)** - `9f9f81a` (feat)
2. **Task 2: KeycapSeqField slot-rail builder + keycapseq dispatch** - `13e9671` (feat)

**Plan metadata:** _(final docs commit follows this summary)_

## Files Created/Modified
- `src/components/store/keycap-icon-picker.tsx` - New customer-facing single-select icon picker (Dialog + grid, S2).
- `src/components/store/configurator-form.tsx` - Added `KeycapSeqField` component (S1), the `keycapseq` dispatch branch, and imports for `ensureKeycapSequence`, `KEYCAP_ICON_BY_ID`, `KeycapIconPicker`, `KeycapSeqConfig`, `KeycapSlot`, `useState`, `X`.

## Decisions Made
- **Dialog over Popover for S2:** the repo has no Popover primitive; the Dialog primitive (the same overlay `ColourPickerDialog` uses) satisfies the UI-SPEC "reuse the project's existing dialog/popover primitive; do not hand-roll a modal" constraint. Trigger composed via Base UI's `DialogTrigger render={trigger}` so the tile/`+ Icon` button opens it without nested buttons.
- **Buffer-input letter entry:** a transparent, always-empty input overlaying the `+ Letter` button is the focus target; each typed (filtered) char appends a `{t:"L",ch}` slot up to the cap, Backspace removes the editing/last slot, and tapping an existing letter tile sets it as the replacement target. This keeps typing identical to today's name field without a persistent visible text field.
- **Empty = unfilled:** `commit([])` writes `""` (not `"[]"`) so the existing `isFilled`/required-error logic still flags a zero-slot required field.
- **maxSlots resolution:** `textMaxLength ?? cfg.maxSlots` so the product-view tier cap (wired in a later plan) can override the config default while this plan defaults to `cfg.maxSlots`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The Task 1 acceptance grep `grep -i "franchise|licensed|trademark"` initially matched a doc comment that literally listed those forbidden words. Reworded the comment to "NO IP badge or grouping (D-08)" so the file contains zero IP language, satisfying the criterion. (Handled before the Task 1 commit — not a plan deviation.)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- S1/S2 builder is complete and typechecks clean. Ready for:
  - **25-07** — live preview wiring (`KeychainPreview` mixed strip consuming the same slot model) and `configurable-product-view.tsx` price/summary/over-cap branches.
  - **25-08** — server-side re-derive of price/summary/weight from the JSON sequence at capture (paypal / admin-pos / whatsapp-order).
  - **25-09** — dev smoke of the full builder + picker interaction.
- Note: the `+ Icon` affordance only appears once an admin has populated `allowedIconIds` on the seeded square-keychain keycapseq field (admin allow-list UI is a separate S4 plan). Until then the builder degrades to letter-only, as designed.

## Self-Check: PASSED

- Files verified on disk: `keycap-icon-picker.tsx`, `configurator-form.tsx`, `25-06-SUMMARY.md`
- Commits verified: `9f9f81a` (Task 1), `13e9671` (Task 2)
- `npx tsc --noEmit` exits 0 after both tasks

---
*Phase: 25-mixed-letter-and-icon-keycaps-for-square-keychain-product*
*Completed: 2026-07-18*
