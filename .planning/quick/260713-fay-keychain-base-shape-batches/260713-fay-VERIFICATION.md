---
quick_id: 260713-fay
phase: quick-260713-fay
verified: 2026-07-13T00:00:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "On dev (app.3dninjaz.com) /admin/production → Keychain batches → Bases, flag two orders: one round-shape product and one square-shape product, both in the SAME base colour."
    expected: "Two separate base batch cards appear for that colour — one tagged 'Round' (Circle icon), one tagged 'Square' (Square icon). No React duplicate-key warning in console."
    why_human: "End-to-end UI render with real DB data on the running app; cannot be exercised without a live server + seeded round/square products."
  - test: "Visually inspect the Round/Square badge on a base card at a glance (desktop + mobile widths)."
    expected: "The marker is unmistakable — a shop worker can instantly tell which base STL to print without reading fine print. Badge sits beside the colour name, does not clash with the blue accent rail or wrap awkwardly."
    why_human: "Visual clarity/legibility is a UX judgment; the badge exists and is wired, but 'clear enough for the print floor' needs a human eye."
  - test: "Confirm the Clicker + Letter tab and Assembly tab look and group exactly as before (no shape badge, same cards)."
    expected: "Clicker+Letter cards show no Round/Square badge; grouping and counts unchanged from prior behaviour."
    why_human: "Confirms the deliberately-out-of-scope areas are visually untouched on the running app."
---

# Quick Task 260713-fay: Split Keychain Base Batches by Shape — Verification Report

**Task Goal:** Differentiate keychain BASE production batches by base SHAPE (round vs square) on `/admin/production`, so round-base and square-base keychains of the same base colour no longer merge into one un-printable batch. Base batches only; no schema/data/storefront/add-path change.

**Verified:** 2026-07-13
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | Round-shape and square-shape keychain of the SAME base colour appear as TWO separate base batch cards | ✓ VERIFIED | Composite grouping key `` `${u.shape}|||${u.base}` `` (admin-production.ts:482) yields two distinct Map keys for same colour + differing shape → two `KeychainBaseBatch` entries. UI renders one `BatchCard` per entry with distinct React key `` `${b.shape}|||${b.base}` `` (keychain-batches.tsx:549). Final runtime render → human item 1. |
| 2 | Same base colour AND same shape still merge into ONE base batch | ✓ VERIFIED | Identical `shape` + `base` → identical composite key → `baseMap.get(key) ?? []` accumulates both units under one key (admin-production.ts:481-486). For an all-square store the partition is byte-identical to the pre-change colour-only grouping (only additive `shape:"square"` field + unchanged sort). |
| 3 | Each base card shows a clear round-vs-square marker | ✓ VERIFIED | `ShapeBadge` helper (keychain-batches.tsx:105-116) renders `Circle`/`Square` lucide icon + "Round"/"Square" label pill; wired via `badge={<ShapeBadge shape={b.shape} />}` on base card only (line 558). Visual clarity → human item 2. |
| 4 | Clicker+Letter grouping and Assembly view are byte-for-byte unchanged | ✓ VERIFIED | `git diff HEAD~2 HEAD` for admin-production.ts contains NO lines from step 5 (clicker+letter, lines 496-518) or step 6 (assembly, 520-527). Clicker `BatchCard` call (keychain-batches.tsx:571-582) passes NO `badge` prop → `badge` undefined → `{badge ? … : null}` renders nothing. |
| 5 | Manual (`productId='manual'`) and product-row-missing lines default to 'square' and never crash | ✓ VERIFIED | admin-production.ts:474 `shape: it.productId === "manual" ? "square" : (shapeByProductId.get(it.productId) ?? "square")`. Manual short-circuits; deleted/missing row → `Map.get` undefined → `?? "square"`. Manual id also filtered out of `productIds` (line 449) so it's never queried. |
| 6 | Non-keychain lines are skipped exactly as before | ✓ VERIFIED | admin-production.ts:439-443 `if (!parts) continue;` — same skip predicate as pre-change; only difference is matched lines push to `matched` instead of directly to `units`. |

**Score:** 6/6 truths verified (static verification). Runtime/visual confirmation routed to human verification.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/actions/admin-production.ts` | Per-product `keychainShape` read + composite base key + `shape` on KeychainUnit/KeychainBaseBatch | ✓ VERIFIED | Contains `keychainShape` (line 454), `shape` fields on both types (367, 378), one guarded `inArray` query (452-458). tsc clean. |
| `src/components/admin/keychain-batches.tsx` | Round/Square marker on each base card + shape-aware React key | ✓ VERIFIED | `ShapeBadge` (105-116), `Circle`/`Square` imports (13-14), badge prop on `BatchCard` (139, 173), shape-composite key on base map (549). tsc clean. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `getKeychainBatches` | `products.keychainShape` | `db.select({id, keychainShape}).from(products).where(inArray(products.id, productIds))` → `shapeByProductId` Map | ✓ WIRED | admin-production.ts:452-457. Guarded on `productIds.length > 0`. No LATERAL, no `db.query…with:`. |
| `KeychainUnit.shape` | base grouping key | `` `${u.shape}|||${u.base}` `` composite key (step 4) | ✓ WIRED | admin-production.ts:482; split back at 489. |
| `KeychainBaseBatch.shape` | `BatchCard` shape badge (UI) | `badge` prop rendered on base cards only | ✓ WIRED | keychain-batches.tsx:558; not passed on clicker card (571-582). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| base `BatchCard` badge | `b.shape` | `getKeychainBatches` → `products.keychainShape` DB column (mysqlEnum, schema.ts:204) | Yes — real per-product enum read via `inArray` SELECT | ✓ FLOWING |

Shape is resolved at batch-read time from the live `products` table (not hardcoded, not threaded through capture). Existing in-flight orders backfill automatically with zero data migration.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Whole codebase typechecks after change | `npx tsc --noEmit` | exit 0, no output | ✓ PASS |
| Change scope limited to 2 src files | `git diff --name-only HEAD~2 HEAD` | only the 2 files in `files_modified` | ✓ PASS |
| Step 5/6 untouched | `git diff HEAD~2 HEAD -- src/actions/admin-production.ts` | no clicker/assembly lines in diff | ✓ PASS |
| Runtime batch split on live floor | (requires running server + seeded round/square products) | — | ? SKIP → human item 1 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| 260713-fay | 260713-fay-PLAN | Split keychain base batches by shape on admin production floor | ✓ SATISFIED | Composite key + shape badge + guarded shape query; tsc clean; scope limited to 2 files. Final visual confirmation pending (human). |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| admin-production.ts | 489 | `key.split("|||")` assumes base colour contains no `\|\|\|` | ℹ️ Info | Plan explicitly asserts base colour strings never contain `\|\|\|`; a colour with that substring would lose trailing segments. Practically impossible for a colour name; not a blocker. |

No blocker or warning anti-patterns. No TODO/FIXME/placeholder, no empty returns, no stubbed handlers introduced. Known stubs: none (per SUMMARY, confirmed).

### Human Verification Required

1. **Round/square split renders on the floor** — On dev `/admin/production` → Keychain batches → Bases, flag a round-shape and a square-shape product in the SAME base colour. Expect two separate cards (one "Round" Circle, one "Square" Square), no console duplicate-key warning. *Why human:* end-to-end render needs a live server + seeded data.
2. **Badge clarity at a glance** — Inspect the Round/Square badge on desktop + mobile. Expect it to be unmistakable for print-floor staff, sitting beside the colour name without clashing with the accent rail. *Why human:* visual/legibility judgment.
3. **Clicker+Letter / Assembly unchanged** — Confirm those tabs show no shape badge and group as before. *Why human:* visual confirmation of out-of-scope areas on the running app.

### Gaps Summary

No gaps. All six must-have truths are verified statically against the actual codebase with high confidence: the composite grouping key splits round vs square while preserving same-colour/same-shape merging (byte-identical partition for an all-square store), the shape query is a single MariaDB-safe `inArray` SELECT guarded against an empty `IN ()`, the 'square' default covers both the `manual` sentinel and missing/deleted product rows, `shape` is a required field populated at the one construction site (assembly/clicker spreads inherit it), and `git diff` confirms clicker+letter/assembly logic and the clicker UI card are untouched with only the two planned files changed. `npx tsc --noEmit` was run here and is clean (exit 0).

Status is **human_needed** rather than **passed** solely because the final confirmation is inherently visual/runtime: this is a production-floor UI where staff act on the marker to print physical STL parts, so a dev-first smoke test (round + square same-colour order → two clearly-marked cards) is warranted before merge to prod. No code changes are required to reach passing — the human items are confirmation, not gap closure.

---

_Verified: 2026-07-13_
_Verifier: Claude (gsd-verifier)_
