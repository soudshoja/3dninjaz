"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Curve,
  DirectionalLight,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Scene,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildFamilyGeometry, type FamilyId } from "./farm-geometry";
import { createFloorGrid } from "./floor-grid";
import { createGlowPoints, type GlowPoint } from "./glow-points";
import { createPrintedMaterial } from "./printed-material";
import {
  ACCENT_HEX,
  ACCENT_HOT_HEX,
  BED_RADIUS,
  BED_TOP,
  COUNTER_LIGHT_HEX,
  FILAMENTS,
  FRAME_HEIGHT,
  INDICES_PER_LAYER,
  INDICES_PER_SEGMENT,
  LAYER_PITCH,
  LOOK_Y,
  PRINT_SECONDS,
  RADIAL_SEGMENTS,
  TIERS,
  TRUNK_RADIUS,
  TUBE_RADIUS,
  TUBULAR_SEGMENTS,
  WARM_WHITE_HEX,
  clamp01,
  easeOutBack,
  easeOutCubic,
  mulberry32,
  radiusAt,
} from "./scene-constants";
import styles from "./christmas-v2.module.css";

/**
 * Variant 2 hero scene: the tree 3D-prints itself on a bed (one merged mesh,
 * revealed with a draw range), then a small print farm drifts around it:
 * floating printed cubes, spheres, stars and gift boxes (one InstancedMesh per
 * shape family, layer ridges in the shader) plus fairy-light twinkles.
 *
 * Draw calls: floor 1, bed 2, tree layers 1, nozzle 4, baubles 1, star 1,
 * floaters 4, twinkles 2 = 16.
 */

export type SceneStatus = { failed: boolean; reduced: boolean };

type Props = {
  onDone: (done: boolean) => void;
  onStatus: (status: SceneStatus) => void;
  replayRef: MutableRefObject<() => void>;
};

class RingCurve extends Curve<Vector3> {
  radius: number;
  constructor(radius: number) {
    super();
    this.radius = radius;
  }
  getPoint(t: number, target = new Vector3()): Vector3 {
    const a = t * Math.PI * 2;
    return target.set(Math.cos(a) * this.radius, 0, Math.sin(a) * this.radius);
  }
}

const FAMILY_COUNTS: Record<FamilyId, number> = { cube: 7, sphere: 7, star: 6, gift: 8 };
const FAMILY_ORDER: FamilyId[] = ["cube", "sphere", "star", "gift"];

type Floater = {
  family: FamilyId;
  slot: number;
  scale: number;
  /** Seconds on the farm clock when this one starts to appear. */
  start: number;
  phase: Vector3;
  omega: Vector3;
  spin: Vector3;
  rot0: number;
  active: boolean;
  base: Vector3;
};

const BAUBLE_COUNT = 30;
const SPARKLE_COUNT = 36;
const TREE_LIGHT_COUNT = 44;

export function PrintFarmScene({ onDone, onStatus, replayRef }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const stage = wrap.parentElement ?? wrap;

    // A fresh canvas per mount: forceContextLoss() in cleanup kills the
    // context for good, so a re-mount (React strict mode) cannot reuse one.
    const canvas = document.createElement("canvas");
    canvas.className = styles.canvas;
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      "A 3D Christmas tree being 3D printed layer by layer on a print bed, with printed cubes, spheres, stars and gift boxes drifting around it",
    );
    wrap.appendChild(canvas);

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      canvas.remove();
      onStatus({ failed: true, reduced: prefersReduced });
      return;
    }
    onStatus({ failed: false, reduced: prefersReduced });
    renderer.setClearColor(0x000000, 0);
    let pixelRatio = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
    renderer.setPixelRatio(pixelRatio);

    try {
      const scene = new Scene();
      const camera = new PerspectiveCamera(32, 1, 0.1, 80);
      const halfFov = (camera.fov * Math.PI) / 360;

      // Lights: warm key, brand-blue counter rim, warm hemisphere fill. Scene
      // lights are lighting only, never a surface colour.
      scene.add(new HemisphereLight(WARM_WHITE_HEX, 0x16213f, 0.9));
      const key = new DirectionalLight(WARM_WHITE_HEX, 2.4);
      key.position.set(4, 7, 5);
      scene.add(key);
      const rim = new DirectionalLight(COUNTER_LIGHT_HEX, 2.2);
      rim.position.set(-5, 3, -4);
      scene.add(rim);
      const fill = new PointLight(ACCENT_HEX, 55, 22, 2);
      fill.position.set(-5, 1.5, 4);
      scene.add(fill);

      const disposables: { dispose: () => void }[] = [];
      const track = <T extends { dispose: () => void }>(item: T): T => {
        disposables.push(item);
        return item;
      };

      // Workshop floor
      const floor = createFloorGrid(BED_TOP - 0.13, ACCENT_HEX, 0.5);
      track(floor.geometry);
      track(floor.material);
      scene.add(floor.mesh);

      // Tree group: bed, tree, baubles, star, nozzle. Rotates as one piece.
      const treeGroup = new Group();
      scene.add(treeGroup);

      const bedMat = track(new MeshStandardMaterial({ color: 0x1d2742, roughness: 0.7 }));
      const bed = new Mesh(track(new CylinderGeometry(BED_RADIUS, BED_RADIUS, 0.12, 64)), bedMat);
      bed.position.y = BED_TOP - 0.06;
      treeGroup.add(bed);
      const rimMat = track(
        new MeshStandardMaterial({
          color: ACCENT_HEX,
          emissive: ACCENT_HEX,
          emissiveIntensity: 0.8,
        }),
      );
      const bedRim = new Mesh(track(new TorusGeometry(BED_RADIUS, 0.03, 8, 96)), rimMat);
      bedRim.rotation.x = Math.PI / 2;
      bedRim.position.y = BED_TOP;
      treeGroup.add(bedRim);

      // Tree layers: every filament ring merged into ONE geometry, revealed by
      // draw range as the print progresses. Vertex colours carry the bands.
      const layerGeos: BufferGeometry[] = [];
      const layerY: number[] = [];
      const layerR: number[] = [];
      const green = new Color(0x14804a);
      const greenTop = new Color(0x3ccf78);
      const brown = new Color(0x8a5a2b);
      const tmp = new Color();
      const addLayer = (y: number, r: number, color: Color, band: number) => {
        const g = new TubeGeometry(new RingCurve(r), TUBULAR_SEGMENTS, TUBE_RADIUS, RADIAL_SEGMENTS, true);
        g.translate(0, y, 0);
        const count = g.getAttribute("position").count;
        const colors = new Float32Array(count * 3);
        tmp.copy(color).multiplyScalar(band);
        for (let i = 0; i < count; i++) colors.set([tmp.r, tmp.g, tmp.b], i * 3);
        g.setAttribute("color", new Float32BufferAttribute(colors, 3));
        layerGeos.push(g);
        layerY.push(y);
        layerR.push(r);
      };
      let n = 0;
      for (let y = BED_TOP + TUBE_RADIUS; y < TIERS[0].y0; y += LAYER_PITCH) {
        addLayer(y, TRUNK_RADIUS, brown, n++ % 2 ? 0.92 : 1);
      }
      for (let y = TIERS[0].y0; y <= TIERS[3].y1; y += LAYER_PITCH) {
        const r = radiusAt(y);
        if (r < 0.05) continue;
        const k = (y - TIERS[0].y0) / (TIERS[3].y1 - TIERS[0].y0);
        addLayer(y, r, green.clone().lerp(greenTop, k), n++ % 2 ? 0.92 : 1);
      }
      const total = layerY.length;
      const treeGeo = mergeGeometries(layerGeos, false);
      for (const g of layerGeos) g.dispose();
      if (!treeGeo) {
        canvas.remove();
        renderer.dispose();
        onStatus({ failed: true, reduced: prefersReduced });
        return;
      }
      track(treeGeo);
      treeGeo.setDrawRange(0, 0);
      const treeMat = track(new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 }));
      const treeMesh = new Mesh(treeGeo, treeMat);
      treeGroup.add(treeMesh);

      // Baubles: one InstancedMesh, scaled in after the print.
      const baubleGeo = track(new SphereGeometry(0.13, 14, 10));
      const baubleMat = track(new MeshStandardMaterial({ roughness: 0.28, metalness: 0.25 }));
      const baubles = new InstancedMesh(baubleGeo, baubleMat, BAUBLE_COUNT);
      baubles.frustumCulled = false;
      track(baubles);
      const baublePos: Vector3[] = [];
      const baubleScale: number[] = [];
      for (let i = 0; i < BAUBLE_COUNT; i++) {
        const y = 0.75 + (i / (BAUBLE_COUNT - 1)) * 3.95;
        const a = i * 2.39996;
        const r = radiusAt(y) + 0.05;
        baublePos.push(new Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
        baubleScale.push(i % 4 === 0 ? 1.35 : 1);
        baubles.setColorAt(i, new Color(FILAMENTS[i % FILAMENTS.length]));
      }
      if (baubles.instanceColor) baubles.instanceColor.needsUpdate = true;
      treeGroup.add(baubles);

      // Fairy lights spiralling round the tree.
      const treeLights: GlowPoint[] = [];
      const warm = new Color(WARM_WHITE_HEX);
      const orange = new Color(ACCENT_HEX);
      for (let i = 0; i < TREE_LIGHT_COUNT; i++) {
        const u = i / (TREE_LIGHT_COUNT - 1);
        const y = 0.55 + u * 4.3;
        const a = u * Math.PI * 2 * 5.5;
        const r = radiusAt(y) + 0.12;
        treeLights.push({
          x: Math.cos(a) * r,
          y,
          z: Math.sin(a) * r,
          color: i % 3 === 0 ? orange : warm,
          size: 0.3,
          seed: (i * 0.6180339) % 1,
          delay: 0.4 + i * 0.045,
        });
      }
      const treeGlow = createGlowPoints(treeLights, 0);
      track(treeGlow.geometry);
      track(treeGlow.material);
      treeGroup.add(treeGlow.points);

      // Star
      const starShape = new Shape();
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? 0.44 : 0.19;
        const ang = Math.PI / 2 + (i * Math.PI) / 5;
        const px = Math.cos(ang) * rad;
        const py = Math.sin(ang) * rad;
        if (i === 0) starShape.moveTo(px, py);
        else starShape.lineTo(px, py);
      }
      starShape.closePath();
      const starGeo = track(
        new ExtrudeGeometry(starShape, {
          depth: 0.1,
          bevelEnabled: true,
          bevelThickness: 0.03,
          bevelSize: 0.03,
          bevelSegments: 2,
        }),
      );
      starGeo.translate(0, 0, -0.05);
      const starMat = track(
        new MeshStandardMaterial({
          color: 0xffc07a,
          emissive: ACCENT_HEX,
          emissiveIntensity: 0.9,
          roughness: 0.3,
          metalness: 0.4,
        }),
      );
      const star = new Mesh(starGeo, starMat);
      star.position.y = TIERS[3].y1 + 0.35;
      star.scale.setScalar(0);
      treeGroup.add(star);
      const starLight = new PointLight(ACCENT_HEX, 0, 6);
      starLight.position.copy(star.position);
      treeGroup.add(starLight);

      // Nozzle: heat block, cone tip, glowing filament feed.
      const nozzle = new Group();
      const metal = track(new MeshStandardMaterial({ color: 0xb8c2d6, roughness: 0.3, metalness: 0.8 }));
      const darkMat = track(new MeshStandardMaterial({ color: 0x23304d, roughness: 0.5 }));
      const hot = track(
        new MeshStandardMaterial({ color: ACCENT_HEX, emissive: ACCENT_HOT_HEX, emissiveIntensity: 1.6 }),
      );
      const block = new Mesh(track(new BoxGeometry(0.5, 0.34, 0.5)), darkMat);
      block.position.y = 0.52;
      const tip = new Mesh(track(new ConeGeometry(0.13, 0.3, 16)), metal);
      tip.rotation.x = Math.PI;
      tip.position.y = 0.2;
      const glow = new Mesh(track(new SphereGeometry(0.055, 12, 8)), hot);
      glow.position.y = 0.04;
      // Long enough to run off the top of the frame, like a real feed.
      const filament = new Mesh(track(new CylinderGeometry(0.03, 0.03, 14, 8)), hot);
      filament.position.y = 7.2;
      nozzle.add(block, tip, glow, filament);
      const nozzleLight = new PointLight(ACCENT_HEX, 8, 4);
      nozzleLight.position.y = 0.1;
      nozzle.add(nozzleLight);
      treeGroup.add(nozzle);

      // ---- The print farm: floating printed objects --------------------------
      const printedMat = track(createPrintedMaterial({ roughness: 0.58 }));
      const giftMat = track(createPrintedMaterial({ roughness: 0.58, ribbonColor: 0xf4ead8 }));
      const rng = mulberry32(20261225);
      const floaters: Floater[] = [];
      const familyMeshes = {} as Record<FamilyId, InstancedMesh>;
      const totalFloaters = FAMILY_ORDER.reduce((s, f) => s + FAMILY_COUNTS[f], 0);
      let order = 0;
      for (const family of FAMILY_ORDER) {
        const geo = track(buildFamilyGeometry(family));
        const mesh = new InstancedMesh(geo, family === "gift" ? giftMat : printedMat, FAMILY_COUNTS[family]);
        mesh.frustumCulled = false;
        track(mesh);
        for (let s = 0; s < FAMILY_COUNTS[family]; s++) {
          // Interleave families so the reveal order is mixed, not family by family.
          const slotOrder = (order * 7) % totalFloaters;
          order++;
          floaters.push({
            family,
            slot: s,
            scale: (family === "gift" ? 0.62 : family === "star" ? 0.7 : 0.5) * (0.8 + rng() * 0.5),
            start: 1.2 + (slotOrder / totalFloaters) * 6.6,
            phase: new Vector3(rng() * 6.28, rng() * 6.28, rng() * 6.28),
            omega: new Vector3(0.55 + rng() * 0.5, 0.65 + rng() * 0.55, 0.45 + rng() * 0.4),
            spin: new Vector3(0.12 + rng() * 0.25, 0.2 + rng() * 0.35, 0.1 + rng() * 0.2),
            rot0: rng() * 6.28,
            active: true,
            base: new Vector3(),
          });
          // Colour: 3-in-4 orange or cream or green, mix of all four.
          mesh.setColorAt(s, new Color(FILAMENTS[Math.floor(rng() * FILAMENTS.length)]));
        }
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        familyMeshes[family] = mesh;
        scene.add(mesh);
      }

      // Floating sparkles: bokeh twinkles scattered across the whole canvas.
      const sparkleItems: GlowPoint[] = [];
      const peach = new Color(0xffc08a);
      for (let i = 0; i < SPARKLE_COUNT; i++) {
        sparkleItems.push({
          x: 0,
          y: 0,
          z: 0,
          color: i % 3 === 0 ? orange : i % 3 === 1 ? warm : peach,
          size: 0.14 + rng() * 0.2,
          seed: rng(),
          delay: rng() * PRINT_SECONDS,
        });
      }
      const sparkles = createGlowPoints(sparkleItems, 0.12);
      track(sparkles.geometry);
      track(sparkles.material);
      scene.add(sparkles.points);
      const sparkleBase = sparkles.geometry.getAttribute("position");

      // ---- Layout: camera framing + screen-space placement -------------------
      const v2 = new Vector2();
      const ray = new Vector3();
      const toWorld = (px: number, py: number, W: number, H: number, z: number, out: Vector3) => {
        ray.set((px / W) * 2 - 1, -((py / H) * 2 - 1), 0.5).unproject(camera);
        ray.sub(camera.position).normalize();
        const t = (z - camera.position.z) / ray.z;
        return out.copy(camera.position).addScaledVector(ray, t);
      };

      const fit = () => {
        const W = Math.max(1, wrap.clientWidth);
        const H = Math.max(1, wrap.clientHeight);
        renderer.setSize(W, H, false);

        const desktop = window.matchMedia("(min-width: 900px)").matches;
        const wr = wrap.getBoundingClientRect();
        const ar = stage.getBoundingClientRect();
        const caption = stage.querySelector("[data-tree-caption]");
        const cr = caption ? caption.getBoundingClientRect() : null;

        const topPx = desktop ? 24 : Math.max(16, ar.top - wr.top + 4);
        const bottomPx = cr ? cr.top - wr.top - 6 : H - 16;
        const ax = ar.left - wr.left + ar.width / 2;
        const ay = (topPx + bottomPx) / 2;
        const ppuV = Math.max(10, bottomPx - topPx) / FRAME_HEIGHT;
        const ppuH = Math.max(10, Math.min(ax, W - ax) - 6) / (BED_RADIUS + 0.25);
        const ppu = Math.max(20, Math.min(ppuV, ppuH));

        const dist = H / ppu / (2 * Math.tan(halfFov));
        camera.aspect = W / H;
        camera.position.set(0, LOOK_Y + 0.4 + dist * 0.2, dist);
        camera.lookAt(0, LOOK_Y, 0);
        // Shift the projection so the tree lands on the anchor, not the centre.
        camera.setViewOffset(W, H, W / 2 - ax, H / 2 - ay, W, H);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);

        renderer.getDrawingBufferSize(v2);
        const uScale = v2.y / (2 * Math.tan(halfFov));
        treeGlow.setScale(uScale);
        sparkles.setScale(uScale);

        // Tree footprint (px) at a screen y, so objects do not sit on the tree.
        const treeHalfW = (py: number) => {
          const wy = LOOK_Y - (py - ay) / ppu;
          let r: number;
          if (wy < 0.3) r = BED_RADIUS;
          else if (wy > TIERS[3].y1 + 0.9) r = 0.55;
          else r = Math.max(0.7, radiusAt(wy), radiusAt(wy - 0.35)) + 0.3;
          return r * ppu;
        };
        // Keep printed objects off the headline, lede and buttons.
        const copyEl = stage.parentElement?.querySelector("[data-hero-copy]");
        const cp = copyEl ? copyEl.getBoundingClientRect() : null;
        const copy = cp
          ? { l: cp.left - wr.left, r: cp.right - wr.left, t: cp.top - wr.top, b: cp.bottom - wr.top }
          : null;
        const hitsCopy = (px: number, py: number, rad: number) =>
          copy !== null &&
          px + rad > copy.l - 20 &&
          px - rad < copy.r + 20 &&
          py + rad > copy.t - 20 &&
          py - rad < copy.b + 20;

        const small = W < 700;
        const placed: { x: number; y: number; r: number }[] = [];
        floaters.forEach((f, i) => {
          f.active = !small || i % 2 === 0;
          const r = mulberry32(9100 + i * 131);
          const radiusPx = f.scale * 0.62 * ppu;
          let px = ax;
          let py = ay;
          let found = false;
          for (let tries = 0; tries < 40 && !found; tries++) {
            px = W * (0.03 + r() * 0.94);
            py = H * (0.06 + r() * 0.88);
            const clearOfTree = Math.abs(px - ax) > treeHalfW(py) + radiusPx + 14;
            const clearOfCopy = !hitsCopy(px, py, radiusPx);
            const clearOfOthers = placed.every(
              (o) => Math.hypot(o.x - px, o.y - py) > o.r + radiusPx + 10,
            );
            found = clearOfTree && clearOfCopy && clearOfOthers;
          }
          // No clear spot (small screens): leave this one out rather than overlap.
          if (!found) f.active = false;
          else placed.push({ x: px, y: py, r: radiusPx });
          const z = -3 + r() * 4.2;
          toWorld(px, py, W, H, z, f.base);
        });

        for (let i = 0; i < SPARKLE_COUNT; i++) {
          const r = mulberry32(5300 + i * 71);
          const px = W * (0.02 + r() * 0.96);
          const py = H * (0.04 + r() * 0.92);
          toWorld(px, py, W, H, -4 + r() * 6.5, ray);
          sparkleBase.setXYZ(i, ray.x, ray.y, ray.z);
        }
        sparkleBase.needsUpdate = true;
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(wrap);
      ro.observe(stage);

      // ---- Animation state ---------------------------------------------------
      let printed = 0; // seconds of print clock (resets on replay)
      let after = 0; // seconds since the print finished (resets on replay)
      let farm = 0; // seconds since first paint (never resets)
      let time = 0;
      let finished = false;
      let spin = prefersReduced ? 0.6 : 0;
      let onScreen = true;
      let tabVisible = document.visibilityState === "visible";
      let last = performance.now();
      let raf = 0;
      let lost = false;

      const io = new IntersectionObserver(([entry]) => {
        onScreen = entry.isIntersecting;
      });
      io.observe(wrap);
      const onVis = () => {
        tabVisible = document.visibilityState === "visible";
        last = performance.now();
      };
      document.addEventListener("visibilitychange", onVis);

      const onLost = (e: Event) => {
        e.preventDefault();
        lost = true;
        cancelAnimationFrame(raf);
        onStatus({ failed: true, reduced: prefersReduced });
      };
      canvas.addEventListener("webglcontextlost", onLost);

      replayRef.current = () => {
        printed = 0;
        after = 0;
        finished = false;
        onDone(false);
      };

      const dummy = new Object3D();

      const step = (dt: number) => {
        if (prefersReduced) {
          printed = PRINT_SECONDS;
          after = 99;
          farm = 99;
          time = 4;
        } else {
          time += dt;
          farm += dt;
          spin += dt * 0.35;
          if (!finished) printed += dt;
          else after += dt;
        }
        treeGroup.rotation.y = spin;

        const p = clamp01(printed / PRINT_SECONDS);
        const f = p * total;
        const whole = Math.floor(f);
        const frac = f - whole;

        // Reveal the merged tree by draw range: whole layers, then a partial ring.
        const drawn =
          p >= 1 ? total * INDICES_PER_LAYER : whole * INDICES_PER_LAYER + Math.floor(frac * TUBULAR_SEGMENTS) * INDICES_PER_SEGMENT;
        treeGeo.setDrawRange(0, drawn);

        // Nozzle rides the current layer, then lifts away when done.
        if (p < 1) {
          const idx = Math.min(whole, total - 1);
          const ang = frac * Math.PI * 2;
          nozzle.visible = true;
          nozzle.position.set(Math.cos(ang) * layerR[idx], layerY[idx] + 0.1, Math.sin(ang) * layerR[idx]);
          nozzleLight.intensity = 8;
        } else {
          if (!finished) {
            finished = true;
            onDone(true);
          }
          const lift = easeOutCubic(after / 1.2);
          nozzle.position.y = layerY[total - 1] + 0.1 + lift * 3;
          nozzle.visible = lift < 1;
          nozzleLight.intensity = 8 * (1 - lift);
        }

        // Baubles and star come on after the print; they reset on replay.
        for (let i = 0; i < BAUBLE_COUNT; i++) {
          const s = p < 1 ? 0 : easeOutBack((after - 0.3 - i * 0.05) / 0.5);
          dummy.position.copy(baublePos[i]);
          dummy.scale.setScalar(s * baubleScale[i]);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          baubles.setMatrixAt(i, dummy.matrix);
        }
        baubles.instanceMatrix.needsUpdate = true;
        const starS = p < 1 ? 0 : easeOutBack((after - 0.3 - BAUBLE_COUNT * 0.05) / 0.6);
        star.scale.setScalar(Math.max(0, starS));
        starLight.intensity = 5 * clamp01(starS);

        treeGlow.setTime(time);
        treeGlow.setAppear(p < 1 ? -1 : after);
        sparkles.setTime(time);
        sparkles.setAppear(farm);

        // Floating printed objects: ambient drift, never reset by replay.
        for (const fl of floaters) {
          const mesh = familyMeshes[fl.family];
          const s = fl.active ? easeOutBack((farm - fl.start) / 0.9) : 0;
          if (s <= 0.001) {
            dummy.scale.setScalar(0);
            dummy.position.copy(fl.base);
          } else {
            const t = prefersReduced ? 4 : time;
            dummy.position.set(
              fl.base.x + Math.sin(t * fl.omega.x + fl.phase.x) * 0.12,
              fl.base.y + Math.sin(t * fl.omega.y + fl.phase.y) * 0.2,
              fl.base.z + Math.sin(t * fl.omega.z + fl.phase.z) * 0.15,
            );
            dummy.rotation.set(
              Math.sin(t * fl.spin.x + fl.phase.x) * 0.35,
              fl.rot0 + t * fl.spin.y,
              Math.sin(t * fl.spin.z + fl.phase.z) * 0.25,
            );
            dummy.scale.setScalar(fl.scale * Math.max(0, s));
          }
          dummy.updateMatrix();
          mesh.setMatrixAt(fl.slot, dummy.matrix);
        }
        for (const fam of FAMILY_ORDER) familyMeshes[fam].instanceMatrix.needsUpdate = true;
      };

      // Adaptive quality: if frames stay slow, drop the pixel ratio once.
      let slowFrames = 0;
      let frames = 0;
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        if (!onScreen || !tabVisible || lost) {
          last = now;
          return;
        }
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        step(dt);
        renderer.render(scene, camera);

        frames++;
        if (dt > 0.034) slowFrames++;
        if (frames === 90) {
          if (slowFrames > 60 && pixelRatio > 1) {
            pixelRatio = 1;
            renderer.setPixelRatio(1);
            fit();
          }
          frames = 0;
          slowFrames = 0;
        }
      };

      if (prefersReduced) {
        // One finished frame; re-render when the layout changes.
        step(0);
        renderer.render(scene, camera);
        const rerender = new ResizeObserver(() => {
          step(0);
          renderer.render(scene, camera);
        });
        rerender.observe(wrap);
        disposables.push({ dispose: () => rerender.disconnect() });
      } else {
        raf = requestAnimationFrame(frame);
      }

      return () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        document.removeEventListener("visibilitychange", onVis);
        canvas.removeEventListener("webglcontextlost", onLost);
        for (const d of disposables) d.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      };
    } catch (err) {
      // Any setup failure (shader, geometry, context) falls back to the flat tree.
      console.error("PrintFarmScene setup failed", err);
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      onStatus({ failed: true, reduced: prefersReduced });
      return undefined;
    }
    // Callbacks are stable for the lifetime of the stage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={wrapRef} className={styles.canvasWrap} />;
}
