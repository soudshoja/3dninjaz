"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  AmbientLight,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Curve,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
} from "three";
import { ChristmasTree as ChristmasTreeSvg } from "./christmas-tree";
import { ICON_STROKE } from "./icon-stroke";
import styles from "./christmas-v1.module.css";

/**
 * A real 3D Christmas tree that "prints" itself: a nozzle lays down the tree
 * one filament ring at a time on a print bed, then the lights and star come
 * on. Display piece only, not a product. Falls back to the flat SVG tree when
 * WebGL is unavailable or the context is lost, and renders the finished tree
 * once (no loop) for reduced motion.
 *
 * Lighting palette: warm white key, filament orange (the page accent) for the
 * nozzle, lights and bed edge, and one cool counter-light (brand blue).
 * The tree itself stays green. No other hues.
 */

const PRINT_SECONDS = 9;
const LAYER_PITCH = 0.07;
const TUBE_RADIUS = 0.05;
const TUBULAR_SEGMENTS = 96;
const RADIAL_SEGMENTS = 6;
const INDICES_PER_SEGMENT = RADIAL_SEGMENTS * 6;

const BED_TOP = -0.45;
const TRUNK_RADIUS = 0.32;
const TIERS = [
  { y0: 0.25, y1: 1.95, r: 2.0 },
  { y0: 1.45, y1: 3.05, r: 1.6 },
  { y0: 2.55, y1: 4.05, r: 1.2 },
  { y0: 3.55, y1: 4.95, r: 0.8 },
] as const;

const FILAMENT_ORANGE = 0xff8a2b;
const WARM_WHITE = 0xfff0d6;
const COUNTER_BLUE = 0x1877f2; // lighting only, never a UI colour
const LIGHT_COLOURS = [WARM_WHITE, FILAMENT_ORANGE];

/** Radius of the tree at height y: the widest tier at that height wins. */
function radiusAt(y: number): number {
  let r = 0;
  for (const t of TIERS) {
    if (y >= t.y0 && y <= t.y1) {
      const k = (y - t.y0) / (t.y1 - t.y0);
      r = Math.max(r, t.r * (1 - 0.93 * k));
    }
  }
  return r;
}

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

type Layer = { y: number; r: number; mesh: Mesh; geometry: BufferGeometry };
type Bauble = { mesh: Mesh; material: MeshStandardMaterial; appearAt: number; phase: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutCubic = (u: number) => 1 - Math.pow(1 - clamp01(u), 3);

export function ChristmasTree3D() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const replayRef = useRef<() => void>(() => {});
  const labelRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    // A fresh canvas per mount: forceContextLoss() in cleanup kills the
    // context for good, so a re-mount (React strict mode) can't reuse one.
    const canvas = document.createElement("canvas");
    canvas.className = styles.canvas;
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      "A 3D Christmas tree being 3D printed layer by layer, then lit with lights and a star",
    );
    wrap.appendChild(canvas);

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(prefersReduced);
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
      setFailed(true);
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));

    const onContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      setFailed(true);
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    const scene = new Scene();
    const camera = new PerspectiveCamera(32, 0.8, 0.1, 60);

    scene.add(new AmbientLight(0xfff4e6, 0.6));
    const key = new DirectionalLight(WARM_WHITE, 2.4);
    key.position.set(4, 7, 5);
    scene.add(key);
    const counter = new DirectionalLight(COUNTER_BLUE, 1.8);
    counter.position.set(-5, 3, -4);
    scene.add(counter);

    const world = new Group();
    scene.add(world);

    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(item: T): T => {
      disposables.push(item);
      return item;
    };

    // Print bed: dark tinted steel, edge glows with the accent like a heated bed.
    const bedMat = track(new MeshStandardMaterial({ color: 0x1a2440, roughness: 0.7 }));
    const bed = new Mesh(track(new CylinderGeometry(2.75, 2.75, 0.12, 64)), bedMat);
    bed.position.y = BED_TOP - 0.06;
    world.add(bed);
    const rimMat = track(
      new MeshStandardMaterial({
        color: FILAMENT_ORANGE,
        emissive: FILAMENT_ORANGE,
        emissiveIntensity: 0.55,
      }),
    );
    const bedRim = new Mesh(track(new TorusGeometry(2.75, 0.03, 8, 96)), rimMat);
    bedRim.rotation.x = Math.PI / 2;
    bedRim.position.y = BED_TOP;
    world.add(bedRim);

    // Layers: trunk first, then the tiers, bottom to top.
    const layers: Layer[] = [];
    const green = new Color(0x14804a);
    const greenTop = new Color(0x3ccf78);
    const brown = new Color(0x8a5a2b);
    const addLayer = (y: number, r: number, color: Color, band: number) => {
      const geometry = new TubeGeometry(
        new RingCurve(r),
        TUBULAR_SEGMENTS,
        TUBE_RADIUS,
        RADIAL_SEGMENTS,
        true,
      );
      geometry.setDrawRange(0, 0);
      const material = track(
        new MeshStandardMaterial({
          color: color.clone().multiplyScalar(band),
          roughness: 0.55,
          metalness: 0.05,
        }),
      );
      const mesh = new Mesh(geometry, material);
      mesh.position.y = y;
      mesh.visible = false;
      world.add(mesh);
      track(geometry);
      layers.push({ y, r, mesh, geometry });
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
    const total = layers.length;

    // Lights and baubles, switched on once the print finishes.
    const baubles: Bauble[] = [];
    const ballGeo = track(new SphereGeometry(0.11, 16, 12));
    const bigBallGeo = track(new SphereGeometry(0.16, 16, 12));
    const COUNT = 30;
    for (let i = 0; i < COUNT; i++) {
      const y = 0.75 + (i / (COUNT - 1)) * 3.95;
      const a = i * 2.39996;
      const r = radiusAt(y) + 0.04;
      const colour = LIGHT_COLOURS[i % LIGHT_COLOURS.length];
      const material = track(
        new MeshStandardMaterial({
          color: colour,
          emissive: colour,
          emissiveIntensity: 0.9,
          roughness: 0.25,
          metalness: 0.2,
        }),
      );
      const mesh = new Mesh(i % 4 === 0 ? bigBallGeo : ballGeo, material);
      mesh.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      mesh.scale.setScalar(0);
      world.add(mesh);
      baubles.push({ mesh, material, appearAt: 0.05 * i, phase: i * 0.9 });
    }

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
        color: 0xffe2b0,
        emissive: FILAMENT_ORANGE,
        emissiveIntensity: 0.8,
        roughness: 0.3,
        metalness: 0.4,
      }),
    );
    const star = new Mesh(starGeo, starMat);
    star.position.y = TIERS[3].y1 + 0.35;
    star.scale.setScalar(0);
    world.add(star);
    const starLight = new PointLight(0xffc48a, 5, 5);
    starLight.position.copy(star.position);
    starLight.intensity = 0;
    world.add(starLight);

    // Nozzle: heat block, cone tip, glowing filament feed.
    const nozzle = new Group();
    const metal = track(new MeshStandardMaterial({ color: 0xb8c2d6, roughness: 0.3, metalness: 0.8 }));
    const darkMat = track(new MeshStandardMaterial({ color: 0x23304d, roughness: 0.5 }));
    const hot = track(
      new MeshStandardMaterial({
        color: FILAMENT_ORANGE,
        emissive: 0xff6a00,
        emissiveIntensity: 1.6,
      }),
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
    const nozzleLight = new PointLight(FILAMENT_ORANGE, 8, 4);
    nozzleLight.position.y = 0.1;
    nozzle.add(nozzleLight);
    world.add(nozzle);

    // Animation state
    let printed = 0; // seconds of print clock
    let after = 0; // seconds since the print finished
    let finished = false;
    let spin = prefersReduced ? 0.6 : 0;
    let onScreen = true;
    let tabVisible = document.visibilityState === "visible";
    let last = performance.now();
    let raf = 0;
    let shown = ""; // last readout text, so the DOM is only touched on change
    let draw = () => {};

    // Camera framing: keep the whole bed in view on narrow containers.
    const fit = () => {
      const w = Math.max(1, wrap.clientWidth);
      const h = Math.max(1, wrap.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const halfFov = (camera.fov * Math.PI) / 360;
      const distV = 7.3 / (2 * Math.tan(halfFov));
      const distH = 6.0 / (2 * Math.tan(halfFov) * camera.aspect);
      const dist = Math.max(distV, distH);
      camera.position.set(0, 2.6 + dist * 0.2, dist);
      camera.lookAt(0, 2.2, 0);
      camera.updateProjectionMatrix();
      if (prefersReduced) draw();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
    });
    io.observe(wrap);
    const onVis = () => {
      tabVisible = document.visibilityState === "visible";
      last = performance.now();
    };
    document.addEventListener("visibilitychange", onVis);

    const showReadout = (text: string, progress: number) => {
      if (labelRef.current && text !== shown) {
        shown = text;
        labelRef.current.textContent = text;
      }
      if (barRef.current) barRef.current.style.transform = `scaleX(${progress})`;
    };

    const reset = () => {
      printed = 0;
      after = 0;
      finished = false;
      shown = "";
      setDone(false);
    };
    replayRef.current = reset;

    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      if (prefersReduced) {
        printed = PRINT_SECONDS;
        after = 99;
      } else {
        spin += dt * 0.35;
        if (!finished) printed += dt;
        else after += dt;
      }
      world.rotation.y = spin;

      const p = clamp01(printed / PRINT_SECONDS);
      const f = p * total;
      const whole = Math.floor(f);
      const frac = f - whole;

      for (let i = 0; i < total; i++) {
        const layer = layers[i];
        if (i < whole || p >= 1) {
          layer.mesh.visible = true;
          layer.geometry.setDrawRange(0, TUBULAR_SEGMENTS * INDICES_PER_SEGMENT);
        } else if (i === whole) {
          layer.mesh.visible = true;
          layer.geometry.setDrawRange(
            0,
            Math.floor(frac * TUBULAR_SEGMENTS) * INDICES_PER_SEGMENT,
          );
        } else {
          layer.mesh.visible = false;
        }
      }

      // Nozzle rides the current layer, then lifts away when done.
      if (p < 1) {
        const layer = layers[Math.min(whole, total - 1)];
        const ang = frac * Math.PI * 2;
        nozzle.visible = true;
        nozzle.position.set(Math.cos(ang) * layer.r, layer.y + 0.1, Math.sin(ang) * layer.r);
        nozzleLight.intensity = 8;
        showReadout(`Printing layer ${Math.min(total, whole + 1)} of ${total}`, p);
      } else {
        if (!finished) {
          finished = true;
          setDone(true);
        }
        const lift = easeOutCubic(after / 1.2);
        nozzle.position.y = layers[total - 1].y + 0.1 + lift * 3;
        nozzle.visible = lift < 1;
        nozzleLight.intensity = 8 * (1 - lift);
        showReadout(`Print complete, ${total} layers`, 1);
      }

      // Lights and star come on after the print. The twinkle is ambient, so
      // it stays small (and is frozen entirely for reduced motion).
      const t = now / 1000;
      for (const b of baubles) {
        const s = p < 1 ? 0 : easeOutCubic((after - 0.3 - b.appearAt) / 0.5);
        b.mesh.scale.setScalar(s);
        b.material.emissiveIntensity = prefersReduced
          ? 0.9
          : 0.9 + Math.sin(t * 2.2 + b.phase) * 0.3;
      }
      const starS = p < 1 ? 0 : easeOutCubic((after - 0.3 - COUNT * 0.05) / 0.6);
      star.scale.setScalar(starS);
      starLight.intensity = 5 * starS;

      renderer.render(scene, camera);
    };

    draw = () => step(performance.now());
    fit();

    if (prefersReduced) {
      draw();
    } else {
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        if (!onScreen || !tabVisible) {
          last = now;
          return;
        }
        step(now);
      };
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  if (failed) return <ChristmasTreeSvg />;

  return (
    <div className={styles.treeColumn}>
      <div ref={wrapRef} className={styles.canvasWrap} />
      <div className={styles.controls}>
        <div className={styles.readoutBlock} aria-hidden="true">
          <span ref={labelRef} className={styles.readout} />
          <span className={styles.bar}>
            <span ref={barRef} className={styles.barFill} />
          </span>
        </div>
        {reduced ? null : (
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost} ${styles.btnSmall}`}
            onClick={() => replayRef.current()}
            disabled={!done}
          >
            <RotateCcw size={18} strokeWidth={ICON_STROKE} aria-hidden="true" />
            Print it again
          </button>
        )}
      </div>
      <p className={styles.srOnly} role="status">
        {done ? "The tree has finished printing." : ""}
      </p>
    </div>
  );
}
