/**
 * Phase 14 — Cost breakdown computation helper.
 *
 * Computes a structured cost breakdown from per-variant inputs and store-level
 * rate defaults. All inputs accept string | number | null | undefined to match
 * the raw Drizzle DECIMAL return type (mysql2 returns strings for DECIMAL cols).
 *
 * Used in:
 *   - product-form.tsx  — live client-side preview (pass store rates as props)
 *   - products.ts action — server-side cost_price persistence on save
 */

export type StoreCostDefaults = {
  filamentCostPerKg?: string | number | null;       // MYR / kg
  electricityCostPerKwh?: string | number | null;   // MYR / kWh
  electricityKwhPerHour?: string | number | null;   // kWh / hr (printer power)
  laborRatePerHour?: string | number | null;        // MYR / hr
  overheadPercent?: string | number | null;         // % added to subtotal
};

export type VariantCostInputs = {
  costPriceManual?: boolean;
  costPrice?: string | number | null;         // authoritative when costPriceManual=true
  filamentGrams?: string | number | null;
  printTimeHours?: string | number | null;
  laborMinutes?: string | number | null;
  otherCost?: string | number | null;
  filamentRateOverride?: string | number | null;    // overrides store default
  laborRateOverride?: string | number | null;       // overrides store default
};

export type CostBreakdown = {
  filamentCost: number;
  electricityCost: number;
  laborCost: number;
  otherCost: number;
  overheadCost: number;
  total: number;
  isManual: boolean;
};

function n(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const f = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(f) ? f : 0;
}

/**
 * Compute the cost breakdown for a single variant.
 *
 * When `costPriceManual` is true, returns a breakdown where only `total` is
 * meaningful (= the admin-entered cost_price). The component fields are all 0
 * because the manual total is authoritative — no breakdown is available.
 *
 * When `costPriceManual` is false (default), each component is computed from
 * the variant's quantity inputs and the store (or per-variant-override) rates.
 * `total` = subtotal + overhead, rounded to 2 decimal places.
 *
 * Default printer power: 0.15 kWh/hr (150W) — typical FDM printer. Used when
 * neither the store nor the variant supplies electricityKwhPerHour.
 */
export function computeVariantCost(
  variant: VariantCostInputs,
  storeRates: StoreCostDefaults,
): CostBreakdown {
  // Manual override path — breakdown unavailable.
  if (variant.costPriceManual) {
    return {
      filamentCost: 0,
      electricityCost: 0,
      laborCost: 0,
      otherCost: 0,
      overheadCost: 0,
      total: round2(n(variant.costPrice)),
      isManual: true,
    };
  }

  // Filament: (grams / 1000) × rate_per_kg
  const filamentRate = n(variant.filamentRateOverride) || n(storeRates.filamentCostPerKg);
  const filamentCost = (n(variant.filamentGrams) / 1000) * filamentRate;

  // Electricity: print_hours × kWh_per_hour × cost_per_kWh
  const kwhPerHour =
    n(storeRates.electricityKwhPerHour) > 0
      ? n(storeRates.electricityKwhPerHour)
      : 0.15; // 150W default
  const electricityCost =
    n(variant.printTimeHours) * kwhPerHour * n(storeRates.electricityCostPerKwh);

  // Labor: (minutes / 60) × rate_per_hour
  const laborRate = n(variant.laborRateOverride) || n(storeRates.laborRatePerHour);
  const laborCost = (n(variant.laborMinutes) / 60) * laborRate;

  // Other (packaging, misc)
  const otherCost = n(variant.otherCost);

  const subtotal = filamentCost + electricityCost + laborCost + otherCost;
  const overheadCost = subtotal * (n(storeRates.overheadPercent) / 100);
  const total = subtotal + overheadCost;

  return {
    filamentCost: round2(filamentCost),
    electricityCost: round2(electricityCost),
    laborCost: round2(laborCost),
    otherCost: round2(otherCost),
    overheadCost: round2(overheadCost),
    total: round2(total),
    isManual: false,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
