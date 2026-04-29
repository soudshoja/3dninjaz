---
phase: 18-colour-management
plan: 07
subsystem: ui
tags: [variants, colours, pdp, accessibility, swatch, react]

# Dependency graph
requires:
  - phase: 18-colour-management
    provides: "HydratedOptionValue.colorId surfaced in public type; pov.swatchHex snapshotted at attach time (Plan 18-06); admin/customer query split (Plan 18-01) ensures customer hydration never pulls colors.code, previous_hex, family_type, or family_subtype"
  - phase: 17-variant-enhancements-legacy-cleanup
    provides: "Phase 17 OOS hardening on swatch buttons (disabled + aria-disabled + tabIndex=-1 + title); hover-image-preview contract (onPreviewChange + matchMedia hover-capable gate); reactivity contract AD-06 (Pattern A/B; no router.refresh in mutation paths — Plan 18-07 mutates nothing on PDP, so contract is preserved by inaction)"
  - phase: 16-product-variants
    provides: "variant-selector.tsx auto-detect Colour-style options when ≥1 value has swatchHex (line 188 detection); 6-axis cap; pill rendering for non-Colour options (untouched by Plan 18-07)"
provides:
  - "Always-visible 12px colour name caption rendered directly under each PDP swatch (no hover required) — REQ-7 acceptance closed for the customer-facing render"
  - "Customer-facing audit confirmation: zero references to admin-only colour fields (code, previous_hex, family_type, family_subtype) anywhere in src/app/(store)/ or src/components/store/"
  - "Vertical-flex swatch wrapper pattern (80px outer width, 48x48 button preserved, 12px caption below) reusable for any future swatch grids in the storefront"
affects:
  - "Phase 18 Plan 08 (/shop sidebar colour chip filter) — chip caption colour treatment can mirror this caption's font/weight rules"
  - "Future PDP UX phases — caption-always-visible micro-typography established as the storefront swatch convention"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PDP swatch caption: 12px Chakra_Petch via var(--font-body); weight 500 default / 700 + BRAND.ink when selected; line-through + zinc-400 when OOS; max-w-[80px] truncate"
    - "Swatch outer wrapper = vertical flex column (gap-1) holding the existing button on top and a sibling caption span below — keeps 48x48 tap target intact while making the colour name always visible"
    - "Customer-facing surfaces (src/app/(store)/, src/components/store/) NEVER reference colors.code, previous_hex, family_type, or family_subtype — enforced by the public/admin query split shipped in Plan 18-01 (getColourPublic vs getColourAdmin)"

key-files:
  created: []
  modified:
    - "src/components/store/variant-selector.tsx — refactored the {isColorOption ? (...)} branch (formerly lines 201-267) to use a vertical flex wrapper with a 32px hex circle on top and an always-visible 12px caption below; grid gap tightened from gap-2 (8px) to gap-3 (12px) per UI-SPEC §Surface 4 to compensate for the extra caption height; pill render branch (Size, Material, Part, etc.) untouched"

key-decisions:
  - "Caption rendered as a sibling span outside the <button> (inside an outer wrapper div), NOT inside the button itself — keeps the button's 48x48 tap target as a pure swatch hit area, which avoids inflating the click footprint and matches existing tap-target precedent (Phase 2 D-04)"
  - "Caption is aria-hidden because aria-label on the button already conveys the colour name to screen readers — duplicating it via the visible caption would cause double-announcement on each swatch in WCAG-strict assistive tech"
  - "Outer wrapper width fixed at 80px so caption max-width matches wrapper width — prevents row-height jitter when one swatch has a 12-character name and its neighbour has a 4-character name; long names truncate with ellipsis and full text remains in title + aria-label"
  - "No new dependencies: reused existing var(--font-body) CSS variable (Chakra_Petch, declared in src/app/layout.tsx), existing var(--color-brand-ink) custom property, existing isSelected/isHovered/available locals"

patterns-established:
  - "Always-visible swatch caption: the colour name is part of the visible UI on PDP, never hover-conditional. This is now the storefront swatch convention and should be carried through to /shop chip rendering (Plan 18-08) for visual continuity."
  - "Customer-side admin-field audit grep: scan src/app/(store)/ and src/components/store/ for admin-only colour tokens (code, previous_hex, family_type, family_subtype) on every Phase 18 plan touching the customer surface. Run again at end of Plan 18-08."

requirements-completed: [REQ-7]

# Metrics
duration: ~5min
completed: 2026-04-26
---

# Phase 18 Plan 07: PDP Swatch Always-Visible Name Caption Summary

**PDP variant selector renders the colour name as a 12px caption directly under every swatch chip, no hover required — REQ-7 customer-facing acceptance closed.**

## Performance

- **Duration:** ~2 minutes (108 seconds wall-clock from plan start to final commit; very small focused diff)
- **Started:** 2026-04-26T07:18:54Z
- **Completed:** 2026-04-26T07:20:42Z
- **Tasks:** 2 (1 code refactor + 1 verification audit)
- **Files modified:** 1

## Accomplishments

- Customer name visibility: every Colour-style option on PDP now prints the colour name in 12px Chakra_Petch directly under each swatch chip, always visible (REQ-7 was the single most visible customer-facing change in Phase 18)
- Selection feedback: the caption boldens to weight 700 and shifts to BRAND.ink (`#0B1020`) when a swatch is the active selection, making selection state legible at a glance from across the room
- OOS clarity: out-of-stock colours show a line-through caption in zinc-400, reinforcing the existing OOS diagonal-line overlay on the chip itself
- Layout stability: 80px wrapper width + 80px caption max-width with truncate ensures long names ("Bambu Galaxy Black", "Polymaker PolyTerra Cotton White") don't shove neighbouring chips around — full name remains in the button's title and aria-label
- Admin field hygiene: full grep audit confirms zero references to `code`, `previous_hex`, `family_type`, `family_subtype` anywhere in `src/app/(store)/` or `src/components/store/` — the Plan 18-01 public/admin query split holds

## Task Commits

Each task committed atomically:

1. **Task 1: Refactor swatch render to always-visible name caption** — `46ddcff` (feat)
2. **Task 2: Customer-side admin-field audit** — verify-only (no file edits; results recorded in this SUMMARY)

**Plan metadata commit:** (this SUMMARY + STATE.md + ROADMAP.md update — committed as the final docs commit)

## Files Created/Modified

- `src/components/store/variant-selector.tsx` — refactored the `{isColorOption ? (...)}` branch. Changes:
  - Outer container: `gap-2` → `gap-3` (8px → 12px) per UI-SPEC §Surface 4 grid spacing rule
  - Each swatch is now wrapped in `<div className="flex flex-col items-center gap-1" style={{ width: 80 }}>` — vertical column, 80px wide, 4px gap between button and caption
  - Inner button preserves the 48×48 minimum tap target, the 32×32 hex circle child, the OOS diagonal-line overlay, the hover/selected/focus borders, the hover-preview `onMouseEnter`/`onMouseLeave` handlers, and the existing aria-label / title / aria-pressed / aria-disabled / tabIndex props
  - New sibling `<span>` below the button renders `val.value` with: `fontFamily: var(--font-body)`, `fontSize: 12`, `lineHeight: 1.2`, `fontWeight: isSelected ? 700 : 500`, colour `#A1A1AA` (OOS) / `var(--color-brand-ink)` (selected) / `#3F3F46` (default), `textDecoration: line-through` when OOS, `whiteSpace: nowrap`, `overflow: hidden`, `textOverflow: ellipsis`, Tailwind `text-center max-w-[80px] truncate`
  - Caption is `aria-hidden` to avoid double-announcement (the button's `aria-label` already names the colour for AT)
  - Pill render branch (the `else` branch for non-Colour options) untouched

## Decisions Made

1. **Caption is a sibling span, NOT a child of the button** — keeps the button's 48×48 hit area pure, avoids inflating the click footprint, and lets the caption participate in the wrapper's vertical-flex layout independently. The button still owns all interactivity; the caption is a passive label.
2. **Caption is `aria-hidden`** — the button already has `aria-label="${val.value}${OOS suffix}"`, so making the caption part of the accessibility tree would cause screen readers to announce the colour name twice per chip. Visible to sighted users; semantically owned by the button for AT.
3. **80px fixed wrapper width** — locks layout stability across colour names of widely varying length. Without a fixed wrapper width, a row of swatches with mixed-length names (e.g. "Red" next to "Galaxy Black Polymaker Translucent") would have wildly different visual rhythm; this is what UI-SPEC §Surface 4's `max-width 80px` constraint is designed to prevent.
4. **No `npm run build`** — followed the plan-level constraint: pre-existing CSS issue makes `npm run build` unreliable as a gate; only `npx tsc --noEmit` was used for type verification (passed cleanly).

## Deviations from Plan

None — plan executed exactly as written. The plan's `<action>` block provided the full refactored JSX verbatim; the executor copied it in, preserving every existing local-scope binding (`available`, `isSelected`, `isHovered`), every existing handler (`handleSelect`, `handleHoverEnter`, `handleHoverLeave`), and every existing aria/title prop.

## Audit Results (Task 2)

Grep run on `src/app/(store)/` and `src/components/store/` for the admin-only colour tokens:

| Token | Matches | Notes |
|-------|---------|-------|
| `previous_hex` / `previousHex` | 0 | Confirmed clean |
| `family_type` / `familyType` | 0 | Confirmed clean |
| `family_subtype` / `familySubtype` | 0 | Confirmed clean |
| `colors.code` / `color.code` / `colour.code` | 0 | Confirmed clean |
| `.code` plain | 3 in `coupon-apply.tsx` only | Unrelated domain — these are coupon `applied.code` references (customer-applied promo codes), not `colors.code`. Coupon codes are explicitly customer-facing by design (customers type them in). False-positive on the literal grep, semantically clean. |
| `swatchHex` reads in variant-selector.tsx | 3 | Component still reads the snapshotted hex from `pov.swatchHex` (the public hydration field). No separate `colors.hex` lookup. |

Customer hydration paths (`src/lib/catalog.ts` and `src/lib/variants.ts`) project only `value`, `swatchHex`, and `colorId` from `product_option_values` — no admin colour metadata flows into customer surfaces. The Plan 18-01 public/admin query split (`getColourPublic` vs `getColourAdmin`) holds.

**Verdict:** REQ-7 acceptance criterion ("`code` does not appear in the rendered HTML") satisfied for all admin-only colour fields, not just `code`.

## Verification

- `npx tsc --noEmit` — exit 0 (no errors, no output)
- `grep -c 'max-w-\[80px\]' src/components/store/variant-selector.tsx` → 1 (caption width cap present)
- `grep -c 'flex flex-col items-center' src/components/store/variant-selector.tsx` → 1 (vertical wrapper present)
- `grep -c 'fontWeight: isSelected ? 700 : 500' src/components/store/variant-selector.tsx` → 1 (UI-SPEC weight rule present)
- `grep -c 'textDecoration:' src/components/store/variant-selector.tsx` → 2 (caption line-through + existing pill OOS line-through — both expected)
- `grep -c 'var(--font-body)' src/components/store/variant-selector.tsx` → 2 (caption font + existing usage — both expected)
- `grep -c 'flex flex-wrap gap-3' src/components/store/variant-selector.tsx` → 1 (grid gap tightened to 12px)
- `grep -cE '\.code|previousHex|family_type|family_subtype' src/components/store/variant-selector.tsx` → 0 (no admin field references in this component)

## Manual Visual Smoke Test (post-deploy)

This is a frontend render-only change with no automated visual coverage in the project today. After this plan deploys to `https://app.3dninjaz.com/`, a human verifier should:

1. Open a product with a Colour option (e.g. any product where the variant editor was used to attach Bambu/Polymaker colours via the Plan 18-06 picker). Suggested test products: any active product whose `product_option_values.colorId` is non-null on ≥1 row.
2. Confirm: each swatch has the colour name printed directly underneath in a 12px Chakra_Petch caption — visible immediately, no hover required.
3. Tap a swatch. Confirm the caption for that swatch boldens to 700 and turns ink-black, while the previously-selected caption returns to the regular 500-weight zinc-700.
4. Confirm: price, stock indicator, and PDP image swap on selection (Phase 17 reactivity contract still fires — this plan didn't touch the contract; regression check only).
5. Confirm: hovering a swatch on a desktop viewport with `(hover: hover)` still triggers the variant image preview (Phase 17 Fix 3 hover-image-preview).
6. Resize the viewport to 375×667 (iPhone SE). Confirm: swatches wrap into 3-per-row at most, captions truncate with ellipsis if a colour name exceeds 80px, tap targets remain ≥48px.
7. If the product has any OOS Colour value: confirm the caption is line-through and zinc-400; the chip itself still has the diagonal-line overlay; the button is keyboard-skipped (`tabIndex=-1`).
8. Inspect the rendered HTML in DevTools. Confirm: zero occurrences of `code`, `previous_hex`, `previousHex`, `family_type`, `familyType`, `family_subtype`, `familySubtype` anywhere in the variant-selector subtree.

## Issues Encountered

None.

## Next Phase Readiness

- **Plan 18-08 (/shop sidebar colour filter)** is unblocked. The customer-facing render contract for colour visuals is now complete: PDP shows hex circle + always-visible name; /shop will show hex circle + name in chip form (D-15 chip layout). The shared visual language is consistent.
- **REQ-7 closed** — `getColourPublic` projection contract verified end-to-end via grep audit.
- **No regressions to Phase 17 reactivity contract** — Plan 18-07 mutations are zero on PDP; only the render path changed. AD-06 Pattern A/B contract preserved by inaction.

## Self-Check: PASSED

- `src/components/store/variant-selector.tsx` — FOUND
- Commit `46ddcff` — FOUND in git log
- `.planning/phases/18-colour-management/18-07-SUMMARY.md` — FOUND

---
*Phase: 18-colour-management*
*Completed: 2026-04-26*
