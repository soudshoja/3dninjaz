---
phase: quick-260707-evn
verified: 2026-07-07T04:15:23Z
status: human_needed
score: 7/7 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open a keychain PDP on dev (square: pancake-clicker-mogqlfp6, round: clicker-mr73pik6), type a name, watch the hero"
    expected: "Hero cross-fades from CSS cubes to a lit 3D keycap row; glyphs update live while typing; round vs square bodies visually distinct; no blank/black canvas at any point"
    why_human: "Structural wiring is verified, but actual WebGL pixel output, cross-fade smoothness, and 3D visual quality cannot be confirmed by static code inspection; executor's Playwright screenshots were deleted after use and cannot be audited"
  - test: "In DevTools (Elements or Performance), count <canvas> elements on the PDP in the md-to-lg viewport range (thumbstrip AND mobile sticky strip simultaneously visible)"
    expected: "Exactly 1 canvas (hero only); thumbnail miniature and sticky strip are canvas-free CSS"
    why_human: "Grep proves only one component tree mounts a Canvas, but runtime confirmation across responsive breakpoints requires a browser"
  - test: "Resize the browser across the md/lg breakpoints and rotate a phone viewport with the hero visible"
    expected: "Canvas resizes with its container (no stretch/blur/clip) — RESEARCH.md Pitfall 2 (container-query sizing vs r3f ResizeObserver)"
    why_human: "Resize behavior depends on r3f's runtime ResizeObserver interacting with the containerType: inline-size wrapper; not statically verifiable"
  - test: "Open the PR to dev and let CI run; confirm 'Install + typecheck' is green and the dev deploy workflow's next build succeeds"
    expected: "Build passes with the four new r3f dependencies bundled (webpack build; Turbopack not involved)"
    why_human: "npx tsc --noEmit was independently re-run by the verifier (exit 0), but npm run build was not re-run locally (build requires DB access via SSH tunnel; branch is local-only so no CI evidence exists yet)"
---

# Quick Task 260707-evn: Realistic 3D Keychain Preview Verification Report

**Task Goal:** Realistic 3D preview (react-three-fiber) for keychain configurator PDP hero slot, replacing the CSS-cube preview — hero only, thumbnail + mobile sticky strip stay CSS.
**Verified:** 2026-07-07T04:15:23Z
**Status:** human_needed (all automated checks passed; visual/runtime confirmation outstanding)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Hero slot renders a real WebGL `<canvas>` 3D scene (meshes + lit materials + raised glyph) once mounted | ✓ VERIFIED (structural) | `configurable-product-view.tsx` L489 `previewSlot={heroPreviewNode}` → L424 `renderPreviewInner(true)` → L405 `KeychainPreview3D` → `keychain-preview-3d.tsx` L30 dynamic Scene → `keychain-preview-3d-scene.tsx` L200 `<Canvas>` with ambient + 2 directional lights, `meshStandardMaterial`, troika `<Text>` glyphs. Runtime pixels → human item 1 |
| 2 | Thumbstrip "Yours" miniature + mobile sticky strip still render CSS KeychainPreview — max 1 WebGL context | ✓ VERIFIED | Gallery thumbnail mini renders `{thumbSlot ?? previewSlot}` (`configurable-image-gallery.tsx` L346) fed `thumbSlot={thumbPreviewNode}` (L490) = `renderPreviewInner(false)` = CSS `KeychainPreview`; hero slide L204 unchanged (`{previewSlot}`); sticky strip (`configurable-product-view.tsx` L570) still a direct `<KeychainPreview>`. Repo-wide grep: `KeychainPreview3D` has exactly one consumer (product view L31/L405) — only the hero path can mount a Canvas |
| 3 | Typing/colour picks update hero 3D preview live from the same state driving thumbnail + sticky strip | ✓ VERIFIED (structural) | Both nodes built by shared `renderPreviewInner()` from the same `textValue`/`baseHex`/`clickerHex`/`letterHex`/`maxLength`/`placeholder`/`shape` values (L401-431); scene maps chars→meshes from props. `frameloop="demand"` re-renders on prop commits (r3f auto-invalidate). Live behavior → human item 1 |
| 4 | shape='square' → rounded-box body; shape='round' → cylindrical body | ✓ VERIFIED | `KeycapSlot` branches on shape: `<cylinderGeometry args={[0.55,0.55,0.28,32]}>` rotated π/2 (round) vs drei `<RoundedBox args={[1,1,0.28]} radius={0.09}>` (square) — scene L137-146; distinct geometry classes, same for the inset clicker face |
| 5 | Swatch behavior matches CSS exactly; >~20 rendered chars falls back to CSS KeychainPreview | ✓ VERIFIED | Scene L186-189 mirrors `keychain-preview.tsx` L53-66 byte-for-byte (`display = text \|\| placeholder`; `isSwatch = chars.length === 0`; swatch → 1 keycap, glyph skipped via `{ch ? ... : null}` L166). Wrapper L45-46: `effectiveCount > MAX_3D_CHARS(20)` → L72 returns unmodified `<KeychainPreview {...props} />` — no placeholder text. Note: the truth's phrase "empty text + a non-empty placeholder renders one swatch" is a wording slip — per the CSS component (and plan's own interfaces block), swatch requires empty *display* (empty text AND empty placeholder); non-empty placeholder renders placeholder letters. The implementation matches the CSS parity intent exactly |
| 6 | First paint never blank/black — CSS visible immediately, cross-fades on ready | ✓ VERIFIED (structural) | Wrapper: CSS layer always mounted at opacity 1 until `ready` (L83-88); WebGL layer mounted only after IntersectionObserver fires (L90-97), opacity 0 until `onReady` (fired from Canvas `onCreated`, scene L217). SSR-safe (`dynamic(ssr:false)` from a "use client" file). Minor observation: `onCreated` fires before troika's async font load completes, so the fade-in may briefly show glyphless keycaps — matches the plan's own specified pattern, cosmetic only |
| 7 | tsc + build pass with new deps; Turbopack outcome documented, not silently patched | ✓ VERIFIED | `npx tsc --noEmit` **re-run by verifier: exit 0** (after `npm install` from committed lockfile — deps were absent locally since executor worked in a worktree). `package.json` dev script still `next dev --turbopack` (unpatched); SUMMARY documents Turbopack works cleanly on Next 15.5.15 (no workaround needed). `npm run build` not re-run locally (needs DB tunnel) → human item 4 (CI will gate the PR anyway) |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/store/keychain-preview-3d-scene.tsx` | r3f Canvas scene, lights, per-shape meshes, raised glyph, onReady | ✓ VERIFIED | 235 lines, contains `Canvas`; default export (required for next/dynamic); manual lights only — no `<Environment>`, no OrbitControls; wired via dynamic import |
| `src/components/store/keychain-preview-3d.tsx` | IO mount-gating, char cap, dynamic(ssr:false), cross-fade | ✓ VERIFIED | 100 lines, contains `IntersectionObserver`; `MAX_3D_CHARS=20`; wired — imported/used by configurable-product-view |
| `public/fonts/chakra-petch-bold.ttf` | Static font for troika | ✓ VERIFIED | 78,384 bytes, valid TrueType magic bytes (`00 01 00 00`); referenced at `/fonts/chakra-petch-bold.ttf` (scene L29); committed in `2384236` |
| `src/components/store/configurable-image-gallery.tsx` | thumbSlot prop decoupling hero/thumbnail nodes | ✓ VERIFIED | Prop declared L45 with doc comment, destructured L55, used ONLY at thumbnail mini (L346); hero render site L204 untouched |
| `src/components/store/configurable-product-view.tsx` | Hero = KeychainPreview3D; thumbnail + sticky strip = CSS | ✓ VERIFIED | Import L31, `renderPreviewInner(use3d)` L401, hero L424 (3D), thumb L429 (CSS), sticky strip L570 (CSS, byte-identical prop set) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| configurable-product-view.tsx | keychain-preview-3d.tsx | heroPreviewNode, identical 7-prop set | ✓ WIRED | Pattern `KeychainPreview3D` at L31/L405; props match the sticky strip's CSS instantiation exactly (text/baseHex/clickerHex/letterHex/maxLength/placeholder/shape) |
| keychain-preview-3d.tsx | keychain-preview-3d-scene.tsx | next/dynamic(ssr:false) | ✓ WIRED | Pattern `dynamic(` at L30; code-splits three/r3f/drei/troika out of the main PDP chunk |
| configurable-image-gallery.tsx | configurable-product-view.tsx | previewSlot (hero) + thumbSlot (mini) as separate nodes | ✓ WIRED | Pattern `thumbSlot ?? previewSlot` at L346; call site passes both (L489-490) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| keychain-preview-3d-scene.tsx | text/hex props → char meshes + material colors | Live React state in ConfigurableProductView (`values` → `resolveHex`/`textValue`, L301-326) | Yes — same state that already drives the CSS previews; nothing hardcoded | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck passes with new deps | `npm install` (lockfile, 51 pkgs) + `npx tsc --noEmit` | Exit 0 | ✓ PASS |
| Deps installed at pinned versions | read `node_modules/*/package.json` | three 0.185.1, fiber 9.6.1, drei 10.7.7, troika 0.52.4 | ✓ PASS |
| drei exports RoundedBox | grep `core/index.d.ts` | `export * from './RoundedBox'` (L81) | ✓ PASS |
| Font is a real TTF | magic-byte hexdump | `00 01 00 00`, 78 KB | ✓ PASS |
| Task commits exist | git show 2384236, f7925c1 | Both present on `feat/keychain-3d-preview` with expected file stats | ✓ PASS |
| `npm run build` | — | Skipped: requires DB access (SSH tunnel) locally; branch not yet pushed so no CI run | ? SKIP → human item 4 |
| Live PDP canvas render | — | Skipped: needs dev server + DB tunnel | ? SKIP → human items 1-3 |

### Deviation Coherence Review (4 documented deviations)

All four deviations were checked against the actual code and assessed as principled fixes, not band-aids:

1. **`#00000030` → `#000000` + `fillOpacity={0.3}`** — Correct: `THREE.Color` has no 8-digit-hex alpha parsing; `fillOpacity` is troika's native translucency prop. Present in scene L104-114 with explanatory comment.
2. **RoundedBox radius 0.14 → 0.09 (body) / 0.02 (clicker)** — Correct: drei's RoundedBoxGeometry extrude depth = `depth − 2·radius`; the plan's pairing (0.28, 0.14) yields exactly 0. New values leave +0.10/+0.04 margins (constants + comments, scene L32-41).
3. **Fixed camera z=6 → `computeCameraZ(maxLength)`** — Math checks out: at fov 30/z≈6 the visible half-extent is ~1.65 units vs ±4.6 needed for a maxLength-8 row — the plan's literal camera clips everything. Keying to `maxLength` (not live char count) mirrors the CSS component's own maxLength-keyed `clamp()` sizing convention (scene L69-83).
4. **`frameloop="demand"` + `preserveDrawingBuffer:true`** — Appropriate for a fully static scene (the plan itself forbids orbit/animation); preserveDrawingBuffer keeps the buffer valid between demand renders. Partly motivated by headless-Chromium harness observations (honestly disclosed in SUMMARY as possible test-artifact), but the production choice is cheaper and stable either way. r3f auto-invalidates on prop commits, so typing still re-renders — exercised by the executor's typed-text screenshots.

### Scope Guardrail Compliance

- Mobile sticky-strip block (L544-586): still a direct CSS `<KeychainPreview>` — untouched ✓
- No `<Environment preset>` (scene imports only Canvas/RoundedBox/Text; manual lights) ✓
- No OrbitControls / drag-rotate ✓
- `npm run dev` script retains `--turbopack` (not silently patched) ✓
- Cap fallback returns the real, unmodified CSS `KeychainPreview` — no placeholder text ✓

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| QUICK-260707-evn | 260707-evn-PLAN.md | Realistic 3D hero preview, hero-only, CSS elsewhere | ✓ SATISFIED | All 5 artifacts + 3 key links verified above |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found (no TODO/FIXME/stub returns/console-only handlers; all "placeholder" matches are the legitimate `placeholder` prop) | — | — |

### Human Verification Required

See frontmatter `human_verification` — 4 items: (1) live PDP visual smoke test on both shapes, (2) 1-canvas count in the md-lg breakpoint range, (3) resize/container-query behavior, (4) CI/build green on the PR. Items 1-3 fit the project's dev-first convention (user tests on app.3dninjaz.com before master/prod).

### Gaps Summary

No gaps. All 7 must-have truths, 5 artifacts, and 3 key links verified against the actual codebase (not the SUMMARY narrative). The 4 documented deviations are coherent, well-evidenced bug fixes required for the plan's own success criteria to hold. One notable verification environment finding: the executor worked in a git worktree, so this checkout's `node_modules` lacked the new packages until the verifier ran `npm install` from the committed lockfile — after which `npx tsc --noEmit` passed independently (exit 0). Remaining uncertainty is confined to runtime visuals and the production build, both routed to human/CI verification.

---

_Verified: 2026-07-07T04:15:23Z_
_Verifier: Claude (gsd-verifier)_
