"use client";

import { useState } from "react";
import { BRAND } from "@/lib/brand";

/**
 * Client-island copy button. Isolated so the parent timeline stays a plain
 * server component with zero JS shipped to the browser.
 */
export function CopyTrackingButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — silently no-op. The raw number is already visible.
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-4 py-2 text-sm font-semibold"
      style={{
        backgroundColor: "transparent",
        color: BRAND.ink,
        border: `2px solid ${BRAND.ink}33`,
      }}
      aria-live="polite"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
