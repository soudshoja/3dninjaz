---
phase: 18-colour-management
plan: 08
subsystem: storefront-shop-filter
tags: [colour, filter, /shop, sidebar, accordion, url-state, manual-hydration]
provides:
  - getActiveProductColourChips
  - getProductIdsByColourSlugs
  - ColourFilterSection
  - SearchParams.colour
requires:
  - colors table (Phase 18 Plan 01)
  - product_option_values.color_id FK (Phase 18 Plan 01)
  - buildColourSlugMap (Phase 18 Plan 01)
  - getReadableTextOn (Phase 18 Plan 01)
  - existing /shop SearchParams + resolveProducts pipeline (Phase 8)
affects:
  - src/lib/catalog.ts
  - src/components/store/colour-filter-section.tsx (NEW)
  - src/app/(store)/shop/page.tsx
tech-stack:
  added:
    - none (uses existing Drizzle, Next 15, Tailwind, lucide-react)
  patterns:
    - manual multi-query hydration (MariaDB 10.11 no-LATERAL)
    - URLSearchParams toggle pattern (preserves co-existing query params)
    - aria-pressed multi-select toggle chip
key-files:
  created:
    - src/components/store/colour-filter-section.tsx
  modified:
    - src/lib/catalog.ts
    - src/app/(store)/shop/page.tsx
decisions:
  - D-13 collapsible accordion below categories, default open, first 12 chips visible, Show all expands
  - D-14 cross-brand collision suffix `-<lowerbrand>` honoured at slug-map build (used by both helpers)
  - D-15 chip = 12px hex circle + name pill; active = hex bg + getReadableTextOn(hex)
  - D-16 DISTINCT JOIN computed per render via 4-step manual hydration (no LATERAL)
metrics:
  duration: 5 min
  completed: 2026-04-26
  commits: 3
  files_changed: 3
  tasks_completed: 4
requirements_addressed: [REQ-8]
---

# Phase 18 Plan 08: /shop Sidebar Colour Chip Filter Summary

Customer-facing colour discovery surface — the last user-visible Phase 18 deliverable. Adds a collapsible `Colour` accordion to the `/shop` sidebar (and a horizontal mobile strip), URL-synced via `?colour=galaxy-black,jade-white`, multi-select, server-side intersected with the existing `?category=` and `?subcategory=` filters via two new manual-hydration helpers in `src/lib/catalog.ts`.

## Catalog Helpers (src/lib/catalog.ts)

### `getActiveProductColourChips(): Promise<Array<{slug, name, hex}>>`

Returns the de-duplicated list of colours used by ≥1 active in-stock variant. 4-step manual hydration (no LATERAL — MariaDB 10.11):

1. `SELECT id, name, hex, brand FROM colors WHERE is_active = 1` (small table — ≤ ~150 rows after Plan 18-02 seed).
2. `SELECT id, color_id FROM product_option_values WHERE color_id IS NOT NULL` — build pov.id → color.id map.
3. Six parallel queries — one per `option1ValueId`..`option6ValueId` slot — each `INNER JOIN products ON product_variants.product_id = products.id WHERE inArray(slot, povIds) AND products.is_active = 1 AND product_variants.in_stock = 1`. Collect distinct color ids actually in use.
4. Filter the colour list to that set; build collision-aware slug map via `buildColourSlugMap` (Plan 18-01); project to `{slug, name, hex}`; sort alphabetically by name.

Strips `code`, `previous_hex`, `family_type`, `family_subtype`, `is_active`, `created_at`, `updated_at` — only `id`, `name`, `hex`, `brand` ever leave the DB; `id` and `brand` are consumed by the slug map and never returned to the caller.

### `getProductIdsByColourSlugs(slugs: string[]): Promise<Set<string>>`

Resolves a list of colour slugs to a `Set<productId>` of products that have ≥1 active in-stock variant matching one of the colours. Used by `/shop`'s `resolveProducts` to intersect with the existing category-filtered result.

Empty input short-circuits to `new Set()`. Mirrors the same 4-step manual-hydration shape: fetch active colours → match slugs to ids via `buildColourSlugMap` → fetch matching pov ids → six-slot parallel intersection with active in-stock variants.

## ColourFilterSection (src/components/store/colour-filter-section.tsx)

```ts
type Props = {
  chips: Array<{ slug: string; name: string; hex: string }>;
  defaultVisible?: number; // = 12 (D-13)
};
```

Behaviour:

- Hides entire section when `chips.length === 0` (D-16 empty case)
- Reads `?colour=` from `useSearchParams`; converts to `Set<string>`
- Toggles slug in/out of the URL set on click; preserves `?category=` and `?subcategory=` via `URLSearchParams` API (no template strings — safe against injection)
- Default `open=true`, `expanded=false`. First 12 chips visible; `Show all (N)` button expands to full list with `Show less` counterpart
- Active count badge `Colour [3]` (16px ink-fill circle) renders beside the title when ≥1 chip selected
- Each chip:
  - Default: 2px ink border, transparent bg, ink text, 12px hex circle
  - Active: 2px hex border (full alpha), hex bg, `getReadableTextOn(hex)` text colour (WCAG 2.2 SC 1.4.11 — handles both pure-black and pure-white edge hexes)
  - Focus: 2px purple outline + 2px offset (focus-visible)
  - `aria-label="Filter by colour: <name>"`, `aria-pressed={isActive}`
- Min-h 36px (sidebar density per UI-SPEC §Surface 5)

## /shop Page Diff (src/app/(store)/shop/page.tsx)

```diff
+ import { ColourFilterSection } from "@/components/store/colour-filter-section";
  import {
+   getActiveProductColourChips,
+   getProductIdsByColourSlugs,
    ...
  } from "@/lib/catalog";

- type SearchParams = Promise<{ category?: string; subcategory?: string }>;
+ type SearchParams = Promise<{
+   category?: string;
+   subcategory?: string;
+   colour?: string; // Phase 18 (18-08) — comma-separated colour slugs
+ }>;

  export default async function ShopPage({ searchParams }) {
-   const { category, subcategory } = await searchParams;
+   const { category, subcategory, colour } = await searchParams;
+   const colourSlugs = colour ? colour.split(",").filter(Boolean) : [];

-   const [tree, result] = await Promise.all([
+   const [tree, colourChips, result] = await Promise.all([
      getActiveCategoryTree(),
+     getActiveProductColourChips(),
-     resolveProducts(category, subcategory),
+     resolveProducts(category, subcategory, colourSlugs),
    ]);

    ...

+   {/* Mobile-only horizontal colour chip strip (D-13 mobile parity) */}
+   <div className="md:hidden max-w-6xl mx-auto px-6 mt-3">
+     <ColourFilterSection chips={colourChips} />
+   </div>

    <section ... grid gap-8 md:grid-cols-[240px_1fr]>
      <aside className="hidden md:block">
        <ShopSidebar tree={...} activeCategory={...} activeSubcategory={...} />
+       <ColourFilterSection chips={colourChips} />
      </aside>
      ...
    </section>
  }

- async function resolveProducts(category, subcategory) {
+ async function resolveProducts(category, subcategory, colourSlugs: string[]) {
+   let base: ResolvedView | "not_found";
    // 3-branch switch (subcategory / category / all) → assigns to `base`
    ...
+   if (colourSlugs.length === 0) return base;
+   const allowedIds = await getProductIdsByColourSlugs(colourSlugs);
+   if (allowedIds.size === 0) return { ...base, products: [] };
+   return { ...base, products: base.products.filter((p) => allowedIds.has(p.id)) };
  }
```

The 3-branch switch was refactored from `return`-each-branch to assign-to-`base` so the colour-intersection step can run uniformly across all three paths. `not_found` is still returned early — colour intersection never re-validates category existence.

## Manual Smoke Checklist (for the verifier)

After Wave 1+2+3 are complete and at least one product has a Colour-named option with library-attached values (e.g. via the picker dialog from Plan 18-06):

1. **Desktop sidebar (≥768px):** Visit `/shop` — sidebar shows the Colour accordion below Category, default open, with the seeded colours that are in use.
2. **Single-chip toggle:** Click a chip → URL becomes `/shop?colour=<slug>` and the product list filters to products with that colour. Click the same chip → URL drops the `colour` param entirely.
3. **Multi-select:** Click a second chip → URL becomes `/shop?colour=<slug1>,<slug2>` (alphabetically sorted) and the product list grows to include products in EITHER colour.
4. **Intersect with category:** Append `?category=<cat>&colour=<slug>` → only products matching BOTH filters render. Active count badge shows `[1]` beside the title.
5. **Active state:** Active chip background = colour's hex; text colour = `getReadableTextOn(hex)` (white on dark hex, ink on light hex). Border full-alpha hex.
6. **Show all:** When chips.length > 12, "Show all (N)" button expands to full list with "Show less" counterpart.
7. **Empty case:** If no active product uses any seeded colour, the accordion is hidden entirely (D-16).
8. **Mobile (<768px):** Horizontal chip strip appears above the grid, below the existing category strip. Sidebar hidden as before.
9. **Admin-field hygiene:** Inspect rendered HTML — `code`, `previous_hex`, `family_type`, `family_subtype` MUST NOT appear anywhere in the response.

## Threat Mitigations Applied

| Threat | Mitigation |
|--------|------------|
| T-18-08-public-leak | Both helpers `SELECT` only `id/name/hex/brand` from `colors` and project to `{slug, name, hex}` — `code/previous_hex/family_*` stripped at the query boundary. Audit grep on `src/app/(store)/` + `src/components/store/` returns zero matches for those columns. |
| T-18-08-slug-injection | `slugifyColourBase` strips to `[a-z0-9-]`; URL parsed as `Set<string>` and passed via Drizzle `inArray` (parameterised). Chip name in DOM rendered from server-side data, never from URL slug. |
| T-18-08-lateral-bypass | Both helpers use `select().from().innerJoin()` — no `db.query.X.findMany({with})` introduced. Grep `db.query` count unchanged at 1 (the existing comment line). |
| T-18-08-empty-set | `getProductIdsByColourSlugs` returns `new Set()` early on every empty path; `resolveProducts` returns `{ ...base, products: [] }` when allowedIds is empty — the page renders "No drops in this squad yet." instead of crashing. |
| T-18-08-url-flood | Comma-separated slugs accepted; `URLSearchParams` parser is bounded by Next.js routing. ~100 chips × ~25 chars ≈ 2.5 KB worst-case — well under browser query-length cap. |

## REQ-8 Acceptance Evidence

| Criterion | Evidence |
|-----------|----------|
| Sidebar accordion below Category, default open, first 12 chips, Show all expands | `colour-filter-section.tsx`: `useState(true)` for `open`; `defaultVisible = 12`; `Show all (N)` / `Show less` toggle |
| Chip = 12px hex circle + name pill; active state hex-tinted with WCAG-safe text | `<span style={{width: 12, height: 12, backgroundColor: c.hex}}/>`; active `style={{backgroundColor: c.hex, color: getReadableTextOn(c.hex)}}` |
| Active count badge | Inline-flex 16x16 ink-fill circle showing `activeCount` beside accordion title |
| URL grammar `?colour=<slug>,<slug>` | `buildHref` constructs via `URLSearchParams`; sorts the active set deterministically |
| Multi-select + intersect with `?category=` | `resolveProducts` executes 3-branch base then `filter((p) => allowedIds.has(p.id))` when `colourSlugs.length > 0` |
| Empty list (no library colour used) hides accordion | `chips.length === 0` early return null |
| Manual hydration (no LATERAL) | Both helpers use 6-parallel `select().innerJoin(products)` — `grep db.query.X.findMany src/lib/catalog.ts` returns 0 new occurrences |
| Codes/family/previous_hex never customer-facing | Audit grep on `src/app/(store)/` + `src/components/store/` returns 0 matches for `previous_hex`, `family_type`, `family_subtype` |

## Deviations from Plan

None — plan executed exactly as written. The only minor adaptation was lifting the 3-branch switch in `resolveProducts` from `return`-per-branch to `let base; ... return base` so the colour intersection runs uniformly afterward. This was anticipated by the plan's "Adapt to whatever the existing return shape is" guidance.

## Verification

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | Exits 0 (clean) |
| `npm run build` | SKIPPED per plan-level constraint (pre-existing CSS issue unrelated to this plan) |
| Customer-side audit grep | 0 matches for `previous_hex`, `family_type`, `family_subtype` in `src/app/(store)/` + `src/components/store/` |
| Manual-hydration discipline | 0 new `db.query.X.findMany({with})` introduced; 2 new `innerJoin(products)` blocks |
| Commits | 3 atomic commits (`9f3a21f`, `0208806`, `ad2c714`) |

## Commit Trail

- `9f3a21f` feat(catalog): add getActiveProductColourChips + getProductIdsByColourSlugs (18-08)
- `0208806` feat(shop): add ColourFilterSection sidebar accordion (18-08)
- `ad2c714` feat(shop): wire ColourFilterSection + ?colour= URL filter into /shop (18-08)

## Self-Check: PASSED

- [x] FOUND: src/lib/catalog.ts (modified — getActiveProductColourChips + getProductIdsByColourSlugs exported)
- [x] FOUND: src/components/store/colour-filter-section.tsx (created)
- [x] FOUND: src/app/(store)/shop/page.tsx (modified — SearchParams.colour, colourSlugs, resolveProducts intersection, ColourFilterSection mounted desktop+mobile)
- [x] FOUND commit: 9f3a21f (catalog helpers)
- [x] FOUND commit: 0208806 (component)
- [x] FOUND commit: ad2c714 (page wiring)
- [x] `npx tsc --noEmit` exits 0
- [x] Customer-side admin-field audit clean (0 matches)
