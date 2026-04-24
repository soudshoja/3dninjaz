# Phase 17 — Variant Enhancements + Legacy Cleanup: COMPLETION

**Completed:** 2026-04-22
**Plans:** 5/5 shipped (17-01 through 17-05)
**Commits:** ~18 commits (17-01: 1, 17-02: 1, 17-03: 1, 17-04: ~11 atomic cleanup commits, 17-05: 1)
**TypeScript:** clean (`npx tsc --noEmit` green after every commit)

---

## Summary

Phase 17 closed the 5 critical WooCommerce feature gaps identified in the Phase 16 gap analysis, codified the admin-editor reactivity contract, and executed a 19-finding legacy cleanup sweep. The codebase now has zero references to the pre-variant-era size/dimensions model (outside historical order rendering).

---

## What Shipped (by plan)

### 17-01 — Schema + Zod + Migration
- 5 new columns on `product_variants`: `sale_price DECIMAL(10,2)`, `sale_from TIMESTAMP`, `sale_to TIMESTAMP`, `is_default TINYINT(1)`, `weight_g INT`
- `HydratedVariant` type extended with `salePrice`, `saleFrom`, `saleTo`, `isDefault`, `effectivePrice`, `isOnSale`, `weightG`
- `hydrateProductVariants` computes `effectivePrice` and `isOnSale` at read time (AD-01 time-gate)
- `variantUpdateSchema` in validators.ts extended with all Phase 17 fields
- `scripts/phase17-migrate.cjs` — idempotent raw-SQL applicator (same pattern as phase16-migrate.cjs)

### 17-02 — Admin Variant Editor Extensions
- Per-row sale price input with schedule disclosure (sale_from / sale_to datetime inputs)
- Star icon for default variant (calls `setDefaultVariant` via Pattern B refetch)
- Per-row weight(g) input (AD-08)
- Per-row image upload via hidden file input (reuses Phase 7 writeUpload pipeline)
- Bulk toolbar: checkbox select-all + per-row checkboxes; BulkOp discriminated union (set-price | multiply-price | add-price | set-sale-price | set-active | delete)
- `bulkUpdateVariants` server action (single transaction)
- Reactivity contract enforced: Pattern A optimistic for field edits, Pattern B `getVariantEditorData` refetch for shape-changing ops; `router.refresh()` removed from all mutation paths (AD-06)
- 4 new server actions: `uploadVariantImage`, `removeVariantImage`, `setDefaultVariant`, `bulkUpdateVariants`

### 17-03 — PDP Updates
- "ON SALE" badge + strikethrough regular price + bold sale price when `selectedHydrated.isOnSale`
- Default variant pre-selected on PDP load (`isDefault` wins over first-available; falls back to first variant)
- OOS hardening: `aria-disabled`, `tabIndex=-1`, `title="Out of stock"` on both swatch and pill buttons; keyboard-unreachable
- Gallery swaps primary image to variant's `PictureData` when variant has `imageUrl`; server-side resolution via `pickImage(baseUrl)` (Phase 7 srcset preserved)
- `variantPictures: Record<string, PictureData | null>` prop added to ProductDetail
- `priceRangeMYR` updated to use `effectivePrice` when present
- ProductCard shows "SALE" chip when any variant `isOnSale`; uses `hydratedVariants` for price range
- `hydrateCartItems` in cart.ts computes sale-window effective price — correct `unitPrice` captured at checkout

### 17-04 — Legacy Cleanup (11 atomic commits)
| Commit | Finding | Action |
|--------|---------|--------|
| 1 | L-01+L-02+L-03+L-04 | Deleted `size-selector.tsx` + `size-guide.tsx`; PDP collapsed to VariantSelector unconditionally |
| 2 | L-13 | `AddToBagButton` `size` prop already clean from 17-03; verified no callers |
| 3 | L-05 | Removed `legacyAddToCart` + `export type LegacyCartItem` from cart-store.ts; inline cast preserved for v1 migration bridge |
| 4 | L-06+L-14 | Removed `size: z.enum(["S","M","L"])` from `productVariantSchema`; removed `size: "S" as const` from admin-bulk-import.ts and products.ts |
| 5 | L-07 | Already clean from 17-01 (tombstone comment removed); no-op |
| 6 | L-08 | Removed stale dual-read comment from `generateVariantMatrix` in variants.ts |
| 7 | L-09+L-10 | Rewrote overview.md + inventory.md admin guide to variant-centric copy; regenerated admin-guide-generated.ts |
| 8 | L-11 | Deleted `scripts/seed-demo-products.ts` |
| 9 | L-16 | Removed `price_s/m/l` from `bulkImportRowSchema`; removed legacy back-compat block from `deriveOptions`; updated CSV template to generic option columns |
| 10 | L-12 | Added NOTE comment to `phase13-inventory-optional.cjs` about defunct `depth_cm` AFTER clause |
| 11 | stale comment | Removed orphaned `price_s/m/l` JSDoc from validators.ts Phase 16 section header |

### 17-05 — Completion + Docs
- COMPLETION.md (this file)
- ROADMAP.md: Phase 17 marked complete; progress table updated; plan list checked [x]
- STATE.md: progress 17/17 phases, 51/51 plans; AD-01..AD-08 decisions logged; Roadmap Evolution entry updated

---

## Schema Changes

5 new columns added to `product_variants` (migration: `scripts/phase17-migrate.cjs`):

```sql
sale_price  DECIMAL(10,2) NULL          AFTER price
sale_from   TIMESTAMP NULL              AFTER sale_price
sale_to     TIMESTAMP NULL              AFTER sale_from
is_default  TINYINT(1) NOT NULL DEFAULT 0  AFTER position
weight_g    INT NULL                    AFTER is_default
```

No changes to `orders`, `order_items`, `products`, or any other table.

---

## Success Criteria Verification

From `17-PLAN.md`:

1. **Sale price with optional window + PDP badge** — [x] `isOnSale` computed in `hydrateProductVariants`; "ON SALE" + strikethrough renders on PDP
2. **Variant image upload + PDP swap** — [x] `uploadVariantImage` action; `variantPictures` resolved server-side via `pickImage`; gallery swaps on selection
3. **Bulk edit toolbar** — [x] Checkbox select + BulkOp toolbar in variant-editor; `bulkUpdateVariants` single transaction
4. **Default variant pre-selection** — [x] `setDefaultVariant` transaction; PDP `defaultSelected` memo checks `isDefault` first
5. **OOS hardening** — [x] `aria-disabled` + `tabIndex=-1` + `title="Out of stock"` on swatch + pill; keyboard-unreachable
6. **Reactivity contract** — [x] Pattern A optimistic for field edits; Pattern B `getVariantEditorData` refetch for shape-changing ops; `router.refresh()` removed from all mutation paths
7. **Legacy cleanup** — [x] 11 atomic commits; zero `SizeSelector/SizeGuide/legacyAddToCart/LegacyCartItem/AddToBagButtonV2/"S"|"M"|"L"/price_s|m|l` in src/
8. **TypeScript clean** — [x] `npx tsc --noEmit` clean after every commit throughout execution
9. **Per-variant weight drives Delyva quote** — [x] `weight_g` on schema; `quoteForCart` resolution ladder `variant.weight_g ?? product.shippingWeightKg×1000 ?? defaultWeightKg` with warn log (AD-08)

---

## Legacy Cleanup Results

| Finding | Action |
|---------|--------|
| L-01 `type Size = "S"\|"M"\|"L"` in product-detail.tsx | Removed (17-03 collapse) |
| L-02 `type Variant` legacy local type in product-detail.tsx | Removed (17-03 collapse) |
| L-03 `hasGenericOptions` ternary in product-detail.tsx | Removed (17-03 collapse) |
| L-04 `SizeSelector` / `SizeGuide` imports + branches | Removed (17-03 collapse; files deleted in 17-04) |
| L-05 `legacyAddToCart` + `LegacyCartItem` in cart-store.ts | Removed (17-04 T3) |
| L-06 `size: z.enum(["S","M","L"])` in productVariantSchema | Removed (17-04 T4) |
| L-07 `legacyVariantToHydrated` tombstone JSDoc in variants.ts | Already removed in 17-01 |
| L-08 stale dual-read comment in generateVariantMatrix | Removed (17-04 T6) |
| L-09 size-era copy in admin-guide overview.md | Rewritten (17-04 T7) |
| L-10 "track a size" in admin-guide inventory.md | Updated to "track stock on a variant" (17-04 T7) |
| L-11 `scripts/seed-demo-products.ts` | Deleted (17-04 T8) |
| L-12 `depth_cm` AFTER clause in phase13-inventory-optional.cjs | Annotated with NOTE comment (17-04 T10) |
| L-13 `size?: "S"\|"M"\|"L"` prop on AddToBagButton | Already clean in 17-03; verified no callers |
| L-14 `size: "S" as const` in admin-bulk-import.ts + products.ts | Removed (17-04 T4) |
| L-15 Apache `3dninjaz_v1.conf` name | Flagged as future infra debt; no action in Phase 17 |
| L-16 `price_s/m/l` CSV back-compat | Removed (17-04 T9) |
| L-17 live DB dimension columns check | Deploy-time verify step in runbook (17-05 T1) |
| L-18 stale JSDoc orphan comment in validators.ts | Removed (17-04 cleanup commit 11) |
| L-19 `weightG` AD-08 per-variant shipping weight | Shipped in 17-01 + 17-02 + referenced in 17-05 |

---

## Migration Notes (Live DB Runbook)

Run on the live DB during deploy:

```bash
# SSH to server
cd ~/apps/3dninjaz

git pull
npm ci --omit=dev --no-audit --no-fund
npm run build

# Run idempotent migration
node scripts/phase17-migrate.cjs
# Expected output: each column either added or "already exists — skipping"

# Verify columns present
mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" \
  -e "DESCRIBE product_variants" | grep -E "sale_|is_default|weight_g"

# Verify Phase 16-07 dimension drop (L-17)
mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" \
  -e "DESCRIBE product_variants" | grep -E "width_cm|height_cm|depth_cm"
# Expected: EMPTY

# Graceful app restart
pgrep -f "node .* server.js" | xargs -r kill
./start.sh &
sleep 3
curl -sI https://app.3dninjaz.com/ | head -1
# Expected: HTTP/2 200
```

---

## E2E Test Log

E2E smoke tests (17-05 Tasks 2a–2f) are **manual / deploy-time** tests to be executed against the live `app.3dninjaz.com` instance using the PayPal sandbox buyer documented in CLAUDE.md. Results to be recorded here after deploy.

**Pending:**
- 2a: Admin creates sale-priced product + default + OOS + image upload — all mutations reactive
- 2b: PDP strikethrough + ON SALE + default pre-select + image swap + OOS graying
- 2c: PayPal sandbox checkout captures sale price; order email + invoice reflect it
- 2d: Parts product with default works end-to-end
- 2e: Pre-Phase-17 product regression passes
- 2f: Per-variant `weight_g` drives Delyva quote delta (AD-08)

---

## Known Follow-ups

- E2E smoke tests 2a–2f to be logged here post-deploy
- PayPal Reporting API enablement still pending (Q-07-08 — contact PayPal support)
- 24h cleanup cron for `public/uploads/imports/` still deferred (from 05-05)
- `order_cancelled` email trigger still pending
- Apache `3dninjaz_v1.conf` infra rename flagged as future infra phase (L-15)

## Out of Scope

- Per-variant weight display on PDP (AD-08 is server-side quote input only)
- PayPal line-item schema changes (unitPrice snapshot already correct from Phase 16-05)
- Customer-facing sale countdown timer
- Coupon + sale price interaction (both discounts stack at cart calculation — no change needed)

## Gap Analyses Closed

- `SHIPPING-VARIANT-GAPS.md` — AD-08 per-variant weight shipped
- Phase 16 `WOO-COMPARISON.md` residue — all 5 critical gaps (sale price, variant image, bulk edit, OOS hardening, default pre-selection) shipped
