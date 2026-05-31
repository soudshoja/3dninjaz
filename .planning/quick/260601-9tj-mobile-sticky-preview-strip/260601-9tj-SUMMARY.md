---
quick_id: 260601-9tj
slug: mobile-sticky-preview-strip
description: Mobile-only sticky live-preview strip on configurable/keychain PDP
date: 2026-06-01
status: complete
---

# Summary — 260601-9tj Mobile sticky live-preview strip

## What changed

Added a **mobile-only sticky live-preview strip** to the configurable/keychain PDP
so customers no longer scroll up (preview) ↔ down (form) repeatedly while
personalising. The preview now follows them.

### Files
- `src/components/store/configurable-product-view.tsx`
  - Inserted a `lg:hidden sticky top-16 z-30` strip as the first child of the
    right-hand info/form column.
  - Gated on `touched && product.productType !== "vending"` — it appears only once
    the customer starts editing, and is skipped for vending (whose 500×800
    illustration can't compress into a strip).
  - Renders a second, **shrunk** `KeychainPreview` bound to the SAME live state
    (`textValue` / `baseHex` / `clickerHex` / `letterHex` / `maxLength`), so the
    mini preview and the hero preview update together.
  - Styling: glassy white (`backdrop-blur`), green-accent border + drop shadow, a
    compact "✦ Live" brand pill on the left, preview centered on the right.
- `src/app/globals.css`
  - Added `@keyframes preview-strip-in` + `.preview-strip-in` (fade + slight
    slide-down entrance); added to the `prefers-reduced-motion` null-out block.

### Why top-16 / z-30
Site-nav is `sticky top-0 z-40` (~64px on mobile), so the strip pins at `top-16`
(64px) just beneath it, at `z-30` (below nav, above page content). The bottom
Add-to-Bag bar is `fixed … z-40` at the opposite edge — no conflict.

## Logic untouched
Pricing, `canAdd`, cart wiring, and the first-touch `handleTouch` behaviour are
unchanged. Desktop is untouched (it already has a `lg:sticky` side gallery).

## Verification
- `tsc --noEmit`: 0 real errors in touched files (only pre-existing TS6053
  "file not found" noise from OneDrive-hidden files + unbuilt `.next`).
- Visual run BLOCKED locally: `next dev` (turbopack) crashes with
  `The cloud file provider is not running (os error 362)` because the repo is
  under OneDrive and `.next` writes fail — the documented OneDrive issue. Visual
  before/after should be confirmed on the dev deploy (or a non-OneDrive clone).

## Follow-up (deferred)
- The one-time first-touch auto-scroll in `handleTouch` (scrolls to the hero
  preview on first keystroke) is now slightly redundant given the sticky strip.
  If it feels jumpy on mobile, suppress it on small screens — small, separate change.
