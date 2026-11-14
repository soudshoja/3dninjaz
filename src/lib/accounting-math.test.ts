import { describe, it, expect } from "vitest";
import {
  computeNetProfitCash,
  computeGrossMargin,
  computeNetPosition,
  costCoverage,
  hasEnoughCostData,
  shippingKept,
  productSalesOf,
} from "./accounting-math";

describe("net position (plan figures)", () => {
  it("-1253.96 profit, 7450.58 asset payments, 2000 capital in => -6704.54", () => {
    const p = computeNetPosition({
      netProfitCash: -1253.96,
      assetPaymentsMade: 7450.58,
      capitalIn: 2000,
      capitalOut: 0,
      instalmentsOwed: 3482.38,
    });
    expect(p.now).toBe(-6704.54);
    expect(p.afterInstalments).toBe(-10186.92);
  });

  it("capital out reduces the position", () => {
    const p = computeNetPosition({
      netProfitCash: 100,
      assetPaymentsMade: 0,
      capitalIn: 0,
      capitalOut: 40,
      instalmentsOwed: 0,
    });
    expect(p.now).toBe(60);
  });
});

describe("net profit (cash) and gross margin never mix", () => {
  it("view A ignores product cost", () => {
    expect(
      computeNetProfitCash({ productSales: 1000, incomeEntries: 200, paypalFees: 50, expenses: 300 }),
    ).toBe(850);
  });
  it("view B ignores expenses", () => {
    expect(
      computeGrossMargin({ productSales: 1000, productCost: 400, extraCost: 20, paypalFees: 50 }),
    ).toBe(530);
  });
  it("handles float drift", () => {
    expect(computeNetProfitCash({ productSales: 0.1, incomeEntries: 0.2, paypalFees: 0, expenses: 0 })).toBe(0.3);
  });
});

describe("cost coverage guard", () => {
  it("hides the margin below 90%", () => {
    expect(hasEnoughCostData(costCoverage(8, 10, true))).toBe(false);
    expect(hasEnoughCostData(costCoverage(9, 10, true))).toBe(true);
  });
  it("no lines: nothing to cover only when there are no sales", () => {
    expect(costCoverage(0, 0, false)).toBe(1);
    expect(costCoverage(0, 0, true)).toBe(0);
  });
});

describe("shipping kept and product sales", () => {
  it("normal paid order: sales exclude shipping", () => {
    const o = { amountPaid: 50, refunded: 0, shipping: 8 };
    expect(productSalesOf(o)).toBe(42);
    expect(shippingKept(o)).toBe(8);
  });
  it("full refund gives 0 sales, not -shipping", () => {
    const o = { amountPaid: 50, refunded: 50, shipping: 8 };
    expect(productSalesOf(o)).toBe(0);
    expect(shippingKept(o)).toBe(0);
  });
  it("partial refund within product value keeps full shipping", () => {
    const o = { amountPaid: 50, refunded: 20, shipping: 8 };
    expect(productSalesOf(o)).toBe(22);
    expect(shippingKept(o)).toBe(8);
  });
  it("partial refund eating into shipping clamps it", () => {
    const o = { amountPaid: 50, refunded: 46, shipping: 8 };
    expect(shippingKept(o)).toBe(4);
    expect(productSalesOf(o)).toBe(0);
  });
  it("deposit-only order: shipping capped at what was paid", () => {
    const o = { amountPaid: 5, refunded: 0, shipping: 8 };
    expect(shippingKept(o)).toBe(5);
    expect(productSalesOf(o)).toBe(0);
  });
  it("receipts always equal sales plus shipping kept", () => {
    for (const o of [
      { amountPaid: 50, refunded: 0, shipping: 8 },
      { amountPaid: 50, refunded: 50, shipping: 8 },
      { amountPaid: 5, refunded: 0, shipping: 8 },
    ]) {
      expect(productSalesOf(o) + shippingKept(o)).toBe(o.amountPaid - o.refunded);
    }
  });
});
