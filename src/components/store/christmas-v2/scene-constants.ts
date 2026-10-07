/**
 * Shared numbers for the print-farm WebGL scene (variant 2).
 * Colours here are sRGB hex equivalents of the OKLCH tokens in
 * christmas-v2.module.css (three.js cannot read OKLCH).
 */

export const PRINT_SECONDS = 9;
export const LAYER_PITCH = 0.07;
export const TUBE_RADIUS = 0.05;
export const TUBULAR_SEGMENTS = 96;
export const RADIAL_SEGMENTS = 6;
export const INDICES_PER_SEGMENT = RADIAL_SEGMENTS * 6;
export const INDICES_PER_LAYER = TUBULAR_SEGMENTS * INDICES_PER_SEGMENT;

export const BED_TOP = -0.45;
export const BED_RADIUS = 2.75;
export const TRUNK_RADIUS = 0.32;
export const TIERS = [
  { y0: 0.25, y1: 1.95, r: 2.0 },
  { y0: 1.45, y1: 3.05, r: 1.6 },
  { y0: 2.55, y1: 4.05, r: 1.2 },
  { y0: 3.55, y1: 4.95, r: 0.8 },
] as const;

/** World height the camera frames: bed underside to just above the star. */
export const FRAME_HEIGHT = 7.3;
/** World y the camera looks at (middle of the tree). */
export const LOOK_Y = 2.2;

/** Accent (filament orange), the one UI accent, reused as a scene colour. */
export const ACCENT_HEX = 0xff8a2b;
export const ACCENT_HOT_HEX = 0xff6a00;
/** Counter-light only: brand blue, never used as a surface colour. */
export const COUNTER_LIGHT_HEX = 0x1877f2;
export const WARM_WHITE_HEX = 0xfff1de;

/** Filament colours for printed objects and baubles. */
export const FILAMENTS = [0xff8a2b, 0xf4ead8, 0x2e9d5b, 0xffc08a] as const;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const easeOutCubic = (u: number) => 1 - Math.pow(1 - clamp01(u), 3);
/** Playful token: slight overshoot (about 8%) on entrance only. */
export const easeOutBack = (u: number) => {
  const x = clamp01(u);
  const c1 = 1.1;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/** Radius of the tree at height y: the widest tier at that height wins. */
export function radiusAt(y: number): number {
  let r = 0;
  for (const t of TIERS) {
    if (y >= t.y0 && y <= t.y1) {
      const k = (y - t.y0) / (t.y1 - t.y0);
      r = Math.max(r, t.r * (1 - 0.93 * k));
    }
  }
  return r;
}
