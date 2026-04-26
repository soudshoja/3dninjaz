# Phase 19: Made-to-Order Product Type — Implementation Context

**Created:** 2026-04-27
**Mode:** auto (no interactive discuss-phase — all decisions pre-locked)
**Source:** SPEC.md + memory `project_made_to_order_product_type.md` + demo `public/demo/configurable-product.html`

This file captures HOW the phase will be implemented. SPEC.md captures WHAT it delivers. plan-phase + planner agent treat the entries below as locked decisions.

---

## Locked Decisions (D-XX)

### D-01 — productType column placement and migration
- New column on `products`: `productType` ENUM('stocked','configurable') NOT NULL DEFAULT 'stocked'
- Migration script: `npx tsx scripts/migrate-add-product-type.ts` runs raw SQL `ALTER TABLE products ADD COLUMN productType ENUM('stocked','configurable') NOT NULL DEFAULT 'stocked' AFTER materialType`
- Drizzle schema mirrors with verification (`SHOW CREATE TABLE products`)
- All existing rows default to 'stocked' — no UPDATE needed (DEFAULT applies on ADD COLUMN)

### D-02 — product_config_fields table shape
```sql
CREATE TABLE product_config_fields (
  id          CHAR(36) NOT NULL PRIMARY KEY,
  productId   CHAR(36) NOT NULL,
  position    INT NOT NULL DEFAULT 0,
  fieldType   ENUM('text','number','colour','select') NOT NULL,
  label       VARCHAR(80) NOT NULL,
  helpText    VARCHAR(200) NULL,
  required    BOOLEAN NOT NULL DEFAULT TRUE,
  configJson  LONGTEXT NULL,                   -- JSON; mysql2 returns LONGTEXT, parse via ensureConfigJson()
  createdAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pcf_product FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE,
  KEY idx_pcf_product (productId, position)
);
```
- Drizzle schema in `src/lib/db/schema.ts` mirrors byte-for-byte
- UUIDs generated with `crypto.randomUUID()` on INSERT (CLAUDE.md MariaDB gotcha)

### D-03 — configJson per fieldType
- **text** — `{ maxLength: number, allowedChars: string /* regex char class */, uppercase: boolean, profanityCheck: boolean }`
- **number** — `{ min: number, max: number, step: number }`
- **colour** — `{ allowedColorIds: string[] /* refs colors.id from Phase 18 */ }`
- **select** — `{ options: Array<{ label: string, value: string, priceAdd?: number }> }`

A helper `ensureConfigJson(fieldType, raw)` parses LONGTEXT and validates shape via Zod per fieldType. Lives in `src/lib/config-fields.ts`.

### D-04 — Pricing tier columns (additive on `products`)
- `maxUnitCount` INT NULL — null for stocked, set for configurable
- `priceTiers` LONGTEXT NULL — JSON object `{"1":7,"2":9,...}`; null for stocked
- `unitField` VARCHAR(64) NULL — name of the field whose value-length drives lookup (`"name"` for keychain)

Read path: `ensureTiers(raw)` parses; lookup is `tiers[String(unitFieldValue.length)]`. Returns null if outside the table → "Add to bag" disabled with message.

### D-05 — Image gallery: schema + Sharp pipeline
- Existing `products.images` column kept; widen its JSON shape from `string[]` to `Array<{ url, caption?, alt?, widths: { 480, 960, 1440 }, formats: { webp, avif } }>` — backwards-compat read helper `ensureImagesArray(raw)` already exists; extend to `ensureImagesV2(raw)` that handles both old (string) and new (object) entries
- No image limit (drop any UI cap)
- Sharp pipeline (`src/lib/image-pipeline.ts`) extension: on each upload, generate WebP + AVIF at 480 / 960 / 1440 widths and store relative paths in the JSON object
- PDP rendering uses `<picture>` with AVIF + WebP `<source>` tags + JPEG fallback `<img srcset>`

### D-06 — Admin product-type radio + flip block
- Top of `/admin/products/new` form: two-card radio (Stocked / Made-to-order) — same component as the demo
- Edit page: same radio, but disabled with explanation if product has any of: variants attached, config fields attached
- Server action `updateProductType(productId, newType)` returns `{ok:false, error:"Cannot change product type with attached variants"}` if variants or config fields exist

### D-07 — Configurator builder page
- Path: `src/app/(admin)/admin/products/[id]/configurator/page.tsx`
- Component: `src/components/admin/configurator-builder.tsx` (mirrors variant-editor pattern)
- Server actions in `src/actions/configurator.ts`:
  - `getConfiguratorData(productId)` — list config fields for a product
  - `addConfigField(productId, fieldType, label, configJson, required)`
  - `updateConfigField(fieldId, patch)`
  - `deleteConfigField(fieldId)`
  - `reorderConfigFields(productId, orderedIds)`
  - `saveTierTable(productId, maxUnitCount, priceTiers, unitField)`
- Reactivity: Pattern B refetch on shape-changing ops (Phase 17 AD-06)
- Modal for add/edit field per fieldType — type-specific config form

### D-08 — Per-field colour subset picker (admin)
- Reuse `ColourPickerDialog` from Phase 18 (Plan 18-05) with a new prop `mode: "select-multiple" | "attach-to-option"`
- For configurator builder, mode = `"select-multiple"` — returns `string[]` of colour ids back to the field's configJson
- No DB writes from the picker itself in this mode — caller persists via `addConfigField`/`updateConfigField`

### D-09 — Pricing tier table editor UI
- Component: `src/components/admin/tier-table-editor.tsx`
- Inputs: `maxUnitCount` number input + `unitField` select (text fields on this product) + N price inputs (one per tier)
- "Auto-fill from base" button: prompts for a base + step, generates linear tiers as starting point
- Reduce-max confirms before truncation: `confirm("Reducing max from 8 to 5 will delete tiers 6,7,8 — continue?")`

### D-10 — PDP form rendering branch
- Existing `product-detail-client.tsx` checks `product.productType`; if `'configurable'` → renders `<ConfigurableProductView />`, else current variant flow
- New component: `src/components/store/configurable-product-view.tsx`
- Children: `<ConfiguratorForm fields={fields} />` — renders one input per field by fieldType
  - text → `<TextField field={f} value onChange validation>`
  - number → `<NumberField>`
  - colour → `<ColourField allowedColorIds onChange>`
  - select → `<SelectField options>`
- Live preview: `<KeychainPreview text={textValue} colors={colorValues} />` — generic SVG strip (works for any text product)
- Hero swap: track `userTouched` flag; on first input/click, swap hero from display image to preview; thumbstrip toggle to flip back

### D-11 — Cart payload + dedupe
- Extend cart line type in `src/lib/cart-store.ts`:
  ```ts
  type CartLine = {
    productId: string;
    variantId: string | null;
    qty: number;
    unitPrice: number;
    configurationData?: {
      values: Record<string /* fieldId */, string>;
      computedPrice: number;
      computedSummary: string;
    };
  };
  ```
- `addItem`: if line has `configurationData`, hash via stable JSON.stringify; existing line with same productId + same hash → qty++; else new line
- Stocked products: `configurationData` undefined → existing variantId-based dedupe untouched (this is the "≤5 lines added" backwards-compat constraint)

### D-12 — Order capture
- `order_line_items.configurationData` LONGTEXT NULL — JSON snapshot at checkout
- Migration adds the column; default null for existing/future stocked rows
- Order detail (admin + customer), invoice PDF, order email read this column and render `computedSummary` if present

### D-13 — Profanity allowlist storage
- Stored in a new admin setting (extend `site_settings` or similar) — JSON array of forbidden words, lowercase
- Validation: configurator text input runs `profanityCheck` if field flag set; checks `value.toLowerCase()` against the list
- Admin can edit the list via existing settings page (small future task — for v1, seed via `scripts/seed-profanity.ts` with a starter list)

### D-14 — Backwards compat enforcement
- Hard rule: no behavior change in `variant-editor.tsx`, `variants.ts`, `product-detail-client.tsx` (variant branch), `cart-store.ts` (variant branch), variant-related server actions
- Allowed touches: type widening to add `configurationData?` field on cart line; conditional branching via `productType` discriminant
- Total additive lines across these files: ≤5 (verified via `git diff --shortstat` after final commit)

### D-15 — Seed Custom Name Keychain
- `scripts/seed-keychain-product.ts` — idempotent (checks for slug `custom-name-keychain`)
- Inserts product + 1 text config field + 2 colour config fields + 1 primary display image
- Reads colour ids by name (Red, Black, White, Blue, Green for base; White, Gold, Black for letters)

### D-16 — Reactivity contract (admin configurator)
- Phase 17 AD-06 inheritance:
  - Add/rename/delete field → Pattern B (refetch via `getConfiguratorData`)
  - Reorder fields → Pattern A optimistic with rollback
  - Save tier table → Pattern B
  - Required toggle → Pattern A optimistic

### D-17 — Storefront /shop and category listing
- Configurable products show "From MYR X" using `priceTiers["1"]` (the smallest tier) — not a fixed price
- Listing thumbnail = primary display image
- Click → PDP

---

## File Map (touched / new)

### New files

```
.planning/phases/19-made-to-order-product-type/19-SPEC.md      [done]
.planning/phases/19-made-to-order-product-type/19-CONTEXT.md   [this file]
src/lib/config-fields.ts                                       [helper: ensureConfigJson + Zod schemas per fieldType]
src/components/admin/configurator-builder.tsx                  [admin builder UI]
src/components/admin/tier-table-editor.tsx                     [admin pricing tier editor]
src/components/admin/config-field-modal.tsx                    [add/edit field modal — switch by fieldType]
src/components/admin/product-type-radio.tsx                    [the Stocked/Made-to-order radio cards]
src/actions/configurator.ts                                    [server actions: get/add/update/delete/reorder fields, saveTierTable, updateProductType]
src/app/(admin)/admin/products/[id]/configurator/page.tsx      [configurator page]
src/components/store/configurable-product-view.tsx             [PDP root for configurable products]
src/components/store/configurator-form.tsx                     [renders fields by type]
src/components/store/keychain-preview.tsx                      [generic SVG name-strip preview]
src/components/store/configurable-image-gallery.tsx            [hero + thumbstrip with display + "Yours" preview]
scripts/migrate-add-product-type.ts                            [raw SQL DDL applicator + verification]
scripts/migrate-add-config-fields-table.ts                     [raw SQL DDL applicator + verification]
scripts/migrate-add-tier-pricing-cols.ts                       [adds maxUnitCount, priceTiers, unitField columns]
scripts/migrate-add-order-line-config.ts                       [adds order_line_items.configurationData]
scripts/seed-keychain-product.ts                               [idempotent seed]
src/content/admin-guide/products/made-to-order.md              [admin guide article]
```

### Touched files (additive only)

```
src/lib/db/schema.ts                            [add productType, maxUnitCount, priceTiers, unitField on products; new productConfigFields table; configurationData on order_line_items]
src/lib/image-pipeline.ts                       [add WebP/AVIF + multi-resolution srcset generation; backwards-compat read]
src/components/admin/product-form.tsx           [embed product-type-radio + flip block]
src/app/(admin)/admin/products/[id]/edit/page.tsx [conditional "Manage Variants" vs "Manage Configurator" button]
src/app/(admin)/admin/products/new/page.tsx     [show product-type-radio at top]
src/app/(store)/products/[slug]/page.tsx        [route to ConfigurableProductView when productType==='configurable']
src/components/store/product-detail-client.tsx  [≤5 line discriminant branch — render configurable view OR variant view]
src/lib/cart-store.ts                           [add configurationData to CartLine; dedupe-by-hash for configurable lines]
src/app/(admin)/admin/orders/[id]/page.tsx      [render configurationData summary]
src/app/(account)/account/orders/[id]/page.tsx  [render configurationData summary]
src/lib/order-emails/...                        [render configurationData summary in order email + invoice]
src/lib/db/schema.ts (revisit images)           [widen images JSON shape; ensureImagesV2 helper]
.planning/STATE.md                              [bump phase pointer]
.planning/ROADMAP.md                            [phase 19 status — Spec → Plan → Execute → Verify]
```

---

## Risks Acknowledged

- **R1 — Backwards compat regression**: existing 30+ stocked products break.
  - Mitigation: ≤5 line diff constraint on variant code path (D-14); manual smoke as acceptance criterion.
- **R2 — JSON parse round-trip**: MariaDB returns LONGTEXT for JSON; missing parse will return `[object Object]` strings.
  - Mitigation: `ensureConfigJson`, `ensureTiers`, `ensureImagesV2` helpers everywhere we read.
- **R3 — Sharp pipeline regression on existing images**: extending the pipeline could regenerate or break old image entries.
  - Mitigation: backwards-compat read in `ensureImagesV2`; only NEW uploads use the new pipeline; opt-in re-process script for old images later.
- **R4 — Cart dedupe edge case**: two configurations that differ only in JSON key order hash differently.
  - Mitigation: stable JSON stringification (sort keys) before hashing.
- **R5 — Profanity false-positives**: the allowlist is small; Scunthorpe-style false positives possible.
  - Mitigation: word-boundary match (regex `\bword\b`); admin can edit list; v1 seed list is conservative.

---

## What's NOT Discussed (Phase 19+)

- Variant pivot grid + multi-select (deferred Phase 20)
- User & Role Management (deferred Phase 20)
- Multi-driver pricing (deferred future)
- Live 3D preview (deferred future)

---

*Phase: 19-made-to-order-product-type*
*Context created: 2026-04-27*
*Next step: gsd-planner generates PLAN files (split into waves)*
