---
phase: 19
plan: "02"
subsystem: lib
tags: [helpers, zod, json-parsing, tdd, made-to-order]
dependency_graph:
  requires: [19-01]
  provides: [ensureConfigJson, ensureTiers, ensureImagesV2, ensureConfigurationData, lookupTierPrice]
  affects: [src/lib/config-fields.ts, src/lib/__tests__/config-fields.test.ts]
tech_stack:
  added: [vitest@4.1.5]
  patterns: [zod-schema-dispatch, fail-soft-parse, tdd-red-green]
key_files:
  created:
    - src/lib/config-fields.ts
    - src/lib/__tests__/config-fields.test.ts
  modified: []
decisions:
  - "vitest installed as dev dependency — project had no test runner; plan spec required vitest or tsx fallback; vitest chosen for full describe/it API"
  - "ensureConfigJson throws on failure (callers wrap in try/catch) — ensureConfigurationData fails-soft (returns null) to protect order detail rendering from corrupt DB rows"
  - "ColourFieldConfigSchema uses z.string().min(1) not z.string().uuid() — real colour IDs are not UUID format in Phase 18 (legacy rows may have arbitrary IDs)"
  - "ConfigurationDataSchema inlined in ensureConfigurationData (not exported) — only the parse function is the public API; Zod type inference happens internally"
metrics:
  duration: "~10 min"
  completed: "2026-04-26"
  tasks_completed: 1
  files_changed: 3
---

# Phase 19 Plan 02: Config-Fields Helpers Library Summary

**One-liner:** Zod-validated JSON parse helpers for all made-to-order LONGTEXT round-trips — ensureConfigJson dispatches by fieldType, ensureTiers/ensureImagesV2/ensureConfigurationData fail-soft, lookupTierPrice returns null when outside tier table.

## Tasks Completed

| # | Task | Commit | Key Output |
|---|------|--------|-----------|
| 1 (RED) | Failing vitest test suite | f4098bd | 20 test cases, all failing (module not found) |
| 1 (GREEN) | src/lib/config-fields.ts implementation | 4f86858 | 275 LOC, 20/20 tests pass |

## Acceptance Criteria

- [x] src/lib/config-fields.ts exists with 6 named function exports + 4 schema exports + 5 type exports (17 total `export` lines)
- [x] `grep -n "export"` returns ≥10 (17)
- [x] `grep -n "z.object"` returns ≥4 (6)
- [x] `grep -n "JSON.parse"` returns ≥3 (4)
- [x] Test file exists at src/lib/__tests__/config-fields.test.ts with ≥12 it() blocks (20)
- [x] 20/20 vitest tests pass (`npx vitest run src/lib/__tests__/config-fields.test.ts`)
- [x] `npx tsc --noEmit` passes
- [x] File ≤300 LOC (275)

## TDD Gate Compliance

- [x] RED gate: test(phase-19-02) commit f4098bd — tests fail with module-not-found error
- [x] GREEN gate: feat(phase-19-02) commit 4f86858 — 20/20 tests pass

## Deviations from Plan

**[Rule 3 - Deviation] vitest installed as devDependency**
- Found during: Task 1 setup
- Issue: Project had no test runner; plan specified vitest as the preferred runner
- Fix: `npm install --save-dev vitest` — added package.json devDependency
- Files modified: package.json, package-lock.json

## Self-Check: PASSED

- [x] src/lib/config-fields.ts exists (275 LOC)
- [x] src/lib/__tests__/config-fields.test.ts exists (165 LOC)
- [x] commit f4098bd exists (RED)
- [x] commit 4f86858 exists (GREEN)
- [x] tsc --noEmit passes
- [x] 20/20 vitest tests pass
