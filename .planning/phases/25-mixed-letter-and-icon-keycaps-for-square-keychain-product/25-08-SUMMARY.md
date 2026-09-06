---
phase: 25-mixed-letter-and-icon-keycaps-for-square-keychain-product
plan: 08
subsystem: order-capture
tags: [security, paypal, pos, whatsapp, keycapseq, pricing, shipping-weight, server-authoritative]

# Dependency graph
requires:
  - phase: 25-01
    provides: "ensureKeycapSequence, lookupTierPriceBySlotCount, buildKeycapSequenceSummary, ensureConfigJson→KeycapSeqConfig, ensureTiers"
  - phase: 25-02
    provides: "KEYCAP_ICON_BY_ID static icon catalog (icon-label map source)"
  - phase: 25-05
    provides: "admin-persisted allowedIconIds config shape validated against at capture"
  - phase: 25-06
    provides: "client-submitted JSON sequence shape in configurationData.values[fieldId]"
  - phase: 25-07
    provides: "client price/summary logic mirrored server-side (never trusted)"
provides:
  - "Server-authoritative keycapseq re-derive (price + icon-id filter + slot cap + summary + sanitized re-persist) on all 3 order-capture paths"
  - "Slot-count shipping-weight resolution for keycapseq unit fields in resolveTierWeightKg"
affects:
  - "25-production-batching (stored order_items now carry sanitized slot sequences + server-derived price/summary)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "keycapseq capture re-derive mirrors the existing select re-read block, but DISCARDS the client computedPrice (select trusts it; keycapseq never does)"
    - "Summary rebuild: replace segment[0] (the sequence portion) of the client computedSummary with the server buildKeycapSequenceSummary output, preserving the ` · `-joined colour tail"
    - "Weight resolver auto-detects a keycapseq JSON slot-array value (bracket sniff) and keys the tier off decoded slot count — zero call-site plumbing, all existing callers unchanged"

key-files:
  created: []
  modified:
    - src/actions/paypal.ts
    - src/actions/admin-pos.ts
    - src/actions/whatsapp-order.ts
    - src/lib/option-weight.ts

key-decisions:
  - "Client computedPrice is discarded for keycapseq on all 3 paths (unlike select, which still trusts it); price is re-derived from the validated slot count via lookupTierPriceBySlotCount against the DB products.priceTiers"
  - "POS honours an explicit admin unitPriceOverride (intentional POS feature) but never the client computedUnitPrice for keycapseq"
  - "resolveTierWeightKg auto-detects the keycapseq JSON slot-array shape internally rather than threading a fieldType hint through 3 call sites — one site (sumOrderWeight booking path) has no config-field metadata, so internal detection is the only change that keeps every caller unchanged"

patterns-established:
  - "Server re-derive discipline for a new configurable field type: re-read config via ensureConfigJson, decode+filter+cap the client value, re-price from DB tiers, rebuild summary, re-persist the sanitized value — applied identically across paypal/pos/whatsapp"

requirements-completed: [D-12]

# Metrics
duration: 20min
completed: 2026-07-19
---

# Phase 25 Plan 08: Server-Authoritative keycapseq Capture + Slot-Count Weight Summary

**Made the server authoritative for mixed letter+icon keycap lines on all three order-capture paths (PayPal checkout, admin POS, manual/WhatsApp) — re-deriving price from the validated slot count, filtering forged icon ids, capping oversized sequences, rebuilding the summary, and re-persisting the sanitized sequence — and fixed shipping-weight resolution so a keycapseq line keys its weight tier off slot count instead of the JSON blob's string length.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-19
- **Tasks:** 2 (both auto)
- **Files modified:** 4

## Accomplishments

- **Task 1 — capture re-derive on 3 paths:** Added a `keycapseq` branch alongside the existing `select` re-read in `paypal.ts`, `admin-pos.ts`, and `whatsapp-order.ts`. For every keycapseq field on a configurable line the server now:
  1. re-reads the field config via `ensureConfigJson("keycapseq", …)`,
  2. decodes the client sequence via `ensureKeycapSequence`, **filters** icon slots to the field's `allowedIconIds` (drops forged ids, T-25-08-02) and **caps** at `cfg.maxSlots` (T-25-08-03),
  3. re-derives the **authoritative price** from the validated slot count via `lookupTierPriceBySlotCount` against the DB `products.priceTiers` — the client `computedPrice` is discarded (T-25-08-01),
  4. rebuilds `computedSummary` via `buildKeycapSequenceSummary` (sequence portion) + the existing colour tail,
  5. re-persists the sanitized slots back into `values[fieldId]` so the stored order item reflects the validated sequence, not the raw client blob.
- **Task 2 — slot-count weight:** `resolveTierWeightKg` now detects a keycapseq JSON slot-array value and keys the weight tier off `ensureKeycapSequence(v).length` (slot count, flat-per-slot v1 per D-12), while text/number unit fields keep the existing character-length key. Server still re-reads `weightTiers` from the products row; client grams never trusted (T-17-09 preserved).

## Task Commits

1. **Task 1: server re-derive keycapseq on all 3 capture paths** — `802d58a` (feat)
2. **Task 2: slot-count shipping-weight resolution** — `5ed5541` (fix)

## Files Created/Modified

- `src/actions/paypal.ts` — keycapseq re-derive branch in the configurable re-read block; added `priceTiers` to the product select; imports for `ensureTiers`/`ensureKeycapSequence`/`lookupTierPriceBySlotCount`/`buildKeycapSequenceSummary`/`KeycapSeqConfig`/`KEYCAP_ICON_BY_ID`
- `src/actions/admin-pos.ts` — parallel keycapseq branch in the POS `parsedCfg` re-validation block; `unitPrice` made mutable so the server tier price replaces the client `computedUnitPrice` (admin `unitPriceOverride` still wins); added `priceTiers` to the product select
- `src/actions/whatsapp-order.ts` — parallel keycapseq branch in the manual/WhatsApp re-read block (the path the checker has flagged as missed before); added `priceTiers` to the product select
- `src/lib/option-weight.ts` — `isKeycapSequenceValue` sniff + slot-count tier key in `resolveTierWeightKg`

## Decisions Made

- **Client price discarded for keycapseq (not just re-validated):** The existing `select` re-read trusts the client `computedPrice` (there is no per-slot DB variant); keycapseq is different — a hostile client could inflate/oversend slots for a cheaper tier, so the price is re-derived from the validated slot count on every path.
- **POS override preserved:** `admin-pos.ts` still honours an explicit `unitPriceOverride` (an intentional admin capability); only the client-computed price is rejected.
- **Weight resolver auto-detection over fieldType plumbing:** The booking-time weight site (`sumOrderWeight` inventory ladder) has only the products row — no config-field `fieldType`. Threading a hint through all three call sites (two of which lack the metadata) would be fragile. Detecting the keycapseq JSON slot-array shape inside `resolveTierWeightKg` keeps every caller byte-unchanged and routes keychain lines through the slot-count path uniformly.

## Deviations from Plan

### Adjustment (within plan's stated flexibility)

**1. [Weight routing] Internal shape-detection instead of call-site fieldType hint**
- **Found during:** Task 2
- **Context:** The plan offered two options (extend `resolveTierWeightKg` with a slot-count hint, OR add a sibling resolver) and said "use whichever keeps the existing text/select callers unchanged." One of the three weight call sites (`sumOrderWeight`, the Delyva booking inventory ladder at `shipping.ts:740`) only has the `products` row — it does not fetch config-field `fieldType`, so it cannot cheaply pass a keycapseq hint.
- **Resolution:** `resolveTierWeightKg` detects a keycapseq JSON slot-array value internally (`isKeycapSequenceValue` bracket sniff → `ensureKeycapSequence(v).length`). Text/number values never serialise to a bracketed array, so they keep the exact `.length` path. All three existing call sites are unchanged.
- **Files modified:** `src/lib/option-weight.ts`
- **Verification:** `npx tsc --noEmit` clean; 15/15 existing `option-weight-resolution` tests pass (text/select regression guard).

**Total deviations:** 1 adjustment (within the plan's explicit "use whichever keeps callers unchanged" latitude). No scope change.

## Threat Register Coverage

| Threat ID | Disposition | Where mitigated |
|-----------|-------------|-----------------|
| T-25-08-01 | mitigated | `lookupTierPriceBySlotCount(ensureTiers(priceTiers), slotCount)` re-price on all 3 paths; client `computedPrice` discarded |
| T-25-08-02 | mitigated | `.filter((s) => s.t === "L" || cfg.allowedIconIds.includes(s.id))` drops forged icon ids |
| T-25-08-03 | mitigated | `.slice(0, cfg.maxSlots)` caps oversized sequences before pricing/persist |
| T-25-08-04 | mitigated | `resolveTierWeightKg` keys off slot count from server-read `weightTiers`; client grams never accepted (T-17-09) |

## Issues Encountered

None. `npx tsc --noEmit` clean after each task; existing weight tests green.

## Known Stubs

None.

## Next Phase Readiness

- Stored `order_items.configurationData` for keycapseq lines now carries the sanitized slot sequence + server-derived price/summary — the icon production-batching plan can group/tick off `icon_done` against trustworthy data.
- Note: prod promotion of the whole Phase 25 feature is still gated on running `scripts/phase25-fieldtype-migrate.ts` against prod `ninjaz_3dnp` (per 25-01) before any keycapseq-writing code deploys to prod.

---
*Phase: 25-mixed-letter-and-icon-keycaps-for-square-keychain-product*
*Completed: 2026-07-19*

## Self-Check: PASSED

- Files verified on disk: `paypal.ts`, `admin-pos.ts`, `whatsapp-order.ts`, `option-weight.ts`, `25-08-SUMMARY.md`
- Commits verified in git history: `802d58a` (Task 1), `5ed5541` (Task 2)
- `npx tsc --noEmit` exits 0; 15/15 option-weight tests pass
- All Task 1 greps match in all three files (ensureKeycapSequence, lookupTierPriceBySlotCount, allowedIconIds.includes, buildKeycapSequenceSummary, slice(0, cfg.maxSlots)); requireAdmin ordering untouched
