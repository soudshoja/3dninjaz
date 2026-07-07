---
phase: quick-260707-evn
plan: 01
subsystem: ui
tags: [react-three-fiber, three.js, drei, troika-three-text, webgl, nextjs, pdp]

# Dependency graph
requires:
  - phase: quick-260705-azw
    provides: products.keychainShape enum (square/round) driving KeychainPreview's shape prop
provides:
  - Real r3f/three.js WebGL 3D scene for the keychain PDP hero preview (KeychainPreview3D)
  - thumbSlot prop on ConfigurableImageGallery decoupling hero vs thumbnail preview components
affects: [pdp, configurable-product-view, keychain-preview]

# Tech tracking
tech-stack:
  added: [three@0.185.1, "@react-three/fiber@9.6.1", "@react-three/drei@10.7.7", troika-three-text@0.52.4, playwright@1.61.1 (devDependency)]
  patterns: ["hero-only WebGL replacement with CSS fallback + cross-fade", "next/dynamic(ssr:false) code-split for 3D bundle", "IntersectionObserver mount-gating", "maxLength-keyed camera zoom-to-fit (mirrors CSS's maxLength-keyed clamp() sizing)"]

key-files:
  created:
    - src/components/store/keychain-preview-3d-scene.tsx
    - src/components/store/keychain-preview-3d.tsx
    - public/fonts/chakra-petch-bold.ttf
  modified:
    - src/components/store/configurable-image-gallery.tsx
    - src/components/store/configurable-product-view.tsx
    - package.json
    - package-lock.json

key-decisions:
  - "Camera distance computed from maxLength (not live char count) so keycap size stays visually stable while typing — mirrors CSS component's maxLength-keyed clamp() sizing exactly"
  - "frameloop=demand + gl.preserveDrawingBuffer=true (not the plan's literal fixed camera/gl config) — required for correctness, not just style"
  - "RoundedBox radius reduced from the plan's suggested 0.14/depth-0.28 pairing to 0.09/0.02 (body/clicker) to avoid degenerate zero-depth extrudeGeometry"

patterns-established:
  - "Hero-only 3D swap pattern: shared renderPreviewInner(use3d) helper builds both heroPreviewNode and thumbPreviewNode from one prop set, preventing hero/thumbnail drift while keeping exactly 1 WebGL context per page"

requirements-completed: [QUICK-260707-evn]

# Metrics
duration: 55min
completed: 2026-07-07
---

# Quick Task 260707-evn: Realistic 3D Keychain Preview (react-three-fiber) Summary

**Replaced the CSS-cube keychain hero preview with a real react-three-fiber WebGL scene (lit RoundedBox/cylinder keycap meshes + troika raised-glyph text), hero-slot only — thumbnail miniature and mobile sticky-strip keep the CSS `KeychainPreview` untouched, keeping the page at exactly 1 WebGL context.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-07-07T03:06:00Z (session start)
- **Completed:** 2026-07-07T03:58:35Z (Task 2 commit)
- **Tasks:** 2/2 completed
- **Files modified:** 6 (2 created source files + font asset, 2 edited components, package.json/lock)

## Accomplishments

- New `KeychainPreview3DScene` component: a real `<Canvas>` scene with ambient + 2 directional lights, per-shape keycap body meshes (`RoundedBox` for square, `cylinderGeometry` rotated flat for round), a recessed inset "clicker face" mesh, and a raised troika-text glyph (front sharp layer + duplicated back "shadow" layer for a fake-extrusion look)
- New `KeychainPreview3D` wrapper: IntersectionObserver mount-gating, `MAX_3D_CHARS=20` hard cap falling back to the unmodified CSS `KeychainPreview`, `next/dynamic(ssr:false)` code-split, and a CSS-to-WebGL cross-fade so first paint is never blank/black
- `configurable-image-gallery.tsx` gained a `thumbSlot` prop so the hero and thumbnail-mini can render different components without double-mounting the hero's component
- `configurable-product-view.tsx`'s hero now renders `KeychainPreview3D`; the thumbnail node and the untouched mobile sticky-strip block still render the CSS `KeychainPreview`
- Verified live via Playwright against both a local dev server and a production build: real `<canvas>` content renders correctly for both `square` and `round` shapes, in both empty-placeholder ("YOURTEXT") and typed-text ("SOUD") states — 4 screenshots reviewed, all show lit, shape-distinct 3D keycaps with correctly placed glyphs
- Confirmed exactly 1 `<canvas>` element exists on the page in every state (thumbnail + mobile sticky-strip remain canvas-free CSS)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install r3f stack + build KeychainPreview3D (scene + mount-gating wrapper)** - `2384236` (feat)
2. **Task 2: Wire hero-only replacement + local dev-server Playwright visual verification** - `f7925c1` (feat) — also contains 3 Rule-1 bug fixes discovered during the mandated visual verification (see Deviations)

**Plan metadata:** pending (orchestrator commits SUMMARY.md/STATE.md separately)

## Files Created/Modified

- `src/components/store/keychain-preview-3d-scene.tsx` - r3f `<Canvas>` scene: lights, per-shape keycap meshes, troika raised-glyph text via drei `<Text>`, `onReady` callback, maxLength-keyed zoom-to-fit camera
- `src/components/store/keychain-preview-3d.tsx` - `"use client"` wrapper: IntersectionObserver gate, char-count cap fallback, `next/dynamic(ssr:false)`, CSS-to-WebGL cross-fade, `data-ready` debug attribute
- `public/fonts/chakra-petch-bold.ttf` - static font asset for troika-three-text (Chakra Petch Bold, OFL-1.1, from the official google/fonts repo)
- `src/components/store/configurable-image-gallery.tsx` - added `thumbSlot?: React.ReactNode` prop, used only at the thumbnail-mini render site
- `src/components/store/configurable-product-view.tsx` - `renderPreviewInner(use3d)` helper builds `heroPreviewNode` (3D) and `thumbPreviewNode` (CSS) from the same prop set; mobile sticky-strip block unchanged
- `package.json` / `package-lock.json` - added `three@0.185.1`, `@react-three/fiber@9.6.1`, `@react-three/drei@10.7.7`, `troika-three-text@0.52.4`, `@types/three@0.185.0` (dev), `playwright@1.61.1` (dev)

## Decisions Made

- **Camera framing keyed to `maxLength`, not live character count.** The plan's literal fixed `camera={{position:[0,1.4,6], fov:30}}` was verified (via math + Playwright) to clip most real keycap rows (keychain `maxLength` is 8-10) out of the camera frustum. Recomputed a zoom-to-fit camera distance from `maxLength` — this also keeps on-screen keycap size visually stable while typing, mirroring the CSS component's own `clamp(..., 100cqw / (maxLength+1), ...)` sizing convention (which is also keyed off `maxLength`, not the live char count).
- **`RoundedBox` radius reduced from the plan's illustrative 0.14 (at depth 0.28) to 0.09 for the body / 0.02 for the clicker inset (at depth 0.08).** drei's `RoundedBoxGeometry` computes its internal extrude depth as `depth - radius*2`; the plan's suggested pairing zeroes this out, producing a degenerate mesh. Reduced radius leaves a safe margin while still reading as a rounded keycap.
- **`frameloop="demand"` + `gl.preserveDrawingBuffer=true`** instead of the plan's implicit default (continuous render loop). See Deviations — this was a correctness fix, not a style choice.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Invalid 8-digit alpha hex color passed to `THREE.Color`**
- **Found during:** Task 2, Playwright visual verification (console showed repeated `THREE.Color: Invalid hex color #00000030` warnings)
- **Issue:** The plan's "fake extrusion" raised-glyph pattern used `color="#00000030"` (RGBA hex) for the back shadow layer. `THREE.Color`'s hex parser does not support an alpha channel — the color silently fails to parse.
- **Fix:** Switched to `color="#000000"` + drei `Text`'s native `fillOpacity={0.3}` prop, which is the library-supported way to get a translucent glyph fill.
- **Files modified:** `src/components/store/keychain-preview-3d-scene.tsx`
- **Verification:** Console warning gone on re-test; visual shadow-layer effect preserved.
- **Committed in:** `f7925c1`

**2. [Rule 1 - Bug] Degenerate `RoundedBoxGeometry` extrude depth**
- **Found during:** Task 1, pre-emptive review of drei's `RoundedBox` source (`node_modules/@react-three/drei/core/RoundedBox.js`) before writing scene code
- **Issue:** `RoundedBoxGeometry` computes its extrude `depth` param as `depth - radius*2`. The plan's illustrative body params (`args=[1,1,0.28]`, `radius=0.14`) zero this out (`0.28 - 0.14*2 = 0`), and the clicker inset params would go negative, producing degenerate/invalid geometry.
- **Fix:** Reduced radius to 0.09 (body, at depth 0.28) and 0.02 (clicker, at depth 0.08) — both leave a positive safety margin.
- **Files modified:** `src/components/store/keychain-preview-3d-scene.tsx`
- **Verification:** Playwright screenshots confirm well-formed, correctly rounded keycap bodies.
- **Committed in:** `2384236`

**3. [Rule 1 - Bug] Camera frustum clips all real keycap rows**
- **Found during:** Task 2, Playwright visual verification (first screenshots were blank/near-blank despite `<canvas>` present with `isContextLost:false` and non-trivial framebuffer content)
- **Issue:** The plan's literal fixed camera (`position:[0,1.4,6]`, `fov:30`) only has a visible half-extent of ~1.65 units at that distance/fov, but a maxLength=8-10 keycap row spans ±4-4.8 units — every keycap fell outside the camera frustum.
- **Fix:** Added `computeCameraZ(maxLength)` — a zoom-to-fit calculation solving camera distance from the required half-extent and fov, keyed to `maxLength` (not live char count) for CSS-parity stable sizing while typing.
- **Files modified:** `src/components/store/keychain-preview-3d-scene.tsx`
- **Verification:** All 4 Playwright screenshots (square/round × empty/typed) now show fully-framed, correctly-lit keycap rows.
- **Committed in:** `2384236`

**4. [Rule 1 - Bug] WebGL context loss + blank canvas under `frameloop="demand"` without `preserveDrawingBuffer`**
- **Found during:** Task 2, Playwright visual verification — screenshots were reliably blank despite the scene rendering correctly on the very first frame (confirmed via `canvas.toDataURL()` immediately after `onCreated`)
- **Issue:** Two related problems: (a) the default continuous ("always") r3f render loop was observed to trigger `THREE.WebGLRenderer: Context Lost` under sustained headless rendering in the Playwright test harness; (b) switching to `frameloop="demand"` (which only renders once, on mount/prop-change) needs `gl.preserveDrawingBuffer=true`, otherwise the browser clears the WebGL drawing buffer on the next compositing pass with no continuous loop to redraw it, showing a blank/transparent canvas.
- **Fix:** Set `frameloop="demand"` (appropriate anyway — this is a fully static, non-interactive scene per the plan's own "no OrbitControls" scope guardrail) together with `gl.preserveDrawingBuffer=true`.
- **Files modified:** `src/components/store/keychain-preview-3d-scene.tsx`
- **Verification:** Confirmed via Playwright — final screenshots show correct, stable, visible 3D content in all 4 shape/text-state combinations.
- **Committed in:** `f7925c1`

---

**Total deviations:** 4 auto-fixed (all Rule 1 — bug fixes required for the shipped feature to actually render visible content; no scope creep, no architectural changes).
**Impact on plan:** All fixes were necessary corrections to make the plan's own stated success criteria ("hero renders a real WebGL scene with lit materials and a raised glyph") actually true. Without them the feature would ship structurally (a `<canvas>` element present) but visually broken (blank/transparent) for any real keychain product.

## Issues Encountered

**Headless Chromium WebGL context instability during Playwright testing itself.** Even after the `preserveDrawingBuffer`/`frameloop` fix, this specific Windows dev machine's headless Chromium (via Playwright, both default and with `--use-gl=swiftshader` launch args) exhibited an apparent ~4-5 second WebGL context lifetime under sustained test-harness activity (repeated `element.screenshot()` calls / `canvas.toDataURL()` reads triggered `GL_CLOSE_PATH_NV` GPU-stall warnings followed by `Context Lost`). This was **not** reproducible from a single fresh page load + single prompt screenshot (the pattern ultimately used for all 4 final screenshots: one fresh `page` per shot, screenshot taken as soon as possible after the cross-fade settles). This is assessed as a test-harness/environment artifact (real end-user browsers do not call `readPixels`/`toDataURL` on the canvas from outside, so this class of instability should not occur for real site visitors) rather than a defect in the shipped component. Documented here for visibility in case future CI-based visual-regression testing against this component hits the same instability — the mitigation is: one navigation per screenshot, screenshot promptly after the cross-fade completes (~400ms), don't chain multiple readback operations against the same WebGL context.

**Dev-mode Turbopack smoke test:** No workaround needed — `npm run dev` (Turbopack) compiled and served `@react-three/fiber`/`@react-three/drei` imports without the "Module not found" issue described in RESEARCH.md's Pitfall 4 (GitHub #74277). The issue is evidently resolved in this repo's Next.js 15.5.15. `npm run dev`/`npm run build` both work unmodified — no `--turbopack` flag changes needed.

## User Setup Required

None — no external service configuration required. `public/fonts/chakra-petch-bold.ttf` is a static asset checked into the repo; no build-time font conversion step needed (troika-three-text loads the `.ttf` directly).

## Next Phase Readiness

- Feature is complete and self-contained; ready for dev-branch PR review per project convention (dev-first, human smoke test before master/prod).
- Real product slugs used for verification: `pancake-clicker-mogqlfp6` (square, maxLength=10) and `clicker-mr73pik6` (round, maxLength=8) — both live on the dev DB as of 2026-07-07.
- No schema changes, no new server surface — purely a client-rendered cosmetic upgrade to the existing hero preview slot.
- Playwright itself is now available as a devDependency (`playwright@1.61.1`) for any future visual-regression tooling; the throwaway verification script used in this session was deleted after use (per plan's own guidance) rather than kept, since it was written as an ad hoc diagnostic (context-loss investigation, debug attributes) rather than a maintainable test.

---
*Phase: quick-260707-evn*
*Completed: 2026-07-07*

## Self-Check: PASSED

All 7 claimed files verified present on disk; both task commit hashes (`2384236`, `f7925c1`) verified present in git log.
