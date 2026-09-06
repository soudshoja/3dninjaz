---
phase: 25-mixed-letter-and-icon-keycaps-for-square-keychain-product
plan: 02
subsystem: ui
tags: [keycap-icons, assets, webp, sharp, 3mf, catalog, drizzle-adjacent]

# Dependency graph
requires:
  - phase: 25-01
    provides: keycapseq config contract (fieldType ENUM widened, KeycapSeqConfig schema, allowedIconIds concept)
provides:
  - 34 committed keycap-icon WebP assets under public/icons/keycaps/<id>.webp
  - src/lib/keycap-icons.ts static catalog module (KEYCAP_ICONS + KEYCAP_ICON_BY_ID)
  - scripts/extract-keycap-icons.ts one-off dev-machine extraction pipeline (top_N.png -> WebP)
  - human-verified top_<N> -> catalog-id mapping
affects: [admin icon allow-list picker, storefront icon picker, keychain live preview, production batch labels]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static id->asset catalog module keyed by kebab-case id, imageUrl = /icons/keycaps/<id>.webp"
    - "One-off 3mf asset extraction: shell out to Info-ZIP unzip (no npm zip dep) + sharp WebP encode"

key-files:
  created:
    - src/lib/keycap-icons.ts
    - scripts/extract-keycap-icons.ts
    - public/icons/keycaps/*.webp (34 files)
  modified:
    - .gitignore (ignore transient _staging/)

key-decisions:
  - "top_<N> plate order matched the CONTEXT catalog order 1:1 (human-verified via montage), so top_N -> catalog entry N"
  - "Render #7 confirmed as a spotted green ball (not a Yoshi egg) -> id green-ball"
  - "Neutral ids/labels only; no franchise/licence/trademark fields or grouping (D-08)"

patterns-established:
  - "Icon catalog module shape: { id, label, imageUrl, accentColors? } + KEYCAP_ICON_BY_ID lookup"

requirements-completed: [D-07, D-08]

# Metrics
duration: ~15min (Task 3 continuation)
completed: 2026-07-19
---

# Phase 25 Plan 02: Keycap Icon Asset Pipeline Summary

**34 top-down keycap renders extracted from the source 3mf set, human-verified against the catalog, committed as WebP under `public/icons/keycaps/`, and exposed via the static `KEYCAP_ICONS` catalog module.**

## Performance

- **Duration:** ~15 min (Task 3 continuation after human-verify checkpoint)
- **Completed:** 2026-07-19
- **Tasks:** 3 (Task 1 extract + Task 2 checkpoint + Task 3 rename/catalog)
- **Files modified:** 36 (34 WebP + keycap-icons.ts + extract script from Task 1)

## Accomplishments
- 34 catalog-named keycap WebP assets committed at the top level of `public/icons/keycaps/`
- `src/lib/keycap-icons.ts` ships `KEYCAP_ICONS` (34 entries) + `KEYCAP_ICON_BY_ID` lookup, type-clean
- Human-verified plate->catalog mapping locked in; transient `_staging/` removed (gitignored, never committed)

## Task Commits

1. **Task 1: extract 34 top_N.png renders -> staged WebP + contact sheet** - `ae8d544` (feat) *(prior agent run)*
2. **Task 2: human-verify plate->catalog mapping** - checkpoint (approved; no commit)
3. **Task 3: rename staged renders to catalog ids + write keycap-icons.ts** - `aa67ee9` (feat)

**Plan metadata:** _(this SUMMARY + STATE/ROADMAP)_

## Confirmed top_<N> -> id Mapping

Plate order matched the CONTEXT catalog order exactly (verified by eye against montage_a = top_1–17, montage_b = top_18–34):

| N | id | label | N | id | label |
|---|----|-------|---|----|-------|
| 1 | alien | Alien | 18 | holly-wreath | Holly Wreath |
| 2 | skull | Skull | 19 | hazard | Hazard |
| 3 | game-controller | Game Controller | 20 | captain-america | Captain America |
| 4 | ninja-face | Ninja Face | 21 | spider-man | Spider-Man |
| 5 | wifi | Wifi Signal | 22 | iron-man | Iron Man |
| 6 | tennis-ball | Tennis Ball | 23 | avengers | Avengers |
| 7 | green-ball | Green Ball | 24 | black-panther | Black Panther |
| 8 | baseball | Baseball | 25 | wonder-woman | Wonder Woman |
| 9 | pixel-heart | Pixel Heart | 26 | superman | Superman |
| 10 | christmas-tree | Christmas Tree | 27 | batman | Batman |
| 11 | snowflake | Snowflake | 28 | luigi | Luigi |
| 12 | gift | Gift | 29 | mario | Mario |
| 13 | santa-hat | Santa Hat | 30 | mario-star | Power Star |
| 14 | reindeer | Reindeer | 31 | golf-ball | Golf Ball |
| 15 | snowman | Snowman | 32 | candy-cane | Candy Cane |
| 16 | bell | Bell | 33 | thor-hammer | Thor Hammer |
| 17 | stocking | Stocking | 34 | hawkeye | Hawkeye |

**Label correction at checkpoint:** render #7 confirmed as a spotted **green ball** (not a Yoshi egg) -> `green-ball`.

## Files Created/Modified
- `src/lib/keycap-icons.ts` - Static 34-entry catalog + `KEYCAP_ICON_BY_ID` lookup
- `public/icons/keycaps/*.webp` - 34 committed keycap render assets (catalog-named)
- `scripts/extract-keycap-icons.ts` - One-off dev-machine 3mf extraction (Task 1, committed `ae8d544`)

## Decisions Made
- **Plate order == catalog order:** montage inspection confirmed a clean 1:1, so no reordering was needed — `top_N` -> catalog entry `N`.
- **Neutral catalog only (D-08):** ids/labels carry no franchise/licence/trademark fields or grouping; "Captain America" etc. are plain display labels.

## Deviations from Plan
None - plan executed exactly as written. (One acceptance criterion phrased as `grep -c 'imageUrl:' === 34` counts 35 because the `KeycapIcon` type declaration line also contains `imageUrl:`; the meaningful count — catalog entries `imageUrl: "/icons/keycaps/` — is exactly 34, and `tsc --noEmit` passes.)

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The icon catalog is now available for the downstream surfaces (admin allow-list picker, storefront icon picker, live preview, production batch labels) to import `KEYCAP_ICONS` / `KEYCAP_ICON_BY_ID`.
- No blockers.

## Self-Check: PASSED

---
*Phase: 25-mixed-letter-and-icon-keycaps-for-square-keychain-product*
*Completed: 2026-07-19*
