---
phase: 25
plan: GAP-02
subsystem: keychain / mixed letter+icon keycaps
tags: [keychain, icon-keycap, preview, production-batching, uat-gap]
type: gap-closure
requires: [25-03, 25-04, 25-07, "25 icon-crop/typing-UX gap closure (#193)"]
provides: [icon-shell-follows-base-colour]
affects:
  - src/components/store/keychain-preview.tsx
  - src/actions/admin-production.ts
  - src/components/admin/keychain-batches.tsx
key-files:
  modified:
    - src/components/store/keychain-preview.tsx
    - src/actions/admin-production.ts
    - src/components/admin/keychain-batches.tsx
decisions:
  - "Reverses part of D-04: the icon keycap SHELL is no longer fixed white — it follows the customer's chosen Base colour, matching the letter keycaps. Only the icon's own baked artwork/accent colours remain fixed."
metrics:
  duration: ~20m
  completed: 2026-07-19
---

# Phase 25 Plan GAP-02: Icon Keycap Shell Follows Base Colour Summary

Human-UAT gap fix: the mixed letter+icon keychain now renders (and prints) the
icon keycap shell in the customer's chosen **Base** colour instead of a
hardcoded white, so the whole keychain — letters and icons — shares one
consistent shell colour. Only the icon's own baked-in graphic/accent colours
(e.g. the alien's green face) remain fixed.

## What Changed

### Fix 1 — Customer-facing preview (`keychain-preview.tsx`)
- Removed the `ICON_SHELL_WHITE = "#FFFFFF"` constant.
- The per-cube `background` for icon slots now uses `baseHex` (same as letter
  slots); the ternary collapsed to `background: baseHex` for both branches.
- Verified nothing else in the `isIcon` branch assumed white — the icon `<img>`
  renders `objectFit: contain` over the shell with no white dependency.
- Rewrote the doc comment, the `slots` prop comment, the inline `background`
  comment, and the icon-render block comment that previously documented the
  "icons always white / D-04" behaviour.
- **Letter-only code path untouched** — the pixel-parity guarantee holds because
  the only changed line is inside the `isIcon` branch (and for all-letter
  sequences `isIcon` is always false, so `background` was and still is `baseHex`).

### Fix 2 — Production batching (`admin-production.ts` + `keychain-batches.tsx`)
- Icon batches now group by a composite key `` `${iconId}::${base}` `` instead
  of `iconId` alone. Base colour is resolved from the unit's `base` field,
  mirroring the existing BASE batch grouping.
- Two orders with the same icon but different Base colours now land in
  **separate** icon batches (they need different shell filament).
- Added a `baseColour` field to the `KeychainIconBatch` type (mirrors
  `KeychainBaseBatch.base`) so admin can see which colour to load.
- `IconBatchCard` now shows the Base colour shell label under the icon name;
  the grid `key` includes `baseColour` to stay unique across colour splits.
- `markKeychainIconPrinted` and assembly-readiness logic needed **no changes** —
  ticks and readiness are still per-item (`iconDone`), independent of how
  batches are keyed for display.

## Deviations from Plan

None beyond the scoped instructions. Two small necessary follow-ons the task
flagged to "check":
- The admin grid `key={b.iconId}` had to include `baseColour` (would otherwise
  collide once one icon splits across colours) — React key correctness (Rule 1).
- `KeychainBatches.icons` doc comment updated to say "icon id + base colour".

## D-04 Reversal (explicit)

The original **D-04** decision stated icon keycaps never use customer colours and
always render on a fixed white shell. Per updated product direction, this is
**partially reversed**: the icon **shell** now follows the customer's chosen Base
colour. The icon's own baked artwork/accent colours (the actual design) remain
fixed and are still never customer-selectable — only the white shell underneath
changed.

## What Was NOT Touched (per scope)

- Icon baked graphic/accent colours (fixed by design).
- `keycap-icons.ts` catalog, icon extraction pipeline, `config-fields.ts`, DB
  schema, `keychain-parts.ts` legacy parser.
- Round keychain paths (icons are square-only, D-01).
- `configurator-form.tsx` slot-rail input tiles (input widget, not a true-colour
  preview — intentionally left as-is).

## Verification

- `npx tsc --noEmit` → exit 0 (clean).
- `vitest run src/lib/keychain-parts.test.ts` → 13/13 passed. These tests cover
  sequence parsing (counts/order) only; no test referenced the old fixed-white
  shell or the icon batch grouping, so none needed updating.
- Pixel-parity: all-letter sequences render byte-identical — the only changed
  render line lives inside the `isIcon` branch, which never executes for
  letter-only sequences.

## Commits

- `ccc251e` fix(25): icon keycap preview shell uses customer Base colour
- `a89e823` fix(25): batch icon keycaps by icon id + base colour

Not pushed / no PR — committed locally on `fix/phase-25-icon-base-colour` for
review.
