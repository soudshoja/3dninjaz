# Phase 2 — Post-planning decisions (2026-04-19)

User resolved the 3 open questions after planner completion. These SUPERSEDE anything in 02-CONTEXT.md or individual PLAN.md files where they conflict.

## D-01: Unified 3-color palette (storefront AND admin)

Single palette across every surface — no admin/storefront split.

| Token | Hex | Role |
|---|---|---|
| `--brand-blue`   | `#2563EB` | Primary accent |
| `--brand-green`  | `#84CC16` | Success / CTAs |
| `--brand-purple` | `#8B5CF6` | Secondary accent |
| `--brand-ink`    | `#0B1020` | Body text / dark surfaces |
| `--brand-cream`  | `#F7FAF4` | Page background / light surfaces |

Fonts: Russo One (heading, `var(--font-heading)`), Chakra Petch (body, `var(--font-body)`).

Phase 1 admin plans originally referenced a green/orange "Template A" palette — IGNORE that. Admin layout must use the 5 tokens above.

## D-02: Unified "bag" vocabulary

Every user-facing string uses **bag** (not cart). Technical internals can keep `cart-store.ts` etc — only user-visible strings + routes change.

| Surface | Text |
|---|---|
| Product page button | "Add to bag" |
| Nav button | "Bag" |
| Drawer title | "Your bag" |
| Drawer empty state | "Your bag is empty." |
| Full page route | `/bag` (NOT `/cart`) |
| Full page heading | "Your bag" |
| Checkout CTA label | "Checkout" |

Rewrite in code: `src/app/(store)/cart/page.tsx` → `src/app/(store)/bag/page.tsx`. All "cart" user-facing text → "bag". Keep internal file/variable names (`cart-store.ts`, `useCartStore`, `CartItem`, `CartLineRow`) as-is — internals, not user-facing.

## D-03: `/checkout` 404 pre-Phase-3 — ACCEPTED

Drawer + `/bag` checkout CTAs link to `/checkout` which will 404 until Phase 3 ships. No guardrail needed.

## D-04: Mobile-first is CRITICAL (reinforced)

Every screen must be validated at 390×844 (iPhone 13) AND 375×667 (iPhone SE). Hard rules:

- All tap targets ≥ 48px, primary CTAs ≥ 60px
- Bag drawer = bottom-sheet on viewports ≤ 768px (Vaul handles this natively)
- Product grid: 2 cols on mobile (not 1), 3 on tablet (768–1024), 4 on desktop (≥ 1024)
- Size selector pills stack on narrow widths if row overflows
- Sticky mobile CTAs on PDP: "Add to bag" bar pinned bottom when hero image scrolls out
- No horizontal scroll at any breakpoint — test 320 / 375 / 390 / 768 / 1024 / 1440

These mobile checks are MANDATORY in each plan's `verify` block. Any plan shipping without mobile verification fails review.
