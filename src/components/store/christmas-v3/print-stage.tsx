"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronsDown } from "lucide-react";
import { LAYER_COUNT } from "./tree-geometry";
import styles from "./christmas-v3.module.css";

/**
 * The tall scroll track + sticky stage that makes scrolling print the tree.
 *
 * Scrolling is 100% native. We only READ the scroll position:
 *   passive scroll listener -> rAF -> `target.value` (a plain object, never
 *   React state). The three.js loop (tree-scene.ts) reads that value every
 *   frame and eases toward it. The HUD (layer counter, meter) is written
 *   straight to the DOM from the scene's frame callback, and only changes
 *   text when the whole-layer number changes.
 *
 * Static fallback: with reduced motion the CSS never makes the track tall
 * (see the layout contract in the CSS module) and this effect does nothing.
 * If WebGL is missing or the context is lost, `mode` flips to "static".
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function PrintStage({
  copy,
  flat,
  debugProgress,
}: {
  copy: ReactNode;
  flat: ReactNode;
  /** Testing hook, see below. Ignored in production builds. */
  debugProgress?: number;
}) {
  const [mode, setMode] = useState<"scroll" | "static">("scroll");

  const trackRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);

  // Dark page: make the root scrollbar and native controls dark too, then restore.
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.colorScheme;
    root.style.colorScheme = "dark";
    return () => {
      root.style.colorScheme = prev;
    };
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    const stage = stageRef.current;
    const box = boxRef.current;
    const mount = mountRef.current;
    const fill = fillRef.current;
    const count = countRef.current;
    const meter = meterRef.current;
    const live = liveRef.current;
    if (!track || !stage || !box || !mount || !fill || !count || !meter || !live) return;

    // Reduced motion: the CSS already lays out the static page. Do nothing.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Testing hook: `?progress=0.5` (passed in by the preview route) pins the
    // scroll progress so headless Chrome can screenshot intermediate states.
    // Compiled out of production builds.
    const pinned =
      process.env.NODE_ENV !== "production" && typeof debugProgress === "number"
        ? clamp01(debugProgress)
        : null;

    const target = { value: pinned ?? 0 };

    // Smooth in-page anchors ("See gifts"). Restored on unmount.
    const root = document.documentElement;
    const prevBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "smooth";

    // Scroll -> progress. Geometry is measured on resize, not per frame.
    let travel = 1;
    let stickyTop = 0;
    let ticking = false;
    const read = () => {
      ticking = false;
      const top = track.getBoundingClientRect().top;
      target.value = clamp01((stickyTop - top) / travel);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(read);
    };
    const measure = () => {
      travel = Math.max(1, track.offsetHeight - stage.offsetHeight);
      stickyTop = parseFloat(getComputedStyle(stage).top) || 0;
      if (pinned === null) read();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    ro.observe(stage);
    if (pinned === null) {
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll, { passive: true });
    }

    // Canvas is created per mount (forceContextLoss in cleanup kills a context for good).
    const canvas = document.createElement("canvas");
    canvas.className = styles.canvas;
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      "A 3D Christmas tree being 3D printed layer by layer as you scroll, then lit with lights and a star",
    );
    mount.appendChild(canvas);

    let cancelled = false;
    let handle: { dispose: () => void } | null = null;
    let lastLayers = -1;
    let lastState = "";
    let lastLit = -1;

    const fallBack = () => {
      if (cancelled) return;
      canvas.remove();
      box.style.removeProperty("--lit");
      setMode("static");
    };

    import("./tree-scene")
      .then(({ createTreeScene }) => {
        if (cancelled) return;
        try {
          handle = createTreeScene({
            wrap: mount,
            canvas,
            target,
            snap: pinned !== null,
            onLost: fallBack,
            onFrame: ({ layers, printed, lights }) => {
              fill.style.transform = `scaleX(${printed.toFixed(4)})`;
              if (layers !== lastLayers) {
                lastLayers = layers;
                count.textContent = String(layers);
                meter.setAttribute("aria-valuenow", String(layers));
                meter.setAttribute("aria-valuetext", `Layer ${layers} of ${LAYER_COUNT}`);
              }
              const state = printed >= 1 ? "done" : layers > 0 ? "printing" : "idle";
              if (state !== lastState) {
                lastState = state;
                track.dataset.state = state;
                live.textContent = state === "done" ? "The tree has finished printing." : "";
              }
              const lit = Math.round(lights * 100) / 100;
              if (lit !== lastLit) {
                lastLit = lit;
                box.style.setProperty("--lit", String(lit));
              }
            },
          });
        } catch {
          fallBack();
        }
      })
      .catch(fallBack);

    return () => {
      cancelled = true;
      handle?.dispose();
      canvas.remove();
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      root.style.scrollBehavior = prevBehavior;
    };
  }, [debugProgress]);

  return (
    <section
      ref={trackRef}
      className={styles.track}
      data-xmas3-track=""
      data-mode={mode}
      data-state="idle"
      aria-labelledby="xmas3-heading"
    >
      <div ref={stageRef} className={styles.stage} data-xmas3-stage="">
        <div className={styles.inner}>
          <div className={styles.left}>
            {copy}

            <div className={styles.status}>
              <div className={styles.cueStack} data-xmas3-cue="">
                <div className={styles.cueSlot}>
                  <p className={styles.cueIdle}>
                    <ChevronsDown
                      className={styles.cueIcon}
                      size={20}
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                    <span>Scroll to print the tree</span>
                  </p>
                  <p className={styles.cuePrinting}>
                    <span>
                      Layer{" "}
                      <span ref={countRef} className={styles.count}>
                        0
                      </span>{" "}
                      of {LAYER_COUNT}
                    </span>
                  </p>
                  <p className={styles.cueDone}>
                    <span>Print complete. Scroll back up to reprint.</span>
                  </p>
                </div>
                <div
                  ref={meterRef}
                  className={styles.meter}
                  role="progressbar"
                  aria-label="Tree print progress"
                  aria-valuemin={0}
                  aria-valuemax={LAYER_COUNT}
                  aria-valuenow={0}
                  aria-valuetext={`Layer 0 of ${LAYER_COUNT}`}
                >
                  <span ref={fillRef} className={styles.meterFill} />
                </div>
              </div>
              <p className={styles.note}>
                Our tree is a display piece and isn&rsquo;t for sale.
              </p>
            </div>
          </div>

          <div ref={boxRef} className={styles.treeBox} data-xmas3-treebox="">
            <div className={styles.glow} aria-hidden="true" />
            <div className={styles.flat} data-xmas3-flat="">
              {flat}
            </div>
            <div
              ref={mountRef}
              className={styles.canvasWrap}
              data-xmas3-canvas=""
            />
          </div>
        </div>
        <div ref={liveRef} className={styles.srOnly} role="status" aria-live="polite" />
      </div>
    </section>
  );
}
