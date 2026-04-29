# Phase 18: Colour Management — Specification

**Created:** 2026-04-26
**Ambiguity score:** 0.16 (gate: ≤ 0.20)
**Requirements:** 8 locked

## Goal

Admin manages a central, reusable colour library (seeded once from `Colours/bambu-lab-colors.html` + `Colours/polymaker-colors.html`) and picks a per-product subset that flows into the existing variant system as a normal Colour axis. PDP renders the chosen colours as a swatch grid (hex + name); /shop offers a sidebar chip filter by colour name.

## Background

The variant system from Phase 16 already supports Colour as an option:

- Schema column `product_option_values.swatch_hex` (varchar 7) stores the hex per value (`src/lib/db/schema.ts:216`).
- Admin variant editor (`src/components/admin/variant-editor.tsx`) lets admin type `name` + `swatchHex` per value freeform.
- Storefront variant selector (`src/components/store/variant-selector.tsx:188`) auto-renders hex swatches when `swatchHex` is set on ≥1 value of an option.

What does NOT exist:

- A `colors` table (central library).
- An admin CRUD module for colours (`/admin/colours`).
- A seed script to parse the two HTML reference files.
- A "Pick from library" UX inside the variant editor — admin currently re-types every colour name and hex per product, with no reuse.
- An admin colour picker in the variant editor that surfaces brand/code/family for sourcing reference.
- A `/shop` colour filter.

The two HTML files in `Colours/` are static reference docs (Bambu PLA/PETG/CF + Polymaker lines, ~785 lines combined) — they sit on disk only as visual aids today.

## Requirements

1. **Colour library schema**: A new `colors` table holds the reusable colour catalogue.
   - Current: No `colors` table; hex values are typed freeform per-product into `product_option_values.swatch_hex`.
   - Target: New `colors` table with columns `id` (uuid), `name` (varchar 64), `hex` (varchar 7), `brand` (enum: Bambu | Polymaker | Other), `family` (varchar 32 — e.g. "PLA Basic", "PETG", "PLA-CF"), `code` (varchar 32, nullable — Bambu RFID code or Polymaker SKU), `is_active` (bool, default true), `created_at`, `updated_at`. Unique constraint on `(brand, code)` when code is non-null.
   - Acceptance: Drizzle schema migrates cleanly on MariaDB 10.11; `SHOW CREATE TABLE colors` matches Drizzle definition byte-for-byte; insert+select round-trip works for all columns.

2. **HTML seed script**: Both Bambu and Polymaker reference HTML files parse into the library on first run.
   - Current: HTML files exist only as static reference; no parsing.
   - Target: `tsx scripts/seed-colours.ts` parses `Colours/bambu-lab-colors.html` + `Colours/polymaker-colors.html`, extracts `{name, hex, code, family}` per entry, and upserts into `colors` with the correct `brand`. Idempotent — re-running yields zero changes when source unchanged. Uses `(brand, code)` natural key when code is non-null; `(brand, name)` when null.
   - Acceptance: After running on a clean DB, `SELECT COUNT(*) FROM colors WHERE brand = 'Bambu'` returns the count of distinct colours in `bambu-lab-colors.html`; same for Polymaker. Re-running the script produces zero INSERTs and zero UPDATEs in the script's logged report.

3. **Admin colour CRUD**: Admin manages the library at `/admin/colours`.
   - Current: No admin route, no CRUD endpoints, no UI exists for the colour library.
   - Target: List page with searchable/filterable table (search by name, filter by brand and family); create/edit form with `name`, `hex` (with native colour picker `<input type="color">`), `brand` dropdown, `family` text input, `code` text input; soft-archive (toggle `is_active`) and hard-delete actions. Table rows show hex swatch preview + name + brand + family + code + active status.
   - Acceptance: Admin can navigate to `/admin/colours`, create a new colour, edit it, archive it (it disappears from picker), reactivate it, and delete an unused colour. All operations use server actions guarded by `requireAdmin()` (Phase 1 / Phase 7 pattern).

4. **In-use deletion guard**: Hard-deleting an in-use library colour is blocked.
   - Current: No relationship between library and variants exists, so this scenario can't occur.
   - Target: Each `product_option_values` row that comes from the library stores `color_id` (nullable foreign key to `colors.id`, ON DELETE RESTRICT). Attempting to hard-delete a colour referenced by ≥1 `product_option_values` row returns an error listing every affected product (name + admin link). Admin must soft-archive instead. Soft-archive (`is_active = false`) is always allowed and hides the colour from the picker but keeps existing variant rows intact.
   - Acceptance: Given a colour used by Product A, calling `deleteColour(id)` returns error `{code: "IN_USE", products: [{id, name}]}`; calling `archiveColour(id)` succeeds and the colour disappears from the picker but Product A's PDP still renders correctly.

5. **Per-product colour picker (variant editor)**: Admin picks a per-product subset from the library when adding a Colour option.
   - Current: When admin adds an option named "Color", they type each value name and hex by hand — no library awareness, no reuse.
   - Target: Variant editor adds a "Pick from library" button when option name matches "Color" / "Colour" (case-insensitive). Clicking opens a modal with a flat searchable list of `is_active = true` colours; each row shows hex swatch, name, brand badge, family, and code (admin-only — visible in picker, NOT shown to customers on PDP). Search filters by name + brand + family + code. Admin ticks 1..N colours; on confirm, each becomes a `product_option_values` row with `color_id` populated, `value` = colour name, `swatch_hex` = colour hex (snapshot, kept in sync on rename via cascade UPDATE in `renameColour`). The freeform name+hex input remains as a "Custom one-off colour" fallback for non-library colours; freeform values store `color_id = NULL`.
   - Acceptance: Admin opens variant editor on a product, adds option "Colour", clicks "Pick from library", searches "Bambu PLA Galaxy", ticks 3 colours, confirms — 3 `product_option_values` rows appear with the right `value`, `swatch_hex`, and `color_id`; the cartesian generator produces variants for those 3 colours; freeform "Custom" path still works unchanged.

6. **Colour counts as 1 of 6 variant axes**: Colour participates in the existing 6-axis cap.
   - Current: Variant cap is enforced at 6 (positional `option1..option6` columns).
   - Target: No schema change needed. When admin adds Colour as a 7th option, the existing cap rejects it with the same error message used for any other option.
   - Acceptance: Test harness creates a product with 6 options already (Size, Material, Part, Finish, Pattern, Edition), attempts to add Colour as a 7th — server action returns the existing "Maximum 6 options reached" error.

7. **PDP swatch grid (customer)**: Customer-facing PDP renders Colour as a swatch grid showing hex + name.
   - Current: `variant-selector.tsx` already renders a swatch when `swatchHex` is set; name visibility depends on existing layout.
   - Target: For options of type Colour (auto-detected when ≥1 value has `swatchHex`), render hex circle + colour name printed under each swatch (always visible — not hover-only). The `code` field is NEVER shown on PDP (admin-only). Selection updates the variant exactly like Size/Material does today (existing reactivity contract from Phase 17).
   - Acceptance: PDP renders one swatch per available colour with name visible below the chip; `code` does not appear in the rendered HTML; tapping a swatch updates price/stock/image per existing Phase 17 behaviour; visual smoke test on a 6-colour product shows all swatches with readable names.

8. **/shop sidebar colour filter**: Customer filters /shop by colour name.
   - Current: `/shop` has a category sidebar filter; no colour filter exists.
   - Target: Sidebar adds a "Colour" section listing every colour value used by ≥1 active product (de-duplicated by colour name + hex). Each chip shows hex circle + name; clicking toggles inclusion. Multi-select supported. URL syncs to `?colour=galaxy-black,jade-white`. When ≥1 colour selected, /shop returns only products that have ≥1 active variant matching one of the selected colours. Plays nicely with existing category filter (intersect, not union).
   - Acceptance: With 3 products having "Galaxy Black" and 2 products having "Jade White", clicking both chips returns 5 products; URL becomes `/shop?colour=galaxy-black,jade-white`; deselecting both clears filter; selecting category + colour intersects (only products in both).

## Boundaries

**In scope:**
- New `colors` table (Drizzle schema + raw-SQL migration matching the live MariaDB 10.11 pattern).
- `tsx scripts/seed-colours.ts` parser for both HTML reference files (idempotent, brand-aware).
- `/admin/colours` CRUD page (list, create, edit, soft-archive, hard-delete with in-use guard).
- `color_id` FK column added to `product_option_values` (nullable; `NULL` = freeform/custom one-off).
- "Pick from library" picker modal in variant editor (search + brand badge + code/family display in admin only).
- Custom one-off hex entry preserved as fallback for non-library colours (existing freeform path stays).
- PDP swatch grid renders hex + name (always visible, never hover-only); `code` never customer-facing.
- /shop sidebar colour chip filter — multi-select, URL-synced, intersects with existing category filter.
- Cascade rename: editing a library colour's name or hex propagates to all `product_option_values` rows where `color_id` matches (transaction-safe).

**Out of scope:**
- Per-colour pricing UI — existing variant editor already supports per-row pricing including Phase 17 bulk toolbar; nothing extra needed.
- Bulk colour assignment across products (e.g. "apply colour X to all PLA products") — deferred; not important at this stage per user.
- Live re-import of HTML files post-seed — seed runs once; future colours added via admin manual form.
- Colour family grouping for filter (Red/Blue/Green/etc.) — /shop filter uses exact colour name only, not family-grouped.
- Customer-facing colour codes (Bambu RFID / Polymaker SKU) — admin-only.
- Filtering /shop by hex similarity / colour-distance algorithms — exact name match only.
- Multi-language colour names — English only (Malaysia market launch).

## Constraints

- MariaDB 10.11 — no LATERAL joins; if any new query joins `colors` to `product_option_values` to `product_variants` to `products` it must use manual hydration per `src/actions/products.ts` pattern (CLAUDE.md gotcha).
- Drizzle schema must be applied via raw-SQL DDL (not `drizzle-kit push`) per CLAUDE.md "do not run drizzle-kit push against remote" rule.
- App-generated UUIDs (`crypto.randomUUID()`) for `colors.id` per project pattern.
- All admin server actions must call `requireAdmin()` as the first `await` (CVE-2025-29927 mitigation per CLAUDE.md).
- Library size after both seeds: ~50–100 colours expected — full client-side picker grid is acceptable, no virtualization required.
- Colour-cascade rename (when admin edits a library colour's name/hex) must be a single DB transaction — partial updates leave product variants showing wrong colour.
- /shop colour filter query must reuse the existing /shop category-filter query pattern; do not introduce a separate query path.
- The existing `swatch_hex` column on `product_option_values` is preserved (back-compat snapshot). When `color_id` is non-null, `swatch_hex` is a denormalized cache kept in sync via cascade UPDATE.

## Acceptance Criteria

- [ ] `colors` table migrated on MariaDB 10.11; Drizzle schema matches `SHOW CREATE TABLE` byte-for-byte.
- [ ] `tsx scripts/seed-colours.ts` parses both HTML files and inserts ~50–100 rows; re-run produces 0 INSERTs / 0 UPDATEs.
- [ ] `product_option_values.color_id` column added (nullable, FK with `ON DELETE RESTRICT`).
- [ ] Admin can navigate to `/admin/colours`, create/edit/archive/delete a colour; all server actions gated by `requireAdmin()`.
- [ ] Hard-deleting a library colour with ≥1 `product_option_values` reference returns structured error `{code: "IN_USE", products: [...]}` and does NOT delete.
- [ ] Soft-archiving a colour hides it from the picker but does NOT break PDPs of products already using it.
- [ ] In variant editor: option named "Color"/"Colour" shows a "Pick from library" button; clicking opens searchable modal; ticking ≥1 colour creates `product_option_values` rows with correct `value`, `swatch_hex`, `color_id`.
- [ ] Custom one-off freeform hex input is still available; values created that way have `color_id = NULL`.
- [ ] Cascade rename: editing a library colour's `name` or `hex` updates every `product_option_values` row where `color_id` matches, in a single transaction.
- [ ] PDP renders Colour swatch grid with hex circle + name visible under each swatch (no hover-required); `code` does NOT appear in rendered HTML.
- [ ] Selecting a swatch on PDP updates price/stock/image per existing Phase 17 reactivity contract.
- [ ] Adding a 7th option (Colour) to a product with 6 existing options returns the existing "Maximum 6 options reached" error.
- [ ] /shop sidebar shows a "Colour" filter section listing every colour used by ≥1 active product.
- [ ] /shop colour filter is multi-select, URL-synced (`?colour=galaxy-black,jade-white`), and intersects with the existing category filter.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                    |
|--------------------|-------|------|--------|------------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | Picker-on-top of existing system locked  |
| Boundary Clarity   | 0.90  | 0.70 | ✓      | In/out scope explicit; 2 items deferred  |
| Constraint Clarity | 0.75  | 0.65 | ✓      | MariaDB + variant cap + library size     |
| Acceptance Criteria| 0.75  | 0.70 | ✓      | 14 pass/fail criteria                    |
| **Ambiguity**      | 0.16  | ≤0.20| ✓      |                                          |

## Interview Log

| Round | Perspective       | Question summary                                | Decision locked                                        |
|-------|-------------------|------------------------------------------------|--------------------------------------------------------|
| 1     | Researcher        | Relationship to existing `swatchHex` mechanism | Picker-on-top of existing flow; library powers picker   |
| 1     | Researcher        | Library schema columns                         | name + hex + brand + family + code (multi-select)      |
| 1     | Researcher        | HTML seed strategy                             | Parse once via idempotent seed script                  |
| 2     | Researcher        | Per-product colour subset                      | Admin picks subset per product (not all-by-default)    |
| 2     | Researcher        | PDP swatch UX                                  | hex + name visible always; admin sees code, customer doesn't |
| 2     | Simplifier        | Picker UI scope                                | Flat searchable list with brand+code+family in admin   |
| 3     | Boundary Keeper   | Library colour deletion                        | Block hard-delete when in-use; soft-archive allowed    |
| 3     | Boundary Keeper   | Variant axis count                             | Colour counts as 1 of 6 axes (no special case)         |
| 3     | Boundary Keeper   | Out of scope candidates                        | Initially flagged; expanded in Round 4                 |
| 4     | Boundary Keeper   | Scope clarification                            | All 4 candidates moved IN scope (later 2 trimmed in R5)|
| 4     | Failure Analyst   | Library size                                   | ~50–100 colours; no virtualization needed              |
| 4     | Failure Analyst   | Library updates post-seed                      | Manual add form in /admin/colours                      |
| 5     | Seed Closer       | Per-colour pricing concrete behaviour          | Out of scope — variant editor already handles it       |
| 5     | Seed Closer       | /shop colour filter behaviour                  | Sidebar chip filter by exact name; multi-select; URL-synced |
| 5     | Seed Closer       | Bulk colour assignment UX                      | Out of scope — not important at this stage             |

---

*Phase: 18-colour-management*
*Spec created: 2026-04-26*
*Next step: /gsd-discuss-phase 18 — implementation decisions (HTML parser strategy, picker modal component, schema migration sequencing)*
