---
phase: 25-mixed-letter-and-icon-keycaps-for-square-keychain-product
plan: 04
subsystem: api
tags: [keychain, production, batching, admin, keycapseq, icons, drizzle, mariadb]

# Dependency graph
requires:
  - phase: 25-01
    provides: "keycapseq contract — KeycapSlot union, ensureKeycapSequence, order_items.icon_done column, widened fieldType ENUM"
  - phase: 25-02
    provides: "KEYCAP_ICON_BY_ID static catalog (icon id -> label + imageUrl)"
  - phase: 25-03
    provides: "parseKeycapSequence(raw, seqFieldId) structured letter/icon parser with explicit slotCount/letterCount/iconCount"
  - phase: 24-keychain-shape-split
    provides: "getKeychainBatches base/clicker shape-split grouping, KeychainBatchesView + BatchBoard, markKeychainPartPrinted, setKeychainAssembled"
provides:
  - "KeychainIconBatch type + icon grouping keyed by icon id (D-11) in getKeychainBatches"
  - "KeychainUnit.letters redefined as letter-slot count; adds slots/iconCount/iconDone"
  - "markKeychainIconPrinted server action (requireAdmin, UUID validate, cap-500, sets iconDone)"
  - "setKeychainAssembled + assembly readiness require icon parts for mixed units"
  - "Admin production 'Icons' segment (purple) rendering icon batch cards with printed tick"
affects:
  - "25 production floor for mixed letter+icon square keychain orders"
  - "any later plan reading KeychainBatches.icons or the iconDone tick"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Third production batch group keyed by a single dimension (icon id), parallel to the colour-keyed base/clicker groups"
    - "Structured-first per-line read (parseKeycapSequence via a per-product seqField lookup) with legacy count fallback"
    - "Per-unit dedupe within an icon group (unit pushed once per distinct icon id) so doneCount/allDone track units while totalQty counts slot instances"

key-files:
  created: []
  modified:
    - "src/actions/admin-production.ts"
    - "src/components/admin/keychain-batches.tsx"

key-decisions:
  - "Icon batch key is the icon id ONLY — no shape, no colour (icons are square-only D-01, colours fixed per icon D-04)"
  - "KeychainUnit.letters now means letter-slot count (structured letterCount, fallback parts.letters); BASE + CLICKER+LETTER grouping keys left byte-identical (Pitfall 1)"
  - "iconDone is a single per-order-item flag covering all icon slots of the item (mirrors baseDone/clickerLetterDone)"
  - "Assembly guard derives iconCount from the structured sequence at tick time (manual select + limit, no LATERAL); iconCount===0 units unaffected"
  - "Icons segment + its Seg are guarded by icons.length > 0 so an all-letter/round store renders the board byte-identically"

patterns-established:
  - "Icon-slot production group: batch by id, render image+label+count+tick, no colour chips"
  - "Optimistic assembly readiness folds the icon condition into base/clicker/icon toggles to stay consistent with the server guard"

requirements-completed: [D-01, D-11]

# Metrics
duration: 8min
completed: 2026-07-19
---

# Phase 25 Plan 04: Icon Production Batch Group Summary

**Added the third keychain production group — icon slots batch by icon id (fixed white shell + baked accents, D-11) as a new purple "Icons" segment — while the letter batches now count by letter-slot only and assembly requires all letter AND icon parts printed; an all-letter/round store renders byte-identically.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-18T18:41:26Z
- **Completed:** 2026-07-18T18:50:03Z
- **Tasks:** 2 (both auto)
- **Files modified:** 2

## Accomplishments

- **Icon batch grouping (D-11):** `getKeychainBatches` now derives each line's structured keycap sequence (via a per-product `keycapseq` field-id lookup + `parseKeycapSequence`) and groups icon slots into a new `KeychainIconBatch` keyed by icon id only — no shape, no colour in the key. `totalQty` counts icon-slot instances (× qty); `items` is deduped per unit so `doneCount`/`allDone` track units. Sorted by label.
- **Letter count fix (Pitfall 1):** `KeychainUnit.letters` is now the LETTER-slot count (structured `letterCount`, falling back to the legacy `parts.letters`) — never total slots, never `name.length`. The BASE (`${shape}|||${base}`) and CLICKER+LETTER (`${shape}|||${clicker}|||${letter}`) grouping keys are unchanged, so `boxesOf = letters × qty` stays correct with icons excluded.
- **`markKeychainIconPrinted` action:** copied from `markKeychainPartPrinted` in shape — `requireAdmin()` first await, `UUID_RE` validation, dedupe + cap-500, sets `iconDone`, `revalidatePath("/admin/production")`.
- **Assembly guard:** `setKeychainAssembled` and the `bothPartsDone` readiness now require `iconDone` for mixed units (icon count derived from the structured sequence at tick time); `iconCount === 0` units are unaffected.
- **Admin UI:** a fourth purple "Icons" `Seg` (guarded by `icons.length > 0`) plus `IconBatchCard` (WebP image + label + total-count pill + progress + per-unit printed tick, no colour chips). `KeychainBatchesView` threads icons through — square board only (round gets `[]`). `AssemblyRow` shows an "icons" part dot for mixed units.

## Task Commits

Each task was committed atomically:

1. **Task 1: Icon batch grouping, letter-count fix, markKeychainIconPrinted, assembly guard** — `a2569b3` (feat)
2. **Task 2: Purple "Icons" production segment + icon batch cards** — `5d19b44` (feat)

## Files Created/Modified

- `src/actions/admin-production.ts` — `KeychainIconBatch` type; `slots`/`iconCount`/`iconDone` on `KeychainUnit`; structured-first sequence read + per-product `seqField` lookup (manual `inArray` hydration); icon grouping (`iconMap` by id); `icons` added to `KeychainBatches`; `markKeychainIconPrinted`; icon condition in `setKeychainAssembled` + assembly readiness.
- `src/components/admin/keychain-batches.tsx` — `View += "icons"`; `IconBatchCard`; `icons` prop/state + `onToggleIcon` on `BatchBoard`; purple Icons `Seg` (guarded); icons view; icon part dot on `AssemblyRow`; icons threaded through `KeychainBatchesView` (square-only); optimistic base/clicker toggles fold in the icon condition.

## Decisions Made

- **Per-unit dedupe within an icon group** (not in the literal RESEARCH snippet): a unit is pushed at most once per distinct icon id so `doneCount`/`allDone` count units correctly, while `totalQty` counts actual slot instances separately. This hardens against a customer picking the same icon twice in one keychain (the naive push-per-slot would double-count both `items` and `totalQty`). Grouping key remains the icon id — acceptance unaffected.
- **Icon condition folded into optimistic base/clicker toggles** so the client's `bothPartsDone` stays consistent with the server's assembly guard (otherwise ticking base+clicker on a mixed unit would optimistically flip it "ready" and the server would then reject assembly).
- **Icons segment uses the purple brand token** per UI-SPEC S5 (icons = purple), even though the Clicker+Letter segment is also purple — the plan resolved this explicitly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Icon group would double-count a repeated icon in one unit**
- **Found during:** Task 1 (icon grouping)
- **Issue:** The RESEARCH/PATTERNS reference snippet pushes a unit into `iconMap` once per matching slot. A unit with the same icon id twice (e.g. two "alien" slots) would appear twice in `items`, inflating `doneCount`/`allDone` (units) and, if reused for the count, `totalQty`.
- **Fix:** Dedupe the unit per distinct icon id (a `seen` set per unit) for `items`; compute `totalQty` separately by counting slot instances × qty. Grouping key is still the icon id.
- **Files modified:** src/actions/admin-production.ts
- **Verification:** `npx tsc --noEmit` clean; `iconMap` key is `s.id` (acceptance grep passes).
- **Committed in:** `a2569b3` (Task 1 commit)

**2. [Rule 1 - Bug] Optimistic assembly readiness ignored the icon condition**
- **Found during:** Task 2 (base/clicker toggle handlers)
- **Issue:** The existing `onToggleBase`/`onToggleClicker` set `bothPartsDone = baseDone && clickerLetterDone`. After adding the server-side icon condition, ticking base+clicker on a mixed unit would optimistically show it as ready-to-assemble while the server would reject the assemble call.
- **Fix:** Both toggle handlers now compute `bothPartsDone = baseDone && clickerLetterDone && (iconCount === 0 || iconDone)`, matching the server guard. `onToggleIcon` mirrors it.
- **Files modified:** src/components/admin/keychain-batches.tsx
- **Verification:** `npx tsc --noEmit` clean; optimistic state now matches the `setKeychainAssembled` guard.
- **Committed in:** `5d19b44` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - correctness). No new dependencies, no scope creep — both keep the new icon mechanism correct.
**Impact on plan:** Both are internal correctness hardening within the plan's own surface; behaviour matches the plan's stated intent (one icon-print entry per icon slot; mixed unit assemblable only when all parts printed).

## Issues Encountered

None — both tasks executed cleanly. `npx tsc --noEmit` exited 0 after each; `npx vitest run src/lib/keychain-parts.test.ts` = 13/13 (6 legacy + 7 structured) still green.

## Regression Safety

For an all-letter store (no icon slots): every line's `parseKeycapSequence` yields `letterCount == old letters` (or the field is absent and the legacy count is used), `iconMap` is empty, `icons: []`, and the base/clicker grouping/sort is byte-identical. The `icons.length > 0` guard hides the Icons `Seg` and view, and `KeychainBatchesView`'s single-shape path is unchanged — the board renders exactly as before.

## User Setup Required

None — no external service configuration required. (Icon production only appears once mixed square-keychain orders exist; the keycapseq ENUM/`icon_done` migration remains dev-only until its separate gated prod deploy per 25-01.)

## Next Phase Readiness

- The production floor now handles mixed letter+icon square keychain orders end to end: letters batch by colour (letter count), icons batch by id, assembly waits on all three.
- Consumes `parseKeycapSequence` (25-03), `KEYCAP_ICON_BY_ID` (25-02), and the `icon_done` column (25-01) — all present on dev.
- No prod DB change here; prod promotion still gated on running the 25-01 migration against `ninjaz_3dnp`.

---
*Phase: 25-mixed-letter-and-icon-keycaps-for-square-keychain-product*
*Completed: 2026-07-19*

## Self-Check: PASSED

All modified files exist on disk; both task commits (a2569b3, 5d19b44) present in git history. `npx tsc --noEmit` exits 0; `npx vitest run src/lib/keychain-parts.test.ts` = 13/13.
