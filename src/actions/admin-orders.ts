"use server";

import { db } from "@/lib/db";
import { orders, orderItems, user } from "@/lib/db/schema";
import { and, eq, desc, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { assertValidTransition, type OrderStatus } from "@/lib/orders";
import { orderStatusValues } from "@/lib/db/schema";
import { computeOrderCost, toNum, toNumOrNull } from "@/lib/profit";

// ============================================================================
// Plan 03-04 admin order actions.
//
// IMPORTANT (T-03-30 / CVE-2025-29927):
// Every exported function MUST call `await requireAdmin()` as its FIRST
// statement, BEFORE any DB access. Middleware alone is not a security
// boundary — CVE-2025-29927 allowed bypassing Next.js middleware via crafted
// internal headers.
//
// IMPORTANT (MariaDB 10.11):
// Drizzle's relational `db.query.*` with nested `with: { ... }` clauses emits
// LATERAL joins, which MariaDB 10.11 does not support. Every read in this
// file uses manual `.select().from(...)` + a follow-up SELECT to hydrate
// related rows. This mirrors the pattern established in src/actions/products.ts.
// ============================================================================

export type AdminOrderListRow = {
  id: string;
  userId: string;
  status: OrderStatus;
  paypalOrderId: string | null;
  paypalCaptureId: string | null;
  subtotal: string;
  shippingCost: string;
  totalAmount: string;
  currency: string;
  customerEmail: string;
  shippingName: string;
  createdAt: Date;
  user: { id: string; email: string; name: string } | null;
  itemCount: number;
};

type StatusFilter = OrderStatus | "all";

function isOrderStatus(v: string | undefined): v is OrderStatus {
  return !!v && (orderStatusValues as readonly string[]).includes(v);
}

/**
 * List every order, newest first, with the buyer's name/email joined in and
 * a computed itemCount. Optional status filter. Admin-only.
 *
 * Two SELECTs:
 *   1) orders LEFT JOIN user, filtered by status if provided.
 *   2) order_items WHERE orderId IN (...) — aggregated in memory to get
 *      itemCount per order (sum of quantities).
 */
export async function listAdminOrders(
  filter: StatusFilter = "all",
): Promise<AdminOrderListRow[]> {
  await requireAdmin();

  const effective: OrderStatus | undefined =
    filter && filter !== "all" && isOrderStatus(filter) ? filter : undefined;

  const baseQuery = db
    .select({
      id: orders.id,
      userId: orders.userId,
      status: orders.status,
      paypalOrderId: orders.paypalOrderId,
      paypalCaptureId: orders.paypalCaptureId,
      subtotal: orders.subtotal,
      shippingCost: orders.shippingCost,
      totalAmount: orders.totalAmount,
      currency: orders.currency,
      customerEmail: orders.customerEmail,
      shippingName: orders.shippingName,
      createdAt: orders.createdAt,
      userIdJoin: user.id,
      userEmail: user.email,
      userName: user.name,
    })
    .from(orders)
    .leftJoin(user, eq(orders.userId, user.id));

  const rows = effective
    ? await baseQuery.where(eq(orders.status, effective)).orderBy(desc(orders.createdAt))
    : await baseQuery.orderBy(desc(orders.createdAt));

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  // itemCount per order — SUM(quantity) grouped client-side so the query
  // stays portable. order_items rows are small; N ~ few hundred in v1.
  const items = await db
    .select({
      orderId: orderItems.orderId,
      quantity: orderItems.quantity,
    })
    .from(orderItems)
    .where(inArray(orderItems.orderId, ids));

  const countByOrder = new Map<string, number>();
  for (const it of items) {
    countByOrder.set(it.orderId, (countByOrder.get(it.orderId) ?? 0) + it.quantity);
  }

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    status: r.status as OrderStatus,
    paypalOrderId: r.paypalOrderId ?? null,
    paypalCaptureId: r.paypalCaptureId ?? null,
    subtotal: r.subtotal,
    shippingCost: r.shippingCost,
    totalAmount: r.totalAmount,
    currency: r.currency,
    customerEmail: r.customerEmail,
    shippingName: r.shippingName,
    createdAt: r.createdAt,
    user: r.userIdJoin
      ? { id: r.userIdJoin, email: r.userEmail ?? "", name: r.userName ?? "" }
      : null,
    itemCount: countByOrder.get(r.id) ?? 0,
  }));
}

export type AdminOrderDetail = {
  id: string;
  userId: string;
  status: OrderStatus;
  paypalOrderId: string | null;
  paypalCaptureId: string | null;
  subtotal: string;
  shippingCost: string;
  totalAmount: string;
  currency: string;
  customerEmail: string;
  shippingName: string;
  shippingPhone: string;
  shippingLine1: string;
  shippingLine2: string | null;
  shippingCity: string;
  shippingState: string;
  shippingPostcode: string;
  shippingCountry: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Phase 7 (07-03) — manual order surface
  sourceType: "web" | "manual";
  customItemName: string | null;
  customItemDescription: string | null;
  customImages: string[];
  // Phase 7 (07-04) — PayPal financials cache
  refundedAmount: string;
  paypalFee: string | null;
  paypalNet: string | null;
  sellerProtection: string | null;
  paypalSettleDate: Date | null;
  // Phase 9b — Delyva courier selection captured at checkout
  shippingServiceCode: string | null;
  shippingServiceName: string | null;
  shippingQuotedPrice: string | null;
  // Phase 10 (10-01) — order-level one-off cost + optional note.
  extraCost: string;
  extraCostNote: string | null;
  user: { id: string; email: string; name: string } | null;
  items: Array<{
    id: string;
    productId: string;
    variantId: string;
    productName: string;
    productSlug: string;
    productImage: string | null;
    size: string | null;
    // Phase 16-05 — composed label snapshot (e.g. "Medium / Red")
    variantLabel: string | null;
    unitPrice: string;
    // Phase 10 — snapshotted per-unit cost. NULL = variant had no costPrice
    // when the order was created. Admin can backfill via inline edit.
    unitCost: string | null;
    quantity: number;
    lineTotal: string;
    // Phase 19 (19-09) — configurationData snapshot for made-to-order lines
    configurationData: string | null;
  }>;
};

function ensureImagesArrayLocal(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      // fall through
    }
  }
  return [];
}

/**
 * Fetch a single order with its line items and joined user snapshot.
 * Returns null if the order id does not exist. Admin-only.
 */
export async function getAdminOrder(orderId: string): Promise<AdminOrderDetail | null> {
  await requireAdmin();

  const [head] = await db
    .select({
      o: orders,
      uId: user.id,
      uEmail: user.email,
      uName: user.name,
    })
    .from(orders)
    .leftJoin(user, eq(orders.userId, user.id))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!head) return null;

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  return {
    id: head.o.id,
    userId: head.o.userId,
    status: head.o.status as OrderStatus,
    paypalOrderId: head.o.paypalOrderId ?? null,
    paypalCaptureId: head.o.paypalCaptureId ?? null,
    subtotal: head.o.subtotal,
    shippingCost: head.o.shippingCost,
    totalAmount: head.o.totalAmount,
    currency: head.o.currency,
    customerEmail: head.o.customerEmail,
    shippingName: head.o.shippingName,
    shippingPhone: head.o.shippingPhone,
    shippingLine1: head.o.shippingLine1,
    shippingLine2: head.o.shippingLine2 ?? null,
    shippingCity: head.o.shippingCity,
    shippingState: head.o.shippingState,
    shippingPostcode: head.o.shippingPostcode,
    shippingCountry: head.o.shippingCountry,
    notes: head.o.notes ?? null,
    createdAt: head.o.createdAt,
    updatedAt: head.o.updatedAt,
    sourceType: (head.o.sourceType ?? "web") as "web" | "manual",
    customItemName: head.o.customItemName ?? null,
    customItemDescription: head.o.customItemDescription ?? null,
    customImages: ensureImagesArrayLocal(head.o.customImages),
    refundedAmount: head.o.refundedAmount ?? "0.00",
    paypalFee: head.o.paypalFee ?? null,
    paypalNet: head.o.paypalNet ?? null,
    sellerProtection: head.o.sellerProtection ?? null,
    paypalSettleDate: head.o.paypalSettleDate ?? null,
    shippingServiceCode: head.o.shippingServiceCode ?? null,
    shippingServiceName: head.o.shippingServiceName ?? null,
    shippingQuotedPrice: head.o.shippingQuotedPrice ?? null,
    extraCost: head.o.extraCost ?? "0.00",
    extraCostNote: head.o.extraCostNote ?? null,
    user: head.uId
      ? { id: head.uId, email: head.uEmail ?? "", name: head.uName ?? "" }
      : null,
    items: items.map((it) => ({
      id: it.id,
      productId: it.productId,
      variantId: it.variantId,
      productName: it.productName,
      productSlug: it.productSlug,
      productImage: it.productImage ?? null,
      size: it.size,
      variantLabel: it.variantLabel ?? null,
      unitPrice: it.unitPrice,
      unitCost: it.unitCost ?? null,
      quantity: it.quantity,
      lineTotal: it.lineTotal,
      configurationData: it.configurationData ?? null, // Phase 19 (19-09)
    })),
  };
}

type UpdateStatusResult = { ok: true } | { ok: false; error: string };

/**
 * Move an order's status forward per the D3-12 state machine.
 *
 * Uses assertValidTransition from src/lib/orders.ts as the single source of
 * truth. Re-reads current status from the DB first (T-03-31: a client
 * forging a transition from a stale status is caught here). On invalid
 * transitions the DB is NOT mutated.
 */
export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
): Promise<UpdateStatusResult> {
  await requireAdmin();

  if (!isOrderStatus(newStatus)) {
    return { ok: false, error: "Invalid status value." };
  }

  const [row] = await db
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!row) return { ok: false, error: "Order not found." };

  try {
    assertValidTransition(row.status as OrderStatus, newStatus);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid status transition.";
    return { ok: false, error: msg };
  }

  await db.update(orders).set({ status: newStatus }).where(eq(orders.id, orderId));

  revalidatePath(`/admin/orders`);
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/orders`);

  return { ok: true };
}

type UpdateNotesResult = { ok: true } | { ok: false; error: string };

/**
 * Set the admin-only internal notes on an order. Capped at 2000 characters
 * server-side (T-03-33). Stored verbatim — the detail view renders notes
 * only inside the <textarea> value (never as HTML).
 */
export async function updateOrderNotes(
  orderId: string,
  notes: string,
): Promise<UpdateNotesResult> {
  await requireAdmin();

  if (typeof notes !== "string") {
    return { ok: false, error: "Notes must be text." };
  }
  if (notes.length > 2000) {
    return { ok: false, error: "Notes too long (max 2000 characters)." };
  }

  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!row) return { ok: false, error: "Order not found." };

  await db
    .update(orders)
    .set({ notes: notes.length === 0 ? null : notes })
    .where(eq(orders.id, orderId));

  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true };
}

// ============================================================================
// Phase 10 (10-01) — Cost + profit inline edits.
//
// requireAdmin() first await in every exported action (CVE-2025-29927). Both
// edits validate ≥ 0, persist, then return the recomputed OrderCostSummary so
// the caller can refresh the profit panel without a full page reload.
// ============================================================================

export type OrderProfitSummary = {
  revenueGross: number;
  itemCostTotal: number;
  extraCost: number;
  totalCost: number;
  profitExShipping: number;
  marginPercent: number;
  hasMissingCosts: boolean;
  missingCount: number;
};

type CostUpdateResult =
  | { ok: true; summary: OrderProfitSummary }
  | { ok: false; error: string };

/**
 * Recompute the order's profit summary from persisted rows. Called after
 * every cost mutation so the client sees fresh numbers without a full
 * refresh + server-rendered too. Cheap: two indexed selects.
 */
async function recomputeOrderProfit(orderId: string): Promise<OrderProfitSummary> {
  const [orderRow] = await db
    .select({ extraCost: orders.extraCost })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  const itemRows = await db
    .select({
      unitPrice: orderItems.unitPrice,
      unitCost: orderItems.unitCost,
      quantity: orderItems.quantity,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const summary = computeOrderCost(
    itemRows.map((r) => ({
      price: toNum(r.unitPrice),
      qty: r.quantity,
      unitCost: toNumOrNull(r.unitCost),
    })),
    toNum(orderRow?.extraCost),
  );
  return summary;
}

export async function getOrderProfitSummary(
  orderId: string,
): Promise<OrderProfitSummary | null> {
  await requireAdmin();
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!row) return null;
  return recomputeOrderProfit(orderId);
}

/**
 * Set the snapshotted unit_cost on a single order_item row. Empty string /
 * null clears the value (makes it missing in the profit summary).
 */
export async function updateOrderItemCost(
  orderId: string,
  itemId: string,
  unitCostRaw: string | null,
): Promise<CostUpdateResult> {
  await requireAdmin();

  let valueToStore: string | null = null;
  if (unitCostRaw != null && unitCostRaw.trim() !== "") {
    const trimmed = unitCostRaw.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
      return { ok: false, error: "Cost must be a non-negative MYR amount." };
    }
    const n = parseFloat(trimmed);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "Cost must be ≥ 0." };
    }
    valueToStore = n.toFixed(2);
  }

  // Guard: the order_item must belong to the order we say it does. Prevents
  // an admin tab on one order posting edits to a different order's item via
  // crafted IDs. AND clause + row existence check.
  const [row] = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)))
    .limit(1);
  if (!row) return { ok: false, error: "Line item not found on this order." };

  await db
    .update(orderItems)
    .set({ unitCost: valueToStore })
    .where(eq(orderItems.id, itemId));

  const summary = await recomputeOrderProfit(orderId);
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true, summary };
}

/**
 * Set the order-level extraCost + optional note.
 */
export async function updateOrderExtraCost(
  orderId: string,
  extraCostRaw: string | null,
  note: string | null,
): Promise<CostUpdateResult> {
  await requireAdmin();

  // Empty / null → persist 0.00 (NOT NULL column, default 0).
  let storedCost = "0.00";
  if (extraCostRaw != null && extraCostRaw.trim() !== "") {
    const trimmed = extraCostRaw.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
      return {
        ok: false,
        error: "Extra cost must be a non-negative MYR amount.",
      };
    }
    const n = parseFloat(trimmed);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "Extra cost must be ≥ 0." };
    }
    storedCost = n.toFixed(2);
  }

  // Cap note length to the VARCHAR(255) column.
  let storedNote: string | null = null;
  if (note != null) {
    const trimmed = note.trim();
    if (trimmed.length > 255) {
      return { ok: false, error: "Note too long (max 255 characters)." };
    }
    storedNote = trimmed.length === 0 ? null : trimmed;
  }

  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!row) return { ok: false, error: "Order not found." };

  await db
    .update(orders)
    .set({ extraCost: storedCost, extraCostNote: storedNote })
    .where(eq(orders.id, orderId));

  const summary = await recomputeOrderProfit(orderId);
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true, summary };
}
