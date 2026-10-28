import { describe, it, expect } from "vitest";
import { isOrderEditable, assertEditable, hasActiveShipment } from "./order-editable";

const EDITABLE_STATUSES = [
  "pending",
  "awaiting_customer",
  "awaiting_payment_review",
] as const;

const LOCKED_STATUSES = [
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

describe("isOrderEditable", () => {
  describe("returns TRUE for editable statuses with no capture ID", () => {
    for (const status of EDITABLE_STATUSES) {
      it(`status=${status}, no captureId → true`, () => {
        expect(isOrderEditable({ status, paypalCaptureId: null })).toBe(true);
        expect(isOrderEditable({ status, paypalCaptureId: undefined })).toBe(true);
        expect(isOrderEditable({ status, paypalCaptureId: "" })).toBe(true);
      });
    }
  });

  describe("returns FALSE for locked statuses even without captureId", () => {
    for (const status of LOCKED_STATUSES) {
      it(`status=${status}, no captureId → false`, () => {
        expect(isOrderEditable({ status, paypalCaptureId: null })).toBe(false);
      });
    }
  });

  describe("returns FALSE when paypalCaptureId is set (regardless of status)", () => {
    for (const status of EDITABLE_STATUSES) {
      it(`status=${status}, captureId set → false`, () => {
        expect(
          isOrderEditable({ status, paypalCaptureId: "CAPTURE-ABC123" }),
        ).toBe(false);
      });
    }

    for (const status of LOCKED_STATUSES) {
      it(`status=${status}, captureId set → false`, () => {
        expect(
          isOrderEditable({ status, paypalCaptureId: "CAPTURE-ABC123" }),
        ).toBe(false);
      });
    }
  });
});

describe("assertEditable", () => {
  it("does not throw for an editable order", () => {
    expect(() =>
      assertEditable({ status: "pending", paypalCaptureId: null }),
    ).not.toThrow();
    expect(() =>
      assertEditable({ status: "awaiting_customer", paypalCaptureId: "" }),
    ).not.toThrow();
  });

  it("throws the locked-message error for a paid status", () => {
    expect(() =>
      assertEditable({ status: "paid", paypalCaptureId: null }),
    ).toThrowError(
      "Order is locked — it has been paid and can no longer be edited.",
    );
  });

  it("throws the locked-message error when captureId is set", () => {
    expect(() =>
      assertEditable({ status: "pending", paypalCaptureId: "5VT12345ABCD" }),
    ).toThrowError(
      "Order is locked — it has been paid and can no longer be edited.",
    );
  });

  it("throws for all locked statuses", () => {
    for (const status of LOCKED_STATUSES) {
      expect(() =>
        assertEditable({ status, paypalCaptureId: null }),
      ).toThrow();
    }
  });
});

// 260922-shipto — hasActiveShipment is the SEPARATE gate for ship-to address
// editability. Deliberately independent of order.status.
describe("hasActiveShipment", () => {
  it("returns false when there is no shipment row at all", () => {
    expect(hasActiveShipment(null)).toBe(false);
    expect(hasActiveShipment(undefined)).toBe(false);
  });

  it("returns false when a row exists but has no delyvaOrderId (draft-only)", () => {
    expect(
      hasActiveShipment({ delyvaOrderId: null, statusCode: null }),
    ).toBe(false);
  });

  it("returns true when a real booking exists and is not cancelled", () => {
    expect(
      hasActiveShipment({ delyvaOrderId: "DLV-123", statusCode: 110 }),
    ).toBe(true);
    // statusCode null (not yet synced) still counts as active — a
    // delyvaOrderId means the booking was placed.
    expect(
      hasActiveShipment({ delyvaOrderId: "DLV-123", statusCode: null }),
    ).toBe(true);
  });

  it("returns false when the booking's statusCode is the cancelled code (900)", () => {
    expect(
      hasActiveShipment({ delyvaOrderId: "DLV-123", statusCode: 900 }),
    ).toBe(false);
  });

  it("returns true for a delivered booking (700) — delivered is still a real booking, not cancelled", () => {
    expect(
      hasActiveShipment({ delyvaOrderId: "DLV-123", statusCode: 700 }),
    ).toBe(true);
  });
});
