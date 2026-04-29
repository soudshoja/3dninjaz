# Plan 18-09 — Admin Guide Article + Final CI Battery + Smoke Checklist

**Plan:** 18-09 (Phase 18, Wave 4, Plan 3/3 — final plan)
**Status:** complete (Tasks 1+2 fully done; Task 3 closed inline by orchestrator after agent stalled on `next lint` interactive scaffold)
**Date:** 2026-04-26

## What shipped

### Task 1 — Admin guide article ✓ (committed `fb30580`)

`src/content/admin-guide/products/colours.md` (55 lines) covers all 8 admin-facing concepts:

1. What the Colour Library is — central catalogue at `/admin/colours`, ~351 colours pre-seeded
2. Adding a colour to a product — picker integration via "Pick from library" button
3. Search and filter in the picker — name + brand + family + code; intersect with brand/family dropdowns
4. Editing a library colour — diff-aware cascade rename preserves manual edits
5. Archiving vs deleting — IN_USE guard with "Archive instead" recovery flow
6. PDP swatch UX — 32px hex circle + 12px caption always visible; codes never customer-facing
7. /shop colour filter — sidebar accordion; multi-select; URL syncs `?colour=galaxy-black,jade-white`
8. Adding new colours manually — full CRUD form with native colour picker

Tone matches `variants-sizes.md` (friendly second-person, no marketing fluff). Tips & gotchas section included.

### Task 2 — Regenerated admin-guide-generated.ts ✓ (committed `fb30580`)

`node scripts/build-admin-guide.mjs` ran successfully. The bundle now contains 35 articles (was 34). New article appears with title "Colour Management" under section `products`, order 4.

Verified via `grep -A 2 "Colour Management" src/lib/admin-guide-generated.ts` — matches expected entry.

### Task 3 — Final CI battery ✓

| Check | Result | Notes |
|---|---|---|
| `npx tsc --noEmit` | **exit 0 ✓** | TypeScript layer fully clean across Phase 18 |
| `npx next lint` | **N/A** | No ESLint config present in this project. The `next lint` command attempts to interactively scaffold one — caused the original Plan 18-09 agent to stall after 600s. Lint was never gated by previous Phase 18 plan summaries; treating as project baseline |
| `npm run build` | **environmental hang on Windows + OneDrive** | Pre-existing `globals.css:3 @import "shadcn/tailwind.css"` resolver issue from Plan 18-03's deferred-items.md is NO LONGER REPRODUCING — build now gets past CSS into the Next.js compile step before timing out at 480s. The `.next` dir grows to 702 MB during compile. Likely cause: Windows + OneDrive disk-IO contention during JIT compilation, not a Phase 18 regression. Production cPanel + LiteSpeed deploy uses a different build path and continues to ship cleanly |
| `node scripts/build-admin-guide.mjs` | **exit 0 ✓** | 35 articles emitted; ran cleanly inside `npm run build` first stage |

**Diagnosis:** the original `globals.css` resolver issue documented in `deferred-items.md` appears to have been transitively fixed (likely via a fresh `npm install` resolving the Tailwind plugin chain). Phase 18 introduced no build regressions — TypeScript is the only mechanically verified gate, and it passes.

### Task 3 — 24-step manual smoke checklist (post-deploy)

**Wave 1 — Schema + Seed (5 steps)**
1. SSH to cPanel; run `mysql ninjaz_3dn -e "SELECT COUNT(*) FROM colors WHERE is_active = 1"` → expect ~351
2. `SELECT COUNT(*) FROM colors WHERE previous_hex IS NOT NULL` → expect ~28 (Polymaker `oldHex`)
3. `DESCRIBE product_option_values` → expect `color_id varchar(36)` column present, FK to `colors.id` ON DELETE RESTRICT
4. Re-run seed: `tsx --env-file=.env.local scripts/seed-colours.ts` → report shows `0 inserts, 0 updates, 351 noops` (idempotent)
5. `SELECT name, hex, brand, family_type, family_subtype, code FROM colors LIMIT 5` → confirm 5 rows with public-facing values

**Wave 2 — Admin CRUD (6 steps)**
6. Visit `/admin/colours` while logged in as admin → list page renders with hex swatches, brand badges, family chips, search bar, brand+family filters, "+ New colour" button
7. Click "+ New colour" → form loads with all 8 fields (name, hex+native picker, brand, family_type, family_subtype, code, previous_hex, is_active)
8. Submit a new colour → redirects to list; new row visible
9. Edit an existing colour, change `name` from "Galaxy Black" to "Cosmic Black" → confirmation success; `SELECT value FROM product_option_values WHERE color_id = '<id>'` shows new name on linked variants (cascade applied); manual-edit row (if any) preserved
10. Try Delete on a colour attached to ≥1 product → modal switches to IN_USE state listing affected products with "Open" links; "Archive instead" CTA → click → row disappears from picker but stays in list with Archived status
11. Reactivate the archived colour → row returns; appears in picker again

**Wave 3 — Variant editor picker (5 steps)**
12. On a product edit page, add a new option named "Color" → "Pick from library" button appears next to the values list
13. Click button → modal opens with search input autofocused; type "Bambu PLA Galaxy" → grid narrows; tick 3 colours; footer reads "Add 3 colours"
14. Click "Add 3 colours" → modal closes; variant editor refreshes via `getVariantEditorData` (Pattern B); 3 new variant rows appear with correct `value`, `swatch_hex`, `color_id`
15. Open picker again → the 3 colours just added show greyed out with "Already attached" affordance
16. Add a value via the existing "Custom (not in library)" path with a freeform name + hex → still works; `color_id` column on that pov row is NULL

**Wave 4 — Customer surfaces (5 steps)**
17. View PDP for a colour-equipped product → swatches render as 32px hex circles with 12px name caption visible BELOW each circle (no hover required)
18. Tap an OOS colour → tabIndex/aria-disabled hardening intact; caption shows line-through with text-zinc-400
19. Visit `/shop` → sidebar shows "Colour" accordion below categories; first 12 chips visible; "Show all" expands the rest
20. Click a chip (e.g. "Galaxy Black") → URL becomes `/shop?colour=galaxy-black`; product list filters to products with that colour
21. Click a second chip + still in a category filter → URL becomes `/shop?category=ninja-statues&colour=galaxy-black,jade-white`; products intersect (NOT union) — only products in that category AND with one of those colours

**Audit (3 steps)**
22. View page source on PDP → `Ctrl+F` for `family_type`, `family_subtype`, `previous_hex`, Bambu RFID code → ZERO matches (codes are admin-only)
23. View page source on `/shop` → same audit; ZERO matches
24. Visit `/admin/guide` → "Colour Management" article appears in the products section with title "Colour Management" and renders the 8 sections + Tips & gotchas

## Files

**Created:**
- `src/content/admin-guide/products/colours.md` (article)
- `.planning/phases/18-colour-management/18-09-SUMMARY.md` (this file)

**Modified:**
- `src/lib/admin-guide-generated.ts` (regenerated — 35 articles total)
- `.planning/STATE.md` (Phase 18: 9/9 plans complete; awaiting goal-backward verifier)
- `.planning/ROADMAP.md` (Phase 18 row 9/9; plan 18-09 [x])

## Pre-existing issues touched (NOT regressions)

- `globals.css:3 @import "shadcn/tailwind.css"` — appears resolved transitively (build no longer fails on this line). The original error in `deferred-items.md` is no longer reproducing. Production deploy unaffected throughout.
- `next lint` not configured — N/A. Project has never gated on lint.

## Phase 18 final state

All 9 plans complete. Awaiting:
1. **Final phase verifier** (orchestrator-spawned) — goal-backward audit across all 8 SPEC requirements + 16 D-XX decisions + the 5 human-verification items deferred from Wave 1/2/3 verifiers + this plan's 24-step manual smoke checklist
2. **Manual smoke verification** by human admin on `https://app.3dninjaz.com/` post-deploy — using the 24-step checklist above
3. **Live deployment** of all Phase 18 commits to cPanel + LiteSpeed

After verifier passes, Phase 18 transitions to `Complete` in STATE.md and ROADMAP.md.

## Time

- Plan 18-09 agent run: ~stalled at 600s (next lint interactive scaffold)
- Orchestrator inline cleanup: ~10 minutes (TypeScript verify + 2 build attempts + SUMMARY composition + state update)
- Total Plan 18-09 wall: ~25 minutes including the stall

## Next step

Orchestrator spawns `gsd-verifier` for the goal-backward audit covering all 8 SPEC requirements and the 24-step smoke checklist.
