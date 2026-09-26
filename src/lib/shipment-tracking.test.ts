import { describe, it, expect } from "vitest";
import {
  buildTrackingView,
  bucketForStatusCode,
  type ShipmentMirrorRow,
} from "./shipment-tracking";

// Verified Delyva statusCode facts (2026-09-16, live account) — see
// src/lib/delyva-delivery-status.ts for the canonical decision helpers this
// module now delegates to. Do not resurrect the debunked >=400/===90/!==500
// banding these tests guard against.

function shipmentWithStatus(statusCode: number | null): ShipmentMirrorRow {
  return {
    orderId: "order-1",
    delyvaOrderId: "dly-1",
    serviceCode: "SPX",
    consignmentNo: "CONSIGN-1",
    trackingNo: "TRACK-1",
    statusCode,
    statusMessage: null,
    personnelName: null,
    personnelPhone: null,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-09-02T00:00:00Z"),
  };
}

describe("buildTrackingView delivered/cancelled banding", () => {
  it("600 (in transit) is NOT delivered", () => {
    const view = buildTrackingView({
      shipment: shipmentWithStatus(600),
      live: null,
      cachedNote: null,
    });
    expect(view.delivered).toBe(false);
  });

  it("900 (cancelled) is NOT delivered", () => {
    const view = buildTrackingView({
      shipment: shipmentWithStatus(900),
      live: null,
      cachedNote: null,
    });
    expect(view.delivered).toBe(false);
  });

  it("900 (cancelled) IS cancelled", () => {
    const view = buildTrackingView({
      shipment: shipmentWithStatus(900),
      live: null,
      cachedNote: null,
    });
    expect(view.cancelled).toBe(true);
  });

  it("700 IS delivered", () => {
    const view = buildTrackingView({
      shipment: shipmentWithStatus(700),
      live: null,
      cachedNote: null,
    });
    expect(view.delivered).toBe(true);
    expect(view.cancelled).toBe(false);
  });

  it("110 (label printed) is neither delivered nor cancelled", () => {
    const view = buildTrackingView({
      shipment: shipmentWithStatus(110),
      live: null,
      cachedNote: null,
    });
    expect(view.delivered).toBe(false);
    expect(view.cancelled).toBe(false);
  });
});

describe("bucketForStatusCode delivered/cancelled banding", () => {
  it("600 is not the delivered bucket and not the cancelled bucket", () => {
    const bucket = bucketForStatusCode(600, true);
    expect(bucket).not.toBe("delivered");
    expect(bucket).not.toBe("cancelled");
  });

  it("900 maps to the cancelled bucket, never delivered", () => {
    expect(bucketForStatusCode(900, true)).toBe("cancelled");
  });

  it("700 maps to the delivered bucket", () => {
    expect(bucketForStatusCode(700, true)).toBe("delivered");
  });

  it("110 is neither the delivered nor the cancelled bucket", () => {
    const bucket = bucketForStatusCode(110, true);
    expect(bucket).not.toBe("delivered");
    expect(bucket).not.toBe("cancelled");
  });
});
