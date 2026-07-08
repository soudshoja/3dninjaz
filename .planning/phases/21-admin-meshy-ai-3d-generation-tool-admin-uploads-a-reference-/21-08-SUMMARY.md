---
phase: 21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-
plan: 08
subsystem: testing
tags: [meshy, ci, tsc, admin-guide, smoke-test, drizzle, mysql2]

# Dependency graph
requires:
  - phase: 21-01
    provides: meshy_generations / meshy_revisions schema live on dev MariaDB
  - phase: 21-02
    provides: src/lib/meshy/{types,client,storage}.ts
  - phase: 21-03
    provides: advanceGeneration(id) state machine + full admin-meshy Server Action surface
  - phase: 21-04
    provides: authed binary download route
  - phase: 21-05
    provides: scripts/meshy-sweep.ts cron + 21-DEPLOY-NOTES.md
  - phase: 21-06
    provides: admin list + upload UI
  - phase: 21-07
    provides: admin detail cockpit UI
provides:
  - "CI battery proof: npx tsc --noEmit and npm run build both clean across the full phase output (no lint script exists in this repo)"
  - "A REAL dev-DB walkthrough of advanceGeneration(id) — generating -> awaiting_review observed live, plus a transient-error non-wedge proof — against the live Meshy API under the test-mode key"
  - "A live-probed discovery: Meshy's test-mode key rejects print/analyze, print/repair, and print/multi-color outright (HTTP 400), while image-to-3d and retexture both work — corrects 21-CONTEXT's original dev-behavior assumption"
  - "src/content/admin-guide/products/meshy-3d-generation.md — the admin how-to article"
  - ".planning/phases/21.../21-SMOKE.md — 24-item two-part human verification checklist (17 dev + 7 prod-gated)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Throwaway tsx driver scripts for live state-machine proofs: absolute-path imports (bypassing tsconfig path aliases, which plain tsx doesn't resolve) + NODE_PATH pointed at the repo's node_modules when the driver file lives outside the repo tree (scratchpad), following the same NODE_OPTIONS=\"--require ./scripts/_mock-server-only.cjs\" server-only-neutralizing convention as scripts/meshy-sweep.ts"

key-files:
  created:
    - src/content/admin-guide/products/meshy-3d-generation.md
    - .planning/phases/21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-/21-SMOKE.md
  modified:
    - src/lib/admin-guide-generated.ts

key-decisions:
  - "New admin-guide article uses the frontmatter shape every OTHER product article in src/content/admin-guide/products/ actually uses (category: Products / tags / order) rather than literally mirroring colours.md's frontmatter, which has a pre-existing bug (section: products instead of category: Products) that leaves it miscategorized under \"General\" with no tags — not fixed here (out of this plan's scope), just not replicated into new content"
  - "Task 2's live walkthrough could not reach the ready state as originally envisioned by the plan text, because print/analyze rejects the test-mode key outright (not documented anywhere before this run) — per the plan's own explicit fallback instruction (\"If the dummy key rejects any endpoint... record the exact response and adjust expectations\"), the walkthrough was adjusted to prove the required minimum (generating -> awaiting_review, creditsUsed=30, meshyTaskId non-null) plus the transient-error non-wedge test, and the exact rejection response was captured and fed into 21-SMOKE.md so the human tester isn't confused when Approve visibly fails on dev"
  - "Ran an additional (undirected but low-cost) probe hitting getBalance/createRetextureTask/analyzePrintability/repairPrintability/createMultiColorPrint directly to fully characterize test-mode endpoint support, since this materially changes what Part A of the smoke checklist can honestly claim works on dev"

requirements-completed: [REQ-21-9]

# Metrics
duration: ~70min
completed: 2026-07-08
---

# Phase 21 Plan 08: CI Battery, Live Dev-DB Walkthrough, Admin Guide, Smoke Checklist Summary

**Closed out Phase 21 with a clean `tsc`/`build` CI proof, a real dev-DB `advanceGeneration(id)` walkthrough against the live Meshy API (test-mode key) that also uncovered a previously-undocumented test-mode limitation (print/analyze, print/repair, and print/multi-color all reject the dummy key), a new admin-guide article, and a 24-item two-part (dev / prod-gated) smoke checklist that documents that discovery instead of describing an idealized flow that doesn't match reality on dev.**

## Performance

- **Duration:** ~70 min
- **Completed:** 2026-07-08
- **Tasks:** 4/4 completed
- **Files modified:** 3 (1 created article, 1 created checklist, 1 regenerated codegen file)

## Accomplishments

- **Task 1 (CI battery):** `npx tsc --noEmit` exits 0 across the full repo (all Phase 21 files included). No `lint` script exists in this repo's `package.json` (confirmed; `npm run lint` errors with "Missing script"). `npm run build` (with `DATABASE_URL` pointed through an SSH tunnel to the live dev DB, matching this repo's documented CI build-time DB-query requirement) completed with **zero errors** — all three `/admin/meshy*` routes and the download route appear correctly in the build's route manifest. No file changes required (task genuinely needed none).
- **Task 2 (live dev-DB walkthrough):** wrote a throwaway `tsx` driver (scratchpad-only, never in the repo) that inserted a real `meshy_generations` row, called the real `createImageTo3DTask` under the test-mode key, and drove `advanceGeneration(id)` against the live dev DB (`ninjaz_3dn`, via SSH tunnel). **Observed live:** `generating` -> `awaiting_review` transition, `creditsUsed=30`, `meshyTaskId` non-null, and — notably — the test-mode key actually returned **real downloadable glb/stl files** this run (contradicting 21-CONTEXT's blanket assumption that dev never produces a downloadable model; the pipeline's fallback-tolerance branch for a failed download still exists and matters whenever that assumption *does* hold). A second row with a deliberately bogus/nonexistent `meshyTaskId` proved the transient-error non-wedge rule: `advanceGeneration` caught the resulting `MeshyHttpError` (HTTP 400 "Invalid ID") and left the row at `generating` rather than flipping it to `failed`. Both rows were deleted at the end; `COUNT(*)` was confirmed to return to its pre-test value (1, unrelated to this run).
  - **Key discovery:** attempting to simulate "approve" by calling `analyzePrintability` against a real test-mode task id failed with `HTTP 400 {"message":"This test mode is not yet supported."}`. A follow-up probe (no DB writes) confirmed `print/analyze`, `print/repair`, and `print/multi-color` **all three** reject the test-mode key unconditionally, while `image-to-3d` and `retexture` both work. This means the `analyzing -> ready` leg of the state machine could not be exercised live in this run — per the plan's own explicit fallback instruction, this was recorded rather than treated as a failure, and the finding was threaded into `21-SMOKE.md` so a human tester isn't confused when clicking Approve on dev surfaces a graceful error instead of reaching "Ready".
- **Task 3 (admin-guide article):** `src/content/admin-guide/products/meshy-3d-generation.md` — covers what the tool does, how to take a good source photo, the full workflow (upload -> review -> retexture/regenerate -> approve -> repair -> multi-color -> download), a credit-cost table, the 3-day retexture window rule, and the "downloads always come from our own server" point. Regenerated `src/lib/admin-guide-generated.ts` (37 articles, was 36) so the article is live at `/admin/guide/products/meshy-3d-generation`.
- **Task 4 (smoke checklist):** `21-SMOKE.md` — 17-item Part A (dev, test-mode key, zero real credits) + 7-item Part B (prod-gated, real key/credits, explicitly human-only). Covers every `21-UI-SPEC.md` state-matrix row, both resolved 21-CONTEXT open questions (warn-only balance guard, no v1 product-link UI), the anonymous-download-route curl check from `21-DEPLOY-NOTES.md`, and the closed-tab/sweep tolerance path — with the print/analyze test-mode limitation from Task 2 baked in as a ground-truth callout at the top, not silently omitted.

## Task Commits

Each task was committed atomically (Tasks 1 and 2 required no file changes, per the plan's own `(no file changes)` / `(no repo file changes; dev DB rows created and cleaned)` specs):

1. **Task 1: CI battery** - no commit (no file changes; `tsc`/`build` proof captured in this summary)
2. **Task 2: Dev end-to-end state-machine walkthrough** - no commit (no repo file changes; dev DB rows created and deleted, transition log captured above and in Issues Encountered)
3. **Task 3: Admin-guide article** - `0a5f364` (docs)
4. **Task 4: 21-SMOKE.md human checklist** - `54b1bf3` (docs)

`git log -2 --pretty=%s` confirms both `21-08` commit messages are the two most recent commits, as the plan's Task 4 acceptance criterion requires.

## Files Created/Modified

- `src/content/admin-guide/products/meshy-3d-generation.md` - new admin how-to article (workflow, credit costs, 3-day rule, own-server downloads)
- `src/lib/admin-guide-generated.ts` - regenerated codegen output (prebuild script), now includes the new article (37 articles total)
- `.planning/phases/21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-/21-SMOKE.md` - new two-part human verification checklist

## Decisions Made

- **Admin-guide frontmatter convention:** followed the working convention used by every sibling article (`category: Products`, `tags`, `order`) rather than literally copying `colours.md`'s broken frontmatter (`section: products`, no `category`, no `tags` — confirmed via `src/app/(admin)/admin/guide/page.tsx` that `category` is the field actually used for grouping/icons; `colours.md`'s `section` key is silently ignored, leaving it miscategorized as "General"). This is a pre-existing Phase 18 bug, out of scope to fix here, and not replicated into the new article.
- **Order number:** used `order: 10`, filling in after the highest existing product-article order (`made-to-order.md` at 9) rather than the unused gap at 8, since this is the most recently built feature chronologically.
- **Walkthrough scope adjustment:** per the plan's own explicit instruction ("If the dummy key rejects any endpoint... record the exact response and adjust expectations"), the live walkthrough was restructured mid-execution to capture the `print/analyze` rejection as a recorded finding rather than a fatal failure, then proceed straight to the required transient-error non-wedge test and cleanup. The required minimum bar (generating -> awaiting_review, creditsUsed=30, meshyTaskId non-null, transient-error tolerance) was fully met.
- **Additional endpoint probe:** ran one extra, low-cost (test-mode = zero cost) probe script hitting `getBalance`/`createRetextureTask`/`analyzePrintability`/`repairPrintability`/`createMultiColorPrint` directly to fully characterize which Meshy endpoints the test-mode key supports, since this directly determines what Part A of the smoke checklist can honestly claim is testable on dev. This was not explicitly requested by the plan text but follows directly from the plan's own "record the exact response and adjust expectations" instruction and materially improves the accuracy of the deliverable in Task 4.

## Deviations from Plan

None requiring the Rule 1/2/3/4 framework — no bugs were found in the shipped code, no missing critical functionality, no blocking issues, and no architectural changes were needed. The one adjustment (Task 2's walkthrough scope) was explicitly pre-authorized by the plan's own text, not an unplanned deviation.

## Issues Encountered

- **Local machine cannot reach the dev MariaDB directly** (`152.53.86.223:3306` is firewalled from this laptop's egress IP — matches the documented `reference_local_dev_db_tunnel` pattern). Resolved by reusing an already-open SSH tunnel on `127.0.0.1:3307` (root key, already live from a prior session) and overriding `DATABASE_URL` for the duration of the `npm run build` run and the Task 2 driver scripts. No persistent environment change was made.
- **First walkthrough attempt failed at `createImageTo3DTask`** with `HTTP 500 {"message":"Failed to complete moderation checks"}` when using a trivial 1x1-pixel test PNG as the source image — Meshy's moderation pipeline appears to genuinely run even under the test-mode key and rejects degenerate images. Switched to a real photo (`public/logo.png`) for the walkthrough, which passed moderation and generated successfully. Documented as a real observation (moderation is live even in test mode), not a bug.
- **`npx tsx -e "<inline script>"` silently produced no output** on this Windows/Git-Bash environment (exit 0, but `console.log` output never appeared) — switched to writing driver scripts to files under the scratchpad directory and invoking `tsx` on the file path instead, which worked reliably.
- **Bare-specifier module resolution failed from a scratchpad-located driver script** (`Cannot find module 'drizzle-orm'`) since Node/tsx resolves `node_modules` relative to the importing file's location, and the scratchpad directory is outside the repo tree. Resolved by setting `NODE_PATH` to the repo's `node_modules` directory for the driver-script invocations only; no repo files were affected.

## User Setup Required

None - no external service configuration required for this plan's own deliverables. `21-DEPLOY-NOTES.md` (from Plan 21-05) already documents the real, still-outstanding prod cutover requirements (real `MESHY_API_KEY`, `MESHY_STORAGE_DIR`, cron registration) — unchanged by this plan, and now explicitly referenced from `21-SMOKE.md` Part B.

## Next Phase Readiness

Phase 21 is code-complete and CI-clean. What's proven end-to-end at the code level: `npx tsc --noEmit` and `npm run build` both clean; the state machine has genuinely run against the live dev DB (not just compiled) for its `generating -> awaiting_review` leg and its transient-error tolerance; the admin has a how-to guide; and a human has an accurate, ground-truth-corrected checklist to verify the rest.

**What remains explicitly deferred to a human, by design:**
- Everything in `21-SMOKE.md` Part A should be run once by a human before this phase is considered dev-verified (per `feedback_dev_first_then_prod` — this phase must NOT be promoted to prod until that happens).
- Everything in `21-SMOKE.md` Part B (real model quality, Bambu Studio import, real repair/multicolor, real credit reconciliation, real retexture-window behavior near 3 days) requires the real `MESHY_API_KEY` on prod and explicit user authorization to spend real Meshy credits — not attempted, not simulated, by design.
- `21-DEPLOY-NOTES.md`'s outstanding launch-day blockers (real key, `MESHY_STORAGE_DIR` + one-time `mkdir`, cron registration on dev then prod) are unchanged by this plan and still need a human/SSH action before Part B can even be attempted.
- Item 24 of `21-SMOKE.md` (retexture behavior near/past the 3-day window) asks a future human tester to record findings back into `21-CONTEXT.md` once observed against a real model — this plan did not (and could not, under the test-mode key) observe that behavior itself.

No blockers for phase-level verification to proceed next.

---
*Phase: 21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-*
*Completed: 2026-07-08*

## Self-Check: PASSED

- FOUND: `src/content/admin-guide/products/meshy-3d-generation.md`
- FOUND: `.planning/phases/21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-/21-SMOKE.md`
- FOUND: `.planning/phases/21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-/21-08-SUMMARY.md`
- FOUND commit: `0a5f364` (Task 3)
- FOUND commit: `54b1bf3` (Task 4)
- `npx tsc --noEmit` exits 0
