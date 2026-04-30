"use client";

/**
 * Quick task 260430-kmr — Inline banner shown above the product edit form when
 * a draft snapshot exists in localStorage for the current product (key
 * `productDraft:<id>` or `productDraft:new`).
 *
 * NOT a Dialog — the admin should still be able to interact with the rest of
 * the form while ignoring the banner. Restore + Discard buttons each fire a
 * parent-owned callback; the banner does not manage its own dismissed state.
 */

import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { History, X } from "lucide-react";

type Props = {
  /** ms-since-epoch — formatted via toLocaleString() inline. */
  savedAt: number;
  onRestore: () => void;
  onDiscard: () => void;
};

export function DraftRestoredBanner({ savedAt, onRestore, onDiscard }: Props) {
  const stamp = new Date(savedAt).toLocaleString();

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
      style={{
        backgroundColor: `${BRAND.blue}0d`,
        borderColor: `${BRAND.blue}40`,
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <History className="h-4 w-4 shrink-0" aria-hidden style={{ color: BRAND.blue }} />
        <p className="text-sm" style={{ color: BRAND.ink }}>
          <span className="font-semibold">Unsaved draft</span> from{" "}
          <span className="font-mono text-xs">{stamp}</span> — restore your changes?
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          type="button"
          onClick={onRestore}
          className="min-h-[44px]"
          style={{ backgroundColor: BRAND.blue, color: "white" }}
        >
          Restore
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDiscard}
          className="min-h-[44px] gap-1.5"
        >
          <X className="h-4 w-4" />
          Discard
        </Button>
      </div>
    </div>
  );
}
