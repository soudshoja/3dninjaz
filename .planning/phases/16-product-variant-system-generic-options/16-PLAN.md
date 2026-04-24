# Phase 16 — Product Variant System (Generic Options) — Master Plan

**Planner:** Opus 4.7
**Executor:** Sonnet (per wave, via Agent tool)
**Minor tasks:** Haiku (text-only edits, docs)
**Created:** 2026-04-24

## Architecture Decision Record

### AD-01 — Data Model: Normalized options + positional variant columns

```
product_options           (id, product_id, name, position)
product_option_values     (id, option_id, value, position, swatch_hex NULL)
product_variants          (existing table, REPLACE `size` with option value refs)
  + option1_value_id  FK → product_option_values.id  NULL
  + option2_value_id  FK → product_option_values.id  NULL
  + option3_value_id  FK → product_option_values.id  NULL
  + sku               VARCHAR(64)  NULL
  + image_id          VARCHAR(36)  NULL (points to a URL string; reuse productImages table if exists, else text)
  + label_cache       VARCHAR(200) NULL  ("Small / Red" — denormalized for fast rendering)
  + position          INT NOT NULL DEFAULT 0
```

**Why normalized values (not free-text in variant rows):**
- Rename propagates (change "Red" → "Crimson" at option_value level)
- Ensures admin can't create "Medum" vs "Medium" typos
- Shopify-proven pattern. MariaDB FK + cascade handles deletes cleanly.

**Why positional option1/2/3 (not a join table):**
- Narrow variant row; most queries hit 1 variant
- Avoids N+1 on variant lookup
- Max 3 options per product (Shopify default) — good enough for v1
- Adding a 4th later = additive column, no data rewrite

### AD-02 — Legacy `size` column: DROP after dual-read ships

- Phase 1: add new columns, keep `size` NOT NULL  
- Phase 2: backfill option1_value_id for every existing row (Size = S/M/L)  
- Phase 3: switch reads to option-based lookup with dual-read fallback
- Phase 4: wait 1 week of stable reads, then drop `size` column

Same treatment for `order_items.size` — keep frozen as historical snapshot, add `variant_label` (denorm text) to new orders.

### AD-03 — Migration via raw-SQL applicator (precedent Phase 5/6/7)

- `drizzle-kit push` hangs on remote MariaDB (documented project quirk)
- Use `scripts/phase16-migrate.cjs` pattern — idempotent DDL + backfill
- JSON columns stay LONGTEXT (MariaDB quirk) — not adding any in this phase

### AD-04 — Admin UX: separate "Manage Variants" route, not inline

- `/admin/products/[id]/variants` — new page  
- Reason: variant matrix can explode (3×3×4 = 36 rows) — doesn't fit in main product form
- Product form keeps basic fields (name/desc/category/images)
- "Manage Variants" button appears after initial save (needs product ID)

### AD-05 — Cart: store `variantId` only; derive label server-side

- Zustand `cart-store.ts` line item: `{ variantId, quantity }` (no size, no price)
- Checkout server action hydrates label + price + stock from DB at checkout time
- Prevents stale price/label in cart across schema changes
- `persist` middleware keyed as `print-ninjaz-cart-v2` (version bump = auto-clear old carts)

### AD-06 — SKU strategy: admin-editable, auto-suggest on create

- Auto-suggest pattern: `{product-slug-upper}-{OPT1}-{OPT2}-{OPT3}` (e.g., `NINJA-STAR-M-RED`)
- Admin can override before save
- UNIQUE constraint on `(product_id, sku)` — not global

### AD-07 — Legacy size-only products: auto-migrate on first write

- Backfill runs once at deploy via migrate script
- Creates "Size" option + S/M/L values + sets option1_value_id on each variant
- `label_cache` populated = "Small" / "Medium" / "Large"
- After backfill, existing products look identical on storefront (same size selector UX)

### AD-08 — Order items: add `variant_label` snapshot, keep `variant_id`

```
order_items.variant_label  VARCHAR(200) NULL  -- "Small / Red", frozen at order time
```
- Survives variant deletion (orders still readable)
- PDF invoice + email templates read `variant_label` directly
- Historical orders (pre-16): `variant_label` NULL → fall back to reading `size` column

## Wave Breakdown

| Wave | Plan | Scope | Depends on | Est | Agent |
|------|------|-------|------------|-----|-------|
| 1 | 16-01 | Schema + migrate script + Zod + requirements registration | — | 3h | sonnet |
| 1 | 16-02 | Backfill script + dual-read helpers in `src/lib/variants.ts` | 16-01 | 2h | sonnet |
| 2 | 16-03 | Admin `/admin/products/[id]/variants` — option editor + matrix generator | 16-02 | 5h | sonnet |
| 2 | 16-04 | Storefront PDP variant selector (handles N options, swatches for Color) | 16-02 | 3h | sonnet |
| 3 | 16-05 | Cart v2 (variantId only) + checkout/orders rewire + PayPal line items | 16-03, 16-04 | 4h | sonnet |
| 3 | 16-06 | Inventory + cost breakdown + CSV import adapted to new model | 16-05 | 3h | sonnet |
| 4 | 16-07 | Drop legacy `productVariants.size` column + parts-product seed + E2E smoke test + COMPLETION.md | 16-06 | 2h | haiku for docs, sonnet for drop |

Waves run sequentially. Within a wave, plans can run in parallel (16-03 and 16-04 independent after 16-02).

## Success Criteria (phase-level)

Copied verbatim from ROADMAP entry. Any NOT MET at verify-phase = phase fails.

1. Admin can define 1..3 options per product with arbitrary values
2. Cartesian variant matrix auto-generated; admin can delete combos, set per-variant price/stock/SKU/image
3. Existing products auto-migrate with zero customer-visible regression
4. Storefront PDP variant selector handles N options; price/stock/image update on selection
5. Cart, checkout, orders, inventory, cost breakdown, PayPal all reference variant_id + surface variant label
6. Admin creates a parts-based product with 5+ variants end-to-end PayPal flow

## Threat Model (secure-phase input)

| Threat | Mitigation |
|--------|------------|
| Variant ID tampering in cart (swap to cheaper variant) | Server action re-derives price from DB via variantId on every checkout capture |
| Variant deletion while in customer cart | Checkout rejects missing variantId with user-facing "item no longer available" |
| Admin options injection (script tags in option name) | Zod + existing DOMPurify rules on rendered HTML |
| Orphan options (option_values without an option) | FK cascade on delete + DB-level ON DELETE CASCADE |
| Stock race condition on parts products | Existing Phase 13 track_stock lock reused — no new race surface |
| PDPA — variant selection history | Not PII. Cart in localStorage only. No new retention surface. |

## Nyquist Validation Plan

- Integration test: admin flow — create product with 2 options (Size, Color), 3×2 matrix, set prices, buy one variant, verify order record shows correct label
- Integration test: legacy product flow — existing size-only product still works after migration
- Integration test: parts product — create 5-part product, buy 2 parts in one order, verify 2 line items with correct labels
- Unit test: `variants.ts` dual-read — both pre-migration and post-migration row shapes return same hydrated shape
- Unit test: cartesian expansion — 3×2×4 = 24 variants generated; 1×1 = 1 variant

## Out of Scope

- Variant-specific gallery (multiple images per variant) — single image per variant for v1
- Variant option types beyond text + swatch hex (no dropdowns, no radio with icons for v1)
- Bulk variant import/export via CSV — defer to Phase 16.1
- Draft variants / variant archiving — soft-delete via `inStock=false` is good enough
- More than 3 options per product

## Individual Plan Files

Executable plans are written to:
- `.planning/phases/16-product-variant-system-generic-options/16-01-PLAN.md`
- `16-02-PLAN.md` through `16-07-PLAN.md`

Each wave plan contains: exact task list, file touch list, acceptance criteria, commit message template. Executor agent follows the plan file verbatim.

## Runbook for Next Session

```bash
# Terminal: /clear
# 1. Verify SDK binary fix (if 2026-04-24 agent succeeded)
gsd-sdk query init.phase-op "0" | grep roadmap_exists

# 2. Execute Wave 1
/gsd-execute-phase 16      # or per-plan:
/gsd-execute-plan 16-01
/gsd-execute-plan 16-02

# 3. Between waves, verify
/gsd-verify-work           # conversational UAT on wave output

# 4. After Wave 4
/gsd-secure-phase 16       # threat model audit
/gsd-code-review 16        # code review on diff
/gsd-verify-work           # final UAT
```
