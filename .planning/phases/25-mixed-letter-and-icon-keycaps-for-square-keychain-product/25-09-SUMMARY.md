# Phase 25 Plan 09 Summary — Backfill + Human Sign-off (Partial)

**Date:** 2026-07-19 → 2026-07-20
**Status:** Task 1 complete. Task 2 (human-verify checkpoint) partially exercised via live ad-hoc testing — NOT a formal "approved" sign-off. See "Still pending" below for what to resume with.

## Task 1 — Backfill (COMPLETE)

`scripts/phase25-backfill-square-keycapseq.ts` written and run against dev
(`ninjaz_3dn`, via the 3307 SSH tunnel). Verified directly via DB query:

- 1 square keychain converted at the time ("Keyboard Clicker",
  `b44d45a7…`, slug `pancake-clicker-mogqlfp6`): position-0 field is now
  `keycapseq` "Your keycaps", `configJson` correctly carries over
  `maxSlots=10` (from the old `maxLength`), `allowedChars`, `uppercase`,
  `profanityCheck`, empty `allowedIconIds`.
- Field `id` preserved in place (UPDATE, not delete+insert) — `unitField`
  still resolves correctly, tiers intact.
- Colour fields (Base/Clicker/Letter) untouched.
- Round keychains confirmed untouched (2 round products, still `text`
  fieldType at pos-0).
- Idempotent: second run reported 0 conversions.
- Prod (`ninjaz_3dnp`) untouched — script hard-refuses that DB name.

A second square keychain ("clicker", slug `clicker-mrr0qbzf`) was created
independently during this session (not by the backfill — it picked up
`keycapseq` automatically via Plan 25-03's updated `seedKeychainFields` since
it's a fresh product) and was the one actually used for live testing below.

## Task 2 — Human end-to-end checkpoint (PARTIAL — not formally closed)

The checkpoint was never answered with a clean "approved." Instead, the user
tested live on dev over several rounds, found real bugs, and each was fixed
and deployed as a separate gap-closure PR (all merged to `dev`, confirmed live):

| # | 7-step item (from 25-09-PLAN.md) | Status |
|---|---|---|
| 1 | Admin: allow-list icon picker | ✅ Verified live — user configured `allowedIconIds` on the "clicker" product themselves |
| 2 | PDP: slot builder, no colour picker on icon slots | ✅ Verified live — but required a UX rework mid-session (see gap-closure below); current design (visible text input + always-on inline icon grid) confirmed working |
| 3 | Preview: mixed strip renders correctly, all-letter unchanged | ✅ Verified live — required 3 rounds of fixes (see below); final state confirmed by direct pixel measurement + visual screenshot review, not just code review |
| 4 | Price/summary text on bag/checkout | ❌ **Not yet checked** — no evidence the bag/checkout line text was reviewed this session |
| 5 | Sandbox PayPal checkout, server re-derive matches PDP | ❌ **Not yet tested** — no sandbox order was placed this session |
| 6 | Admin production board: Icons segment, per-item tick, assembly gate | ❌ **Not yet checked** — admin production board was not opened this session |
| 7 | Round keychain PDP unchanged | ❌ **Not yet re-verified live** — scoped correctly in code (grep/review confirmed no round code paths touched across all gap-closure PRs), but not clicked through on an actual round product page |

### Gap-closure rounds triggered by live testing (all merged + deployed to `dev`)

1. **PR #193** — icon crop was reading a 512×512 canvas with ~7% actual
   content (icons nearly invisible at display size); "+Letter"/"+Icon"
   button UX had no visible typing affordance. Fixed: regenerated icon crop,
   reworked the builder into a visible text input + always-on inline icon
   grid below it (no buttons, no dialog on the customer builder).
2. **PR #194** — icon shell was hardcoded white regardless of customer's
   Base colour choice. Fixed: preview + production batching now follow Base
   colour (production batches split by icon id + base colour so admin knows
   which filament to load).
3. **PR #195** — icon frame had an extra 3px padding vs the letter's clicker
   face, making icons render smaller/misaligned. Fixed: removed the padding,
   matched the inset box-shadow — confirmed via direct pixel measurement
   (both frames now exactly 42.66×42.66px).
4. **PR #196** — root cause of #194 appearing to have "no effect": the
   source icon renders are flattened images of the WHOLE physical keycap
   (opaque white shell baked in), not transparent cutouts. Fixed: chroma-key
   stripped the shell to transparent on 32 of 34 icons (manually reviewed
   each at full resolution). 2 exceptions kept their original fixed-white
   look (`baseball.webp`, `golf-ball.webp`) — both are monochrome white-ball
   designs where the icon's own graphic is indistinguishable from the shell
   by colour; this is a known, accepted limitation of the current
   2D-flattened-render asset pipeline.

## Still pending (resume here next session)

1. **Finish the human smoke checklist** — items 4, 5, 6, 7 from the table
   above still need a live pass on dev.
2. **Prod promotion** — `scripts/phase25-fieldtype-migrate.ts` has NOT been
   run against prod (`ninjaz_3dnp`). No Phase 25 code or DB changes have
   touched prod. This is an explicit separate gated step per the original
   plan — do not run until items 4-7 above are confirmed and the user
   explicitly decides to promote to prod.
3. **Known limitation to revisit (optional, not blocking):** `baseball.webp`
   and `golf-ball.webp` icons don't follow the customer's Base colour (fixed
   white shell) due to the flattened-render asset limitation described in
   PR #196 / `25-GAP-03-SUMMARY.md`. A proper fix would need per-part 3D
   rendering from the original `.3mf` mesh geometry (isolating the accent
   parts from the base part at the source) rather than post-processing the
   flattened 2D thumbnail — not attempted this session.

## Verification

- `npx tsc --noEmit` clean (confirmed repeatedly across every gap-closure
  round this session)
- All 4 PRs (#193, #194, #195, #196) merged to `dev`, each confirmed live via
  direct `gh run view` + `curl` checks after deploy (not just trusting CI —
  one deploy run showed a false-failure smoke-test race that a direct curl
  disproved; see git history for the CI relationship notes)
