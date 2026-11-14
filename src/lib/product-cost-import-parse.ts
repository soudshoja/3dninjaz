// Pure parsing + validation for the product cost import (xlsx / csv). No DB and
// no server imports, so it is unit-testable and the dry run and the commit share
// exactly the same rules.
//
// Template (owner's file 3DNinjaz_Product_Cost_Template.xlsx): header on row 4,
// data from row 5. Columns: A Product ID, B name, C type, D category,
// E sell price, F other price tiers, G Cost (RM), H Cost per extra keycap
// (keychains only), I margin, J margin %, K active, L notes. A blank cost means
// "skip this product".

import { computeMargin, round2 } from "@/lib/product-cost-math";
import type { CostImportIssue, CostImportRow } from "@/lib/product-cost-types";

export const COL = {
  id: 0,
  name: 1,
  type: 2,
  category: 3,
  price: 4,
  tiers: 5,
  cost: 6,
  extra: 7,
} as const;

/** What the import needs to know about a product that already exists. */
export type ProductSnapshot = {
  id: string;
  name: string;
  productType: string;
  price: number | null;
  cost: number | null;
  costPerExtra: number | null;
};

export type RawCostRow = {
  rowNumber: number;
  productId: string;
  sheetName: string;
  sheetPrice: number | null;
  costCell: unknown;
  extraCell: unknown;
};

export type CellMoney =
  | { kind: "blank" }
  | { kind: "ok"; value: number }
  | { kind: "error"; message: string };

/** Parse one cost cell strictly: blank / number / "RM 3.50"; negatives are errors. */
export function parseCostCell(raw: unknown): CellMoney {
  if (raw === null || raw === undefined) return { kind: "blank" };
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { kind: "error", message: "Not a number" };
    if (raw < 0) return { kind: "error", message: "Cost cannot be negative" };
    if (raw > 99_999_999.99) return { kind: "error", message: "Cost is too large" };
    return { kind: "ok", value: round2(raw) };
  }
  if (typeof raw === "string") {
    const cleaned = raw.replace(/rm/gi, "").replace(/[,\s]/g, "");
    if (cleaned === "") return { kind: "blank" };
    if (/^-/.test(cleaned) && /^-\d+(\.\d+)?$/.test(cleaned)) {
      return { kind: "error", message: "Cost cannot be negative" };
    }
    if (!/^\d+(\.\d+)?$/.test(cleaned)) {
      return { kind: "error", message: `"${raw.trim().slice(0, 30)}" is not a number` };
    }
    const n = Number(cleaned);
    if (n > 99_999_999.99) return { kind: "error", message: "Cost is too large" };
    return { kind: "ok", value: round2(n) };
  }
  return { kind: "error", message: "Not a number" };
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function cellNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/rm/gi, "").replace(/[,\s]/g, ""));
    return v.trim() !== "" && Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Turn a spreadsheet grid (array of rows, each an array of cell primitives,
 * index 0 = first row) into raw rows. Finds the header row by looking for a
 * first cell that starts with "product id" in the first 12 rows, falling back
 * to row 4 (the template). Rows with no id and no cost are ignored.
 */
export function extractCostRows(grid: unknown[][]): RawCostRow[] {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 12); i++) {
    if (/^product\s*id/i.test(cellText(grid[i]?.[COL.id]))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) headerIdx = 3; // row 4 in the template

  const out: RawCostRow[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i] ?? [];
    const id = cellText(r[COL.id]);
    const costCell = r[COL.cost];
    const extraCell = r[COL.extra];
    const nothing =
      id === "" &&
      cellText(costCell) === "" &&
      cellText(extraCell) === "" &&
      cellText(r[COL.name]) === "";
    if (nothing) continue;
    out.push({
      rowNumber: i + 1,
      productId: id,
      sheetName: cellText(r[COL.name]),
      sheetPrice: cellNumber(r[COL.price]),
      costCell,
      extraCell,
    });
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Validate raw rows against the current products. Pure: the caller supplies the
 * snapshot map. Errors block a row; warnings do not.
 */
export function validateCostRows(
  raw: RawCostRow[],
  products: Map<string, ProductSnapshot>,
): CostImportRow[] {
  const seen = new Map<string, number>();
  for (const r of raw) {
    if (r.productId) seen.set(r.productId, (seen.get(r.productId) ?? 0) + 1);
  }

  return raw.map((r): CostImportRow => {
    const issues: CostImportIssue[] = [];
    const snap = r.productId ? products.get(r.productId) : undefined;
    const costParsed = parseCostCell(r.costCell);
    const extraParsed = parseCostCell(r.extraCell);

    if (!r.productId) {
      issues.push({ level: "error", message: "Missing product ID" });
    } else if (!snap) {
      issues.push({ level: "error", message: "Unknown product ID (not in the store)" });
    }
    if (r.productId && (seen.get(r.productId) ?? 0) > 1) {
      issues.push({
        level: "error",
        message: "Product ID appears more than once in the file. Keep one row per product.",
      });
    }
    if (costParsed.kind === "error") {
      issues.push({ level: "error", message: `Cost: ${costParsed.message}` });
    }
    if (extraParsed.kind === "error") {
      issues.push({ level: "error", message: `Cost per extra keycap: ${extraParsed.message}` });
    }

    const newCost = costParsed.kind === "ok" ? costParsed.value : null;
    let newExtra = extraParsed.kind === "ok" ? extraParsed.value : null;

    if (snap) {
      if (r.sheetName && norm(r.sheetName) !== norm(snap.name)) {
        issues.push({
          level: "warning",
          message: `Name differs from the store ("${snap.name}")`,
        });
      }
      if (
        r.sheetPrice !== null &&
        snap.price !== null &&
        Math.abs(r.sheetPrice - snap.price) > 0.005
      ) {
        issues.push({
          level: "warning",
          message: `Sell price differs from the store (RM ${snap.price.toFixed(2)})`,
        });
      }
      const isKeychain = snap.productType === "keychain";
      if (!isKeychain && newExtra !== null) {
        issues.push({
          level: "warning",
          message: "Cost per extra keycap is only used for keychains, so it was ignored",
        });
        newExtra = null;
      }
      const effectiveCost = newCost ?? snap.cost;
      if (effectiveCost !== null && snap.price !== null && effectiveCost >= snap.price) {
        issues.push({
          level: "warning",
          message: "Cost is at or above the sell price",
        });
      }
      if (isKeychain && newCost !== null && newExtra === null && snap.costPerExtra === null) {
        issues.push({
          level: "warning",
          message: "Keychain has no cost per extra keycap, so every size is costed as 1 keycap",
        });
      }
    }

    const hasError = issues.some((i) => i.level === "error");
    let action: CostImportRow["action"];
    if (hasError) action = "error";
    else if (newCost === null && newExtra === null) action = "skip";
    else if (
      snap &&
      (newCost === null || newCost === snap.cost) &&
      (newExtra === null || newExtra === snap.costPerExtra)
    ) {
      action = "unchanged";
    } else action = "update";

    const shownCost = newCost ?? snap?.cost ?? null;
    return {
      rowNumber: r.rowNumber,
      productId: r.productId,
      sheetName: r.sheetName,
      sheetPrice: r.sheetPrice,
      newCost,
      newCostPerExtra: newExtra,
      productName: snap?.name ?? null,
      productType: snap?.productType ?? null,
      currentPrice: snap?.price ?? null,
      oldCost: snap?.cost ?? null,
      oldCostPerExtra: snap?.costPerExtra ?? null,
      action,
      newMarginPct: snap ? (computeMargin(snap.price, shownCost)?.pct ?? null) : null,
      issues,
    };
  });
}

/** Counts for the summary strip. */
export function summariseRows(rows: CostImportRow[]) {
  const counts = { total: rows.length, update: 0, unchanged: 0, skip: 0, error: 0, warnings: 0 };
  for (const r of rows) {
    counts[r.action] += 1;
    counts.warnings += r.issues.filter((i) => i.level === "warning").length;
  }
  return counts;
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV of old and new values, for the downloadable dry-run / commit report. */
export function buildCostReportCsv(
  rows: Array<{
    productId: string;
    name: string;
    oldCost: number | null;
    oldCostPerExtra: number | null;
    newCost: number | null;
    newCostPerExtra: number | null;
    note?: string;
  }>,
): string {
  const head = [
    "Product ID",
    "Product name",
    "Old cost (RM)",
    "Old cost per extra keycap (RM)",
    "New cost (RM)",
    "New cost per extra keycap (RM)",
    "Note",
  ];
  const lines = [head.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.productId,
        r.name,
        r.oldCost?.toFixed(2) ?? "",
        r.oldCostPerExtra?.toFixed(2) ?? "",
        r.newCost?.toFixed(2) ?? "",
        r.newCostPerExtra?.toFixed(2) ?? "",
        r.note ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\r\n");
}
