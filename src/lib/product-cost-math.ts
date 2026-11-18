// Pure product-cost helpers shared by the resolver (server), the admin product
// form / list / mobile capture UI (client) and tests. No server imports here.
//
// Owner decision (Accounting v2): ONE flat manual cost per product. Keychains
// (productType 'keychain') cost = costPrice + (keycaps - 1) * costPerExtraUnit.

import { ensureKeycapSequence } from "@/lib/config-fields";

export const COST_MAX = 99_999_999.99;

/** Round to 2dp (money). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Parse a user-typed money value. Accepts "12", "12.5", "RM 12.50", "1,234.50".
 * Returns null for empty / non-numeric / negative / non-finite input.
 */
export function parseMoney(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 && raw <= COST_MAX ? round2(raw) : null;
  }
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/rm/gi, "").replace(/[,\s]/g, "");
  if (cleaned === "" || !/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n > COST_MAX) return null;
  return round2(n);
}

/** Decimal string for a DECIMAL(10,2) column, or null. */
export function toCostString(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return round2(n).toFixed(2);
}

/** Drizzle decimal string | null -> number | null. */
export function costToNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Cost of one unit of a product given the flat cost fields.
 * `unitCount` is only meaningful for keychains.
 */
export function unitCostFromFields(args: {
  productType: string | null | undefined;
  costPrice: number | null;
  costPerExtraUnit: number | null;
  unitCount?: number | null;
}): number | null {
  if (args.costPrice === null) return null;
  const count = args.unitCount && args.unitCount > 0 ? Math.floor(args.unitCount) : 1;
  if (
    args.productType === "keychain" &&
    args.costPerExtraUnit !== null &&
    count > 1
  ) {
    return round2(args.costPrice + (count - 1) * args.costPerExtraUnit);
  }
  return round2(args.costPrice);
}

function isBracketedJson(v: string): boolean {
  const t = v.trim();
  return t.startsWith("[") && t.endsWith("]");
}

/**
 * Number of units (keycaps / characters) in a configurable line, derived from
 * the unit field value the same way pricing and shipping weight do:
 * keycapseq -> slot count, text/number -> character length.
 * Returns null when the product has no unit field or the value is empty.
 */
export function deriveUnitCount(
  unitFieldId: string | null | undefined,
  values: Record<string, string> | null | undefined,
): number | null {
  if (!unitFieldId || !values) return null;
  const v = values[unitFieldId];
  if (typeof v !== "string" || v.length === 0) return null;
  const count = isBracketedJson(v) ? ensureKeycapSequence(v).length : v.length;
  return count > 0 ? count : null;
}

export type Margin = { amount: number; pct: number | null };

/** Margin of a sell price over a cost. pct is null when price is 0. */
export function computeMargin(price: number | null, cost: number | null): Margin | null {
  if (price === null || cost === null) return null;
  const amount = round2(price - cost);
  const pct = price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : null;
  return { amount, pct };
}

export function formatRm(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPct(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return "-";
  return `${p.toFixed(1)}%`;
}

/**
 * Representative sell price for a product row: stocked -> lowest variant price,
 * everything else -> price of the lowest tier key. Used for list margins.
 */
export function representativePrice(args: {
  productType: string | null | undefined;
  variantPrices: Array<string | number>;
  priceTiers: Record<string, number> | null | undefined;
}): number | null {
  const type = args.productType ?? "stocked";
  if (type === "stocked") {
    const nums = args.variantPrices
      .map((p) => Number(p))
      .filter((n) => Number.isFinite(n));
    return nums.length > 0 ? Math.min(...nums) : null;
  }
  const tiers = args.priceTiers ?? {};
  const keys = Object.keys(tiers)
    .map((k) => Number(k))
    .filter((k) => Number.isFinite(k))
    .sort((a, b) => a - b);
  if (keys.length === 0) return null;
  const v = tiers[String(keys[0])];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export type TierPreviewRow = {
  count: number;
  price: number;
  cost: number | null;
  margin: Margin | null;
};

/** Per-tier (keycap count) price / cost / margin for the keychain preview. */
export function tierPreview(
  priceTiers: Record<string, number>,
  costPrice: number | null,
  costPerExtraUnit: number | null,
): TierPreviewRow[] {
  return Object.keys(priceTiers)
    .map((k) => Number(k))
    .filter((k) => Number.isInteger(k) && k > 0)
    .sort((a, b) => a - b)
    .map((count) => {
      const price = Number(priceTiers[String(count)]);
      const cost = unitCostFromFields({
        productType: "keychain",
        costPrice,
        costPerExtraUnit,
        unitCount: count,
      });
      return { count, price, cost, margin: computeMargin(price, cost) };
    });
}

// ---------------------------------------------------------------------------
// Bulk edit modes
// ---------------------------------------------------------------------------

export type BulkMode =
  | { kind: "set"; amount: number }
  | { kind: "percent_of_price"; percent: number }
  | { kind: "adjust_rm"; delta: number }
  | { kind: "adjust_percent"; percent: number };

/**
 * New cost for one product under a bulk mode. `price` is the representative
 * sell price, `current` the existing cost. Returns null when the mode cannot
 * produce a value for this row (percent-of-price with no price, or raising or
 * lowering a product that has no cost yet). Result is clamped to >= 0.
 */
export function applyBulkMode(
  mode: BulkMode,
  price: number | null,
  current: number | null,
): number | null {
  let next: number | null = null;
  switch (mode.kind) {
    case "set":
      next = mode.amount;
      break;
    case "percent_of_price":
      next = price === null ? null : (price * mode.percent) / 100;
      break;
    case "adjust_rm":
      next = current === null ? null : current + mode.delta;
      break;
    case "adjust_percent":
      next = current === null ? null : current * (1 + mode.percent / 100);
      break;
  }
  if (next === null || !Number.isFinite(next)) return null;
  return round2(Math.min(COST_MAX, Math.max(0, next)));
}

/** Key of one Select option (a product's variant): stable, safe for React keys and selection sets. */
export function optionKey(productId: string, fieldId: string, value: string): string {
  return `${productId}::${fieldId}::${value}`;
}

/**
 * The value of the template's "Option key" column: field id and option value
 * joined by "|" (a field id is a UUID, so the FIRST "|" always separates them).
 */
export function optionSheetKey(fieldId: string, value: string): string {
  return `${fieldId}|${value}`;
}
