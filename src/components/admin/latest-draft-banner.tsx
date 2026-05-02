"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { History, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

const DISMISS_KEY = "latestDraftBannerDismissed";

function formatRelative(savedAt: number): string {
  const diffMs = Date.now() - savedAt;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "yesterday";
  const d = new Date(savedAt);
  return d.toLocaleDateString("en-MY", { month: "short", day: "numeric" });
}

type DraftInfo = { name: string; url: string; savedAt: number };

function findLatestDraft(): DraftInfo | null {
  try {
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith("productDraft:"),
    );
    let best: { key: string; savedAt: number; value: unknown } | null = null;
    for (const key of keys) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? "");
        if (parsed && typeof parsed.savedAt === "number") {
          if (!best || parsed.savedAt > best.savedAt)
            best = { key, savedAt: parsed.savedAt, value: parsed.value };
        }
      } catch { /* skip unparseable */ }
    }
    if (!best) return null;
    // key shape: productDraft:<scope>:<productId>
    const parts = best.key.split(":");
    const scope = parts[1] ?? "form";
    const productId = parts.slice(2).join(":") || "new";
    const rawName =
      best.value && typeof best.value === "object"
        ? (best.value as Record<string, unknown>).name
        : undefined;
    const name =
      typeof rawName === "string" && rawName.trim()
        ? rawName.trim()
        : "(unsaved product)";
    let url: string;
    if (scope === "configurator") url = `/admin/products/${productId}/configurator`;
    else if (scope === "variants") url = `/admin/products/${productId}/variants`;
    else if (productId === "new") url = "/admin/products/new";
    else url = `/admin/products/${productId}/edit`;
    return { name, url, savedAt: best.savedAt };
  } catch {
    return null;
  }
}

export function LatestDraftBanner() {
  const [draft, setDraft] = useState<DraftInfo | null>(null);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY)) return;
    setDraft(findLatestDraft());
  }, []);

  if (!draft) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
      style={{ backgroundColor: "#fffbea", borderColor: "#fbbf24" }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <History className="h-4 w-4 shrink-0" aria-hidden style={{ color: "#b45309" }} />
        <p className="text-sm" style={{ color: BRAND.ink }}>
          Continue your last edit —{" "}
          <span className="font-semibold">{draft.name}</span>
          {" · "}
          <span className="text-xs opacity-70">{formatRelative(draft.savedAt)}</span>
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link href={draft.url}>
          <Button
            type="button"
            className="min-h-[36px] h-9 px-4 text-sm"
            style={{ backgroundColor: "#b45309", color: "white" }}
          >
            Continue
          </Button>
        </Link>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, "1");
            setDraft(null);
          }}
          className="flex items-center justify-center h-9 w-9 rounded hover:bg-amber-100 transition-colors"
        >
          <X className="h-4 w-4" style={{ color: "#b45309" }} />
        </button>
      </div>
    </div>
  );
}
