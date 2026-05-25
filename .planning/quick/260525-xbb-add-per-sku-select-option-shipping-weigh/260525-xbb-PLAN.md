---
phase: quick-260525-xbb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/config-fields.ts
  - src/components/admin/config-field-modal.tsx
  - src/actions/shipping-quote.ts
  - src/components/checkout/shipping-rate-picker.tsx
  - src/components/admin/pos-builder.tsx
  - src/actions/shipping.ts
  - src/lib/__tests__/option-weight-resolution.test.ts
autonomous: true
requirements:
  - SKU-WEIGHT-SCHEMA
  - SKU-WEIGHT-ADMIN-UI
  - SKU-WEIGHT-RESOLUTION-CHECKOUT
  - SKU-WEIGHT-RESOLUTION-BOOKING

must_haves:
  truths:
    - "Admin can enter a per-option Weight (g) beside price/SKU in the Select-option editor and it persists on save"
    - "A configurable product's checkout shipping quote uses the chosen Select option's weight, not the 1kg default fallback"
    - "Choosing a heavier Select option yields a higher Delyva weight (weightKg) than choosing a lighter one for the same product"
    - "Admin order booking (sumOrderWeight) resolves option weight from the stored order_item configuration snapshot"
    - "The server re-reads option weight from product_config_fields.configJson and never trusts a client-supplied weight (T-17-09 spoofing guard)"
    - "Old Select options without a weight still parse and fall through to the existing variant/product/default ladder (backward compatible)"
  artifacts:
    - path: "src/lib/config-fields.ts"
      provides: "Optional integer grams `weight` on each Select option (type + Zod schema)"
      contains: "weight"
    - path: "src/components/admin/config-field-modal.tsx"
      provides: "Weight (g) numeric input per Select-option row"
      contains: "Weight"
    - path: "src/actions/shipping-quote.ts"
      provides: "configValues on CartItemForQuote + DB-re-read option-weight tier (highest priority)"
      contains: "configValues"
    - path: "src/actions/shipping.ts"
      provides: "sumOrderWeight resolves option weight from order_item configuration snapshot"
      contains: "configurationData"
    - path: "src/lib/__tests__/option-weight-resolution.test.ts"
      provides: "Unit test proving heavier option > lighter option weight precedence + backward compat"
      exports: []
  key_links:
    - from: "src/components/checkout/shipping-rate-picker.tsx"
      to: "quoteForCart configValues"
      via: "maps HydratedCartItem.configurationData.values into CartItemForQuote.configValues"
      pattern: "configValues"
    - from: "src/actions/shipping-quote.ts"
      to: "product_config_fields.configJson"
      via: "server re-fetch of Select option weight by fieldId->value"
      pattern: "productConfigFields|configJson"
    - from: "src/actions/shipping.ts"
      to: "order_items.configurationData"
      via: "ensureConfigurationData + configJson option lookup"
      pattern: "ensureConfigurationData"
---

<objective>
Give every product's shipping quote the real weight of the chosen SKU (the selected Select option), instead of falling to the flat 1 kg / defaultWeightKg fallback that currently mis-prices all 13 products.

Per-option weight is added at the schema level (one optional `weight` field on each Select option), edited in the shared Select-option editor, and resolved as the highest-priority weight tier in BOTH the customer/POS checkout path (`quoteForCart`) and the admin booking path (`sumOrderWeight`). Because it lives on the shared option editor + shared resolver, it works for ALL current products and automatically for ALL future products — no per-product hardcoding, no data backfill.

Purpose: live checkout + admin booking shipping prices become correct per-SKU. Money-touching, customer-facing.
Output: schema field, admin UI input, two server resolvers, and a unit test proving heavier-option > lighter-option precedence.

Scope guard (per "Simple Solutions First"): grams only, no dimensions, no product-level weight UI. Keychain/tier-priced products are NOT in scope — they have no Select field; note as a follow-up todo, do not block.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<interfaces>
<!-- Extracted from the codebase on 2026-05-25. Use directly — no exploration needed. -->

src/lib/config-fields.ts — SelectFieldConfig type (~line 48) and SelectFieldConfigSchema (~line 126):
  type SelectFieldConfig = {
    options: Array<{ label: string; value: string; price?: number; sku?: string; imageUrl?: string }>;
  }
  SelectFieldConfigSchema = z.object({ options: z.array(z.object({
    label: z.string().min(1), value: z.string().min(1),
    price: z.number().nonnegative().optional(), sku: z.string().optional(), imageUrl: z.string().optional(),
  })).min(1) })

  ensureConfigJson(fieldType, raw): parses LONGTEXT configJson via the per-fieldType Zod schema.
  ConfigurationData.values: Record<string,string>  // fieldId -> selected option.value
  ensureConfigurationData(raw): ConfigurationData | null  // fail-soft parse of order_items.configuration_data (raw is a JSON string OR object — handles both)

src/actions/shipping-quote.ts — CartItemForQuote (~line 41) + quoteForCart (~line 85):
  type CartItemForQuote = { productId: string; variantId: string; quantity: number; unitPrice: number };
  Weight ladder today (per line, kg): variant.weight_g/1000  (Tier1)
                                    -> product.shippingWeightKg (Tier2)
                                    -> cfg.defaultWeightKg (Tier3 fallback, warns).
  Returns QuoteResult { ok:true; options; subtotal; weightKg } — weightKg is the total kg sent to Delyva.

src/actions/shipping.ts — sumOrderWeight (~line 422): reads order_items rows, same variant/product/default ladder.
  order_items.configurationData (text LONGTEXT) holds the cart-line ConfigurationData snapshot (NULL for stocked lines).

DB: product_config_fields { id (=fieldId), productId, fieldType, configJson(LONGTEXT) }.
  MariaDB 10.11: no LATERAL — use .select().from(...).where(inArray(...)); JSON cols are LONGTEXT, parse via ensure* helpers.

Cart wiring (callers of quoteForCart that must forward config):
  src/components/checkout/shipping-rate-picker.tsx (~line 87): maps HydratedCartItem -> CartItemForQuote.
    HydratedCartItem (src/actions/cart.ts) carries: productId, variantId, quantity, unitPrice,
    productType, configurationData?: ConfigurationData (a real OBJECT; configurationData.values is fieldId->value).
  src/components/admin/pos-builder.tsx (~line 444): maps ticket lines -> CartItemForQuote; configurable lines
    use variantId="manual".
    WARNING — POS shape differs: PosLineConfigurable.configurationData (src/actions/admin-pos.ts ~line 76)
    is typed `string` (a JSON STRING, serialised via JSON.stringify in toTicketLine, pos-builder.tsx ~line 122-123),
    NOT a ConfigurationData object. `.values` on the string returns undefined. Must parse via
    ensureConfigurationData(...) before reading .values. (Contrast: the checkout HydratedCartItem path above
    carries a real object, so its direct .values access is correct.)

Admin editor: src/components/admin/config-field-modal.tsx
  SelectOption type (~line 298): { label; value; price?; sku?; imageUrl? }
  SelectOptionsEditor (~line 553): grid header (~line 587) cols "[minmax(0,1fr)_96px_96px_auto_28px]"
    = Label / Price RM / SKU / image / delete; one Input per column inside options.map (~line 596).
  updateOption(index, patch) merges patch into the option; onChange persists via existing config-field save path + autosave.
</interfaces>
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser/POS client → quoteForCart server action | Client supplies cart lines incl. selected option values; untrusted |
| order_items snapshot → sumOrderWeight | Snapshot was written at order time; trusted as historical record |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-17-09 | Tampering | quoteForCart weight input | mitigate | Server re-fetches option weight from product_config_fields.configJson by (fieldId, value); client NEVER sends a numeric weight. configValues carries only the selected option values (strings the customer already chose on the PDP). |
| T-xbb-02 | Denial of Service | quoteForCart DB reads | accept | Already rate-limited 20/60s per IP-hash; one extra batched config-field query per quote (inArray over productIds) — bounded, no per-option fan-out. |
| T-xbb-03 | Tampering | configValues spoofing a cheaper option | accept | Customer can only pick options that exist; picking option A vs B yields A-or-B's real DB weight. No weight is invented; worst case is selecting a real lighter SKU, which is the correct behaviour. |
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add optional grams `weight` to Select option schema + admin editor input</name>
  <files>src/lib/config-fields.ts, src/components/admin/config-field-modal.tsx</files>
  <behavior>
    - SelectFieldConfigSchema parses an option with `weight: 250` successfully.
    - SelectFieldConfigSchema parses an option WITHOUT weight successfully (backward compat).
    - SelectFieldConfigSchema rejects negative or non-integer weight.
  </behavior>
  <action>
In src/lib/config-fields.ts, extend SelectFieldConfig.options (~line 49-58) to add an optional field `weight?: number` with a doc comment: "Per-option shipping weight in GRAMS (integer >= 0). Matches the existing product_variants.weight_g grams convention (AD-08). Optional + backward compatible: old options without weight fall through to the variant/product/default ladder." In SelectFieldConfigSchema (~line 129-136) add `weight: z.number().int().min(0).max(50000).optional(),` matching the same bounds as variantUpdateSchema.weightG (validators.ts ~line 740). Do NOT touch the other field schemas. Keep `weight` optional so ensureConfigJson on existing rows still parses.

In src/components/admin/config-field-modal.tsx: add `weight?: number;` to the local SelectOption type (~line 298-304). In SelectOptionsEditor: widen the grid template (header ~line 587 and each row ~line 599) to insert a new "Weight (g)" column between SKU (96px) and the image cell — e.g. change `[minmax(0,1fr)_96px_96px_auto_28px]` to `[minmax(0,1fr)_96px_96px_88px_auto_28px]` on BOTH the header and the row, and add a `<span>Weight g</span>` header cell after the SKU header (~line 590). Add a numeric Input cell after the SKU Input (~line 643) modeled on the existing price Input: `type="number" min={0} step={1}`, `value={opt.weight ?? ""}`, onChange calling `updateOption(i, { weight: e.target.value === "" ? undefined : Math.round(Number(e.target.value)) })`, `placeholder="—"`, `title="Per-option shipping weight in grams — used for the Delyva shipping quote"`, `aria-label={\`Option ${i + 1} weight (grams)\`}`. Persistence + autosave are unchanged — `updateOption` already calls `onChange` which flows through the existing config-field save path (CLAUDE.md "Admin Autosave Universal" preserved by reusing the same onChange).
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>SelectFieldConfig + schema accept optional integer grams `weight`; old options without weight still parse; admin editor renders a Weight (g) input per option that persists via onChange; tsc clean. (Schema behavior assertions are covered by Task 2's option-weight-resolution.test.ts schema sub-block — that test file is created in Task 2, so it is not referenced here.)</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Resolve selected-option weight in quoteForCart (checkout + POS) as the top tier, server-side re-read</name>
  <files>src/actions/shipping-quote.ts, src/components/checkout/shipping-rate-picker.tsx, src/components/admin/pos-builder.tsx, src/lib/__tests__/option-weight-resolution.test.ts</files>
  <behavior>
    - Given a product with a Select field whose option "a" weighs 250g and option "b" weighs 800g, a line selecting "b" produces a higher per-line kg than a line selecting "a".
    - A line with NO configValues falls through to variant.weight_g, then product.shippingWeightKg, then defaultWeightKg (existing ladder unchanged).
    - The resolver sums weights across multiple Select fields chosen on the same line (e.g. two Select fields each contributing grams).
    - The resolver ignores any client-supplied numeric weight — it only maps (fieldId -> chosen value string) to the DB option.weight.
  </behavior>
  <action>
In src/actions/shipping-quote.ts: add `configValues?: Record<string, string>` to CartItemForQuote (~line 41) with a comment: "fieldId -> selected option.value for configurable products. Server re-reads option.weight from product_config_fields.configJson — NEVER trusts a client weight (T-17-09)." Import `productConfigFields` from "@/lib/db/schema" and `ensureConfigJson` from "@/lib/config-fields".

Add a batched config-field fetch (MariaDB no-LATERAL): collect the productIds of items that have a non-empty configValues, then `db.select({ productId, configJson, fieldType, id }).from(productConfigFields).where(inArray(productConfigFields.productId, thoseIds))`. Build a map productId -> Array<{ fieldId, optionsByValue: Map<value, weightGrams> }> by calling ensureConfigJson("select", row.configJson) only for fieldType==="select" rows (wrap in try/catch, skip on parse error). Extract a small pure helper `resolveOptionWeightKg(configValues, fieldsForProduct): number | null` that, for each fieldId present in configValues, looks up the chosen value's option.weight (grams), sums them, and returns kg (sum/1000) or null when no option weight is found. EXPORT this helper (named export) so the unit test can call it without hitting Delyva.

In the per-line weight loop (~line 151-170) make selected-option weight Tier 0 (highest): `const optKg = it.configValues ? resolveOptionWeightKg(it.configValues, fieldsByProduct.get(it.productId) ?? []) : null;` — if optKg !== null use it; else fall through to the existing variant -> product -> default ladder unchanged. Keep the existing console.warn on the final default fallback. Final precedence everywhere: selected-option weight -> variant.weight_g -> product.shippingWeightKg -> cfg.defaultWeightKg.

In src/components/checkout/shipping-rate-picker.tsx (~line 87-93): when mapping items to CartItemForQuote, add `configValues: i.configurationData?.values`. HydratedCartItem carries `configurationData` as a real ConfigurationData OBJECT, so direct `.values` access is correct here — do NOT parse. Also add the chosen values into the debounce `key` (~line 58-62) so changing a selected option re-quotes: include `configValues: i.configurationData?.values` in the items map used for the key.

In src/components/admin/pos-builder.tsx (~line 444-454): when mapping ticket lines to CartItemForQuote, forward the configurable line's configuration values as `configValues`. CRITICAL — the POS shape differs from checkout: `PosLineConfigurable.configurationData` (src/actions/admin-pos.ts ~line 76) is typed `string` — a JSON STRING serialised via JSON.stringify in toTicketLine (pos-builder.tsx ~line 122-123), NOT a ConfigurationData object. Accessing `.values` directly on the string returns undefined, so the line would silently fall through to the default weight and the POS fix would never fire. Therefore: import `ensureConfigurationData` from "@/lib/config-fields" and the `PosLineConfigurable` type from "@/actions/admin-pos" (reuse the existing top-of-file imports if already present — PosLineConfigurable is already imported per pos-builder.tsx ~line 37). For `kind === "configurable"` POS lines, parse before reading values: `configValues: ensureConfigurationData((l as PosLineConfigurable).configurationData)?.values` (yields undefined on parse failure or no values — line then falls through to default, unchanged). Non-configurable POS lines pass `configValues: undefined`. Configurable POS lines keep variantId="manual" — they now resolve weight from the parsed configValues instead of always hitting the default.

Create src/lib/__tests__/option-weight-resolution.test.ts: a vitest unit test importing resolveOptionWeightKg. Build fieldsForProduct fixtures with optionsByValue maps and assert: (a) heavier option value returns a larger kg than lighter; (b) summing across two fields; (c) returns null when no configValues or no matching option weight; (d) a schema sub-block re-using SelectFieldConfigSchema asserting weight optional + integer-bound (covers Task 1 behavior). No Delyva, no DB — pure function + schema only.
  </action>
  <verify>
    <automated>npx vitest run src/lib/__tests__/option-weight-resolution.test.ts ; npx tsc --noEmit</automated>
  </verify>
  <done>resolveOptionWeightKg is exported + unit-tested; heavier option > lighter option (proven by test); quoteForCart uses option weight as top tier with server-side DB re-read (no client weight trusted); checkout forwards configValues from the object path, POS forwards configValues via ensureConfigurationData parse of its JSON-string snapshot; lines without config fall through unchanged; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 3: Resolve option weight in admin booking (sumOrderWeight) from the order_item snapshot</name>
  <files>src/actions/shipping.ts</files>
  <action>
In src/actions/shipping.ts sumOrderWeight (~line 422-478): import `productConfigFields` (schema) and `ensureConfigJson` + `ensureConfigurationData` (from "@/lib/config-fields") if not already imported. After loading order items, collect productIds of items whose `configurationData` column is non-null, batch-fetch their select-type config fields (`db.select().from(productConfigFields).where(inArray(productConfigFields.productId, ids))`, MariaDB no-LATERAL), and build the same productId -> fields map shape as Task 2 (reuse the exported `resolveOptionWeightKg` helper from "@/actions/shipping-quote" — import it). In the per-item loop (~line 459-475), parse the stored snapshot via `ensureConfigurationData(i.configurationData)` (order_items.configurationData is a JSON STRING column, so the parse is required); if it yields `.values`, compute `optKg = resolveOptionWeightKg(values, fieldsByProduct.get(i.productId) ?? [])` and, when non-null, use it as Tier 0 ahead of the existing variant/product/default ladder. Leave bookShipmentForOrder's inventory weight ladder as a follow-up note in a code comment (out of scope for this plan — sumOrderWeight is what drives the admin quote display; flag it so a future task can mirror the same resolution if per-parcel inventory accuracy is needed). Do NOT change the function signature.
  </action>
  <verify>
    <automated>npx tsc --noEmit ; npx eslint src/actions/shipping.ts</automated>
  </verify>
  <done>sumOrderWeight resolves option weight from the order_item configurationData snapshot as the top tier; non-configurable + snapshot-less items fall through unchanged; signature preserved; tsc + eslint clean.</done>
</task>

</tasks>

<verification>
- `npx vitest run src/lib/__tests__/option-weight-resolution.test.ts` passes, including the heavier-vs-lighter assertion (money-touching proof).
- `npx tsc --noEmit` clean across all modified files.
- Manual (human, optional): in admin, set option A weight=200g and option B weight=1500g on a configurable product; on the PDP/checkout choose A then B with the same address — the Delyva quote weightKg is higher for B than A.
- Grep confirms server never reads a client weight: `configValues` carries only string values; `resolveOptionWeightKg` sources grams exclusively from configJson option maps.
</verification>

<success_criteria>
- Per-option `weight` (grams, optional, integer) exists on SelectFieldConfig + schema, backward compatible.
- Admin Select-option editor has a Weight (g) input per option that persists via the existing save path + autosave.
- quoteForCart (checkout + POS) and sumOrderWeight (admin booking) use the selected option's DB-resolved weight as the highest-priority tier, summing across multiple Select fields, with the variant -> product -> default ladder intact below it.
- POS configurable lines resolve weight via ensureConfigurationData parse of the JSON-string snapshot (not a broken direct `.values` access).
- A heavier chosen option yields a higher Delyva weight than a lighter one (unit-tested).
- No client-supplied weight is ever trusted (T-17-09 preserved).
- Works generically for all present + future products; no backfill; keychain/tier-priced products noted as follow-up, not blocked.
</success_criteria>

<output>
Create `.planning/quick/260525-xbb-add-per-sku-select-option-shipping-weigh/260525-xbb-SUMMARY.md` when done.

Follow-up todos to record (do NOT implement here):
- Mirror resolveOptionWeightKg into bookShipmentForOrder inventory weight ladder if per-parcel weight accuracy at booking is required.
- Keychain/tier-priced configurable products have no Select field, so per-SKU weight does not apply; revisit if those products need real shipping weight.
</output>
