import { describe, it, expect } from "vitest";
import {
  isDeliveredStatusCode,
  isCancelledStatusCode,
  shouldNotifyDelivered,
} from "./delyva-delivery-status";

describe("isDeliveredStatusCode", () => {
  it("700 (delivered) → true", () => {
    expect(isDeliveredStatusCode(700)).toBe(true);
  });

  it("900 (cancelled) → false, even though numerically >= 700", () => {
    expect(isDeliveredStatusCode(900)).toBe(false);
  });

  it("699 (below the delivered threshold) → false", () => {
    expect(isDeliveredStatusCode(699)).toBe(false);
  });

  it("110 (label printed) → false", () => {
    expect(isDeliveredStatusCode(110)).toBe(false);
  });

  it("a code above 700 that isn't 900 → true", () => {
    expect(isDeliveredStatusCode(701)).toBe(true);
    expect(isDeliveredStatusCode(1000)).toBe(true);
  });

  it("null/undefined/non-number → false", () => {
    expect(isDeliveredStatusCode(null)).toBe(false);
    expect(isDeliveredStatusCode(undefined)).toBe(false);
    expect(isDeliveredStatusCode(Number.NaN)).toBe(false);
  });
});

describe("isCancelledStatusCode", () => {
  it("900 → true", () => {
    expect(isCancelledStatusCode(900)).toBe(true);
  });

  it("700 → false", () => {
    expect(isCancelledStatusCode(700)).toBe(false);
  });

  it("null/undefined → false", () => {
    expect(isCancelledStatusCode(null)).toBe(false);
    expect(isCancelledStatusCode(undefined)).toBe(false);
  });
});

describe("shouldNotifyDelivered", () => {
  it("statusCode 700 + already delivered order → false (idempotent no-op)", () => {
    expect(
      shouldNotifyDelivered({ statusCode: 700, currentOrderStatus: "delivered" }),
    ).toBe(false);
  });

  it("statusCode 700 + shipped order → true (first delivered event)", () => {
    expect(
      shouldNotifyDelivered({ statusCode: 700, currentOrderStatus: "shipped" }),
    ).toBe(true);
  });

  it("statusCode 900 (cancelled) + any order status → false", () => {
    expect(
      shouldNotifyDelivered({ statusCode: 900, currentOrderStatus: "shipped" }),
    ).toBe(false);
    expect(
      shouldNotifyDelivered({ statusCode: 900, currentOrderStatus: "pending" }),
    ).toBe(false);
  });

  it("statusCode 699 (in transit) + any order status → false", () => {
    expect(
      shouldNotifyDelivered({ statusCode: 699, currentOrderStatus: "shipped" }),
    ).toBe(false);
  });

  it("statusCode 110 (label printed) → false", () => {
    expect(
      shouldNotifyDelivered({ statusCode: 110, currentOrderStatus: "processing" }),
    ).toBe(false);
  });
});
