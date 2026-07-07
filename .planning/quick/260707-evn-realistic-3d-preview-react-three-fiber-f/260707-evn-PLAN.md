---
phase: quick-260707-evn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - package-lock.json
  - public/fonts/chakra-petch-bold.ttf
  - src/components/store/keychain-preview-3d-scene.tsx
  - src/components/store/keychain-preview-3d.tsx
  - src/components/store/configurable-image-gallery.tsx
  - src/components/store/configurable-product-view.tsx
autonomous: true
requirements: [QUICK-260707-evn]
must_haves:
  truths:
    - "On a keychain/configurable-text PDP, the hero slot renders a real WebGL <canvas> 3D scene (meshes + lit materials + a raised glyph), not the flat CSS cube row, once it mounts"
    - "The desktop thumbstrip 'Yours' miniature and the mobile sticky-preview-strip still render the original CSS KeychainPreview — total WebGL contexts on the page stays at 1 (hero only), never 2-3"
    - "Typing a name / picking colours updates the hero 3D preview live, from the exact same values/state that already drive the thumbnail + sticky strip"
    - "shape='square' renders a rounded-box keycap body; shape='round' renders a cylindrical body — visually distinct in the 3D scene"
    - "Empty text + a non-empty placeholder renders exactly one swatch mesh with no glyph (matches CSS swatch behavior); text/placeholder beyond ~20 rendered characters falls back to the CSS KeychainPreview instead of mounting more meshes"
    - "First paint never shows a blank/black canvas — the CSS preview is visible immediately and cross-fades to the WebGL scene once it reports ready"
    - "npx tsc --noEmit and npm run build both pass with the new dependencies bundled; npm run dev boots without an unresolved-module error for @react-three/fiber or @react-three/drei (or the Turbopack workaround is explicitly documented in the SUMMARY, not silently patched into package.json)"
  artifacts:
    - path: "src/components/store/keychain-preview-3d-scene.tsx"
      provides: "r3f <Canvas> scene: lights, per-shape keycap meshes, troika/drei raised-glyph <Text>, onReady callback"
      contains: "Canvas"
    - path: "src/components/store/keychain-preview-3d.tsx"
      provides: "\"use client\" wrapper — IntersectionObserver mount-gating, hard char-count cap fallback to CSS KeychainPreview, next/dynamic(ssr:false) code-split, CSS-to-WebGL cross-fade"
      contains: "IntersectionObserver"
    - path: "public/fonts/chakra-petch-bold.ttf"
      provides: "Static font asset for troika-three-text's font prop (next/font/google's hashed output is not usable here)"
      min_lines: 1
    - path: "src/components/store/configurable-image-gallery.tsx"
      provides: "thumbSlot prop — decouples the hero preview node from the thumbnail-miniature preview node so they can render different components"
      contains: "thumbSlot"
    - path: "src/components/store/configurable-product-view.tsx"
      provides: "Hero previewNode now uses KeychainPreview3D; thumbnail node + mobile sticky-strip instantiation still use KeychainPreview (CSS)"
      contains: "KeychainPreview3D"
  key_links:
    - from: "src/components/store/configurable-product-view.tsx"
      to: "src/components/store/keychain-preview-3d.tsx"
      via: "heroPreviewNode passes {text,baseHex,clickerHex,letterHex,maxLength,placeholder,shape} — identical prop set to KeychainPreview"
      pattern: "KeychainPreview3D"
    - from: "src/components/store/keychain-preview-3d.tsx"
      to: "src/components/store/keychain-preview-3d-scene.tsx"
      via: "next/dynamic(() => import(...), { ssr:false }) — code-splits three/r3f/drei/troika out of the main PDP chunk"
      pattern: "dynamic\\("
    - from: "src/components/store/configurable-image-gallery.tsx"
      to: "src/components/store/configurable-product-view.tsx"
      via: "previewSlot (hero, 3D) and thumbSlot (thumbnail mini, CSS) are now two separate React nodes instead of one shared node rendered twice"
      pattern: "thumbSlot ?? previewSlot"
---

<objective>
Replace the CSS-cube keychain preview in the PDP **hero slot only** with a real react-three-fiber 3D scene (lit meshes + a raised glyph), while the desktop thumbstrip miniature and the mobile sticky-preview-strip keep using the existing CSS `KeychainPreview` component untouched. This is the single biggest constraint from RESEARCH.md: the hero's `previewSlot` React node is today rendered **twice** inside `ConfigurableImageGallery` (hero + thumbnail mini) and `KeychainPreview` is instantiated a **third** time for the mobile sticky strip — a naive 1:1 swap would mount 2-3 concurrent WebGL contexts for one logical preview.

Purpose: Give customers a materially more realistic live preview of their keychain (lit 3D keycaps + raised lettering) without regressing performance, without touching the two smaller/cheap mount points, and without breaking SSR or the Turbopack dev server.

Output:
- `src/components/store/keychain-preview-3d-scene.tsx` — the actual r3f `<Canvas>` scene (new)
- `src/components/store/keychain-preview-3d.tsx` — `"use client"` wrapper: mount-gating, hard render cap, cross-fade (new)
- `public/fonts/chakra-petch-bold.ttf` — static font asset for the 3D glyph (new)
- `src/components/store/configurable-image-gallery.tsx` — gains a `thumbSlot` prop so the hero and thumbnail mini can render different components (edit)
- `src/components/store/configurable-product-view.tsx` — hero uses `KeychainPreview3D`; thumbnail + mobile sticky strip keep `KeychainPreview` (edit)
- `three@0.185.1`, `@react-three/fiber@9.6.1`, `@react-three/drei@10.7.7`, `troika-three-text@0.52.4` added to `package.json`

Scope guardrails (do NOT do):
- Do NOT touch the thumbstrip "Yours" miniature render path or the mobile sticky-strip `<KeychainPreview>` instantiation (`configurable-product-view.tsx` ~L557-571) — both must keep rendering the CSS component, byte-identical to today.
- Do NOT add `<Environment preset="...">` (fetches an HDRI from a GitHub-hosted CDN at runtime — bad fit for this self-hosted, no-CDN deploy). Use manual lights only.
- Do NOT add interactive drag-to-rotate/orbit controls — out of scope; camera is static (a fixed, slightly elevated angle so the raised glyph and bevels read as 3D, not requiring user interaction).
- Do NOT silently edit the committed `npm run dev` script to drop `--turbopack` — if the Turbopack module-resolution pitfall reproduces, document the workaround in the SUMMARY and use `next dev` (no flag) for your own local verification only.
- Do NOT reduce the hard-cap fallback to something other than "render the real, unmodified CSS KeychainPreview" — no placeholder, no "coming soon" text.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/quick/260707-evn-realistic-3d-preview-react-three-fiber-f/260707-evn-RESEARCH.md

<critical_project_conventions>
- Next.js 15 App Router, React 19.1.0, Tailwind v4. Self-hosted cPanel deploy, no CDN in front — this is WHY no `<Environment preset>` (drei fetches HDRIs from a GitHub CDN at request time).
- `npm run dev` = `next dev --turbopack` (package.json L6). `npm run build` uses default webpack (unaffected by the Turbopack drei/r3f resolution issue either way).
- Dev-first: this ships on a feature branch for PR into `dev` (never push straight to `dev`/`master`; repo has branch protection requiring PR + green CI). Do not attempt to deploy from this plan.
- Chakra Petch is loaded via `next/font/google` in `src/app/layout.tsx` (self-hosted, build-hashed output path) — NOT usable as a stable URL for `troika-three-text`'s `font` prop. A static `.ttf` must be added under `public/` instead (served automatically at the matching `/...` URL, no next.config.ts change needed).
- Local dev DB access requires an SSH tunnel to the remote MariaDB (laptop cannot reach it directly) — see project memory "Local dev needs SSH DB tunnel". Needed for Task 2's live PDP screenshots.
</critical_project_conventions>

<interfaces>
<!-- Current KeychainPreview contract — the new 3D component MUST match this exactly (src/components/store/keychain-preview.tsx L33-50) -->
```ts
type Props = {
  text: string;
  baseHex: string;
  clickerHex: string;
  letterHex: string;
  maxLength: number;
  placeholder?: string;          // default ""
  shape?: "square" | "round";    // default "square"
};
export function KeychainPreview({ text, baseHex, clickerHex, letterHex, maxLength, placeholder = "", shape = "square" }: Props): JSX.Element
```
Existing display/char logic to mirror exactly (keychain-preview.tsx L52-66):
```ts
const display = text || placeholder;
const chars = display.slice(0, maxLength).split("").filter(Boolean);
const isSwatch = chars.length === 0;   // empty text + no/empty placeholder → single swatch cube, no glyph
const cubeCount = isSwatch ? 1 : chars.length;
```

<!-- ConfigurableImageGallery current Props (configurable-image-gallery.tsx L27-41) — previewSlot is rendered TWICE: hero slide (L192-200) and "Yours" thumbnail mini (L326-342, scaled 0.2x). This is Pitfall 1 from RESEARCH.md. -->
```ts
type Props = {
  displayImages: string[];
  imageCaptions?: (string | null | undefined)[];
  pictures?: PictureData[];
  showPreview: boolean;
  onTogglePreview: (yours: boolean) => void;
  previewSlot: React.ReactNode;   // ADD a sibling `thumbSlot?: React.ReactNode` — see Task 2
};
```
Hero slide render site (L192-200, keep exactly as-is — still renders `previewSlot`):
```tsx
<div className="shrink-0 w-full snap-start aspect-[4/5] relative flex items-center justify-center" style={{ containerType: "inline-size" }} aria-hidden={currentIdx !== 0}>
  <div className="w-full h-full flex items-center justify-center">{previewSlot}</div>
</div>
```
Thumbnail mini render site (L326-342) — this is the ONE line to change, from `{previewSlot}` to `{thumbSlot ?? previewSlot}`:
```tsx
<div className="relative w-14 h-14 overflow-hidden" aria-hidden="true">
  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) scale(0.2)", transformOrigin: "center center", width: "500%" }}>
    {previewSlot}
  </div>
</div>
```

<!-- configurable-product-view.tsx current single previewNode (L394-420) — used at ONE call site, previewSlot={previewNode} inside <ConfigurableImageGallery> (~L472-479). The mobile sticky-strip block (L557-571) is a SEPARATE, already-independent <KeychainPreview> instantiation — do not touch it. -->
```tsx
const previewNode = (
  <div ref={previewRef} className="w-full flex items-center justify-center">
    {product.productType === "vending" ? (
      <VendingPreview primaryHex={baseHex} secondaryHex={clickerHex} />
    ) : (
      <KeychainPreview
        text={textValue} baseHex={baseHex} clickerHex={clickerHex} letterHex={letterHex}
        maxLength={maxLength}
        placeholder={product.productType === "keychain" || textFields.length > 0 ? "YOURTEXT" : ""}
        shape={product.keychainShape ?? "square"}
      />
    )}
  </div>
);
// ...
<ConfigurableImageGallery ... previewSlot={previewNode} />
```
`textValue`, `baseHex`, `clickerHex`, `letterHex`, `maxLength`, `product.keychainShape`, `product.productType`, `textFields` are all already computed above this block (L300-325) — reuse them as-is, do not recompute.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install r3f stack + build KeychainPreview3D (scene + mount-gating wrapper)</name>
  <files>package.json, package-lock.json, public/fonts/chakra-petch-bold.ttf, src/components/store/keychain-preview-3d-scene.tsx, src/components/store/keychain-preview-3d.tsx</files>
  <action>
**1. Install dependencies at the RESEARCH.md-verified pinned versions:**
```
npm install three@0.185.1 @react-three/fiber@9.6.1 @react-three/drei@10.7.7 troika-three-text@0.52.4
npm install -D @types/three@0.185.0
```
Do not use `--legacy-peer-deps`/`--force` speculatively — if npm reports a real peer conflict, read it and resolve deliberately (React 19.1.0 satisfies r3f's `>=19 <19.3` peer range today, so none is expected).

**2. Acquire the font asset.** troika-three-text's `font` prop needs a direct URL to a `.ttf`/`.otf`/`.woff` file — `next/font/google`'s self-hosted output has a build-hashed path and is not usable here. Download Chakra Petch Bold (OFL-1.1, redistribution permitted) from the Google Fonts source repo:
```
curl -fsSL -o public/fonts/chakra-petch-bold.ttf https://github.com/google/fonts/raw/main/ofl/chakrapetch/ChakraPetch-Bold.ttf
```
Verify the downloaded file is a real font (non-trivial size, e.g. `ls -la public/fonts/chakra-petch-bold.ttf` reports several KB — not an HTML error page). If that exact path 404s, locate the correct path in the `google/fonts` repo (family folder is `ofl/chakrapetch/`) and use it instead. Create the `public/fonts/` directory if it doesn't exist.

**3. Build `src/components/store/keychain-preview-3d-scene.tsx`** (new file, `"use client"`, default export — required for `next/dynamic`):
- Props: same 7 fields as `KeychainPreview` above, PLUS an optional `onReady?: () => void`.
- Mirror the exact `display`/`chars`/`isSwatch` logic shown in the interfaces block above (do not diverge — this keeps swatch/placeholder/cap-length behavior identical to the CSS version).
- `<Canvas dpr={[1, 2]} camera={{ position: [0, 1.4, 6], fov: 30 }} gl={{ antialias: true, alpha: true }} onCreated={() => onReady?.()}>` — static camera, no OrbitControls (out of scope).
- Lights: `<ambientLight intensity={0.6} />`, `<directionalLight position={[3,4,5]} intensity={1.2} />`, `<directionalLight position={[-3,-2,2]} intensity={0.4} />`. Do NOT add `<Environment preset>` — CDN dependency, not appropriate for this deploy.
- For each rendered character (or the single swatch slot when `isSwatch`), render a `<group position={[i * 1.15 - (count-1) * 1.15/2, 0, 0]}>` containing:
  - **Body mesh** — `MeshStandardMaterial` `color={baseHex}` `roughness={0.45}` `metalness={0.05}`. `shape === "round"`: `<mesh><cylinderGeometry args={[0.55, 0.55, 0.28, 32]} /><meshStandardMaterial .../></mesh>`. `shape === "square"` (default): prefer drei's `<RoundedBox args={[1, 1, 0.28]} radius={0.14} smoothness={4}><meshStandardMaterial .../></RoundedBox>` — first confirm the export exists (`grep -n "RoundedBox" node_modules/@react-three/drei/index.d.ts` or equivalent); if it's missing/renamed in 10.7.7, fall back to `extend({ RoundedBoxGeometry })` from `three/examples/jsm/geometries/RoundedBoxGeometry.js` used via a plain `<mesh><roundedBoxGeometry args={[1,1,0.28,2,0.14]} /><meshStandardMaterial .../></mesh>`, or as a last resort a plain `<boxGeometry args={[1,1,0.28]} />`. Document whichever path was actually used in the SUMMARY.
  - **Inset clicker face** — a second, smaller mesh recessed slightly into the body (z offset ~-0.02 relative to the body's front face), same geometry family as the body but smaller footprint (round: radius 0.42; square: ~0.78×0.78), `color={clickerHex}`, same material settings. This reproduces the CSS version's "inset 5px lip" read.
  - **Raised glyph** — skip entirely when the char is empty (swatch state, no glyph — matches CSS). Otherwise render drei's `<Text>` (wraps troika) positioned just in front of the clicker face (z offset ~+0.03): `font="/fonts/chakra-petch-bold.ttf"`, `fontSize={0.5}`, `color={letterHex}`, `anchorX="center"`, `anchorY="middle"`. Add a second, slightly larger (`fontSize * 1.04`), darker (`"#00000030"`), directly-behind copy per RESEARCH.md's "fake extrusion" pattern (Code Examples section) so the glyph reads as subtly raised.
- Keep the whole file focused on scene composition only — no IntersectionObserver, no dynamic import, no cap logic here (that's the wrapper's job in step 4).

**4. Build `src/components/store/keychain-preview-3d.tsx`** (new file, `"use client"`) — this is the file the rest of the app imports:
```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { KeychainPreview } from "./keychain-preview";

const MAX_3D_CHARS = 20; // beyond this, fall back to CSS — perf cap (RESEARCH.md Open Question 2)

const Scene = dynamic(() => import("./keychain-preview-3d-scene"), { ssr: false });

type Props = { text: string; baseHex: string; clickerHex: string; letterHex: string; maxLength: number; placeholder?: string; shape?: "square" | "round"; };

export function KeychainPreview3D(props: Props) {
  const { text, placeholder = "", maxLength } = props;
  const display = text || placeholder;
  const effectiveCount = Math.max(1, display.slice(0, maxLength).length);
  const overCap = effectiveCount > MAX_3D_CHARS;

  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setInView(true); io.disconnect(); } }, { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (overCap) return <KeychainPreview {...props} />;

  return (
    <div ref={containerRef} className="relative w-full" style={{ aspectRatio: "1 / 1" }}>
      <div className="absolute inset-0 transition-opacity duration-300" style={{ opacity: ready ? 0 : 1 }}>
        <KeychainPreview {...props} />
      </div>
      {inView && (
        <div className="absolute inset-0 transition-opacity duration-300" style={{ opacity: ready ? 1 : 0 }}>
          <Scene {...props} onReady={() => setReady(true)} />
        </div>
      )}
    </div>
  );
}
```
This is illustrative, not gospel — keep the four behaviors intact (cap fallback, IO mount-gating, CSS always mounted underneath, cross-fade on `onReady`), adjust styling/aspect-ratio to fit inside the existing `containerType: "inline-size"` hero wrapper cleanly (test against Pitfall 2 — the Canvas's parent must be the sized element r3f's internal ResizeObserver watches; don't introduce an extra unsized wrapper layer between this component's root and the hero's `100cqw` container).

**5. Turbopack smoke test (RESEARCH.md Pitfall 4) — do this NOW, before Task 2 wires anything in:** temporarily render `<KeychainPreview3D text="TEST" baseHex="#71717a" clickerHex="#52525b" letterHex="#ffffff" maxLength={8} shape="square" />` somewhere reachable (e.g. swap it in ad hoc on any existing keychain PDP route, or a scratch route), then run `npm run dev` and load that route in a browser or via `curl`. If you see "Module not found: Can't resolve '@react-three/fiber'" (or `@react-three/drei`), this is the known dev-only Turbopack issue — for the REST of your own local verification in this task, run `next dev` (no `--turbopack` flag) instead, and note this clearly in the SUMMARY as an accepted workaround. Do NOT edit the committed `npm run dev` script in package.json to drop `--turbopack` — flag it, don't silently patch it. `npm run build` (webpack) is unaffected either way. Revert any throwaway test wiring before moving to Task 2 (Task 2 does the real wiring).
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run build</automated>
  </verify>
  <done>three/@react-three/fiber/@react-three/drei/troika-three-text are installed at the pinned versions; public/fonts/chakra-petch-bold.ttf exists and is a valid font file; keychain-preview-3d-scene.tsx renders a lit, per-shape row of keycap meshes with a raised troika glyph and calls onReady via Canvas's onCreated; keychain-preview-3d.tsx exports KeychainPreview3D with the IntersectionObserver gate, MAX_3D_CHARS=20 cap fallback to the real CSS KeychainPreview, and a cross-fade between the always-mounted CSS layer and the dynamically-imported Scene; the Turbopack smoke test was run and its outcome (works / needs no-turbopack workaround) is noted for the SUMMARY; tsc and build both pass.</done>
</task>

<task type="auto">
  <name>Task 2: Wire hero-only replacement + local dev-server Playwright visual verification</name>
  <files>src/components/store/configurable-image-gallery.tsx, src/components/store/configurable-product-view.tsx</files>
  <action>
**1. `configurable-image-gallery.tsx`:** add `thumbSlot?: React.ReactNode;` to the `Props` type (sibling to `previewSlot`, doc-comment: "Optional separate node for the thumbnail miniature; defaults to previewSlot if omitted — lets the hero and thumbnail render different components (e.g. a 3D hero vs a cheap CSS thumbnail) without mounting the hero's component twice."). Destructure it in the function signature. Change ONLY the thumbnail mini render site (~L340, shown in context interfaces above) from `{previewSlot}` to `{thumbSlot ?? previewSlot}`. Leave the hero slide render site (~L198) untouched — it keeps rendering `{previewSlot}`.

**2. `configurable-product-view.tsx`:** import `KeychainPreview3D` from `"./keychain-preview-3d"`. Replace the single `previewNode` block with two nodes built from a shared small helper so they can't drift apart:
```tsx
function renderPreviewInner(use3d: boolean) {
  if (product.productType === "vending") {
    return <VendingPreview primaryHex={baseHex} secondaryHex={clickerHex} />;
  }
  const Comp = use3d ? KeychainPreview3D : KeychainPreview;
  return (
    <Comp
      text={textValue} baseHex={baseHex} clickerHex={clickerHex} letterHex={letterHex}
      maxLength={maxLength}
      placeholder={product.productType === "keychain" || textFields.length > 0 ? "YOURTEXT" : ""}
      shape={product.keychainShape ?? "square"}
    />
  );
}
const heroPreviewNode = (
  <div ref={previewRef} className="w-full flex items-center justify-center">{renderPreviewInner(true)}</div>
);
const thumbPreviewNode = (
  <div className="w-full flex items-center justify-center">{renderPreviewInner(false)}</div>
);
```
Update the `<ConfigurableImageGallery>` call to pass both: `previewSlot={heroPreviewNode} thumbSlot={thumbPreviewNode}`. Do NOT touch the mobile sticky-strip block (~L557-571) — it keeps its own independent `<KeychainPreview>` instantiation exactly as today. `VendingPreview` is unaffected either way (not part of this task's scope — vending PDP hero stays as-is, only the keychain/configurable-text branch gets the 3D swap).

**3. Local dev-server Playwright visual verification** (constraint-mandated — tsc/build passing is NOT sufficient proof here):
- If the Turbopack smoke test in Task 1 required the no-turbopack workaround, run `next dev` (no flag) for this verification; otherwise `npm run dev` is fine.
- Set up the SSH tunnel to the dev DB per project convention (local laptop cannot reach the remote MariaDB directly), override `DATABASE_URL` to point at the tunnel, then start the dev server.
- Query the dev DB for a live keychain-type product of each shape to get real slugs (do not assume stale slugs are still valid): `SELECT slug, keychainShape FROM products WHERE productType='keychain'` — pick one `square` and one `round` row (as of 2026-07-05 these were `pancake-clicker-mogqlfp6` square and `clicker-mr73pik6` round; re-verify, don't assume).
- Write a throwaway Playwright script (install `playwright` as a devDependency if not already present: `npm install -D playwright && npx playwright install chromium`) that, for BOTH product slugs, against `http://localhost:3000/products/<slug>`:
  1. Screenshots the hero preview area (`[data-keychain-preview]` or its new 3D container) in its default/empty-text swatch-placeholder state.
  2. Types a short name (e.g. "SOUD") into the name field, waits briefly for the cross-fade, and screenshots again.
  3. Asserts a `<canvas>` element exists inside the hero container (confirms the WebGL scene actually mounted, not just the CSS fallback stuck forever) — e.g. `await page.locator('[data-keychain-preview-3d] canvas, .relative canvas').count()` or equivalent selector matching your actual wrapper markup.
- That's 4 screenshots total (square×empty, square×typed, round×empty, round×typed). Save them under the scratchpad, then use the Read tool to view each one and confirm: canvas rendered (not a blank/black square), the round vs square body shapes are visually distinct, the glyph appears only in the typed-text screenshots (not the swatch ones), and lighting reads as a lit 3D object rather than a flat texture.
- The `MAX_3D_CHARS` cap fallback: keychain products are locked to `maxLength=8` and cannot reach the 20-char cap through live product data, so a live-product E2E screenshot of the cap path is not required — instead confirm by code inspection that the `overCap` branch exists and returns the unmodified `<KeychainPreview>` (already covered by Task 1's file contents).
- Delete the throwaway Playwright script after use unless you judge it worth keeping for future visual-regression checks (note either way in the SUMMARY).
  </action>
  <verify>
    <automated>npx tsc --noEmit; then run the Playwright script created in this task against the local dev server and confirm 4 screenshots are produced (square/round × empty-swatch/typed-text) with a &lt;canvas&gt; element present in the hero container in every shot</automated>
  </verify>
  <done>configurable-image-gallery.tsx has a thumbSlot prop used only at the thumbnail-mini render site; configurable-product-view.tsx's hero renders KeychainPreview3D while the thumbnail node and the untouched mobile sticky-strip render the CSS KeychainPreview; local dev-server Playwright screenshots confirm a real WebGL canvas renders in the hero for both shapes, in both empty and typed-text states, with no black/blank-canvas flash and no glyph in the swatch state; tsc passes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Customer browser (GPU/WebGL resource boundary) | The only boundary this feature touches — 100% client-rendered, no new server surface, no new user input beyond what already flows into the existing CSS KeychainPreview |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-evn-01 | Denial of Service (client resource exhaustion) | `keychain-preview-3d.tsx` mesh count | mitigate | `MAX_3D_CHARS = 20` hard cap — any configurable-text field allowing up to 200 chars falls back to the cheap CSS component instead of instantiating up to 200 meshes in one scene |
| T-evn-02 | Denial of Service (WebGL context exhaustion) | Hero + thumbnail mini + mobile sticky strip | mitigate | Only the hero mounts a `<canvas>` (via the new `thumbSlot` prop split); thumbnail mini and mobile sticky strip keep rendering the CSS component — total concurrent WebGL contexts per page stays at 1, never 2-3 |
| T-evn-03 | Information Disclosure / Injection (glyph rendering) | Customer-typed text rendered via troika SDF text | accept | Text is rasterized to a WebGL texture/mesh, never interpolated into HTML/DOM — no XSS surface; identical trust level to the existing CSS `textShadow` rendering of the same string |
| T-evn-04 | Tampering (hex colour values) | `baseHex`/`clickerHex`/`letterHex` passed to `meshStandardMaterial color=` | accept | Same values already flow unmodified into the existing CSS component's inline `background`/`color` styles today; three.js's `Color` parser does not execute code, no new attack surface introduced |
</threat_model>

<verification>
- `npx tsc --noEmit` clean and `npm run build` succeeds with the four new dependencies bundled.
- Turbopack dev-server outcome documented in the SUMMARY (works cleanly, or the no-`--turbopack` workaround is noted — not silently patched into package.json).
- Local dev-server Playwright pass produces 4 screenshots (square/round × empty-swatch/typed-text), each showing a real `<canvas>`-rendered 3D scene, reviewed via the Read tool.
- `git diff` on `configurable-image-gallery.tsx` and `configurable-product-view.tsx` shows the thumbnail-mini render site and the mobile sticky-strip block are otherwise unchanged (only the hero swap + `thumbSlot` prop addition).
</verification>

<success_criteria>
- Hero preview slot on keychain/configurable-text PDPs renders a real r3f/three.js WebGL scene with lit materials and a raised glyph, replacing the CSS cube row.
- Thumbnail miniature and mobile sticky-preview-strip are provably unchanged (still CSS, still one shared `KeychainPreview` usage pattern as before) — page never mounts more than 1 WebGL context.
- `shape="square"` and `shape="round"` are visually distinct in 3D.
- Swatch/placeholder/cap-length behavior matches the CSS component exactly (same `display`/`chars`/`isSwatch` logic).
- No SSR breakage; Turbopack dev-server behavior documented either way.
- `npx tsc --noEmit` and `npm run build` both green.
</success_criteria>

<output>
After completion, create `.planning/quick/260707-evn-realistic-3d-preview-react-three-fiber-f/260707-evn-SUMMARY.md`
</output>
