# Realistic 3D Keychain Preview (react-three-fiber) — Research

**Researched:** 2026-07-07
**Domain:** react-three-fiber / three.js integration into Next.js 15 App Router (React 19), replacing a CSS-only preview
**Confidence:** MEDIUM-HIGH (library versions/peer-deps VERIFIED via npm registry; visual/perf recommendations mostly CITED from official drei/troika docs; a few implementation details ASSUMED from training knowledge — see Assumptions Log)

## Summary

The current `KeychainPreview` is a pure CSS component (no canvas, no dependency) rendered in **up to three simultaneous DOM locations** at once: the PDP hero slide, the desktop thumbstrip's "Yours" miniature (both via the same `previewSlot` React node reused twice in `configurable-image-gallery.tsx`), and a separate mobile sticky-strip instantiation in `configurable-product-view.tsx`. This is the single biggest architectural risk for a naive "swap CSS for `<Canvas>`" migration — it would silently create 2-3 concurrent WebGL contexts for what should be one hero preview. The recommended architecture keeps the CSS component for the thumbnail/sticky-strip mounts (cheap, still accurate enough at 56-306px) and only replaces the **hero** with a real R3F `<Canvas>`, mounted client-only and lazily (on-visible), rendering one shared scene with up to `maxLength` (8 for locked keychain fields, admin-configurable up to higher values for generic configurable text fields) flat cylinder/rounded-box meshes in a row.

`three@0.185.1` + `@react-three/fiber@9.6.1` + `@react-three/drei@10.7.7` are the current npm-registry-verified stable versions and are the correct choice for React 19 — **r3f v8 does not support React 19/Next 15** (this was a real, now-resolved ecosystem issue from late 2024); v9 is the React-19-compatible major and is what must be installed. Note r3f's peer range is `react: ">=19 <19.3"` — this is unusually tight and should be watched at every future React minor bump.

**Primary recommendation:** `"use client"` wrapper component + `next/dynamic(..., { ssr:false })` for the Canvas, `MeshStandardMaterial` (not clearcoat/physical — unnecessary GPU cost for this look) lit by 2-3 manual point/directional lights (no `<Environment preset>` — those fetch HDRIs from a GitHub-hosted CDN at runtime, a bad fit for this self-hosted, no-CDN cPanel deploy), `troika-three-text` for the glyph faked into "raised" via a duplicated back layer + tiny z-offset (not `Text3D`/`TextGeometry`, which requires a one-time facetype.js conversion of Chakra Petch Bold into a typeface.json — doable, but troika is simpler, sharper at small size, and avoids a font-conversion build step), and IntersectionObserver-gated mounting with a static CSS/image placeholder for first paint.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 3D scene render (Canvas, meshes, lights) | Browser / Client | — | WebGL only exists client-side; must be a client component, never SSR'd |
| Glyph/text geometry generation | Browser / Client | — | troika/TextGeometry both run in-browser (troika even off-loads to a Web Worker) |
| Colour/text state (baseHex, clickerHex, letterHex, textValue) | Browser / Client | — | Already lives in `ConfigurableProductView` React state — no change, just a new consumer |
| Font asset delivery (Chakra Petch Bold .ttf or converted .json) | CDN / Static | — | Served from `public/` as a static asset, same as existing Cache-Control immutable pattern for `/uploads/*` |
| Canvas visibility / mount gating | Browser / Client | — | IntersectionObserver is a browser API; no server involvement |

No API/backend or database tier involvement — this is a 100% client-rendered cosmetic feature with zero new server surface.

## Standard Stack

### Core
| Library | Version (verified) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `three` | 0.185.1 [VERIFIED: npm registry, 2026-07-07] | WebGL scene graph, geometries, materials, loaders | The only real option for browser 3D; r3f is a thin reconciler on top of it |
| `@react-three/fiber` | 9.6.1 [VERIFIED: npm registry] | React reconciler for three.js — lets the scene be declarative JSX inside a client component | v9 is the React-19-compatible major. **Peer deps: `react: ">=19 <19.3"`, `react-dom: ">=19 <19.3"`, `three: ">=0.156"`** [VERIFIED: npm registry `peerDependencies`] |
| `@react-three/drei` | 10.7.7 [VERIFIED: npm registry] | Helper abstractions (Center, RoundedBox-style geometry helpers, Text3D) on top of r3f | De-facto standard companion; avoids hand-rolling loaders/controls. Peer deps: `react: "^19"`, `react-dom: "^19"`, `three: ">=0.159"`, `@react-three/fiber: "^9.0.0"` [VERIFIED: npm registry] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `troika-three-text` | 0.52.4 [VERIFIED: npm registry] | SDF-based text mesh, no font-JSON conversion step | **Recommended** for the glyph — see Code Examples for the "fake extrusion" approach |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual 3-point lighting | drei `<Environment preset="studio">` | Presets fetch HDRIs from a GitHub-hosted CDN at request time by default [CITED: drei.docs.pmnd.rs/staging/environment] — a production risk on this self-hosted/no-CDN deploy if the CDN is slow/blocked. `@pmndrs/assets` (base64-inlined, dynamically-imported HDRIs, no CDN dependency) [CITED: npmjs.com/package/@pmndrs/assets] is the safe alternative if an HDRI look is wanted later — not needed for a v1 "plastic keycap" look |
| `troika-three-text` | drei `<Text3D>` / three `TextGeometry` | True extruded 3D geometry with real bevel, but requires converting Chakra Petch to a typeface.json via facetype.js first [CITED: drei.docs.pmnd.rs/abstractions/text3d — "requires fonts in JSON format generated through typeface.json"], and generates more triangles per glyph (heavier for 8+ simultaneous glyphs) |
| `MeshStandardMaterial` | `MeshPhysicalMaterial` (clearcoat/roughness) | Physical material with clearcoat gives a nicer "glossy injection-molded plastic" sheen but costs more per-pixel shading; overkill for a small hero preview widget, revisit only if the "cheap plastic" look under-delivers visually |

**Installation:**
```bash
npm install three @react-three/fiber @react-three/drei troika-three-text
npm install -D @types/three
```

**Version verification:** All four versions above were checked live against the npm registry on 2026-07-07 via `npm view <pkg> version` / `npm view <pkg> peerDependencies`. `@types/three@0.185.0` matches `three@0.185.1` closely enough (types lag patch releases by design). Given React 19.1.0 is currently pinned in `package.json`, it satisfies r3f's `>=19 <19.3` peer range today — but this range should be re-checked before any future `react`/`react-dom` bump.

## Architecture Patterns

### System Architecture Diagram

```
ConfigurableProductView (client component, existing)
  │
  │  textValue / baseHex / clickerHex / letterHex (React state, unchanged)
  │
  ├──> Hero slot ─────────────────────────────────────────────┐
  │      KeychainPreview3D (NEW — dynamic import, ssr:false)  │
  │        └─ wrapper <div> + ResizeObserver ─┐               │
  │             (measures container px width) │               │
  │                                           ▼               │
  │        <Canvas> (mounted only when          IntersectionObserver
  │         IntersectionObserver reports          gates first mount;
  │         the hero is in/near viewport)         static placeholder
  │             │                                 shown until then
  │             ├─ <ambientLight> + 2-3 point/dir lights
  │             ├─ N × <mesh> (RoundedBox | flat Cylinder, per shape prop)
  │             │     material: MeshStandardMaterial, color=baseHex/clickerHex
  │             └─ N × <Text> (troika, via drei's <Text>) color=letterHex,
  │                   duplicated at z-offset for "raised" look
  │
  ├──> Thumbstrip "Yours" mini (existing, UNCHANGED) ─────────┐
  │      Reuses the SAME `previewSlot` JSX node as the hero    │  KEEP AS CSS —
  │      today → would double-mount a Canvas if naively swapped│  see Pitfall 1
  │                                                             │
  └──> Mobile sticky strip (existing, UNCHANGED) ─────────────┘
         Separate <KeychainPreview .../> instantiation, same props
         (mobile-only, `lg:hidden`)                              KEEP AS CSS
```

Read left-to-right: React state flows unchanged into a **new** hero-only 3D component; the two smaller/duplicate mount points (thumbnail miniature, mobile sticky strip) keep using the existing CSS component untouched, so no new WebGL context is created for them.

### Recommended Project Structure
```
src/components/store/
├── keychain-preview.tsx           # UNCHANGED — CSS version, kept for thumbnail + sticky strip
├── keychain-preview-3d.tsx        # NEW — "use client", houses the R3F <Canvas> + scene
├── keychain-preview-3d-scene.tsx  # NEW (optional split) — pure r3f JSX (meshes/lights/text)
└── configurable-product-view.tsx # EDIT — hero slot renders KeychainPreview3D; other 2 mounts untouched
public/
└── fonts/
    └── chakra-petch-bold.ttf     # NEW (only if Text3D/TextGeometry path chosen — not needed for troika)
```

### Pattern 1: Client-only Canvas mount in App Router

**What:** `next/dynamic(() => import(...), { ssr: false })` **cannot** be called directly inside a Server Component file — Next.js 15 App Router throws a build error ("ssr: false is not allowed with next/dynamic in Server Components") if attempted there. The fix is one of:
1. Call `dynamic(..., { ssr:false })` from inside a file that itself has `"use client"` at the top, or
2. Give the 3D component its own `"use client"` directive and skip `next/dynamic` entirely, guarding any `window`/`document` access internally, and rely on r3f's `<Canvas>` itself only touching the DOM inside `useEffect`/`useLayoutEffect` (which is what r3f already does internally).

**When to use:** `configurable-product-view.tsx` is already `"use client"` (line 1) — so pattern 2 (plain `"use client"` on `keychain-preview-3d.tsx`, imported normally, no `next/dynamic` needed at all) is simplest here since we're never crossing a Server→Client boundary for this specific import. `next/dynamic` only becomes necessary if the parent were a Server Component, or if you want to explicitly code-split the three.js/r3f bundle away from the initial PDP JS chunk (recommended anyway, for bundle-size reasons — see Performance section).

**Example:**
```tsx
// src/components/store/keychain-preview-3d.tsx
"use client";
import dynamic from "next/dynamic";

// Code-splits three/@react-three/fiber/drei/troika out of the main PDP chunk.
// Safe here because THIS file already has "use client" — dynamic(ssr:false)
// is being called from a Client Component, which Next.js allows.
const Scene = dynamic(() => import("./keychain-preview-3d-scene"), {
  ssr: false,
  loading: () => <StaticFallback />, // cheap CSS/image placeholder — avoids black-canvas flash
});

export function KeychainPreview3D(props: Props) {
  return <Scene {...props} />;
}
```
[ASSUMED — standard, widely-documented r3f+Next.js App Router pattern; not fetched from an official Next.js "3D + App Router" doc page verbatim, but consistent with both the r3f docs and multiple 2025-2026 community writeups found via WebSearch]

### Pattern 2: Mount-on-visible with static first-paint fallback
**What:** Wrap the Canvas mount in an `IntersectionObserver` so the WebGL context and shader compilation only happen once the hero card scrolls near the viewport (or immediately, since this hero is above-the-fold on the PDP — but IO still avoids paying the cost on PDP variants where `showPreview` starts `false`, e.g. `productType !== "keychain"/"vending"` other configurables).
**When to use:** Always — this also directly solves "no canvas-black-flash on first paint": render the **existing CSS `KeychainPreview`** as the fallback/`loading` state (or a simple static screenshot), swap to the live Canvas only once mounted and the first frame has rendered (listen for r3f's `onCreated` callback, then cross-fade).

### Anti-Patterns to Avoid
- **One `<Canvas>` per character:** N independent WebGL contexts for N keychain letters. Browsers cap concurrent WebGL contexts around 8-16 depending on browser/GPU [ASSUMED — commonly cited limit, not verified against a current spec doc this session]; with `maxLength=8` for keychains that's already uncomfortably close to the ceiling on some browsers, and any other WebGL usage elsewhere on the page (or other open tabs) shares the same global cap. **Use one shared `<Canvas>` with N meshes positioned in a row instead** — same visual result, 1 context.
- **Naively converting the shared `previewSlot` React node to include a Canvas:** because `configurable-image-gallery.tsx` renders `{previewSlot}` twice (hero + thumbnail mini, lines 198 and ~340) and `configurable-product-view.tsx` renders a fully separate third `<KeychainPreview>` instantiation for the mobile sticky strip (lines 558-570), a literal 1:1 swap creates 2-3 concurrent Canvases per page view. See Pitfall 1.
- **`<Environment preset="...">` in production:** fetches an HDRI from a GitHub-hosted CDN on every cold page load [CITED: drei docs — "preset property is not meant to be used in production... relies on CDNs"]. Given this deploy has no CDN in front of it and is self-hosted on a single cPanel box, an external CDN dependency for a decorative lighting map is an unnecessary failure point — use manual lights instead (near-zero bytes, zero external requests).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SDF glyph rendering/atlasing | Custom canvas-2d-texture-to-mesh glyph baking | `troika-three-text` | Font parsing (Typr) + SDF atlas generation happens in a Web Worker already [CITED: troika-three-text docs] — reinventing this is pure risk for no benefit |
| Rounded-box / cylinder keycap geometry | Manual `BufferGeometry` vertex math for bevelled edges | three's built-in `CylinderGeometry` (round shape) + `three/examples/jsm/geometries/RoundedBoxGeometry.js` or drei's rounded-box helper (square shape) | Both are maintained, tested primitives; bevel math by hand is error-prone and not worth the engineering time for a cosmetic preview |
| Responsive canvas resize | Manual `window.resize` polling | `ResizeObserver` on the wrapping `<div>` (the container-query wrapper already exists in `keychain-preview.tsx`) driving `camera.aspect` + `gl.setSize()` — r3f's `<Canvas>` actually does this internally by default when given `style={{width:"100%",height:"100%"}}` and a sized parent, no extra library needed | r3f already resizes to its parent element automatically; the only new work is making sure the **parent** `div` participates correctly in the existing `100cqw` container-query layout (see Pitfall 3) |

**Key insight:** Everything genuinely hard here (SDF font atlasing, WebGL resize plumbing) already has a maintained library solving it — the actual net-new work for this task is thin: scene composition (lights + geometry + text), the mount-gating wrapper, and NOT accidentally tripling the Canvas count via the existing 3-mount-point layout.

## Common Pitfalls

### Pitfall 1: Triple-mounting the Canvas via existing hero/thumbnail/sticky-strip reuse
**What goes wrong:** `configurable-image-gallery.tsx` renders the exact same `previewSlot` React element twice (slide-0 hero, and the "Yours" thumbnail miniature scaled via CSS `transform: scale(0.2)`), and `configurable-product-view.tsx` separately instantiates a **third** `<KeychainPreview>` for the mobile sticky-preview-strip. If the hero component is swapped in-place for an R3F version without changing these two other call sites, the page mounts 2 (desktop: hero + thumbnail) to 3 (tablet width: hero + thumbnail + sticky strip, since the sticky strip is `lg:hidden` — visible below `lg` — and the thumbstrip is `hidden md:flex` — visible at `md` and up, so both are simultaneously visible in the `md`-to-`lg` viewport range) concurrent WebGL contexts for a single logical preview.
**Why it happens:** The CSS version is cheap enough that duplicating it 2-3x across responsive breakpoints was a reasonable, low-cost design choice. That assumption breaks for WebGL.
**How to avoid:** Keep the existing `keychain-preview.tsx` (CSS) component wired to the thumbnail miniature and the mobile sticky strip — both are small (56px / ~32px cubes) where the visual downgrade to CSS is imperceptible. Only replace the **hero** (`previewNode` inside `ConfigurableImageGallery`'s `previewSlot` prop, used as the primary large preview) with the new 3D component.
**Warning signs:** DevTools > Performance shows multiple `WebGLRenderingContext` entries; or Chrome's console warning "Too many active WebGL contexts. Oldest context will be lost" if the count is pushed higher by other page features.

### Pitfall 2: Container-query (`100cqw`) sizing doesn't automatically resize the Canvas
**What goes wrong:** The existing CSS component reads `100cqw` at render/paint time via CSS, which is free — CSS re-flows automatically on container resize. A `<Canvas>` has actual pixel-backed framebuffers; there is no CSS-only equivalent. If the wrapping `div` resizes (container query breakpoint change, window resize, sidebar collapse, orientation change) without an explicit resize handler, the WebGL canvas will either stay the wrong pixel size or (if using r3f's default auto-resize) resize correctly ONLY if the parent element's *layout box* actually changed size — r3f's `<Canvas>` uses a `ResizeObserver` on its immediate parent internally by default, so as long as the wrapping `div` (not an ancestor several levels up) is the one whose size is container-query-driven, this works out of the box. [ASSUMED based on r3f's documented default auto-sizing behavior — not re-verified this session against v9.6.1 source, but this has been r3f's behavior across major versions]
**Why it happens:** Container queries are a pure-CSS layout mechanism; WebGL has no CSS awareness at all.
**How to avoid:** Mount the `<Canvas>` as a **direct child** of the same `div` that currently has `containerType: "inline-size"` (or one level in), not several DOM layers removed, so r3f's internal `ResizeObserver` picks up size changes directly. Test explicitly at container-query breakpoint transitions (e.g., resizing the browser across the `md`/`lg` breakpoints where the layout — and thus the hero's available width — changes) since this is exactly where the existing CSS component intentionally changes `cubeSizeExpr` via `100cqw`.
**Warning signs:** 3D preview looks correct at initial mount but goes blurry/stretched or clips after a browser resize or breakpoint change.

### Pitfall 3: `next/dynamic(..., { ssr:false })` inside a Server Component file
**What goes wrong:** Next.js 15 App Router throws a build-time error if `dynamic(fn, { ssr: false })` is called from a file without `"use client"`.
**Why it happens:** `ssr:false` implies "never render this on the server," which is meaningless/disallowed for a Server Component (Server Components have no client-side re-render to fall back to).
**How to avoid:** Every file calling `dynamic(..., { ssr:false })` must itself start with `"use client"`. Since `configurable-product-view.tsx` is already a Client Component, and the new `keychain-preview-3d.tsx` will also be `"use client"`, this is a non-issue for the current PDP call site — flagged only because the planner may be tempted to lazy-load from a Server Component page.tsx wrapper instead.
**Warning signs:** Build fails with an explicit Next.js error naming the offending file (not a runtime bug — caught at build time, low risk if `npm run build`/`tsc` is checked before shipping).

### Pitfall 4: Turbopack + drei/r3f module resolution (dev-only risk)
**What goes wrong:** A December 2024 Next.js GitHub issue (#74277) reported "Module not found: Can't resolve '@react-three/fiber'" specifically when using `next dev --turbopack` with `@react-three/drei` [CITED: github.com/vercel/next.js/issues/74277 — status at time of research: open, labeled bug, awaiting a "complete reproduction"]. This repo's `dev` script uses `--turbopack` (`package.json` line 6); the `build` script does **not** (uses default webpack build).
**Why it happens:** Turbopack's module resolution for some three.js-ecosystem packages had rough edges as of late 2024; unclear if resolved in current Turbopack (Next 15.5.15 is ~10 months newer than the report).
**How to avoid:** Install the dependencies and immediately smoke-test `npm run dev` (Turbopack) before writing any implementation code. If the module-not-found error reproduces, the safe fallback is running dev without `--turbopack` for this component's development (`next dev` without the flag) — production `next build` is unaffected either way since it doesn't use Turbopack in this repo today.
**Warning signs:** Dev server shows "Module not found" only for `@react-three/fiber`/`@react-three/drei` imports, while `tsc --noEmit` and `next build` both pass cleanly.

## Code Examples

### Raised glyph via troika text + duplicated back layer (fake extrusion)
```tsx
// Source: pattern combines troika-three-text's documented single-layer usage
// [CITED: protectwise.github.io/troika/troika-three-text/] with a manual
// z-offset duplicate for a "raised" look — troika text itself has no native
// extrusion ("troika cannot be extruded" — three-text/TextGeometry docs).
import { Text } from "@react-three/drei"; // drei's <Text> wraps troika-three-text

function RaisedGlyph({ char, color, size }: { char: string; color: string; size: number }) {
  return (
    <group>
      {/* Front face — sharp SDF glyph */}
      <Text fontSize={size} color={color} anchorX="center" anchorY="middle" position={[0, 0, 0.02]}>
        {char}
      </Text>
      {/* Back "shadow" layer — same glyph, slightly larger + darker + behind,
          reads as a subtle raised bevel without real 3D geometry */}
      <Text fontSize={size * 1.04} color="#00000030" anchorX="center" anchorY="middle" position={[0, 0, 0]}>
        {char}
      </Text>
    </group>
  );
}
```

### Row of shared-canvas keycap meshes (one context, N meshes)
```tsx
// Illustrative composition — NOT fetched verbatim from a single doc page;
// combines r3f's documented <Canvas>/<mesh> JSX pattern with three's built-in
// CylinderGeometry (round shape) / RoundedBoxGeometry (square shape).
<Canvas camera={{ position: [0, 0, 5], fov: 35 }}>
  <ambientLight intensity={0.6} />
  <directionalLight position={[3, 4, 5]} intensity={1.2} />
  <directionalLight position={[-3, -2, 2]} intensity={0.4} />
  {chars.map((ch, i) => (
    <group key={i} position={[i * 1.1 - (chars.length - 1) * 0.55, 0, 0]}>
      <mesh>
        {shape === "round"
          ? <cylinderGeometry args={[0.5, 0.5, 0.25, 32]} />
          : <RoundedBoxGeometry args={[0.9, 0.9, 0.25]} radius={0.12} />}
        <meshStandardMaterial color={baseHex} roughness={0.45} metalness={0.05} />
      </mesh>
      <RaisedGlyph char={ch} color={letterHex} size={0.5} />
    </group>
  ))}
</Canvas>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| r3f v8 for React 18 | r3f v9 for React 19 | v9 released 2024-2025 as the React-19-compat major [CITED: WebSearch — "R3F v8 is not compatible with React 19 or Next 15... use the R3F v9 RC"] | Installing v8 (or letting a stale tutorial guide the install) will break immediately on this repo's React 19.1.0 |
| `typeface-chakra-petch` npm package | `@fontsource/chakra-petch` | typeface-* packages deprecated in favor of Fontsource [CITED: npmjs.com/package/typeface-chakra-petch] | Irrelevant if troika is used (troika loads the .ttf/.woff directly, no npm font package needed) — only matters if the Text3D/facetype.js path is chosen and a packaged font file is wanted instead of manually sourcing the Google Fonts TTF |

**Deprecated/outdated:**
- Manually writing raw shader strings + `raw-loader` webpack config for `.glsl` files — not relevant to this task (no custom shaders needed for a standard-material lit scene), noted only in case the planner's mental model carries over old three.js/webpack tutorials that required this.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Browser WebGL context cap is "~8-16 concurrent contexts" | Anti-Patterns / Pitfall 1 | If the real cap is lower on some target browser/GPU, even the recommended 1-context-per-preview design could still be at risk if other WebGL usage exists elsewhere on the page — low risk since this repo has no other WebGL usage today |
| A2 | r3f's `<Canvas>` auto-resizes via an internal `ResizeObserver` on its immediate parent, compatible with the existing `100cqw` container-query wrapper | Pitfall 2 | If wrong, the planner needs to add an explicit manual `ResizeObserver` + `camera.updateProjectionMatrix()` + `gl.setSize()` call — more task work than assumed, but a known/standard fallback pattern either way |
| A3 | `@react-three/drei` v10.7.7 ships `Center`, `RoundedBox`-equivalent geometry helpers, and `Text3D`/`Text` components at the top-level named-export API (used in Code Examples) | Code Examples, Standard Stack | If drei's current API surface has renamed/removed any of these, the planner needs to re-check `node_modules/@react-three/drei/index.d.ts` (or the live docs site) before writing task code — this is a cheap, fast check to do at plan time |
| A4 | Chakra Petch (Google Font, SIL OFL 1.1 [CITED: WebSearch summary of Google Fonts licensing]) permits redistributing a converted/subset glyph file (typeface.json or a bundled .ttf in `public/fonts/`) for this commercial store | Standard Stack / State of the Art | OFL generally permits bundling/embedding and even modification (with renaming rules for derivative font *names*, not applicable here since no renamed font is being distributed standalone) — but this was not verified against the actual OFL 1.1 license text this session, only a WebSearch summary |
| A5 | The Turbopack module-resolution issue (GitHub #74277, filed Dec 2024) may already be resolved in the Next.js 15.5.15 version this repo runs | Pitfall 4 | If unresolved, only affects local `npm run dev` DX (workaround: drop `--turbopack` flag), not production `next build`/deploy |

## Open Questions

1. **Should the "raised glyph" look use real extruded geometry (Text3D + facetype.js) instead of the troika fake-extrusion trick?**
   - What we know: troika is simpler (no font conversion step, no new static asset to serve/cache-bust) and sharper at the ~28-56px on-screen cube sizes this component actually renders at (per the CSS version's `clamp(28px, ..., 56px)` sizing).
   - What's unclear: whether the customer-facing "does this look like an actual embossed/raised plastic keycap" bar requires true geometric relief (visible under angled 3D rotation/lighting) rather than a flat-but-shaded illusion — the fake-extrusion trick reads fine head-on but may look flat when the customer rotates the keychain (rotation is presumably part of "realistic, rotatable" per the task framing).
   - Recommendation: prototype the troika fake-extrusion approach first (near-zero setup cost); if visual QA during planning/execution flags it as unconvincing under rotation, fall back to the Text3D/facetype.js path — the one-time Chakra Petch Bold → typeface.json conversion is a single manual step (facetype.js is a static web tool, no build-time dependency), not a recurring cost.

2. **Exact upper bound on `maxLength` across all configurable-text products (not just locked keychain fields at 8), and whether the 3D version needs a hard performance cap distinct from the admin-configurable schema cap.**
   - What we know: `keychain-fields.ts` hardcodes `maxLength: 8` for the locked keychain product type; the generic configurable-product text field schema (`config-fields.ts`) allows an admin-set `maxLength` up to `200` [VERIFIED: grep of `src/lib/config-fields.ts` — `z.number().int().min(1).max(200)`], and `configurable-product-data.ts` shows a `20`-char fallback default for non-keychain configurables with a text field.
   - What's unclear: whether any live/planned product actually uses a text field near the 200-char schema ceiling for a component that would render one 3D mesh + text group per character — that would be a real performance cliff (200 meshes in one scene) even in the "one shared Canvas" design.
   - Recommendation: planner should add an explicit cap (e.g., render 3D meshes for the first N ~20-24 characters, silently fall back to the existing CSS row beyond that) rather than assuming `maxLength` is always small just because the keychain use case is 8.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| npm registry reachability | Installing `three`/`@react-three/fiber`/`@react-three/drei`/`troika-three-text` | Confirmed reachable this session via `npm view` | — | — |
| Turbopack (`next dev --turbopack`) compatibility with drei | Local dev DX only | Unverified against this repo's exact Next 15.5.15 build — see Pitfall 4 | — | Drop `--turbopack` flag for local dev if module resolution errors appear; no impact on `next build`/production |

No hard-blocking missing dependencies. This is a pure npm-package addition with no external service, no new env vars, no new build step (beyond the existing `next build`).

## Sources

### Primary (HIGH confidence)
- npm registry `npm view three version` → `0.185.1`
- npm registry `npm view @react-three/fiber version` → `9.6.1`, `npm view @react-three/fiber peerDependencies` → `{react: ">=19 <19.3", react-dom: ">=19 <19.3", three: ">=0.156", ...}`
- npm registry `npm view @react-three/drei version` → `10.7.7`, `peerDependencies` → `{react: "^19", react-dom: "^19", three: ">=0.159", "@react-three/fiber": "^9.0.0"}`
- npm registry `npm view @react-three/drei sideEffects` → `false` (confirms tree-shaking works via standard named imports, no need for deep subpath imports like `@react-three/drei/core/Text3D`)
- npm registry `npm view troika-three-text version` → `0.52.4`
- npm registry `npm view @types/three version` → `0.185.0`
- Codebase: `src/components/store/keychain-preview.tsx`, `configurable-product-view.tsx`, `configurable-image-gallery.tsx`, `src/lib/config-fields.ts`, `src/lib/keychain-fields.ts`, `src/lib/configurable-product-data.ts`, `src/app/layout.tsx`, `package.json`, `next.config.ts` (read in full this session)

### Secondary (MEDIUM confidence)
- [drei Environment docs](http://drei.docs.pmnd.rs/staging/environment) — presets are CDN-dependent, not production-recommended; `@pmndrs/assets` is the offline alternative
- [drei Text3D docs](https://drei.docs.pmnd.rs/abstractions/text3d) — font-JSON requirement, facetype.js conversion step
- [troika-three-text docs](https://protectwise.github.io/troika/troika-three-text/) — Web Worker SDF generation, no extrusion support
- [r3f v9 migration guide](https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide) — breaking changes from v8
- [@pmndrs/assets npm](https://www.npmjs.com/package/@pmndrs/assets) — self-hosted, base64-inlined HDRI/font/texture assets

### Tertiary (LOW confidence — flag for validation)
- [vercel/next.js#71836](https://github.com/vercel/next.js/issues/71836) — old (Oct 2024) `ReactCurrentOwner` crash, resolved by using r3f v9 instead of v8; included for historical context only
- [vercel/next.js#74277](https://github.com/vercel/next.js/issues/74277) — Turbopack module-resolution issue with drei, Dec 2024, unclear if still reproducible on current Next 15.5.15
- WebSearch summary of Chakra Petch OFL 1.1 licensing (not independently verified against SIL's OFL 1.1 legal text this session)
- Bundlephobia gzip sizes for `three`/`@react-three/fiber`/`@react-three/drei` — Bundlephobia's page did not return machine-readable size data via WebFetch this session; recommend the planner run a real `next build` + bundle analysis (e.g. `@next/bundle-analyzer`) once the dependency is actually installed, rather than trusting any pre-installation size estimate

## Metadata

**Confidence breakdown:**
- Standard stack (versions/peer-deps): HIGH — all four core packages verified live against npm registry this session
- Architecture (SSR pattern, mount-duplication risk): HIGH for the mount-duplication finding (verified by reading the actual codebase files); MEDIUM for the general Next.js dynamic-import pattern (well-established community pattern, not fetched from a single canonical official doc)
- Realistic-look material/lighting guidance: MEDIUM — CITED from drei's own docs on Environment CDN risk, but the specific "MeshStandardMaterial + manual 3-point lights" recommendation is a reasonable/standard synthesis, not benchmarked against a screenshot this session
- Pitfalls: HIGH for the mount-duplication and container-query pitfalls (verified against actual repo code); LOW-MEDIUM for the Turbopack module-resolution pitfall (dated GitHub issue, currency unconfirmed)

**Research date:** 2026-07-07
**Valid until:** ~2026-08-07 (30 days — this is a fast-moving ecosystem; re-verify `@react-three/fiber`'s `react` peer-dep upper bound especially if React ships a 19.3+ release before then)
