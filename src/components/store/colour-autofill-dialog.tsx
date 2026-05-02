"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { BRAND } from "@/lib/brand";

export type AutofillPrompt = {
  axisLabel: string;
  colourLabel: string;
  swatchHex?: string;
  onConfirm: () => void;
  onSkip: () => void;
};

type Props = {
  queue: AutofillPrompt[];
  onResolveAll: () => void;
};

export function ColourAutofillDialog({ queue, onResolveAll }: Props) {
  const prompt = queue[0];
  const open = queue.length > 0;

  function handleConfirm() {
    prompt.onConfirm();
    if (queue.length <= 1) onResolveAll();
  }

  function handleSkip() {
    prompt.onSkip();
    if (queue.length <= 1) onResolveAll();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onResolveAll(); }}>
      <DialogContent showCloseButton={false} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Match colour?</DialogTitle>
          <DialogDescription>
            Apply the same colour to <strong>{prompt?.axisLabel}</strong>?
          </DialogDescription>
        </DialogHeader>

        {prompt && (
          <div className="flex items-center gap-3 py-2">
            {prompt.swatchHex && (
              <span
                className="rounded-full shrink-0"
                aria-hidden="true"
                style={{
                  width: 32,
                  height: 32,
                  backgroundColor: prompt.swatchHex,
                  border: "1.5px solid #d1d5db",
                  display: "inline-block",
                }}
              />
            )}
            <span className="text-sm font-semibold" style={{ color: BRAND.ink }}>
              {prompt.colourLabel}
            </span>
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={handleSkip}
            className="rounded-full px-5 py-2.5 font-semibold border-2 min-h-[44px] text-sm"
            style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
          >
            Skip
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-full px-5 py-2.5 font-bold text-white min-h-[44px] text-sm"
            style={{ backgroundColor: BRAND.ink }}
          >
            Yes, match it
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
