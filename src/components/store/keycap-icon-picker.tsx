"use client";

/**
 * Phase 25 (25-06) — Customer-facing keycap icon picker (Surface S2).
 *
 * A SINGLE-select picker that fills one icon slot in the mixed keycap sequence
 * builder (see KeycapSeqField in configurator-form.tsx). Reuses the project's
 * shadcn/Base-UI Dialog primitive (the same overlay ColourPickerDialog uses) —
 * NOT a hand-rolled modal (UI-SPEC S2).
 *
 * Behaviour (UI-SPEC S2):
 *   - Renders a responsive grid of the field's `allowedIconIds` (in order),
 *     each cell = the committed WebP thumbnail + a 12px truncated label.
 *   - Tapping a cell calls `onPick(id)` and closes the picker.
 *   - The currently-`selectedId` cell shows the green selected ring + Check.
 *   - When `allowedIconIds` is empty the component renders NOTHING — the parent
 *     hides the `+ Icon` affordance entirely (letter-only graceful degrade).
 *   - NO IP badge or grouping — every icon renders identically (D-08).
 */

import { useState } from "react";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { KEYCAP_ICON_BY_ID } from "@/lib/keycap-icons";
import { BRAND } from "@/lib/brand";

type Props = {
  /** Catalog ids the admin allowed for this product's icon slots (order preserved). */
  allowedIconIds: string[];
  /** Currently-filled icon id when editing an existing slot (shows selected ring). */
  selectedId?: string;
  /** Called with the chosen icon id; the picker closes immediately after. */
  onPick: (iconId: string) => void;
  /** Single element rendered as the picker trigger (Base UI `render` composition). */
  trigger: React.ReactElement;
};

export function KeycapIconPicker({ allowedIconIds, selectedId, onPick, trigger }: Props) {
  const [open, setOpen] = useState(false);

  // Graceful degrade — no allowed icons means the parent should never mount this,
  // but guard anyway so an empty allow-list renders nothing.
  if (allowedIconIds.length === 0) return null;

  function handlePick(id: string) {
    onPick(id);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-[440px] w-[92vw] sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Choose an icon</DialogTitle>
        </DialogHeader>

        <div
          className="max-h-[60vh] overflow-y-auto p-1"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))",
            gap: 8,
          }}
          role="listbox"
          aria-label="Available icons"
        >
          {allowedIconIds.map((id) => {
            const icon = KEYCAP_ICON_BY_ID[id];
            if (!icon) return null;
            const isSelected = selectedId === id;
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => handlePick(id)}
                title={icon.label}
                aria-label={icon.label}
                className="relative flex flex-col items-center gap-1 rounded-xl p-1.5 transition-transform active:scale-95"
                style={{
                  minWidth: 64,
                  minHeight: 64,
                  background: "#fff",
                  border: isSelected
                    ? `3px solid ${BRAND.green}`
                    : "2px solid rgba(0,0,0,0.08)",
                  boxShadow: isSelected
                    ? `0 0 0 3px ${BRAND.green}35`
                    : "0 2px 6px rgba(0,0,0,0.06)",
                  cursor: "pointer",
                }}
              >
                <span
                  className="relative flex items-center justify-center"
                  style={{ width: 44, height: 44 }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={icon.imageUrl}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                  {isSelected && (
                    <Check
                      size={18}
                      strokeWidth={3}
                      className="absolute -top-1.5 -right-1.5 rounded-full"
                      style={{ color: BRAND.green, background: "#fff" }}
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span
                  className="w-full text-center leading-tight"
                  style={{
                    fontSize: 12,
                    fontWeight: isSelected ? 800 : 600,
                    color: isSelected ? BRAND.ink : "#6b7280",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {icon.label}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
