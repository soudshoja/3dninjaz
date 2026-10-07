import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Curve,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
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
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  BED_TOP,
  PRINT_END,
  TIERS,
  TUBE_RADIUS,
  buildLayerSpecs,
  radiusAt,
} from "./tree-geometry";

/**
 * Scroll-driven 3D tree. The page owns scrolling; this module only READS a
 * progress value (0..1 over the sticky track) and eases toward it, so the
 * nozzle visibly follows the scroll position. Nothing here touches React
 * state. All per-frame work stays in this closure.
 *
 * Rendering is on demand: a frame is drawn only while the scroll value, the
 * lights or the nozzle lift are moving, or (at ~30fps) while the finished
 * tree twinkles. Off-screen and hidden-tab frames are skipped entirely.
 */

const TUBULAR_SEGMENTS = 96;
const RADIAL_SEGMENTS = 6;
const INDICES_PER_RING_SEGMENT = RADIAL_SEGMENTS * 6;

/** Damping rate (1/s) for scroll following. ~0.15s time constant. */
const FOLLOW = 6.5;
const LIGHTS_ON_SECONDS = 1.4;
const LIGHTS_OFF_SECONDS = 0.5;
const LIFT_UP_SECONDS = 1.0;
const LIFT_DOWN_SECONDS = 0.45;

const BRAND_BLUE = 0x1877f2; // lighting only, never UI
const ACCENT_ORANGE = 0xff8a2b;
const WARM_WHITE = 0xfff1d6;
const COOL_WHITE = 0xd8e6ff;
const BAUBLE_COLOURS = [WARM_WHITE, ACCENT_ORANGE, COOL_WHITE, WARM_WHITE, ACCENT_ORANGE, WARM_WHITE];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutCubic = (u: number) => 1 - Math.pow(1 - clamp01(u), 3);

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

export type FrameInfo = {
  /** Whole layers laid down so far (0..total). */
  layers: number;
  /** Eased print progress, 0..1. */
  printed: number;
  /** Eased light level, 0..1. */
  lights: number;
};

export type SceneOptions = {
  wrap: HTMLElement;
  canvas: HTMLCanvasElement;
  /** Raw scroll progress 0..1, written by the page, read every frame. */
  target: { value: number };
  /** Jump straight to the target (testing hook) instead of easing. */
  snap: boolean;
  onFrame: (info: FrameInfo) => void;
  onLost: () => void;
};

export function createTreeScene(opts: SceneOptions): { dispose: () => void } {
  const { wrap, canvas, target } = opts;

  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setClearColor(0x000000, 0);
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 0.8, 0.1, 60);

  scene.add(new AmbientLight(0xffffff, 0.55));
  const key = new DirectionalLight(0xfff3e0, 2.3);
  key.position.set(4, 7, 5);
  scene.add(key);
  // One cool counter-light so the green does not go flat.
  const rim = new DirectionalLight(BRAND_BLUE, 2.1);
  rim.position.set(-5, 3, -4);
  scene.add(rim);

  const world = new Group();
  scene.add(world);

  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // Print bed
  const bed = new Mesh(
    track(new CylinderGeometry(2.75, 2.75, 0.12, 64)),
    track(new MeshStandardMaterial({ color: 0x18233f, roughness: 0.7 })),
  );
  bed.position.y = BED_TOP - 0.06;
  world.add(bed);
  const bedRim = new Mesh(
    track(new TorusGeometry(2.75, 0.028, 8, 96)),
    track(
      new MeshStandardMaterial({
        color: 0x5b6f9c,
        emissive: 0x5b6f9c,
        emissiveIntensity: 0.55,
      }),
    ),
  );
  bedRim.rotation.x = Math.PI / 2;
  bedRim.position.y = BED_TOP;
  world.add(bedRim);

  // Layers: every ring merged into ONE geometry (one draw call). Rings are
  // laid out in print order, so "how much is printed" is just a draw range.
  const specs = buildLayerSpecs();
  const total = specs.length;
  const green = new Color(0x14804a);
  const greenTop = new Color(0x3ccf78);
  const brown = new Color(0x8a5a2b);
  const tmp = new Color();

  const ringGeos: BufferGeometry[] = [];
  const ghostPositions = new Float32Array(total * TUBULAR_SEGMENTS * 2 * 3);
  let gp = 0;
  for (const s of specs) {
    const geo = new TubeGeometry(
      new RingCurve(s.r),
      TUBULAR_SEGMENTS,
      TUBE_RADIUS,
      RADIAL_SEGMENTS,
      true,
    );
    geo.translate(0, s.y, 0);
    tmp.copy(s.trunk ? brown : green.clone().lerp(greenTop, s.k)).multiplyScalar(s.band);
    const count = geo.getAttribute("position").count;
    const colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colours[i * 3] = tmp.r;
      colours[i * 3 + 1] = tmp.g;
      colours[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute("color", new BufferAttribute(colours, 3));
    ringGeos.push(geo);

    // Slicer-preview path for this ring (what the nozzle is about to lay).
    for (let j = 0; j < TUBULAR_SEGMENTS; j++) {
      const a0 = (j / TUBULAR_SEGMENTS) * Math.PI * 2;
      const a1 = ((j + 1) / TUBULAR_SEGMENTS) * Math.PI * 2;
      ghostPositions[gp++] = Math.cos(a0) * s.r;
      ghostPositions[gp++] = s.y;
      ghostPositions[gp++] = Math.sin(a0) * s.r;
      ghostPositions[gp++] = Math.cos(a1) * s.r;
      ghostPositions[gp++] = s.y;
      ghostPositions[gp++] = Math.sin(a1) * s.r;
    }
  }
  const treeGeo = mergeGeometries(ringGeos, false);
  for (const g of ringGeos) g.dispose();
  treeGeo.setDrawRange(0, 0);
  track(treeGeo);
  const treeMesh = new Mesh(
    treeGeo,
    track(new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 })),
  );
  world.add(treeMesh);

  const ghostGeo = new BufferGeometry();
  ghostGeo.setAttribute("position", new BufferAttribute(ghostPositions, 3));
  track(ghostGeo);
  const ghost = new LineSegments(
    ghostGeo,
    track(new LineBasicMaterial({ color: 0x7f97c9, transparent: true, opacity: 0.5 })),
  );
  world.add(ghost);
  const ringSegmentsTotal = total * TUBULAR_SEGMENTS;

  // Lights and baubles, switched on once the print completes.
  type Bauble = { mesh: Mesh; material: MeshStandardMaterial; order: number; phase: number };
  const baubles: Bauble[] = [];
  const ballGeo = track(new SphereGeometry(0.11, 16, 12));
  const bigBallGeo = track(new SphereGeometry(0.16, 16, 12));
  const COUNT = 30;
  for (let i = 0; i < COUNT; i++) {
    const y = 0.75 + (i / (COUNT - 1)) * 3.95;
    const a = i * 2.39996;
    const r = radiusAt(y) + 0.04;
    const colour = BAUBLE_COLOURS[i % BAUBLE_COLOURS.length];
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
    baubles.push({ mesh, material, order: i / COUNT, phase: i * 0.9 });
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
  const star = new Mesh(
    starGeo,
    track(
      new MeshStandardMaterial({
        color: WARM_WHITE,
        emissive: 0xffc27a,
        emissiveIntensity: 0.9,
        roughness: 0.3,
        metalness: 0.3,
      }),
    ),
  );
  star.position.y = TIERS[3].y1 + 0.35;
  star.scale.setScalar(0);
  world.add(star);
  const starLight = new PointLight(0xffd9a0, 5, 5);
  starLight.position.copy(star.position);
  starLight.intensity = 0;
  world.add(starLight);

  // Nozzle: heat block, cone tip, glowing filament feed.
  const nozzle = new Group();
  const metal = track(new MeshStandardMaterial({ color: 0xc9d3e8, roughness: 0.3, metalness: 0.8 }));
  const darkMat = track(new MeshStandardMaterial({ color: 0x5d6f99, roughness: 0.45, metalness: 0.35 }));
  const hot = track(
    new MeshStandardMaterial({ color: ACCENT_ORANGE, emissive: 0xff6a00, emissiveIntensity: 1.6 }),
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
  const nozzleLight = new PointLight(ACCENT_ORANGE, 8, 4);
  nozzleLight.position.y = 0.1;
  nozzle.add(nozzleLight);
  world.add(nozzle);

  // Camera framing: keep the whole bed in view on narrow containers.
  let resized = true;
  const fit = () => {
    const w = Math.max(1, wrap.clientWidth);
    const h = Math.max(1, wrap.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const halfFov = (camera.fov * Math.PI) / 360;
    const distV = 7.8 / (2 * Math.tan(halfFov));
    const distH = 6.0 / (2 * Math.tan(halfFov) * camera.aspect);
    const dist = Math.max(distV, distH);
    camera.position.set(0, 2.6 + dist * 0.2, dist);
    camera.lookAt(0, 2.25, 0);
    camera.updateProjectionMatrix();
    resized = true;
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(wrap);

  // Visibility gates
  let onScreen = true;
  let tabVisible = document.visibilityState === "visible";
  const io = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
  });
  io.observe(wrap);
  const onVis = () => {
    tabVisible = document.visibilityState === "visible";
    last = performance.now();
  };
  document.addEventListener("visibilitychange", onVis);

  let disposed = false;
  const onLost = (e: Event) => {
    e.preventDefault();
    if (!disposed) opts.onLost();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  // Animation state (all mutable, none of it in React)
  let cur = opts.snap ? target.value : 0;
  let lights = opts.snap ? (target.value / PRINT_END >= 0.9995 ? 1 : 0) : 0;
  let lift = lights;
  let idle = 0;
  let last = performance.now();
  let lastRender = 0;
  let raf = 0;
  let firstFrame = true;

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (!onScreen || !tabVisible) {
      last = now;
      return;
    }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    // Ease toward the scroll position. Frame-rate independent damping.
    let moving = false;
    const diff = target.value - cur;
    if (Math.abs(diff) > 5e-5) {
      cur += opts.snap ? diff : diff * (1 - Math.exp(-FOLLOW * dt));
      moving = true;
    } else if (diff !== 0) {
      cur = target.value;
      moving = true;
    }

    const p = clamp01(cur / PRINT_END);
    const done = p >= 0.9995;

    // Lights and nozzle lift ease toward their targets (up slower than down).
    const lightsTarget = done ? 1 : 0;
    let lightsMoving = false;
    if (lights !== lightsTarget) {
      const step = dt / (lightsTarget > lights ? LIGHTS_ON_SECONDS : LIGHTS_OFF_SECONDS);
      lights = lightsTarget > lights ? Math.min(1, lights + step) : Math.max(0, lights - step);
      lightsMoving = true;
    }
    let liftMoving = false;
    if (lift !== lightsTarget) {
      const step = dt / (lightsTarget > lift ? LIFT_UP_SECONDS : LIFT_DOWN_SECONDS);
      lift = lightsTarget > lift ? Math.min(1, lift + step) : Math.max(0, lift - step);
      liftMoving = true;
    }

    const urgent = moving || lightsMoving || liftMoving || resized || firstFrame;
    const ambient = lights > 0.001;
    if (!urgent) {
      if (!ambient) return;
      if (now - lastRender < 32) return; // ~30fps while only twinkling
    }
    lastRender = now;
    resized = false;
    firstFrame = false;

    if (ambient) idle += dt * 0.25 * lights;
    world.rotation.y = -0.6 + p * 4.2 + idle;

    // Printed portion: a draw range over the merged ring geometry.
    const f = p * total;
    const whole = Math.min(total - 1, Math.floor(f));
    const frac = p >= 1 ? 0 : f - Math.floor(f);
    const ringSegs = p >= 1 ? ringSegmentsTotal : Math.floor(f * TUBULAR_SEGMENTS);
    treeGeo.setDrawRange(0, ringSegs * INDICES_PER_RING_SEGMENT);
    ghostGeo.setDrawRange(ringSegs * 2, Infinity);
    ghost.visible = ringSegs < ringSegmentsTotal;

    // Nozzle rides the current ring, then lifts away once the tree is done.
    const layer = specs[whole];
    const ang = frac * Math.PI * 2;
    nozzle.position.set(
      Math.cos(ang) * layer.r,
      layer.y + 0.1 + easeOutCubic(lift) * 3.6,
      Math.sin(ang) * layer.r,
    );
    nozzle.visible = lift < 0.999;
    nozzleLight.intensity = 8 * (1 - easeOutCubic(lift));

    // Lights and star
    const t = now / 1000;
    for (const b of baubles) {
      const s = easeOutCubic((lights - b.order * 0.55) / 0.4);
      b.mesh.scale.setScalar(s);
      b.material.emissiveIntensity = 0.9 + Math.sin(t * 2.2 + b.phase) * 0.7;
    }
    const starS = easeOutCubic((lights - 0.6) / 0.4);
    star.scale.setScalar(starS * 1.25);
    star.rotation.y = -world.rotation.y; // always face the camera
    starLight.intensity = 5 * starS;

    renderer.render(scene, camera);
    opts.onFrame({ layers: p >= 1 ? total : Math.floor(f), printed: p, lights });
  };
  raf = requestAnimationFrame(frame);

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("webglcontextlost", onLost);
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
