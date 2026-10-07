import {
  ExtrudeGeometry,
  Float32BufferAttribute,
  Shape,
  SphereGeometry,
  type BufferGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Geometry for the four families of floating printed objects. Every shape is
 * about one unit tall, centred on the origin, with its layer axis along +y
 * (the printed-material ridges follow y).
 */

export type FamilyId = "cube" | "sphere" | "star" | "gift";

function starGeometry(): BufferGeometry {
  const shape = new Shape();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? 0.5 : 0.22;
    const ang = Math.PI / 2 + (i * Math.PI) / 5;
    const px = Math.cos(ang) * rad;
    const py = Math.sin(ang) * rad;
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  }
  shape.closePath();
  const geo = new ExtrudeGeometry(shape, {
    depth: 0.2,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.03,
    bevelSegments: 1,
  });
  geo.translate(0, 0, -0.1);
  return geo;
}

function tagRibbon(geo: BufferGeometry, value: number): BufferGeometry {
  const count = geo.getAttribute("position").count;
  geo.setAttribute("aRibbon", new Float32BufferAttribute(new Float32Array(count).fill(value), 1));
  return geo;
}

function giftGeometry(): BufferGeometry {
  const body = new RoundedBoxGeometry(1, 0.62, 1, 2, 0.06);
  body.translate(0, -0.19, 0);
  const lid = new RoundedBoxGeometry(1.08, 0.2, 1.08, 2, 0.05);
  lid.translate(0, 0.22, 0);
  const stripA = new RoundedBoxGeometry(0.2, 0.84, 1.12, 1, 0.02);
  stripA.translate(0, -0.08, 0);
  const stripB = new RoundedBoxGeometry(1.12, 0.835, 0.2, 1, 0.02);
  stripB.translate(0, -0.0775, 0);
  const bowL = new SphereGeometry(0.14, 10, 8);
  bowL.scale(1, 0.62, 0.7);
  bowL.translate(-0.13, 0.43, 0);
  const bowR = new SphereGeometry(0.14, 10, 8);
  bowR.scale(1, 0.62, 0.7);
  bowR.translate(0.13, 0.43, 0);

  const parts = [
    tagRibbon(body, 0),
    tagRibbon(lid, 0),
    tagRibbon(stripA, 1),
    tagRibbon(stripB, 1),
    tagRibbon(bowL, 1),
    tagRibbon(bowR, 1),
  ];
  // RoundedBoxGeometry is non-indexed while SphereGeometry is indexed: make all
  // parts non-indexed so they can be merged.
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(flat, false);
  for (const g of parts) g.dispose();
  for (const g of flat) g.dispose();
  if (!merged) throw new Error("gift geometry merge failed");
  // Keep only the attributes the printed material reads.
  for (const name of Object.keys(merged.attributes)) {
    if (!["position", "normal", "uv", "aRibbon"].includes(name)) merged.deleteAttribute(name);
  }
  return merged;
}

export function buildFamilyGeometry(id: FamilyId): BufferGeometry {
  switch (id) {
    case "cube":
      return new RoundedBoxGeometry(1, 1, 1, 2, 0.07);
    case "sphere":
      return new SphereGeometry(0.5, 24, 16);
    case "star":
      return starGeometry();
    case "gift":
      return giftGeometry();
  }
}
