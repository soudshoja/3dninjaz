/**
 * Pure tree maths shared by the server-rendered counter ("Layer 0 of N") and
 * the three.js scene. No three.js import here, so it costs nothing in the
 * first bundle.
 */

export const LAYER_PITCH = 0.07;
export const TUBE_RADIUS = 0.05;
export const BED_TOP = -0.45;
export const TRUNK_RADIUS = 0.32;

export const TIERS = [
  { y0: 0.25, y1: 1.95, r: 2.0 },
  { y0: 1.45, y1: 3.05, r: 1.6 },
  { y0: 2.55, y1: 4.05, r: 1.2 },
  { y0: 3.55, y1: 4.95, r: 0.8 },
] as const;

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

export type LayerSpec = {
  y: number;
  r: number;
  /** 0 at the bed, 1 at the top of the tree (used for the green ramp). */
  k: number;
  trunk: boolean;
  /** Alternating brightness so the layer lines read as a print. */
  band: number;
};

/** Trunk rings first, then the tiers, bottom to top. */
export function buildLayerSpecs(): LayerSpec[] {
  const specs: LayerSpec[] = [];
  let n = 0;
  for (let y = BED_TOP + TUBE_RADIUS; y < TIERS[0].y0; y += LAYER_PITCH) {
    specs.push({ y, r: TRUNK_RADIUS, k: 0, trunk: true, band: n++ % 2 ? 0.92 : 1 });
  }
  const top = TIERS[3].y1;
  for (let y = TIERS[0].y0; y <= top; y += LAYER_PITCH) {
    const r = radiusAt(y);
    if (r < 0.05) continue;
    specs.push({
      y,
      r,
      k: (y - TIERS[0].y0) / (top - TIERS[0].y0),
      trunk: false,
      band: n++ % 2 ? 0.92 : 1,
    });
  }
  return specs;
}

export const LAYER_COUNT = buildLayerSpecs().length;

/**
 * Share of the scroll travel spent printing. The rest is a short hold so the
 * lit tree can be admired before the gift grid scrolls up.
 */
export const PRINT_END = 0.86;
