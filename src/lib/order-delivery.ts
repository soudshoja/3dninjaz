import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import {
  DELIVERABLE_SOURCE_STATUSES,
  isDeliveredStatusCode,
} from "@/lib/delyva-delivery-status";
import { notifyOrderDelivered } from "@/lib/order-delivery-notify";

// ============================================================================
// Shared "order delivered" transition. NOT a "use server" file (it exports
// constants). Used by the Delyva webhook, hydrateTrackingView and the
// delivery-sync poller so all three converge on ONE atomic UPDATE; only the
// caller whose UPDATE actually changed a row sends the customer notification.
// ============================================================================

/** Delivered longer ago than this => flip the status but do NOT message. */
export const DELIVERED_NOTIFY_MAX_AGE_HOURS = 24;

function affectedRowsOf(result: unknown): number {
  // mysql2 via drizzle: [ResultSetHeader, fields]
  const header = Array.isArray(result) ? result[0] : result;
  const n = (header as { affectedRows?: unknown } | null | undefined)?.affectedRows;
  return typeof n === "number" ? n : 0;
}

/**
 * Single conditional UPDATE. Returns true iff THIS call changed the row.
 * Race-safe: two concurrent callers cannot both see affectedRows === 1.
 */
export async function applyDeliveredTransition(orderId: string): Promise<boolean> {
  const result = await db
    .update(orders)
    .set({ status: "delivered" })
    .where(
      and(
        eq(orders.id, orderId),
        inArray(orders.status, [...DELIVERABLE_SOURCE_STATUSES]),
      ),
    );
  return affectedRowsOf(result) === 1;
}

/** True when the delivery is recent enough that a "delivered" message makes sense. */
export function isFreshDelivery(
  deliveredAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!deliveredAt || Number.isNaN(deliveredAt.getTime())) return false;
  const ageMs = now.getTime() - deliveredAt.getTime();
  return ageMs <= DELIVERED_NOTIFY_MAX_AGE_HOURS * 3_600_000;
}

/** Best-effort parse of Delyva's delivery time from live order tracking. */
export function deliveredAtFromTracking(
  tracking: Array<{ statusCode: number; at: string }> | null | undefined,
): Date | null {
  if (!Array.isArray(tracking)) return null;
  let best: Date | null = null;
  for (const t of tracking) {
    if (!isDeliveredStatusCode(t?.statusCode)) continue;
    const d = new Date(t.at);
    if (Number.isNaN(d.getTime())) continue;
    if (!best || d > best) best = d;
  }
  return best;
}

export type DeliveredOutcome =
  | "not-delivered"
  | "delivered-transition"
  | "delivered-transition-stale"
  | "already-delivered"
  | "blocked-by-order-status"
  | "order-missing";

export type DeliveredDeps = {
  transition: (orderId: string) => Promise<boolean>;
  currentStatus: (orderId: string) => Promise<string | null>;
  notify: (orderId: string) => void;
  now: () => Date;
};

const defaultDeps: DeliveredDeps = {
  transition: applyDeliveredTransition,
  currentStatus: async (orderId) => {
    const rows = await db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    return rows[0]?.status ?? null;
  },
  notify: notifyOrderDelivered,
  now: () => new Date(),
};

/**
 * Entry point for all three callers. Flips the order (atomically) when the
 * numeric Delyva code says delivered, THEN — only if this call did the flip
 * and the delivery is fresh — fires notifications best-effort. A notification
 * failure can never affect the status.
 *
 * `deliveredAt` = Delyva's delivery time if known; otherwise pass
 * `fallbackEventAt` (a lower bound for when the delivery happened).
 */
export async function handleDeliveredSignal(
  input: {
    orderId: string;
    statusCode: number | null | undefined;
    deliveredAt?: Date | null;
    fallbackEventAt?: Date | null;
  },
  deps: DeliveredDeps = defaultDeps,
): Promise<DeliveredOutcome> {
  if (!isDeliveredStatusCode(input.statusCode)) return "not-delivered";

  const changed = await deps.transition(input.orderId);
  if (!changed) {
    const status = await deps.currentStatus(input.orderId);
    if (status === null) return "order-missing";
    return status === "delivered" ? "already-delivered" : "blocked-by-order-status";
  }

  const when = input.deliveredAt ?? input.fallbackEventAt ?? null;
  if (!isFreshDelivery(when, deps.now())) return "delivered-transition-stale";

  try {
    deps.notify(input.orderId);
  } catch (err) {
    console.error("[order-delivery] notify dispatch failed:", err);
  }
  return "delivered-transition";
}
