"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { KEYCAP_ICONS } from "@/lib/keycap-icons";
import { BRAND } from "@/lib/brand";

// ---------------------------------------------------------------------------
// Phase 25 (25-05) — admin icon allow-list picker (UI-SPEC Surface 4).
//
// Adapted near-verbatim from colour-picker-dialog.tsx: shadcn Dialog
// (max-w-720px, admin-only desktop-primary), client-side name filter,
// multi-select staged in a Set<string>, native-checkbox brand accent,
// pluralised footer counter + disabled-when-zero confirm CTA, and the
// select-multiple return-ids-on-confirm contract.
//
// The catalog is STATIC (KEYCAP_ICONS, 34 entries) — no async fetch, no
// file-import, no CRUD. Every entry renders identically; there is deliberately
// no IP-status badge or grouping of any kind (D-08).
// ---------------------------------------------------------------------------

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Icon ids already selected for this field — seeds the staged selection. */
  initialSelectedIds: string[];
  /** Called on Confirm with the staged icon ids. */
  onConfirm: (ids: string[]) => void;
};

export function IconPickerDialog({
  open,
  onOpenChange,
  initialSelectedIds,
  onConfirm,
}: Props) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reset + seed the staged selection every time we (re)open.
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelectedIds(new Set(initialSelectedIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Client-side name filter over the icon label.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return KEYCAP_ICONS;
    return KEYCAP_ICONS.filter((icon) => icon.label.toLowerCase().includes(q));
  }, [search]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onConfirmClick = () => {
    if (selectedIds.size === 0) return;
    onConfirm(Array.from(selectedIds));
    onOpenChange(false);
  };

  const selectedCount = selectedIds.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px] w-[92vw] sm:max-w-[720px] p-6">
        <DialogHeader>
          <DialogTitle className="text-xl">Choose an icon</DialogTitle>
          <DialogDescription className="text-sm">
            {`${KEYCAP_ICONS.length} icons available`}
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="space-y-3 py-2">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
              aria-hidden
            />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              aria-label="Search icons"
              className="w-full rounded-xl border-2 pl-10 pr-3 py-3 text-sm min-h-[48px] outline-none focus:border-[#7360F2]"
              style={{ borderColor: `${BRAND.ink}33` }}
            />
          </div>
        </div>

        {/* Grid */}
        <div
          className="max-h-[50vh] overflow-y-auto rounded-xl border p-3"
          style={{ borderColor: `${BRAND.ink}1A` }}
        >
          {filtered.length === 0 ? (
            <div className="p-6 text-center">
              <p className="font-semibold mb-1" style={{ color: BRAND.ink }}>
                No icons match.
              </p>
              <p className="text-sm text-slate-600">Try a shorter query.</p>
            </div>
          ) : (
            <ul
              role="listbox"
              aria-label="Keycap icon catalog"
              aria-multiselectable="true"
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}
            >
              {filtered.map((icon) => {
                const selected = selectedIds.has(icon.id);
                return (
                  <li
                    key={icon.id}
                    role="option"
                    aria-selected={selected}
                    onClick={() => toggle(icon.id)}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        toggle(icon.id);
                      }
                    }}
                    tabIndex={0}
                    title={icon.label}
                    className="relative flex flex-col items-center gap-1.5 rounded-xl p-2 outline-none focus-visible:ring-2 cursor-pointer transition-colors"
                    style={{
                      backgroundColor: selected ? BRAND.cream : "transparent",
                      border: selected
                        ? `2px solid ${BRAND.green}`
                        : `2px solid ${BRAND.ink}1A`,
                      minHeight: "112px",
                    }}
                  >
                    {/* Native checkbox — brand accent, top-left */}
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggle(icon.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${icon.label}`}
                      className="absolute top-1.5 left-1.5 w-5 h-5 cursor-pointer"
                      style={{ accentColor: BRAND.green }}
                    />
                    {/* Selected checkmark, top-right */}
                    {selected ? (
                      <Check
                        className="absolute top-1.5 right-1.5 w-4 h-4"
                        style={{ color: BRAND.green }}
                        aria-hidden
                      />
                    ) : null}
                    {/* Thumbnail */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={icon.imageUrl}
                      alt=""
                      aria-hidden
                      className="w-14 h-14 object-contain"
                      style={{ marginTop: 4 }}
                    />
                    {/* Label */}
                    <span
                      className="text-center font-semibold truncate w-full"
                      style={{ fontSize: 12, color: BRAND.ink }}
                    >
                      {icon.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span
            className="text-sm font-semibold"
            style={{ color: selectedCount === 0 ? "#71717A" : BRAND.ink }}
          >
            {selectedCount === 0
              ? "Select icons to add"
              : `${selectedCount} icon${selectedCount === 1 ? "" : "s"} selected`}
          </span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-full px-6 py-3 font-semibold border-2 min-h-[48px]"
              style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirmClick}
              disabled={selectedCount === 0}
              className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50"
              style={{ backgroundColor: BRAND.ink }}
            >
              {`Add ${selectedCount} icon${selectedCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
