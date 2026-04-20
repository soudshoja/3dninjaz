// No "server-only" here on purpose — this module is pure types + a pure
// normalization function. It is imported by both server action callers and
// the shared tracking timeline component (which is rendered from a client
// "use client" parent, so bundles the module into the client graph). Nothing
// here reads env vars or calls Delyva; it only receives the already-fetched
// data as arguments.
//
// We intentionally declare a LOCAL `ShipmentMirrorRow` type here rather than
// importing ShipmentRow from `@/actions/shipping`. Two reasons:
//   1. `shipping.ts` has "use server" — client components cannot import non-
//      async exports from it.
//   2. Re-importing would create a cycle (shipping.ts already imports from
//      this file to build the view).
//
// Structurally compatible with ShipmentRow — any change there must be mirrored
// here. Enforced indirectly at the buildTrackingView() call sites because
// ShipmentRow satisfies this shape via structural typing.

import type { OrderDetails } from "@/lib/delyva";

export type ShipmentMirrorRow = {
  orderId: string;
  delyvaOrderId: string | null;
  serviceCode: string | null;
  consignmentNo: string | null;
  trackingNo: string | null;
  statusCode: number | null;
  statusMessage: string | null;
  personnelName: string | null;
  personnelPhone: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// ============================================================================
// Normalized shipment-tracking view consumed by BOTH the customer order page
// and the admin OrderShipmentPanel. Prevents shape drift between the two
// surfaces — any new Delyva field we expose must be added here once and the
// two rendering components pick it up for free.
//
// Status semantics (observed, not documented by Delyva):
//   <  90  : pre-booking / draft           → "Awaiting pickup"
//   = 90   : cancelled
//   100-199: picked up / collected
//   200-299: in transit / out for delivery
//   300-399: last-mile / arrived at hub
//   400-499: delivered (terminal, good)
//   500    : failed / returned / exception
//
// `delivered` is anything >= 400 that is NOT 500. `cancelled` is exactly 90.
// Everything else is "in transit".
// ============================================================================

export type ShipmentTimelineEvent = {
  at: Date;
  statusCode: number;
  note: string;
};

export type ShipmentTrackingView = {
  /** Public courier consignment number (e.g. "SPX1234567890"). Safe to show customers. */
  consignmentNo: string | null;
  /** Courier-side tracking number — sometimes identical to consignmentNo. */
  trackingNo: string | null;
  /** Bookable Delyva service code, e.g. "SPXDMY-PN-BD1". Internal-ish, admin may care. */
  serviceCode: string | null;
  /** Human-readable service name, e.g. "SPX Express". */
  serviceName: string | null;
  /** Latest integer statusCode from Delyva. */
  statusCode: number | null;
  /** Latest human-readable statusMessage from Delyva. */
  statusMessage: string | null;
  /** `statusCode >= 400 && statusCode !== 500` — terminal good state. */
  delivered: boolean;
  /** `statusCode === 90` — cancelled booking. */
  cancelled: boolean;
  /** Newest-first list of delivery events. */
  timeline: ShipmentTimelineEvent[];
  /** Driver / rider info — hidden entirely when null. */
  personnel: {
    name: string | null;
    phone: string | null;
    vehicle: string | null;
    plate: string | null;
  } | null;
  /** Delyva live-map iframe URL. Populated only when we have a consignmentNo AND not delivered AND not cancelled. */
  mapEmbedUrl: string | null;
  /** Timestamp of the most recent timeline event (or DB row update when timeline is empty). */
  lastUpdatedAt: Date | null;
  /**
   * When the action fell back to the cached DB row (Delyva call failed or
   * timed out), callers should display a subtle "cached" note. Null on the
   * happy path.
   */
  cachedNote: string | null;
  /**
   * Whether the underlying order has a booked courier yet. `false` means the
   * order is still being prepared and the UI should render an empty state.
   */
  hasShipment: boolean;
};

// --------------------------- Builders ---------------------------

/**
 * Build a ShipmentTrackingView from a mirror row + optional live Delyva response.
 * - When `live` is present, merge it on top of the mirror row (live wins).
 * - When `live` is null (no Delyva call, or the call failed), render from the
 *   mirror row alone with `cachedNote` set so the UI can show a hint.
 */
export function buildTrackingView(args: {
  shipment: ShipmentMirrorRow | null;
  live: OrderDetails | null;
  cachedNote: string | null;
}): ShipmentTrackingView {
  const { shipment, live, cachedNote } = args;

  if (!shipment) {
    return {
      consignmentNo: null,
      trackingNo: null,
      serviceCode: null,
      serviceName: null,
      statusCode: null,
      statusMessage: null,
      delivered: false,
      cancelled: false,
      timeline: [],
      personnel: null,
      mapEmbedUrl: null,
      lastUpdatedAt: null,
      cachedNote: null,
      hasShipment: false,
    };
  }

  const consignmentNo = live?.consignmentNo ?? shipment.consignmentNo ?? null;
  const trackingNo = live?.trackingNo ?? shipment.trackingNo ?? null;
  const serviceCode = live?.serviceCode ?? shipment.serviceCode ?? null;
  const statusCode = live?.statusCode ?? shipment.statusCode ?? null;
  const statusMessage =
    live?.statusMessage ?? shipment.statusMessage ?? null;

  const delivered =
    typeof statusCode === "number" && statusCode >= 400 && statusCode !== 500;
  const cancelled = statusCode === 90;

  const timeline = (live?.tracking ?? []).reduce<ShipmentTimelineEvent[]>(
    (acc, evt) => {
      if (!evt || typeof evt.at !== "string") return acc;
      const at = new Date(evt.at);
      if (Number.isNaN(at.getTime())) return acc;
      acc.push({
        at,
        statusCode: Number(evt.statusCode ?? 0),
        note: evt.note?.trim() || fallbackNote(Number(evt.statusCode ?? 0)),
      });
      return acc;
    },
    [],
  );
  // Newest-first.
  timeline.sort((a, b) => b.at.getTime() - a.at.getTime());

  // Seed timeline from the mirror row when live call failed and we have no
  // events — at minimum show the latest known status so the UI never looks
  // blank for a booked shipment.
  if (timeline.length === 0 && statusCode !== null) {
    timeline.push({
      at: shipment.updatedAt,
      statusCode,
      note: statusMessage ?? fallbackNote(statusCode),
    });
  }

  const livePersonnel = live?.personnel;
  const pName = livePersonnel?.name ?? shipment.personnelName ?? null;
  const pPhone = livePersonnel?.phone ?? shipment.personnelPhone ?? null;
  const pVehicle = livePersonnel?.vehicle ?? null;
  const pPlate = livePersonnel?.plate ?? null;
  const personnel =
    pName || pPhone || pVehicle || pPlate
      ? { name: pName, phone: pPhone, vehicle: pVehicle, plate: pPlate }
      : null;

  const mapEmbedUrl =
    consignmentNo && !delivered && !cancelled
      ? `https://my.delyva.app/track/rmap?trackingNo=${encodeURIComponent(consignmentNo)}`
      : null;

  const lastUpdatedAt =
    timeline[0]?.at ?? shipment.updatedAt ?? shipment.createdAt ?? null;

  // Best-effort service name from the snapshot JSON if caller didn't hydrate.
  const serviceName = null;

  return {
    consignmentNo,
    trackingNo,
    serviceCode,
    serviceName,
    statusCode,
    statusMessage,
    delivered,
    cancelled,
    timeline,
    personnel,
    mapEmbedUrl,
    lastUpdatedAt,
    cachedNote,
    hasShipment: true,
  };
}

// --------------------------- Status helpers ---------------------------

/**
 * Coarse status bucket used by the UI to pick an icon + tone. Stays in lockstep
 * with the semantics documented at the top of this file.
 */
export type TrackingBucket =
  | "awaiting"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "exception";

export function bucketForStatusCode(
  code: number | null,
  hasShipment: boolean,
): TrackingBucket {
  if (!hasShipment) return "awaiting";
  if (code === null) return "awaiting";
  if (code === 90) return "cancelled";
  if (code === 500) return "exception";
  if (code >= 400) return "delivered";
  if (code >= 300) return "out_for_delivery";
  if (code >= 200) return "in_transit";
  if (code >= 100) return "picked_up";
  return "awaiting";
}

export function bucketLabel(b: TrackingBucket): string {
  switch (b) {
    case "awaiting":
      return "Awaiting pickup";
    case "picked_up":
      return "Picked up";
    case "in_transit":
      return "In transit";
    case "out_for_delivery":
      return "Out for delivery";
    case "delivered":
      return "Delivered";
    case "cancelled":
      return "Cancelled";
    case "exception":
      return "Delivery issue";
  }
}

function fallbackNote(code: number): string {
  return bucketLabel(bucketForStatusCode(code, true));
}
