# Phase 19 — Made-to-Order Product Type: 24-Step Manual Smoke Checklist

**Purpose:** Verifier runbook — walk every step in order to close all Phase 19 acceptance criteria (REQ-1 through REQ-9) and SPEC.md checkboxes.

**Prerequisites:**
- Dev server running: `npm run dev` (or production app at `https://app.3dninjaz.com`)
- `.env.local` populated with `DATABASE_URL`, `BETTER_AUTH_SECRET`, `PAYPAL_*`
- Colours seeded: `dotenv -e .env.local -- npx tsx scripts/seed-colours.ts`
- Admin account available (email + password for an `admin`-role user)
- PayPal sandbox buyer: `sb-shnvz50688339@personal.example.com` / `_s!Cw2Wp`

---

## Cross-Reference: SPEC.md Acceptance Checkboxes → Smoke Steps

| SPEC.md requirement | Smoke step(s) |
|---|---|
| REQ-1 Schema: productType column exists | 1, 2 |
| REQ-2 Schema: product_config_fields table | 3, 4 |
| REQ-3 Admin: product type radio at creation | 5, 6, 7 |
| REQ-4 Admin: configurator builder (fields) | 8, 9, 10, 11 |
| REQ-5 Admin: tier pricing editor | 12, 13 |
| REQ-6 PDP: display images + captions | 15, 16 |
| REQ-7 PDP: live preview + price meter + add-to-bag | 14, 15, 16, 17, 18, 19 |
| REQ-8 Cart: configurable line items | 20, 21 |
| REQ-9 Checkout + orders + backwards compat | 22, 23, 24 |

---

## Wave 1 — Schema (REQ-1, REQ-2)

### 1. Run phase-19 migration — idempotent

**Setup:** Terminal with project root as CWD, `.env.local` loaded.

**Action:**
```bash
dotenv -e .env.local -- node scripts/phase19-migrate.cjs
```

**Expected:** Script prints each DDL statement it ran (or "already applied" for re-runs). Exits 0. No SQL errors.

**Acceptance:** REQ-1, REQ-2 — all 4 schema mutations (productType column, maxUnitCount, priceTiers, unitField, product_config_fields table) applied idempotently.

---

### 2. Verify productType column on products table

**Action:**
```sql
SHOW CREATE TABLE products\G
```
(Run via mysql CLI or cPanel phpMyAdmin)

**Expected:** Output contains:
```
`productType` enum('stocked','configurable') NOT NULL DEFAULT 'stocked'
`maxUnitCount` int(11) DEFAULT NULL
`priceTiers` text DEFAULT NULL
`unitField` varchar(64) DEFAULT NULL
```

**Acceptance:** REQ-1 — productType discriminator exists with correct default.

---

### 3. Verify product_config_fields table structure

**Action:**
```sql
SHOW CREATE TABLE product_config_fields\G
```

**Expected:** Table exists with columns: id, productId (FK → products.id CASCADE), position, fieldType ENUM('text','number','colour','select'), label, helpText, required, configJson, createdAt, updatedAt.

**Acceptance:** REQ-2 — product_config_fields schema matches Drizzle definition.

---

### 4. Verify all existing products default to stocked

**Action:**
```sql
SELECT DISTINCT productType FROM products;
```

**Expected:** Before the keychain seed runs, result is only `'stocked'` (existing products unchanged).

**Acceptance:** REQ-1, D-14 — no existing product contaminated with configurable type.

---

## Wave 2 — Admin UI (REQ-3, REQ-4, REQ-5)

### 5. Product type radio renders at creation

**Setup:** Logged in as admin.

**Action:** Visit `/admin/products/new`.

**Expected:** First card is "Product Type" with two radio options: **Stocked** (default selected) and **Made-to-Order (Configurable)**. Both labels are visible. Help text explains the difference.

**Acceptance:** REQ-3 — type radio at top of creation form.

---

### 6. Create a made-to-order test product

**Action:** On `/admin/products/new`:
1. Select **Made-to-Order (Configurable)**
2. Name: "Test Keychain Smoke"
3. Description: "Smoke test product — delete after verification"
4. Click **Create Product**

**Expected:** Redirect goes to `/admin/products/[id]/configurator` (NOT `/variants`). Form saves without errors.

**Verify via SQL:**
```sql
SELECT id, name, productType FROM products WHERE name = 'Test Keychain Smoke';
```
Returns 1 row with `productType = 'configurable'`.

**Acceptance:** REQ-3 — configurable product creation works end-to-end.

---

### 7. Product type radio is locked when data is attached (stocked product guard)

**Setup:** Open any existing T-shirt or stocked product in edit mode (e.g., `/admin/products/[id]/edit`).

**Action:** Inspect the Product Type card.

**Expected:** The radio is **disabled** (greyed out) with a tooltip/message such as "Cannot change — variants are attached." Attempting to click it does nothing.

**Acceptance:** REQ-3 — type lock prevents accidental switch when data exists.

---

### 8. Open Configurator builder

**Action:** From the test configurable product edit page, click **Manage Configurator →**.

**Expected:** `/admin/products/[id]/configurator` opens. Shows "No fields yet" + **Add field** button + Pricing Tiers section.

**Acceptance:** REQ-4 — configurator builder page accessible.

---

### 9. Add a Text config field

**Action:** Click **Add field** → select **Text** → fill in:
- Label: "Your name"
- Help text: "Letters A–Z only, max 8"
- Max length: 8
- Allowed characters: A-Z
- Uppercase toggle: ON
- Profanity check: ON
→ Save

**Expected:** Field appears in the list with label "Your name" and type badge "text". No page error.

**Acceptance:** REQ-4 — text field creation works with all config options.

---

### 10. Add a Colour config field

**Action:** Click **Add field** → select **Colour** → fill in:
- Label: "Base colour"
- Required: ON
→ Click **Pick colours** → ColourPickerDialog opens → select 5 colours → click **Add N colours** → Save

**Expected:** Field appears in list with label "Base colour" and type badge "colour". The `allowedColorIds` in DB shows 5 UUIDs.

**Verify via SQL:**
```sql
SELECT configJson FROM product_config_fields WHERE label = 'Base colour';
```

**Acceptance:** REQ-4 — colour field creation wires to Phase 18 colour library.

---

### 11. Reorder config fields via drag

**Action:** Drag the "Base colour" field above "Your name" using the drag handle. Release.

**Expected:** Order updates immediately (optimistic). Reload the page — new order persists.

**Acceptance:** REQ-4 — field reordering persists correctly.

---

### 12. Set pricing tiers

**Action:** In the Pricing Tiers section:
- Max unit count: 8
- Unit field: "name"
- Tiers: 1→7, 2→9, 3→12, 4→15, 5→18, 6→22, 7→26, 8→30
→ Save tiers

**Expected:** All 8 tiers saved. Reading back shows exact values.

**Verify via SQL:**
```sql
SELECT maxUnitCount, priceTiers, unitField FROM products WHERE name = 'Test Keychain Smoke';
```
Returns `maxUnitCount=8`, `priceTiers={"1":7,"2":9,...,"8":30}`, `unitField='name'`.

**Acceptance:** REQ-5 — tier pricing editor persists all tiers correctly.

---

### 13. Reduce max and confirm truncation prompt

**Action:** Change max unit count from 8 to 5. Click Save.

**Expected:** A confirmation prompt fires: "This will remove tiers 6, 7, 8. Continue?" Click **Cancel** → all 8 tiers preserved. Click Save again → confirm → tiers 6, 7, 8 removed. DB shows `maxUnitCount=5`, `priceTiers={"1":7,...,"5":18}`.

**Acceptance:** REQ-5 — truncation guard works; cancel preserves data.

---

## Wave 3 — Storefront PDP (REQ-6, REQ-7)

### 14. Seed the keychain product

**Action:**
```bash
dotenv -e .env.local -- npx tsx scripts/seed-keychain-product.ts
```

**Expected:** Output ends with "done — product 'custom-name-keychain' created with 3 config fields." Exits 0.

**Second run (idempotency):**
```bash
dotenv -e .env.local -- npx tsx scripts/seed-keychain-product.ts
```

**Expected:** Prints "already exists (id=...); skipping." Exits 0. No duplicate row:
```sql
SELECT COUNT(*) FROM products WHERE slug = 'custom-name-keychain';
```
Returns exactly 1.

**Acceptance:** REQ-7 (seed fixture exists), D-15 (idempotency).

---

### 15. PDP loads with display image hero and thumbstrip

**Action:** Visit `/products/custom-name-keychain`.

**Expected:**
- Page renders without error.
- Hero area shows either the admin's primary display image OR a "No image available" placeholder (if no image uploaded yet).
- Thumbstrip shows **"Yours"** thumbnail (green background, live SVG miniature) + at least 1 "Display" thumbnail (if image is uploaded).
- Price meter shows **"Enter details to see price"** (no name entered yet).
- Add to bag button is **disabled**.

**Acceptance:** REQ-7 — configurable PDP renders.

---

### 16. Live preview activates on first input; price meter updates

**Action:** Click the "Your name" field and type "JACOB" (5 letters).

**Expected:**
- Hero area auto-swaps to the live SVG preview (KeychainPreview component shows "JACOB" in chosen colours).
- Price meter shows **"MYR 18.00"** (tier-5 price).
- Add to bag button becomes **enabled** (assuming colour fields are also filled in).
- "Yours" thumbnail in thumbstrip is highlighted (active border).

**Acceptance:** REQ-7 — price meter + live preview + add-to-bag gate.

---

### 17. Display/Yours thumbnail toggle works

**Action:** With "JACOB" typed:
1. Click **Display** thumbnail → hero shows admin product photo.
2. Click **Yours** thumbnail → hero flips back to SVG preview.

**Expected:** Toggle is smooth, no flash, state preserved correctly.

**Acceptance:** REQ-6 — display/yours thumbnail switch.

---

### 18. Colour picker updates live preview

**Action:** With preview showing, pick a different colour from the **Base + chain colour** field (e.g., Red → Black).

**Expected:** The SVG preview updates immediately — keychain base changes to the selected colour. Price is unchanged (colour does not affect tier price). The admin-curated colour subset (5 colours for base, 3 for letters) is shown — full library is NOT exposed.

**Acceptance:** REQ-7 — colour field drives live preview; subset correctly limited.

---

### 19. Shop listing shows "From MYR 7.00"

**Action:** Visit `/shop` (or navigate via the nav).

**Expected:** The "Custom Name Keychain" card shows a label **"From MYR 7.00"** (or "From RM7.00" per locale formatting). Clicking the card navigates to the PDP.

**Acceptance:** REQ-7 — shop card renders from-price for configurable products.

---

## Wave 4 — Cart + Orders (REQ-8, REQ-9)

### 20. Add to bag — new configurable line item

**Setup:** On keychain PDP with "JACOB" typed, Red base, White letters selected. All required fields filled.

**Action:** Click **Add to bag**.

**Expected:**
- Bag drawer opens.
- New line item shows: "Custom Name Keychain" + summary "JACOB · Red base+chain · White letters" + price MYR 18.00.
- Cart badge in nav shows 1.

**Acceptance:** REQ-8 — configurable item added to cart with configuration summary.

---

### 21. Same config bumps qty; different config creates new line

**Action 1:** Click **Add to bag** again (same "JACOB", Red, White).

**Expected:** Drawer shows qty 2 on the same line (no new line added).

**Action 2:** Change name to "MIA" (3 letters), change base colour to Black. Click **Add to bag**.

**Expected:** Drawer now shows 2 lines: "JACOB ×2 (MYR 18.00 each)" and "MIA ×1 (MYR 12.00)".

**Acceptance:** REQ-8 — same-config deduplication; different-config new line.

---

### 22. Checkout via PayPal sandbox; order confirmation

**Setup:** Signed in as a customer account. Cart has the 2 lines from step 21.

**Action:** Proceed to checkout → complete PayPal sandbox payment with buyer credentials.

**Expected:**
- `/orders/[id]` confirmation page renders.
- Each configurable line item shows the configuration summary (name, colours).
- Order status shows "paid".

**Acceptance:** REQ-9 — configurable items survive PayPal checkout round-trip.

---

### 23. Admin order detail — configuration JSON visible; invoice PDF

**Action:** Open `/admin/orders/[id]` for the order from step 22.

**Expected:**
- Each configurable line item shows the configuration summary.
- An expandable **Configuration JSON** panel shows the raw `values` object for the printer.
- Click **Download Invoice PDF** → PDF renders with a configuration summary column for made-to-order lines.

**Acceptance:** REQ-9 — admin order detail + invoice PDF show configuration data.

---

### 24. Backwards compat — stocked product flow unchanged

**Setup:** Open any existing stocked product PDP (e.g., T-shirt).

**Action:**
1. Variant selector renders with size/colour options — unchanged.
2. Add to bag → cart line shows size+colour label, NO configuration JSON.
3. Proceed to checkout (or verify cart drawer) — stocked item renders normally.
4. Open `/admin/orders/[id]` for a stocked order → no configuration section shown (correct).

**Verify D-14 audit (run in terminal):**
```bash
git diff 2dc446d..HEAD -- \
  src/components/admin/variant-editor.tsx \
  src/lib/variants.ts \
  src/components/store/product-detail.tsx \
  src/stores/cart-store.ts \
| grep "^[+]" \
| grep -v "^+++" \
| grep -v "import\|configurationData\|ConfigurableCartItem\|isConfigurableCartItem\|productType\|imageCaptions" \
| wc -l
```

**Expected:** ≤ 5 (only additive type widenings; no logic change to stocked variant path).

**Acceptance:** REQ-9, D-14 — stocked product flow fully backward-compatible.

---

## Verifier Sign-off

| Step | Result | Notes |
|---|---|---|
| 1 | ☐ PASS / ☐ FAIL | |
| 2 | ☐ PASS / ☐ FAIL | |
| 3 | ☐ PASS / ☐ FAIL | |
| 4 | ☐ PASS / ☐ FAIL | |
| 5 | ☐ PASS / ☐ FAIL | |
| 6 | ☐ PASS / ☐ FAIL | |
| 7 | ☐ PASS / ☐ FAIL | |
| 8 | ☐ PASS / ☐ FAIL | |
| 9 | ☐ PASS / ☐ FAIL | |
| 10 | ☐ PASS / ☐ FAIL | |
| 11 | ☐ PASS / ☐ FAIL | |
| 12 | ☐ PASS / ☐ FAIL | |
| 13 | ☐ PASS / ☐ FAIL | |
| 14 | ☐ PASS / ☐ FAIL | |
| 15 | ☐ PASS / ☐ FAIL | |
| 16 | ☐ PASS / ☐ FAIL | |
| 17 | ☐ PASS / ☐ FAIL | |
| 18 | ☐ PASS / ☐ FAIL | |
| 19 | ☐ PASS / ☐ FAIL | |
| 20 | ☐ PASS / ☐ FAIL | |
| 21 | ☐ PASS / ☐ FAIL | |
| 22 | ☐ PASS / ☐ FAIL | |
| 23 | ☐ PASS / ☐ FAIL | |
| 24 | ☐ PASS / ☐ FAIL | |

**Verifier:** ________________________

**Date:** ________________________

**Overall result:** ☐ ALL PASS — Phase 19 COMPLETE  /  ☐ FAILURES — see Notes column
