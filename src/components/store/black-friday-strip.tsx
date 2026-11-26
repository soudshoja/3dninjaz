"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { BLACK_FRIDAY, isBlackFridayOn } from "@/lib/black-friday";

/**
 * Black Friday strip: one green bar above the nav on the home page and the
 * shop, with the coupon code and a copy button.
 *
 * The layout renders it on the server while the sale has not ended, so there
 * is no layout shift. The text carries no "time left" wording, so the server
 * and client markup always match; after the end time the client hides it even
 * if a cached page still includes it.
 */

/** The site heading face. Set inline: a `font-[var(...)]` class reads as a
 *  font weight on non-heading tags, so it would not switch the family here. */
const HEADING = { fontFamily: "var(--font-heading), sans-serif" } as const;

function showsOn(pathname: string): boolean {
  return pathname === "/" || pathname === "/shop" || pathname.startsWith("/shop/");
}

export function BlackFridayStrip() {
  const pathname = usePathname();
  const [ended, setEnded] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isBlackFridayOn()) setEnded(true);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (ended || !showsOn(pathname)) return null;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(BLACK_FRIDAY.code);
    } catch {
      // Clipboard blocked (some in-app browsers): the code is still on screen
      // to type in, so the button just confirms without failing.
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  }

  return (
    <aside
      aria-label="Black Friday offer"
      className="flex min-h-12 flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5 text-center"
      style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
    >
      <p className="text-sm font-bold md:text-base">
        <span className="font-normal tracking-wide" style={HEADING}>
          BLACK FRIDAY
        </span>{" "}
        15% off everything
        <span className="hidden md:inline">, {BLACK_FRIDAY.when}</span>
      </p>
      <button
        type="button"
        onClick={copyCode}
        className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full px-3.5 text-sm font-bold transition-transform duration-150 hover:-translate-y-px active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ backgroundColor: BRAND.ink, color: "#FFFFFF", outlineColor: BRAND.ink }}
        aria-label={`Copy code ${BLACK_FRIDAY.code}`}
      >
        <span className="font-normal tracking-wider" style={HEADING}>
          {BLACK_FRIDAY.code}
        </span>
        {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </button>
    </aside>
  );
}
