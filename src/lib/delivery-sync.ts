import { and, asc, eq, inArray, isNotNull, or, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { orderShipments, orders } from "@/lib/db/schema";
import { delyvaApi, type OrderDetails } from "@/lib/delyva";
import {
  DELIVERABLE_SOURCE_STATUSES,
  isCancelledStatusCode,
} from "@/lib/delyva-delivery-status";
import {
  deliveredAtFromTracking,
  handleDeliveredSignal,
  type DeliveredOutcome,
} from "@/lib/order-delivery";

// ============================================================================
// Delivery poller — the reliable path. Delivery must not depend on a webhook
// arriving or on someone opening the tracking page. Called by
// POST /api/internal/delivery-sync (cron, every ~10 minutes).
// ============================================================================

export const DELIVERY_SYNC_BATCH_CAP = 25;
export const DELIVERY_SYNC_PAUSE_MS = 300;
export const DELIVERY_SYNC_TIMEOUT_MS = 5000;

export type SyncCandidate = {
  orderId: string;
  delyvaOrderId: string;
  lastTrackingEventAt: Date | null;
  createdAt: Date;
};

export type DeliverySyncSummary = {
  checked: number;
  delivered: number;
  errors: number;
};

export type DeliverySyncDeps = {
  listCandidates: (limit: number) => Promise<SyncCandidate[]>;
  fetchLive: (delyvaOrderId: string) => Promise<OrderDetails>;
  mirror: (orderId: string, live: OrderDetails) => Promise<void>;
  handle: typeof handleDeliveredSignal;
  sleep: (ms: number) => Promise<void>;
};

// Eligible = order still in a source status, shipment has a Delyva id, and
// the shipment is not already known-cancelled (900 is terminal and we never
// act on it; excluding it stops those rows hogging the cap forever).
// Oldest-checked first (NULLs sort first in MariaDB ASC).
export async function listDeliverySyncCandidates(limit: number): Promise<SyncCandidate[]> {
  const rows = await db
    .select({
      orderId: orderShipments.orderId,
      delyvaOrderId: orderShipments.delyvaOrderId,
      lastTrackingEventAt: orderShipments.lastTrackingEventAt,
      createdAt: orderShipments.createdAt,
    })
    .from(orderShipments)
    .innerJoin(orders, eq(orders.id, orderShipments.orderId))
    .where(
      and(
        inArray(orders.status, [...DELIVERABLE_SOURCE_STATUSES]),
        isNotNull(orderShipments.delyvaOrderId),
        or(isNull(orderShipments.statusCode), ne(orderShipments.statusCode, 900)),
      ),
    )
    .orderBy(asc(orderShipments.lastTrackingEventAt))
    .limit(limit);
  return rows.flatMap((r) =>
    r.delyvaOrderId ? [{ ...r, delyvaOrderId: r.delyvaOrderId }] : [],
  );
}

const defaultDeps: DeliverySyncDeps = {
  listCandidates: listDeliverySyncCandidates,
  fetchLive: (id) => delyvaApi.getOrderFast(id, DELIVERY_SYNC_TIMEOUT_MS),
  mirror: async (orderId, live) => {
    await db
      .update(orderShipments)
      .set({
        consignmentNo: live.consignmentNo ?? undefined,
        trackingNo: live.trackingNo ?? undefined,
        statusCode: live.statusCode ?? undefined,
        statusMessage: live.statusMessage ?? undefined,
        personnelName: live.personnel?.name ?? undefined,
        personnelPhone: live.personnel?.phone ?? undefined,
        lastTrackingEventAt: new Date(),
      })
      .where(eq(orderShipments.orderId, orderId));
  },
  handle: handleDeliveredSignal,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export async function runDeliverySync(
  deps: DeliverySyncDeps = defaultDeps,
  opts: { cap?: number; pauseMs?: number } = {},
): Promise<DeliverySyncSummary> {
  const cap = opts.cap ?? DELIVERY_SYNC_BATCH_CAP;
  const pauseMs = opts.pauseMs ?? DELIVERY_SYNC_PAUSE_MS;
  const summary: DeliverySyncSummary = { checked: 0, delivered: 0, errors: 0 };

  const candidates = (await deps.listCandidates(cap)).slice(0, cap);

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (i > 0 && pauseMs > 0) await deps.sleep(pauseMs);
    summary.checked++;
    const tail = c.delyvaOrderId.slice(-6);
    try {
      const live = await deps.fetchLive(c.delyvaOrderId);
      // Mirror failure must not stop the delivery decision, but counts as an error.
      try {
        await deps.mirror(c.orderId, live);
      } catch (e) {
        summary.errors++;
        console.warn("[delivery-sync] mirror failed", tail, (e as Error).message);
      }
      if (isCancelledStatusCode(live.statusCode)) {
        console.warn("[delivery-sync] shipment cancelled at Delyva (900), order left untouched", tail);
        continue;
      }
      const outcome: DeliveredOutcome = await deps.handle({
        orderId: c.orderId,
        statusCode: live.statusCode,
        deliveredAt: deliveredAtFromTracking(live.tracking),
        // Previous check time is a lower bound for when delivery happened.
        fallbackEventAt: c.lastTrackingEventAt ?? c.createdAt,
      });
      if (outcome === "delivered-transition" || outcome === "delivered-transition-stale") {
        summary.delivered++;
        console.info("[delivery-sync]", JSON.stringify({ delyva: tail, outcome }));
      } else if (outcome === "blocked-by-order-status") {
        console.warn("[delivery-sync]", JSON.stringify({ delyva: tail, outcome }));
      }
    } catch (e) {
      summary.errors++;
      console.warn("[delivery-sync] parcel failed", tail, (e as Error).message);
    }
  }
  return summary;
}
