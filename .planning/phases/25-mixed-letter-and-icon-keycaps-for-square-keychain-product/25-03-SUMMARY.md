---
phase: 25-mixed-letter-and-icon-keycaps-for-square-keychain-product
plan: 03
subsystem: database
tags: [keychain, keycapseq, config-fields, drizzle, mariadb, vitest, tdd, seeding, parser]

# Dependency graph
requires:
  - phase: 25-01
    provides: "keycapseq contract in config-fields.ts — KeycapSlot union, KeycapSeqConfig, ensureKeycapSequence (fail-soft decoder), ensureConfigurationData"
  - phase: 19-made-to-order-product-type
    provides: "seedKeychainFields 4-locked-field seeder; productConfigFields table; unitField/maxUnitCount/priceTiers wiring"
provides:
  - "seedKeychainFields(productId, shape, options) — square seeds a locked keycapseq pos-0 field, round keeps the legacy text field (D-01)"
  - "products.ts createProduct/updateProduct thread keychainShape into the seeder; unitField finder matches keycapseq for square, text for round"
  - "parseKeycapSequence(raw, seqFieldId) — structured letter/icon parser with explicit slotCount/letterCount/iconCount + letters/icons/slots"
  - "KeycapSequenceParts type export"
affects:
  - "25-04 production batching (reads letters vs icons via parseKeycapSequence, falls back to parseKeychainParts)"
  - "25-07 storefront mixed-slot render + admin config UI (edits the seeded keycapseq field's allowedIconIds)"
  - "25-08 order capture re-derive (paypal/pos/whatsapp read the structured sequence)"
  - "25-09 backfill of existing square keychains to keycapseq"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shape-branched position-0 seeding — one field type per keychain shape (keycapseq for square, text for round); colour fields identical across shapes"
    - "Additive parallel parser — structured-first parseKeycapSequence beside the frozen legacy PARTS_RE/parseKeychainParts (D-06 backwards-compat)"
    - "Explicit three-count model (slotCount != letterCount != iconCount) to keep BASE/CLICKER vs icon batch math correct (Pitfall 1)"

key-files:
  created: []
  modified:
    - "src/lib/keychain-fields.ts"
    - "src/actions/products.ts"
    - "src/lib/keychain-parts.ts"
    - "src/lib/keychain-parts.test.ts"
    - "scripts/migrate-pancake-clicker-to-keychain.ts"

key-decisions:
  - "seedKeychainFields gains a REQUIRED positional shape arg (2nd param, options stays last) — every caller must state the shape explicitly; no silent default in the seeder"
  - "unitField finder in products.ts branches on shape (keycapseq for square, text for round) so square keychains still wire unitField/maxUnitCount 8/priceTiers — otherwise the keycapseq field would be seeded but never wired"
  - "parseKeycapSequence returns null on absent/empty sequence so callers fall through to the legacy parseKeychainParts (structured-first, legacy-fallback)"
  - "Legacy PARTS_RE/NAME_RE/LETTER_COUNT_RE/parseKeychainParts + the 6 existing tests left byte-untouched (D-06); the new path is purely additive"

patterns-established:
  - "Structured-first / legacy-fallback parse chain: try parseKeycapSequence, null => parseKeychainParts"
  - "Shape-conditional seed + shape-conditional unitField resolution kept in lockstep across both products.ts call sites"

requirements-completed: [D-01, D-02, D-03, D-06]

# Metrics
duration: 5min
completed: 2026-07-19
---

# Phase 25 Plan 03: Square-Keychain keycapseq Seeding + Structured Parser Summary

**Square keychains now seed a locked `keycapseq` position-0 field (round keeps today's text field, D-01), and a new additive `parseKeycapSequence` reads the mixed letter/icon sequence from `configurationData.values` with explicit slot/letter/icon counts — leaving the legacy `PARTS_RE` regex and its 6 green tests untouched (D-06).**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-18T17:54:45Z
- **Completed:** 2026-07-18T17:58:47Z
- **Tasks:** 2 (1 auto + 1 TDD)
- **Files modified:** 5

## Accomplishments

- **Shape-branched seeding:** `seedKeychainFields` now takes a required `shape` argument. Square keychains seed a locked `keycapseq` field (`label: "Your keycaps"`, `configJson` with `maxSlots: 8`, `allowedChars: "A-Z"`, `uppercase`, `profanityCheck`, `allowedIconIds: []`); round keychains keep today's `text` "Your name" field byte-for-byte (D-01). The three colour fields (Base/Clicker/Letter, positions 1-3) are identical for both shapes (D-03) — that block was not touched.
- **Caller threading:** Both `createProduct` (~L402) and `updateProduct` (~L622) in `products.ts` pass `keychainShape`, and the downstream `unitField` finder branches (keycapseq for square, text for round) so square keychains still wire `unitField` / `maxUnitCount: 8` / `priceTiers`.
- **Structured parser (TDD):** `parseKeycapSequence(raw, seqFieldId)` reads the sequence from `configurationData.values[seqFieldId]` via the fail-soft `ensureKeycapSequence`, returning explicit `slotCount` / `letterCount` / `iconCount` plus `letters` / `icons` / `slots`, or `null` when absent so callers fall back to the legacy parser. The legacy `PARTS_RE` / `parseKeychainParts` and all 6 original tests are unchanged and green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Branch seedKeychainFields on shape + thread shape from products.ts callers** — `78df9ad` (feat)
2. **Task 2 (RED): failing tests for parseKeycapSequence structured path** — `d89d05b` (test)
3. **Task 2 (GREEN): implement parseKeycapSequence** — `4d79fd6` (feat)

_No REFACTOR commit — the GREEN implementation needed no cleanup._

## Files Created/Modified

- `src/lib/keychain-fields.ts` — `seedKeychainFields` gains a required `shape` param; position-0 branches keycapseq (square) vs text (round); colour seeds untouched; header docstring updated.
- `src/actions/products.ts` — both keychain seed sites pass `keychainShape`; `unitField` finder resolves `keycapseq` (square) or `text` (round).
- `src/lib/keychain-parts.ts` — added `KeycapSequenceParts` type + `parseKeycapSequence`; new imports (`ensureConfigurationData`, `ensureKeycapSequence`, `KeycapSlot`); legacy regex/parser untouched.
- `src/lib/keychain-parts.test.ts` — 6 legacy cases kept as-is; added 7 structured cases (mixed / all-letter / icon-only / empty-value / empty-array / null / malformed-drop) + a `makeSeqCfg` helper.
- `scripts/migrate-pancake-clicker-to-keychain.ts` — the one historical caller now passes `"square"` (Rule 3 tsc fix).

## Decisions Made

- **Required shape arg (no seeder default):** the shape is passed explicitly by every caller rather than defaulting inside the seeder, so the field-type choice is always intentional at the call site. Callers apply the `?? "square"` DB-default fallback themselves.
- **Shape-aware unitField finder:** without this the square keychain would seed a keycapseq field the wiring code (`f.fieldType === "text"`) would never find, leaving `unitField`/`maxUnitCount`/`priceTiers` unset. Branching the finder keeps the product immediately usable.
- **Structured-first, legacy-fallback:** `parseKeycapSequence` returns `null` on absent/empty so production batching can try it first and fall through to `parseKeychainParts` for round + historical letter-only orders.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Third seedKeychainFields caller broke tsc**
- **Found during:** Task 1
- **Issue:** `scripts/migrate-pancake-clicker-to-keychain.ts:165` called `seedKeychainFields(product.id)` with no shape; after adding the required `shape` param this failed `npx tsc --noEmit`.
- **Fix:** Passed `"square"` (this historical pancake→keychain migration produced the original square keychains; matches the DB column default).
- **Files modified:** `scripts/migrate-pancake-clicker-to-keychain.ts`
- **Verification:** `npx tsc --noEmit` exits 0.
- **Committed in:** `78df9ad` (Task 1 commit)

**2. [Rule 2 - Missing Critical] unitField finder would not match the new square keycapseq field**
- **Found during:** Task 1
- **Issue:** Both products.ts seed sites located the pos-0 field via `f.fieldType === "text" && f.locked` to set `unitField`/`maxUnitCount`/`priceTiers`. For square keychains (now seeding `keycapseq`) this returned undefined, silently leaving the product without its unit field and tier pricing — square keychains would seed a field but never wire pricing.
- **Fix:** Derived `unitFieldType = keychainShape === "square" ? "keycapseq" : "text"` and matched on it at both sites.
- **Files modified:** `src/actions/products.ts`
- **Verification:** `npx tsc --noEmit` exits 0; both call sites reviewed.
- **Committed in:** `78df9ad` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical).
**Impact on plan:** Both were required for the plan's own goal — a square keychain that seeds keycapseq but never wires its unitField/pricing would be non-functional, and the migration script must compile. No scope creep; both are minimal, mechanical consequences of adding the required `shape` param.

## Issues Encountered

None — both tasks executed cleanly. RED failed as expected (7 new tests, `parseKeycapSequence is not a function`) while the 6 legacy tests stayed green; GREEN brought all 13 to pass.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Square keychains created/edited after this deploy own a `keycapseq` position-0 field wired to `unitField`/`maxUnitCount: 8`/`priceTiers`; round keychains are unaffected (D-01).
- `parseKeycapSequence` is the structured read path Plan 25-04 (production batching) and 25-08 (order capture re-derive) consume; it returns `null` for legacy/round orders so the existing `parseKeychainParts` path remains the fallback.
- **Not yet wired (later plans):** the seeded `allowedIconIds` is empty — the admin picks allowed icons in Plan 25-05/07; the storefront mixed-slot render lands in 25-07. Existing square keychains still carry the old text field until the 25-09 backfill runs.
- No prod DB change in this plan; the keycapseq ENUM widening (Plan 25-01) remains dev-only until its separate gated prod deploy.

---
*Phase: 25-mixed-letter-and-icon-keycaps-for-square-keychain-product*
*Completed: 2026-07-19*

## Self-Check: PASSED

All modified files exist on disk; all three task commits (78df9ad, d89d05b, 4d79fd6) present in git history. `npx tsc --noEmit` exits 0; `npx vitest run src/lib/keychain-parts.test.ts` = 13/13 (6 legacy + 7 new). TDD gate sequence present: test(25-03) `d89d05b` (RED) → feat(25-03) `4d79fd6` (GREEN).
