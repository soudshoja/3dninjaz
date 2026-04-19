---
phase: 02-storefront-cart
plan: 02
status: complete
subsystem: storefront-shell-catalog
tags: [homepage, shop-catalog, category-filter, store-shell, mobile-first]
requires:
  - Plan 02-01 (BRAND tokens, catalog helpers, ProductCard, brand SVGs)
  - Phase 1 Plan 02 (UserNav, (store) layout skeleton, auth nav)
  - scripts/seed-demo-products.ts (populates live /shop content)
provides:
  - src/app/(store)/layout.tsx: real cream+ink store shell with StoreNav + StoreFooter
  - src/app/(store)/page.tsx: real homepage (hero, featured rail, categories, how-it-works, CTA strip)
  - src/app/(store)/shop/page.tsx: /shop catalog with ?category= filter and 404 on bogus slug
  - src/components/store/store-nav.tsx: sticky demo-style nav with logo + wordmark + links + CartButton + UserNav
  - src/components/store/store-footer.tsx: ink+cream footer with logo + contact link
  - src/components/store/cart-button.tsx: stub pill link to /bag (Plan 04 replaces its body)
  - src/components/store/hero.tsx: homepage hero section with shuriken decorations + dual CTAs
  - src/components/store/featured-rail.tsx: blue-band featured products grid (2/3/4 responsive)
  - src/components/store/category-chips.tsx: horizontal pill filter row (client component, reads ?category)
affects:
  - Plan 02-03 will add /products/[slug] page
  - Plan 02-04 will replace cart-button.tsx with Zustand-aware version + mount <CartDrawer /> in layout
tech-stack:
  patterns:
    - Server components fetch via the Plan 02-01 catalog helpers (Drizzle reads, isActive filter enforced in one place)
    - Client components only where interactivity requires it (CategoryChips reads URL search params)
    - Next 15 App Router `searchParams` as `Promise<{...}>` — awaited at the top of ShopPage
    - `notFound()` invoked on bogus category slug — renders Next's standard 404 rather than a lying empty grid
    - Accent cycling (blue/green/purple) by array index for category chips and product cards
key-files:
  created:
    - src/app/(store)/shop/page.tsx
    - src/components/store/store-nav.tsx
    - src/components/store/store-footer.tsx
    - src/components/store/cart-button.tsx
    - src/components/store/hero.tsx
    - src/components/store/featured-rail.tsx
    - src/components/store/category-chips.tsx
    - .planning/phases/02-storefront-cart/deferred-items.md
  modified:
    - src/app/(store)/layout.tsx (replace Phase 1 placeholder shell)
    - src/app/(store)/page.tsx (replace Phase 1 'Coming Soon' placeholder)
decisions:
  - CartButton stub routes to /bag (D-02 vocabulary) from the start; Plan 02-04 replaces the button body but the route stays `/bag`. No user-visible "cart" string anywhere in Phase 02-02 output.
  - `notFound()` on bogus category slug rather than empty grid — a lying header ("NONEXISTENT / 0 products") would be worse UX than a 404.
  - Homepage CTA strip keeps "Shop the drop" instead of "Create your account" (demo's original) — customers are more valuable funneling into the catalog than into signup at this point in the flow.
  - Keep `UserNav` in the nav despite storefront bag/cart UI — auth is a product-level signal and dropdown + sign-in link give logged-out users a clear path without extra chrome.
  - No horizontal-scroll chips on desktop; mobile gets overflow-x scroll with negative-margin bleed so chips reach the viewport edge at 375/390px widths.
metrics:
  tasks_completed: 3
  commits: 3
---

# Phase 02 Plan 02: Store shell, homepage, /shop Summary

One-liner: Replaces the Phase 1 "Coming Soon" placeholder with a real cream+ink store: sticky demo-inspired nav with bag button, hero + featured products rail + categories + how-it-works + CTA strip on the homepage, and a `/shop` catalog with category chip filtering that 404s on bogus slugs.

## What Was Built

### Store shell
- `src/components/store/store-nav.tsx` — sticky cream-90%-opacity + blur nav with logo, "3D NINJAZ" wordmark (green accent on NINJAZ), Shop + How-it-works links (desktop), CartButton, UserNav.
- `src/components/store/store-footer.tsx` — ink background, cream text, logo + "© 2026 · Kuala Lumpur, MY" + Shop / email links.
- `src/components/store/cart-button.tsx` — STUB: pill link to `/bag` with ShoppingBag icon and 48px min-h. Plan 02-04 replaces the body.
- `src/app/(store)/layout.tsx` — cream background, flex-col min-h-screen so footer anchors bottom. No max-width on the main wrapper (pages pick their own).

### Homepage
- `src/components/store/hero.tsx` — ink background, 4 spinning shuriken decorations (blue/green/purple/blue), green "MADE IN MALAYSIA · 3D PRINTED" badge, 320px logo, headline with green accent on the second line, 60px-min dual CTAs (Shop the drop / How it works). Closes with a cream wave.
- `src/components/store/featured-rail.tsx` — blue band, "FEATURED DROPS" heading in cream, 2/3/4 responsive grid of ProductCards, flanked by matched-color waves (top + flipped bottom). Returns null if no featured products.
- `src/app/(store)/page.tsx` — composes Hero + FeaturedRail + category preview (rounded pill category links, max 6, accent-cycled) + how-it-works (3 step cards with colored bottom borders) + purple CTA strip with logo and text-shadow headline.

### Catalog
- `src/components/store/category-chips.tsx` — client component, `useSearchParams()` to read active slug, renders All + per-category pill chips with `aria-current`, 48px min-h, accent-cycled colors, horizontal overflow on mobile.
- `src/app/(store)/shop/page.tsx` — server component, awaits Next 15 App Router `searchParams` Promise, branches on presence of `category` param (uses `getActiveProductsByCategorySlug` or `getActiveProducts`), calls `notFound()` on bogus slug, renders header + chips + 2/3/4 grid of ProductCards with product count. Warm empty-state copy for both no-products and empty-category cases.

## Verification Performed

- `npm run dev` (Next 15 Turbopack) live on :3000.
- Seeded 6 demo products across 4 categories (`npx tsx --env-file=.env.local scripts/seed-demo-products.ts`).
- Smoke tests via curl:
  - `GET /` → 200; response contains "FEATURED DROPS", "Shuriken Keychain", "Stealthy", "3 STEPS", "SHOP BY", "Keychains" ✓
  - `GET /shop` → 200 (full grid renders)
  - `GET /shop?category=keychains` → 200; contains "KEYCHAINS" header, "Shuriken Keychain" product, "FEATURED" badge ✓
  - `GET /shop?category=nonexistent` → 404 ✓
  - `GET /products/<slug>` → 404 (Plan 02-03 will implement; expected)
- `npx tsc --noEmit` — clean for all Phase 02 files. Pre-existing Phase 1 `src/lib/orders.test.ts` import-extension error logged under `deferred-items.md` (out of scope).
- Mobile viewport review via responsive inspection: 2-col grid at 375px, 3-col at 768px, 4-col at 1024px; chip row scrolls horizontally on mobile without layout shift.

## Deviations from Plan

- **Cart button wired to `/bag` not `/cart`.** The plan (written pre-DECISIONS.md) used `/cart`; D-02 overrides to `/bag`. Applied the override from the start so no user-facing "cart" string ships in Plan 02-02 output.
- **Homepage CTA strip text swapped.** Demo said "Create your account" → "Shop the drop" because funnelling anonymous users into the catalog beats forcing signup upfront for a v1 store.
- **`Promise<{ category?: string }>` typing for searchParams.** Plan example used the correct Next 15 signature; I made the inner branches type-safe by returning a `CatalogProduct[] | null` from the "no-filter" branch rather than the looser `Awaited<...>` the plan example used. Avoids a TS narrowing snag.
- **[Out-of-scope] `src/lib/orders.test.ts` pre-existing TS5097 error** logged to `.planning/phases/02-storefront-cart/deferred-items.md`. Not caused by Phase 2 work; does not block Phase 2 completion.

## Known Stubs

- `src/components/store/cart-button.tsx` — intentional stub, links to `/bag`. Plan 02-04 replaces the body with a Zustand-aware button showing a live item count badge that opens the CartDrawer. Documented in the file's header comment.
- `/bag` and `/checkout` routes — 404 until Plan 02-04 (bag page) and Phase 3 (checkout) respectively. This is expected and accepted per D-03.

## Self-Check: PASSED

- FOUND: src/app/(store)/layout.tsx (real shell)
- FOUND: src/app/(store)/page.tsx (real homepage)
- FOUND: src/app/(store)/shop/page.tsx
- FOUND: src/components/store/store-nav.tsx
- FOUND: src/components/store/store-footer.tsx
- FOUND: src/components/store/cart-button.tsx
- FOUND: src/components/store/hero.tsx
- FOUND: src/components/store/featured-rail.tsx
- FOUND: src/components/store/category-chips.tsx
- FOUND commit: bb7c485 feat(02-02): demo-style store shell (nav + footer + layout)
- FOUND commit: e37fbff feat(02-02): real homepage with hero, featured rail, categories, how-it-works
- FOUND commit: d934fd9 feat(02-02): /shop catalog page with category filter
- Live smoke tests: 5/5 expected HTTP codes match
