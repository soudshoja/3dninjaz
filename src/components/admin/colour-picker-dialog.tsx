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
  getMyColoursForPicker,
  type ColourPickerRow,
} from "@/actions/admin-colours";

export type { ColourPickerRow };
import { BRAND } from "@/lib/brand";

// ---------------------------------------------------------------------------
// Phase 20-xx — My Colours prompt type
// ---------------------------------------------------------------------------
export type MyColoursPrompt = {
  /** Array of My Colour rows (isMyColour = true) */
  myColours: ColourPickerRow[];
  /** Called when admin clicks "Skip" */
  onSkip: () => void;
};
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
  /**
   * Optional companion to onConfirmed (attach-to-option mode only).
   * Called with the rows that were just attached, BEFORE onConfirmed fires.
   * Used by cross-axis colour auto-fill to build a queue without an extra
   * server round-trip.
   */
  onConfirmedWithRows?: (rows: ColourPickerRow[]) => void;
  // ---------------------------------------------------------------------------
  // Phase 19-04 (D-08) — select-multiple mode for configurator builder.
  // Default: "attach-to-option" (Phase 18 behaviour unchanged).
  // ---------------------------------------------------------------------------
  /**
   * "attach-to-option" (default) — calls attachLibraryColours server action,
   * then onConfirmed(). Phase 18 behaviour.
   *
   * "select-multiple" — does NOT write to DB. Seeds selection from
   * preSelectedColourIds. Confirm calls onSelectMultiple(ids) and closes.
   * Used by config-field-modal to pick allowedColorIds for a colour field.
   */
  mode?: "attach-to-option" | "select-multiple";
  /** Pre-selected colour ids when mode="select-multiple" */
  preSelectedColourIds?: string[];
  /** Called on Confirm when mode="select-multiple" */
  onSelectMultiple?: (selectedIds: string[], selectedRows: ColourPickerRow[]) => void;
  // ---------------------------------------------------------------------------
  // Phase 20-xx — My Colours prompt (D-14).
  // ---------------------------------------------------------------------------
  /** If provided, shows "Load My Colours?" prompt before opening picker */
  myColoursPrompt?: MyColoursPrompt;
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
  onConfirmedWithRows,
  // Phase 19-04 (D-08) additions — default to existing behaviour
  mode = "attach-to-option",
  preSelectedColourIds,
  onSelectMultiple,
  // Phase 20-xx (D-14) — My Colours prompt
  myColoursPrompt,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ColourPickerRow[]>([]);
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState<Brand>("All");
  const [family, setFamily] = useState<FamilyType>("All");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Phase 20-xx — My Colours prompt action tracker.
  // null = no prompt yet; "prompt" = show the prompt; "yes" = pre-selected My Colours; "skip" = normal picker
  const [myColoursAction, setMyColoursAction] = useState<"prompt" | "yes" | "skip" | null>(null);

  // Single fetch on open (D-06). Reset state every time we re-open.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setMyColoursAction(null);
    // Phase 19-04: seed pre-selected ids in select-multiple mode
    setSelectedIds(
      mode === "select-multiple" && preSelectedColourIds
        ? new Set(preSelectedColourIds)
        : new Set()
    );
    setSearch("");
    setBrand("All");
    setFamily("All");
    void getActiveColoursForPicker()
      .then((data) => setRows(data))
      .catch(() => setError("Could not load colours. Please close and reopen."))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Phase 20-xx — Show My Colours prompt when data arrives after open.
  // The parent (variant-editor / config-field-modal) fetches My Colours
  // asynchronously and passes them as a prop. When they arrive and the
  // admin hasn't already decided, show the prompt.
  useEffect(() => {
    if (!open || myColoursAction !== null) return;
    if (myColoursPrompt && myColoursPrompt.myColours.length > 0) {
      setMyColoursAction("prompt");
    }
  }, [open, myColoursAction, myColoursPrompt]);

  // Client-side filter (D-06). Brand + Family selects intersect with search.
  // Phase 20-xx: When admin accepted the My Colours prompt, restrict candidates
  // to My Colours only — admin can still search/filter within that subset.
  const filtered = useMemo(() => {
    let candidates = rows;
    if (myColoursAction === "yes" && myColoursPrompt) {
      const myIds = new Set(myColoursPrompt.myColours.map((c) => c.id));
      candidates = candidates.filter((r) => myIds.has(r.id));
    }
    const q = search.trim().toLowerCase();
    return candidates.filter((r) => {
      if (brand !== "All" && r.brand !== brand) return false;
      if (family !== "All" && r.familyType !== family) return false;
      if (!q) return true;
      const hay = `${r.name} ${r.brand} ${r.familySubtype} ${r.code ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, brand, family, myColoursAction, myColoursPrompt]);

  // Phase 20-xx — My Colours prompt handlers
  const handleLoadMyColours = () => {
    if (!myColoursPrompt) return;
    // Pre-select all My Colours so admin can uncheck any they don't want
    setSelectedIds(new Set(myColoursPrompt.myColours.map((c) => c.id)));
    // Restrict the picker to show only My Colours
    setMyColoursAction("yes");
  };

  const handleSkipMyColours = () => {
    setMyColoursAction("skip");
    myColoursPrompt?.onSkip();
  };

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

    // Phase 19-04: branch by mode
    if (mode === "select-multiple") {
      // No DB write — return selected ids (and full row data) to caller
      const selectedRows = rows.filter((r) => selectedIds.has(r.id));
      onSelectMultiple?.(Array.from(selectedIds), selectedRows);
      onOpenChange(false);
      return;
    }

    // Default: "attach-to-option" — Phase 18 behaviour unchanged
    startTransition(async () => {
      const ids = Array.from(selectedIds);
      const res = await attachLibraryColours(optionId, ids);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Fire optional companion callback with the rows that were just attached,
      // before the parent refetch clears the local rows state. Used by cross-axis
      // colour auto-fill in variant-editor.tsx.
      if (onConfirmedWithRows) {
        const attachedRows = rows.filter((r) => selectedIds.has(r.id));
        onConfirmedWithRows(attachedRows);
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

        {/* Phase 20-xx — My Colours prompt. Shown BEFORE the picker when
            My Colours exist. Admin can load them (pre-selected) or skip. */}
        {myColoursAction === "prompt" && myColoursPrompt && myColoursPrompt.myColours.length > 0 ? (
          <div className="py-8 text-center space-y-4">
            <p className="text-lg font-bold" style={{ color: BRAND.ink }}>
              Load your My Colours?
            </p>
            <p className="text-sm" style={{ color: "#4B5563" }}>
              {myColoursPrompt.myColours.length} colour
              {myColoursPrompt.myColours.length === 1 ? "" : "s"} will be
              pre-selected. You can uncheck any you don&apos;t want before
              confirming.
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleSkipMyColours}
                className="rounded-full px-6 py-3 font-semibold border-2 min-h-[48px] text-sm"
                style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
              >
                Skip
              </button>
              <button
                type="button"
                onClick={handleLoadMyColours}
                className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] text-sm"
                style={{ backgroundColor: BRAND.ink }}
              >
                Yes, load them
              </button>
            </div>
          </div>
        ) : (
        <>
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
              {/* Phase 19-04: different label in select-multiple mode */}
              {mode === "select-multiple"
                ? `Use ${selectedCount} selected colour${selectedCount === 1 ? "" : "s"}`
                : pending
                  ? "Adding…"
                  : `Add ${selectedCount} colour${selectedCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </DialogFooter>
        </>
      )}
      </DialogContent>
    </Dialog>
  );
}
