---
quick_id: 260713-fay
phase: quick-260713-fay
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/actions/admin-production.ts
  - src/components/admin/keychain-batches.tsx
autonomous: true
requirements: [260713-fay]

must_haves:
  truths:
    - "On /admin/production → Keychain batches → Bases, a ROUND-shape keychain and a SQUARE-shape keychain ordered in the SAME base colour appear as TWO separate base batch cards"
    - "Two keychain lines of the same base colour AND same shape still merge into ONE base batch (existing behaviour preserved)"
    - "Each base batch card shows a clear round-vs-square marker so staff print the correct base STL"
    - "Clicker+Letter grouping and Assembly view are byte-for-byte unchanged"
    - "Manual (productId='manual') and product-row-missing keychain lines default to 'square' and never crash"
    - "Non-keychain lines are skipped exactly as before"
  artifacts:
    - path: "src/actions/admin-production.ts"
      provides: "Per-product keychainShape read + composite base grouping key + shape field on KeychainUnit/KeychainBaseBatch"
      contains: "keychainShape"
    - path: "src/components/admin/keychain-batches.tsx"
      provides: "Round/Square marker on each base batch card + shape-aware React key"
      contains: "shape"
  key_links:
    - from: "src/actions/admin-production.ts getKeychainBatches"
      to: "products.keychainShape"
      via: "db.select({id, keychainShape}).from(products).where(inArray(products.id, productIds)) → shapeByProductId Map"
      pattern: "inArray\\(products\\.id"
    - from: "KeychainUnit.shape"
      to: "base grouping key"
      via: "`${shape}|||${base}` composite key in step 4"
      pattern: "\\|\\|\\|"
    - from: "KeychainBaseBatch.shape"
      to: "BatchCard shape badge (UI)"
      via: "badge prop rendered on base cards only"
      pattern: "shape"
---

<objective>
Differentiate keychain BASE production batches by base SHAPE (round vs square) on the admin production floor (/admin/production → Keychain batches → Bases).

Purpose: A "Round Keyboard Clicker" (products.keychainShape='round') and a "Keyboard Clicker" (keychainShape='square') ordered in the SAME base colour currently collapse into ONE base batch because getKeychainBatches groups bases by colour string only. They are physically different STL parts and cannot be printed together — the floor cannot tell which base to print.

Output: getKeychainBatches reads keychainShape per product (one extra MariaDB-safe query), splits the base grouping key by shape, carries `shape` on the batch, and the production UI shows a clear round/square marker on each base card. Reads shape at batch time (product-level attribute, not a customer choice) so existing in-flight orders backfill automatically with zero schema/data change and zero touch to add-to-bag / POS / PDP.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md

@src/actions/admin-production.ts
@src/components/admin/keychain-batches.tsx

<interfaces>
<!-- Everything the executor needs. Do NOT explore the codebase for these. -->

CONFIRMED FACTS (verified during planning):
- `getKeychainBatches` reads FULL orderItems rows: `db.select().from(orderItems)` at ~lines 428-431 → `it.productId` IS available on every row.
- orderItems.productId is `varchar("product_id")` NOT NULL (schema.ts:616). No FK (snapshot column).
- Manual sentinel = `it.productId === "manual"` (isManualLine, src/lib/orders.ts:85). parseKeychainParts already returns null for manual/free-text lines, but guard anyway → default 'square'.
- products.keychainShape column: `mysqlEnum("keychainShape", ["square","round"]).notNull().default("square")` (schema.ts:204). The Drizzle field is `products.keychainShape`. Default is 'square'.
- Current import line 4: `import { orders, orderItems } from "@/lib/db/schema";` — ADD `products`.
- `inArray` is already imported (line 5).

Current KeychainUnit type (admin-production.ts ~350-366) — ADD `shape`:
```typescript
export type KeychainUnit = {
  itemId: string;
  orderId: string;
  invoiceNumber: string;
  clientName: string;
  name: string;
  letters: number;
  base: string;
  clicker: string;
  letter: string;
  quantity: number;
  baseDone: boolean;
  clickerLetterDone: boolean;
  productionDone: boolean;
  // ADD: shape: "square" | "round";
};
```

Current KeychainBaseBatch type (~369-375) — ADD `shape`:
```typescript
export type KeychainBaseBatch = {
  base: string;
  totalQty: number;
  items: KeychainUnit[];
  doneCount: number;
  allDone: boolean;
  // ADD: shape: "square" | "round";
};
```

Reuse notes (do NOT create new construction sites):
- `KeychainAssemblyUnit = KeychainUnit & { bothPartsDone }` is built by spreading each unit: `units.map((u) => ({ ...u, bothPartsDone }))` (~line 496) → inherits `shape` automatically, no change.
- `KeychainClickerLetterBatch.items` reuse the same KeychainUnit objects → they carry `shape`, but clicker GROUPING key stays colour-only. DO NOT change clicker grouping (see FLAG FOR REVIEW).

Current base grouping — step 4 (~lines 455-468), the ONLY block to change for grouping:
```typescript
// 4) Group BASES — by base colour string.
const baseMap = new Map<string, KeychainUnit[]>();
for (const u of units) {
  const list = baseMap.get(u.base) ?? [];
  list.push(u);
  baseMap.set(u.base, list);
}
const bases: KeychainBaseBatch[] = Array.from(baseMap.entries())
  .map(([base, items]) => {
    const totalQty = items.reduce((s, u) => s + u.quantity, 0);
    const doneCount = items.filter((u) => u.baseDone).length;
    return { base, totalQty, items, doneCount, allDone: doneCount === items.length };
  })
  .sort((a, b) => b.totalQty - a.totalQty);
```

UI — bases render in keychain-batches.tsx (~lines 527-541), key + card:
```tsx
{bases.map((b) => (
  <BatchCard
    key={b.base}                 // ← must include shape once colours split
    title={`${b.base}`}
    sub="base"
    accent={BLUE}
    items={b.items}
    doneCount={b.doneCount}
    partDone={(u) => u.baseDone}
    onToggleOne={(id, done) => onToggleBase([id], done)}
    onToggleAll={onToggleBase}
  />
))}
```
BatchCard signature (~lines 104-122) currently takes: title, sub?, accent, items, doneCount, partDone, onToggleOne, onToggleAll. It renders `title` (bold) with an optional `sub` caption below. lucide-react is already the icon lib in this file (import block lines 4-13). BRAND palette + BLUE accent already in scope.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Read keychainShape per product and split base batches by shape</name>
  <files>src/actions/admin-production.ts</files>
  <action>
Data layer in getKeychainBatches. Make these edits:

1. Import: change line 4 to `import { orders, orderItems, products } from "@/lib/db/schema";`.

2. Type additions:
   - KeychainUnit (~350-366): add required field `shape: "square" | "round";`.
   - KeychainBaseBatch (~369-375): add required field `shape: "square" | "round";`.
   - Do NOT touch KeychainClickerLetterBatch or KeychainAssemblyUnit types (they inherit/reuse KeychainUnit and pick up `shape` for free).

3. Resolve shape at batch time (product-level attribute — read at query time, do NOT plumb through computedSummary or any capture path). Refactor the current step-3 units loop (~434-453) so it produces a fully-typed KeychainUnit[] WITH shape via ONE extra MariaDB-safe query:
   a. First pass over itemRows: collect the keychain matches into a temp array `matched: { it: typeof itemRows[number]; parts: KeychainParts }[]` (push `{ it, parts }` where parts = parseKeychainParts(it.configurationData) is non-null). Skip non-keychain lines exactly as today.
   b. Build distinct product ids of keychain matches, EXCLUDING the 'manual' sentinel:
      `const productIds = [...new Set(matched.map((m) => m.it.productId).filter((id) => id !== "manual"))];`
   c. Build `const shapeByProductId = new Map<string, "square" | "round">();` — GUARD the empty case: only run the query when `productIds.length > 0` (avoid `IN ()`). Query is manual/no-LATERAL, matching this repo's convention:
      `const shapeRows = await db.select({ id: products.id, keychainShape: products.keychainShape }).from(products).where(inArray(products.id, productIds));`
      then `for (const r of shapeRows) shapeByProductId.set(r.id, r.keychainShape);`
   d. Build units from `matched`, resolving shape with a safe default:
      `shape: matched-item's productId === "manual" ? "square" : (shapeByProductId.get(it.productId) ?? "square")`.
      Default 'square' covers manual lines AND deleted/missing product rows — matches the column default, never crashes. All other unit fields stay exactly as the current construction (~438-452).

4. Change base grouping (step 4, ~455-468) key from colour-only to composite `${shape}|||${base}`:
   - `const key = \`${u.shape}|||${u.base}\`;` and group into baseMap by that key.
   - When mapping entries → KeychainBaseBatch, split the composite back: `const [shape, base] = key.split("|||") as ["square" | "round", string];` (base colours in this repo have no `|||`; the shape token is always the first segment). Emit `{ base, shape, totalQty, items, doneCount, allDone }`. KEEP the existing `.sort((a, b) => b.totalQty - a.totalQty)`.

5. Do NOT change step 5 (clicker+letter grouping) or step 6 (assembly). See the FLAG FOR REVIEW note — clicker scope is intentionally untouched.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
tsc clean. getKeychainBatches issues exactly ONE extra SELECT (guarded on non-empty productIds), builds shapeByProductId, and every KeychainUnit carries `shape` ('square' default for manual/missing). Base grouping key is `${shape}|||${base}`; KeychainBaseBatch carries `shape`; sort unchanged. Clicker+letter and assembly blocks unchanged. Logic check by inspection: two same-colour units with different `shape` produce two distinct baseMap keys → two batches; two same-colour same-shape units share one key → one batch.
  </done>
</task>

<task type="auto">
  <name>Task 2: Show round/square marker on each base batch card</name>
  <files>src/components/admin/keychain-batches.tsx</files>
  <action>
UI layer — minimal, additive, matches existing production visual language (BRAND palette, existing pill/badge style). Do NOT redesign; only the Bases cards gain a marker.

1. Fix the React key collision: in the bases `.map` (~line 531) change `key={b.base}` to `key={\`${b.shape}|||${b.base}\`}` so a colour that split into round+square renders two distinct keyed cards (no duplicate-key warning, no state bleed).

2. Add a small shape badge to BatchCard, shown ONLY for base cards:
   - Add an optional prop to BatchCard: `badge?: React.ReactNode` (append to its props type ~104-122 and destructure it).
   - Render `badge` inside the header next to the title — place `{badge}` in the title row (~lines 147-159, alongside the truncating title `<p>` and the ChevronDown), so it sits beside the colour name. Keep it `shrink-0`.
   - Define a small `ShapeBadge({ shape }: { shape: "square" | "round" })` helper in this file that renders a pill consistent with the existing chip style (e.g. rounded-full, px-2 py-0.5, text-[11px], font-bold, tabular look). Use lucide `Circle` for round and `Square` for square (add both to the existing lucide-react import block, lines 4-13) plus the label text "Round" / "Square". Tint it with a neutral/BLUE-family style that reads clearly against the white card and does not clash with the blue accent rail — e.g. `background: "rgba(11,16,32,0.06)"`, `color: INK`, with the icon at h-3 w-3. It must be unmistakable at a glance which base STL to print.

3. Wire it: in the bases BatchCard call (~527-541) pass `badge={<ShapeBadge shape={b.shape} />}`. Leave `sub="base"` as-is. Do NOT pass `badge` on the Clicker+Letter BatchCard call (~551-563) — that card stays visually identical.

4. No other changes. The optimistic onToggleBase handlers already key off itemId and remain correct after the split (each item belongs to exactly one shape+colour batch).
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
tsc clean. Bases view: each base card shows a clear "Round"/"Square" badge with a Circle/Square icon next to the colour name; card key includes shape (no duplicate-key warning when a colour splits). Clicker+Letter and Assembly cards visually unchanged (no badge). BatchCard.badge is optional and undefined for non-base callers.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| admin browser → server action | getKeychainBatches / markKeychainPartPrinted — already gated by `await requireAdmin()` as the first await (CVE-2025-29927 pattern). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-fay-01 | Information Disclosure | new `products.keychainShape` SELECT in getKeychainBatches | accept | Admin-only path (requireAdmin already first await); keychainShape is non-sensitive production metadata, no PII, projected columns limited to id + keychainShape. |
| T-fay-02 | Tampering | base grouping key derived from DB `keychainShape` enum | accept | Shape comes from the DB enum column (server-controlled, not client input); no new client-writable surface introduced. Existing itemId validation in markKeychainPartPrinted unchanged. |
</threat_model>

<verification>
1. `npx tsc --noEmit` — clean (both tasks).
2. Logic/inspection verification (no standing unit-test suite for server actions in this repo — do not invent one):
   - Two keychain order lines, SAME base colour, DIFFERENT products where one product's keychainShape='round' and the other's is 'square' → getKeychainBatches yields TWO KeychainBaseBatch entries (keys `round|||<colour>` and `square|||<colour>`), each with its own `shape`.
   - Two keychain lines, SAME base colour, SAME shape → still ONE KeychainBaseBatch (single key).
   - A manual line (productId='manual') or a line whose product row is missing → `shape` resolves to 'square', no crash, no extra query cost when productIds is empty.
   - Clicker+Letter and Assembly outputs are identical to pre-change (grouping keys and sort untouched).
3. UI: on /admin/production → Keychain batches → Bases, each card shows a Round/Square marker; a split colour renders two cards without a React duplicate-key warning.
</verification>

<success_criteria>
- Round and square keychains of the same base colour print from SEPARATE base batches on the floor.
- Same-colour same-shape lines still batch together.
- Staff can tell round from square at a glance on each base card.
- Zero schema/data migration, zero storefront/PDP/POS/add-to-bag changes, existing in-flight orders backfill automatically.
- Live prod store unaffected (admin-internal view only); ships dev-first to app.3dninjaz.com via PR to dev.
</success_criteria>

<notes>
## FLAG FOR REVIEW — clicker+letter part may ALSO need shape-splitting (OUT OF SCOPE this task)

During planning it became clear the ROUND keychain is a physically distinct body, not just a base difference: quick tasks 260705-azw / 260705-l0h / 260705-n1x render the round variant's CLICKER with a circular face + a letter-coloured ring/inward border, i.e. the round clicker geometry differs from the square clicker. If that visual difference reflects a different printed STL (very likely), then the CLICKER+LETTER grouping (`${clicker}|||${letter}`, step 5) has the SAME collision bug as the base grouping did: a round product's clicker+letter and a square product's clicker+letter in the same colours would merge into one batch but cannot be printed together.

This task deliberately leaves clicker+letter grouping unchanged per the locked base-only scope. **Recommend a follow-up decision:** confirm with the shop whether the round vs square clicker+letter are distinct prints; if yes, apply the identical shape-composite fix to step 5's key (`${shape}|||${clicker}|||${letter}`) and add `shape` to KeychainClickerLetterBatch + its UI card. The KeychainUnit already carries `shape` after this task, so the follow-up is small.

## Manual-line handling
parseKeychainParts already returns null for productId='manual' free-text lines (no keychain-pattern computedSummary), so they normally never enter `units`. The explicit `productId === "manual" → 'square'` default is defence-in-depth in case a manual line ever carries a keychain-shaped summary; it also guarantees the shape query never includes the sentinel id.
</notes>

<output>
After completion, create `.planning/quick/260713-fay-keychain-base-shape-batches/260713-fay-SUMMARY.md`.
</output>
