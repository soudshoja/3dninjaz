"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

const VISITED_KEY = "admin-guide-launch-visited";
const DISMISSED_KEY = "admin-guide-launch-banner-dismissed";

/**
 * Dismissible banner on /admin dashboard prompting the admin to visit the
 * Launch Checklist if they haven't been there yet.
 *
 * Hidden when:
 * - The admin has visited /admin/guide/launch (VISITED_KEY set by LaunchChecklist)
 * - The admin has dismissed this banner (DISMISSED_KEY)
 * - On first server render (avoids hydration mismatch)
 */
export function LaunchBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const visited = localStorage.getItem(VISITED_KEY);
      const dismissed = localStorage.getItem(DISMISSED_KEY);
      if (!visited && !dismissed) {
        setShow(true);
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* noop */
    }
  };

  if (!show) return null;

  return (
    <div
      className="rounded-2xl px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3"
      style={{
        background: `linear-gradient(135deg, ${BRAND.blue}18, ${BRAND.green}12)`,
        border: `1.5px solid ${BRAND.blue}33`,
      }}
      role="status"
      aria-live="polite"
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm" style={{ color: BRAND.ink }}>
          New to the admin panel?
        </p>
        <p className="text-sm text-slate-600 mt-0.5">
          Follow the Launch Checklist to set up the store step by step — from
          your first product to your first real sale.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/admin/guide/launch"
          className="inline-flex items-center rounded-full px-4 py-2 text-sm font-bold text-white min-h-[40px] whitespace-nowrap"
          style={{ backgroundColor: BRAND.blue }}
        >
          Launch Checklist →
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex items-center rounded-full px-3 py-2 text-sm font-semibold min-h-[40px] text-slate-500 hover:text-slate-700 hover:bg-white/60 transition-colors"
          aria-label="Dismiss this banner"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
