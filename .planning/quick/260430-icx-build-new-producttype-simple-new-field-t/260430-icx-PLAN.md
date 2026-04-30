---
id: 260430-icx
title: "Build new productType `simple` + new field type `textarea` (Novel rich text)"
status: ready
date: 2026-04-30
type: execute
mode: quick
wave_count: 5
autonomous: false
files_modified:
  - scripts/migrate-add-simple-product-type.ts
  - scripts/migrate-add-textarea-field-type.ts
  - src/lib/db/schema.ts
  - src/lib/catalog.ts
  - src/lib/validators.ts
  - src/lib/config-fields.ts
  - src/lib/configurable-product-data.ts
  - src/lib/rich-text-sanitizer.ts
  - src/components/admin/product-type-radio.tsx
  - src/components/admin/product-form.tsx
  - src/components/admin/config-field-modal.tsx
  - src/components/admin/configurator-builder.tsx
  - src/components/admin/simple-fields-editor.tsx
  - src/components/admin/novel-rich-text-editor.tsx
  - src/components/store/product-detail.tsx
  - src/components/store/configurable-product-view.tsx
  - src/components/store/simple-product-view.tsx
  - src/components/store/textarea-display.tsx
  - src/components/store/cart-drawer.tsx
  - src/components/store/product-card.tsx
  - src/components/store/configurator-form.tsx
  - src/actions/products.ts
  - src/actions/cart.ts
  - src/actions/configurator.ts
  - src/actions/simple-fields.ts
  - src/app/(admin)/admin/products/[id]/edit/page.tsx
  - src/app/(admin)/admin/products/[id]/configurator/page.tsx
  - src/app/(admin)/admin/products/[id]/fields/page.tsx
  - src/app/(store)/products/[slug]/page.tsx
  - src/app/(store)/bag/page.tsx
  - package.json
---

# 260430-icx — Build `simple` productType + `textarea` field type

## Problem

Add a fifth product type `simple` to 3D Ninjaz. `simple` is identical to `vending` in its
data model (flat price stored as `priceTiers='{"1":<amount>}'`, `maxUnitCount=1`,
`unitField=null`) but has NO auto-seeded fields — admin curates fields freely from a new
lightweight editor at `/admin/products/<id>/fields`. Also add a fifth `fieldType`,
`textarea`, which renders Novel rich-text in admin and sanitised HTML on the storefront
(read-only, never an input — it's a description block, not customer data).

## Reference pattern

The vending PR is the closest analog. Mirror its mechanical extension across all
`"stocked" | "configurable" | "keychain" | "vending"` literals (now five-arity) and
re-use the same flat-price model. Diverge from vending in three places only:
1. NO auto-seed (`createProduct`/`updateProduct` simple branch sets the tier-pricing
   trio but does NOT call `seedSimpleFields` — there is no such helper).
2. Redirect after create goes to NEW `/admin/products/<id>/fields` (not `/configurator`).
3. PDP renders a NEW `<SimpleProductView>` (not `<ConfigurableProductView>`) so the
   `textarea` field can render as a sanitised HTML block instead of an input widget.

## Constraints (re-stated from scope envelope)

- Branch protection on `dev`: PR + green "Install + typecheck" required. No direct push.
- Commits + push + PR + merge MUST be delegated to a Haiku subagent (final task).
- Do NOT touch `master`.
- Do NOT skip hooks (`--no-verify`).
- Do NOT stage any PNG screenshots in repo root (`pdp-*.png`, `thumb-*.png`,
  `verify-*.png` are listed in `git status` — leave them untracked).
- `npx tsc --noEmit` must pass clean before final commit.
- Migrations run BEFORE commit (idempotent, against dev DB via `DATABASE_URL` in
  `.env.local`). Use `dotenv -e .env.local -- npx tsx <script>`.
- `isomorphic-dompurify` is BANNED (broke prod previously). Use `sanitize-html` only.

---

## Wave 1 — Schema migrations + dependency install

> **Why first:** all subsequent TS extensions depend on the ENUMs being widened in
> the live DB (Drizzle schema must match `SHOW CREATE TABLE` byte-for-byte) and on
> the `novel` + `sanitize-html` packages being importable.

### Task 1.1 — Migration: extend `products.productType` ENUM with `'simple'`

**Create:** `scripts/migrate-add-simple-product-type.ts`

Mirror `scripts/migrate-add-vending-product-type.ts` exactly:

```ts
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const conn = await mysql.createConnection(url);
  const dbName = new URL(url).pathname.replace(/^\//, "");

  const [rows] = await conn.query(
    "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?",
    [dbName, "products", "productType"],
  );
  const current = (rows as { COLUMN_TYPE: string }[])[0]?.COLUMN_TYPE ?? "";

  if (!current) {
    console.error("[migrate-add-simple] productType column missing — run migrate-add-product-type.ts first");
    await conn.end();
    process.exit(1);
  }

  if (current.includes("'simple'")) {
    console.info("[migrate-add-simple] 'simple' already in ENUM — no-op");
    await conn.end();
    return;
  }

  await conn.query(
    "ALTER TABLE `products` MODIFY COLUMN `productType` ENUM('stocked','configurable','keychain','vending','simple') NOT NULL DEFAULT 'stocked'",
  );
  console.info("[migrate-add-simple] ENUM extended with 'simple'");

  const [verify] = await conn.query(
    "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?",
    [dbName, "products", "productType"],
  );
  console.info("[migrate-add-simple] new column type:", (verify as { COLUMN_TYPE: string }[])[0]?.COLUMN_TYPE);

  await conn.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

**Run:** `npx dotenv -e .env.local -- npx tsx scripts/migrate-add-simple-product-type.ts`

**Verify:** second invocation reports `'simple' already in ENUM — no-op`.
Then `mysql -e "SHOW CREATE TABLE products"` shows
`ENUM('stocked','configurable','keychain','vending','simple')`.

### Task 1.2 — Migration: extend `productConfigFields.fieldType` ENUM with `'textarea'`

**Create:** `scripts/migrate-add-textarea-field-type.ts`

Same shape as 1.1 but operating on `product_config_fields.fieldType`:

```ts
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const conn = await mysql.createConnection(url);
  const dbName = new URL(url).pathname.replace(/^\//, "");

  const [rows] = await conn.query(
    "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?",
    [dbName, "product_config_fields", "fieldType"],
  );
  const current = (rows as { COLUMN_TYPE: string }[])[0]?.COLUMN_TYPE ?? "";

  if (!current) {
    console.error("[migrate-add-textarea] product_config_fields.fieldType column missing — phase 19 migration not run");
    await conn.end();
    process.exit(1);
  }

  if (current.includes("'textarea'")) {
    console.info("[migrate-add-textarea] 'textarea' already in ENUM — no-op");
    await conn.end();
    return;
  }

  await conn.query(
    "ALTER TABLE `product_config_fields` MODIFY COLUMN `fieldType` ENUM('text','number','colour','select','textarea') NOT NULL",
  );
  console.info("[migrate-add-textarea] ENUM extended with 'textarea'");

  const [verify] = await conn.query(
    "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?",
    [dbName, "product_config_fields", "fieldType"],
  );
  console.info("[migrate-add-textarea] new column type:", (verify as { COLUMN_TYPE: string }[])[0]?.COLUMN_TYPE);

  await conn.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

**Run:** `npx dotenv -e .env.local -- npx tsx scripts/migrate-add-textarea-field-type.ts`

**Verify:** second invocation no-ops; `SHOW CREATE TABLE product_config_fields` includes
`'textarea'`.

### Task 1.3 — Install `novel` + `sanitize-html`

```bash
npm install novel sanitize-html
npm install -D @types/sanitize-html
```

**Pin notes:**
- `novel` — latest stable major (>= 0.5). It's a Tiptap-based React editor. Will be
  loaded via `next/dynamic({ ssr: false })` to avoid SSR issues.
- `sanitize-html` is server-only CommonJS — safe for prod (unlike `isomorphic-dompurify`
  which broke prod per CLAUDE.md). Import only in server modules + server actions.
- Do NOT add `isomorphic-dompurify` under any circumstance.

**Verify:**
- `package.json` shows `novel`, `sanitize-html` in `dependencies` and
  `@types/sanitize-html` in `devDependencies`.
- `npm ls novel sanitize-html` reports installed.
- `package-lock.json` is committed alongside `package.json` (not gitignored).

---

## Wave 2 — Foundational TypeScript: schema, validators, config-fields, sanitiser

> **Why second:** these files are imported by EVERYTHING downstream. Get the type
> system green before touching UI/actions.

### Task 2.1 — Widen ENUMs in `src/lib/db/schema.ts`

**File:** `src/lib/db/schema.ts`

Two lines (already located via grep — line 153 and line 261):

- Line 153 (products.productType): change
  `mysqlEnum("productType", ["stocked", "configurable", "keychain", "vending"])`
  -> `mysqlEnum("productType", ["stocked", "configurable", "keychain", "vending", "simple"])`

- Line 261 (productConfigFields.fieldType): change
  `mysqlEnum("fieldType", ["text", "number", "colour", "select"])`
  -> `mysqlEnum("fieldType", ["text", "number", "colour", "select", "textarea"])`

Match Drizzle's array order to the live DB (verified via Wave 1 migration output).
NO new columns; NO new tables.

**Verify:** `npx tsc --noEmit` reports no schema-related errors yet (downstream errors
expected until Waves 2.2-2.5 land).

### Task 2.2 — Widen `productSchema` in `src/lib/validators.ts`

**File:** `src/lib/validators.ts:153-157`

Change:
```ts
productType: z.enum(["stocked", "configurable", "keychain", "vending"]).default("stocked"),
```
to:
```ts
productType: z.enum(["stocked", "configurable", "keychain", "vending", "simple"]).default("stocked"),
```

Add `simplePrice` (flat price for simple products) at the bottom of `productSchema`:
```ts
simplePrice: z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "Price must be a valid number with up to 2 decimal places")
  .optional()
  .or(z.literal(""))
  .default(""),
```
This field is consumed only when `productType === "simple"` in the action layer
(Wave 4 task 4.1). Stocked/configurable/keychain/vending forms ignore it.

### Task 2.3 — Extend `FieldType`, schemas, and `ensureConfigJson` in `src/lib/config-fields.ts`

**File:** `src/lib/config-fields.ts`

Changes:

1. **Type union** (line 25):
   ```ts
   export type FieldType = "text" | "number" | "colour" | "select" | "textarea";
   ```

2. **New type** (after `SelectFieldConfig`, around line 50):
   ```ts
   /** D-textarea — rich text content (admin-authored, displayed read-only on PDP) */
   export type TextareaFieldConfig = {
     /** Sanitised HTML; admin source-of-truth. Already passed through
      *  rich-text-sanitizer.ts on save (server action). */
     html: string;
   };
   ```

3. **Add to `AnyFieldConfig` union:**
   ```ts
   export type AnyFieldConfig =
     | TextFieldConfig
     | NumberFieldConfig
     | ColourFieldConfig
     | SelectFieldConfig
     | TextareaFieldConfig;
   ```

4. **New Zod schema** (after `SelectFieldConfigSchema`):
   ```ts
   export const TextareaFieldConfigSchema: z.ZodType<TextareaFieldConfig> = z.object({
     html: z.string().max(50_000), // generous cap to prevent runaway DB rows
   });
   ```

5. **Register in `schemaByFieldType`:**
   ```ts
   const schemaByFieldType: Record<FieldType, z.ZodType<AnyFieldConfig>> = {
     text: TextFieldConfigSchema,
     number: NumberFieldConfigSchema,
     colour: ColourFieldConfigSchema,
     select: SelectFieldConfigSchema,
     textarea: TextareaFieldConfigSchema,
   };
   ```

6. **`ensureConfigJson` already dispatches via the map** — no changes needed.

### Task 2.4 — Create rich-text sanitiser at `src/lib/rich-text-sanitizer.ts`

**Create:** `src/lib/rich-text-sanitizer.ts`

```ts
import "server-only";
import sanitizeHtml from "sanitize-html";

/**
 * Allowlist matching the Novel bubble menu features:
 *   bold, italic, underline, strikethrough, ordered/unordered lists,
 *   headings h1-h3, paragraphs, line breaks, inline links.
 *
 * Inline style allowlist limited to font-family, font-weight, text-decoration,
 * text-align — same set the Novel editor exposes.
 *
 * Run on EVERY admin save path that persists a textarea field's html.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "h1", "h2", "h3", "strong", "em", "u", "s", "ol", "ul", "li", "a", "br"],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    "*": ["style"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedStyles: {
    "*": {
      "font-family": [/^[A-Za-z0-9 ,'"\-]+$/],
      "font-weight": [/^(normal|bold|[1-9]00)$/],
      "text-decoration": [/^(none|underline|line-through)$/],
      "text-align": [/^(left|right|center|justify)$/],
    },
  },
  // Rewrite all anchors to open safely in a new tab.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
  },
};

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}
```

**Verify:** importing from a server action does not pull `isomorphic-dompurify`. A
quick sanity test: `sanitizeRichText("<p onclick='alert(1)'>hi<script>x</script></p>")`
returns `"<p>hi</p>"` (event handler dropped, script tag dropped).

### Task 2.5 — Extend `ProductType` + `isConfigurableLike` in `src/lib/catalog.ts`

**File:** `src/lib/catalog.ts:48-56`

Change the type union:
```ts
export type ProductType = "stocked" | "configurable" | "keychain" | "vending" | "simple";
```

Update `isConfigurableLike` so `simple` is treated identically to vending for
cart/order partitioning + PDP routing:
```ts
export function isConfigurableLike(t: ProductType): boolean {
  return t === "configurable" || t === "keychain" || t === "vending" || t === "simple";
}
```

The `hydrateProducts` function already uses `isConfigurableLike` to decide whether to
parse `priceTiers` (line 264 in current file) — no change needed there; `simple` will
auto-inherit.

**Verify:** `npx tsc --noEmit` — Wave 2 should leave the type errors as ONLY the
five-arity literal cast sites listed in Wave 3 (and the `textarea` consumer sites in
the form modal + storefront, deferred to Waves 3-4). Anything else is a regression.

---

## Wave 3 — Mechanical literal extension across the 13 known sites

> **Why third:** depends on Wave 2 union widening; unblocks Wave 4 admin/storefront
> rendering changes by making the type system happy.

### Task 3.1 — Extend all `"stocked" | "configurable" | "keychain" | "vending"` literals to add `| "simple"`

This is mechanical. The grep in pre-planning identified 13 files; verify by re-running
this command before edit and after edit:

```
grep -rn '"stocked" | "configurable" | "keychain" | "vending"' src/
```

Expected sites (each gets `| "simple"` appended to the union literal):

| File | Lines (from grep) |
|------|------|
| `src/lib/catalog.ts` | done in 2.5 |
| `src/components/store/configurable-product-view.tsx` | 52 |
| `src/components/store/product-detail.tsx` | 31 |
| `src/actions/cart.ts` | 40 |
| `src/actions/configurator.ts` | 85, 155, 193 |
| `src/app/(admin)/admin/products/[id]/edit/page.tsx` | search the whole file |
| `src/components/admin/configurator-builder.tsx` | search; uses `productType` props |
| `src/components/admin/product-form.tsx` | 44, 100, 198 |
| `src/components/admin/product-type-radio.tsx` | 14-16 (props) — handled in Task 3.2 below |

Also check the cart-store and any `cartItem.productType` casts (search `productType:`
in `src/stores/`). They live in client code so the type union must round-trip.

**Strategy:** A single sweep over every literal occurrence — append `| "simple"`. Do
NOT change behaviour; this task is purely making TS accept the fifth member.

### Task 3.2 — Add 5th `simple` card to `ProductTypeRadio`

**File:** `src/components/admin/product-type-radio.tsx`

1. Widen Props union to include `"simple"`.
2. Change grid to `md:grid-cols-2 lg:grid-cols-5` (was lg:grid-cols-4).
3. Add a new `simpleSelected = value === "simple"` const.
4. Append a 5th `<button role="radio">` card AFTER the Vending Machine card. Mirror
   the structure of card 4 (Vending) verbatim — copy/paste the 4 dozen lines and
   change the 7 distinct values:
   - `aria-checked={simpleSelected}`
   - `onClick={() => { if (!locked) onChange("simple"); }}`
   - badge gates: `{simpleSelected && <SelectedBadge />}`
   - icon import + use: `<FileText className="h-5 w-5" />` (add `FileText` to the
     `lucide-react` import on line 3 — preferred over `Layers` because it
     telegraphs "rich content" rather than vending stack).
   - icon-tile background: `simpleSelected ? BRAND.green : "#F4F4F5"`
   - heading text: `"Simple"`
   - description text: `"Flat price. Add free-form fields (text/number/colour/select/rich-text). No auto-seeded fields — fully admin-curated."`

**Verify:** open `/admin/products/new` in dev — five cards now render in a single
row on lg breakpoint, two rows of two + one orphan on md, single column on mobile.
Selecting "Simple" turns its border green and shows the checkmark badge.

### Task 3.3 — Extend extra `productType` casts and union types

Sweep these specific call sites for stragglers:

- `src/components/store/cart-drawer.tsx:56` — already includes vending; widen the
  `i.productType === "configurable" || ... === "vending"` chain to add `|| ... === "simple"`.
- `src/components/store/product-card.tsx` — lines 66, 77, 129, 147 — same pattern;
  add `simple` to every place the chain lists configurable/keychain/vending so the
  storefront card prices and treats `simple` like vending (flat price, no "from").
- `src/app/(store)/products/[slug]/page.tsx:51` — add `|| product.productType === "simple"` to the configurable-data fetch guard.
- `src/app/(store)/bag/page.tsx` — search for any `=== "vending"` chain and add `=== "simple"`.
- `src/components/store/product-detail.tsx:59` — add `|| product.productType === "simple"` to the configurable-view branch (interim — it stays here until 4.4 swaps to `<SimpleProductView>`).
- `src/actions/cart.ts:197-201` — extend the `productType` mapping ternary so that
  `row.productType === "simple"` returns `"simple"`. Update the Wave-4 cart partition
  filter at line 216 too.

**Verify:** after this task, `npx tsc --noEmit` should ONLY error on the new
`textarea` rendering sites (admin modal + storefront field renderer), which Wave 4
fixes. Any other type error means a literal site was missed — re-grep.

---

## Wave 4 — Admin + storefront feature surfaces

> **Why fourth:** all type plumbing is green; this wave actually ships behaviour.

### Task 4.1 — `createProduct` / `updateProduct` `simple` branch

**File:** `src/actions/products.ts`

After the existing `vending` branch (~line 234 in createProduct, ~line 394 in
updateProduct), add a parallel `simple` branch. Differences from vending:

1. **NO seeding.** Do not call any `seedSimpleFields` helper — there is no such
   helper, by design.
2. **Read flat price from `productData.simplePrice`** (added in Task 2.2). If the
   admin tries to save with no/empty price, return
   `{ error: { simplePrice: ["Price is required for simple products"] } }`.
3. **Wire tier-pricing trio to flat price:**
   ```ts
   await db.update(products).set({
     unitField: null,
     maxUnitCount: 1,
     priceTiers: JSON.stringify({ "1": Number(productData.simplePrice) }),
   }).where(eq(products.id, id));
   ```

In `updateProduct` the same block applies on type-flip (mirror the `count() === 0`
guard that vending uses, but here it's redundant since simple has no auto-fields —
just always re-write the trio when productType is simple AND simplePrice is non-empty,
so admin price edits propagate).

**Verify:** create a Simple product with price 19.99 -> `SELECT productType, priceTiers,
maxUnitCount, unitField FROM products WHERE id = '<new>'` returns
`('simple', '{"1":19.99}', 1, NULL)`. NO `product_config_fields` rows are inserted
(unlike vending which seeds 2).

### Task 4.2 — Admin product-form: simplePrice input + post-save redirect

**File:** `src/components/admin/product-form.tsx`

1. Widen `productType` state union to include `"simple"`.

2. Add `const [simplePrice, setSimplePrice] = useState<string>(initialData?.simplePrice ?? "")` — and add `simplePrice?: string | null` to `ProductFormInitial` type.

3. **New conditional block — Price card (visible only when `productType === "simple"`):**
   Place between the Variants card and the Configurator card (around line 425, before
   `productType === "configurable"` block):
   ```tsx
   {productType === "simple" && (
     <Card>
       <CardHeader>
         <CardTitle>Price (MYR)</CardTitle>
         <p className="text-sm text-[var(--color-brand-text-muted)]">
           Flat price for this product. Customer-filled fields (if any) do not affect price.
         </p>
       </CardHeader>
       <CardContent className="space-y-2">
         <Label htmlFor="simplePrice">Price</Label>
         <Input
           id="simplePrice"
           type="text"
           inputMode="decimal"
           value={simplePrice}
           onChange={(e) => setSimplePrice(e.target.value)}
           placeholder="e.g. 19.99"
           className="h-10 max-w-xs"
         />
         {errors.simplePrice && <p className="text-sm text-red-500">{errors.simplePrice}</p>}
         {initialData?.id && (
           <a
             href={`/admin/products/${initialData.id}/fields`}
             className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
           >
             Manage Fields →
           </a>
         )}
       </CardContent>
     </Card>
   )}
   ```

4. **Validate `simplePrice` in `validate()`** when productType === "simple":
   require non-empty, regex `/^\d+(\.\d{1,2})?$/`, otherwise
   `next.simplePrice = "Valid price required (e.g. 19.99)"`.

5. **Include `simplePrice` in payload** (only when productType === "simple", else
   omit). Wire into the existing `payload = { ... }` construction.

6. **Post-create redirect:** in the existing `if (!editing && "productId" in result)`
   branch (around line 195), add the simple branch BEFORE the configurable/keychain/
   vending check:
   ```tsx
   if (productType === "simple") {
     router.push(`/admin/products/${result.productId}/fields`);
   } else if (productType === "configurable" || productType === "keychain" || productType === "vending") {
     router.push(`/admin/products/${result.productId}/configurator`);
   } else {
     router.push(`/admin/products/${result.productId}/variants`);
   }
   ```

7. The `Variants` card guard (line 402) is already `productType === "stocked"` —
   nothing for simple to do there.

**Verify:** create new product -> pick Simple -> enter price 25 + name -> click Create
-> browser redirects to `/admin/products/<new>/fields`.

### Task 4.3 — `/admin/products/[id]/fields` route + `<SimpleFieldsEditor>` + simple-fields server actions

**Create:** `src/app/(admin)/admin/products/[id]/fields/page.tsx`

Lightweight RSC wrapper:
```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SimpleFieldsEditor } from "@/components/admin/simple-fields-editor";
import { getConfiguratorData } from "@/actions/configurator"; // re-uses the same shape

export const metadata: Metadata = {
  title: "Admin · Simple Product Fields",
  robots: { index: false, follow: false },
};

type Params = Promise<{ id: string }>;

export default async function SimpleFieldsPage({ params }: { params: Params }) {
  const { id } = await params;
  let data: Awaited<ReturnType<typeof getConfiguratorData>>;
  try { data = await getConfiguratorData(id); } catch { notFound(); }

  if (data.product.productType !== "simple") {
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-xl font-bold">Not a Simple product</h1>
        <p className="text-sm text-muted-foreground">
          This page is only for products with type Simple.
        </p>
        <a href={`/admin/products/${id}/edit`} className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors">
          ← Back to product
        </a>
      </div>
    );
  }

  return <div className="space-y-6 p-6"><SimpleFieldsEditor initial={data} /></div>;
}
```

**Create:** `src/components/admin/simple-fields-editor.tsx`

A lighter cousin of `configurator-builder.tsx`:
- Show product name + flat price summary at top (no tier-table editor — that's
  configurable territory).
- "Add field" button that opens the existing `<ConfigFieldModal>` (which Wave 4.5
  extends to support the `textarea` type).
- Field list with reorder + edit + delete affordances. Re-use the existing CRUD
  server actions: `addConfigField`, `updateConfigField`, `deleteConfigField`,
  `reorderConfigFields` — they already operate on `productConfigFields` rows and are
  productType-agnostic.
- Pattern B refetch: after every mutation call, re-invoke `getConfiguratorData(id)`
  to refresh the field list (mirror configurator-builder's pattern). Do NOT call
  `router.refresh()`.
- Note: when admin adds a `textarea` field, the modal saves the raw HTML through
  `addConfigField` — which calls `ensureConfigJson("textarea", ...)` — which validates
  via `TextareaFieldConfigSchema`. The sanitisation step happens at the action layer
  (Task 4.5).

**Create:** `src/actions/simple-fields.ts`

This file is OPTIONAL — if the existing `configurator.ts` actions (addConfigField,
updateConfigField, deleteConfigField, reorderConfigFields) serve simple-product needs
unchanged, prefer to skip creating this file and just re-use them. The only
divergence is the sanitisation step for `textarea` configJson — which the modal
performs client-side (Novel produces sanitised HTML naturally) but the SERVER must
also sanitise as defence-in-depth. So:

**Choice (RECOMMENDED): extend `configurator.ts`** — modify `addConfigField` and
`updateConfigField` so that when `input.fieldType === "textarea"`, after the
`schema.safeParse(input.config)` succeeds, run
`(input.config as TextareaFieldConfig).html = sanitizeRichText((input.config as TextareaFieldConfig).html);`
before the DB write. This keeps the simple-fields editor reading from a single
action surface. Skip creating `src/actions/simple-fields.ts`.

If the executor finds extending `configurator.ts` cleaner with a thin wrapper, they
may create `src/actions/simple-fields.ts` instead — but the sanitisation contract is
the same.

**Add to admin sidebar nav** (optional polish): not needed — admin reaches the page
via the "Manage Fields →" button on the edit form.

**Verify:**
1. Create simple product -> click Manage Fields -> land on `/admin/products/<id>/fields`.
2. Click "Add field" -> modal opens -> pick "Text" -> fill label "Engraving" -> save ->
   field appears in the list.
3. Reorder, edit label, delete — all work via Pattern B refetch (no full reload).
4. Direct visit to `/admin/products/<configurable-id>/fields` -> renders the "Not a
   Simple product" guard with back link.

### Task 4.4 — Storefront: `<SimpleProductView>` + `<TextareaDisplay>` + branch in `<ProductDetail>`

**Create:** `src/components/store/textarea-display.tsx`

Read-only sanitised HTML block for `textarea` config fields on simple-product PDPs.
The `html` arrives PRE-SANITISED from the server (rich-text-sanitizer.ts on save).

Implementation outline:

```tsx
"use client";

type Props = {
  label?: string;
  helpText?: string | null;
  /**
   * IMPORTANT: This string MUST already be passed through sanitizeRichText()
   * on the server (see src/lib/rich-text-sanitizer.ts). Defence-in-depth:
   * the configurator action layer re-sanitises on every save, so even a stale
   * pre-sanitiser row is safe. Novel does not emit dangerous HTML.
   */
  html: string;
};

export function TextareaDisplay({ label, helpText, html }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--color-brand-ink)]">
          {label}
        </h3>
      )}
      {helpText && <p className="text-xs text-[var(--color-brand-text-muted)]">{helpText}</p>}
      {/*
        Render sanitised HTML. Use React's raw-HTML escape hatch
        (the `dangerouslySetInnerHTML` prop with `__html` key). Disable
        the eslint react/no-danger rule on this single line with a justification
        comment that names the sanitiser. The HTML has been allowlisted at
        the server boundary by sanitize-html via sanitizeRichText().
      */}
      <div
        className="prose prose-sm max-w-none text-[var(--color-brand-ink)]"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
```

This is the ONE place in the codebase where the React raw-HTML escape hatch is
acceptable, because the input has been passed through `sanitize-html` on every
write path. The sanitiser is the security boundary, not the consumer. Do not
introduce any other use of this pattern elsewhere in the project.

**Create:** `src/components/store/simple-product-view.tsx`

A leaner cousin of `configurable-product-view.tsx`:
- Image gallery with arrow navigation (re-use `<ConfigurableImageGallery>` if it
  already supports arrows per the scope reference to "PR #3", otherwise re-use
  `<ProductGallery>`).
- Flat price label (read from `priceTiers["1"]` via `ensureTiers`).
- Iterate `fields` array:
  - For `text`/`number`/`colour`/`select` -> render the existing input renderer
    components from `configurator-form.tsx` (extract them as named exports if not
    already; otherwise re-use `<ConfiguratorForm>` and ignore textarea fields there).
  - For `textarea` -> render `<TextareaDisplay html={cfg.html} label={field.label}
    helpText={field.helpText} />`. textarea fields are NEVER inputs.
- Add to bag:
  - unit price = flat price (priceTiers["1"]).
  - configurationData.values = customer-filled fields ONLY (text/number/colour/select).
    EXCLUDE textarea fields entirely from the values map (they're admin content,
    not customer data).
  - configurationData.computedSummary = mirror buildSummary in
    configurable-product-view.tsx but skip textarea fields.
  - storeKey: `${productId}::${hash(values)}` per existing convention.

**Edit:** `src/components/store/product-detail.tsx:59`

Add a branch BEFORE the existing configurable-like branch:
```tsx
if (product.productType === "simple" && configurableData) {
  return <SimpleProductView product={{ ...product, pictures }} {...configurableData} isWishlistedInitial={isWishlistedInitial} ratingAvg={ratingAvg} ratingCount={ratingCount} />;
}
if ((product.productType === "configurable" || product.productType === "keychain" || product.productType === "vending") && configurableData) {
  return <ConfigurableProductView ... />;
}
```

**Edit:** `src/app/(store)/products/[slug]/page.tsx:51` (already updated in 3.3 to
include simple in the configurable-data fetch guard).

**Verify:**
1. Create simple product with price 25 + a "text" field "Engraving" + a "textarea"
   field "Care Instructions" containing rich HTML.
2. Visit `/products/<slug>` -> sees photo gallery, price RM 25, an Engraving input
   (text), and a Care Instructions HTML block (read-only, no input).
3. Type "JOHN" into Engraving -> click Add to Bag -> drawer opens with a line item
   showing price RM 25 and configurationData.values = `{ <textFieldId>: "JOHN" }`
   (no textarea key).

### Task 4.5 — `<ConfigFieldModal>`: add `textarea` support + `<NovelRichTextEditor>` wrapper

**Create:** `src/components/admin/novel-rich-text-editor.tsx`

```tsx
"use client";

import dynamic from "next/dynamic";

/**
 * Lazy-loaded Novel rich-text editor. SSR disabled because Tiptap touches `window`
 * during init. Bubble menu provides bold / italic / underline / strikethrough /
 * lists / headings. AI features disabled.
 *
 * Output: HTML string passed through onChange. The CALLER is responsible for
 * pushing the value through sanitizeRichText() on save (server action does this
 * defensively too).
 */
type EditorProps = {
  defaultValue?: string;
  onUpdate?: (html: string) => void;
  disableLocalStorage?: boolean;
};

const NovelEditor = dynamic(
  // Adjust to whatever the installed `novel` API actually exports.
  // The most common export is `{ Editor }` from "novel"; if the installed
  // version exposes a different shape, swap to that. Do NOT use any AI imports.
  async () => {
    const mod = await import("novel");
    return { default: (mod as unknown as { Editor: React.ComponentType<EditorProps> }).Editor };
  },
  { ssr: false, loading: () => <div className="h-40 rounded-md border bg-muted/30" /> },
);

type Props = {
  value: string;
  onChange: (html: string) => void;
};

export function NovelRichTextEditor({ value, onChange }: Props) {
  return (
    <div className="rounded-md border border-[var(--color-brand-border)] p-2">
      <NovelEditor
        defaultValue={value}
        disableLocalStorage
        onUpdate={onChange}
      />
    </div>
  );
}
```

> **Executor note:** Novel's exact export name and props differ slightly per version.
> If the installed version's API differs, adapt the dynamic import shape — but DO
> NOT enable AI completion (no OpenAI key required, no AI features). The contract
> with the caller is: receive HTML string in, emit HTML string out.

**Edit:** `src/components/admin/config-field-modal.tsx`

1. **Extend `FIELD_TYPES` array** (line 59):
   ```ts
   { value: "textarea", label: "Rich Text", description: "Admin-authored content block (read-only on PDP)" },
   ```

2. **Import the editor + sanitiser:** at top, add
   ```ts
   import { NovelRichTextEditor } from "@/components/admin/novel-rich-text-editor";
   import { TextareaFieldConfigSchema, type TextareaFieldConfig } from "@/lib/config-fields";
   ```

3. **State for textarea config** (alongside text/number/colour/select states ~line 383):
   ```ts
   const [textareaConfig, setTextareaConfig] = useState<Partial<TextareaFieldConfig>>(
     initialField?.fieldType === "textarea"
       ? (initialField.config as TextareaFieldConfig)
       : { html: "" }
   );
   ```

4. **Extend `getConfig()` switch** (line 404):
   ```ts
   if (fieldType === "textarea") return textareaConfig as AnyFieldConfig;
   ```

5. **Extend the schema picker** (line 416):
   ```ts
   : fieldType === "textarea" ? TextareaFieldConfigSchema
   ```

6. **New `<TextareaConfigForm>` block** rendered after the existing
   `{fieldType === "select" && ...}` branch (~line 608). The form is just the
   Novel editor:
   ```tsx
   {fieldType === "textarea" && (
     <NovelRichTextEditor
       value={textareaConfig.html ?? ""}
       onChange={(html) => setTextareaConfig({ html })}
     />
   )}
   ```

7. **Settings header** (line 591): add textarea label:
   ```ts
   {fieldType === "text" ? "Text" : fieldType === "number" ? "Number" : fieldType === "colour" ? "Colour" : fieldType === "select" ? "Select" : "Rich Text"} settings
   ```

8. **Save flow (`onSave`)** — when fieldType is textarea, the `config.html` may
   contain raw HTML. The server-side `addConfigField`/`updateConfigField` will
   re-sanitise it via `sanitizeRichText` (Task 4.3 RECOMMENDED path) — no client-side
   sanitisation needed; rely on the server contract.

**Verify:**
1. From simple-fields editor, click "Add field" -> modal opens with five field type
   cards including "Rich Text".
2. Pick "Rich Text" -> Novel editor renders below settings header.
3. Type some text, bold a word, add a list -> click Save -> field saved; reopening
   the field via Edit button shows the formatted HTML round-tripped through the
   editor.
4. Inspect DB: `SELECT configJson FROM product_config_fields WHERE id = '<id>'`
   returns sanitised HTML (no `onclick=`, no `<script>`).

### Task 4.6 — Block `simple` from `/admin/products/[id]/configurator`

**Edit:** `src/app/(admin)/admin/products/[id]/configurator/page.tsx:32`

Update the productType guard so simple is rejected (it has its own `/fields` route):
```ts
if (data.product.productType !== "configurable" && data.product.productType !== "keychain" && data.product.productType !== "vending") {
  return (
    <div className="p-6 space-y-3">
      <h1 className="text-xl font-bold">
        {data.product.productType === "simple"
          ? "Use the Simple-product fields editor"
          : "This product is stocked, not made-to-order"}
      </h1>
      <p className="text-sm text-muted-foreground">
        {data.product.productType === "simple"
          ? "Simple products manage fields at /admin/products/<id>/fields."
          : "The configurator is only available for Made-to-Order, Keychain, and Vending products."}
      </p>
      <a
        href={data.product.productType === "simple"
          ? `/admin/products/${id}/fields`
          : `/admin/products/${id}/variants`}
        className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
      >
        {data.product.productType === "simple" ? "Manage Simple Fields →" : "Manage variants instead →"}
      </a>
    </div>
  );
}
```

The existing union widening from Task 3.1 already lets this comparison compile.

**Verify:** visit `/admin/products/<simple-id>/configurator` -> renders the redirect
message with the "Manage Simple Fields →" link.

### Task 4.7 — `<ConfigurableProductView>` / `<ConfiguratorForm>` ignore textarea

**File:** `src/components/store/configurator-form.tsx`

Even though textarea fields should never appear on configurable/keychain/vending
PDPs (the admin would have to manually attach one), defence: in
`<ConfiguratorForm>`'s field map, skip rendering when `field.fieldType === "textarea"`
(or render via `<TextareaDisplay>` so the content shows but isn't an input). The
simpler choice: skip — it's a misconfiguration if it happens on those types.

**File:** `src/components/store/configurable-product-view.tsx`

Inside `buildSummary` (~line 67), add an early-continue for textarea:
```ts
if (f.fieldType === "textarea") continue; // admin-content, not customer data
```

This guards against orphan textarea fields somehow ending up on a configurable product
breaking summary generation.

**Verify:** no behavioural test required — pure safety. `npx tsc --noEmit` passes.

---

## Wave 5 — Verify, commit, PR, merge (delegated to Haiku subagent)

> **Why fifth + final:** delegated to Haiku per project memory rule
> ([feedback_commits_haiku.md](memory/feedback_commits_haiku.md)). The executor must
> NOT run git commit / push / pr commands inline.

### Task 5.1 — Pre-commit verification (executor runs, not Haiku)

```bash
# 1. Migrations are idempotent — second run no-ops
npx dotenv -e .env.local -- npx tsx scripts/migrate-add-simple-product-type.ts
npx dotenv -e .env.local -- npx tsx scripts/migrate-add-textarea-field-type.ts

# 2. TypeScript clean
npx tsc --noEmit

# 3. Optional smoke (NOT a blocker — known pre-existing CSS issue):
# npm run build
```

**All three must pass:**
- TS errors zero.
- Migrations report `no-op` on second run.

**If any check fails:** stop, surface the error, do NOT delegate to Haiku.

### Task 5.2 — Delegate commit + push + PR + merge to Haiku subagent

> **Critical:** the executor invokes the Haiku Task agent here — does NOT run git
> commands directly. The Haiku agent receives the prompt below.

**Spawn a Task agent with `subagent_type: general-purpose` (Haiku-routed) with this
prompt:**

```
Branch + commit + PR + merge for quick task 260430-icx (Simple productType + textarea).

CONTEXT
- Repo cwd: C:/Users/User/OneDrive - City Travelers/printninjaz
- Current branch: dev
- Status (pre-sweep): see `git status`. PNG screenshots in repo root must NOT be
  staged (pdp-*.png, thumb-*.png, verify-*.png).
- Work just completed by another agent: see PLAN.md at
  .planning/quick/260430-icx-build-new-producttype-simple-new-field-t/260430-icx-PLAN.md
- All files listed in PLAN.md frontmatter `files_modified` are the only files to stage.

CONSTRAINTS
- Branch protection on dev: PR + green "Install + typecheck" check required.
- Do NOT touch master.
- Do NOT use --no-verify.
- Do NOT use --force / --force-with-lease.
- Do NOT amend; create a NEW commit if hook fails.
- Stage explicitly by file path; never `git add -A` or `git add .`.
- Co-author footer required:
    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

STEPS
1. Create a feature branch off the current dev: `feat/260430-icx-simple-producttype-and-textarea-field`.
2. Stage ONLY files listed in PLAN.md frontmatter `files_modified` plus
   `package.json` and `package-lock.json` (Wave 1.3 added novel + sanitize-html).
3. Verify with `git status` that no stray PNGs / .env / lock files outside
   package-lock.json are staged.
4. Commit with message:
     feat(catalog): add `simple` productType + `textarea` rich-text field type

     - DB ENUMs widened: products.productType += 'simple',
       product_config_fields.fieldType += 'textarea' (idempotent migrations).
     - simple = vending data model (flat price, maxUnitCount=1) WITHOUT auto-seed;
       admin curates fields freely at /admin/products/<id>/fields.
     - textarea = Novel rich-text editor in admin, sanitised HTML block on PDP
       (read-only, never an input — admin-authored content, not customer data).
     - sanitize-html (server-only CommonJS) — isomorphic-dompurify NOT used (broke
       prod previously per CLAUDE.md).
     - 5th product card (Simple) added to ProductTypeRadio; grid widened to
       lg:grid-cols-5.
     - All `"stocked" | ... | "vending"` literals widened to add `| "simple"` across
       ~13 files; cart partition + PDP routing treat simple identically to vending.

     Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
5. Push the branch with `-u origin <branch>`.
6. Open a PR against `dev` with title:
     feat: simple productType + textarea rich-text field
   PR body:
     ## Summary
     - Adds 5th productType `simple` (flat price, no auto-seed, admin-curated fields)
     - Adds 5th fieldType `textarea` (Novel rich-text in admin, sanitised HTML on PDP)
     - Mechanical fan-out across all literal sites (~21 files)

     ## Test plan
     - [ ] Visit /admin/products/new -> Simple card visible, fifth slot
     - [ ] Create Simple product with price 25 -> redirects to /admin/products/<id>/fields
     - [ ] Add a `text` field + a `textarea` field -> both save
     - [ ] Visit /products/<slug> -> text input shown, textarea HTML block read-only
     - [ ] Add to bag with text="JOHN" -> cart line shows RM 25, configurationData
           includes text but NOT textarea
     - [ ] /admin/products/<simple-id>/configurator shows redirect to /fields
7. Wait for the "Install + typecheck" GitHub Actions check to turn green
   (poll with `gh pr checks <pr-url>`; reasonable timeout 10 minutes; if it
   fails, surface the failure log and STOP — do NOT merge).
8. Once green, merge via `gh pr merge <pr-url> --squash --delete-branch`.
9. After merge, switch back to dev locally, pull, and confirm HEAD includes the
   new commit. Print final commit SHA.

REPORT BACK
- Final commit SHA on dev
- PR URL
- CI check status
- Any deviation from the plan (e.g. files added that weren't in frontmatter)
```

**Executor's responsibility ends after spawning the Haiku agent.** Wait for its
report, then mark this plan complete and update STATE.md "Quick Tasks Completed"
table with a new row.

**Verify (after Haiku finishes):**
- `gh pr view <url> --json mergedAt,state` shows merged + closed.
- `gh pr checks <url>` shows all green.
- GitHub Actions auto-deploys the merge to `app.3dninjaz.com` (per
  `.github/workflows/deploy.yml`); allow ~5 min for deploy.

---

## Out of scope

- Stock tracking on simple products (not needed; simple uses vending price model).
- AI completion in Novel (explicitly disabled).
- Admin UI for cross-listing of textarea-content reuse across products (each
  textarea field belongs to exactly one product row).
- Migration of existing products to `simple` (admins flip via the existing edit
  form once the type is selectable).
- Customer-facing search/filtering by productType (not in scope; admin filter
  may already exist via `/admin/products` table).
- Storefront cart/order partition changes beyond extending the existing
  configurable-like predicate — `simple` shares the configurable-cart-line keying
  (`${productId}::${hash}`) with vending/keychain.

## Risk + rollback

**Risk vectors:**
1. Novel package version drift — if installed major exposes a different `Editor`
   export, the dynamic import in `<NovelRichTextEditor>` may fail. Mitigation: lazy
   load with explicit `loading` fallback; the editor crash is contained to the admin
   modal and does not affect storefront/cart paths.
2. ENUM widening on a column referenced by application code from a stale prod
   bundle — N/A here; CI gates the merge and auto-deploy ships the new bundle
   atomically with the migrated DB. No window where prod bundle precedes the DB
   change because migrations run BEFORE commit.
3. sanitize-html allowlist too restrictive — if Novel emits unexpected tags (e.g.
   `<mark>`, `<code>`), they'll be stripped. Mitigation: tighten allowlist to the
   bubble menu's actual output during manual smoke; expand if needed in a follow-up.

**Rollback:**
1. Revert the merge commit on dev (`git revert -m 1 <merge-sha>`) -> CI re-deploys.
2. Migrations are additive ENUM extensions — leaving them in place is safe (no
   rows reference the new values until a Simple product is created).
3. If a Simple product was created post-deploy, change its `productType` back to
   `stocked` via the admin edit form before reverting code.
