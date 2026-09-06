---
phase: quick-260713-fay
plan: 2
subsystem: admin-production
tags: [keychain, production, admin, shape-split]
requires: []
provides: [keychain-shape-separated-clicker-letter-batches, keychain-shape-separated-assembly-sort, keychain-production-board-per-shape-sections]
affects: [src/actions/admin-production.ts, src/components/admin/keychain-batches.tsx]
tech-stack:
  added: []
  patterns:
    - "Composite grouping key folds shape into the map key (`${u.shape}|||${u.clicker}|||${u.letter}`), mirroring the existing base-batch pattern from PR #188"
    - "Client-side extract-and-wrap: inner reusable component (BatchBoard) driven entirely by props, outer thin wrapper (KeychainBatchesView) decides layout based on data shape"
key-files:
  created: []
  modified:
    - src/actions/admin-production.ts
    - src/components/admin/keychain-batches.tsx
decisions:
  - "Reused existing shapeByProductId map on every KeychainUnit — zero new DB queries, per plan constraint"
  - "Single-shape (or empty) render path returns a bare BatchBoard with no ShapeSection wrapper — guarantees byte-identical DOM to the pre-change live board"
metrics:
  duration: "~20 min"
  completed: 2026-07-13
---

# Quick Task 260713-fay Plan 2: Keychain Production Shape-Separation Completion Summary

Extended PR #188's base-shape split to the Clicker+Letter grouping and Assembly ordering (server), and introduced a top-level Round/Square section split on the production board (client) that only activates once both shapes are actually in production.

## What Was Built

**Task 1 — `src/actions/admin-production.ts`:**
- `KeychainClickerLetterBatch` now carries `shape: "square" | "round"` (added last, mirroring `KeychainBaseBatch`).
- Step 5 clicker+letter grouping key changed from `${u.clicker}|||${u.letter}` to `${u.shape}|||${u.clicker}|||${u.letter}`, decomposed into 3 parts, and `shape` is included in the returned batch object.
- Step 6 assembly sort now sorts shape-first, then `clientName`, then `name` — same-shape units stay contiguous; for a single-shape store the shape comparison is always `0` so ordering falls through unchanged.
- No new DB query added — `units[].shape` (already populated via the existing `shapeByProductId` map from PR #188) is the only new data used.

**Task 2 — `src/components/admin/keychain-batches.tsx`:**
- Extracted the entire existing board (state, handlers, sticky header, segmented switch, 3 views) into a new inner `BatchBoard({ bases, clickerLetters, assembly, showShapeBadge = true })` component. Internal state variable names, handlers, and JSX are unchanged.
- Base-card `ShapeBadge` is now gated on `showShapeBadge` (defaults `true`, so single-shape rendering shows the badge exactly as before; the two-section path passes `false` since the section header already states the shape).
- Clicker-view card `key` updated to `${b.shape}|||${b.clicker}|||${b.letter}` for uniqueness (mirrors the base-view key already using `${b.shape}|||${b.base}`).
- Added `ShapeSection({ shape, children })` — a lightweight labelled wrapper (`Circle`/`Square` icon + "Round keychains" / "Square keychains" heading) using existing colour/style constants.
- `KeychainBatchesView` is now a thin wrapper: computes `hasRound` / `hasSquare` from `data.assembly`, and only splits into two `ShapeSection`-wrapped `BatchBoard`s (Round first, then Square, each fed a shape-filtered slice) when BOTH are true. Otherwise it renders one `BatchBoard` directly with the full unfiltered `data`, with no wrapper div and no shape header — the regression guard.

## Verification

**`npx tsc --noEmit`: CLEAN** (no output, exit 0) — run after Task 1 and again after Task 2.

**Commits:**
| Task | Commit | Message |
|------|--------|---------|
| 1 | `711460d` | `feat(260713-fay-2): extend shape-awareness to clicker+letter grouping and assembly sort` |
| 2 | `995c6bc` | `feat(260713-fay-2): split keychain production board into per-shape sections` |

### Code-logic proofs

**(a) Round + square clickers with identical colours form TWO distinct Clicker+Letter batches**

`src/actions/admin-production.ts:504`:
```ts
const key = `${u.shape}|||${u.clicker}|||${u.letter}`;
```
Trace: two units, one with `shape="round"`, one with `shape="square"`, both `clicker="Matte Black"` and `letter="White"`. Keys resolve to `"round|||Matte Black|||White"` and `"square|||Matte Black|||White"` — different strings, so `clMap` (a `Map<string, KeychainUnit[]>`) holds two separate entries, and `Array.from(clMap.entries()).map(...)` (line ~510) produces two distinct `KeychainClickerLetterBatch` objects, each carrying its own `shape` field (line ~518 `return { clicker, letter, totalQty, items, doneCount, allDone, shape }`). Before this change the key was `${u.clicker}|||${u.letter}` — both units would have collapsed into one entry.

**(b) With only square keychains present, the board renders with NO top-level Round/Square headers (byte-identical)**

`src/components/admin/keychain-batches.tsx:664-671`:
```ts
const hasRound = data.assembly.some((u) => u.shape === "round");
const hasSquare = data.assembly.some((u) => u.shape === "square");

if (!(hasRound && hasSquare)) {
  return (
    <BatchBoard bases={data.bases} clickerLetters={data.clickerLetters} assembly={data.assembly} />
  );
}
```
With only square units in `data.assembly`, `hasRound === false`, so `!(hasRound && hasSquare) === true`, and the function returns immediately with a single `<BatchBoard>` fed the full unfiltered `data` — no `<div>` wrapper, no `<ShapeSection>`, no "Round keychains"/"Square keychains" heading anywhere in the returned tree. `BatchBoard` itself is the extracted body of the OLD `KeychainBatchesView` with unchanged state/handlers/JSX, and `showShapeBadge` defaults to `true` so the base-card `ShapeBadge` still renders exactly as it did before this plan (PR #188 behaviour). This is the same code path a current all-square store hits today — DOM is unchanged.

**(c) With both shapes present, the board shows two independent Round/Square sets, each with its own Bases/Clicker+Letter/Assembly**

`src/components/admin/keychain-batches.tsx:673-685`:
```ts
const pick = (shape: "round" | "square") => ({
  bases: data.bases.filter((b) => b.shape === shape),
  clickerLetters: data.clickerLetters.filter((c) => c.shape === shape),
  assembly: data.assembly.filter((u) => u.shape === shape),
});

return (
  <div>
    <ShapeSection shape="round">
      <BatchBoard {...pick("round")} showShapeBadge={false} />
    </ShapeSection>
    <ShapeSection shape="square">
      <BatchBoard {...pick("square")} showShapeBadge={false} />
    </ShapeSection>
  </div>
);
```
When `hasRound && hasSquare` is true, `pick("round")` and `pick("square")` each produce a fully shape-filtered `{ bases, clickerLetters, assembly }` slice. Each is fed into its own `<BatchBoard>` instance, which internally calls its own `useState(initialBases)` / `useState(initialClickerLetters)` / `useState(initialAssembly)` (`src/components/admin/keychain-batches.tsx` inside `BatchBoard`) — so each section owns independent state, its own segmented switch (Bases / Clicker + Letter / Assembly), its own sticky console header, and its own done-counts. `ShapeSection shape="round"` renders before `ShapeSection shape="square"` in JSX source order, satisfying "Round first."

## Deviations from Plan

None — plan executed exactly as written. Both interface snippets (types, grouping key, sort comparator, `BatchBoard` signature, `ShapeSection`, thin wrapper) were implemented verbatim from the plan's `<action>` blocks.

## Scope Confirmation

- Only `src/actions/admin-production.ts` and `src/components/admin/keychain-batches.tsx` were touched (both explicitly in-scope per the plan's `files_modified`).
- No new DB query: `getKeychainBatches` still has exactly one `products` select (step 3a, unchanged).
- `getProductionBoard`, `markKeychainPartPrinted`, `setKeychainAssembled`, `setOrderInProduction`, `src/lib/keychain-parts.ts`, schema, POS, storefront, add-to-bag, and PDP were not modified.
- `KeychainBatchesView` export signature unchanged: `export function KeychainBatchesView({ data }: { data: KeychainBatchesData })` — `src/app/(admin)/admin/production/page.tsx`'s import contract is intact.
- Each task committed atomically, staged by explicit path (`git add src/actions/admin-production.ts` then `git add src/components/admin/keychain-batches.tsx`) — no `.agents/`, `.planning/phases/24-singleton-dissolution-sweep/`, or `skills-lock.json` staged.
- No push, no PR opened, no ROADMAP.md update — left for the orchestrator.

## Self-Check: PASSED

- `src/actions/admin-production.ts` — FOUND, modified, `${u.shape}|||${u.clicker}|||${u.letter}` present at line 504.
- `src/components/admin/keychain-batches.tsx` — FOUND, modified, `hasRound && hasSquare` present at line 668.
- Commit `711460d` — FOUND in `git log --oneline`.
- Commit `995c6bc` — FOUND in `git log --oneline`.
- `npx tsc --noEmit` — CLEAN (no errors).
