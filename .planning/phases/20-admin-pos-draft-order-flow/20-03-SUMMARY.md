---
phase: 20-admin-pos-draft-order-flow
plan: "03"
subsystem: file-io
tags: [payment-proof, file-upload, sharp, exif-strip, thumbnail, pdpa]
dependency_graph:
  requires: []
  provides:
    - writePaymentProof helper (used by Plan 20-06 public token-upload action and Plan 20-07 admin upload action)
  affects: []
tech_stack:
  added: []
  patterns:
    - sharp EXIF strip via .rotate().withMetadata({ exif: {} })
    - Discriminated result union (ok: true | ok: false)
    - orderId path-traversal sanitization (replace /[^a-zA-Z0-9-]/g, "")
    - Non-fatal thumbnail failure with console.warn fallback
key_files:
  created:
    - src/lib/payment-proof-storage.ts
  modified: []
decisions:
  - "D-09 honored: payment-proof-storage is a sibling module to image-pipeline.ts; does NOT import from it"
  - "D-10 enforced: 10 MB cap + MIME allowlist checked before any filesystem write"
  - "PDF inputs receive thumbnailUrl=null; thumbnail failure is non-fatal"
metrics:
  duration_minutes: 12
  completed: "2026-05-17T13:32:55Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 1
---

# Phase 20 Plan 03: Payment Proof Storage Helper Summary

**One-liner:** writePaymentProof helper storing payment slips with sharp EXIF strip + 256px WebP thumbnail, PDF passthrough, 10 MB cap, and MIME allowlist.

## What Was Built

`src/lib/payment-proof-storage.ts` — standalone server-only file-I/O helper for writing payment slip uploads to disk. Produces a discriminated result union `WritePaymentProofResult` (`ok:true | ok:false`).

**Key behaviors:**
- Accepts `File | Blob` with `.type` and `.arrayBuffer()`
- Rejects: missing/invalid file, MIME outside allowlist, size > 10 MB
- Writes original to `public/uploads/payment-proofs/<safe-orderId>/<uuid>.<ext>`
- For image MIME types: generates 256px-wide transparent-bg WebP thumbnail via sharp (`<uuid>.thumb.webp`), strips EXIF (PDPA safeguard)
- For `application/pdf`: passes original through, `thumbnailUrl: null`
- Thumbnail failure is non-fatal — logs `console.warn` and returns `thumbnailUrl: null`
- Path-traversal double guard: orderId sanitized + `baseDir.startsWith(root)` assertion
- Env-var conventions (`UPLOADS_DIR`, `UPLOADS_PUBLIC_PREFIX`) match `src/lib/storage.ts`

## Deviations from Plan

None — plan executed exactly as written.

## Tasks

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Author src/lib/payment-proof-storage.ts | 2f2923e |
| 2 | Commit Plan 20-03 | 2f2923e |

## Acceptance Criteria Verification

- `server-only` import: line 1
- `MAX_BYTES = 10 * 1024 * 1024`: line 29
- All 6 MIME values present: image/jpeg, image/png, image/webp, image/heic, image/heif, application/pdf
- `.withMetadata({ exif: {} })`: line 133
- `.rotate()`: line 132
- `export async function writePaymentProof`: line 77
- `replace(/[^a-zA-Z0-9-]/g, "")`: line 99
- TypeScript: zero errors in payment-proof-storage.ts (pre-existing errors in other files are out-of-scope, from Plan 20-01 schema changes)

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary changes. This is a pure server-side filesystem helper with server-only import guard.

## Self-Check: PASSED

- File exists: `src/lib/payment-proof-storage.ts` — confirmed
- Commit 2f2923e exists: confirmed (`git log -1 --pretty=%s` = `feat(20-03): add payment-proof storage helper with EXIF strip + thumbnail`)
