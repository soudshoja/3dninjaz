---
phase: 25-mixed-letter-and-icon-keycaps-for-square-keychain-product
plan: 07
subsystem: ui
tags: [react, keychain, keycaps, icons, preview, pricing, storefront, claymorphism]

# Dependency graph
requires:
  - phase: 25-01
    provides: KeycapSlot type, ensureKeycapSequence, lookupTierPriceBySlotCount, buildKeycapSequenceSummary
  - phase: 25-02
    provides: KEYCAP_ICONS / KEYCAP_ICON_BY_ID static catalog + committed WebP assets
  - phase: 25-06
    provides: KeycapSeqField builder writing the JSON sequence into values[fieldId]
provides:
  - "Slot-aware KeychainPreview — renders letter glyph cubes OR icon WebP images on a fixed white shell, all-letters pixel-identical to legacy"
  - "keycapseq PDP wiring in configurable-product-view.tsx — price/over-cap/summary/preview all key off TOTAL slot count (D-12)"
  - "Mixed computedSummary on keycapseq lines via buildKeycapSequenceSummary + auto colour tail"
affects: [25-08-server-capture, 25-09-dev-smoke]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional slots?: KeycapSlot[] render model on KeychainPreview — undefined = legacy text path (byte-identical), provided = per-slot mixed render"
    - "Icon slots reuse identical cube shell/border/shadow geometry; only inner content swaps (WebP <img> vs CSS glyph) on a fixed white #FFFFFF shell (D-04)"
    - "keycapseq unit field priced/capped by decoded slot count, not JSON string length"

key-files:
  created: []
  modified:
    - src/components/store/keychain-preview.tsx
    - src/components/store/configurable-product-view.tsx

key-decisions:
  - "slots prop is optional; when undefined the legacy text-derived render path is byte-identical (pixel-parity guarantee preserved)"
  - "Icon cube background = fixed white #FFFFFF (customer colours never applied to icons, D-04); letter cube keeps baseHex/clickerHex/letterHex"
  - "keycapseq handled as a parallel path (keycapseqFieldId) rather than folding it into unitFieldId (which stays text/number-only), keeping text/select/number branches untouched"
  - "buildSummary emits only the mixed keycap format; the Base/Clicker/Letter colour tail is appended automatically by the existing colour-field branches (correct position order)"
  - "Over-cap chip + CTA label read 'Too many keycaps' for keycapseq (plan D-12 / UI-SPEC), 'Too many characters' for text fields"

patterns-established:
  - "Pixel-parity extension pattern: gate all new render behaviour behind an optional prop that defaults to the legacy code path so existing output is provably unchanged"

requirements-completed: [D-04, D-10, D-12]

# Metrics
duration: 15min
completed: 2026-07-19
---

# Phase 25 Plan 07: Mixed Preview + Slot-Count PDP Wiring Summary

**Square-keychain PDP now renders the ordered letter+icon sequence in the live preview (letter glyph cubes / icon WebP on a fixed white shell) and prices, caps, and summarises the keycapseq line by total slot count — with the all-letter preview path kept byte-for-byte identical to today.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-19 (approx.)
- **Completed:** 2026-07-19
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Extended `KeychainPreview` with an optional `slots?: KeycapSlot[]` render model. When omitted, the component uses the legacy text-derived `chars` path — provably byte-identical (the only style change, the icon-white-shell background, evaluates to `baseHex` when no icons are present). When provided, one cube renders per slot in order.
- Letter slots reuse the exact 3-layer cube (shell + inset clicker face + raised glyph, chosen colours). Icon slots reuse the identical shell/border/shadow but render the icon's WebP `<img>` (`object-fit: contain`, `alt=""`) on a fixed white `#FFFFFF` shell (D-04) — no customer colours.
- Container `aria-label` now summarises the mixed sequence (e.g. "Preview: S, O, Alien, Skull") when slots are provided; falls back to the legacy label otherwise.
- Wired the `keycapseq` unit field in `configurable-product-view.tsx`: price via `lookupTierPriceBySlotCount(priceTiers, slots.length)` (D-12), over-cap by `keycapSlots.length > maxUnitCount`, `maxUnitCount` authoritative with fallback to `config.maxSlots`, and a mixed `computedSummary` via `buildKeycapSequenceSummary` (colour tail auto-appended by the existing colour branches).
- Both `KeychainPreview` call sites (hero + mobile sticky strip) consume the same slot model. Over-cap chip and CTA read "Too many keycaps" for keycapseq. Text/select/number paths are untouched.

## Task Commits

1. **Task 1: Extend KeychainPreview with per-slot mixed model (all-letters pixel-parity)** - `9efda9b` (feat)
2. **Task 2: Wire keycapseq price/over-cap/summary/preview by slot count** - `bced263` (feat)

## Files Created/Modified

- `src/components/store/keychain-preview.tsx` - Added optional `slots` prop + `RenderSlot` model, icon-cube branch (WebP on white shell), mixed aria-label; legacy text path preserved byte-identical.
- `src/components/store/configurable-product-view.tsx` - keycapseq field detection + `keycapSlots` memo, slot-count price/over-cap/maxLength, `buildSummary` keycapseq branch + module `ICON_LABEL_BY_ID`, `isKeycapseq` PricePill/CTA label, `slots=` on both preview call sites.

## Decisions Made

- **Optional-prop gate for pixel-parity:** new render behaviour lives behind `slots !== undefined`, and non-keycapseq products pass `undefined`, so the legacy render is unchanged by construction.
- **keycapseq as a parallel path:** left `unitFieldId` matching text/number only; keycapseq gets its own `keycapseqFieldId` + `keycapSlots` so no existing branch shifts behaviour.
- **Fixed white icon shell:** icon cube background is `#FFFFFF`; the icon's baked accent colours come from the committed WebP, never from customer colour fields (D-04).
- **Auto colour tail:** the mixed summary emits only the sequence portion; Base/Clicker/Letter parts are appended by the colour-field branches that follow by position.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Customer-visible loop is closed: the preview reflects the mixed sequence and the price/summary snapshot are computed from slot count.
- Ready for **25-08** — server-side re-derive of price/summary/weight from the JSON sequence at capture (paypal / admin-pos / whatsapp-order); this plan's client snapshot is display-only and re-derived authoritatively there (threat register T-25-07-01/02 accepted).
- Ready for **25-09** — dev smoke of the full builder + preview + pricing interaction.
- Note: the `+ Icon` affordance and icon slots only appear once an admin populates `allowedIconIds` on the seeded square-keychain keycapseq field (admin allow-list UI is a separate plan). Until then the builder + preview degrade to letter-only, and the all-letter preview is pixel-identical to today.

---
*Phase: 25-mixed-letter-and-icon-keycaps-for-square-keychain-product*
*Completed: 2026-07-19*

## Self-Check: PASSED

- Files verified on disk: `keychain-preview.tsx`, `configurable-product-view.tsx`, `25-07-SUMMARY.md`
- Commits verified in git history: `9efda9b` (Task 1), `bced263` (Task 2)
- `npx tsc --noEmit` exits 0 after both tasks
- Pixel-parity: all new preview behaviour gated behind `slots !== undefined`; non-keycapseq products pass `undefined` → legacy render path unchanged
