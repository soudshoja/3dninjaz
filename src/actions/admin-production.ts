"use server";

import { db } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { formatOrderNumber, isManualLine } from "@/lib/orders";
import { ensureOrderItemConfigData } from "@/lib/config-fields";

// ============================================================================
// Production board — admin fulfilment queue.
//
// Paid + processing orders flow in automatically. Each line item carries a
// `productionDone` tick; when every item of an order is ticked the order falls
// into the Processed tab. The line-wise queue is sortable (productionSort).
//
// SECURITY: every exported function calls `await requireAdmin()` FIRST
// (CVE-2025-29927 — middleware is not a boundary).
// MariaDB 10.11: no LATERAL — manual select + inArray hydration.
// ============================================================================

/** Statuses that put an order on the production floor. */
const PRODUCTION_STATUSES = ["paid", "processing"] as const;

export type ProductionItem = {
  id: string;
  name: string;
  quantity: number;
  done: boolean;
  sort: number | null;
};

export type ProductionOrder = {
  id: string;
  invoiceNumber: string;
  clientName: string;
  createdAt: string; // ISO
  items: ProductionItem[];
  doneCount: number;
  totalCount: number;
};

export type ProductionLineItem = {
  id: string;
  name: string;
  quantity: number;
  orderId: string;
  invoiceNumber: string;
  clientName: string;
};

export type ProductionBoard = {
  production: ProductionOrder[];
  processed: ProductionOrder[];
  lineItems: ProductionLineItem[];
};

/** Human-readable line name — mirrors the invoice/PDP display logic. */
function itemName(item: typeof orderItems.$inferSelect): string {
  if (isManualLine(item)) return item.productName;
  const cfg = ensureOrderItemConfigData(item.configurationData);
  const variant =
    cfg?.computedSummary ??
    item.variantLabel ??
    (item.size ? `Size ${item.size}` : null);
  return variant ? `${item.productName} (${variant})` : item.productName;
}

/**
 * Load the full production board: in-production orders (≥1 unmade item),
 * processed orders (all made), and the flattened sortable line queue.
 */
export async function getProductionBoard(): Promise<ProductionBoard> {
  await requireAdmin();

  const orderRows = await db
    .select({
      id: orders.id,
      shippingName: orders.shippingName,
      status: orders.status,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(inArray(orders.status, [...PRODUCTION_STATUSES]))
    .orderBy(asc(orders.createdAt));

  if (orderRows.length === 0) {
    return { production: [], processed: [], lineItems: [] };
  }

  const ids = orderRows.map((o) => o.id);
  const items = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, ids));

  // Group items by order, preserving a stable per-order order (id asc).
  const itemsByOrder = new Map<string, (typeof items)[number][]>();
  for (const it of items) {
    const list = itemsByOrder.get(it.orderId) ?? [];
    list.push(it);
    itemsByOrder.set(it.orderId, list);
  }

  const production: ProductionOrder[] = [];
  const processed: ProductionOrder[] = [];

  for (const o of orderRows) {
    const its = (itemsByOrder.get(o.id) ?? []).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    if (its.length === 0) continue; // nothing to make
    const mapped: ProductionItem[] = its.map((it) => ({
      id: it.id,
      name: itemName(it),
      quantity: it.quantity,
      done: it.productionDone,
      sort: it.productionSort,
    }));
    const doneCount = mapped.filter((m) => m.done).length;
    const card: ProductionOrder = {
      id: o.id,
      invoiceNumber: formatOrderNumber(o.id),
      clientName: o.shippingName,
      createdAt: (o.createdAt instanceof Date
        ? o.createdAt
        : new Date(o.createdAt)
      ).toISOString(),
      items: mapped,
      doneCount,
      totalCount: mapped.length,
    };
    if (doneCount === mapped.length) processed.push(card);
    else production.push(card);
  }

  // Flatten unmade items into the sortable line queue. Sort by productionSort
  // (nulls last), then by the parent order's createdAt for a stable default.
  const orderCreatedAt = new Map(
    orderRows.map((o) => [
      o.id,
      (o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt)).getTime(),
    ]),
  );
  const lineItems: ProductionLineItem[] = items
    .filter((it) => !it.productionDone)
    .map((it) => {
      const card =
        production.find((p) => p.id === it.orderId) ??
        processed.find((p) => p.id === it.orderId);
      return {
        it,
        name: itemName(it),
        clientName: card?.clientName ?? "",
        invoiceNumber: card?.invoiceNumber ?? formatOrderNumber(it.orderId),
      };
    })
    .sort((a, b) => {
      const sa = a.it.productionSort;
      const sb = b.it.productionSort;
      if (sa != null && sb != null) return sa - sb;
      if (sa != null) return -1;
      if (sb != null) return 1;
      return (
        (orderCreatedAt.get(a.it.orderId) ?? 0) -
        (orderCreatedAt.get(b.it.orderId) ?? 0)
      );
    })
    .map(({ it, name, clientName, invoiceNumber }) => ({
      id: it.id,
      name,
      quantity: it.quantity,
      orderId: it.orderId,
      invoiceNumber,
      clientName,
    }));

  return { production, processed, lineItems };
}

/** Tick / untick a single line item as made. */
export async function toggleProductionItemDone(
  orderItemId: string,
  done: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (typeof orderItemId !== "string" || orderItemId.length === 0) {
    return { ok: false, error: "Invalid item." };
  }
  try {
    await db
      .update(orderItems)
      .set({ productionDone: done })
      .where(eq(orderItems.id, orderItemId));
    revalidatePath("/admin/production");
    return { ok: true };
  } catch (err) {
    console.error("[production] toggle failed", orderItemId, err);
    return { ok: false, error: "Could not update the item." };
  }
}

/** Mark every line of an order as made (or unmade) in one go. */
export async function setOrderProductionDone(
  orderId: string,
  done: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (typeof orderId !== "string" || orderId.length === 0) {
    return { ok: false, error: "Invalid order." };
  }
  try {
    await db
      .update(orderItems)
      .set({ productionDone: done })
      .where(eq(orderItems.orderId, orderId));
    revalidatePath("/admin/production");
    return { ok: true };
  } catch (err) {
    console.error("[production] bulk toggle failed", orderId, err);
    return { ok: false, error: "Could not update the order." };
  }
}

/**
 * Persist the admin's line-wise production order. `orderedIds` is the full
 * visible queue top-to-bottom; each item's productionSort is set to its index.
 */
export async function reorderProductionLineItems(
  orderedIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: true };
  }
  // Guard: only touch ids that are real, unmade line items.
  const valid = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(
      and(
        inArray(orderItems.id, orderedIds),
        eq(orderItems.productionDone, false),
      ),
    );
  const validIds = new Set(valid.map((v) => v.id));
  try {
    let sort = 0;
    for (const id of orderedIds) {
      if (!validIds.has(id)) continue;
      await db
        .update(orderItems)
        .set({ productionSort: sort })
        .where(eq(orderItems.id, id));
      sort += 1;
    }
    revalidatePath("/admin/production");
    return { ok: true };
  } catch (err) {
    console.error("[production] reorder failed", err);
    return { ok: false, error: "Could not save the new order." };
  }
}
