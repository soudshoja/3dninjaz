---
phase: 02-storefront-cart
plan: 03
status: complete
subsystem: product-detail-page
tags: [pdp, gallery, size-selector, size-guide, client-state, mobile-first]
requires:
  - Plan 02-01 (BRAND tokens, formatMYR, priceRangeMYR, CatalogProduct type, getActiveProductBySlug)
  - Phase 1 Plan 03 (products/productVariants tables + variant dimensions)
provides:
  - src/components/store/product-gallery.tsx: main image + thumbnail swap client component
  - src/components/store/size-selector.tsx: radiogroup pill chips with per-variant price
  - src/components/store/size-guide.tsx: dimension table (width × height × depth) per variant
  - src/components/store/add-to-bag-button.tsx: stub CTA (console.log; Plan 04 replaces body)
  - src/components/store/product-detail.tsx: stateful PDP composition (owns selectedSize)
  - src/app/(store)/products/[slug]/page.tsx: server-component PDP route with generateMetadata + notFound()
affects:
  - Plan 02-04 REPLACES add-to-bag-button.tsx to wire Zustand addItem + drawer open
tech-stack:
  patterns:
    - useMemo for deterministic S→M→L variant sort
    - Live price pill: priceRangeMYR until a size is picked, formatMYR(variant.price) after
    - Marshal product to a narrow client-shape object at the server boundary — client doesn't receive Dates or unused fields
    - Next 15 App Router Promise<{ slug }> params + generateMetadata({ params })
    - Inactive product filter lives in getActiveProductBySlug — PDP never needs to re-check
key-files:
  created:
    - src/components/store/product-gallery.tsx
    - src/components/store/size-selector.tsx
    - src/components/store/size-guide.tsx
    - src/components/store/add-to-bag-button.tsx
    - src/components/store/product-detail.tsx
    - src/app/(store)/products/[slug]/page.tsx
decisions:
  - SizeSelector uses native ARIA radiogroup/radio (not custom aria-pressed) so assistive tech announces the group + active selection correctly without custom JS.
  - AddToBagButton stub preserves the exact props contract Plan 02-04 expects (selectedVariant/productId/productSlug/productName/productImage) so Plan 04 only has to rewrite the onClick handler body.
  - Price pill shows priceRangeMYR (e.g. "RM 18.00 - RM 32.00") until a size is picked, then snaps to the single variant price on select — clearer than staying on a range.
  - ProductDetail is a client component even though much of it could be server-rendered; the selected-size interactivity needs React state and splitting it further would duplicate the layout grid across a server skeleton + client island.
  - SizeGuide rendered inside the client component but as a pure presentational child — it keeps its "server-safe" shape so future refactors can hoist it into a server layout if needed.
metrics:
  tasks_completed: 2
  commits: 2
---

# Phase 02 Plan 03: Product Detail Page (PDP) Summary

One-liner: /products/[slug] now renders a full product experience — gallery with thumbnail swap, category crumb, live-updating price pill, description, three-pill size selector with per-variant prices, Add-to-bag button (disabled until size picked), lead-time notice, material section, and dimension size guide. Inactive/bogus slugs 404 via `getActiveProductBySlug` + `notFound()`.

## What Was Built

### Primitive components (Task 1)
- `src/components/store/product-gallery.tsx` (client) — main 1:1 priority-loaded image with cream-blue tinted background, horizontal thumbnail strip that swaps on click. `aria-current` marks the active thumbnail. 48px min-h tap targets.
- `src/components/store/size-selector.tsx` (client) — three chunky pill chips (S/M/L), each with size letter (Russo One 3xl) + size name + per-variant price via `formatMYR`. Selected chip: accent-colored bg, white text, lifted shadow. Unselected: white bg, ink border. Uses `role="radiogroup"` + per-button `role="radio"` + `aria-checked`. 60px min-h.
- `src/components/store/size-guide.tsx` (server-safe presentational) — dimension table with rounded border, ink header band, row per variant. `cm()` helper renders em-dash for null/non-finite values. Labelled section via `aria-labelledby`.
- `src/components/store/add-to-bag-button.tsx` (client, STUB) — disabled-until-selectedVariant button, label flips between "Pick a size" and "Add to bag · RM X.XX". 60px min-h, stacked shadow, proper disabled state (opacity + cursor). Plan 04 replaces the `onClick` body only; props contract frozen.

### Composition (Task 2)
- `src/components/store/product-detail.tsx` (client) — owns `selectedSize` state. Sorts variants S→M→L via `useMemo`. Price pill shows `priceRangeMYR` before selection, `formatMYR(variant.price)` after. Renders gallery on the left (lg), name/price/description/selector/button/lead-time/material/size-guide stack on the right.
- `src/app/(store)/products/[slug]/page.tsx` (server) — async `generateMetadata` and `default` handler both await the Next 15 `params` Promise and call `getActiveProductBySlug`. Missing product → `notFound()`. Passes a narrow plain-object product shape to the client ProductDetail.

## Verification Performed

- `npx tsc --noEmit` — clean for all new files (pre-existing `src/lib/orders.test.ts` error still present; documented in `deferred-items.md`).
- Smoke tests via curl against the running dev server:
  - `GET /products/shuriken-keychain` → 200 ✓
  - `GET /products/dragon-phone-stand` → 200 ✓
  - `GET /products/does-not-exist` → 404 ✓
- Page HTML inspection confirms presence of: "Shuriken Keychain", "PICK YOUR SIZE", "Pick a size" (initial button label), "Size guide", "Ships in", "Material", "Kuala Lumpur".
- All four seeded variants across S/M/L render dimension rows in the size guide table.

## Deviations from Plan

- **None structural.** Followed the plan verbatim except:
  - Used `useMemo(... [product.variants])` dep array (the plan snippet omitted the dep array — would ESLint-warn under strict React hooks rules and risk stale sort in edge refetch cases).
  - Added an `eslint-disable-next-line no-console` above the stub's `console.log` so ESLint default rules don't fire on dev.
  - Lead-days fallback uses `7` (mid of the "3-7" D2-14 copy window) rather than the literal "3-7" string so the sentence stays grammatical regardless of the stored integer.

## Known Stubs

- `src/components/store/add-to-bag-button.tsx` — intentional stub as specified by Plan 02-03 frontmatter. Console-logs the would-be payload. Plan 02-04 rewrites the onClick to call `useCartStore().addItem({...})` + `setDrawerOpen(true)`.

## Self-Check: PASSED

- FOUND: src/components/store/product-gallery.tsx
- FOUND: src/components/store/size-selector.tsx
- FOUND: src/components/store/size-guide.tsx
- FOUND: src/components/store/add-to-bag-button.tsx
- FOUND: src/components/store/product-detail.tsx
- FOUND: src/app/(store)/products/[slug]/page.tsx
- FOUND commit: 53f3486 feat(02-03): PDP gallery, size selector, size guide, Add-to-bag stub
- FOUND commit: 21f53cc feat(02-03): /products/[slug] PDP with live price + metadata
- Live smoke tests: 3/3 expected HTTP codes match
