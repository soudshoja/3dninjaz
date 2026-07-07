"use client";

/**
 * Quick task 260707-evn — real react-three-fiber 3D scene for the keychain
 * hero preview (HERO SLOT ONLY — see keychain-preview-3d.tsx for the
 * mount-gating / fallback wrapper, and keychain-preview.tsx for the CSS
 * version still used by the thumbnail miniature + mobile sticky strip).
 *
 * Mirrors keychain-preview.tsx's display/chars/isSwatch logic exactly so the
 * swatch/placeholder/cap-length behavior is pixel-for-pixel identical to the
 * CSS component:
 *   - When text is empty: renders a SINGLE keycap as a colour swatch (no
 *     glyph on it).
 *   - When text has chars: renders exactly chars.length keycaps.
 *
 * Camera framing note (deviation from the plan's literal fixed
 * `position:[0,1.4,6]`): the camera distance is computed from `maxLength`
 * (not the current character count) so the on-screen keycap size stays
 * stable as the customer types — mirroring the CSS version's `clamp(...,
 * 100cqw / (maxLength+1), ...)` sizing, which also keys off maxLength, not
 * the live char count. A literal fixed z=6 clips most real keycap rows
 * (keychain maxLength=8) out of the camera frustum at fov=30 — verified via
 * the Task 2 Playwright screenshots. See SUMMARY for details.
 */

import { Suspense, useRef } from "react";
import { Canvas, useFrame, type RootState } from "@react-three/fiber";
import { RoundedBox, Text } from "@react-three/drei";

const CHAKRA_PETCH_FONT_URL = "/fonts/chakra-petch-bold.ttf";

// Quick task 260707-ctx — fix for 'THREE.WebGLRenderer: Context Lost' on
// Chrome/ANGLE-D3D11/NVIDIA, confirmed via bisection to be caused by
// mounting many (~8+) never-before-seen troika <Text> glyphs in a single
// React commit: each new glyph triggers a synchronous GPU render-to-texture
// + readback (SDF generation), and a tight burst of 8+ of those trips a
// driver TDR that kills the WebGLRenderer's context.
//
// The keychain "Your name" field is locked to `allowedChars: "A-Z"`
// uppercase-only (see src/lib/keychain-fields.ts), so the full glyph set is
// fixed and small. drei's <Text> already has a built-in preload mechanism
// for exactly this: passing a `characters` prop makes it call troika's
// `preloadFont({font, characters}, ...)` wrapped in a `suspend-react` cache
// keyed by `[font, characters]` — shared globally across every <Text>
// instance that passes the same (font, characters) pair, regardless of how
// many KeycapSlot/RaisedGlyph components exist. Passing the full A-Z
// alphabet here means all 16 live <Text> nodes (2 layers x up to 8 slots)
// share ONE cached preload call, and — because they all suspend on the same
// promise — none of them mount (and therefore none call the real
// `.sync()`/SDF-generation path) until that single preload resolves. troika's
// SDF atlas also lives on its own persistent offscreen canvas, entirely
// separate from the r3f renderer's canvas, so any GPU work done during that
// one preload has no live r3f context to lose. By the time the `<Suspense>`
// below actually reveals the keycaps, every A-Z glyph is already cache-hit
// in troika's shared atlas, so the live mount burst does zero SDF
// generation — eliminating the driver TDR trigger. The `<Suspense
// fallback={null}>` boundary is required for this to work: without an
// ancestor boundary the suspended promise has nowhere to unwind to.
const KEYCAP_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// ── Geometry constants ──────────────────────────────────────────────────────
const BODY_DEPTH = 0.28;
const BODY_HALF_DEPTH = BODY_DEPTH / 2; // 0.14
const BODY_RADIUS = 0.09; // RoundedBoxGeometry computes depth-radius*2 as its
// internal extrude depth — radius must stay comfortably below BODY_HALF_DEPTH
// (0.14) or the geometry degenerates to zero/negative extrude depth. 0.09
// leaves a safe 0.10 margin while still reading as a rounded keycap.
const ROUND_BODY_RADIUS = 0.55;

const CLICKER_DEPTH = 0.08;
const CLICKER_RADIUS = 0.02; // same degenerate-depth guard as BODY_RADIUS, scaled to CLICKER_DEPTH
const ROUND_CLICKER_RADIUS = 0.42;
// Inset clicker face recessed slightly into the body (z offset ~-0.02 from
// the body's front face), per plan.
const CLICKER_FRONT_Z = BODY_HALF_DEPTH - 0.02;
const CLICKER_CENTER_Z = CLICKER_FRONT_Z - CLICKER_DEPTH / 2;
// Raised glyph positioned just in front of the clicker face (z offset ~+0.03).
const GLYPH_Z = CLICKER_FRONT_Z + 0.03;

const SLOT_SPACING = 1.15;
const KEYCAP_HALF_WIDTH = 0.55; // matches both round radius and square half-width
const FRAME_MARGIN = 0.6;
const CAMERA_Y = 1.4;
const CAMERA_FOV = 30;

type Shape = "square" | "round";

type Props = {
  text: string;
  baseHex: string;
  clickerHex: string;
  letterHex: string;
  maxLength: number;
  placeholder?: string;
  shape?: Shape;
  onReady?: () => void;
  /** Fired if the WebGL context is lost after `onReady` already fired, so the
   *  wrapper can fall the CSS layer back in rather than leave a blank canvas. */
  onContextLost?: () => void;
};

/** Zoom-to-fit camera distance, computed from maxLength (not live char count)
 *  so keycap size stays visually stable while the customer types — mirrors
 *  the CSS component's maxLength-keyed clamp() sizing. */
function computeCameraZ(maxLength: number): number {
  const slots = Math.max(1, maxLength);
  const halfExtent = ((slots - 1) * SLOT_SPACING) / 2 + KEYCAP_HALF_WIDTH + FRAME_MARGIN;
  const halfAngleRad = (CAMERA_FOV / 2) * (Math.PI / 180);
  const straightLineDistance = halfExtent / Math.tan(halfAngleRad);
  // Camera also sits CAMERA_Y above the origin — solve for the z component
  // of that straight-line distance so the actual framing (accounting for the
  // slight elevated angle) still fits halfExtent horizontally.
  const zSquared = straightLineDistance * straightLineDistance - CAMERA_Y * CAMERA_Y;
  const z = Math.sqrt(Math.max(zSquared, straightLineDistance * 0.5));
  return Math.max(z, 3);
}

/** Fires `onFirstFrame` after the FIRST actual painted frame, not on context
 *  creation. `onCreated` fires as soon as the GL context exists, which with
 *  `frameloop="demand"` can be well before pixels are ever drawn (the initial
 *  render is scheduled async) — signaling "ready" there raced the CSS
 *  cross-fade ahead of real content, and if the context was lost in that
 *  window the canvas was left permanently blank with no way back to the CSS
 *  fallback. `useFrame` only runs on an actual render pass (still true under
 *  "demand"), so this is the earliest point real pixels are guaranteed. */
function FirstFrameSignal({ onFirstFrame }: { onFirstFrame: () => void }) {
  const firedRef = useRef(false);
  useFrame(() => {
    if (!firedRef.current) {
      firedRef.current = true;
      onFirstFrame();
    }
  });
  return null;
}

function RaisedGlyph({ char, color }: { char: string; color: string }) {
  return (
    <group>
      {/* Front face — sharp SDF glyph */}
      <Text
        font={CHAKRA_PETCH_FONT_URL}
        characters={KEYCAP_ALPHABET}
        fontSize={0.5}
        color={color}
        anchorX="center"
        anchorY="middle"
        position={[0, 0, 0.02]}
      >
        {char}
      </Text>
      {/* Back "shadow" layer — same glyph, slightly larger + darker + behind,
          reads as a subtle raised bevel without real 3D geometry.
          NOTE: THREE.Color does not parse 8-digit (alpha-suffixed) hex
          strings — "#00000030" silently fails color parsing. Use a solid
          black fill with fillOpacity for the translucency instead. */}
      <Text
        font={CHAKRA_PETCH_FONT_URL}
        characters={KEYCAP_ALPHABET}
        fontSize={0.5 * 1.04}
        color="#000000"
        fillOpacity={0.3}
        anchorX="center"
        anchorY="middle"
        position={[0, 0, 0]}
      >
        {char}
      </Text>
    </group>
  );
}

function KeycapSlot({
  ch,
  x,
  baseHex,
  clickerHex,
  letterHex,
  shape,
}: {
  ch: string;
  x: number;
  baseHex: string;
  clickerHex: string;
  letterHex: string;
  shape: Shape;
}) {
  return (
    <group position={[x, 0, 0]}>
      {/* Body */}
      {shape === "round" ? (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[ROUND_BODY_RADIUS, ROUND_BODY_RADIUS, BODY_DEPTH, 32]} />
          <meshStandardMaterial color={baseHex} roughness={0.45} metalness={0.05} />
        </mesh>
      ) : (
        <RoundedBox args={[1, 1, BODY_DEPTH]} radius={BODY_RADIUS} smoothness={4}>
          <meshStandardMaterial color={baseHex} roughness={0.45} metalness={0.05} />
        </RoundedBox>
      )}

      {/* Inset clicker face — recessed slightly into the body */}
      {shape === "round" ? (
        <mesh position={[0, 0, CLICKER_CENTER_Z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[ROUND_CLICKER_RADIUS, ROUND_CLICKER_RADIUS, CLICKER_DEPTH, 32]} />
          <meshStandardMaterial color={clickerHex} roughness={0.45} metalness={0.05} />
        </mesh>
      ) : (
        <RoundedBox
          position={[0, 0, CLICKER_CENTER_Z]}
          args={[0.78, 0.78, CLICKER_DEPTH]}
          radius={CLICKER_RADIUS}
          smoothness={4}
        >
          <meshStandardMaterial color={clickerHex} roughness={0.45} metalness={0.05} />
        </RoundedBox>
      )}

      {/* Raised glyph — only when there is a character (matches CSS swatch behavior) */}
      {ch ? (
        <group position={[0, 0, GLYPH_Z]}>
          <RaisedGlyph char={ch} color={letterHex} />
        </group>
      ) : null}
    </group>
  );
}

export default function KeychainPreview3DScene({
  text,
  baseHex,
  clickerHex,
  letterHex,
  maxLength,
  placeholder = "",
  shape = "square",
  onReady,
  onContextLost,
}: Props) {
  // Mirror keychain-preview.tsx's display/chars/isSwatch logic exactly.
  const display = text || placeholder;
  const chars = display.slice(0, maxLength).split("").filter(Boolean);
  const isSwatch = chars.length === 0;
  const cubeCount = isSwatch ? 1 : chars.length;

  const slots = Array.from({ length: cubeCount }, (_, i) => {
    const ch = isSwatch ? "" : chars[i] ?? "";
    const x = i * SLOT_SPACING - ((cubeCount - 1) * SLOT_SPACING) / 2;
    return { ch, x, key: i };
  });

  const cameraZ = computeCameraZ(maxLength);

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, CAMERA_Y, cameraZ], fov: CAMERA_FOV }}
      // preserveDrawingBuffer is required alongside frameloop="demand": with
      // no continuous render loop, the browser clears the WebGL drawing
      // buffer on the next compositing pass unless told to preserve it,
      // which otherwise shows as a blank/transparent canvas once the tab
      // repaints for any other reason (verified via Playwright screenshot —
      // without this flag the hero rendered fully transparent).
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      // Fully static scene (no OrbitControls, no per-frame animation) — a
      // continuous "always" render loop serves no visual purpose here and
      // was observed to trigger WebGL context loss under sustained headless
      // rendering during Playwright verification. "demand" renders once on
      // mount/prop changes (r3f invalidates automatically on scene commits)
      // and otherwise stays idle, which is both cheaper and more stable.
      frameloop="demand"
      onCreated={(state: RootState) => {
        const canvas = state.gl.domElement;
        // Without preventDefault() here, a lost WebGL context is permanent —
        // the spec requires the app to opt in to restoration attempts.
        canvas.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          onContextLost?.();
        });
        canvas.addEventListener("webglcontextrestored", () => {
          state.invalidate(); // force a re-render once the context comes back
        });
      }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 5]} intensity={1.2} />
      <directionalLight position={[-3, -2, 2]} intensity={0.4} />
      {/* Suspense boundary required for the characters-prop preload above:
          all <Text> nodes here suspend on the shared A-Z preload promise, so
          nothing in this subtree (including the "first frame" signal) mounts
          until every glyph is already cached — the live mount burst that
          used to trigger context loss now does zero SDF generation. */}
      <Suspense fallback={null}>
        <FirstFrameSignal onFirstFrame={() => onReady?.()} />
        {slots.map((slot) => (
          <KeycapSlot
            key={slot.key}
            ch={slot.ch}
            x={slot.x}
            baseHex={baseHex}
            clickerHex={clickerHex}
            letterHex={letterHex}
            shape={shape}
          />
        ))}
      </Suspense>
    </Canvas>
  );
}
