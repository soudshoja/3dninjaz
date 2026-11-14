import { describe, it, expect } from "vitest";
import {
  buildCostReportCsv,
  extractCostRows,
  parseCostCell,
  summariseRows,
  validateCostRows,
  type ProductSnapshot,
} from "./product-cost-import-parse";

const snap = (over: Partial<ProductSnapshot> & { id: string }): ProductSnapshot => ({
  name: "Thing",
  productType: "simple",
  price: 10,
  cost: null,
  costPerExtra: null,
  ...over,
});

// Template layout: 3 note rows, header on row 4, data from row 5.
function grid(...dataRows: unknown[][]): unknown[][] {
  return [
    ["title"],
    ["note"],
    ["note"],
    ["Product ID (do not edit)", "Product name", "Type", "Category", "Sell price (RM)", "Tiers", "Cost (RM)", "Extra"],
    ...dataRows,
  ];
}

describe("parseCostCell", () => {
  it("handles blank, numbers, RM strings, negatives and junk", () => {
    expect(parseCostCell(null)).toEqual({ kind: "blank" });
    expect(parseCostCell("")).toEqual({ kind: "blank" });
    expect(parseCostCell(3.456)).toEqual({ kind: "ok", value: 3.46 });
    expect(parseCostCell("RM 4.20")).toEqual({ kind: "ok", value: 4.2 });
    expect(parseCostCell(-1).kind).toBe("error");
    expect(parseCostCell("-2.50").kind).toBe("error");
    expect(parseCostCell("abc").kind).toBe("error");
  });
});

describe("extractCostRows", () => {
  it("starts after the header row and keeps 1-based row numbers", () => {
    const rows = extractCostRows(grid(["a", "Name A", "simple", "", 10, "", 3, ""]));
    expect(rows).toHaveLength(1);
    expect(rows[0].rowNumber).toBe(5);
    expect(rows[0].productId).toBe("a");
    expect(rows[0].costCell).toBe(3);
  });
  it("ignores fully blank rows", () => {
    expect(extractCostRows(grid([], ["", "", "", "", "", "", "", ""]))).toHaveLength(0);
  });
});

describe("validateCostRows", () => {
  const products = new Map<string, ProductSnapshot>([
    ["a", snap({ id: "a", name: "Alpha", price: 10, cost: 2 })],
    ["k", snap({ id: "k", name: "Keychain", productType: "keychain", price: 7 })],
  ]);

  const run = (...rows: unknown[][]) => validateCostRows(extractCostRows(grid(...rows)), products);

  it("blank cost is a skip, not an error", () => {
    const [r] = run(["a", "Alpha", "simple", "", 10, "", "", ""]);
    expect(r.action).toBe("skip");
  });

  it("updates a changed cost and reports old and new", () => {
    const [r] = run(["a", "Alpha", "simple", "", 10, "", 4, ""]);
    expect(r.action).toBe("update");
    expect(r.oldCost).toBe(2);
    expect(r.newCost).toBe(4);
    expect(r.newMarginPct).toBe(60);
  });

  it("is idempotent: the same cost again is 'unchanged'", () => {
    const [r] = run(["a", "Alpha", "simple", "", 10, "", 2, ""]);
    expect(r.action).toBe("unchanged");
  });

  it("errors on unknown id, duplicate id, non-numeric and negative", () => {
    const rows = run(
      ["zzz", "Nope", "simple", "", 10, "", 1, ""],
      ["a", "Alpha", "simple", "", 10, "", 1, ""],
      ["a", "Alpha", "simple", "", 10, "", 2, ""],
      ["k", "Keychain", "keychain", "", 7, "", "abc", ""],
      ["k", "Keychain", "keychain", "", 7, "", -3, ""],
    );
    expect(rows[0].action).toBe("error");
    expect(rows[1].action).toBe("error"); // duplicate
    expect(rows[2].action).toBe("error"); // duplicate
    expect(rows[3].action).toBe("error");
    expect(rows[4].action).toBe("error");
  });

  it("warns on name/price mismatch and cost >= price", () => {
    const [r] = run(["a", "Different name", "simple", "", 12, "", 10, ""]);
    const msgs = r.issues.map((i) => i.message).join(" | ");
    expect(r.action).toBe("update");
    expect(msgs).toMatch(/Name differs/);
    expect(msgs).toMatch(/Sell price differs/);
    expect(msgs).toMatch(/at or above/);
    expect(r.issues.every((i) => i.level === "warning")).toBe(true);
  });

  it("warns for a keychain without a cost per extra keycap, and ignores extra on others", () => {
    const [k, a] = run(
      ["k", "Keychain", "keychain", "", 7, "", 3, ""],
      ["a", "Alpha", "simple", "", 10, "", 3, 1],
    );
    expect(k.issues.map((i) => i.message).join()).toMatch(/no cost per extra keycap/i);
    expect(a.newCostPerExtra).toBeNull();
    expect(a.issues.map((i) => i.message).join()).toMatch(/only used for keychains/);
  });

  it("summarises counts", () => {
    const rows = run(
      ["a", "Alpha", "simple", "", 10, "", 4, ""],
      ["k", "Keychain", "keychain", "", 7, "", "", ""],
      ["zzz", "Nope", "simple", "", 10, "", 1, ""],
    );
    const c = summariseRows(rows);
    expect(c).toMatchObject({ total: 3, update: 1, skip: 1, error: 1 });
  });
});

describe("buildCostReportCsv", () => {
  it("writes old and new values and escapes commas", () => {
    const csv = buildCostReportCsv([
      {
        productId: "a",
        name: "Alpha, the first",
        oldCost: 2,
        oldCostPerExtra: null,
        newCost: 4,
        newCostPerExtra: null,
      },
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("Old cost (RM)");
    expect(lines[1]).toBe('a,"Alpha, the first",2.00,,4.00,,');
  });
});
