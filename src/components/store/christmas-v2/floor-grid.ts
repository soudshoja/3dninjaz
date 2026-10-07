import { Color, Mesh, PlaneGeometry, ShaderMaterial } from "three";

/**
 * Workshop floor: a faint build-plate grid that fades out with distance from
 * the tree. One draw call, no textures. Lines are anti-aliased with fwidth.
 */

const VERTEX = /* glsl */ `
varying vec2 vWorld;
void main() {
  vec4 w = modelMatrix * vec4( position, 1.0 );
  // Offset by half a cell so no grid line runs through the tree axis.
  vWorld = w.xz + 0.5;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying vec2 vWorld;
void main() {
  vec2 g = abs( fract( vWorld - 0.5 ) - 0.5 ) / fwidth( vWorld );
  float line = 1.0 - min( min( g.x, g.y ), 1.0 );
  vec2 g5 = abs( fract( vWorld / 5.0 - 0.5 ) - 0.5 ) / ( fwidth( vWorld ) / 5.0 );
  float major = 1.0 - min( min( g5.x, g5.y ), 1.0 );
  float dist = length( vWorld - 0.5 );
  float fade = smoothstep( 15.0, 2.5, dist );
  float a = ( line * 0.35 + major * 0.55 ) * fade * uStrength;
  gl_FragColor = vec4( uColor, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createFloorGrid(y: number, color: number, strength: number) {
  const geometry = new PlaneGeometry(40, 40);
  geometry.rotateX(-Math.PI / 2);
  const material = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { uColor: { value: new Color(color) }, uStrength: { value: strength } },
    transparent: true,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.y = y;
  mesh.renderOrder = -1;
  return { mesh, geometry, material };
}
