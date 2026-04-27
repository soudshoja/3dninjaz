"use client";

/**
 * Phase 19-05 — Tier table editor component.
 *
 * Admin sets maxUnitCount + one MYR price per integer 1..maxUnitCount + unitField
 * (which text/number config field's value-length drives the tier lookup).
 *
 * Auto-fill: generates linear tiers from base + step.
 * Reduce-max: prompts before truncating excess tiers.
 * Pattern B: calls onSaved() after successful saveTierTable.
 */

import { useState, useTransition } from "react";
import { AlertCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveTierTable } from "@/actions/configurator";
import { BRAND } from "@/lib/brand";

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
  onSaved: () => Promise<void> | void; // Pattern B refetch
};

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

  // Auto-fill state
  const [autoBase, setAutoBase] = useState<string>("7");
  const [autoStep, setAutoStep] = useState<string>("2");

  const [, startTransition] = useTransition();

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

    // Build next tiers map
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
    const base = parseFloat(autoBase);
    const step = parseFloat(autoStep);
    if (!Number.isFinite(base) || !Number.isFinite(step)) return;

    const next: Record<string, number> = {};
    for (let i = 1; i <= maxUnit; i++) {
      next[String(i)] = Math.round((base + step * (i - 1)) * 100) / 100;
    }
    setTiers(next);
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
      await onSaved();
    });
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const noTextNumberFields = fieldOptions.length === 0;

  return (
    <div className="space-y-5">
      {/* Error / success banners */}
      {error && (
        <div
          role="alert"
          className="flex gap-2 items-start rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div
          role="status"
          className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800"
        >
          {successMsg}
        </div>
      )}

      {/* Unit field select */}
      <div className="space-y-1">
        <Label htmlFor="unitField">Unit field</Label>
        {noTextNumberFields ? (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-md border border-amber-200 px-3 py-2">
            Add a Text or Number field first. The tier lookup uses that field&apos;s value length.
          </p>
        ) : (
          <>
            <select
              id="unitField"
              value={unitField}
              onChange={(e) => setUnitField(e.target.value)}
              className="h-10 w-full rounded-lg border px-3 text-sm bg-white"
              style={{ borderColor: "#E4E4E7" }}
            >
              <option value="">— Select a field —</option>
              {fieldOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label} ({f.fieldType})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Tier {"{n}"} = price when the customer&apos;s input reaches n characters/units.
            </p>
          </>
        )}
      </div>

      {/* Max unit count */}
      <div className="space-y-1">
        <Label htmlFor="maxUnit">Max unit count</Label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleMaxChange(maxUnit - 1)}
            disabled={maxUnit <= 1}
            className="flex h-10 w-10 items-center justify-center rounded-lg border text-lg font-bold hover:bg-slate-50 disabled:opacity-40 min-h-[44px]"
            style={{ borderColor: "#E4E4E7" }}
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
            className="h-10 w-20 text-center"
          />
          <button
            type="button"
            onClick={() => handleMaxChange(maxUnit + 1)}
            disabled={maxUnit >= 200}
            className="flex h-10 w-10 items-center justify-center rounded-lg border text-lg font-bold hover:bg-slate-50 disabled:opacity-40 min-h-[44px]"
            style={{ borderColor: "#E4E4E7" }}
          >
            +
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Range: 1–200</p>
      </div>

      {/* Auto-fill row */}
      <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "#E4E4E7" }}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Auto-fill
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="autoBase" className="text-xs whitespace-nowrap">Base (MYR)</Label>
            <Input
              id="autoBase"
              type="number"
              min={0}
              step={0.01}
              value={autoBase}
              onChange={(e) => setAutoBase(e.target.value)}
              className="h-8 w-20"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Label htmlFor="autoStep" className="text-xs whitespace-nowrap">Step (MYR)</Label>
            <Input
              id="autoStep"
              type="number"
              step={0.01}
              value={autoStep}
              onChange={(e) => setAutoStep(e.target.value)}
              className="h-8 w-20"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleAutoFill}
            className="h-8 text-xs"
          >
            Auto-fill
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Tier n = base + step × (n − 1). You can edit individual values after.
        </p>
      </div>

      {/* Tier table */}
      {maxUnit > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b" style={{ borderColor: "#E4E4E7" }}>
                <th className="py-2 px-3 text-left font-medium text-muted-foreground w-16">
                  Count
                </th>
                <th className="py-2 px-3 text-left font-medium text-muted-foreground">
                  Price (MYR)
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxUnit }, (_, i) => i + 1).map((n) => (
                <tr
                  key={n}
                  className="border-b last:border-0"
                  style={{ borderColor: "#F4F4F5" }}
                >
                  <td className="py-1.5 px-3 font-mono text-muted-foreground">{n}</td>
                  <td className="py-1.5 px-3">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={getTierPrice(n)}
                      onChange={(e) => setTierPrice(n, parseFloat(e.target.value) || 0)}
                      className="h-8 w-28"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Save button */}
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
