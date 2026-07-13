---
quick_id: 260713-fay
phase: quick-260713-fay
plan: "01"
subsystem: admin-production
tags: [keychain, production-floor, base-batches, shape]
dependency-graph:
  requires: [products.keychainShape (Phase 260705-azw)]
  provides: [KeychainUnit.shape, KeychainBaseBatch.shape, shape-split base batching]
  affects: [src/actions/admin-production.ts, src/components/admin/keychain-batches.tsx]
tech-stack:
  added: []
  patterns:
    - "Composite grouping key (`${shape}|||${base}`) to split a Map-based batch aggregation by an extra dimension"
    - "MariaDB-safe manual hydration: collect distinct product ids, guard empty-array, one inArray SELECT, in-memory Map join"
key-files:
  created: []
  modified:
    - src/actions/admin-production.ts
    - src/components/admin/keychain-batches.tsx
decisions:
  - "Shape resolved at batch-read time from products.keychainShape (not stored/threaded through order capture), so existing in-flight orders backfill automatically with zero data migration."
  - "Manual sentinel lines (productId='manual') and missing/deleted product rows both default to 'square' — matches the DB column default, guarantees no crash, and keeps the shape query's productIds list free of the sentinel."
  - "Clicker+Letter grouping (step 5) deliberately left unchanged — same collision bug is suspected there but is explicitly out of scope per plan notes; flagged as a follow-up decision for the shop to confirm."
metrics:
  duration: "~20 min"
  completed: "2026-07-13"
---

# Quick Task 260713-fay: Split keychain base production batches by shape Summary

Differentiated keychain BASE production batches by round vs square shape on `/admin/production` → Keychain batches → Bases, so a round-body and square-body keychain of the same base colour no longer collapse into one unprintable-together batch.

## What Changed

**`src/actions/admin-production.ts`** — `getKeychainBatches`:
- Import line now pulls `products` from schema and `type KeychainParts` from `@/lib/keychain-parts` (in addition to the existing `parseKeychainParts` function import).
- `KeychainUnit` gained a required `shape: "square" | "round"` field; `KeychainBaseBatch` gained a required `shape: "square" | "round"` field.
- Step 3 (parse keychain parts) was split into a first pass that collects `{ it, parts }` matches without constructing units yet.
- New step 3a: builds distinct `productIds` from matched lines (excluding the `"manual"` sentinel), guards on `productIds.length > 0` before issuing `db.select({ id: products.id, keychainShape: products.keychainShape }).from(products).where(inArray(products.id, productIds))`, and populates a `shapeByProductId` Map. Zero extra query cost when there are no keychain-matched lines or all lines are manual.
- Units are now built from `matched` in one `.map()`, resolving `shape` as `it.productId === "manual" ? "square" : (shapeByProductId.get(it.productId) ?? "square")` — covers manual lines and deleted/missing product rows with the same safe default as the DB column.
- Step 4 (base grouping) key changed from `u.base` to the composite `` `${u.shape}|||${u.base}` ``; on map-to-array the key is split back via `key.split("|||") as ["square" | "round", string]` and both `base` and `shape` are emitted on each `KeychainBaseBatch`. Sort (`b.totalQty - a.totalQty`) unchanged.
- Steps 5 (clicker+letter grouping) and 6 (assembly) are byte-for-byte unchanged — confirmed by diff review, no lines touched in those blocks.

**`src/components/admin/keychain-batches.tsx`**:
- `lucide-react` import block extended with `Circle` and `Square`.
- `BatchCard` gained an optional `badge?: React.ReactNode` prop, rendered as `{badge ? <span className="shrink-0">{badge}</span> : null}` in the title row, positioned between the `CheckCheck` (all-done indicator) and the `ChevronDown` chevron.
- New `ShapeBadge({ shape })` helper: renders a pill (`rounded-full`, `px-2 py-0.5`, `text-[11px]`, `font-bold`) with `Circle`/`Square` icon (`h-3 w-3`) + "Round"/"Square" label, styled `background: rgba(11,16,32,0.06)`, `color: INK`.
- Bases `.map()` call: React key changed from `key={b.base}` to `` key={`${b.shape}|||${b.base}`} `` and `badge={<ShapeBadge shape={b.shape} />}` wired in. The Clicker+Letter `BatchCard` call (unchanged, no `badge` prop passed) stays visually identical — `badge` is `undefined` there, so the conditional render renders nothing.

## Code-Logic Walkthrough (grouping-key proof)

Grouping key lines (`src/actions/admin-production.ts`):
```
480:  const baseMap = new Map<string, KeychainUnit[]>();
481:  for (const u of units) {
482:    const key = `${u.shape}|||${u.base}`;
483:    const list = baseMap.get(key) ?? [];
484:    list.push(u);
485:    baseMap.set(key, list);
486:  }
```

**Case A — same colour, DIFFERENT shape → two batches.**
Take two keychain order lines both with `base = "Magenta"`, one from a product with `keychainShape='round'` and one from a product with `keychainShape='square'`. After step 3a resolves `shapeByProductId`, the two `KeychainUnit`s carry `shape: "round"` and `shape: "square"` respectively. Their composite keys are `"round|||Magenta"` and `"square|||Magenta"` — two distinct `Map` keys — so `baseMap` produces two entries, and the final `bases` array has two `KeychainBaseBatch` objects: `{ base: "Magenta", shape: "round", ... }` and `{ base: "Magenta", shape: "square", ... }`, each with its own `items`/`doneCount`/`totalQty`. Confirmed as intended by the plan's must-have truth.

**Case B — same colour, SAME shape → still one batch (regression check).**
Two lines both `base = "Magenta"` and both `shape = "square"` (e.g. two different square-shape products, or the same product ordered twice) produce the identical key `"square|||Magenta"` both times. The `baseMap.get(key) ?? []` / `list.push(u)` / `baseMap.set(key, list)` sequence accumulates both units into the SAME array under that one key — one `KeychainBaseBatch` entry with `totalQty` summing both lines' quantities. Pre-existing merge behaviour preserved exactly.

**Manual / missing-product default (no crash, no wasted query):**
```
448-450: productIds = [...new Set(matched.map(m => m.it.productId).filter(id => id !== "manual"))]
452:     if (productIds.length > 0) { ...query... }
474:     shape: it.productId === "manual" ? "square" : (shapeByProductId.get(it.productId) ?? "square")
```
A `productId === "manual"` line never enters `productIds` (filtered out) and its `shape` short-circuits to `"square"` without a Map lookup. A line whose product row was deleted (present in `productIds` but absent from `shapeRows`) falls through to `shapeByProductId.get(it.productId) ?? "square"` — same safe default, matches the column's own `.default("square")`. If every matched line happens to be manual (or `matched` is empty because no keychain lines exist), `productIds.length === 0` and the extra SELECT is skipped entirely (`IN ()` never issued).

## UI verification (by inspection)

- Bases React key `` `${b.shape}|||${b.base}` `` mirrors the server-side composite key exactly, so a colour that splits into round+square renders as two cards with distinct `key` props — no React duplicate-key warning.
- `ShapeBadge` is passed only on the Bases `BatchCard` call; the Clicker+Letter `BatchCard` call has no `badge` prop, so `badge` is `undefined` there and the `{badge ? ... : null}` guard renders nothing — that card's markup is unchanged from before this task.
- Assembly view (`AssemblyRow`, step 6 in the action) was not touched in either file.

## Deviations from Plan

None — plan executed exactly as written, including the checker's pre-flight advisory (imported `type KeychainParts` alongside `parseKeychainParts` in the existing import line rather than leaving a bare, unimported type reference).

## Verification

- `npx tsc --noEmit` — CLEAN after both Task 1 and Task 2 (run twice, once per task, both clean).
- No file deletions in either commit (`git diff --diff-filter=D --name-only HEAD~1 HEAD` empty for both).
- Scope check: `git diff` for both commits touches only the two files listed in the plan's `files_modified` frontmatter — no schema, PDP, POS, or add-to-bag files touched.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `198e298` | feat(quick-260713-fay): split keychain base batches by shape |
| 2 | `e126d15` | feat(quick-260713-fay): show round/square marker on base batch cards |

## Known Stubs

None.

## Threat Flags

None — the only new surface (`products.keychainShape` SELECT) was already registered and dispositioned `accept` in the plan's threat model (T-fay-01), and no new client-writable input was introduced (T-fay-02). No additional surface found beyond what the plan anticipated.

## Self-Check: PASSED

- `src/actions/admin-production.ts` — FOUND, contains `shapeByProductId` and `${u.shape}|||${u.base}`.
- `src/components/admin/keychain-batches.tsx` — FOUND, contains `ShapeBadge` and `${b.shape}|||${b.base}`.
- Commit `198e298` — FOUND in `git log`.
- Commit `e126d15` — FOUND in `git log`.
