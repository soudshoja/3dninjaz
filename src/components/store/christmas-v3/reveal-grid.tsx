"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./christmas-v3.module.css";

/**
 * Staggered rise-in for the gift grid. The default markup is fully visible;
 * on mount, cards that are still below the fold are hidden and revealed by an
 * IntersectionObserver (once). No JS, or reduced motion: nothing is hidden.
 */
export function RevealGrid({
  children,
  featured,
  wideLast,
}: {
  children: ReactNode;
  featured: boolean;
  wideLast: boolean;
}) {
  const ref = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;

    const items = Array.from(grid.children) as HTMLElement[];
    const vh = window.innerHeight;
    const below = items.filter((el) => el.getBoundingClientRect().top > vh * 0.95);
    if (below.length === 0) return;

    grid.setAttribute("data-armed", "");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).setAttribute("data-in", "");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    for (const el of items) {
      if (below.includes(el)) io.observe(el);
      else el.setAttribute("data-in", "");
    }

    return () => {
      io.disconnect();
      grid.removeAttribute("data-armed");
      for (const el of items) el.removeAttribute("data-in");
    };
  }, []);

  return (
    <ul
      ref={ref}
      className={styles.grid}
      data-featured={featured ? "" : undefined}
      data-wide-last={wideLast ? "" : undefined}
    >
      {children}
    </ul>
  );
}
