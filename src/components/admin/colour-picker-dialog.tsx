"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Search, Check, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  attachLibraryColours,
  getActiveColoursForPicker,
  type ColourPickerRow,
} from "@/actions/admin-colours";
import { BRAND } from "@/lib/brand";

// ---------------------------------------------------------------------------
// Plan 18-05 — library picker modal (Surface 3 in 18-UI-SPEC.md).
//
// Mounts via shadcn Dialog (D-05 — max-w-720px, admin-only desktop-primary).
// Single fetch on open (D-06), client-side filter on name+brand+
// family_subtype+code, plus optional brand/family secondary selects.
// Multi-select staged in a Set<string>; footer renders pluralised counter
// + disabled-when-zero CTA. Confirm calls attachLibraryColours then
// onConfirmed (Pattern B refetch wired by the parent variant-editor).
//
// NOTE: shadcn Checkbox primitive is not installed in this project. We use a
// native <input type="checkbox"> with brand-coloured accent. Same a11y
// surface (role implicit + checked + disabled states) without adding a new
// primitive.
// ---------------------------------------------------------------------------

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  optionId: string;
  /**
   * Carries productId for caller context. The server action looks up
   * productId via optionId, so this prop is informational only — kept on the
   * interface for symmetry with Plan 18-06 wiring.
   */
  productId: string;
  /**
   * Set of colour ids already attached to this option. Rows for these ids
   * render disabled with an "Already attached" tooltip + checked-look box.
   */
  alreadyAttachedColourIds: Set<string>;
  /**
   * Pattern B refetch — caller wires its own getVariantEditorData refresh.
   * Awaited before the dialog closes so variant matrix stays consistent.
   */
  onConfirmed: () => Promise<void> | void;
};

type Brand = "All" | "Bambu" | "Polymaker" | "Other";
type FamilyType = "All" | "PLA" | "PETG" | "TPU" | "CF" | "Other";

export function ColourPickerDialog({
  open,
  onOpenChange,
  optionId,
  productId: _productId, // see prop docstring — kept for caller symmetry
  alreadyAttachedColourIds,
  onConfirmed,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ColourPickerRow[]>([]);
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState<Brand>("All");
  const [family, setFamily] = useState<FamilyType>("All");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Single fetch on open (D-06). Reset state every time we re-open.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setSelectedIds(new Set());
    setSearch("");
    setBrand("All");
    setFamily("All");
    void getActiveColoursForPicker()
      .then((data) => setRows(data))
      .catch(() => setError("Could not load colours. Please close and reopen."))
      .finally(() => setLoading(false));
  }, [open]);

  // Client-side filter (D-06). Brand + Family selects intersect with search.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (brand !== "All" && r.brand !== brand) return false;
      if (family !== "All" && r.familyType !== family) return false;
      if (!q) return true;
      const hay = `${r.name} ${r.brand} ${r.familySubtype} ${r.code ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, brand, family]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onConfirm = () => {
    if (selectedIds.size === 0) return;
    setError(null);
    startTransition(async () => {
      const ids = Array.from(selectedIds);
      const res = await attachLibraryColours(optionId, ids);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Pattern B refetch via parent's hook (Plan 18-06 wires the actual call)
      await onConfirmed();
      onOpenChange(false);
    });
  };

  const selectedCount = selectedIds.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px] w-[92vw] sm:max-w-[720px] p-6">
        <DialogHeader>
          <DialogTitle className="text-xl">Pick from colour library</DialogTitle>
          <DialogDescription className="text-sm">
            {loading
              ? "Loading…"
              : `${rows.length} colour${rows.length === 1 ? "" : "s"} available`}
          </DialogDescription>
        </DialogHeader>

        {/* Search + filters */}
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
              placeholder="Search by name, code, family…"
              aria-label="Search colours"
              className="w-full rounded-xl border-2 pl-10 pr-3 py-3 text-sm min-h-[48px] outline-none focus:border-[#8A00C2]"
              style={{ borderColor: `${BRAND.ink}33` }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value as Brand)}
              aria-label="Brand filter"
              className="rounded-xl border-2 px-3 py-2 text-sm min-h-[40px] bg-white"
              style={{ borderColor: `${BRAND.ink}33` }}
            >
              <option value="All">Brand: All</option>
              <option value="Bambu">Bambu</option>
              <option value="Polymaker">Polymaker</option>
              <option value="Other">Other</option>
            </select>
            <select
              value={family}
              onChange={(e) => setFamily(e.target.value as FamilyType)}
              aria-label="Family filter"
              className="rounded-xl border-2 px-3 py-2 text-sm min-h-[40px] bg-white"
              style={{ borderColor: `${BRAND.ink}33` }}
            >
              <option value="All">Family: All</option>
              <option value="PLA">PLA</option>
              <option value="PETG">PETG</option>
              <option value="TPU">TPU</option>
              <option value="CF">CF</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        {/* List */}
        <div
          className="max-h-[50vh] overflow-y-auto rounded-xl border"
          style={{ borderColor: `${BRAND.ink}1A` }}
        >
          {loading ? (
            <div className="p-3 space-y-2" aria-busy="true">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-12 rounded-lg bg-slate-100 animate-pulse"
                />
              ))}
            </div>
          ) : error ? (
            <div className="p-6 text-center" role="alert">
              <AlertCircle className="w-6 h-6 mx-auto mb-2" style={{ color: "#991B1B" }} />
              <p className="text-sm" style={{ color: "#991B1B" }}>
                {error}
              </p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center">
              <p className="font-semibold mb-1" style={{ color: BRAND.ink }}>
                No colours in the library yet.
              </p>
              <p className="text-sm text-slate-600">
                Run{" "}
                <code className="rounded bg-slate-100 px-2 py-1 text-xs">
                  npx tsx --env-file=.env.local scripts/seed-colours.ts
                </code>{" "}
                or add a colour at /admin/colours.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center">
              <p className="font-semibold mb-1" style={{ color: BRAND.ink }}>
                No colours match.
              </p>
              <p className="text-sm text-slate-600">
                Try a shorter query or change brand/family filters.
              </p>
            </div>
          ) : (
            <ul
              role="listbox"
              aria-label="Colour library"
              aria-multiselectable="true"
              className="divide-y"
              style={{ borderColor: `${BRAND.ink}10` }}
            >
              {filtered.map((c) => {
                const attached = alreadyAttachedColourIds.has(c.id);
                const selected = selectedIds.has(c.id);
                const disabled = attached;
                return (
                  <li
                    key={c.id}
                    role="option"
                    aria-selected={selected || attached}
                    aria-disabled={disabled}
                    onClick={() => {
                      if (!disabled) toggle(c.id);
                    }}
                    onKeyDown={(e) => {
                      if (disabled) return;
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        toggle(c.id);
                      }
                    }}
                    tabIndex={disabled ? -1 : 0}
                    className="flex items-center gap-3 px-3 py-2 outline-none focus-visible:ring-2"
                    style={{
                      backgroundColor: selected ? BRAND.cream : "transparent",
                      borderLeft: selected
                        ? `2px solid ${BRAND.ink}`
                        : "2px solid transparent",
                      opacity: attached ? 0.5 : 1,
                      cursor: disabled ? "not-allowed" : "pointer",
                      minHeight: "56px",
                    }}
                    title={attached ? "Already attached to this product" : c.name}
                  >
                    <input
                      type="checkbox"
                      checked={selected || attached}
                      disabled={disabled}
                      readOnly={disabled}
                      onChange={() => {
                        if (!disabled) toggle(c.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${c.name}`}
                      className="w-5 h-5 cursor-pointer"
                      style={{
                        accentColor: BRAND.ink,
                        cursor: disabled ? "not-allowed" : "pointer",
                      }}
                    />
                    <span
                      className="inline-block rounded-full shrink-0"
                      aria-hidden
                      style={{
                        width: 24,
                        height: 24,
                        backgroundColor: c.hex,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <span
                      className="flex-1 text-sm font-semibold truncate"
                      style={{ color: BRAND.ink }}
                    >
                      {c.name}
                      {attached ? (
                        <span
                          className="ml-2 text-xs font-normal italic"
                          style={{ color: "#71717A" }}
                        >
                          Already attached
                        </span>
                      ) : null}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-xs shrink-0"
                      style={{
                        borderColor:
                          c.brand === "Bambu"
                            ? BRAND.green
                            : c.brand === "Polymaker"
                              ? BRAND.blue
                              : "#CBD5E1",
                        color: BRAND.ink,
                      }}
                    >
                      {c.brand}
                    </Badge>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {c.familyType}
                    </Badge>
                    {c.familySubtype ? (
                      <Badge
                        variant="secondary"
                        className="text-xs opacity-80 shrink-0"
                      >
                        {c.familySubtype}
                      </Badge>
                    ) : null}
                    <span className="font-mono text-xs text-slate-600 min-w-[56px] text-right shrink-0">
                      {c.code ?? "—"}
                    </span>
                    {selected && !attached ? (
                      <Check
                        className="w-4 h-4 shrink-0"
                        style={{ color: BRAND.ink }}
                        aria-hidden
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span
            className="text-sm font-semibold"
            style={{
              color: selectedCount === 0 ? "#71717A" : BRAND.ink,
            }}
          >
            {selectedCount === 0
              ? "Select colours to add"
              : `${selectedCount} colour${selectedCount === 1 ? "" : "s"} selected`}
          </span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              className="rounded-full px-6 py-3 font-semibold border-2 min-h-[48px]"
              style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending || selectedCount === 0}
              className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50"
              style={{ backgroundColor: BRAND.ink }}
            >
              {pending
                ? "Adding…"
                : `Add ${selectedCount} colour${selectedCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
