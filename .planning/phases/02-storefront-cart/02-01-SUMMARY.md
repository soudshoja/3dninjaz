---
phase: 02-storefront-cart
plan: 01
status: complete
subsystem: storefront-foundation
tags: [brand-tokens, formatters, catalog-reads, product-card, seed-script, mariadb, tailwind-v4]
requires:
  - Plan 01-01 (Drizzle MySQL schema)
  - Plan 01-03 (products/productVariants/categories tables populated by admin)
provides:
  - src/lib/brand.ts: BRAND constant (blue/green/purple/ink/cream) + BrandColor type
  - src/lib/format.ts: formatMYR, priceRangeMYR
  - src/lib/catalog.ts: getActiveProducts, getActiveFeaturedProducts, getActiveProductBySlug, getActiveCategories, getActiveProductsByCategorySlug + CatalogProduct/CatalogVariant types
  - src/components/brand/{shuriken,wave,logo}.tsx: reusable brand SVGs + logo wrapper
  - src/components/store/product-card.tsx: shared ProductCard used by homepage rail, /shop, category pages
  - scripts/seed-demo-products.ts: idempotent seed for 6 demo products across 4 categories
  - globals.css: unified CSS custom properties (--brand-*) + @theme inline exposure for Tailwind utilities
  - vaul + zustand installed as runtime dependencies
affects:
  - Plan 02-02 imports catalog helpers + ProductCard + BRAND tokens
  - Plan 02-03 imports catalog helpers + formatMYR + BRAND tokens
  - Plan 02-04 consumes vaul + zustand
tech-stack:
  added:
    - vaul (cart drawer library, installed ahead for Wave 3)
    - zustand (client cart state, installed ahead for Wave 3)
  patterns:
    - Manual multi-query relation hydration (Drizzle relational `with: {}` unsupported on MariaDB 10.11 — ER_PARSE_ERROR on LATERAL)
    - ensureImagesArray helper at the read path (MariaDB JSON-as-LONGTEXT + mysql2 quirks)
    - BRAND constants as single source of truth; CSS custom props mirror the TS constants
    - `@theme inline` block in Tailwind v4 exposes --brand-* as utility classes
key-files:
  created:
    - src/lib/brand.ts
    - src/lib/format.ts
    - src/lib/catalog.ts
    - src/components/brand/shuriken.tsx
    - src/components/brand/wave.tsx
    - src/components/brand/logo.tsx
    - src/components/store/product-card.tsx
    - scripts/seed-demo-products.ts
  modified:
    - src/app/globals.css (replace stale Template A palette; add --brand-* custom props + @theme inline entries)
    - package.json + package-lock.json (add vaul, zustand)
decisions:
  - Manual multi-query hydration replaces Drizzle `with: { variants, category }` — MariaDB 10.11 lacks LATERAL support (confirmed in Phase 1 Plan 03 summary). Applied Rule 1 (auto-fix bug) against the plan's example code to prevent runtime crashes on catalog reads.
  - Kept Phase 1 "legacy" `--color-brand-*` aliases in globals.css pointing at the new tokens so existing admin components don't break while we migrate them surface-by-surface over Phase 2.
  - Seed script (scripts/seed-demo-products.ts) added at end of Plan 01 per execution brief so /shop has content during Wave 2 verification. Uses /logo.png as image placeholder — admin can replace via /admin/products later.
  - Zustand installed here alongside vaul to avoid two npm installs (scope also covered by the plan's fallback instruction "if zustand is missing").
metrics:
  tasks_completed: 2
  commits: 2
---

# Phase 02 Plan 01: Brand primitives, formatters, catalog helpers, ProductCard Summary

One-liner: Lays the Phase 2 foundation — BRAND color module, MYR formatters, server-side catalog read helpers (MariaDB-safe manual hydration), decorative SVGs extracted from demo, reusable ProductCard, globals.css palette swap, and a demo-product seed script ready for Wave 2.

## What Was Built

### Tokens & helpers
- `src/lib/brand.ts` — typed `BRAND` constant (blue/green/purple/ink/cream) + `BrandColor` type alias, verbatim from the demo.
- `src/lib/format.ts` — `formatMYR(price)` accepts string (Drizzle decimal) or number, returns `RM 18.00`. `priceRangeMYR(variants)` returns `RM 18.00` for single-price or `RM 18.00 - RM 45.00` for a range.
- `src/lib/catalog.ts` — server-only read helpers:
  - `getActiveProducts()`, `getActiveFeaturedProducts(limit=4)`, `getActiveProductBySlug(slug)`, `getActiveCategories()`, `getActiveProductsByCategorySlug(slug)`
  - Every helper enforces `isActive = true` at the SQL level (D2-08 single-source filtering).
  - `CatalogProduct` / `CatalogVariant` types exported for consumer props.
  - Uses manual multi-query hydration (mirrors `src/actions/products.ts`) because MariaDB 10.11 does not support LATERAL joins, which Drizzle's relational API emits.
  - `ensureImagesArray()` normalises MariaDB JSON-as-LONGTEXT back to `string[]`.

### Brand SVGs
- `src/components/brand/shuriken.tsx` — pure SVG with `className` + `fill` props; safe in server components; `animate-spin-slow` animation available via existing globals.css keyframe.
- `src/components/brand/wave.tsx` — full-width wave divider with `color` + optional `flip` rotation.
- `src/components/brand/logo.tsx` — `Image` wrapper around `/logo.png` with `size` + `priority` props.

### ProductCard
- `src/components/store/product-card.tsx` — server component. Whole card is a `<Link href="/products/{slug}">`. Accent cycles blue→green→purple via `accentIndex`. Shows `FEATURED` badge when `isFeatured=true`. Aria-label combines name + price range. Focus ring colored by accent. Graceful "No image" fallback.

### Demo seed
- `scripts/seed-demo-products.ts` — creates 4 categories (Keychains, Phone Stands, Desk Toys, Planters) and 6 products (Shuriken Keychain, Dragon Phone Stand, Ninja Planter Pot, Kunai Letter Opener, Chibi Ninja Figurine, Stealth Cable Dragon). Each has S/M/L variants with prices and real cm dimensions. Uses `/logo.png` as placeholder image. Idempotent (checks slugs before insert).
- Invoke: `npx tsx --env-file=.env.local scripts/seed-demo-products.ts`

### globals.css (Phase 1 gap fix)
- Replaced stale "Template A" `--color-brand-primary/cta/surface/...` green+orange palette with unified 3-color tokens: `--brand-blue`, `--brand-green`, `--brand-purple`, `--brand-ink`, `--brand-cream`.
- Added Tailwind v4 `@theme inline` entries (`--color-brand-blue`, etc.) so utilities like `bg-brand-blue`, `text-brand-ink` work out of the box.
- Kept legacy aliases (`--color-brand-primary`, `--color-brand-cta`, `--color-brand-surface`) pointing at the new tokens so Phase 1 admin pages don't break visually during migration.

## Verification Performed

- `npx tsc --noEmit` — clean (no errors after all 4 files added).
- Inline test of `priceRangeMYR([{price:"18.00"},{price:"45.00"}])` → `"RM 18.00 - RM 45.00"` ✓
- Verification node script from Task 1 and Task 2 — both pass.
- Commits atomic: one per task, format matches Phase 1 style.

## Deviations from Plan

- **[Rule 1 - Bug] Manual hydration in `src/lib/catalog.ts` instead of Drizzle `with: {}`.** The plan example uses `db.query.products.findMany({ with: { variants: true, category: true } })`. That compiles to `LEFT JOIN LATERAL (...)` which MariaDB 10.11 rejects with ER_PARSE_ERROR (documented in Phase 1 Plan 03 summary and CLAUDE-level decisions log). Switched to multi-query hydration with `inArray()` batched lookups, mirroring `src/actions/products.ts`. Same observable contract (`CatalogProduct` shape), just a dialect-correct implementation.
- **[Rule 2 - Correctness] globals.css palette swap.** Phase 1 shipped with "Template A" green+orange tokens. Phase 2 DECISIONS.md D-01 supersedes that palette with the unified blue/green/purple/ink/cream set everywhere (storefront AND admin). Replaced the `:root` block in globals.css and added `@theme inline` so Tailwind v4 utilities pick up the new tokens. Kept legacy aliases so Phase 1 admin components keep rendering while we migrate them.
- **[Rule 2 - Correctness] Demo product seed script.** Execution brief required a seed script if no products exist at end of Wave 1. Added `scripts/seed-demo-products.ts` as an idempotent insert of 6 products across 4 categories with realistic variants, so Wave 2 verification has live data to render.
- **Zustand installed alongside vaul in Task 1.** The plan listed zustand as a conditional install (`if missing`); bundling it into the Task 1 `npm install` avoids a second install round-trip in Plan 04 and matches the brief.

## Known Stubs

None. All exported helpers are fully implemented.

## Self-Check: PASSED

- FOUND: src/lib/brand.ts (BRAND constants)
- FOUND: src/lib/format.ts (formatMYR, priceRangeMYR)
- FOUND: src/lib/catalog.ts (5 server-only helpers + CatalogProduct type)
- FOUND: src/components/brand/shuriken.tsx
- FOUND: src/components/brand/wave.tsx
- FOUND: src/components/brand/logo.tsx
- FOUND: src/components/store/product-card.tsx
- FOUND: scripts/seed-demo-products.ts
- FOUND commit: d7a2737 feat(02-01): add brand tokens, MYR formatters, catalog helpers
- FOUND commit: 29a22fa feat(02-01): extract brand SVGs + ProductCard + demo product seed
- vaul + zustand present in package.json dependencies
