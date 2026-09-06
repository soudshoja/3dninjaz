---
phase: 21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-
plan: 04
subsystem: api
tags: [nextjs, route-handler, meshy, streaming, download, requireAdmin]

# Dependency graph
requires:
  - phase: 21-01
    provides: meshy_generations schema (sourceImagePath, localThumbnailPath, localModelFiles JSON)
  - phase: 21-02
    provides: src/lib/meshy/storage.ts (resolveStoragePath traversal guard)
  - phase: 21-03
    provides: src/lib/meshy/pipeline.ts (getGenerationRow — parsed-JSON single-row read)
provides:
  - "GET /api/admin/meshy/[id]/download?file=stl|3mf|glb|source|thumb — the one Route Handler of the phase, streaming binary bytes from private meshy storage to a logged-in admin"
affects: [21-05, 21-06, 21-07, 21-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route Handler binary streaming for admin-only private storage (Server Actions can't stream binary) — mirrors src/app/api/admin/orders/[id]/label/route.ts's requireAdmin-first + branded-HTTP-200-not-ready-page convention"
    - "?file= query param as an allowlist KEY only — it selects which DB-backed row field to read, never contributes to a filesystem path; resolveStoragePath's traversal guard still runs on every read"

key-files:
  created:
    - src/app/api/admin/meshy/[id]/download/route.ts
  modified: []

key-decisions:
  - "Whole handler body wrapped in try/catch: requireAdmin() throwing Error('Forbidden') is caught and turned into a 403 JSON response (matches this repo's requireAdmin() contract of throwing rather than returning a discriminated union, since Route Handlers don't get the Server Action ok/error convention for free)"
  - "Attachment vs inline split: stl/3mf use Content-Disposition: attachment (admin clicks a real download button — deliberate divergence from the label route's inline-in-a-new-tab pattern, per the plan's explicit must_haves truth); glb/source/thumb stay inline since they're <model-viewer>/<img> element src values, not user-initiated downloads"
  - "Not-ready UX split by call site: stl/3mf (reached via an <a> click) get the label route's branded HTTP-200 'file not ready yet' page so LiteSpeed's ErrorDocument rules don't swallow a plain error body; glb/source/thumb (programmatic element src fetches) get a plain 404 JSON so the element just fails to load without navigating the admin anywhere"
  - "fs.readFile's Buffer had to be wrapped in `new Uint8Array(buf)` before handing it to `new NextResponse(...)` — see Deviations"

patterns-established:
  - "Any future private-storage download route in this repo should copy this file's shape: requireAdmin-first try/catch -> 403, explicit file-kind allowlist -> 400, DB row lookup -> 404, field-to-relpath switch -> resolveStoragePath -> fs.readFile, attachment/inline split by caller intent"

requirements-completed: [REQ-21-8]

# Metrics
duration: ~10min
completed: 2026-07-07
---

# Phase 21 Plan 04: Authed Meshy Download Route Summary

**GET /api/admin/meshy/[id]/download streams STL/3MF/GLB/source-photo/thumbnail bytes from private meshy storage behind requireAdmin(), with stl/3mf forced to `attachment` disposition and glb/source/thumb left `inline` for `<model-viewer>`/`<img>` src use.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-07-07
- **Tasks:** 2/2 completed (Task 2's "Commit" step was already satisfied by Task 1's commit — no separate commit was needed, mirroring Plan 21-03's precedent)
- **Files modified:** 1 created

## Accomplishments

- Shipped the one Route Handler of the phase: `src/app/api/admin/meshy/[id]/download/route.ts`, a GET endpoint that streams binary bytes from `src/lib/meshy/storage.ts`'s private, path-traversal-guarded storage to a logged-in admin
- `requireAdmin()` is the literal first `await` inside the handler, wrapped in a try/catch so a thrown `Error("Forbidden")` becomes a 403 JSON response rather than an unhandled 500
- `?file=` is validated against an exact 5-value allowlist (`stl|3mf|glb|source|thumb`) via a type-guard function (`isFileKind`) — the param is only ever used as a lookup KEY into the DB row's own stored relative-path fields (`localModelFiles.{stl,threeMf,glb}`, `sourceImagePath`, `localThumbnailPath`); it never contributes a single character to a filesystem path
- `resolveStoragePath()` (Plan 21-02's traversal guard) runs on every read before `fs.readFile`, so even a corrupted/malicious DB row value can't escape `MESHY_STORAGE_DIR`
- Content-Disposition split exactly as the plan's must-haves require: `stl`/`3mf` → `attachment; filename="meshy-{id}.{ext}"` (real browser download); `glb`/`source`/`thumb` → `inline` (viewer/img element src)
- Content-Type per kind: `stl` → `application/octet-stream`, `3mf` → `application/vnd.ms-package.3dmanufacturing-3dmodel+3mf`, `glb` → `model/gltf-binary`, `source`/`thumb` → `image/png` or `image/jpeg` sniffed from the stored file's extension
- Branded HTTP-200 "file not ready yet" page (copied from the orders label route's LiteSpeed-ErrorDocument-avoidance pattern) for `stl`/`3mf` when the mapped path is null or the file isn't on disk yet — since the admin reaches this route via a plain `<a>` click; `glb`/`source`/`thumb` return plain 404 JSON instead, since those are programmatic element-src fetches that should just fail silently in the DOM
- `Cache-Control: private, no-store` on every successful binary response

## Task Commits

Each task was committed atomically:

1. **Task 1: Download Route Handler** - `d55b50d` (feat)
2. **Task 2: Commit** - satisfied by `d55b50d` above (the plan's Task 2 verify/acceptance criteria — commit message contains "21-04", `git log -1 --name-only` lists exactly the one new route file, no unexpected deletions — were already true after Task 1's commit; no separate commit was created)

## Files Created/Modified

- `src/app/api/admin/meshy/[id]/download/route.ts` - New authed binary-streaming Route Handler; `runtime = "nodejs"`, `dynamic = "force-dynamic"`; imports `requireAdmin` (Plan 0 auth helper), `getGenerationRow` (Plan 21-03 pipeline), `resolveStoragePath` (Plan 21-02 storage)

## Decisions Made

- **try/catch scope:** wrapped the entire handler body (not just the `requireAdmin()` call) in one try/catch, per the plan's explicit instruction ("wrap whole handler body so a thrown Forbidden becomes a 403 JSON response via try/catch"). All other early-return branches (invalid file, not found, not ready, invalid path) are plain `return` statements inside the try block, not thrown errors — only `requireAdmin()`'s `Error("Forbidden")` and any genuinely unexpected exception fall through to the catch, which distinguishes the two (403 for Forbidden, 500 + `console.error` for anything else).
- **Attachment vs inline:** followed the plan's explicit divergence instruction (stl/3mf = attachment, glb/source/thumb = inline) rather than the label route's blanket `inline` — this is a deliberate, plan-specified difference from the closest analog, not an oversight.
- **Not-ready page reuse:** copied the label route's `notReadyPage`/`escapeHtml` shape verbatim (same brand hex literals, same HTTP-200-to-dodge-ErrorDocument reasoning) but scoped it to `stl`/`3mf` only, since `glb`/`source`/`thumb` are consumed by page elements (`<model-viewer>`, `<img>`) that should degrade gracefully on a 404 rather than receive an HTML page as their `src` response body.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `Buffer<ArrayBufferLike>` not assignable to `NextResponse`'s `BodyInit` parameter**
- **Found during:** Task 1, first `npx tsc --noEmit` run
- **Issue:** `new NextResponse(buf, { headers })` where `buf` came from `await fs.readFile(abs)` failed to type-check: `Argument of type 'Buffer<ArrayBufferLike>' is not assignable to parameter of type 'BodyInit | null | undefined'`. The repo's existing analogs (`label/route.ts`'s `Buffer.from(await upstream.arrayBuffer())`, `invoice.pdf/route.tsx`'s `Buffer.concat(chunks)`) both happen to produce a narrower `Buffer<ArrayBuffer>` type from their specific construction path, which DOM's `BodyInit` accepts; `fs.promises.readFile`'s return type is the wider `Buffer<ArrayBufferLike>` (compatible with `SharedArrayBuffer`), which `BodyInit` does not accept.
- **Fix:** Wrapped the buffer in `new Uint8Array(buf)` at the single call site (`return new NextResponse(new Uint8Array(buf), { headers });`), which satisfies `BodyInit` regardless of the backing buffer's generic parameter.
- **Files modified:** `src/app/api/admin/meshy/[id]/download/route.ts` (one line)
- **Verification:** `npx tsc --noEmit` exits 0; all plan acceptance-criteria greps re-run and pass
- **Committed in:** `d55b50d` (Task 1 commit — the fix was applied before the first commit, so no separate fix commit was needed)

---

**Total deviations:** 1 auto-fixed (1 bug — TypeScript type-narrowing mismatch between `fs.promises.readFile`'s `Buffer<ArrayBufferLike>` and DOM's `BodyInit` union, surfaced by this plan's specific read-from-disk-then-stream pattern; not present in any existing analog because they all construct their `Buffer` differently)
**Impact on plan:** Purely mechanical type-level fix. No behavior change — `new Uint8Array(buf)` is a zero-copy view over the same underlying bytes. No scope creep.

## Issues Encountered

None beyond the one auto-fixed deviation above.

## User Setup Required

None - no external service configuration required. This route reads only from the already-configured `MESHY_STORAGE_DIR` private storage root (Plan 21-02) and the already-live `meshy_generations` table (Plan 21-01).

## Next Phase Readiness

- The download route is live and ready for the Wave-3/4 admin UI plans (21-05 list+upload, 21-07 detail cockpit) to point at directly: `<model-viewer src="/api/admin/meshy/{id}/download?file=glb">`, thumbnail `<img src="...?file=thumb">`, generating-placeholder `<img src="...?file=source">`, and download buttons `<a href="...?file=stl">` / `<a href="...?file=3mf">` — all authenticated purely via the browser's existing session cookie, no additional plumbing required.
- No blockers for Plan 21-05 or any downstream plan. The route has zero dependencies on anything not already shipped in Plans 21-01/21-02/21-03.
- One thing worth flagging for whoever builds the detail cockpit (21-07): the "file not ready yet" branded page is HTML with HTTP 200, so if that route is ever fetched programmatically (e.g. `fetch()` instead of an `<a>`/`<model-viewer>` element) rather than navigated to, callers must not assume a 200 status means the binary payload was returned — check `Content-Type` first, or prefer the `glb`/`source`/`thumb` 404-JSON path's contract for anything fetch-driven.

---
*Phase: 21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-*
*Completed: 2026-07-07*

## Self-Check: PASSED

- FOUND: `src/app/api/admin/meshy/[id]/download/route.ts`
- FOUND: `.planning/phases/21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-/21-04-SUMMARY.md`
- FOUND commit: `d55b50d` (Task 1 + Task 2)
- `npx tsc --noEmit` exits 0
