# Phase 21 Context: Admin Meshy AI 3D Generation Tool

**Gathered:** 2026-07-07
**Status:** Ready for planning
**Informed by:** `.claude/skills/meshy-3d-pipeline/` (project skill, installed 2026-07-07)

<domain>
## Task Boundary

Admin-only internal tool (not customer-facing): admin uploads a reference photo, generates a textured 3D model via Meshy's Image-to-3D API, reviews it, requests revisions if needed, approves, runs printability analyze/repair, and downloads STL (+3MF if multi-color) for Bambu Studio slicing/printing.

Fulfills the "AI-powered custom 3D generation (via Meshy API)" future milestone named in root CLAUDE.md — scoped to the admin-internal photo→print-ready-file tool only. Customer-facing self-serve customization remains a separate future milestone.
</domain>

<decisions>
## Implementation Decisions

### Printability (analyze/repair)
- `print/analyze` (free) runs on every approval — no reason not to, zero cost, one more call in the same task pattern as generation.
- `print/repair` (10cr) does NOT auto-run when analyze flags warning/error — **show the admin a "Repair this model? (10 credits)" button and wait for an explicit click.** (User decision, overrides Fable's auto-chain recommendation.)

### Revision workflow
- **Retexture (10cr, same geometry/new look) included in v1**, with a `meshy_revisions` child table tracking each round (revisionNumber via real COUNT(*), not a stored counter). Cheaper iterate path than a full regenerate for the most common miss (wrong look, right shape).
- Remesh explicitly deferred — repair mostly covers what it'd fix for printability purposes.
- Regenerate (fresh full attempt) is always available as the fallback when geometry itself is wrong.

### Multi-color 3MF
- **Included** — `print/multi-color` (10cr, `max_colors` 1-16, `max_depth` 3-6, 3MF-only output) is in v1 scope. (User decision, overrides Fable's "defer, wasn't asked for" recommendation.)
- Note: a *colored* 3MF only ever comes from this endpoint, NOT from requesting `3mf` in `target_formats` on the generation call itself (that's opt-in but carries no color regions).

### Async handling: polling, not webhook
- Client-side polling (5-8s while admin has the tab open) + a 5-minute cron reconciliation sweep (reusing the existing watchdog-cron pattern) for closed-tab orphans.
- Reasoning: at ~20-45 generations/month, Meshy's rate-limit-headroom argument for webhooks doesn't apply. Meshy's webhook has no signing at all; this repo already tolerates unsigned webhooks in one place (`src/app/api/webhooks/delyva/route.ts`, warns but accepts), so it's not a hard policy violation, but there's no benefit at this volume to justify the extra unsigned public endpoint plus a wrinkle where dev and prod would receive each other's task events (one Meshy account, 5 webhook slots total, no per-request scoping).
- Deferred to v2, cheap to add later: the whole pipeline is designed around one shared `advanceGeneration(id)` state-machine function, called by the poll action and the cron sweep today — a webhook route later is just a third caller of the same function, no rework.

### Dev environment
- **Test-mode key on dev** (`msy_dummy_api_key_for_test_mode_12345678`) — zero cost, instant fake successes, good for UI/flow testing. Dev will never produce a real downloadable model; that's expected and accepted.
- Real key on prod only.

### 3-day asset expiry (hard constraint, newly discovered via the skill — was NOT known during the original planning pass)
- Meshy deletes generated files 3 days after task completion (non-Enterprise plans). Every `SUCCEEDED` task (generation, retexture, repair, multicolor) MUST have its files downloaded to our own private storage in the same async flow, BEFORE advancing workflow state — never treat Meshy's returned URLs as long-term storage. The admin review/approval cycle can easily exceed 3 days.
- Retexture's `input_task_id` reliability past the 3-day mark is unverified by the skill — assume retexture only works reliably within 3 days of the source task; UI should fall back to regenerate after that window. **Verify this against the real API early during build.**

### Schema (locked, see full column list in the replan findings / SUMMARY of this session)
- `meshy_generations`: workflow-stage status enum (generating/awaiting_review/revising/analyzing/repairing/processing_multicolor/ready/failed/canceled), per-stage task-id columns (meshyTaskId = current model's task, meshyAnalyzeTaskId, meshyRepairTaskId, meshyMulticolorTaskId), printabilityStatus + printabilityReport JSON, isMultiColor bool, localModelFiles JSON (glb/stl/threeMf paths), creditsUsed running total, nullable productId (open question — see below).
- `meshy_revisions`: one row per retexture/regenerate round, real COUNT(*)-based revisionNumber, endpointUsed enum (retexture/regenerate/remesh-reserved), changeNote, newTexturePrompt, meshyTaskId, creditsUsed.
- DDL via raw SQL + `SHOW CREATE TABLE` verification per this repo's convention (no `drizzle-kit push` against remote). Manual multi-query hydration for parent+child reads (MariaDB has no LATERAL).

### File/route surface (locked, matches repo's actual Server Action + Route Handler convention — verified against `src/app/api/webhooks/delyva/route.ts` and `src/app/api/admin/orders/[id]/label/route.ts` precedents)
- `src/lib/meshy/client.ts` — typed wrapper adapted from the skill's `scripts/meshy-client.ts`
- `src/lib/meshy/pipeline.ts` — `advanceGeneration(id)`, the one state machine
- `src/lib/meshy/storage.ts` — private storage path helper, outside `public/`
- `src/actions/admin-meshy.ts` — `createGeneration`, `pollGeneration`, `listGenerations`/`getGeneration`, `requestRevision`, `approveGeneration`, `repairGeneration` (new — explicit-click repair per the decision above), all `requireAdmin()`-first
- `src/app/api/admin/meshy/[id]/download/route.ts` — GET, streams file from private storage, Route Handler because Server Actions can't stream binary
- `scripts/meshy-sweep.ts` — 5-min cron, orphan reconciliation
- Admin UI: `/admin/meshy` list + `/admin/meshy/[id]` detail (`<model-viewer>` over the LOCAL glb, never Meshy's expiring URL; analyze report card; explicit repair button; revision history; download buttons for STL and, when multicolor was run, 3MF)

</decisions>

<specifics>
## Specific Ideas

Pre-flight upload guardrails to build into `createGeneration` (from skill SKILL.md §3, near-free to add): reject/warn on multi-subject or cluttered-background photos (`image_too_complex` risk), enforce the 600-char texture prompt cap client+server side, default `moderation: true` on every call.

`GET /openapi/v1/balance` should be checked before allowing a new generation once the monthly credit estimate is getting close to the cap (see open question on the cap number itself).
</specifics>

<canonical_refs>
## Canonical References

- `.claude/skills/meshy-3d-pipeline/SKILL.md` and its `references/*.md` — primary build reference, read before implementing any Meshy-touching code
- `.claude/skills/meshy-3d-pipeline/scripts/meshy-client.ts` — starting point for `src/lib/meshy/client.ts`
- `src/app/api/webhooks/delyva/route.ts` — this repo's existing webhook-route convention (unsigned-payload precedent)
- `src/app/api/admin/orders/[id]/label/route.ts` — this repo's existing authenticated binary-download Route Handler convention
</canonical_refs>

<deferred>
## Open Questions Still Unresolved (surface again at /gsd-plan-phase or /gsd-discuss-phase time)

1. **Credit budget reality check.** Realistic cost per accepted model is now ~30-70cr (20-30 generate + 10 repair on most AI meshes + 10 per look-revision + 10 multicolor, all now confirmed in-scope) — not the ~20cr assumed in the original pass. On 1000cr/mo (Pro plan) that's roughly 15-25 finished models/month including iteration and multi-color. Is that enough? Should the soft cap hard-block new generations or just warn?
2. **Link generations to catalog products?** Schema carries a nullable `product_id`. Useful if the goal is "generate the model *for* product X"; noise if this is a standalone workbench. Confirm or drop before the DDL is finalized.
</deferred>
