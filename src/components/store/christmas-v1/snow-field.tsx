"use client";

import { useEffect, useRef } from "react";

/**
 * Ambient snowfall on a Canvas 2D layer (replaces the old emoji floaters).
 *
 * - seeded RNG (mulberry32): the same snow every load, nothing random at
 *   render time, so there is no hydration mismatch (the DOM is just an empty
 *   canvas; flakes are drawn after mount)
 * - pooled flakes in typed arrays, no allocation in the loop
 * - delta capped at 100ms, DPR capped at 2 (1.5 on coarse pointers)
 * - paused when off-screen or the tab is hidden, fully torn down on unmount
 * - reduced motion: one static frame, no loop
 */

const MAX_FLAKES = 120;
const TAU = Math.PI * 2;

// Three depth bands: far (small, slow, faint) to near (larger, faster).
const BANDS = [
  { alpha: 0.3, rMin: 0.8, rMax: 1.2, vMin: 14, vMax: 22 },
  { alpha: 0.5, rMin: 1.2, rMax: 1.9, vMin: 24, vMax: 36 },
  { alpha: 0.65, rMin: 1.9, rMax: 2.7, vMin: 38, vMax: 52 },
] as const;

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function SnowField({
  className,
  seed = 7,
}: {
  className?: string;
  seed?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const host = canvas.parentElement ?? canvas;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const rng = mulberry32(seed);

    // Flake pool, allocated once.
    const x = new Float32Array(MAX_FLAKES);
    const y = new Float32Array(MAX_FLAKES);
    const r = new Float32Array(MAX_FLAKES);
    const vy = new Float32Array(MAX_FLAKES);
    const phase = new Float32Array(MAX_FLAKES);
    const sway = new Float32Array(MAX_FLAKES);
    const band = new Uint8Array(MAX_FLAKES);

    let w = 0;
    let h = 0;
    let count = 0;
    let time = 0;

    // The snow colour is a page token; fall back if the browser can't parse it.
    // Resizing a canvas resets its context state, so remember the result and
    // re-apply it in render().
    ctx.fillStyle = "#dfe8ff";
    const token = getComputedStyle(canvas).getPropertyValue("--xmas-snow").trim();
    if (token) ctx.fillStyle = token;
    const snowColor = String(ctx.fillStyle);

    const place = (i: number, anywhere: boolean) => {
      x[i] = rng() * w;
      y[i] = anywhere ? rng() * h : -6;
    };

    const seedFlake = (i: number) => {
      const b = i % 3;
      const spec = BANDS[b];
      band[i] = b;
      r[i] = spec.rMin + rng() * (spec.rMax - spec.rMin);
      vy[i] = spec.vMin + rng() * (spec.vMax - spec.vMin);
      phase[i] = rng() * TAU;
      sway[i] = 6 + rng() * 10;
      place(i, true);
    };

    const render = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = snowColor;
      for (let b = 0; b < 3; b++) {
        ctx.globalAlpha = BANDS[b].alpha;
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          if (band[i] !== b) continue;
          ctx.moveTo(x[i] + r[i], y[i]);
          ctx.arc(x[i], y[i], r[i], 0, TAU);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const update = (dt: number) => {
      time += dt;
      for (let i = 0; i < count; i++) {
        y[i] += vy[i] * dt;
        x[i] += Math.sin(time * 0.6 + phase[i]) * sway[i] * dt;
        if (y[i] > h + 6) place(i, false);
        if (x[i] < -6) x[i] = w + 6;
        else if (x[i] > w + 6) x[i] = -6;
      }
    };

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const nextW = Math.max(1, Math.round(rect.width));
      const nextH = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
      canvas.width = Math.round(nextW * dpr);
      canvas.height = Math.round(nextH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const widthChanged = nextW !== w;
      w = nextW;
      h = nextH;
      const target = Math.min(MAX_FLAKES, Math.max(36, Math.round(w / 15)));
      if (target !== count || widthChanged) {
        // Re-spread the pool when the box changes (cheap: <= 120 flakes).
        count = target;
        for (let i = 0; i < count; i++) seedFlake(i);
      }
      render();
    };

    let raf = 0;
    let prev = 0;
    let onScreen = true;
    let tabVisible = document.visibilityState === "visible";

    const frame = (now: number) => {
      const dt = Math.min((now - prev) / 1000, 0.1);
      prev = now;
      update(dt);
      render();
      raf = requestAnimationFrame(frame);
    };
    const sync = () => {
      const shouldRun = !reduced && onScreen && tabVisible;
      if (shouldRun && !raf) {
        prev = performance.now();
        raf = requestAnimationFrame(frame);
      } else if (!shouldRun && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    io.observe(host);
    const onVis = () => {
      tabVisible = document.visibilityState === "visible";
      sync();
    };
    document.addEventListener("visibilitychange", onVis);

    resize();
    sync();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [seed]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
