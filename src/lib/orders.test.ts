import { describe, it, expect } from "vitest";
import { shouldNotifyShipped, assertValidTransition } from "./orders";

describe("shouldNotifyShipped", () => {
  it("notifies on a manual processing -> shipped transition with no shipment row", () => {
    expect(
      shouldNotifyShipped({
        newStatus: "shipped",
        previousStatus: "processing",
        hasShipmentRow: false,
      }),
    ).toBe(true);
  });

  it("does NOT notify when a shipment row already exists (bookShipment already sent it)", () => {
    expect(
      shouldNotifyShipped({
        newStatus: "shipped",
        previousStatus: "processing",
        hasShipmentRow: true,
      }),
    ).toBe(false);
  });

  it("does NOT notify when the order was already shipped (idempotency)", () => {
    expect(
      shouldNotifyShipped({
        newStatus: "shipped",
        previousStatus: "shipped",
        hasShipmentRow: false,
      }),
    ).toBe(false);
  });

  it("does NOT notify for a transition to any other status", () => {
    expect(
      shouldNotifyShipped({
        newStatus: "delivered",
        previousStatus: "shipped",
        hasShipmentRow: false,
      }),
    ).toBe(false);
  });
});

describe("assertValidTransition (sanity check for the shipped self-loop)", () => {
  it("rejects shipped -> shipped", () => {
    expect(() => assertValidTransition("shipped", "shipped")).toThrow();
  });

  it("allows processing -> shipped", () => {
    expect(() => assertValidTransition("processing", "shipped")).not.toThrow();
  });
});
