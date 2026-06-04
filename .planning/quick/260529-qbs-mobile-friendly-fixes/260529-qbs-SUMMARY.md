---
phase: 260529-qbs
plan: "01"
subsystem: storefront-mobile-ux
tags: [mobile, tap-targets, ios-zoom, sticky-cta, auth]
dependency_graph:
  requires: []
  provides: [mobile-friendly-storefront, ios-no-zoom-footer, sticky-pdp-cta, 44px-tap-targets, 48px-auth-inputs]
  affects: [footer, product-detail, product-gallery, configurable-image-gallery, social-links, site-footer, auth-forms]
tech_stack:
  added: []
  patterns: [mobile-first tailwind class additions, sticky fixed bar pattern from SimpleProductView]
key_files:
  created: []
  modified:
    - src/components/store/footer-subscribe-form.tsx
    - src/components/store/product-detail.tsx
    - src/components/store/product-gallery.tsx
    - src/components/store/configurable-image-gallery.tsx
    - src/components/store/social-links.tsx
    - src/components/store/site-footer.tsx
    - src/components/auth/unified-auth-form.tsx
    - src/components/auth/login-form.tsx
    - src/components/auth/register-form.tsx
decisions:
  - "Sticky bar re-uses AddToBagButton second instance (same props as in-page button) rather than a hand-rolled button — preserves cart wiring, disabled state, and 'Pick a variant' label"
  - "Gallery dots: 44x44 transparent button hit-zone wraps original small visual span — no layout change, gap-1.5 preserved"
  - "Auth: replace_all h-10 -> h-12 on all Input + submit Button instances across 3 auth files; no font-size changes"
metrics:
  duration: "~12 minutes"
  completed: "2026-05-29"
  tasks_completed: 3
  files_modified: 9
---

# Phase 260529-qbs Plan 01: Mobile-Friendly Fixes Summary

**One-liner:** Five confirmed mobile UX gaps fixed — iOS zoom on footer email, missing sticky PDP CTA on stocked products, sub-44px gallery dot targets, sub-44px social/footer contact tap areas, and sub-48px auth input heights.

## Tasks Completed

| # | Fix | File(s) | Commit |
|---|-----|---------|--------|
| 1 | Fix 1 — Footer email 16px (text-base) to prevent iOS zoom | footer-subscribe-form.tsx | a392e78 |
| 2 | Fix 2 — Sticky add-to-bag bar on standard stocked PDP | product-detail.tsx | d97abfb |
| 3 | Fix 3 — 44px hit-zones for gallery dots (both galleries) | product-gallery.tsx, configurable-image-gallery.tsx | 9d90764 |
| 4 | Fix 4 — 44px tap targets for social links + footer contact links | social-links.tsx, site-footer.tsx | f50ad3b |
| 5 | Fix 5 — 48px auth inputs + 44px tab triggers | unified-auth-form.tsx, login-form.tsx, register-form.tsx | e188d9a |

## Changes Made

### Fix 1 — Footer newsletter email 16px (QBS-01)
`footer-subscribe-form.tsx` line ~118: `text-sm` → `text-base` on the email `<input>`. iOS Safari zooms on focus when font-size < 16px; `text-base` = 16px stops the zoom.

### Fix 2 — Sticky stocked PDP CTA (QBS-02)
`product-detail.tsx`: Ported the `lg:hidden fixed bottom-0` sticky bar pattern from `SimpleProductView`. The bar renders a second `<AddToBagButton>` with identical props to the in-page one, guarded by `!onAddToOrder` so the POS/admin flow is unaffected. A `lg:hidden h-24` spacer prevents content overlap on mobile.

### Fix 3 — Gallery dot 44x44 hit-zones (QBS-03)
Both `product-gallery.tsx` and `configurable-image-gallery.tsx`: each dot `<button>` is now a 44x44 transparent centered container (`style={{ width: 44, height: 44 }}`); the visual dot moved to an inner `<span aria-hidden="true">` that keeps the original small dimensions and colour. `onClick` and `aria-label` preserved on the outer button.

### Fix 4 — Social + footer contact tap targets (QBS-04)
`social-links.tsx`: Added `min-h-[44px] min-w-[44px]` to the default `itemClassName`. The inline `style={{ width: size, height: size }}` still sets the icon box; the min-h/w floor guarantees the tap target floor.
`site-footer.tsx`: Added `min-h-[44px] px-1` to both inline contact `<a>` tags (email + phone). The SVG and text content are unchanged.

### Fix 5 — Auth input heights + tab triggers (QBS-05)
All three auth files: `h-10` → `h-12` on every `<Input>` and submit `<Button>` (48px height). No font-size changes.
`unified-auth-form.tsx` TabBar: className updated from `"flex-1 pb-3 pt-1 ..."` to `"flex-1 min-h-[44px] flex items-center justify-center pb-3 pt-1 ..."` so the tab trigger hit-zone is ≥44px while the label stays centred.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

`npx tsc --noEmit` — PASSED (no output, exit 0)

No admin files touched (`src/app/(admin)/`, `src/components/admin/` not in git diff).

## Known Stubs

None.

## Threat Flags

None — changes are presentation-only class additions/swaps with no network endpoints, auth paths, or schema changes.

## Self-Check: PASSED

Files modified verified present; all 5 commits confirmed in git log.
