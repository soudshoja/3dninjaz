---
phase: 06-customer-account
plan: 04
subsystem: wishlist
tags: [account, wishlist, pdp, product-card, mariadb, optimistic]
requires:
  - "Phase 6 06-01 (wishlists table, wishlistAddSchema, requireUser)"
  - "Phase 2 ProductCard + ProductDetail"
provides:
  - "src/actions/wishlist.ts (toggleWishlist, removeFromWishlist, isWishlisted, getWishlistedProductIds, listMyWishlist)"
  - "WishlistButton (overlay/pill/inline) with optimistic UI + unauth redirect"
  - "/account/wishlist list page"
  - "ProductCard heart overlay (top-right)"
  - "ProductDetail Save/Saved pill alongside Add-to-bag"
affects:
  - src/actions/wishlist.ts
  - src/app/(store)/account/wishlist/page.tsx
  - src/app/(store)/products/[slug]/page.tsx
  - src/app/(store)/shop/page.tsx
  - src/components/store/wishlist-button.tsx
  - src/components/store/product-card.tsx
  - src/components/store/product-detail.tsx
  - src/components/store/featured-rail.tsx
tech-stack:
  added: []
  patterns:
    - "Batch helper getWishlistedProductIds — single inArray query per grid render to avoid N+1"
    - "Manual product/variant hydration on /account/wishlist (MariaDB no-LATERAL — same pattern as catalog.ts)"
    - "ER_DUP_ENTRY catch in toggleWishlist treats UNIQUE-violation race as idempotent success"
    - "ProductCard restructured: outer relative div containing both Link + WishlistButton sibling — avoids nested-interactive-element HTML invalidity"
    - "Optimistic UI: setOn(next) BEFORE awaiting server, rollback to !next on !ok, reconcile to res.state on success"
key-files:
  created:
    - src/actions/wishlist.ts
    - src/app/(store)/account/wishlist/page.tsx
    - src/components/store/wishlist-button.tsx
  modified:
    - src/app/(store)/products/[slug]/page.tsx (fetches isWishlisted server-side)
    - src/app/(store)/shop/page.tsx (batch fetch wishedIds)
    - src/components/store/product-card.tsx (heart overlay top-right; FEATURED moved to top-left)
    - src/components/store/product-detail.tsx (WishlistButton pill alongside Add-to-bag)
    - src/components/store/featured-rail.tsx (now async; batch fetch wishedIds)
decisions:
  - "Wishlist limit = 50 items (Q-06-08 resolution from phase prompt)"
  - "Heart overlay on ProductCard moved FEATURED badge from top-right to top-left to avoid visual collision"
  - "/account/wishlist 'Add to bag' routes to PDP rather than auto-adding size S — preserves D2-02 explicit-size UX (06-04 spec note)"
  - "FeaturedRail converted to async function (server component) so it can call getWishlistedProductIds — was previously synchronous-pure"
metrics:
  duration_minutes: 14
  tasks_completed: 2
  files_created: 3
  files_modified: 5
  completed_date: 2026-04-19
---

# Phase 6 Plan 04: Wishlist Summary

CUST-04 closes. Customer can heart products from shop grid + PDP, view all wishlisted items at /account/wishlist, remove via the heart, and jump back to PDP for sizing + Add-to-bag.

## What shipped

- **`src/actions/wishlist.ts`** — 5 server actions:
  - `isWishlisted(productId)` — single-product check (PDP server component)
  - `getWishlistedProductIds(ids[])` — batch helper for grids (avoids N+1)
  - `toggleWishlist({ productId })` — add/remove with UNIQUE race catch
  - `removeFromWishlist(productId)` — explicit remove
  - `listMyWishlist()` — returns hydrated products + variants for /account/wishlist
- **WishlistButton** — client component with `overlay` (44px tap card), `pill` (48px Save/Saved), `inline` (48px square) variants. Unauth click → `/login?next=<currentPath>`. Optimistic flip with rollback.
- **/account/wishlist** — list page with cards (image, name, price-from, Saved pill, View & add to bag CTA). Empty state CTA.
- **ProductCard restructure** — outer `<div class="relative group">` containing the existing `<Link>` plus a sibling `<div class="absolute top-3 right-3">` for the WishlistButton. Avoids nested-interactive-element HTML invalidity.
- **PDP** — fetches `isWishlisted(product.id)` server-side, passes `isWishlistedInitial` prop to ProductDetail; ProductDetail renders WishlistButton pill alongside Add-to-bag.
- **Shop + FeaturedRail** — call `getWishlistedProductIds(productIds)` ONCE per render and pass `isWishlisted={wishedIds.has(p.id)}` to each card.

## Wishlist cap

`WISHLIST_LIMIT = 50` per user (Q-06-08 resolution). `toggleWishlist` counts user rows before insert and rejects the 51st with a friendly message.

## Threat mitigations applied

| Threat ID                | Mitigation                                                                  |
| ------------------------ | --------------------------------------------------------------------------- |
| T-06-04-auth             | requireUser() FIRST await on toggleWishlist + removeFromWishlist + listMyWishlist |
| T-06-04-IDOR             | Ownership predicate on every WHERE                                          |
| T-06-04-integrity        | UNIQUE(user_id, product_id) DB-side + ER_DUP_ENTRY catch as idempotent success |
| T-06-04-unauth-write     | Client redirect to /login?next=<path>; server requireUser() is the gate    |
| T-06-04-click-through    | preventDefault + stopPropagation in WishlistButton onClick                  |
| T-06-04-optimistic-desync | Rollback on !ok; reconcile to res.state on success                         |
| T-06-04-deleted-product  | listMyWishlist filters by isActive=true and silently drops missing products |
| T-06-04-N+1              | getWishlistedProductIds batches the per-card check                          |
| T-06-04-XSS              | All product output via React JSX                                            |

## Deviations from Plan

**1. [Rule 1 - Bug] Nested interactive elements in ProductCard**

The plan called for the WishlistButton overlay to live INSIDE the existing `<Link>` tag. That produces invalid HTML (interactive button inside interactive link) and semi-undefined click behaviour across browsers. I restructured the card root to be `<div class="relative group">` containing the Link as one child and the absolute-positioned WishlistButton as another. The Link still wraps the entire visual card via its own click area; the heart button is a true sibling that still lays over the image visually thanks to z-index.

Side-effect: the FEATURED badge moved from top-right to top-left of the image so the heart has uncluttered top-right space.

## Verification

- `npx tsc --noEmit` — clean
- 3 new files; 5 modified
- Wishlist route auth-gated by `/account` layout from 06-02
- All ProductCard call sites either pass `isWishlisted={...}` (shop, featured-rail) or omit it (defaults false — heart still works on click since the action doesn't trust the initial state anyway)

## Self-Check: PASSED

- FOUND: src/actions/wishlist.ts (5 exports including getWishlistedProductIds)
- FOUND: src/app/(store)/account/wishlist/page.tsx
- FOUND: src/components/store/wishlist-button.tsx
- FOUND: src/components/store/product-card.tsx (heart overlay added)
- FOUND: src/components/store/product-detail.tsx (Save/Saved pill alongside Add-to-bag)
- FOUND: src/components/store/featured-rail.tsx (now async; calls getWishlistedProductIds)
- FOUND: src/app/(store)/shop/page.tsx (calls getWishlistedProductIds)
- FOUND: src/app/(store)/products/[slug]/page.tsx (calls isWishlisted)
- PASSED: npx tsc --noEmit clean
