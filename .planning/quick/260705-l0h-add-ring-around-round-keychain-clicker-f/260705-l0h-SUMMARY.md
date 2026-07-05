---
phase: quick-260705-l0h
plan: 01
subsystem: storefront-keychain-preview
tags: [keychain, round-shape, css-preview, visual-detail]
dependency-graph:
  requires: [quick-260705-azw]
  provides: [round-keychain-clicker-rim]
  affects: [src/components/store/keychain-preview.tsx]
tech-stack:
  added: []
  patterns: ["shape-gated additive JSX block (no z-index; DOM-order paint layering)"]
key-files:
  created: []
  modified:
    - src/components/store/keychain-preview.tsx
decisions:
  - "Ring div placed immediately before the inset clicker face div (not after) so DOM paint order naturally lets the smaller inset:5 clicker face cover the larger inset:3 ring, leaving a ~2px letterHex rim visible — no z-index needed."
metrics:
  duration: "~10 min"
  completed: "2026-07-05"
---

# Phase quick-260705-l0h Plan 01: Add ring around round keychain clicker face Summary

Added a thin (~2px) letter-coloured rim around the inset clicker face on the ROUND keychain PDP preview, matching the reference bead-keychain photo, via a single additive `shape === "round"`-gated div in `keychain-preview.tsx`.

## What Was Built

In `src/components/store/keychain-preview.tsx`, inserted a new absolutely-positioned div immediately before the existing "Inset clicker face" div, inside the per-cube map callback:

```tsx
{/* Round-only: letter-coloured rim around the clicker face (quick 260705-l0h) */}
{shape === "round" && (
  <div
    style={{
      position: "absolute",
      inset: 3,
      borderRadius: "50%",
      background: letterHex,
    }}
  />
)}
```

- Gated strictly to `shape === "round"` — the square path renders nothing extra.
- `inset: 3` (2px larger radius than the clicker face's `inset: 5`) so the rim peeks out ~2px around the clicker face edge.
- No z-index added — relies purely on DOM order: this ring div paints first (behind), then the clicker face (`inset: 5`) paints on top of it, then the letter glyph (`zIndex: 2`) stays on top of both.
- Uses the existing `letterHex` prop (already in scope) — no new prop plumbing needed.

## Verification

- `npx tsc --noEmit` — clean, no errors.
- `git diff src/components/store/keychain-preview.tsx` reviewed: confirms the change is a pure 12-line insertion with zero modifications to any pre-existing line. The square rendering path (side-tab, inset clicker face div, letter glyph, `bodyRadius`/`insetRadius`/`ringRadius` computation, swatch/placeholder logic, sizing/font expressions) is byte-identical to before.

## Deviations from Plan

None - plan executed exactly as written.

## Visual Verification Status

**PENDING** — per plan, the `checkpoint:human-verify` task requires live Playwright screenshots on dev (`app.3dninjaz.com`) comparing:
1. ROUND product (`/products/clicker-mr73pik6`) — expect visible letter-coloured rim around each clicker face.
2. SQUARE product (`/products/pancake-clicker-mogqlfp6`) — expect no visual change.

This executor did not attempt browser automation (out of scope per orchestrator instruction). Visual verification will be performed by the orchestrator/main session after this commit is pushed and deployed to dev via the existing CI auto-deploy pipeline.

## Self-Check

```
FOUND: src/components/store/keychain-preview.tsx (ring div present, gated shape === "round")
FOUND: 2f42043 (feat(quick-260705-l0h) commit)
```

## Self-Check: PASSED
