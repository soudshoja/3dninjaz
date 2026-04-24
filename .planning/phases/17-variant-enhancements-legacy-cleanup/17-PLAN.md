# Phase 17 — Variant Enhancements + Legacy Cleanup + Reactivity — Master Plan

**Planner:** Opus 4.7 (1M context)
**Executor:** Sonnet (per wave, via Agent tool)
**Deploy:** Haiku (migration + DESCRIBE verify + app restart)
**Created:** 2026-04-22
**Depends on:** Phase 16 (all 7 plans)

## Overview

Phase 16 landed the generic variant system. Phase 17 closes the 5 critical WooCommerce-gap items (sale price, variant image upload + PDP swap, bulk edit, OOS graying hardened, default pre-selection), codifies the admin-editor reactivity contract, and finishes the legacy-cleanup sweep Phase 16 did not complete. Zero regressions to the variant flow; zero changes to `order_items` schema (orders snapshot at capture time).

## Architecture Decision Record

### AD-01 — Sale price data model: direct columns + time-gate at read

We add three columns to `product_variants`:

```
sale_price  DECIMAL(10,2)  NULL   -- MYR, optional sale price
sale_from   TIMESTAMP      NULL   -- UTC start window (nullable = no start bound)
sale_to     TIMESTAMP      NULL   -- UTC end window   (nullable = no end bound)
```

**Effective price** resolves at read time:

```
is_sale_active(v, now) :=
  v.sale_price IS NOT NULL
  AND (v.sale_from IS NULL OR v.sale_from <= now)
  AND (v.sale_to   IS NULL OR v.sale_to   >= now)

effective_price(v, now) :=
  is_sale_active(v, now) ? v.sale_price : v.price
```

**Why direct columns (not a separate `price_rules` table):** one-to-one with variant; no JOIN; simplest read path in hot PDP render. Schema stays narrow.

**Why time-gate at read (not cron):** the comparison is O(1) per variant and happens inside `hydrateProductVariants`. A cron would introduce eventual-consistency and more failure surface. PDP correctness is guaranteed as long as server clock is sane.

**Why UTC TIMESTAMP (not DATETIME MYT):** MariaDB TIMESTAMP auto-converts to UTC at write + local at read given session timezone — we explicitly set the Node driver's timezone to UTC (already set per Phase 7 conventions) so the compare is consistent. Admin form inputs are MYT; converted to UTC on submit via `new Date(input).toISOString()`.

**Threat:** admin sets `sale_price > price`. Server action validates `sale_price < price`; reject otherwise (T-17-01-price-tampering).

**Order snapshot unchanged:** `order_items.unitPrice` records whatever the effective price was at capture. No new order column.

### AD-02 — Variant image upload: reuse Phase 7 `writeUpload` pipeline, store baseUrl in `imageUrl`

- New server action `uploadVariantImage(variantId, formData)` in `src/actions/variants.ts`.
- Uses existing `writeUpload(bucket, file)` where `bucket = productId` (same namespace as product images — variants live under `public/uploads/products/<productId>/<uuid>/`).
- `imageUrl` column already exists (Phase 16) and stores the pipeline baseUrl. PDP resolves via existing `pickImage(baseUrl)` helper (reads `manifest.json`).
- On upload, the action (1) writes new image, (2) optimistically updates `imageUrl`, (3) best-effort deletes prior `imageUrl` directory via `deleteUpload`.
- **MIME/size:** inherit pipeline caps (10 MB, JPEG/PNG/WebP/GIF allow-list) — no new surface.
- **Threat:** path traversal in bucket — `safeBucket(productId)` already sanitises (Phase 4 T-04-06). Variant image inherits that guard. (T-17-02-upload-abuse)

**Why baseUrl not individual files:** preserves Phase 7 srcset pattern — gallery uses the same `<picture>` pattern for variant images.

### AD-03 — Bulk edit UX: checkbox rows + 3 ops + preview

Toolbar above the matrix table with three buttons:

1. **Set all to MYR X** — set-all operation; input MYR; applies to selected rows.
2. **Multiply by X%** — percentage change (e.g., 110 = +10%); input number; preview shows new price per row; "Apply" commits.
3. **Add fixed MYR X** — addition (can be negative); applies to selected rows.

Selection:
- Per-row checkbox (left column)
- Header checkbox "Select all" (toggles every row)
- Ops button disabled when 0 rows selected
- "Apply to all" shortcut button on each op that sets selected = everything before submit

Also included: **Bulk active toggle** (inStock flag on all selected rows) — one-click.

Server action `bulkUpdateVariants(productId, variantIds, op)` where `op` discriminates on type. Single round-trip, validates all rows belong to productId, applies in a loop within `db.transaction`.

**Why checkboxes (not "all or nothing"):** admin may price a seasonal subset (e.g., Color=Red gets sale). Granular control ships.

**Why not a separate "bulk" page:** context-loss antipattern; bulk is most useful inline in the matrix.

### AD-04 — OOS combo gating: disable-and-tooltip, canonical implementation

`variant-selector.tsx` already has a partial implementation. Phase 17 hardens it:

- A value is **unavailable** when its test-combo variant is missing OR `!isVariantAvailable(v)` (where `isVariantAvailable` returns `(v.trackStock && v.stock > 0) || (!v.trackStock && v.inStock)`).
- Unavailable value renders with: `disabled=true`, `aria-disabled=true`, `tabIndex={-1}`, `title="Out of stock"`, greyed style, strikethrough text OR diagonal line on swatch.
- Click / keyboard Enter is a no-op.
- On mobile, long-press surfaces the `title` via native tooltip.

No new dep; `title` attribute is sufficient per Q-17-08.

### AD-05 — Default variant: boolean column + app-layer single-default invariant

```
is_default BOOLEAN NOT NULL DEFAULT FALSE
```

Server action `setDefaultVariant(variantId)` (new) executes inside `db.transaction`:
1. Fetch variant to get productId.
2. `UPDATE product_variants SET is_default=false WHERE product_id = ?`.
3. `UPDATE product_variants SET is_default=true WHERE id = ?`.

**Race condition:** two admins set different defaults concurrently. Resolution: last transaction wins (both succeed sequentially because InnoDB row locks serialise the UPDATE on productId). Result: eventually consistent to the later admin's choice. Acceptable for a single-admin store (T-17-03-default-race-condition).

**PDP behaviour:** `VariantSelector.initial` picks `variants.find(v => v.isDefault)` first, falls back to `variants.find(isAvailable)`, falls back to `variants[0]`.

**Why not partial unique index:** MariaDB does not support partial unique indexes (`WHERE is_default=true`). App-layer transaction is the only cross-platform approach.

### AD-06 — Reactivity contract (canonical)

*Referenced by every plan in Phase 17.*

Every admin mutation must render without a hard page navigation. Two allowed patterns:

**Pattern A — Optimistic local update**
Use for idempotent field edits (price, salePrice, stock, SKU, trackStock, inStock, isDefault-as-a-toggle-only, imageUrl-after-upload, delete-variant-by-filter).
1. Capture pre-mutation snapshot.
2. `setVariants` / `setOptions` optimistically.
3. Server action inside `startTransition`.
4. Rollback on error; toast on error; no-op on success.

**Pattern B — Server refetch via `getVariantEditorData`**
Use for shape-changing ops (add/rename/delete option, add/rename/delete value, generate matrix, bulk edit, set default — server normalises the default flag across siblings).
1. Server action inside `startTransition`.
2. On success, `getVariantEditorData(productId)` → replace state.
3. On error, toast; no replace.

**Never:** `router.refresh()`. Server component `page.tsx` renders once with initial data; subsequent state is client-owned.

**Why this contract:** Phase 16-07 left `router.refresh()` in `refresh()`. It works but triggers a full server round-trip that re-runs the variants page loader. For a 20-variant matrix this is 200+ ms of wasted work per edit. Pattern B via `getVariantEditorData` is ~25ms (3 queries only) and already exists.

### AD-07 — Legacy cleanup: one atomic commit per finding

Each finding in `17-CONTEXT.md`'s cleanup inventory table becomes a numbered task in Plan 17-04 with its own commit. Benefits:
- Atomic revert if any finding breaks something (unlikely, but cheap insurance)
- Readable git log
- Haiku deploy can cherry-pick if one finding is flagged later

### AD-08 — Per-variant shipping weight

Add `weight_g INT NULL` to `product_variants`. Weight resolution at quote time:

```
effective_variant_weight_g(variant, product) :=
  variant.weight_g                        -- per-variant override when set
  ?? product.shippingWeightKg * 1000      -- product-level fallback (kg → g)
  ?? 500                                  -- final default: 500 g
```

When the final default is used, `quoteForCart` emits a server-side `warn` log so we can surface rows with no weight data at all (both variant and product NULL).

**Rationale:** Delyva prices sub-3 kg parcels on actual weight; current product-level `shippingWeightKg` is variant-blind so every S/M/L (or parts) variant of a product ships at the same weight. For 3D prints the variant-to-variant weight variance can be 5–10× — Small keychain (10 g) vs Large bust (500 g), or a single Arm (30 g) vs a Full Set (250 g). Systematic misquote today either leaks margin on large variants or overcharges on small ones. Fixing the quote cost is minimal: one nullable column on `product_variants`, one admin input, and one `inArray` join in `quoteForCart`. See `SHIPPING-VARIANT-GAPS.md` for the full gap analysis.

**Trade-offs:**
- Adds one nullable column to `product_variants` and one batch-fetch JOIN in the hot checkout path (quote) — measured impact: one extra query, results cached per request.
- `CartItemForQuote` becomes `variantId`-mandatory. All producers already have the variantId available (Phase 16 AD-05 cart v2 stores variantId), so the contract narrowing is a type-only change.

**Rejected alternatives:**
1. **Per-variant dimensions (width/height/depth) now** — rejected as out of scope. Delyva currently ignores dimensions in our payload; weight alone closes the most expensive gap. Dimension support deferred to a later phase.
2. **Shipping class per variant** — rejected. Delyva aggregates multiple couriers (J&T, GrabExpress, Lalamove, MyPos, SPX) each with its own pricing rules; a single shipping-class enum doesn't map cleanly across that surface. Deferred to a later phase.

**Threat (T-17-09-weight-spoofing):** client cart could supply a fake low `variantId` to get a cheaper quote. `quoteForCart` always re-fetches `product_variants.weight_g` server-side; never trusts client-supplied weight values. Variant ownership already validated at checkout capture time via Phase 16-05 cart hydration.

## Wave Breakdown

| Wave | Plan | Scope | Depends on | Est | Agent |
|------|------|-------|------------|-----|-------|
| 1 | 17-01 | Schema (sale_price, sale_from, sale_to, is_default, **weight_g** per AD-08) + Zod + raw-SQL migration | Phase 16 complete | 1.5h | sonnet |
| 1 | 17-02 | Admin variant editor: sale price inputs, default toggle, bulk edit bar, image upload UI, **per-variant weight input (AD-08)**, **Delyva quote rewire to variant weight**, reactivity contract enforcement | 17-01 | 4h | sonnet |
| 2 | 17-03 | PDP: effective price + ON SALE badge + OOS hardened + default pre-selection + image swap | 17-01 | 2.5h | sonnet |
| 2 | 17-04 | Legacy cleanup — one atomic commit per finding (L-01 through L-16 actionable) | 17-03 (PDP path cleaned first) | 2.5h | sonnet |
| 3 | 17-05 | E2E smoke test (incl. **weight-driven Delyva quote delta, AD-08**) + COMPLETION.md + ROADMAP + STATE | 17-04 | 1h | haiku (docs) + sonnet (smoke) |

Waves run sequentially. Within Wave 2, 17-03 MUST land before 17-04 because cleanup L-02/L-03/L-04 rely on the new PDP path being wired. Wave 1 plans 17-01 and 17-02 run sequentially (17-02 needs 17-01 schema).

## Success Criteria (phase-level)

Copied verbatim from 17-CONTEXT.md. Any NOT-MET at verify-phase = phase fails.

1. Sale price renders with strikethrough + ON SALE badge on PDP
2. Variant image upload works from admin row; PDP gallery swaps on variant select
3. Bulk edit toolbar: set/multiply/add apply to selected rows; reactive
4. Default variant pre-selected on PDP load
5. OOS combos visually grayed + untouchable + tooltip
6. All 19 cleanup findings actioned (L-15/L-12/L-17/L-18/L-19 triaged as no-action or flagged)
7. Every admin mutation reactive (no full page reload) — per AD-06
8. `npx tsc --noEmit` clean
9. E2E PayPal sandbox checkout of a sale-priced product captures correct unit price
10. A variant with non-null `weight_g` drives the Delyva shipping quote for any cart containing that variant, verified by changing the weight and observing a quote delta (AD-08)

## Threat Model

| Threat | Mitigation | Plan |
|--------|------------|------|
| T-17-01-price-tampering — admin sets `sale_price > price` | Server action validates `sale_price < price`; reject otherwise | 17-01, 17-02 |
| T-17-01b-negative-price — bulk "Add fixed MYR -X" drives price ≤ 0 | Server-side clamp: post-op price `MUST be >= 0.01`; reject op with error | 17-02 |
| T-17-01c-percentage-overflow — "Multiply by 0%" zeroes all prices | Server validates multiplier `> 0`; reject `= 0`; `NaN` / `Infinity` caught by Zod | 17-02 |
| T-17-02-upload-abuse — file size / MIME / path traversal in variant image upload | Inherits Phase 4 T-04-06 path-traversal guard + Phase 7 10-MB + MIME allow-list | 17-02 |
| T-17-02b-upload-orphan — upload succeeds but DB update fails → orphan on disk | Best-effort: on DB failure, call `deleteUpload(url)` to clean up; log error | 17-02 |
| T-17-03-default-race-condition — two admins mark defaults concurrently | `db.transaction` serialises on productId via InnoDB row locks; last write wins; acceptable for single-admin store | 17-01, 17-02 |
| T-17-04-sale-timing-drift — server clock skew advances `sale_to` past admin's intent | Accept: server time is authoritative; admin is told "MYT" labels on form | 17-01 |
| T-17-05-sale-in-flight — customer loads PDP while sale is active, adds to cart, sale ends before checkout | Cart hydration `hydrateCartItems` re-resolves effective price; customer charged whatever is active at capture. Document in PDP help text if needed. | 17-03 |
| T-17-06-bulk-scope-leak — client sends variantIds from a different product | Server validates every variantId has `productId = input.productId`; else reject whole op | 17-02 |
| T-17-07-OOS-bypass-keyboard — disabled value clickable via TAB + Enter | `tabIndex={-1}` + `aria-disabled` + click guard; onClick early-returns | 17-03 |
| T-17-08-cleanup-silent-regression — deleting `SizeSelector` breaks a forgotten import | Wave-2 typecheck gate: `npx tsc --noEmit` must pass after each atomic cleanup commit | 17-04 |
| T-17-09-weight-spoofing — client cart supplies a fake low `variantId` to get a cheaper shipping quote | `quoteForCart` always re-fetches `product_variants.weight_g` server-side via `inArray`; never trusts client-supplied weight values | 17-02 |

## Nyquist Validation Plan

Each plan ships with a subset; executed fully at verify-phase.

- **Unit:** `is_sale_active` truth table — 8 combinations of (sale_price null|set, now inside|outside [from, to]) with from/to each (null|set); 16 rows ideally.
- **Unit:** `findVariantByOptions` + `is_default` fallback chain — (default set; no default, first-available; no available, variants[0]).
- **Integration:** admin flow — create product with Size=[S,M] × Color=[Red,Blue] → 4 variants → set variant (M, Red) to default + sale_price=RM15 (regular RM20) → PDP loads pre-selected on (M, Red) with strikethrough 20 + 15 + ON SALE badge.
- **Integration:** bulk edit — 10 variants → check 5 → "Multiply by 1.2" → 5 prices updated, 5 unchanged, no refresh.
- **Integration:** image upload — upload 800×800 JPEG → row shows thumbnail without refresh → PDP selecting variant swaps gallery primary to uploaded image.
- **Integration:** OOS — variant has `trackStock=true, stock=0` → its value chip greyed + has `title="Out of stock"` + click is a no-op.
- **E2E:** sale-priced product + parts-product-with-default + OOS-combo product → PayPal sandbox purchase flows → `order_items.unit_price` reflects sale price at capture.
- **Regression:** phase 16 flows unchanged — single-price variant (sale_price NULL) still renders normally; legacy size-only product backfilled per 16-02 still renders (no strikethrough).

## Out of Scope (explicit)

- Variant-specific long description field
- Per-variant tax class / shipping class overrides
- Sale-price cron / scheduled expiry — rejected by AD-01 (time-gate at read is sufficient)
- Variant gallery (multi-image per variant) — single image only for v1
- Renaming `/home/ninjaz/apps/3dninjaz_v1/` directory to drop `_v1` suffix — server-side infra debt; tracked in 17-CONTEXT L-15 "FLAGGED"
- CSV export for variants
- Drag-reorder UI for options / values / variants (use existing `position` column via admin forms)
- Public REST / GraphQL API for variants
- Backorder state enum ("On backorder")
- Per-variant dimensions (width/height/depth) — out of scope. Weight NOW in scope via AD-08. Shipping class per variant — deferred to a later phase.
- GTIN / UPC / EAN / ISBN identifier fields
- Global attribute library (cross-product attributes)
- Optimistic image upload preview using browser object-URLs (ship round-trip upload first)

## Backward Compatibility

- Variants with `sale_price = NULL`: unchanged rendering (just `price`).
- Variants with `is_default = FALSE` (default for all existing): PDP fallback chain — first available, else `[0]`.
- `imageUrl = NULL`: PDP falls back to product's `images[thumbnailIndex]` (existing behaviour).
- `order_items` schema untouched. Orders placed pre-Phase-17 continue to render unchanged.
- Cart store v2 (`variantId + quantity` only) unchanged — effective price resolves at hydration time.

## Runbook for Next Session

```bash
# Terminal: /clear
# Wave 1 — schema + admin editor
/gsd-execute-plan 17-01
# verify: DESCRIBE product_variants shows sale_price, sale_from, sale_to, is_default
/gsd-execute-plan 17-02
# verify: admin /admin/products/[id]/variants — sale price input + bulk toolbar + default toggle + image upload visible

# Wave 2 — PDP + cleanup
/gsd-execute-plan 17-03
/gsd-execute-plan 17-04
# verify: PDP sale strikethrough renders; legacy SizeSelector file removed

# Wave 3 — E2E + completion
/gsd-execute-plan 17-05

# After Wave 3
/gsd-secure-phase 17
/gsd-code-review 17
/gsd-verify-work
```

## Individual Plan Files

- `17-01-PLAN.md` — Wave 1: schema + Zod + migration
- `17-02-PLAN.md` — Wave 1: admin editor extensions + reactivity contract enforcement
- `17-03-PLAN.md` — Wave 2: PDP updates
- `17-04-PLAN.md` — Wave 2: legacy cleanup (19 findings)
- `17-05-PLAN.md` — Wave 3: E2E + COMPLETION + ROADMAP + STATE
