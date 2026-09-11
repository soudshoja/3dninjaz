---
id: 260911-oln
mode: quick
description: Fix configurable-line shipping weight on the two customer checkout paths
date: 2026-09-11
branch: fix/configurable-line-shipping-weight
base: origin/dev
must_haves:
  truths:
    - Configurable (custom keychain) lines reach the Delyva quote with a real productId, so Tier 2 (product.shippingWeightKg) can fire.
    - configValues reach the quote core on BOTH customer paths, so Tier 0 (per-option weight) and the per-tier keychain weight fire.
    - A bag containing the same variant twice is quoted ONCE at the coalesced quantity, not twice at full quantity.
    - The unitPrice fed to the quote matches the snapshot price on every line, so the free-shipping threshold is evaluated against the real subtotal.
    - The Tier-3 warn log names an empty variantId/productId as "(none)" instead of printing nothing.
    - admin-pos.ts, checkout-drafts.ts, admin-manual-orders.ts and the weight ladder itself are untouched.
    - No type is exported from a "use server" module.
  artifacts:
    - src/lib/shipping-quote-items.ts — shared snapshot->CartItemForQuote mapper (plain lib, NOT "use server")
    - src/lib/shipping-quote-items.test.ts — vitest unit test for the mapper
    - src/actions/paypal.ts — call site swapped to allSnapshots via the mapper
    - src/actions/whatsapp-order.ts — same swap
    - src/lib/shipping-quote-core.ts — honest Tier-3 warn log
  key_links:
    - src/lib/shipping-quote-types.ts (CartItemForQuote — the contract)
    - src/lib/shipping-quote-core.ts:160-206 (weight ladder, Tier 0..3)
    - src/actions/admin-pos.ts:976 and src/actions/checkout-drafts.ts:286 (the two ALREADY-CORRECT call sites to mirror)
---

# Quick Task 260911-oln — Configurable lines are quoted at 0.1 kg on both customer checkout paths

## Goal

Make `createPayPalOrder` and the WhatsApp/bank-transfer order path feed `autoQuoteShipping`
the same item set the order actually contains — including configurable lines, with their real
`productId` and their `configValues` — so Delyva is quoted on real weight instead of
`defaultWeightKg = 0.1`.

## Diagnosis (verified against the source, not re-investigated)

Confirmed at `src/actions/paypal.ts:500-514` and `src/actions/whatsapp-order.ts:413-427`.
Both build the quote items from `input.items`:

```ts
const autoShip = await autoQuoteShipping(
  input.items.map((i) => {
    const row = variantRows.find((v) => v.id === i.variantId);
    const snap = allSnapshots.find((s) => s.variantId === i.variantId);
    return {
      productId: row?.productId ?? "",
      variantId: i.variantId,
      quantity: qtyByVariant.get(i.variantId) ?? i.quantity,
      unitPrice: snap ? Number(snap.unitPrice) : 0,
    };
  }),
  ...
```

Four distinct defects fall out of that one mapper. All four are fixed by the same change.

| # | Defect | Mechanism |
|---|---|---|
| D1 | Configurable lines carry `productId: ""` | Configurable bag lines have no row in `variantRows` (they are filtered into `configurableInputLines` at `paypal.ts:126` / `whatsapp-order.ts:83`), so `row?.productId ?? ""` yields `""`. `computeCartQuote` batch-fetches product weights by `inArray(products.id, productIds)` — `""` matches no row, so **Tier 2 can never fire**. |
| D2 | `configValues` is never passed | The mapper omits the field entirely. `hasConfig` is false in the ladder (`shipping-quote-core.ts:167`), so **Tier 0 (per-option weight) and `resolveTierWeightKg` (keychain grams-by-slot-count) are both skipped**. |
| D3 | Configurable lines contribute `unitPrice: 0` | `allSnapshots.find(s => s.variantId === i.variantId)` looks up by the client's variantId (empty string for configurable lines) while the configurable snapshot rows carry the sentinel `variantId: "NONE"` (`paypal.ts:468`). No match → `0`. The subtotal used for the **free-shipping threshold** is therefore understated. |
| D4 | Duplicate variant lines are double-counted | The map runs over `input.items` (pre-dedupe) while the quantity comes from `qtyByVariant` (post-dedupe). Same variant on two bag lines → two quote items, each at the full coalesced quantity → weight and subtotal counted twice. |

Prod evidence: `[shipping] no weight data for variantId= productId= — using defaultWeightKg=0.1`
(`shipping-quote-core.ts:194`), 716 occurrences since June. Both interpolated values are the
empty string, which matches D1 exactly — `it.variantId ?? "(none)"` does not catch `""`.

**Cross-check — the two correct call sites** (do NOT touch them, mirror them):
- `src/actions/admin-pos.ts:976` passes `productId: l.productId`, maps the `'manual'` sentinel to `null`, and passes `configValues: parseConfigValues(l.configurationData)`.
- `src/actions/checkout-drafts.ts:286` builds `CartItemForQuote[]` explicitly with `productId`, `variantId ?? null` and a parsed `configValues`.

## Resolved risk: is `s.quantity` the right quantity? (YES — this was the main correctness question)

Traced through both files:

- `qtyByVariant` (`paypal.ts:129-138`) clamps to min 1 and **sums duplicates** per variantId.
- `variantIds = [...qtyByVariant.keys()]` → `variantRows` is **one row per unique variantId**.
- `snapshots` (`paypal.ts:234`) is `variantRows.map(v => ({ ..., quantity: qtyByVariant.get(v.id)! }))`
  → the variant branch of `allSnapshots` is **already one row per variant carrying the coalesced quantity**.
- The configurable branch (`paypal.ts:467`) is one row per input line with `qty = Math.max(1, Math.floor(Number(line.quantity) || 1))`. Configurable lines are keyed by their configuration, not by a variant, so they are correctly NOT coalesced.

**Conclusion:** `allSnapshots` is exactly the set of order lines, each with its final quantity.
Dropping `qtyByVariant` from the quote mapper is correct, and it is what removes D4.
`whatsapp-order.ts` has the byte-identical structure (`:86-97`, `:176-177`, `:378-399`).

## Verified field shapes (read from source — do not re-derive)

- `CartItemForQuote` (`src/lib/shipping-quote-types.ts:12`):
  `{ productId: string; variantId?: string | null; quantity: number; unitPrice: number; configValues?: Record<string, string> }`.
  `variantId` is already documented as optional precisely for lines with no variant.
- `type Snap` (`paypal.ts:212` / `whatsapp-order.ts:162`) — confirmed fields:
  `variantId: string`, `productId: string`, `quantity: number`, **`unitPrice: string`** (Drizzle decimal string), `lineTotal: string`.
- `type ConfigSnap = typeof snapshots[0] & { configurationData: ConfigurationData | null }`
  (`paypal.ts:465`) — so every element of `allSnapshots` has `configurationData`, `null` on variant lines.
- `ConfigurationData` (`src/lib/config-fields.ts:148`) — confirmed:
  `{ values: Record<string, string>; computedPrice: number; computedSummary: string; baseClickerColor?: string; baseClickerColorName?: string }`.
  `.values` is **required and non-optional** on the type, so `s.configurationData?.values` is the correct access; no parse step (unlike drafts, which store `configJson` as a string).
- Sentinel audit: the customer paths use **`"NONE"`** for configurable lines (`paypal.ts:468`).
  The `'manual'` sentinel exists only in `admin-pos.ts` and `admin-order-edit.ts` and **cannot reach**
  `paypal.ts` / `whatsapp-order.ts`. The mapper will still neutralise `"manual"` and `""` defensively
  so it is safe to reuse from an admin path later.

## Behaviour change — call this out in the PR

1. **Quoted shipping goes UP for configurable orders.** That is the intent: custom keychains
   were being shipped at a 0.1 kg quote regardless of real weight, so shipping was systematically
   under-charged on the store's flagship product.
2. **The charged price now converges with the price the customer already saw.**
   `src/components/checkout/shipping-rate-picker.tsx:91-99` already passes `productId` and
   `configValues` to `quoteForCart`, so the on-screen rate was *correct*; the server then
   re-quoted at order-create time with the broken mapper and charged less. After this fix the
   two agree. Customers who never touched the courier picker see a straight increase.
3. **Free shipping may now trigger where it did not** (D3): configurable lines start contributing
   their real unitPrice to the quote subtotal.
4. `src/actions/admin-manual-orders.ts:75` deliberately passes `productId: ""` for its one
   synthetic line. After Task 5 that path will start logging `productId=(none)` in the Tier-3
   warn. **This is expected, not a regression** — that line has no catalog weight by design.

## Scope

**In scope:** `src/lib/shipping-quote-items.ts` (new), its test, the two call sites, the log line.

**Out of scope — do not touch:** `src/actions/admin-pos.ts`, `src/actions/checkout-drafts.ts`,
`src/actions/admin-manual-orders.ts`, the weight ladder logic in `shipping-quote-core.ts`
(only the `console.warn` arguments change), the client-side rate picker. No DB migration.
No schema change.

## Constraints

- `src/actions/paypal.ts` and `src/actions/whatsapp-order.ts` are `"use server"`. **They must not
  export types** — Next compiles every export of a `"use server"` module into an RPC endpoint and a
  type export becomes a runtime `ReferenceError` → 500. The shared mapper and its types therefore
  live in a plain lib module (see the header comment on `src/lib/shipping-quote-types.ts`).
- Both files would otherwise carry an identical mapper → extract once, import twice. No duplication.
- `npx tsc --noEmit` must be clean.
- Ship to `dev` via PR. Branch protection blocks direct pushes. **Never master.**
- Branch fresh from `origin/dev` (the local `dev` is chronically stale).
- Do not deploy manually — `.github/workflows/deploy.yml` deploys on push to `dev`.

---

# Tasks

## Task 1 — Create the shared snapshot → quote-item mapper

**Files:** `src/lib/shipping-quote-items.ts` (new)

Create a plain module — no `"use server"` directive, no DB access, no async. It may sit next to
`shipping-quote-types.ts` and export types freely.

Export a structural input type (call it `SnapshotLineForQuote`) that the `ConfigSnap` rows of both
call sites satisfy without casting, and a pure function `snapshotsToQuoteItems(snaps): CartItemForQuote[]`.

Mapping rules, one per defect:

- `productId` — pass through as `String(s.productId ?? "")`. Do not invent a fallback; an empty
  productId is now *visible* via Task 5's log instead of silently wrong.
- `variantId` — return `null` when the value is one of the no-variant sentinels `"NONE"`, `"manual"`,
  or the empty string; otherwise the string. Keep the sentinel list in one named constant with a
  comment pointing at `paypal.ts:468` (`"NONE"`) and `admin-pos.ts:594` (`"manual"`).
- `quantity` — `Number(s.quantity)`, floored, clamped to a minimum of 1.
- `unitPrice` — `Number(s.unitPrice)`, falling back to `0` when not finite. Accept `string | number`
  in the input type because `Snap.unitPrice` is a Drizzle decimal **string**.
- `configValues` — `s.configurationData?.values` when it is a non-empty object, otherwise `undefined`.
  Never pass an empty object: `computeCartQuote` gates Tier 0 on
  `Object.keys(i.configValues).length > 0` and an empty object would only add noise to the
  `configProductIds` batch fetch.

Import `CartItemForQuote` as a `import type` from `@/lib/shipping-quote-types` and use it as the
return type so the contract stays enforced at compile time.

Head the file with a comment explaining why it exists (both customer checkout paths previously
quoted configurable lines at `defaultWeightKg`; `ConfigurationData.values` is a live object here,
unlike the draft path where it is a JSON string) and why it is not a `"use server"` file.

**Accept when:**
- `src/lib/shipping-quote-items.ts` exists, has no `"use server"` directive and no `server-only` import.
- It exports exactly one function and its input type; the return type is `CartItemForQuote[]`.
- The function is pure and synchronous — no `await`, no `db` import.

---

## Task 2 — Unit-test the mapper

**Files:** `src/lib/shipping-quote-items.test.ts` (new)

Vitest is already a devDependency with `vitest.config.mts` at the repo root; sibling examples are
`src/lib/config-fields.test.ts` and `src/lib/keychain-parts.test.ts`. There is no `test` script in
`package.json` — run with `npx vitest run`.

Cover, at minimum:
1. A variant line (`variantId: "v1"`, `configurationData: null`, `unitPrice: "19.90"`) maps to
   `{ productId: "p1", variantId: "v1", quantity: 2, unitPrice: 19.9, configValues: undefined }`.
2. A configurable line (`variantId: "NONE"`, real `productId`, `configurationData.values` populated)
   maps to `variantId: null` with `configValues` passed through **by value** — this is the D1+D2 regression guard.
3. `variantId: "manual"` and `variantId: ""` both map to `null`.
4. `configurationData.values = {}` maps to `configValues: undefined`.
5. `unitPrice` given as a decimal **string** becomes a finite number.
6. Quantity `0` / `NaN` clamps to `1`.

**Accept when:** `npx vitest run src/lib/shipping-quote-items.test.ts` passes, all six cases green.

---

## Task 3 — Swap the PayPal checkout call site to `allSnapshots`

**Files:** `src/actions/paypal.ts`

Replace the `input.items.map(...)` argument at `:501-514` with
`snapshotsToQuoteItems(allSnapshots)`. Import the mapper as a value import at the top of the file
(alongside `autoQuoteShipping` on `:17`) — a value import from a plain lib is fine inside a
`"use server"` module; only *exports* are restricted.

Keep the existing `destination` object and `input.shippingServiceCode ?? null` third argument
exactly as they are. Keep the `if (!autoShip.ok)` error branch unchanged.

Replace the stale comment above the call (the `row`/`snap` lookup rationale) with a short note:
quote items come from `allSnapshots` because it is the only structure that carries both stocked and
configurable lines with a real `productId`, the coalesced quantity and the server-derived price.

Do not touch `snapshots`, `allSnapshots`, `qtyByVariant` or `variantRows` themselves — they are all
still used downstream (`:588`, `:703`) and by the snapshot build.

**Accept when:**
- `grep -n "variantRows.find" src/actions/paypal.ts` returns nothing.
- The `autoQuoteShipping` call's first argument is `snapshotsToQuoteItems(allSnapshots)`.
- `qtyByVariant` is still referenced at the `snapshots` build site (`:235`) — no unused-variable fallout.
- `npx tsc --noEmit` clean for this file.

---

## Task 4 — Swap the WhatsApp / bank-transfer call site

**Files:** `src/actions/whatsapp-order.ts`

Identical change at `:413-427`. Same import, same replacement, same comment rewrite. Third argument
here is whatever the current call passes — leave it untouched.

**Accept when:**
- `grep -n "variantRows.find" src/actions/whatsapp-order.ts` returns nothing.
- The two call sites are now textually identical apart from the destination object and the
  preferred-service argument.
- `npx tsc --noEmit` clean.

---

## Task 5 — Make the Tier-3 warn log honest about empty strings

**Files:** `src/lib/shipping-quote-core.ts` (the `console.warn` at `:194-199` only)

`it.variantId ?? "(none)"` only catches `null`/`undefined`, so an empty-string variantId printed as
nothing — which is why this bug read as `variantId= productId=` in prod and stayed invisible for
three months. Coerce both interpolated values so any falsy/blank value renders `(none)`, and include
the item's `quantity` so a future occurrence shows how much weight the fallback is standing in for.

Fix the stray leading indentation on the `console.warn(` line while you are in there.

Do not change the ladder itself — `w = fallbackWeight` and every tier above it stay exactly as-is.

**Accept when:**
- An item with `variantId: ""` and `productId: ""` logs `variantId=(none) productId=(none)`.
- `git diff src/lib/shipping-quote-core.ts` touches only the `console.warn` statement.

---

## Task 6 — Gates

**Files:** none (verification only)

Run in order:
1. `npx tsc --noEmit` — must be clean.
2. `npx vitest run` — full suite, not just the new file; no new failures.
3. `npm run build` — must succeed (catches the `"use server"` export trap, which `tsc` does not).

**Accept when:** all three exit 0.

---

## Task 7 — PR to dev

**Files:** none (git only)

Branch fresh from `origin/dev` (`git fetch origin && git switch -c fix/configurable-line-shipping-weight origin/dev`) —
the local `dev` is routinely 50+ commits behind. Delegate the commit/push to the git subagent.

PR body must state, explicitly:
- Configurable orders were quoted to Delyva at `defaultWeightKg = 0.1` on both customer paths — 716 log hits since June.
- **Shipping prices rise for configurable orders. That is the fix, not a side effect.**
- The charged price now matches the rate the customer already saw in the picker.
- Free shipping may now trigger on configurable orders that previously missed the threshold.
- Admin paths were already correct and are untouched.

Target `dev`. Never `master`. Do not deploy manually — pushing to `dev` triggers the deploy workflow.
If the Deploy job red-Xes on a 503, `curl` the dev host directly before treating it as a real failure
(known cold-boot race).

**Accept when:** PR is open against `dev` with the "Install + typecheck" check green.

---

## Task 8 — Verify on dev (human checkpoint)

**Files:** none

After the dev deploy lands:

1. On `https://app.3dninjaz.com/`, add a **configurable keychain** to the bag (pick options that
   carry a per-option weight, and enough keycap slots to hit a real weight tier).
2. Go to checkout, enter a Malaysian address, and note the shipping rate the picker shows.
3. Complete the order via the PayPal sandbox buyer
   (`sb-shnvz50688339@personal.example.com` / `_s!Cw2Wp`).
4. **Repeat once via the WhatsApp / bank-transfer button** — that is a separate code path (Task 4).

Then, over SSH on the box, tail the dev app log and confirm:

- **No** `[shipping] no weight data for variantId=... productId=...` line is emitted for either order.
- The shipping charged on the created order **matches the rate shown in the picker** (previously it
  was lower).
- The quoted weight is plausible for the configuration — i.e. clearly above `0.1 kg`. Cross-check
  against the product's per-option weights in `product_config_fields.configJson` and its
  `weight_tiers`.

Regression check: place one **stocked, non-configurable** order and confirm its shipping rate is
unchanged from before the fix.

**Accept when:** both configurable orders quote on real weight with no Tier-3 warn, and the stocked
order's rate is unchanged.

---

## Deferred / not doing

- Prod migration of this fix — separate `dev` → `master` release, after dev verification.
- Rewiring `admin-manual-orders.ts` to carry a real productId. Its synthetic line is intentional.
- Multi-parcel splitting at the 30 kg cap. Unrelated; the cap guard is already in the quote core.
- Backfilling shipping on the ~716 historically under-charged orders. Business decision, not a code fix.
