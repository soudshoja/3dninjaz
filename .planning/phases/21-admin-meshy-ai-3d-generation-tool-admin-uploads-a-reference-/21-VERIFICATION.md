---
phase: 21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-
verified: 2026-07-08T00:00:00Z
status: human_needed
score: 40/40 must-haves verified
overrides_applied: 0
re_verification: false
human_verification:
  - test: "21-SMOKE.md Part A (items 1-17) — full dev UI walkthrough with the test-mode key: sidebar entry, list empty state, upload rejections (.gif / >10MB), 600-char cap, generating placeholder never blank, awaiting_review within ~30s, retexture round-trip, regenerate confirm gate, graceful Approve failure (expected on dev — test-mode key rejects print/analyze), cancel, thumbnails/credits, anonymous download rejected"
    expected: "All 17 items pass as written; item 10's Approve failure is graceful and specific, not a crash"
    why_human: "Visual appearance, browser flows, live polling behavior, and session-cookie-authed element sources cannot be verified by static analysis"
  - test: "Register the */5 sweep cron on dev (21-DEPLOY-NOTES.md §3) or run scripts/meshy-sweep.ts manually via SSH, then verify a closed-tab generation still advances (SMOKE item 14)"
    expected: "Row stuck in an active status with updated_at >2min old advances on the next sweep run; /home/ninjaz/scripts/meshy-sweep.out shows [meshy-sweep] lines"
    why_human: "Crontab registration is a one-time server op deliberately left to a human (dev-first policy); code-level proof of the sweep already captured in 21-05"
  - test: "21-SMOKE.md Part B (items 18-24) — prod-gated, real MESHY_API_KEY, real credits: real model quality in model-viewer, Approve reaches ready with a real printability report, repair flow, STL opens in Bambu Studio, multi-color 3MF with color regions, credit reconciliation, retexture behavior near/past 3 days"
    expected: "All Part B items pass; retexture-window findings recorded back into 21-CONTEXT.md per item 24"
    why_human: "Spends real money on an external service; requires Bambu Studio on a workstation; prod env cutover (real key, MESHY_STORAGE_DIR, mkdir) is a human SSH op per 21-DEPLOY-NOTES.md"
---

# Phase 21: Admin Meshy AI 3D Generation Tool — Verification Report

**Phase Goal:** Admin can upload a product reference photo, generate a textured 3D model via Meshy's Image-to-3D API, review/retexture/regenerate until satisfied, approve (running free printability analyze + explicit-click paid repair), optionally run multi-color 3MF conversion, and download print-ready STL/3MF files for Bambu Studio — all server-side, admin-only, polling-driven with a cron reconciliation sweep, files persisted to private storage before Meshy's 3-day asset expiry.
**Verified:** 2026-07-08
**Status:** human_needed (all automated checks pass; SMOKE Part A/B are human-gated by design)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (per-plan frontmatter must_haves, all 8 plans)

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| **Plan 21-01** | | | |
| 1 | meshy_generations live on dev MariaDB with exact 9-value status ENUM | ✓ VERIFIED | Migration run twice against ninjaz_3dn (session-confirmed, SHOW CREATE TABLE captured); schema drift gate ran clean; enum in schema.ts:791 matches |
| 2 | meshy_revisions live with FK ON DELETE CASCADE | ✓ VERIFIED | phase21-migrate.cjs `fk_mr_generation ... ON DELETE CASCADE`; live run proof in 21-01-SUMMARY |
| 3 | Charset matches live-probed `user` table charset | ✓ VERIFIED | Probe returned latin1 (21-01-SUMMARY key-decisions); no `DEFAULT CHARSET=latin1` hardcoded in script (interpolated) |
| 4 | Drizzle schema.ts mirrors live DDL column-for-column | ✓ VERIFIED | schema.ts:782-877 read directly; 26 cols + 3 indexes + child table + relations; `$onUpdateFn` substitution for datetime documented, live DDL carries authoritative ON UPDATE |
| 5 | Migration idempotent (second run zero changes) | ✓ VERIFIED | Run twice — second run 0 applied, both skipped (21-01-SUMMARY; session-confirmed) |
| **Plan 21-02** | | | |
| 6 | MESHY_API_KEY read ONLY in client.ts | ✓ VERIFIED | `grep -rn MESHY_API_KEY src/` excluding client.ts = empty; no NEXT_PUBLIC_MESHY anywhere |
| 7 | client.ts server-only line 1, covers all needed endpoints | ✓ VERIFIED | client.ts:1 `import "server-only"`; image-to-3d, retexture create+GET, print/analyze+GET, print/repair+GET, print/multi-color+GET, balance all present; no pollTaskUntilDone, no Text-to-3D |
| 8 | Model files root outside public/, env-overridable, traversal-guarded | ✓ VERIFIED | storage.ts:23 `./storage/meshy` default + MESHY_STORAGE_DIR; isWithinRoot boundary-safe guard (:32-35); safeGenerationId regex (:38-43) |
| 9 | Single parse-helper pair in types.ts | ✓ VERIFIED | parseLocalModelFiles + parsePrintabilityReport (types.ts:48-108); all read sites (pipeline, actions, route) import them |
| 10 | storage/ gitignored | ✓ VERIFIED | .gitignore:81 `/storage/`; .env.local never committed (git log empty) |
| **Plan 21-03** | | | |
| 11 | Every action export awaits requireAdmin() literally first | ✓ VERIFIED | Plan's node verifier re-run: `requireAdmin-first OK (9 exports)` |
| 12 | Download-before-advance on SUCCEEDED, prod blocks / test-mode proceeds | ✓ VERIFIED | All FOUR branches guarded: generating (pipeline.ts:196-200), revising (:262-264), repairing (:416-421, WR-01 fix landed in 1eabdca), multicolor (:490-495) |
| 13 | repairGeneration explicit action, never auto-fires | ✓ VERIFIED | approveGeneration only calls free analyzePrintability (admin-meshy.ts:478); post-repair chain is analyze not repair (pipeline.ts:431); UI repair only via card click |
| 14 | requestRevision COUNT(*)+1 live + 3-day retexture block | ✓ VERIFIED | Live count select (admin-meshy.ts:416-420); MESHY_RETEXTURE_WINDOW_MS guard returns RETEXTURE_EXPIRED (:376-377) |
| 15 | pipeline.ts imports nothing from next/* | ✓ VERIFIED | `grep 'from "next/'` = 0; no "use server"; sweep loaded it under tsx successfully (21-05 proof run) |
| 16 | invalid_input task errors never auto-retried, surfaced verbatim | ✓ VERIFIED | FAILED branches store taskErrorType/Message verbatim; failed banner renders both (detail.tsx:376-392); no retry logic anywhere in pipeline/actions |
| **Plan 21-04** | | | |
| 17 | Download route requireAdmin literal first await | ✓ VERIFIED | route.ts:97 first await inside try; Forbidden → 403 JSON (:198-200) |
| 18 | ?file= selects WHICH DB field, never a path | ✓ VERIFIED | Allowlist of 5 kinds (:28); switch maps to row.localModelFiles.*/sourceImagePath/localThumbnailPath only (:115-131) |
| 19 | STL/3MF attachment; glb/source/thumb inline | ✓ VERIFIED | Exactly 2 `attachment` headers (:176, :181); inline for the rest (:185, :191) |
| 20 | Path traversal impossible — resolveStoragePath on every read | ✓ VERIFIED | route.ts:151; guard itself boundary-safe in storage.ts |
| **Plan 21-05** | | | |
| 21 | Sweep calls the SAME advanceGeneration | ✓ VERIFIED | meshy-sweep.ts:35 relative import; zero own Meshy API calls (grep meshyFetch/api.meshy.ai = 0) |
| 22 | Active-status + 2-min-stale filter, 10-row bound, exit 0 on idle | ✓ VERIFIED | STALE_MS/MAX_PER_RUN (:40-41); and(inArray, lt) + limit (:46-56); exit 0 both paths |
| 23 | Sweep proven runnable locally under tsx + mock-server-only hook | ✓ VERIFIED | 21-05-SUMMARY: `[meshy-sweep] nothing to do`, exit 0, via SSH tunnel against live dev DB |
| 24 | Deploy notes capture env vars, mkdir, exact crontab line | ✓ VERIFIED | 21-DEPLOY-NOTES.md contains persistent_meshy (7 hits), live-verified appdir names |
| **Plan 21-06** | | | |
| 25 | /admin/meshy shadcn Table with row links to detail | ✓ VERIFIED | page.tsx:79-141; 5 columns per spec; per-cell Links to /admin/meshy/[id] |
| 26 | Thumbnails via download route or ImageOff — never meshy.ai | ✓ VERIFIED | `?file=thumb` (:97) / NoThumbnailIcon fallback (:105); `meshy.ai` grep across src/components + src/app = 0 |
| 27 | /admin/meshy/new full upload form behavior | ✓ VERIFIED | Dropzone + preview + guardrail copy verbatim + {prompt.length}/600 counter + inline role="alert" banner + disable/spinner + router.push (upload-form.tsx) |
| 28 | All colors from BRAND import — zero stale hexes | ✓ VERIFIED | grep #1E8BFF/#39E600/#A855F7 across all meshy UI files = 0; amber/red literals deliberate (paired with admin-order-status-badge) |
| 29 | Sidebar "3D Generation" entry with existing ninjaIcon PNG | ✓ VERIFIED | sidebar-nav.tsx:87 after Colours; public/icons/ninja/nav/services.png exists on disk |
| **Plan 21-07** | | | |
| 30 | Polls every 6s ONLY while active, stops on terminal, restarts on new stage | ✓ VERIFIED | POLL_INTERVAL_MS 6_000; startPolling gated + self-stopping (detail.tsx:94-104); refreshAndMaybePoll restarts (:123-132); clearInterval cleanup on unmount |
| 31 | model-viewer src = local glb via authed route; source-photo placeholder never blank | ✓ VERIFIED | `?file=glb` (model-viewer.tsx:39); else `?file=source` + animate-pulse + caption (:52-63) |
| 32 | Repair button ONLY in printability card, ONLY warning/error | ✓ VERIFIED | canRepair = ready && (warning\|\|error) (detail.tsx:423-425); button rendered only when canRepair inside card (:135-146); no other repair trigger |
| 33 | Retexture disabled + expiry tooltip past 3 days | ✓ VERIFIED | retextureExpired computed from modelReadyAt (:213-215); disabled + title (:224-225); RETEXTURE_EXPIRED server error mapped to same message |
| 34 | Download STL/3MF only at ready; 3MF only when isMultiColor | ✓ VERIFIED | Downloads section gated status==="ready" (:494); 3MF gated isMultiColor && threeMf (:506) |
| 35 | Printability card renders only returned diagnostics | ✓ VERIFIED | buildRows typeof-checks every field, no fabricated zeros (printability-card.tsx:38-83) |
| **Plan 21-08** | | | |
| 36 | npx tsc --noEmit passes on full phase output | ✓ VERIFIED | Re-run independently at HEAD (includes post-review WR-01 fix 1eabdca): TSC_OK |
| 37 | npm run build completes | ✓ VERIFIED | 21-08-SUMMARY: zero errors, all /admin/meshy* routes in route manifest (via SSH-tunnel DB); branch-protection "Install + typecheck" gate re-proves on PR |
| 38 | Dev end-to-end walkthrough executed against live DB | ✓ VERIFIED | 21-08-SUMMARY Task 2: generating → awaiting_review observed live, creditsUsed=30, transient-error non-wedge proven (bogus task id → HTTP 400 → row stayed generating), rows cleaned up. Discovery: test-mode key rejects print/analyze/repair/multi-color — recorded in SMOKE ground-truth |
| 39 | Admin-guide article exists (workflow, credits, 3-day rule) | ✓ VERIFIED | src/content/admin-guide/products/meshy-3d-generation.md (13 credits/Bambu mentions); registered in admin-guide-generated.ts |
| 40 | 21-SMOKE.md numbered checklist incl. prod-only items | ✓ VERIFIED | 24 items: Part A 1-17 dev, Part B 18-24 explicitly human-only/real-credit, Bambu Studio import covered |

**Score:** 40/40 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/lib/db/schema.ts` | meshyGenerations + meshyRevisions mirror | ✓ VERIFIED | Lines 722-877; wired (imported by pipeline, actions, sweep) |
| `scripts/phase21-migrate.cjs` | Idempotent charset-probed applicator | ✓ VERIFIED | Syntax-checked; actually run twice against live dev DB |
| `src/lib/meshy/types.ts` | Types + parse helpers + credit constants | ✓ VERIFIED | 153 lines; imported by client-safe and server code |
| `src/lib/meshy/client.ts` | Server-only typed Meshy wrapper | ✓ VERIFIED | server-only line 1; all endpoints; moderation:true default |
| `src/lib/meshy/storage.ts` | Private storage + asset downloader | ✓ VERIFIED | Traversal-guarded; relative paths in DB; data-URI transport |
| `src/lib/meshy/pipeline.ts` | advanceGeneration state machine | ✓ VERIFIED | 543 lines; all 5 active branches; download-before-advance on all 4 SUCCEEDED branches |
| `src/actions/admin-meshy.ts` | 9 requireAdmin-first actions | ✓ VERIFIED | Verifier passes; rate limits on revise/repair/multicolor; balance guards |
| `src/app/api/admin/meshy/[id]/download/route.ts` | Authed binary streamer | ✓ VERIFIED | 5-kind allowlist; branded not-ready page for stl/3mf; 404 JSON for element srcs |
| `scripts/meshy-sweep.ts` | 5-min reconciliation cron | ✓ VERIFIED | Third-caller pattern; proven runnable under tsx |
| `src/components/admin/admin-meshy-*.tsx` (6 files) | Badge, upload form, viewer, printability card, revision history, detail cockpit | ✓ VERIFIED | All substantive, all wired into pages |
| `src/app/(admin)/admin/meshy/{page,new/page,[id]/page}.tsx` | List / upload / detail routes | ✓ VERIFIED | force-dynamic, noindex, requireAdmin belt-and-braces on all three |
| `src/content/admin-guide/products/meshy-3d-generation.md` | Admin how-to | ✓ VERIFIED | Registered in admin-guide-generated.ts |
| `21-DEPLOY-NOTES.md` / `21-SMOKE.md` | Cutover checklist / human checklist | ✓ VERIFIED | Live-verified appdirs; 24-item two-part checklist |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| phase21-migrate.cjs | schema.ts | SHOW CREATE TABLE round-trip | ✓ WIRED | Live proof captured; drift gate clean |
| storage.ts | client.ts | downloadMeshyAsset before expiry | ✓ WIRED | Pipeline invokes on every SUCCEEDED task |
| admin-meshy.ts | pipeline.ts | pollGeneration → advanceGeneration | ✓ WIRED | admin-meshy.ts:247 |
| pipeline.ts | storage.ts | persistModelAssets → downloadMeshyAsset | ✓ WIRED | pipeline.ts:87-126, called from 4 branches |
| download route | storage.ts | resolveStoragePath traversal guard | ✓ WIRED | route.ts:151 on every read |
| meshy-sweep.ts | pipeline.ts | relative import, no @/ alias | ✓ WIRED | sweep.ts:35; proven under tsx |
| new/page.tsx | admin-meshy.ts | upload form FormData → createGeneration | ✓ WIRED | upload-form.tsx:68 |
| detail.tsx | admin-meshy.ts | poll/approve/revise/repair/multicolor/cancel | ✓ WIRED | All six actions imported and invoked |
| model-viewer.tsx | download route | file=glb / file=source (session cookies) | ✓ WIRED | viewer.tsx:39, :55 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| list page | rows | listGenerations → db.select + batched revision counts | Yes (manual hydration, no LATERAL) | ✓ FLOWING |
| detail cockpit | gen | getGeneration (RSC seed) + pollGeneration/getGeneration (client refresh) → live DB | Yes | ✓ FLOWING |
| printability card | report | printabilityReport parsed from analyze results written by pipeline | Yes | ✓ FLOWING |
| download route | buf | fs.readFile of DB-stored relative paths written by downloadMeshyAsset | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| requireAdmin-first on all 9 actions | plan 21-03 node verifier | `requireAdmin-first OK (9 exports)` | ✓ PASS |
| Migration script syntax | `node --check scripts/phase21-migrate.cjs` | OK | ✓ PASS |
| Full typecheck at HEAD (incl. WR-01 fix) | `npx tsc --noEmit` | TSC_OK | ✓ PASS |
| API-key containment | grep battery | key only in client.ts; no NEXT_PUBLIC_MESHY; no meshy.ai in UI | ✓ PASS |
| Live pipeline run | (from 21-08 walkthrough) | generating → awaiting_review on live DB; non-wedge on bogus task id | ✓ PASS (executed during 21-08; not re-run — requires SSH tunnel) |

### Requirements Coverage

| Requirement | Source Plan(s) | Status | Evidence |
| ----------- | -------------- | ------ | -------- |
| REQ-21-1 schema + migration | 21-01 | ✓ SATISFIED | Tables live on dev DB, mirror verified, idempotent |
| REQ-21-2 server-only client + private storage + download-before-advance | 21-02, 21-03 | ✓ SATISFIED | All four SUCCEEDED branches guarded (incl. WR-01 fix in 1eabdca) |
| REQ-21-3 createGeneration guardrails | 21-02, 21-03 | ✓ SATISFIED | jpeg/png + 10MB + 600-char client & server + moderation:true + balance guard |
| REQ-21-4 advanceGeneration + poll + cron sweep | 21-03, 21-05 | ✓ SATISFIED (code) | Single state machine, 6s poll, bounded sweep proven under tsx. Crontab registration itself is a deploy op → human item 2 |
| REQ-21-5 retexture/regenerate revisions | 21-03, 21-07 | ✓ SATISFIED | COUNT(*)+1 live, 3-day guard server (RETEXTURE_EXPIRED) + client (disabled/tooltip), regenerate fallback with full-price confirm |
| REQ-21-6 free analyze on approve; explicit-click repair | 21-03, 21-07 | ✓ SATISFIED | Approve never chains repair; post-repair chain is FREE analyze; repair button gated in card only |
| REQ-21-7 multi-color 3MF | 21-03, 21-07 | ✓ SATISFIED | max_colors 1-16 / max_depth 3-6 validated; 3MF only from print/multi-color |
| REQ-21-8 authed download route | 21-04 | ✓ SATISFIED | requireAdmin first await; allowlist-keyed DB paths; attachment/inline split |
| REQ-21-9 admin UI per UI-SPEC | 21-06, 21-07, 21-08 | ✓ SATISFIED | List/new/[id] all live; state matrix implemented; guide article + smoke checklist shipped |

No orphaned requirements: REQUIREMENTS.md Phase 21 section contains exactly REQ-21-1..9; every ID is claimed by at least one plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No TODO/FIXME/placeholder/stub patterns in any Phase 21 file | — | — |

Previously documented review findings (21-REVIEW.md) are NOT re-flagged: WR-01 was fixed post-review in `1eabdca` (verified landed correctly — pipeline.ts:416-421 mirrors the other three branches). WR-02 (spend-before-insert ordering), WR-03 (no rate limit on createGeneration), WR-04 (TOCTOU double-spend) and IN-01..04 are accepted follow-up hardening per the review disposition, not phase blockers.

### Human Verification Required

#### 1. SMOKE Part A — dev UI walkthrough (test-mode key, zero cost)

**Test:** Run 21-SMOKE.md items 1-17 on dev (app.3dninjaz.com) as a logged-in admin.
**Expected:** All 17 pass; item 10 (Approve) fails gracefully with "Could not start printability analysis. Try again shortly." — this is correct dev behavior (Meshy's test-mode key rejects print/analyze).
**Why human:** Visual rendering, live polling, browser download behavior, and session-cookie element srcs are not statically verifiable.

#### 2. Sweep cron registration + closed-tab check

**Test:** Register the `*/5` crontab line on dev per 21-DEPLOY-NOTES.md §3 (or run the sweep once by hand via SSH), then run SMOKE item 14.
**Expected:** An orphaned in-flight row advances without any client polling; sweep log shows `[meshy-sweep]` lines.
**Why human:** One-time server op deliberately deferred (dev-first policy); code-level sweep proof already captured.

#### 3. SMOKE Part B — prod-gated real-credit run

**Test:** After user approves Part A and prod cutover (real MESHY_API_KEY, MESHY_STORAGE_DIR, mkdir per 21-DEPLOY-NOTES.md), run items 18-24: real model, Approve → ready with real printability data, repair flow, STL in Bambu Studio, multi-color 3MF with color regions, credit reconciliation, 3-day retexture window (record findings into 21-CONTEXT.md).
**Expected:** All pass; downloads open cleanly in Bambu Studio.
**Why human:** Spends real money; requires Bambu Studio; external-service quality judgment.

### Gaps Summary

No gaps. Every plan-frontmatter must-have was verified directly against source at HEAD of `docs/phase21-plans` (including the post-review WR-01 fix in `1eabdca`), all nine roadmap requirements are satisfied at code level, all key links are wired with real data flowing, and the full-repo typecheck was independently re-run clean. What remains is exactly the human-gated verification the phase itself planned for: the dev smoke walkthrough (Part A), the one-time sweep cron registration, and the prod-gated real-credit run (Part B) — the last two being deploy/spend decisions that belong to the developer by design.

---

_Verified: 2026-07-08_
_Verifier: Claude (gsd-verifier)_
