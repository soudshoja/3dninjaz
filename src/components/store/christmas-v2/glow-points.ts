import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Points,
  ShaderMaterial,
} from "three";

/**
 * Fairy-light twinkles: one Points draw call each. All motion (drift, twinkle,
 * appear) runs in the vertex shader from a time uniform, so the JS side never
 * touches per-point data after setup.
 */

export type GlowPoint = {
  x: number;
  y: number;
  z: number;
  color: Color;
  /** World-unit diameter at full brightness. */
  size: number;
  /** 0..1 random seed for phase and speed. */
  seed: number;
  /** Seconds after the reveal clock starts before this point fades in. */
  delay: number;
};

const VERTEX = /* glsl */ `
attribute vec3 aColor;
attribute float aSeed;
attribute float aSize;
attribute float aDelay;
uniform float uTime;
uniform float uAppear;
uniform float uScale;
uniform float uDrift;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 p = position;
  p.x += sin( uTime * 0.55 + aSeed * 40.0 ) * uDrift;
  p.y += cos( uTime * 0.45 + aSeed * 57.0 ) * uDrift * 1.3;
  vec4 mv = modelViewMatrix * vec4( p, 1.0 );
  float tw = 0.55 + 0.45 * sin( uTime * ( 1.3 + aSeed * 1.7 ) + aSeed * 31.0 );
  float app = clamp( ( uAppear - aDelay ) / 0.6, 0.0, 1.0 );
  app = 1.0 - pow( 1.0 - app, 3.0 );
  vAlpha = tw * app;
  vColor = aColor;
  gl_PointSize = clamp( aSize * ( 0.75 + 0.45 * tw ) * app * uScale / max( 0.001, - mv.z ), 0.0, 96.0 );
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length( c ) * 2.0;
  float core = smoothstep( 1.0, 0.0, d );
  float glow = core * core;
  float streak = exp( - abs( c.x ) * 26.0 ) * exp( - abs( c.y ) * 3.5 ) + exp( - abs( c.y ) * 26.0 ) * exp( - abs( c.x ) * 3.5 );
  float a = ( glow + streak * 0.35 ) * vAlpha;
  gl_FragColor = vec4( vColor * 1.25, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export type GlowPoints = {
  points: Points;
  material: ShaderMaterial;
  geometry: BufferGeometry;
  setScale: (pxPerUnit: number) => void;
  setTime: (t: number) => void;
  setAppear: (s: number) => void;
};

export function createGlowPoints(items: GlowPoint[], drift: number): GlowPoints {
  const n = items.length;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  const size = new Float32Array(n);
  const delay = new Float32Array(n);
  items.forEach((it, i) => {
    pos.set([it.x, it.y, it.z], i * 3);
    col.set([it.color.r, it.color.g, it.color.b], i * 3);
    seed[i] = it.seed;
    size[i] = it.size;
    delay[i] = it.delay;
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geometry.setAttribute("aColor", new Float32BufferAttribute(col, 3));
  geometry.setAttribute("aSeed", new Float32BufferAttribute(seed, 1));
  geometry.setAttribute("aSize", new Float32BufferAttribute(size, 1));
  geometry.setAttribute("aDelay", new Float32BufferAttribute(delay, 1));

  const material = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uAppear: { value: 0 },
      uScale: { value: 400 },
      uDrift: { value: drift },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  const points = new Points(geometry, material);
  // Drift moves points a little past their stored bounds; skip culling.
  points.frustumCulled = false;

  return {
    points,
    material,
    geometry,
    setScale: (v) => {
      material.uniforms.uScale.value = v;
    },
    setTime: (t) => {
      material.uniforms.uTime.value = t;
    },
    setAppear: (s) => {
      material.uniforms.uAppear.value = s;
    },
  };
}
