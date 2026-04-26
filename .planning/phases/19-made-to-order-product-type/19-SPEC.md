# Phase 19: Made-to-Order Product Type — Specification

**Created:** 2026-04-27
**Ambiguity score:** 0.08
**Requirements:** 11 locked

## Goal

Add a second product type (`'configurable'` / "made-to-order") alongside the existing `'stocked'` (variant-based) products. Admin chooses the type at product creation; the choice locks the editor flow (variant matrix vs configurator builder). Made-to-order products have customer-fillable inputs (text/number/colour/select), per-field admin-curated colour subsets, and a tier-table price lookup. The seed product is the **Custom Name Keychain**. Existing products auto-migrate to `productType='stocked'`; the variant code path is touched by zero lines of behavior change.

## Background

Today every product is a stocked variant product (`products.materialType` + `productOptions` + `productOptionValues` + `productVariants`). The admin variant editor lives at `src/components/admin/variant-editor.tsx`, the storefront PDP variant picker at `src/components/store/product-detail-client.tsx` (with helpers in `src/lib/variants.ts`), and the cart at `src/lib/cart-store.ts`. Image upload runs through Sharp in `src/lib/image-pipeline.ts` for stocked products today.

The Custom Name Keychain (a print-on-demand product where customer types a name and picks colours) does not fit this model. There is no shelf to count — every order is unique. Forcing it into the variant matrix gives millions of theoretical SKUs with no real stock.

This phase introduces a parallel product type with a configurator builder, tier-table pricing, and a live-preview PDP. The existing variant flow is preserved unchanged for backwards compat.

All 9 design decisions are pre-locked (see `.claude/projects/.../memory/project_made_to_order_product_type.md`):

1. Field types in v1: text · number · colour · select
2. Pricing: tier table (admin sets fixed MYR per unit count; lookup not multiplication)
3. Text validation: per-field `allowedChars` regex + global profanity allowlist
4. Stock model: no per-row stock; `isActive` only
5. Per-field colour subsets: each colour field stores `allowedColorIds[]` admin-curated from the colour library
6. Image gallery: no image limit; admin caption per image; Sharp WebP/AVIF + multi-resolution srcset
7. Preview: generic SVG name strip; PDP swaps display-image hero to live preview on first interaction
8. Cart dedupe: hash configurationData JSON; same hash → qty bump; different hash → new line
9. Backwards compat: existing products auto-migrate to `'stocked'`; variant editor + variant code path untouched

Visual reference: `public/demo/configurable-product.html`.

## Requirements

1. **productType discriminator**: Every product has an explicit type that selects the editor and PDP flow.
   - Current: `products` table has no `productType` column — every product is implicitly variant-based
   - Target: `products.productType` ENUM('stocked','configurable') NOT NULL DEFAULT 'stocked'; migration sets all existing rows to 'stocked'; Drizzle schema mirrors `SHOW CREATE TABLE` byte-for-byte
   - Acceptance: `SELECT DISTINCT productType FROM products` returns only `'stocked'` after migration; manually inserting a 'configurable' row succeeds; admin "New Product" form persists the chosen type

2. **product_config_fields table**: Configurator inputs are stored per product, ordered, typed, with per-type constraints in JSON.
   - Current: No table exists — only `productOptions` + `productOptionValues` for variants
   - Target: New `product_config_fields` table with id (UUID PK), productId (FK products), position (INT), fieldType ENUM('text','number','colour','select'), label (VARCHAR 80), helpText (VARCHAR 200 NULL), required (BOOLEAN), configJson (JSON), createdAt, updatedAt
   - Acceptance: Migration creates the table; Drizzle schema matches `SHOW CREATE TABLE` byte-for-byte; foreign key cascades on product delete; the keychain seed inserts 1 text field + 2 colour fields successfully

3. **Admin product-type radio at creation**: Admin picks Stocked vs Made-to-Order before name/description/etc.
   - Current: `/admin/products/new` jumps straight into a single form for stocked products
   - Target: New radio control at the top of `/admin/products/new` (and Edit) with "Stocked" and "Made-to-order" cards; selection persists `productType`; choice gated for an existing product if it already has variants OR config fields (cannot flip type when data is attached, only when empty)
   - Acceptance: Creating a new product with "Made-to-order" persists `productType='configurable'`; an existing stocked product with variants cannot be flipped to configurable (form shows blocking message); attempting via API returns `{ok:false,error:"Cannot change product type with attached variants"}`

4. **Configurator builder UI (admin)**: Admin defines fields for a made-to-order product.
   - Current: No configurator builder exists
   - Target: New `/admin/products/[id]/configurator` page (mirrors the variants page). Renders a list of fields with drag-to-reorder, edit, delete, required toggle. "Add field" presents a 4-button row (Text · Number · Colour · Select). Each type opens a modal with type-specific config (allowedChars, min/max, allowedColorIds[], select options). Server actions: `addConfigField`, `updateConfigField`, `deleteConfigField`, `reorderConfigFields`. Reactivity Pattern B (refetch) on shape-changing ops.
   - Acceptance: Admin can add a Text field "Your name" with `{maxLength:8, allowedChars:"A-Z", uppercase:true, profanityCheck:true}`; add 2 Colour fields with admin-picked allowedColorIds; reorder via drag; delete a field with confirmation; "Manage Configurator" button replaces "Manage Variants" on a configurable product's edit page

5. **Per-field colour subset (admin-curated)**: A configurable product's colour field exposes only the admin's chosen subset to the customer.
   - Current: No colour-field concept exists; colour library exists from Phase 18
   - Target: Colour-type config field stores `configJson.allowedColorIds: string[]` referencing `colors.id`. Admin builder includes a colour-library picker (re-used from `ColourPickerDialog` if practical). Customer PDP renders only those colours.
   - Acceptance: Colour field with `allowedColorIds: [redId, blackId, whiteId, blueId, greenId]` renders exactly 5 swatches on PDP — no others. Adding a 6th id immediately makes it appear after admin save (Pattern B refetch)

6. **Pricing tier table editor (admin)**: Admin sets max unit count + a fixed MYR price per unit count from 1..max.
   - Current: No pricing on `products` is unit-count-aware
   - Target: New columns `products.maxUnitCount` (INT NULL), `products.priceTiers` (JSON NULL — `{"1":7,"2":9,...}`), `products.unitField` (VARCHAR 64 NULL — name of the field driving the lookup, e.g., "name"). Admin tier table editor renders a row per integer 1..maxUnitCount with a price input. "Auto-fill from base" button populates with a simple linear formula as a starting point. Validation: each tier ≥ 0; tier count = maxUnitCount.
   - Acceptance: Saving `maxUnitCount=8` + tiers `{1:7,2:9,3:12,4:15,5:18,6:22,7:26,8:30}` + `unitField="name"` persists; admin can edit any tier inline; reducing maxUnitCount confirms before truncating excess tiers

7. **Image gallery — no limit, captions, Sharp WebP/AVIF + srcset**: Product images are unlimited, captioned, and served at multiple resolutions in modern formats.
   - Current: Image pipeline exists in `src/lib/image-pipeline.ts` but per-product image count cap (current cap or single-image limit) and caption-per-image storage need verification; srcset generation may not exist for all surfaces
   - Target: Lift the per-product image count cap to none; add `caption VARCHAR 200 NULL` to whatever holds product images today (most likely `products.images` JSON array of `{url, caption}` records — schema decision finalized in plan-phase). Sharp pipeline produces WebP + AVIF + ≥3 widths (e.g., 480, 960, 1440). PDP `<picture>` / `<img srcset>` consumes them.
   - Acceptance: Uploading 8 images on a configurable product saves all 8; each image has an admin-editable caption shown under it in admin and as `alt`/figure caption on PDP; serving the PDP returns srcset URLs for at least 3 widths in WebP+AVIF; total LCP image weight on PDP ≤ 200 KB at 1440-wide viewport (verify via curl + content-length)

8. **PDP form + live preview + tier-lookup price meter**: Customer sees admin's display image first; once they type or pick a colour, hero swaps to a live SVG preview. Price meter shows tier lookup.
   - Current: PDP renders variant pickers via `product-detail-client.tsx`; no configurator UI
   - Target: New branch in `product-detail-client.tsx` (or sibling `product-detail-configurable.tsx`) for `productType==='configurable'`. Renders: hero with thumbstrip (display images + a "Yours" thumbnail for live preview), form fields per `product_config_fields`, live SVG name-strip preview (colour-aware, uppercase, max-N chars), live price meter showing `priceTiers[currentLength]`. First text-input event OR first colour pick auto-swaps hero from "Display" to "Yours". Customer can flip back via thumbnail click. "Add to bag" disabled until all required fields filled and unit count > 0.
   - Acceptance: With keychain seed, typing "JACOB" updates preview row to show 5 keycaps in current colours; price tag reads "MYR 18"; clicking "Display" thumbnail returns hero to admin's primary image; clearing the input disables "Add to bag"

9. **Cart line carries configurationData; dedupe by JSON hash**: A made-to-order cart line stores the configuration; identical configurations stack as qty, different ones become new lines.
   - Current: Cart line in `src/lib/cart-store.ts` carries productId + variantId + qty + price snapshot
   - Target: Add `configurationData: ConfigurationData | null` to cart line type. ConfigurationData is `{ values: Record<fieldId, string>, computedPrice: number, computedSummary: string }`. Cart `addItem` for configurable product hashes the JSON; identical hash on same product → qty++; different → new line. Cart drawer + `/bag` row UI renders `computedSummary` (e.g., `"\"JACOB\" (5 letters) · Red base+chain · White letters"`). Order capture snapshots configurationData into `order_line_items`.
   - Acceptance: Adding 2 keychains with identical config → 1 cart line, qty 2; adding a 3rd with different name → 2 cart lines; navigating to `/bag` shows both with summaries; checking out persists configurationData into `order_line_items`; admin order detail + customer order detail + invoice PDF + order email all render the summary

10. **Backwards compat — variant flow untouched**: Existing stocked products keep working without any behavior change.
    - Current: All existing 30+ products are stocked variant products
    - Target: Migration sets `productType='stocked'` for every existing row; variant editor + PDP variant picker + cart variant flow + admin product CRUD untouched; type-discriminating code lives only at the surfaces that branch (admin Edit page, admin product list rendering of "Manage Variants" vs "Manage Configurator", PDP root, cart line rendering, order detail rendering)
    - Acceptance: Manual smoke after migration: open any existing T-shirt-style product → variant editor opens unchanged → PDP renders unchanged → add-to-bag works unchanged → checkout works unchanged. Automated check: zero changes (line count) in `variant-editor.tsx`, `variants.ts` server actions, the PDP variant-selector component, and `cart-store.ts` variant code paths beyond the additive `configurationData` field

11. **Seed product: Custom Name Keychain**: A working made-to-order product exists post-migration so admin and developer can smoke the feature end-to-end.
    - Current: No keychain product exists in the catalog
    - Target: Idempotent seed script (`scripts/seed-keychain-product.ts` or admin-built via the new UI) creates one product with: name "Custom Name Keychain", productType='configurable', maxUnitCount=8, priceTiers `{1:7,2:9,3:12,4:15,5:18,6:22,7:26,8:30}`, unitField="name", 1 text field "Your name" (max 8, A-Z, uppercase, profanity on), 2 colour fields ("Base + chain colour" with 5 allowedColorIds, "Letter colour" with 3 allowedColorIds), 1 primary display image
    - Acceptance: After seed, `/products/custom-name-keychain` renders the configurator PDP, customer flow types JACOB → Add to bag → checkout → order shows the configuration; second run of seed is a no-op (no duplicate row)

## Boundaries

**In scope:**
- `productType` discriminator + migration to set existing products to `'stocked'`
- `product_config_fields` table (text/number/colour/select)
- Admin product-type radio at create/edit (with type-flip block when data attached)
- Admin configurator builder page (4 field types, drag reorder, edit, delete, required toggle, type-specific config modal)
- Per-field colour-subset persistence and PDP enforcement
- Pricing tier table editor + persistence (`maxUnitCount`, `priceTiers`, `unitField`)
- Image gallery overhaul: no count limit, admin caption per image, Sharp WebP/AVIF + multi-resolution srcset, PDP `<picture>`/srcset rendering
- PDP configurable branch: form rendering, live SVG preview, hero swap, tier-lookup price meter
- Cart `configurationData` payload + dedupe-by-hash
- Order capture: snapshot configurationData into `order_line_items`
- Order detail (admin + customer), invoice PDF, order email render the configuration summary
- Backwards compat for existing stocked products (zero behaviour change)
- Seed Custom Name Keychain product

**Out of scope:**
- Multi-unit-driver pricing (e.g., charge by `name × material` simultaneously) — v1 supports a single `unitField`; multi-driver pricing is future work
- Per-letter colour selection (J=red, A=blue) — true configurator territory, deferred until a product needs it
- Variant + configurator hybrid product (a product that's both stocked AND has personalization fields) — not needed for keychain
- Admin-defined preset "looks" (one-tap colour combos) — covered by Select field type today; richer preset UI is future
- Live 3D preview — generic SVG name-strip is sufficient for v1
- Stock counting per filament colour — out of scope; `isActive` is the only on/off
- Variant editor pivot grid + multi-select (Phase 20+ deferred work, see `project_variant_editor_pivot_grid.md`)
- User & Role Management (Phase 20)
- Bulk personalization upload (CSV of names) — future
- Variable max unit count per cart line (e.g., one product line carries different lengths) — qty handles this naturally; no new feature

## Constraints

- **Database**: MariaDB 10.11 — no LATERAL joins; manual hydration pattern (see `src/actions/products.ts` `getProduct`/`getProducts` for reference). JSON columns return as LONGTEXT — `priceTiers` and `configJson` reads must round-trip through a JSON parser.
- **App-generated UUIDs**: `crypto.randomUUID()` on INSERT; do not rely on SQL `UUID()` or `$returningId()`.
- **Schema parity**: After Drizzle changes, verify `SHOW CREATE TABLE` byte-for-byte against the Drizzle schema (CLAUDE.md MariaDB gotcha).
- **Auth**: Every admin server action must `await requireAdmin()` as the first await (CVE-2025-29927).
- **Image pipeline**: Sharp is already in the stack; the WebP/AVIF + srcset addition must work without breaking Phase 7's existing image pipeline contracts.
- **Reactivity (admin)**: Configurator builder follows Phase 17 AD-06 — Pattern B refetch via getProductConfiguratorData on shape-changing ops; Pattern A optimistic for idempotent field edits like rename.
- **Reactivity (customer)**: PDP form is client-state only until "Add to bag"; live preview must update synchronously on input/click.
- **Profanity allowlist**: Small word list at v1 — design extension point so admin can edit it later without schema change.
- **Backwards compat**: Variant code path is forbidden territory — diff lines added to existing variant files must be ≤5 (purely additive imports / type widening if any).

## Acceptance Criteria

- [ ] `products.productType` ENUM('stocked','configurable') NOT NULL DEFAULT 'stocked' exists; all existing rows = 'stocked' after migration
- [ ] `product_config_fields` table exists with all columns above; FK cascades to products on delete
- [ ] `products.maxUnitCount` INT NULL, `products.priceTiers` JSON NULL, `products.unitField` VARCHAR 64 NULL exist
- [ ] Admin "New Product" presents Stocked vs Made-to-Order radio at the top
- [ ] An existing stocked product with variants cannot flip to configurable (UI blocks + server action returns error)
- [ ] `/admin/products/[id]/configurator` exists for configurable products and supports add/reorder/edit/delete of all 4 field types
- [ ] Colour field's `allowedColorIds` controls exactly which swatches render on PDP — no leakage of full library
- [ ] Pricing tier table editor saves `maxUnitCount` + `priceTiers` correctly; reducing max prompts before truncating
- [ ] Image upload accepts unlimited images; each has an admin caption; Sharp produces WebP + AVIF + ≥3 widths per image
- [ ] PDP for configurable product hero defaults to admin display image; first text input or colour pick swaps to live preview; thumbnail toggles work
- [ ] Live SVG preview reflects current text + colours; price meter reads tier-lookup price
- [ ] Cart `addItem` for configurable bumps qty on identical configurationData hash; creates new line on different
- [ ] Order capture snapshots configurationData; admin + customer order detail + invoice PDF + order email render summary
- [ ] Existing T-shirt product manual smoke: variant editor unchanged, PDP unchanged, cart unchanged, checkout unchanged
- [ ] Seed Custom Name Keychain creates one product with all fields + tiers + display image; second run is a no-op
- [ ] Diff in variant-editor.tsx, variants.ts, store variant picker, and cart variant code path is ≤5 additive lines combined

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                         |
|--------------------|-------|------|--------|---------------------------------------------------------------|
| Goal Clarity       | 0.95  | 0.75 | ✓      | New productType + configurator + tier pricing — concrete      |
| Boundary Clarity   | 0.95  | 0.70 | ✓      | Variant flow untouched is hard line; out-of-scope explicit   |
| Constraint Clarity | 0.85  | 0.65 | ✓      | MariaDB, Drizzle, Sharp, requireAdmin all known constraints   |
| Acceptance Criteria| 0.90  | 0.70 | ✓      | 16 pass/fail checkboxes; per-requirement acceptance defined   |
| **Ambiguity**      | 0.08  | ≤0.20| ✓      | Pre-locked decisions in memory eliminated normal ambiguity    |

## Interview Log

| Round | Perspective    | Question summary                                          | Decision locked                                                   |
|-------|----------------|----------------------------------------------------------|-------------------------------------------------------------------|
| —     | Pre-locked     | All 9 design decisions locked from demo iterations 2026-04-27 | Captured in `project_made_to_order_product_type.md`            |
| —     | Researcher     | What in the codebase will this touch?                    | Schema (products + new table), admin product-form, PDP, cart, orders |
| —     | Simplifier     | Minimum viable for keychain go-live?                     | productType + 4 field types + tier pricing + PDP + cart + 1 seed |
| —     | Boundary Keeper| What MUST NOT change?                                     | Variant editor, variant code path, all existing products' behavior |
| —     | Failure Analyst| Worst-case mistake?                                       | Variant flow regression on existing 30+ products → blast radius huge → backwards-compat is hardest acceptance check |

[--auto path: skipped interactive Socratic loop because pre-locked decisions in memory passed the gate on first scoring (ambiguity = 0.08).]

---

*Phase: 19-made-to-order-product-type*
*Spec created: 2026-04-27*
*Next step: /gsd-discuss-phase 19 — implementation decisions (schema details, file paths, Sharp pipeline integration, profanity allowlist storage)*
