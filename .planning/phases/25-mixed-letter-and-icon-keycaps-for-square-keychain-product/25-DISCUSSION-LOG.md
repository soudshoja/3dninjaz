# Phase 25: Mixed Letter + Icon Keycaps - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-19
**Phase:** 25-mixed-letter-and-icon-keycaps-for-square-keychain-product
**Mode:** Decisions gathered through direct conversation with the user prior to invoking `/gsd-discuss-phase` (not the standard interactive gray-area flow) — this log reconstructs the discussion that occurred.

---

## Product type: new product vs extension of keychain-clicker line

| Option | Description | Selected |
|--------|-------------|----------|
| New product: Icon Keycaps | Separate SKU/product type, no keyring loop, standalone | |
| Extension of keychain-clicker line | Reuse existing keychainShape/clicker infra, add mixing capability | ✓ |

**User's choice:** Extension of keychain-clicker line — "and we want to allow character mixed with keycaps both."
**Notes:** This directly introduced the core requirement: letters and icons must be mixable within the same keychain sequence, not two separate products.

---

## Icon variant loading

| Option | Description | Selected |
|--------|-------------|----------|
| Structure first, icons later | Wire picker mechanism now, load icons as follow-up | |
| Full 34 now | Extract, name, and wire all 34 icons in this pass | ✓ |

**User's choice:** Full 34 now.

---

## Shape scope

**User's statement:** "its only square" — feature applies to square keychain shape only, round untouched.
**Notes:** No alternatives presented — stated directly as a constraint.

---

## Slot cap model

**User's statement:** "whatever charetcer defined it should be max for both so if its 9 then they can only select mixture of both for charecter and keycaps"
**Interpretation confirmed with user:** One shared max slot count covers letters + icons combined (not separate caps per type). E.g. max=9 → any mix totaling 9 slots.
**User confirmed:** "Clear."

---

## Colour behaviour per slot type

**User's statement:** "keycaps are fixed and letters follow as the original design and they pick base clicker leyyer colours"
**Decision:** Letter slots — customer picks Base/Clicker/Letter colours (unchanged from today). Icon slots — colours fixed/baked into the icon design, no picker shown.
**Follow-up verification (Claude-initiated, not user-prompted):** Investigated actual 3mf mesh geometry to determine which physical part is "base" for icon designs.
- Initial (incorrect) read: assumed the "black" named part was the base, since it was extruder 1 and appeared first in metadata.
- User corrected: "base is white for all of them double check."
- Re-verified via actual mesh bounding-box + Z-height data: white part = 19.16x19.16mm/5.34mm-deep full keycap shell at lowest Z; black/green parts = thin (0.4-0.6mm) small icon-graphic details stacked on top. Confirmed user was correct — base is white, fixed across all 34 icons.

---

## IP/trademark risk on franchise-logo icons

**Claude flagged (unprompted, twice):** 13 of the 34 icon designs are licensed Marvel/Nintendo logos — real DMCA/C&D/lawsuit exposure for a live commercial store, "educational purpose" framing does not exempt actual paid sales.
**User's first response:** "ok i dont need you to check on these i am building this for education purpose."
**Claude's follow-up:** Clarified that educational intent doesn't change risk once physically sold via checkout on a live paid store, and asked directly whether these would be sold live or kept dev/internal only.

| Option | Description | Selected |
|--------|-------------|----------|
| Dev/internal only, never sold | Test data only, not exposed to real customers | |
| Yes, sold live to customers | All 34 icons including franchise logos go to the real catalog, user's own risk to accept | ✓ |

**User's choice:** Sold live to customers — explicit, informed acceptance of the risk after two flags.
**Notes:** This decision is final and should not be re-litigated or re-gated in planning/execution — see CONTEXT.md D-08.

---

## Claude's Discretion

- Exact new-fieldType name/mechanism and whether it replaces or supplements the existing "Your name" text field (CONTEXT.md D-05).
- Exact value-serialization encoding for mixed letter/icon sequences within the single-string `ConfigurationData.values` slot (D-06).
- Exact admin UI component for icon-library management — reuse `ColourPickerDialog` pattern vs new component (D-09).
- Production batching mechanics for icon slots' third colour/part group (D-11).
- Whether icon slots need distinct shipping weight vs letters, or a flat approximation for v1 (D-12).

## Deferred Ideas

- Mixed letter+icon for ROUND keychains — out of scope this phase, noted for a possible future phase.
