---
phase: 260705-n1x
plan: 01
subsystem: storefront-keychain-preview
tags: [keychain, round-shape, css, quick-task]
dependency-graph:
  requires: [260705-l0h]
  provides: ["round clicker face inward border rim"]
  affects: [src/components/store/keychain-preview.tsx]
tech-stack:
  added: []
  patterns: ["shape-gated inline style branch (shape === 'round' ? ... : 'none')"]
key-files:
  created: []
  modified:
    - src/components/store/keychain-preview.tsx
decisions:
  - "Border drawn directly on the existing inset clicker face div rather than as a separate div behind it, so the rim reads as trim on the face instead of a shadow layer behind the base bevel."
  - "boxSizing: 'border-box' applied unconditionally (both shapes) since it is a documented no-op for square (no existing border/padding on that div to redistribute)."
metrics:
  duration: "~5 min"
  completed: "2026-07-05"
---

# Phase 260705-n1x Plan 01: Fix round clicker ring to sit on top of clicker face Summary

**One-liner:** Replaced the separate letter-coloured ring div (from quick 260705-l0h) with a `border: shape === "round" ? \`2px solid ${letterHex}\` : "none"` + `boxSizing: "border-box"` directly on the existing inset clicker face div, so the rim draws inward on the face itself instead of as a shadow layer behind the base.

## What Was Built

In `src/components/store/keychain-preview.tsx`, inside the cube-map body:

1. Deleted the standalone `{shape === "round" && (<div style={{ position: "absolute", inset: 3, borderRadius: "50%", background: letterHex }} />)}` block (added in quick 260705-l0h) — this div sat behind the clicker face and, per live zoomed screenshot, blended into the base body's bevel/highlight box-shadow rather than reading as trim on the clicker.
2. Added two properties to the existing "Inset clicker face" div's style object:
   - `border: shape === "round" ? \`2px solid ${letterHex}\` : "none"` — round gets a letter-coloured 2px border; square gets an explicit `"none"` (no-op, matches the browser default computed style for a div with no border).
   - `boxSizing: "border-box"` — applied to both shapes. For round, this makes the 2px border draw inward within the existing `inset: 5` footprint (same outer size as before). For square, since there's no border or padding on this div, `border-box` vs `content-box` produces an identical computed layout — verified as a true no-op.

No other divs, the letter glyph, side-tab, geometry vars (`bodyRadius`/`insetRadius`/`ringRadius`), or the outer body div were touched.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit` — clean, no errors.
- `git diff` reviewed before commit: confirmed the deleted block matches the plan's exact target block, and the added properties are exactly `border` + `boxSizing` on the clicker face div only. No other lines changed.

## Human Verification — SKIPPED (deferred to orchestrator)

This executor has no browser automation available. The plan's `checkpoint:human-verify` task (Playwright screenshot comparison of round product `clicker-mr73pik6` and square product `pancake-clicker-mogqlfp6` on app.3dninjaz.com after dev auto-deploy) was **not run** in this session.

**Action required:** The orchestrator (main session) should perform the Playwright visual check once this commit has pushed and deployed to dev:
1. Round product — https://app.3dninjaz.com/products/clicker-mr73pik6 — confirm the letter-coloured ring now reads as a border/trim ON the clicker face (not a shadow layer behind the base).
2. Square product — https://app.3dninjaz.com/products/pancake-clicker-mogqlfp6 — confirm NO visual change from before.

## Self-Check: PASSED

- FOUND: src/components/store/keychain-preview.tsx (modified, contains `boxSizing` and `shape === "round"` border gate)
- FOUND: commit 081819f (`git log --oneline` confirms it exists on `chore/accounting-to-dev`)
