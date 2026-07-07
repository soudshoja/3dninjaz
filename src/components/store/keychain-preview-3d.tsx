"use client";

/**
 * Quick task 260707-evn — "use client" wrapper around the real r3f 3D scene
 * (keychain-preview-3d-scene.tsx). This is the file the rest of the app
 * imports (HERO SLOT ONLY — see configurable-product-view.tsx).
 *
 * Responsibilities:
 *   - IntersectionObserver mount-gating: the WebGL context + shader
 *     compilation only happens once this component scrolls near the
 *     viewport (T-evn-01/02 perf guard).
 *   - Hard char-count cap (MAX_3D_CHARS): beyond this, fall back to the
 *     existing CSS KeychainPreview instead of mounting more meshes.
 *   - next/dynamic(ssr:false) code-split: keeps three/r3f/drei/troika out of
 *     the main PDP JS chunk, only fetched when a keychain/configurable-text
 *     PDP actually renders this component.
 *   - CSS-to-WebGL cross-fade: the CSS KeychainPreview is always mounted
 *     underneath (so first paint is never a blank/black canvas) and fades
 *     out once the Canvas reports ready via onCreated.
 */

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { KeychainPreview } from "./keychain-preview";

// Beyond this many effective characters, fall back to the CSS component —
// perf cap per RESEARCH.md Open Question 2 (T-evn-01: DoS via mesh count).
const MAX_3D_CHARS = 20;

const Scene = dynamic(() => import("./keychain-preview-3d-scene"), { ssr: false });

type Props = {
  text: string;
  baseHex: string;
  clickerHex: string;
  letterHex: string;
  maxLength: number;
  placeholder?: string;
  shape?: "square" | "round";
};

export function KeychainPreview3D(props: Props) {
  const { text, placeholder = "", maxLength } = props;
  const display = text || placeholder;
  const effectiveCount = Math.max(1, display.slice(0, maxLength).length);
  const overCap = effectiveCount > MAX_3D_CHARS;

  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Hard cap: unmodified CSS KeychainPreview, no placeholder/"coming soon" text.
  if (overCap) return <KeychainPreview {...props} />;

  return (
    <div
      ref={containerRef}
      data-keychain-preview-3d
      className="relative w-full"
      style={{ aspectRatio: "1 / 1" }}
    >
      {/* CSS layer — always mounted, guarantees first paint is never blank/black */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{ opacity: ready ? 0 : 1 }}
      >
        <KeychainPreview {...props} />
      </div>
      {/* WebGL layer — mounted only once in view; cross-fades in on ready */}
      {inView && (
        <div
          className="absolute inset-0 transition-opacity duration-300"
          style={{ opacity: ready ? 1 : 0 }}
        >
          <Scene {...props} onReady={() => setReady(true)} />
        </div>
      )}
    </div>
  );
}
