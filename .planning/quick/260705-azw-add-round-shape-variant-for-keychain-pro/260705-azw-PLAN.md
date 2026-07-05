---
phase: quick-260705-azw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/db/schema.ts
  - scripts/migrate-add-keychain-shape.ts
  - scripts/migrate-add-keychain-shape.sql
  - src/components/store/keychain-preview.tsx
  - src/lib/validators.ts
  - src/actions/products.ts
  - src/components/admin/product-form.tsx
  - src/app/(admin)/admin/products/[id]/edit/page.tsx
  - src/app/(store)/products/[slug]/page.tsx
  - src/components/store/product-detail.tsx
  - src/components/store/configurable-product-view.tsx
autonomous: true
requirements: [QUICK-260705-azw]
must_haves:
  truths:
    - "A new products.keychainShape column exists in the dev DB, ENUM('square','round') NOT NULL DEFAULT 'square', and every pre-existing row reads 'square'"
    - "The admin product form shows a Shape picker (Square / Round) only when productType === 'keychain', and the chosen value round-trips through create and edit"
    - "KeychainPreview renders circular cubes (round body + proportional ring/inset) when shape='round' and is pixel-identical to today when shape='square'"
    - "The storefront PDP passes the product's keychainShape (defaulting to 'square') into KeychainPreview so a round keychain product previews as circles"
    - "npx tsc --noEmit passes with no new type errors"
  artifacts:
    - path: "src/lib/db/schema.ts"
      provides: "Drizzle keychainShape column on products table, byte-for-byte matching the raw SQL DDL"
      contains: "keychainShape"
    - path: "scripts/migrate-add-keychain-shape.ts"
      provides: "Idempotent migration that ADDs the keychainShape column"
      contains: "keychainShape"
    - path: "src/components/store/keychain-preview.tsx"
      provides: "shape prop with round rendering path"
      contains: "shape"
    - path: "src/components/admin/product-form.tsx"
      provides: "keychain Shape picker wired into save payload"
      contains: "keychainShape"
  key_links:
    - from: "src/components/admin/product-form.tsx"
      to: "src/actions/products.ts (createProduct/updateProduct)"
      via: "payload.keychainShape → productSchema → db.insert/update"
      pattern: "keychainShape"
    - from: "src/app/(store)/products/[slug]/page.tsx"
      to: "src/components/store/configurable-product-view.tsx"
      via: "product.keychainShape marshalled → ProductDetail → ConfigurableProductView → KeychainPreview shape prop"
      pattern: "keychainShape"
---

<objective>
Add a second, visually-distinct "round" shape option for keychain-type products. Today every keychain product renders as a square/rounded-square keycap row via a single hardcoded design in `KeychainPreview`. This adds a `keychainShape` enum column, a round rendering path in the preview, and an admin picker — WITHOUT introducing a new productType or changing the keychain field structure.

Purpose: Let the admin ship a round-bodied keychain product (same name-text + 3 locked colour fields) alongside the existing square one.
Output: `products.keychainShape` column, round variant in `KeychainPreview`, admin Shape picker, and shape threaded through both PDP render sites.

Scope guardrails (do NOT touch):
- `src/lib/keychain-fields.ts` (field seeding — shape does not change field structure)
- `src/lib/keychain-parts.ts` (production summary-text parsing — unchanged)
- `src/components/admin/keychain-batches.tsx` / any batch-production view (shape is not a production concern)
- Do NOT create an actual round product row — the admin will do that via the UI once this ships.
- Do NOT reduce, stub, or "v1" any behavior. Every keychain colour field and the ring/inset detail must remain correct on the round body.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md

<critical_project_conventions>
From CLAUDE.md — MariaDB 10.11 self-hosted (cPanel), NOT Neon:
- Do NOT run `drizzle-kit push` against remote (it has hung on schema-pull before). Use raw SQL DDL applied via a tsx migration script.
- Schema.ts Drizzle column MUST match the raw SQL byte-for-byte.
- Existing rows must keep working → column is NOT NULL DEFAULT 'square'.
- Dev-first: this ships to dev (app.3dninjaz.com / DB ninjaz_3dn) for the user to test BEFORE master/prod. Never push straight to prod.
- Never manually deploy (`.github/workflows/deploy.yml` auto-deploys on push to dev). PR flow only.
- Local laptop cannot reach remote MariaDB:3306 directly — see "Local dev needs SSH DB tunnel" and "Prod DB access" memory notes for how to apply the migration to the dev DB (SSH tunnel with DATABASE_URL override, or run on the box).
</critical_project_conventions>

<interfaces>
<!-- Extracted from codebase — executor should use these directly, no exploration needed. -->

products table (src/lib/db/schema.ts ~L141-208) — add the new column near `hideBasePrice` (L200):
```ts
productType: mysqlEnum("productType", ["stocked","configurable","keychain","vending","simple"]).notNull().default("stocked"),
// ...
hideBasePrice: boolean("hide_base_price").notNull().default(false),
// ADD HERE:
// keychainShape: mysqlEnum("keychainShape", ["square","round"]).notNull().default("square"),
```

Existing idempotent migration pattern (scripts/migrate-add-vending-product-type.ts) — mysql2, reads DATABASE_URL, checks INFORMATION_SCHEMA.COLUMNS, ALTERs only when missing, verifies. Run via: `dotenv -e .env.local -- npx tsx scripts/migrate-add-keychain-shape.ts` (or `tsx --env-file=.env.local ...`).

KeychainPreview current Props (src/components/store/keychain-preview.tsx L30-42):
```ts
type Props = { text: string; baseHex: string; clickerHex: string; letterHex: string; maxLength: number; placeholder?: string; };
```
Current square geometry: cube `borderRadius: 14` (L99); side-tab ring `borderRadius: "14px 0 0 14px"` at L119; inset clicker face `inset: 5, borderRadius: 10` (L147-148). These are the values the round path must adapt.

productSchema (src/lib/validators.ts L100-193) — Zod. `productType` is `z.enum([...]).default("stocked")` (L155), `hideBasePrice: z.boolean().optional().default(false)` (L192). Add `keychainShape` alongside.

createProduct persist (src/actions/products.ts L299-316) and updateProduct persist (~L517-519) — both set columns explicitly, e.g. `productType: productData.productType ?? "stocked"`, `hideBasePrice: productData.hideBasePrice ?? false`. Add `keychainShape` the same way.

Read paths already auto-carry the column (both use `db.select().from(products)` + spread):
- Admin: `getProduct` (src/actions/products.ts L715) → `...row`
- Storefront: `getActiveProductBySlug` (src/lib/catalog.ts L327) → `hydrateProducts` → `...p` (L268); `CatalogProduct = Omit<ProductRow, ...> & {...}` (L63) so `ProductRow` gains keychainShape automatically once schema.ts changes.

Marshalling boundaries that DROP unknown fields (must be edited to pass keychainShape through):
- src/app/(store)/products/[slug]/page.tsx L76-101 — hand-picks product fields for `<ProductDetail>`.
- src/components/store/product-detail.tsx — `ProductDetailProps.product` type (L41-61) + spreads `{...product, pictures}` into `<ConfigurableProductView>` (L118-119).
- src/components/store/configurable-product-view.tsx — `Props.product` type (~L46-59) + two `<KeychainPreview .../>` call sites (L403 and L555).
- Admin: src/app/(admin)/admin/products/[id]/edit/page.tsx `initialData` object (L139-168) + `ProductFormInitial` type (src/components/admin/product-form.tsx L37-77).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add keychainShape column — raw SQL migration + idempotent script + Drizzle schema</name>
  <files>scripts/migrate-add-keychain-shape.sql, scripts/migrate-add-keychain-shape.ts, src/lib/db/schema.ts</files>
  <action>
1. Create `scripts/migrate-add-keychain-shape.sql` with a header comment and the idempotent DDL (MariaDB 10.11 supports ADD COLUMN IF NOT EXISTS):
   `ALTER TABLE products ADD COLUMN IF NOT EXISTS keychainShape ENUM('square','round') NOT NULL DEFAULT 'square';`
2. Create `scripts/migrate-add-keychain-shape.ts` following `scripts/migrate-add-vending-product-type.ts` EXACTLY as a template: import `mysql2/promise`, read `process.env.DATABASE_URL`, derive dbName from the URL pathname, query INFORMATION_SCHEMA.COLUMNS for (TABLE_NAME='products', COLUMN_NAME='keychainShape'); if the column already exists, log a no-op and return; otherwise run the ALTER above, then re-query and log the resulting COLUMN_TYPE. Idempotent + safe to re-run.
3. In `src/lib/db/schema.ts`, add the Drizzle column to the `products` table immediately after `hideBasePrice` (L200), byte-for-byte matching the SQL enum + default:
   `keychainShape: mysqlEnum("keychainShape", ["square", "round"]).notNull().default("square"),`
   Add a one-line comment noting it is a visual-only shape discriminator for keychain-type products (square = existing behavior; default preserves all existing rows). Confirm `mysqlEnum` is already imported at the top of schema.ts (it is — used by productType).
4. Apply the migration to the DEV database (ninjaz_3dn) using the project's DB access convention (SSH tunnel with DATABASE_URL override to the dev DB, or run the tsx script on the box). Do NOT run drizzle-kit push. Do NOT touch the prod DB (ninjaz_3dnp). If the executor cannot reach the dev DB from its environment, leave the migration script + SQL in place and flag in the SUMMARY that the ALTER must be applied to dev before the feature is testable — the code changes are still valid because the column defaults to 'square'.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>schema.ts has the keychainShape column; both migration files exist and the .ts script is idempotent (INFORMATION_SCHEMA guard); when applied to dev, `SHOW COLUMNS FROM products LIKE 'keychainShape'` returns Type `enum('square','round')`, Null `NO`, Default `square`; typecheck passes.</done>
</task>

<task type="auto">
  <name>Task 2: Add round rendering path to KeychainPreview</name>
  <files>src/components/store/keychain-preview.tsx</files>
  <action>
Add a `shape?: "square" | "round"` prop (default `"square"`) to the `Props` type and destructure it in the component signature.

Keep the `shape === "square"` path PIXEL-IDENTICAL to current code — do not alter any existing value on that path (cube `borderRadius: 14`, side-tab `borderRadius: "14px 0 0 14px"`, inset face `inset: 5, borderRadius: 10`, ring/loop dot, shadows). No visual regression on the existing square keychain product.

For `shape === "round"`, adapt the three geometry values proportionally so the body reads as a circle with a correct-looking ring and inset:
- Cube body: `borderRadius: "50%"` instead of 14 (circle).
- Inset clicker face (currently `inset: 5, borderRadius: 10`): keep `inset: 5` but set `borderRadius: "50%"` so the pressable face is a concentric inner circle (not a square inset on a round body).
- Side-tab / ring (currently `borderRadius: "14px 0 0 14px"`): make the tab read as a rounded lug on a circular body — use a symmetric pill/rounded radius (e.g. `borderRadius: "50%"` on the tab, or a large uniform radius) so it does not look like a square notch. The white loop dot (already `borderRadius: "50%"`) stays as-is.
- Letter glyph, font sizing, shadows, gap, padding, swatch/placeholder logic, and cube-count logic are shape-independent — do NOT change them.

Implement via small conditionals on the `shape` value (e.g. `const bodyRadius = shape === "round" ? "50%" : 14;`) rather than duplicating the whole JSX block, to keep the square path provably unchanged. Update the component's top doc comment to mention the `shape` prop.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>KeychainPreview accepts `shape`; shape="square" produces byte-identical inline styles to before (diff shows only additive conditionals, no changed literals on the square branch); shape="round" yields borderRadius "50%" on body + inset face and a rounded (non-square) ring tab; typecheck passes.</done>
</task>

<task type="auto">
  <name>Task 3: Admin Shape picker + persistence + thread shape to render sites</name>
  <files>src/lib/validators.ts, src/actions/products.ts, src/components/admin/product-form.tsx, src/app/(admin)/admin/products/[id]/edit/page.tsx, src/app/(store)/products/[slug]/page.tsx, src/components/store/product-detail.tsx, src/components/store/configurable-product-view.tsx</files>
  <action>
Persistence layer:
1. `src/lib/validators.ts` — add to `productSchema` (near `hideBasePrice`, L192): `keychainShape: z.enum(["square", "round"]).optional().default("square"),`.
2. `src/actions/products.ts` — in BOTH the createProduct insert (L299-316) and the updateProduct update (~L517-519), add `keychainShape: productData.keychainShape ?? "square",` alongside the existing `hideBasePrice` line.

Admin form (`src/components/admin/product-form.tsx`):
3. Extend the `ProductFormInitial` type (L37-77) with `keychainShape?: "square" | "round";`.
4. Add state near `hideBasePrice` (L170): `const [keychainShape, setKeychainShape] = useState<"square" | "round">(initialData?.keychainShape ?? "square");`.
5. Include `keychainShape` in BOTH the draft snapshot `formState` object (L205-221) AND its dependency array (L222-240) — mirror how `hideBasePrice` appears in both. Also restore it in the draft-restore block (near L269 where `hideBasePrice` is restored): `if (v.keychainShape === "square" || v.keychainShape === "round") setKeychainShape(v.keychainShape);`.
6. Add `keychainShape` to the save `payload` object (near L355/L358 where `productType`/`hideBasePrice` are set): `keychainShape,`.
7. Render a Shape picker ONLY when `productType === "keychain"` — place it inside the existing `productType === "keychain" && initialData?.id` Card block (L752-768), or as a sibling card immediately after it, following the existing keychain-card styling. A simple two-option control (radio group or a `<select>`/segmented pair "Square" / "Round") bound to `keychainShape`/`setKeychainShape`, with a short helper line ("Controls the live preview shape — square keycap or round body."). Reuse existing UI primitives already imported in this file (Label, and the radio/select pattern used elsewhere in the form); do not add a new dependency.

Admin edit page (`src/app/(admin)/admin/products/[id]/edit/page.tsx`):
8. Add `keychainShape: product.keychainShape ?? "square",` to the `initialData` object (L139-168), next to `hideBasePrice` (L167). `product` is from `getProduct` which spreads `...row`, so `product.keychainShape` is present after Task 1.

Storefront render path:
9. `src/app/(store)/products/[slug]/page.tsx` — add `keychainShape: product.keychainShape ?? "square",` to the hand-picked product object passed to `<ProductDetail>` (L76-101), next to `productType`/`hideBasePrice`.
10. `src/components/store/product-detail.tsx` — add `keychainShape?: "square" | "round";` to `ProductDetailProps.product` (L41-61). It already spreads `{...product, pictures}` into `<ConfigurableProductView>` (L118), so no extra wiring there.
11. `src/components/store/configurable-product-view.tsx` — add `keychainShape?: "square" | "round";` to `Props.product` (~L46-59), then pass `shape={product.keychainShape ?? "square"}` to BOTH `<KeychainPreview>` call sites (L403 and L555). The VendingPreview branch is untouched.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>Editing a keychain product shows a Square/Round picker; saving persists keychainShape and it re-hydrates on reload; a keychain product with keychainShape='round' renders circular cubes on the PDP (both preview slots); square keychain products are visually unchanged; non-keychain products never show the picker and are unaffected; typecheck passes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| admin form → server action | `keychainShape` value crosses from the admin client into createProduct/updateProduct |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-azw-01 | Tampering | keychainShape in product save payload | mitigate | `productSchema` Zod `z.enum(["square","round"])` rejects any other value at the action boundary (existing `productSchema.safeParse` at products.ts L215/L476); DB column is ENUM so invalid values are also rejected at persist. |
| T-azw-02 | Elevation of Privilege | product create/update actions | accept | Admin-only server actions already gated by existing `requireAdmin()` in the mutation path; this task adds no new endpoint or privilege surface. |
| T-azw-03 | Injection (XSS) | round preview rendering | accept | keychainShape is a closed enum used only to choose a numeric/keyword CSS radius; it is never interpolated into HTML or used as a hex/style string. No new injection surface. |
</threat_model>

<verification>
- `npx tsc --noEmit` passes with no new errors.
- `git diff src/components/store/keychain-preview.tsx` shows only additive conditionals — no changed literals on the square branch (no square-product visual regression).
- After the migration is applied to dev: `SHOW COLUMNS FROM products LIKE 'keychainShape'` → `enum('square','round')`, NOT NULL, DEFAULT 'square'; existing rows read 'square'.
- Manual (post-deploy to dev, user test): edit a keychain product → Shape picker visible → select Round → Save → reload shows Round persisted → PDP preview renders circles; a square keychain product is unchanged.
</verification>

<success_criteria>
- `products.keychainShape` ENUM('square','round') NOT NULL DEFAULT 'square' exists in dev DB with all existing rows defaulting to 'square'.
- Admin form exposes a Square/Round picker for keychain products that round-trips through create + edit.
- KeychainPreview renders round bodies/insets/ring for shape='round' and is pixel-identical for shape='square'.
- Both PDP preview slots receive the product's keychainShape (default 'square').
- No changes to keychain-fields.ts, keychain-parts.ts, or any batch-production view.
- Typecheck green.
</success_criteria>

<output>
After completion, create `.planning/quick/260705-azw-add-round-shape-variant-for-keychain-pro/260705-azw-SUMMARY.md`.
</output>
