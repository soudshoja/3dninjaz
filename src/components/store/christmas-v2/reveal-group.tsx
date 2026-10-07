"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import styles from "./christmas-v2.module.css";

/**
 * Scroll reveal that only enhances an already-visible default. Server markup
 * renders fully visible (data-reveal="idle"). On mount, if motion is allowed,
 * the group is armed (children offset and transparent) and released once it
 * enters the viewport. Without JS, or with reduced motion, nothing is hidden.
 */
export function RevealGroup({
  as: Tag = "div",
  className,
  children,
  style,
}: {
  as?: "div" | "ul" | "ol";
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement & HTMLUListElement & HTMLOListElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;

    el.dataset.reveal = "armed";
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.dataset.reveal = "in";
          io.disconnect();
        }
      },
      { threshold: 0, rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={[styles.reveal, className].filter(Boolean).join(" ")}
      data-reveal="idle"
      style={style}
    >
      {children}
    </Tag>
  );
}
