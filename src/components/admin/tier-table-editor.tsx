"use client";

import { useState, useTransition, useMemo, useRef } from "react";
import {
  AlertCircle,
  Save,
  Wand2,
  TrendingDown,
  Tag,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveTierTable } from "@/actions/configurator";
import { BRAND } from "@/lib/brand";
import { useProductDraft } from "@/hooks/use-product-draft";
import { DraftRestoredBanner } from "@/components/admin/draft-restored-banner";

// ============================================================================
// Types
// ============================================================================

type FieldOption = {
  id: string;
  label: string;
  fieldType: "text" | "number";
};

type Props = {
  productId: string;
  initialMaxUnitCount: number | null;
  initialPriceTiers: Record<string, number>;
  initialUnitField: string | null;
  /** Text/number config fields on the product — unitField select uses this */
  fieldOptions: FieldOption[];
  onSaved: () => Promise<void> | void;
};

// ============================================================================
// Helpers
// ============================================================================

function perUnit(total: number, count: number): string {
  if (count <= 0 || total <= 0) return "";
  return (total / count).toFixed(2);
}

// ============================================================================
// TierTableEditor
// ============================================================================

export function TierTableEditor({
  productId,
  initialMaxUnitCount,
  initialPriceTiers,
  initialUnitField,
  fieldOptions,
  onSaved,
}: Props) {
  const [maxUnit, setMaxUnit] = useState<number>(initialMaxUnitCount ?? 1);
  const [tiers, setTiers] = useState<Record<string, number>>(initialPriceTiers);
  const [unitField, setUnitField] = useState<string>(initialUnitField ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Autosave draft — persists tier state to localStorage so the admin can
  // recover from accidental navigation. Scope "tiers" keeps the key separate
  // from the main product-form and configurator drafts.
  // -------------------------------------------------------------------------
  const tierDraftValue = useMemo(
    () => ({ maxUnit, tiers, unitField }),
    [maxUnit, tiers, unitField],
  );
  const tierDraft = useProductDraft(productId, tierDraftValue, { scope: "tiers" });
  const [tierBannerDismissed, setTierBannerDismissed] = useState(false);

  function restoreTierDraft() {
    const v = tierDraft.restore();
    if (!v) {
      setTierBannerDismissed(true);
      return;
    }
    // Defensive shape validation.
    if (typeof v.maxUnit === "number" && Number.isFinite(v.maxUnit) && v.maxUnit >= 1) {
      setMaxUnit(Math.floor(v.maxUnit));
    } else {
      console.warn("[tiers autosave] Dropped invalid maxUnit from draft.");
    }
    if (v.tiers && typeof v.tiers === "object" && !Array.isArray(v.tiers)) {
      const safe: Record<string, number> = {};
      for (const [k, val] of Object.entries(v.tiers)) {
        if (typeof val === "number" && Number.isFinite(val) && val >= 0) {
          safe[k] = val;
        }
      }
      setTiers(safe);
    } else {
      console.warn("[tiers autosave] Dropped invalid tiers map from draft.");
    }
    if (typeof v.unitField === "string") {
      setUnitField(v.unitField);
    }
    setTierBannerDismissed(true);
  }

  function discardTierDraft() {
    tierDraft.discard();
    setTierBannerDismissed(true);
  }

  // Auto-fill: linear interpolation mode
  const [autoMode, setAutoMode] = useState<"step" | "linear">("linear");
  const [autoFirst, setAutoFirst] = useState<string>("7");
  const [autoLast, setAutoLast] = useState<string>("25");
  const [autoBase, setAutoBase] = useState<string>("7");
  const [autoStep, setAutoStep] = useState<string>("2");

  // Bulk apply
  const [bulkValue, setBulkValue] = useState<string>("");

  const [, startTransition] = useTransition();
  const firstInputRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------------------
  // Derived: best-value tier (lowest per-unit price among non-zero tiers)
  // -------------------------------------------------------------------------
  const bestValueCount = useMemo(() => {
    let best: number | null = null;
    let bestPpu = Infinity;
    for (let i = 1; i <= maxUnit; i++) {
      const price = tiers[String(i)] ?? 0;
      if (price <= 0) continue;
      const ppu = price / i;
      if (ppu < bestPpu) {
        bestPpu = ppu;
        best = i;
      }
    }
    return best;
  }, [tiers, maxUnit]);

  // -------------------------------------------------------------------------
  // Tier price helpers
  // -------------------------------------------------------------------------

  const getTierPrice = (n: number): number => tiers[String(n)] ?? 0;

  const setTierPrice = (n: number, price: number) => {
    setTiers((prev) => ({ ...prev, [String(n)]: price }));
  };

  // -------------------------------------------------------------------------
  // handleMaxChange — truncate confirm when reducing
  // -------------------------------------------------------------------------

  const handleMaxChange = (newMax: number) => {
    if (!Number.isInteger(newMax) || newMax < 1) return;
    const currentMax = maxUnit;

    if (newMax < currentMax) {
      const truncatedKeys = Array.from(
        { length: currentMax - newMax },
        (_, i) => String(newMax + 1 + i)
      );
      const confirmMsg = `Reducing max from ${currentMax} to ${newMax} will delete tiers ${truncatedKeys.join(", ")} — continue?`;
      if (!window.confirm(confirmMsg)) return;
    }

    const next: Record<string, number> = {};
    for (let i = 1; i <= newMax; i++) {
      next[String(i)] = tiers[String(i)] ?? 0;
    }
    setMaxUnit(newMax);
    setTiers(next);
  };

  // -------------------------------------------------------------------------
  // Auto-fill
  // -------------------------------------------------------------------------

  const handleAutoFill = () => {
    const next: Record<string, number> = {};

    if (autoMode === "linear") {
      const first = parseFloat(autoFirst);
      const last = parseFloat(autoLast);
      if (!Number.isFinite(first) || !Number.isFinite(last)) return;
      for (let i = 1; i <= maxUnit; i++) {
        const fraction = maxUnit > 1 ? (i - 1) / (maxUnit - 1) : 0;
        next[String(i)] = Math.round((first + (last - first) * fraction) * 100) / 100;
      }
    } else {
      const base = parseFloat(autoBase);
      const step = parseFloat(autoStep);
      if (!Number.isFinite(base) || !Number.isFinite(step)) return;
      for (let i = 1; i <= maxUnit; i++) {
        next[String(i)] = Math.round((base + step * (i - 1)) * 100) / 100;
      }
    }

    setTiers(next);
  };

  // -------------------------------------------------------------------------
  // Bulk apply
  // -------------------------------------------------------------------------

  const handleBulkApply = () => {
    const val = parseFloat(bulkValue);
    if (!Number.isFinite(val) || val < 0) return;
    const next: Record<string, number> = {};
    for (let i = 1; i <= maxUnit; i++) {
      next[String(i)] = val;
    }
    setTiers(next);
    setBulkValue("");
  };

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  const handleSave = () => {
    setError(null);
    setSuccessMsg(null);

    if (!unitField) {
      setError(
        fieldOptions.length === 0
          ? "Add a Text or Number field first before setting tier pricing."
          : "Please select the unit field."
      );
      return;
    }

    setSaving(true);
    startTransition(async () => {
      const result = await saveTierTable(productId, maxUnit, tiers, unitField);
      setSaving(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccessMsg("Tier pricing saved.");
      tierDraft.discard();
      await onSaved();
    });
  };

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  const noTextNumberFields = fieldOptions.length === 0;
  const hasTiers = maxUnit > 0;
  const allZero = hasTiers && Object.values(tiers).every((v) => v === 0);

  return (
    <div className="space-y-5">
      {/* Tier autosave restore banner */}
      {tierDraft.draft && !tierBannerDismissed && (
        <DraftRestoredBanner
          savedAt={tierDraft.draft.savedAt}
          onRestore={restoreTierDraft}
          onDiscard={discardTierDraft}
        />
      )}

      {/* Error / success banners */}
      {error && (
        <div
          role="alert"
          className="flex gap-2 items-start rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div
          role="status"
          className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800"
        >
          {successMsg}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Unit field select                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-1.5">
        <Label htmlFor="unitField">Unit field</Label>
        {noTextNumberFields ? (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg border border-amber-200 px-3 py-2">
            Add a Text or Number field first. The tier lookup uses that field&apos;s value length.
          </p>
        ) : (
          <>
            <select
              id="unitField"
              value={unitField}
              onChange={(e) => setUnitField(e.target.value)}
              className="h-9 w-full rounded-lg border border-input px-3 text-sm bg-transparent transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label="Select unit field for tier pricing"
            >
              <option value="">— Select a field —</option>
              {fieldOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label} ({f.fieldType})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Tier {"{n}"} applies when the customer&apos;s input reaches n characters / units.
            </p>
          </>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Max unit count                                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-1.5">
        <Label htmlFor="maxUnit">Max unit count</Label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleMaxChange(maxUnit - 1)}
            disabled={maxUnit <= 1}
            aria-label="Decrease max unit count"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-input text-base font-bold transition-colors hover:bg-accent disabled:opacity-40 min-h-[44px] min-w-[44px]"
          >
            −
          </button>
          <Input
            id="maxUnit"
            type="number"
            min={1}
            max={200}
            value={maxUnit}
            onChange={(e) => handleMaxChange(Number(e.target.value))}
            className="h-9 w-20 text-center"
            aria-label="Max unit count"
          />
          <button
            type="button"
            onClick={() => handleMaxChange(maxUnit + 1)}
            disabled={maxUnit >= 200}
            aria-label="Increase max unit count"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-input text-base font-bold transition-colors hover:bg-accent disabled:opacity-40 min-h-[44px] min-w-[44px]"
          >
            +
          </button>
          <span className="text-xs text-muted-foreground">1 – 200</span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tools row: auto-fill + bulk apply                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
        {/* Section label */}
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Fill tools
        </p>

        {/* Auto-fill */}
        <div className="space-y-2">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAutoMode("linear")}
              aria-pressed={autoMode === "linear"}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                autoMode === "linear"
                  ? "border-transparent text-white"
                  : "border-border bg-white hover:bg-accent"
              }`}
              style={autoMode === "linear" ? { backgroundColor: BRAND.blue } : undefined}
            >
              <TrendingDown className="h-3.5 w-3.5" />
              Linear fill
            </button>
            <button
              type="button"
              onClick={() => setAutoMode("step")}
              aria-pressed={autoMode === "step"}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                autoMode === "step"
                  ? "border-transparent text-white"
                  : "border-border bg-white hover:bg-accent"
              }`}
              style={autoMode === "step" ? { backgroundColor: BRAND.blue } : undefined}
            >
              <Wand2 className="h-3.5 w-3.5" />
              Step fill
            </button>
          </div>

          {/* Inputs for selected mode */}
          <div className="flex flex-wrap items-end gap-2">
            {autoMode === "linear" ? (
              <>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="autoFirst" className="text-xs">First (MYR)</Label>
                  <Input
                    id="autoFirst"
                    type="number"
                    min={0}
                    step={0.01}
                    value={autoFirst}
                    onChange={(e) => setAutoFirst(e.target.value)}
                    className="h-8 w-24"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="autoLast" className="text-xs">Last (MYR)</Label>
                  <Input
                    id="autoLast"
                    type="number"
                    min={0}
                    step={0.01}
                    value={autoLast}
                    onChange={(e) => setAutoLast(e.target.value)}
                    className="h-8 w-24"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="autoBase" className="text-xs">Base (MYR)</Label>
                  <Input
                    id="autoBase"
                    type="number"
                    min={0}
                    step={0.01}
                    value={autoBase}
                    onChange={(e) => setAutoBase(e.target.value)}
                    className="h-8 w-24"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="autoStep" className="text-xs">Step (MYR)</Label>
                  <Input
                    id="autoStep"
                    type="number"
                    step={0.01}
                    value={autoStep}
                    onChange={(e) => setAutoStep(e.target.value)}
                    className="h-8 w-24"
                  />
                </div>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={handleAutoFill}
              className="h-8 gap-1.5 text-xs self-end"
            >
              <Wand2 className="h-3 w-3" />
              Apply
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {autoMode === "linear"
              ? "Interpolates evenly from first to last price across all tiers."
              : "Tier n = base + step × (n − 1). Edit individual values after."}
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Bulk apply */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="bulkValue" className="text-xs">Set all to (MYR)</Label>
            <Input
              id="bulkValue"
              type="number"
              min={0}
              step={0.01}
              placeholder="e.g. 10.00"
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              className="h-8 w-32"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleBulkApply}
            disabled={bulkValue === ""}
            className="h-8 gap-1.5 text-xs self-end"
          >
            <Tag className="h-3 w-3" />
            Apply all
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Empty state                                                          */}
      {/* ------------------------------------------------------------------ */}
      {(!hasTiers || allZero) && (
        <div className="rounded-xl border-2 border-dashed border-border p-6 text-center space-y-1">
          <p className="text-sm font-medium" style={{ color: BRAND.ink }}>
            No prices set yet
          </p>
          <p className="text-xs text-muted-foreground">
            Use the fill tools above or type prices directly in the table below.
          </p>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Tier table                                                           */}
      {/* ------------------------------------------------------------------ */}
      {hasTiers && (
        <div className="rounded-xl border border-border overflow-hidden" data-tier-table>
          {/* Table header */}
          <div className="grid grid-cols-[3rem_1fr_auto] gap-3 border-b border-border bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>#</span>
            <span>Price (MYR)</span>
            <span className="text-right pr-1">Per unit</span>
          </div>

          {/* Tier rows */}
          <div className="divide-y divide-border">
            {Array.from({ length: maxUnit }, (_, i) => i + 1).map((n, idx) => {
              const price = getTierPrice(n);
              const ppu = perUnit(price, n);
              const isBest = bestValueCount === n && price > 0;

              return (
                <div
                  key={n}
                  className={`grid grid-cols-[3rem_1fr_auto] items-center gap-3 px-4 py-2 transition-colors ${
                    isBest ? "bg-green-50" : "hover:bg-accent/30"
                  }`}
                >
                  {/* Count */}
                  <span
                    className="font-mono text-sm font-medium flex items-center gap-1"
                    style={{ color: isBest ? BRAND.green : BRAND.ink }}
                  >
                    {n}
                    {isBest && (
                      <Star
                        className="h-3 w-3 fill-current"
                        style={{ color: BRAND.green }}
                        aria-label="Best value"
                      />
                    )}
                  </span>

                  {/* Price input */}
                  <Input
                    ref={idx === 0 ? firstInputRef : undefined}
                    type="number"
                    min={0}
                    step={0.01}
                    value={price === 0 ? "" : price}
                    placeholder="0.00"
                    onChange={(e) => setTierPrice(n, parseFloat(e.target.value) || 0)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const next = e.currentTarget
                          .closest("[data-tier-table]")
                          ?.querySelectorAll<HTMLInputElement>("input[type=number]");
                        if (next) {
                          const arr = Array.from(next);
                          const pos = arr.indexOf(e.currentTarget);
                          arr[pos + 1]?.focus();
                        }
                      }
                    }}
                    aria-label={`Price for ${n} unit${n === 1 ? "" : "s"}`}
                    className="h-8 w-32"
                  />

                  {/* Per-unit display */}
                  <span
                    className="text-xs tabular-nums text-right pr-1 w-20"
                    style={{ color: isBest ? BRAND.green : undefined }}
                    aria-label={`${ppu ? `RM ${ppu} per unit` : ""}`}
                  >
                    {ppu ? (
                      <>
                        <span className="text-muted-foreground">RM </span>
                        <span className={isBest ? "font-semibold" : ""}>{ppu}</span>
                        <span className="text-muted-foreground">/ea</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Best-value callout */}
          {bestValueCount !== null && (
            <div
              className="flex items-center gap-2 px-4 py-2.5 border-t border-border text-xs"
              style={{ backgroundColor: `${BRAND.green}18` }}
            >
              <Star className="h-3.5 w-3.5 fill-current shrink-0" style={{ color: BRAND.green }} />
              <span style={{ color: BRAND.greenDark }}>
                Best value at count {bestValueCount} —{" "}
                <strong>RM {perUnit(getTierPrice(bestValueCount), bestValueCount)}</strong> per unit
              </span>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Save button                                                          */}
      {/* ------------------------------------------------------------------ */}
      <Button
        type="button"
        onClick={handleSave}
        disabled={saving || noTextNumberFields}
        className="gap-2 min-h-[44px]"
        style={{ backgroundColor: BRAND.green, color: "white" }}
      >
        <Save className="h-4 w-4" />
        {saving ? "Saving…" : "Save tier pricing"}
      </Button>
    </div>
  );
}
