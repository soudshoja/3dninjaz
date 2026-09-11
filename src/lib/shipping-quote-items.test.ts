/**
 * Quick task 260911-oln — regression guard for the snapshot -> quote-item
 * mapper. Run: npx vitest run src/lib/shipping-quote-items.test.ts
 */

import { describe, it, expect } from "vitest";
import { snapshotsToQuoteItems, type SnapshotLineForQuote } from "./shipping-quote-items";

describe("snapshotsToQuoteItems", () => {
  it("maps a variant line straight through", () => {
    const snaps: SnapshotLineForQuote[] = [
      {
        productId: "p1",
        variantId: "v1",
        quantity: 2,
        unitPrice: "19.90",
        configurationData: null,
      },
    ];
    expect(snapshotsToQuoteItems(snaps)).toEqual([
      {
        productId: "p1",
        variantId: "v1",
        quantity: 2,
        unitPrice: 19.9,
        configValues: undefined,
      },
    ]);
  });

  it("maps a configurable line (NONE sentinel) with configValues by value — D1+D2 guard", () => {
    const values = { colour: "red", size: "M" };
    const snaps: SnapshotLineForQuote[] = [
      {
        productId: "p2",
        variantId: "NONE",
        quantity: 1,
        unitPrice: "45.00",
        configurationData: { values },
      },
    ];
    const result = snapshotsToQuoteItems(snaps);
    expect(result).toEqual([
      {
        productId: "p2",
        variantId: null,
        quantity: 1,
        unitPrice: 45,
        configValues: values,
      },
    ]);
    expect(result[0].configValues).toBe(values);
  });

  it("normalizes 'manual' and '' variantId sentinels to null", () => {
    const snaps: SnapshotLineForQuote[] = [
      {
        productId: "manual",
        variantId: "manual",
        quantity: 1,
        unitPrice: 10,
        configurationData: null,
      },
      {
        productId: "p3",
        variantId: "",
        quantity: 1,
        unitPrice: 10,
        configurationData: null,
      },
    ];
    const result = snapshotsToQuoteItems(snaps);
    expect(result[0].variantId).toBeNull();
    expect(result[1].variantId).toBeNull();
  });

  it("maps an empty configurationData.values object to configValues: undefined", () => {
    const snaps: SnapshotLineForQuote[] = [
      {
        productId: "p4",
        variantId: "NONE",
        quantity: 1,
        unitPrice: 10,
        configurationData: { values: {} },
      },
    ];
    expect(snapshotsToQuoteItems(snaps)[0].configValues).toBeUndefined();
  });

  it("converts a decimal-string unitPrice to a finite number", () => {
    const snaps: SnapshotLineForQuote[] = [
      {
        productId: "p5",
        variantId: "v5",
        quantity: 1,
        unitPrice: "123.45",
        configurationData: null,
      },
    ];
    expect(snapshotsToQuoteItems(snaps)[0].unitPrice).toBe(123.45);
  });

  it("clamps quantity 0 or NaN to 1", () => {
    const snaps: SnapshotLineForQuote[] = [
      {
        productId: "p6",
        variantId: "v6",
        quantity: 0,
        unitPrice: 10,
        configurationData: null,
      },
      {
        productId: "p7",
        variantId: "v7",
        quantity: Number.NaN,
        unitPrice: 10,
        configurationData: null,
      },
    ];
    const result = snapshotsToQuoteItems(snaps);
    expect(result[0].quantity).toBe(1);
    expect(result[1].quantity).toBe(1);
  });
});
