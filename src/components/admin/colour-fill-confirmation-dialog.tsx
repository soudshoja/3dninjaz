"use client";

/**
 * Phase 20-xx — Cross-axis colour auto-fill prompt.
 *
 * Shows a sequential dialog queue: after an admin adds colour(s) to one
 * colour axis, each OTHER colour axis gets its own yes/skip prompt.
 * One dialog at a time; no persistence — in-memory React state only.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { BRAND } from "@/lib/brand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ColourFillPrompt = {
  /** e.g. "Trim Color" / "Secondary Color" */
  targetAxisLabel: string;
  /** colours to potentially add — already filtered to exclude ones target already has */
  coloursToAdd: { id: string; name: string; hex: string }[];
  /** call this when admin clicks "Yes, apply" */
  onConfirm: () => void | Promise<void>;
  /** call this when admin clicks "Skip" */
  onSkip: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ColourFillConfirmationDialog({
  queue,
  onResolveAll,
}: {
  queue: ColourFillPrompt[];
  /** called when the last prompt is answered (or dialog is dismissed early) */
  onResolveAll: () => void;
}) {
  const current = queue[0];
  const open = queue.length > 0;

  // Closing via overlay click or Esc skips the entire remaining queue.
  const handleOpenChange = (v: boolean) => {
    if (!v) onResolveAll();
  };

  if (!current) return null;

  const n = current.coloursToAdd.length;
  const plural = n === 1 ? "" : "s";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[500px] w-[92vw] p-6">
        <DialogHeader>
          <DialogTitle className="text-lg" style={{ color: BRAND.ink }}>
            Apply {n} colour{plural} to {current.targetAxisLabel}?
          </DialogTitle>
          <DialogDescription className="text-sm">
            The colour{plural} below {n === 1 ? "is" : "are"} not yet on{" "}
            <strong>{current.targetAxisLabel}</strong>. Apply {n === 1 ? "it" : "them"} now?
          </DialogDescription>
        </DialogHeader>

        {/* Swatch chips */}
        <div className="flex flex-wrap gap-3 py-2">
          {current.coloursToAdd.map((c) => (
            <div key={c.id} className="flex flex-col items-center gap-1">
              <span
                className="inline-block rounded-full shrink-0"
                aria-label={c.name}
                title={c.name}
                style={{
                  width: 32,
                  height: 32,
                  backgroundColor: c.hex,
                  border: "1px solid rgba(0,0,0,0.12)",
                  boxShadow: "inset 0 0 0 2px #fff",
                }}
              />
              <span
                className="text-xs max-w-[56px] text-center leading-tight truncate"
                style={{ color: BRAND.ink }}
                title={c.name}
              >
                {c.name}
              </span>
            </div>
          ))}
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={current.onSkip}
            className="rounded-full px-6 py-3 font-semibold border-2 min-h-[48px] text-sm"
            style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
          >
            Skip
          </button>
          <button
            type="button"
            onClick={current.onConfirm}
            className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] text-sm"
            style={{ backgroundColor: BRAND.ink }}
          >
            Yes, apply
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
