import { Color, MeshStandardMaterial, type MeshStandardMaterialParameters } from "three";

/**
 * A standard PBR material with 3D-print layer ridges. Ridges are computed in
 * object space from the geometry's y coordinate, so one patched material works
 * for every shape family (box, sphere, star, gift) and for InstancedMesh.
 *
 * Two cues are layered: a screen-space bump (the ridges catch the light) and a
 * small albedo dip in each valley. The bump fades out where ridges would
 * alias (far or small instances), using fwidth.
 */

/** Layer ridges per unit of geometry height (geometries are about 1 unit tall). */
const LAYERS_PER_UNIT = 9;

const PERTURB = /* glsl */ `
vec3 printPerturb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
  vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
  vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
  vec3 R1 = cross( vSigmaY, surf_norm );
  vec3 R2 = cross( surf_norm, vSigmaX );
  float fDet = dot( vSigmaX, R1 ) * faceDirection;
  vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
  return normalize( abs( fDet ) * surf_norm - vGrad );
}
`;

export type PrintedMaterialOptions = MeshStandardMaterialParameters & {
  /** Gift boxes: the geometry carries an `aRibbon` attribute (0 body, 1 ribbon). */
  ribbonColor?: number;
};

export function createPrintedMaterial(options: PrintedMaterialOptions = {}): MeshStandardMaterial {
  const { ribbonColor, ...params } = options;
  const hasRibbon = ribbonColor !== undefined;
  const material = new MeshStandardMaterial({ roughness: 0.6, metalness: 0.02, ...params });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLayers = { value: LAYERS_PER_UNIT };
    if (hasRibbon) shader.uniforms.uRibbonColor = { value: new Color(ribbonColor) };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
varying float vObjY;
${hasRibbon ? "attribute float aRibbon;\nvarying float vRibbon;" : ""}`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vObjY = position.y;
${hasRibbon ? "vRibbon = aRibbon;" : ""}`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying float vObjY;
uniform float uLayers;
${hasRibbon ? "varying float vRibbon;\nuniform vec3 uRibbonColor;" : ""}
${PERTURB}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
${hasRibbon ? "diffuseColor.rgb = mix( diffuseColor.rgb, uRibbonColor, vRibbon );" : ""}
float phA = vObjY * uLayers;
float aaA = clamp( 1.0 - fwidth( phA ) * 1.4, 0.0, 1.0 );
float hA = 0.5 - 0.5 * cos( phA * 6.2831853 );
diffuseColor.rgb *= 1.0 - 0.2 * ( 1.0 - hA ) * aaA;`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
float phB = vObjY * uLayers;
float aaB = clamp( 1.0 - fwidth( phB ) * 1.4, 0.0, 1.0 );
float hB = 0.5 - 0.5 * cos( phB * 6.2831853 );
vec2 dHB = vec2( dFdx( hB ), dFdy( hB ) ) * 0.85 * aaB;
normal = printPerturb( - vViewPosition, normal, dHB, faceDirection );`,
      );
  };

  // The patch is the same for every printed material; the ribbon variant differs.
  material.customProgramCacheKey = () => (hasRibbon ? "printed-ribbon" : "printed");
  return material;
}
