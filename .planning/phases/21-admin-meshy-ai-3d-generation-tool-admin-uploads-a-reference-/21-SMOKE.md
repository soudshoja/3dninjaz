# Phase 21 Smoke Checklist — Admin Meshy AI 3D Generation Tool

**Purpose:** a numbered, human-runnable checklist to verify the whole feature in one sitting. Split into **Part A (dev, test-mode key, zero real credits)** — safe for anyone to run right now — and **Part B (prod-gated, real key, real credits)** — human-only, run after the user has approved Part A and only once the real `MESHY_API_KEY` is live (see `21-DEPLOY-NOTES.md`).

**Ground-truth note (read this first):** while executing Plan 21-08, a live dev-DB walkthrough (`21-08-SUMMARY.md` Task 2) proved the following about Meshy's `msy_dummy_api_key_for_test_mode_12345678` test-mode key, confirmed 2026-07-08 against the real `https://api.meshy.ai`:

- `image-to-3d` (generation) — **works**, instant fake success, and on this run actually returned a **real downloadable** (if generic/placeholder-quality) glb + stl. 21-CONTEXT's original assumption ("dev will never produce a downloadable model") does not universally hold — the pipeline's fallback-tolerance code for a failed/fake download still exists and is exercised whenever Meshy's test-mode asset URLs happen to be unreachable, but on this run they weren't.
- `retexture` — **works** under test mode (returns a real task id).
- `print/analyze`, `print/repair`, `print/multi-color` — **all three reject the test-mode key outright**, every time, regardless of input: `HTTP 400 {"message":"This test mode is not yet supported."}`. This is a Meshy-side test-mode limitation, not a bug in this codebase.
- `getBalance` — works, returns a balance figure (test mode, so not real credit accounting).

**Practical consequence:** on dev, clicking **Approve** will surface the inline error *"Could not start printability analysis. Try again shortly."* and the generation will stay at `awaiting_review` — it will **never reach `ready`** through the live UI on dev. This means the printability card, the conditional Repair button, the multi-color button, and the STL/3MF download buttons **cannot be exercised end-to-end on dev**. Items below are written around this reality: Part A verifies everything that genuinely works on dev (including that the Approve failure is a *graceful, specific* error, not a crash), and the `ready`-state-onward items move to Part B where a real key is required anyway.

---

## Part A — Dev (test-mode key, no real credits)

1. **Sidebar entry.** Log into `/admin`, confirm a **"3D Generation"** entry appears in the sidebar (marketing group, directly below Colours). Click it → lands on `/admin/meshy`.
2. **Empty state.** With zero generations, `/admin/meshy` shows a centered "No generations yet." card with a **New Generation** CTA (not a bare empty table).
3. **Reject a .gif.** On `/admin/meshy/new`, select a `.gif` file. Confirm a **specific** rejection message appears ("Photo must be JPEG or PNG.") — not a silent no-op, not a generic "invalid file" message.
4. **Reject an oversized photo.** Select a JPEG larger than 10MB. Confirm a specific rejection message ("Photo exceeds 10MB.") appears before/at submit — the client-side guard mirrors the server's `MESHY_SOURCE_IMAGE_MAX_BYTES` cap.
5. **600-char prompt cap.** In the style-prompt textarea, paste or type past 600 characters. Confirm input stops accepting more characters and the counter reads `600/600` (not 601+).
6. **Submit lands on detail with a live placeholder.** Submit a valid JPEG/PNG (single centered subject, plain background works best). Confirm you land on `/admin/meshy/[id]` immediately, showing a disabled "Generating…" ghost state **with the uploaded source photo itself visible as the placeholder** — never a blank/black box.
7. **Reaches `awaiting_review`.** Within roughly 30 seconds of polling (6s interval), status flips to "Awaiting review". **Either** outcome below is acceptable and NOT a bug:
   - the 3D viewer shows an actual (if crude/generic) model — this is what the live walkthrough for this plan observed, **or**
   - the viewer keeps showing the source-photo placeholder because the fake asset URL didn't download this time — the pipeline's test-mode tolerance exists for exactly this case.
   Either way, **status must reach `awaiting_review`** — that is the required assertion.
8. **Request Retexture works on dev.** Click "Request Retexture", type a note, submit. Confirm status flips to "Revising" and (after another poll tick) back to "Awaiting review" with a new revision entry — `retexture` is one of the two endpoints test mode actually supports (confirmed live).
9. **Regenerate shows a confirm gate.** Click "Regenerate" and confirm a dialog appears warning this creates a new full-price (~30 credit) generation before anything fires.
10. **Approve fails gracefully (KNOWN, expected on dev).** Click "Approve". Confirm the UI shows the inline error **"Could not start printability analysis. Try again shortly."** — a specific, readable message, **not** a crash, blank screen, or silent no-op — and the row remains at "Awaiting review". This is the correct dev behavior given Meshy's test-mode limitation above; it is the one thing on this list that is *expected to visibly fail*, and the check is that it fails *gracefully*.
11. **`ready`-state UI is unreachable on dev (documented, not a checklist failure).** Because of #10, the printability card, the conditional Repair button, the multi-color button, and the STL/3MF download buttons cannot be reached through the live UI with the test-mode key. Optional/not required: an admin may manually `UPDATE meshy_generations SET status='ready', printability_status='healthy' WHERE id=...` on the dev DB and reload the detail page purely to eyeball these UI states without spending real credits.
12. **Cancel works.** On a freshly created generation still in "Generating" or "Awaiting review", click Cancel. Confirm it flips to a neutral "Canceled" badge/banner (no error styling).
13. **List page thumbnails + credits column.** Back on `/admin/meshy`, confirm the thumbnail column shows either a real thumbnail image or the neutral placeholder icon (never a broken-image icon), and the Credits column shows a running total (30 for a single ungenerated-revision row).
14. **Closed-tab / sweep tolerance.** Start a fresh generation, then close the tab before it reaches `awaiting_review`. Wait a couple minutes, then either (a) reopen the detail page (client polling resumes and finishes the job), or (b) manually run the sweep once via SSH: `cd /home/ninjaz/apps/3dninjaz_v1 && NODE_OPTIONS="--require ./scripts/_mock-server-only.cjs" ./node_modules/.bin/tsx --env-file=.env.local scripts/meshy-sweep.ts` (per `21-DEPLOY-NOTES.md` §4). Confirm the row still advances. Note: the `*/5` cron itself is **not yet registered on dev** — it's tracked as an outstanding item in `21-DEPLOY-NOTES.md`; this step exercises the exact same `advanceGeneration(id)` function the cron would call, just invoked by hand.
15. **Anonymous download is rejected.** From a terminal with no browser session, run `curl -sI https://app.3dninjaz.com/api/admin/meshy/x/download?file=stl` (`x` is a deliberately invalid id). Confirm a non-200-with-file response (403/redirect/branded page) — never a raw model file.
16. **No product-link UI exists (by design).** Confirm there is **no** "link this generation to a product" control anywhere on the list, upload, or detail pages. This is intentional — `21-CONTEXT.md` open question #2 was resolved as "nullable, FK-less `product_id` column only, no v1 UI." If a generated model needs to become an actual store product, that's a manual step (download the files, attach them to the product the normal way) — the admin-guide article documents this.
17. **Balance guard is warn-only.** Confirm (by reading `checkBalanceGuard` in `src/actions/admin-meshy.ts`, or by observing behavior if the shared account balance is ever actually low) that a low balance shows an advisory warning on generation but never hard-blocks the action — resolved open question #1.

---

## Part B — Prod-gated (real key, real credits — HUMAN ONLY, after the user approves Part A)

Do **not** run these yourself against real Meshy credits. This section is a checklist for a human to execute manually, later, once `MESHY_API_KEY` (the real key) is set on prod per `21-DEPLOY-NOTES.md` §1.

18. **Real generation quality.** Upload a real, well-composed reference photo. Confirm a real, detailed textured 3D model appears in the `<model-viewer>` — not the crude/generic placeholder seen on dev.
19. **Approve actually reaches `ready`.** Click Approve. Confirm the printability analyze call succeeds this time (real key supports it), the printability card renders with real diagnostic data, and status reaches "Ready".
20. **Repair flow on a flagged model.** If the printability check flags warning/error, click "Repair this model? (10 credits)". Confirm the model is repaired, automatically re-analyzed for free, and status returns to "Ready".
21. **STL downloads and opens in Bambu Studio.** Click "Download STL". Confirm the file downloads (not a branded "not ready yet" page) and opens cleanly in Bambu Studio.
22. **Multi-color 3MF downloads and opens with color regions.** Run "Multi-Color Conversion (10 credits)" with a chosen `max_colors`/`max_depth`. Confirm the 3MF downloads and opens in Bambu Studio showing distinct color regions matching the request (not a single-color mesh).
23. **Credit reconciliation (approximate).** Compare the Meshy dashboard's credit deduction for this generation against the sum of this app's `creditsUsed` column (30 generate + any retexture/repair/multicolor spend). Expect them to be roughly in agreement — 21-CONTEXT documents this as advisory/approximate, not exact-cent billing.
24. **Retexture window near/past 3 days.** On a model whose `modelReadyAt` is close to or past the 3-day mark, attempt Retexture. Confirm whether it still succeeds or is correctly blocked client-side with the "Source task expired on Meshy — use Regenerate" message. `21-CONTEXT.md` flagged `input_task_id` reliability past 3 days as **unverified** — record the actual observed behavior back into `21-CONTEXT.md` once tested.

---

## After Part A passes

This phase is ready for the dev → human review gate. Per repo convention (`reference_auto_merge_enabled`), a PR into `dev` may use `gh pr merge <PR> --auto --squash`; branch protection requires the "Install + typecheck" check to pass first. Part B is deferred until the user explicitly authorizes spending real Meshy credits and the prod cutover steps in `21-DEPLOY-NOTES.md` are complete.
