# Phase 17 — Variant System Enhancements + Legacy Cleanup + Reactivity Guarantee

**Status:** Planned (not yet executed)
**Added:** 2026-04-24 (planned 2026-04-22)
**Planner:** Opus 4.7 (1M context)
**Executor (planned):** Sonnet
**Deploy (planned):** Haiku
**Milestone:** v1.0 (post-launch hardening)

## Goal

Phase 16 shipped the generic variant system (options/values/variants) and the Ninja Robot Model Kit parts seed. A gap analysis against WooCommerce (see `.planning/phases/16-product-variant-system-generic-options/WOO-COMPARISON.md`) surfaced five purchase-blocking gaps. Phase 17 closes them, hardens admin-editor reactivity so every mutation renders without a page refresh, and sweeps up pre-variant-era remnants Phase 16 did not delete.

## Current State (what exists today, 2026-04-22)

### Variant data model (Phase 16)

- `product_options` table: `(id, product_id, name, position)` — UNIQUE(product_id, name), UNIQUE(product_id, position), max 3 per product
- `product_option_values` table: `(id, option_id, value, position, swatch_hex)` — UNIQUE(option_id, value)
- `product_variants` table — extended with `option1_value_id`, `option2_value_id`, `option3_value_id`, `sku`, `image_url`, `label_cache`, `position`. `size` column DROPPED (schema-side; live-DB drop via `scripts/phase16-cleanup.cjs`).
- `order_items.variant_label` VARCHAR(200) nullable (snapshot)
- `order_items.size` preserved nullable for historical order rendering

### Variant code surface

- `src/lib/variants.ts` — hydration + helpers (HydratedVariant type, composeVariantLabel, findVariantByOptions)
- `src/actions/variants.ts` — admin server actions (addProductOption, renameProductOption, deleteProductOption, addOptionValue, renameOptionValue, deleteOptionValue, generateVariantMatrix, updateVariant, deleteVariant, countVariantsAffectedByValueDelete, **getVariantEditorData** — added in commit 8e27f16)
- `src/components/admin/variant-editor.tsx` — 511 LOC client component
- `src/components/store/variant-selector.tsx` — PDP selector (swatches/pills, N options)
- `src/components/store/product-detail.tsx` — still imports `SizeSelector` + `SizeGuide` + contains legacy dual-path (hasGenericOptions branching, `AddToBagButtonV2` with `legacyShape` placeholder)
- `src/actions/uploads.ts` + `src/lib/storage.ts` — image upload pipeline (`writeUpload(bucket, file)`, sharp-pipeline output: 400/800/1600 w × avif/webp/jpeg)

### Reactivity (partial — commit 8e27f16)

`getVariantEditorData(productId)` exists and is called from `VariantEditor.refresh()`. After options/values mutations, the client re-fetches and setsOptions/setsVariants — no hard page reload. BUT: the existing `refresh()` still calls `router.refresh()` at the end, which triggers a server round-trip. Variant-field mutations (price, stock, SKU, trackStock, inStock) use optimistic `setVariants(prev.map(...))` but do NOT refetch — stale if server normalises the value. Delete-variant uses optimistic filter only.

## Known gaps this phase addresses

- The five WooCommerce parity gaps from `WOO-COMPARISON.md` (sale price, variant image upload + PDP swap, bulk edit, OOS hardening, default pre-selection) — see section A below.
- Per-variant Delyva shipping weight — see `SHIPPING-VARIANT-GAPS.md` for full gap analysis. Addressed via AD-08 (schema + admin input + quote rewire).

## Phase 17 scope

### A. The five gaps (all must land)

1. **Sale price per variant (CRITICAL)** — `sale_price` DECIMAL(10,2) NULL + optional `sale_from` / `sale_to` TIMESTAMP NULL; strikethrough regular price on PDP; "ON SALE" badge; effective price = `sale_price ?? price` when within window (or window not set).
2. **Variant image upload UI + PDP image swap (CRITICAL)** — image upload button per matrix row (reuses `writeUpload` + existing pipeline); PDP gallery swaps primary image to variant image when variant selected AND `imageUrl` is set; falls back to product gallery when null.
3. **Bulk price edit (CRITICAL)** — toolbar above matrix: "Set all to MYR X", "Multiply by N%", "Add fixed MYR X"; checkboxes per row select which rows the op applies to; "Apply to all" shortcut. Active toggle bulk op also included.
4. **OOS combo graying on PDP (CRITICAL)** — VariantSelector renders disabled state (already partially present — see threat model) — contract hardened so every disabled value shows tooltip "Out of stock" and cannot be selected even via keyboard.
5. **Default variant pre-selection (NICE)** — boolean `is_default` per variant; admin marks one default; PDP pre-selects it on load; falls back to first-available variant when none marked. DB-level check: at most one `is_default=true` per product (app-enforced in server action via transaction, MariaDB has no partial unique index).

### B. Admin editor reactivity contract (mandatory)

> **Reactivity Contract — Phase 17 (referenced from every mutation task)**
>
> Every admin mutation in `variant-editor.tsx` MUST update the rendered UI without a hard page navigation. Two patterns are acceptable:
>
> **Pattern A — Optimistic local update (preferred for idempotent field edits):**
> 1. Optimistically update local state (`setOptions` / `setVariants`) BEFORE the server action returns.
> 2. Call the server action inside a `startTransition`.
> 3. On success, no further action (local state already correct).
> 4. On error, ROLL BACK local state to the pre-mutation value and show toast.
>
> **Pattern B — Server refetch (preferred for shape-changing ops):**
> 1. Call the server action inside `startTransition`.
> 2. On success, call `getVariantEditorData(productId)` and replace `options` + `variants` from the response.
> 3. On error, show toast; do not re-fetch.
>
> **Do NOT call `router.refresh()` in either pattern.** The server component `page.tsx` renders once with initial data; subsequent state is client-owned.
>
> Mapping of mutations to patterns:
> | Mutation | Pattern |
> |---|---|
> | add option / rename option / delete option | B (cascade deletes variants — shape changes) |
> | add value / rename value / delete value | B (cascade deletes variants) |
> | generate matrix | B (inserts N variants) |
> | update variant field (price, salePrice, stock, sku, inStock, trackStock, isDefault) | A |
> | delete variant | A (filter locally) |
> | upload variant image | A (setVariants patches imageUrl) |
> | bulk edit (set all / multiply / add) | B (multi-row server update — refetch to confirm) |
> | mark default | B (server enforces single default via transaction — other rows' isDefault flip) |
> | toggle active (inStock bulk) | A if single row, B if bulk |

### C. Legacy cleanup inventory

Findings from the audit below must each land as an atomic commit in Wave 2's Plan 17-04. One task per row.

| # | Finding | Evidence | Action |
|---|---------|----------|--------|
| L-01 | `src/components/store/size-selector.tsx` still exists (121 LOC) — imported only by `product-detail.tsx` legacy path | grep `SizeSelector` → 2 files (own + PDP) | Delete file after PDP cleanup (L-04); remove import from product-detail.tsx |
| L-02 | `src/components/store/size-guide.tsx` stubbed to `return null` — 7 LOC ghost module | File is 8 lines, only returns null; imported by product-detail.tsx | Delete file + remove import + remove `<SizeGuide>` render + `hasSizeOption` branch in PDP |
| L-03 | `legacyShape` bridge + `AddToBagButtonV2` wrapper in `product-detail.tsx` (lines ~248–281) | Passes `size: "S" as const` placeholder; dead code since 16-05 cart v2 | Collapse `AddToBagButtonV2` to direct `<AddToBagButton>` call passing variantId only; remove legacy path + `legacySelectedVariant` + `SIZE_ORDER` + `sortedVariants` + `Size` type local + legacy Variant type |
| L-04 | PDP legacy fallback branch — `!hasGenericOptions` path renders `<SizeSelector>`, size sort, legacy `AddToBagButton` | product-detail.tsx lines 71–80, 163–170, 183–189 | After 16-02 backfill all live products have `options.length > 0`. Remove entire legacy branch; treat missing options as error state or simple "No variants" message |
| L-05 | `legacyAddToCart` + `LegacyCartItem` type in `src/stores/cart-store.ts` (lines 34–44, 196–213) | `@deprecated` marker + dev-mode warning; kept during rollout | Grep shows no callers in src/. Remove helper + type after grep-verify zero references |
| L-06 | `"S" \| "M" \| "L"` enum literals in source | grep results: `cart-store.ts:40` (LegacyCartItem — removed by L-05); `size-selector.tsx:8,18,24,47,48` (removed by L-01); `product-detail.tsx:16,267` (removed by L-03/L-04); `add-to-bag-button.tsx:12` (`size?` is optional post-16); `admin-bulk-import.ts:389` (NOT NULL placeholder comment says removed in 16-07 but line still lives); `validators.ts:33` (productVariantSchema.size enum — dead field); `scripts/seed-demo-products.ts` (pre-16 seed — update or remove) | Purge literal from each listed file; update validators.ts `productVariantSchema` to drop `size` field entirely (unused after 16-05 cart rewire); delete line 389 of admin-bulk-import.ts |
| L-07 | `legacyVariantToHydrated` helper reference in `src/lib/variants.ts` header comment line 8 | Function was removed but JSDoc still lists it | Delete stale comment line |
| L-08 | `generateVariantMatrix` defensive code block writing `size: "S"` is gone but comments reference it | `src/actions/variants.ts:435–436` — "Use 'S' as the legacy size for new variants" comment block | Delete comment block (insert block already drops size); no functional change |
| L-09 | Admin guide markdown asserts "Each product can have up to three variants based on size: Small, Medium, and Large" | `src/content/admin-guide/products/overview.md:10`; `src/lib/admin-guide-generated.ts:1090` | Rewrite sentence to describe generic options model; regenerate admin-guide-generated.ts |
| L-10 | `src/content/admin-guide/products/inventory.md` references "If you no longer want to track a size" | Line 36 + admin-guide-generated.ts:1386 | Replace with variant-centric phrasing; regenerate |
| L-11 | `scripts/seed-demo-products.ts` uses the deprecated `size/widthCm/heightCm/depthCm` shape | Script has 7 products × 3 sizes in legacy shape | Either delete script (preferred — superseded by `scripts/phase16-seed-parts.cjs`) or rewrite to generic options. Recommend delete |
| L-12 | `scripts/phase13-inventory-optional.cjs` references dropped `depth_cm` column in its `AFTER` clause | Line 122 — historical migration; DROP columns exist | Leave as-is (historical migration artifact, already applied) — but document in code comment that the reference is defunct |
| L-13 | `add-to-bag-button.tsx:12` has `size?: "S" \| "M" \| "L"; // optional post phase-16` field | After L-03 the only caller passes variantId only | Remove `size` from component props; verify no callers pass it after L-03 |
| L-14 | `productVariantSchema` in `src/lib/validators.ts:32–97` still declares `size: z.enum(["S","M","L"])` and (nothing else references this schema) | `z.enum(["S", "M", "L"])` on line 33. `productSchema.variants` uses this schema. | After 16 migration, product-form no longer uses per-size rows. Audit: is `productSchema` still used to CREATE products? If yes, can we drop the `size` field or is the legacy product creation path intact? — Finding triage in Plan 17-04 Task 1: remove `size` field if unused, keep schema otherwise |
| L-15 | Old `3dninjaz_v1.conf` Apache userdata config — legacy suffix remains even though domain swap moved app to `app.3dninjaz.com` | See `.planning/STATE.md` 2026-04-21 note; CLAUDE.md block | **FLAGGED, NOT ACTIONED.** Out of scope in Phase 17 (server-side infra debt). Logged in 17-PLAN Out of Scope section for a future infra phase |
| L-16 | CSV import supports both `price_s/m/l` back-compat AND generic `option1_*` | `src/actions/admin-bulk-import.ts:76–78`; `validators.ts:705–707`; `csv-upload.tsx:11–13` | Audit: is back-compat still needed? Admin has migrated all products per 16-02 backfill. Recommend remove back-compat in Wave 2 after verify no callers — one atomic commit |
| L-17 | `widthCm/heightCm/depthCm` legacy columns in `product_variants` — `scripts/phase16-drop-dimensions.cjs` was written and committed (fd79b3d), verify it ran on live DB | grep shows the cleanup script exists | Verify via DESCRIBE on live DB in Plan 17-05 smoke test. No code change needed if dropped. Per-variant dimensions **kept out of scope AGAIN — see AD-08 rationale**. Do NOT re-introduce dimension columns; only `weight_g` lands in Phase 17. |
| L-18 | Variant-label composition helper `composeVariantLabel` used only inside `variants.ts` and `actions/variants.ts` | Self-contained | No action. Helper is still useful |
| L-19 | Dead switch cases for size — none found in final grep | Only hits are in planning docs + historical migration scripts | No action |

## Open Questions

1. **Q-17-01 — Sale window timezone** — `sale_from` / `sale_to` stored as UTC TIMESTAMPs? Admin input likely MYT. Plan default: server-side compare against `new Date()` in UTC; admin input coerced to UTC before persist. Document in AD-01.
2. **Q-17-02 — Sale scheduling deferral** — Scheduled activation requires a cron-free approach (just time-gate at read site) OR a cron that re-hydrates. Default: time-gate at read (compare on every PDP render) — no cron needed. Deferred cron tasks listed in out-of-scope.
3. **Q-17-03 — Bulk edit scope** — Does the bulk op hit checked rows only, or does the admin always see "apply to all"? Default: checkboxes select rows; top checkbox is "select all"; ops apply to selected rows; ops disabled when 0 selected.
4. **Q-17-04 — Default variant uniqueness** — App-layer transaction (unset all other `is_default`, set this one) vs DB-level partial index (not available on MariaDB). Default: app-layer via `db.transaction`. Race: two admins marking defaults simultaneously — last write wins (acceptable). Documented in AD-05 threat model.
5. **Q-17-05 — Image upload MIME/size** — Reuse `writeUpload` existing caps (10 MB, JPEG/PNG/WebP/GIF). No new limits.
6. **Q-17-06 — "ON SALE" badge location on PDP** — Next to price, chip style. Default: purple chip "ON SALE" above price row when effectiveSalePrice < price.
7. **Q-17-07 — Variant image swap transition** — Instant swap vs fade. Default: instant (React re-render); fade optional NICE.
8. **Q-17-08 — OOS tooltip delivery** — Native `title` attr OR shadcn Tooltip? Default: native `title` (simple, accessible, works on mobile long-press). No new dep.

## Reactivity contract — canonical reference

See `17-PLAN.md` AD-06 for the full decision + rationale. Every plan file in Phase 17 MUST reference this AD when a mutation is added.

## Downstream impact

| Area | Change | Plan |
|------|--------|------|
| `product_variants` schema | Add `sale_price`, `sale_from`, `sale_to`, `is_default` | 17-01 |
| `src/lib/variants.ts` | Add `salePrice`, `saleFrom`, `saleTo`, `isDefault` to `HydratedVariant` | 17-01 |
| `src/lib/validators.ts` | Extend `variantUpdateSchema` | 17-01 |
| `scripts/phase17-migrate.cjs` | New raw-SQL applicator | 17-01 |
| `src/actions/variants.ts` | New actions: `uploadVariantImage`, `bulkUpdateVariants`, `setDefaultVariant` | 17-02 |
| `src/components/admin/variant-editor.tsx` | Sale price inputs, image upload per row, bulk toolbar, default toggle, row checkbox | 17-02 |
| `src/components/store/variant-selector.tsx` | Default pre-selection, tooltip refinement | 17-03 |
| `src/components/store/product-detail.tsx` | Effective price renderer, ON SALE badge, image swap via hydrated-variant selection, legacy path removal | 17-03, 17-04 |
| `src/stores/cart-store.ts` | Remove `legacyAddToCart`, `LegacyCartItem` | 17-04 |
| `src/components/store/size-selector.tsx` | Delete file | 17-04 |
| `src/components/store/size-guide.tsx` | Delete file | 17-04 |
| `src/components/store/add-to-bag-button.tsx` | Drop optional `size` prop | 17-04 |
| `src/lib/validators.ts` (schema) | Drop `size` field from `productVariantSchema` + audit CSV back-compat | 17-04 |
| `src/actions/admin-bulk-import.ts` | Remove legacy `size: "S" as const` line + evaluate price_s/m/l back-compat removal | 17-04 |
| `src/content/admin-guide/**` | Rewrite size-centric copy | 17-04 |
| `scripts/seed-demo-products.ts` | Delete (superseded) | 17-04 |
| PayPal/checkout/orders | None — variantId contract preserved | — |
| `order_items` schema | UNCHANGED — orders snapshot final price at capture | — |

## Success Criteria (phase-level)

All MUST be TRUE at verify-phase:

1. Admin edits a variant's `sale_price` → PDP shows strikethrough regular price + sale price + "ON SALE" badge
2. Admin uploads an image for a variant → row thumbnail updates without refresh; PDP gallery swaps primary image when that variant is selected
3. Admin ticks 3 rows + "Apply multiply 1.10x" → all 3 prices update in-table without refresh; DB reflects new prices
4. Admin toggles a variant to `is_default=true` → PDP loads with that combo pre-selected
5. Variant with `inStock=false` (or trackStock=true AND stock=0) is visually grayed on PDP; clicking does nothing + tooltip "Out of stock" shows
6. All 19 legacy-cleanup findings actioned (L-15, L-12, L-17, L-18, L-19 triaged as "no action" or "flagged only")
7. Every admin mutation reflects in the UI without a full page reload (reactivity contract)
8. TypeScript `npx tsc --noEmit` clean; no new lint errors
9. E2E: create a sale-priced size+color product + a parts product with a default + an OOS combo; checkout one of each via PayPal sandbox; confirm orders record correct `unitPrice` (sale price) and `variantLabel`

## Out of Scope (explicit)

- Variant-specific long description field
- Per-variant tax / shipping class overrides
- Sale-price cron for scheduled-activation notification (comparison happens at read time — no cron needed)
- Variant gallery (multi-image per variant) — single image only
- Renaming `/home/ninjaz/apps/3dninjaz_v1/` to drop the `_v1` suffix — server-side infra debt
- CSV export for variants (NICE-TO-HAVE from WOO gap)
- Drag-reorder of options, values, or variants (use `position` column + admin-set)
- Public REST / GraphQL API for variants
- Backorder state ("On backorder" enum)
- Weight / dimensions overrides per variant
- GTIN / UPC / EAN / ISBN fields
- Global attribute library (cross-product attributes)

## Execution Plan (per user directive)

- **Planner:** Opus 4.7 (this session)
- **Executor:** Sonnet — runs Plans 17-01..17-05 wave-by-wave
- **Deploy:** Haiku — runs migration + verify DESCRIBE + restart app

## Plan File Index

- `17-01-PLAN.md` — schema + Zod + migration (Wave 1)
- `17-02-PLAN.md` — admin editor extensions (Wave 1)
- `17-03-PLAN.md` — PDP updates (Wave 2)
- `17-04-PLAN.md` — legacy cleanup (Wave 2)
- `17-05-PLAN.md` — E2E + completion + ROADMAP/STATE (Wave 3)
