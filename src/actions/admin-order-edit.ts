"use server";

/**
 * Admin order editing — guarded edit server actions for UNPAID orders.
 *
 * Every exported action:
 *   1. await requireAdmin() — FIRST await (CVE-2025-29927 mitigation)
 *   2. Re-read the order from DB
 *   3. assertEditable(order) — throws if order is paid/locked
 *   4. Perform mutation
 *   5. recomputeOrderTotals(orderId) — server-authoritative recalc
 *   6. revalidatePath + return { ok: true }
 *
 * MariaDB 10.11:
 *   - App-generated UUIDs via randomUUID() on every INSERT into order_items.
 *   - No LATERAL joins — all reads use manual .select().from() + inArray().
 *   - JSON columns are LONGTEXT — not relevant here (no JSON columns written).
 *
 * Security:
 *   - Client-sent totals/prices are NEVER trusted. Prices are resolved
 *     server-side from the productVariants table.
 *   - removeLineItem is guarded by AND orderId = :orderId to prevent
 *     cross-order item removal.
 */

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { orders, orderItems, products, productVariants } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { assertEditable, assertCanAddItems } from "@/lib/order-editable";
import { refreshOrderShipping } from "@/actions/shipping";
import { MALAYSIAN_STATES } from "@/lib/validators";

type ActionResult = { ok: true } | { ok: false; error: string };

// ── Shared private recalc helper ───────────────────────────────────────────────
/**
 * Recompute subtotal from DB order_items, then either re-quote Delyva shipping
 * (when shippingServiceCode is set) or compute total locally.
 *
 * Approach (a): persist subtotal first → call refreshOrderShipping which reads
 * the freshly-stored subtotal and recomputes total = subtotal − discount +
 * shipping + extra (mirrors the live-quote path exactly, including markup +
 * free-shipping rules). If re-quote fails (courier no longer offered), fall
 * back to a local total calculation using the stored shippingCost.
 */
async function recomputeOrderTotals(orderId: string): Promise<void> {
  // 1. Sum all line totals from DB rows.
  const itemRows = await db
    .select({ lineTotal: orderItems.lineTotal })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const subtotal = itemRows.reduce(
    (sum, i) => sum + Number(i.lineTotal),
    0,
  );

  // 2. Read the order for shipping/discount/extra context.
  const [orderRow] = await db
    .select({
      shippingServiceCode: orders.shippingServiceCode,
      discountAmount: orders.discountAmount,
      shippingCost: orders.shippingCost,
      extraCost: orders.extraCost,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!orderRow) return; // should not happen — caller re-read it moments ago

  // 3. Persist new subtotal (refreshOrderShipping reads it from DB).
  await db
    .update(orders)
    .set({ subtotal: subtotal.toFixed(2) })
    .where(eq(orders.id, orderId));

  // 4. If a courier is selected, let refreshOrderShipping handle the full
  //    total recalc (it re-quotes Delyva, applies markup + free-ship rules,
  //    and persists shippingCost + totalAmount). refreshOrderShipping calls
  //    requireAdmin internally — that's an acceptable double-check per the
  //    plan reviewer's note (harmless).
  if (orderRow.shippingServiceCode) {
    const result = await refreshOrderShipping(orderId);
    if (result.ok) return; // total already updated by refreshOrderShipping
    // Fall through to local total calc if re-quote failed.
  }

  // 5. No courier selected OR re-quote failed — compute total locally.
  const discount = Number(orderRow.discountAmount ?? 0);
  const shipping = Number(orderRow.shippingCost ?? 0);
  const extra = Number(orderRow.extraCost ?? 0);
  const total = Math.max(0, Math.round((subtotal - discount + shipping + extra) * 100) / 100);

  await db
    .update(orders)
    .set({ totalAmount: total.toFixed(2) })
    .where(eq(orders.id, orderId));
}

// ── getOrderEditVariants ───────────────────────────────────────────────────────
/**
 * Fetch the active variants for a product for the order edit catalog picker.
 * Returns id, labelCache, price, salePrice, and inStock status.
 * Admin-only.
 */
export type OrderEditVariant = {
  id: string;
  label: string;
  price: string;
  inStock: boolean;
};

export async function getOrderEditVariants(
  productId: string,
): Promise<OrderEditVariant[]> {
  await requireAdmin();

  const rows = await db
    .select({
      id: productVariants.id,
      labelCache: productVariants.labelCache,
      price: productVariants.price,
      salePrice: productVariants.salePrice,
      saleFrom: productVariants.saleFrom,
      saleTo: productVariants.saleTo,
      inStock: productVariants.inStock,
    })
    .from(productVariants)
    .where(eq(productVariants.productId, productId));

  const now = new Date();
  return rows.map((v) => {
    const isOnSale =
      v.salePrice !== null &&
      (v.saleFrom === null || v.saleFrom <= now) &&
      (v.saleTo === null || v.saleTo >= now);
    const effectivePrice = isOnSale ? v.salePrice! : v.price;
    return {
      id: v.id,
      label: v.labelCache ?? v.id,
      price: effectivePrice,
      inStock: v.inStock,
    };
  });
}

// ── addCatalogLineItem ─────────────────────────────────────────────────────────
/**
 * Add an existing catalog product variant as a line item to an unpaid order.
 * Price is resolved SERVER-SIDE from productVariants (never trusted from client).
 */
export async function addCatalogLineItem(
  orderId: string,
  input: { productId: string; variantId: string; quantity: number },
): Promise<ActionResult> {
  await requireAdmin();

  // Re-read order and assert editability.
  const [orderRow] = await db
    .select({ id: orders.id, status: orders.status, paypalCaptureId: orders.paypalCaptureId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!orderRow) return { ok: false, error: "Order not found." };

  try {
    // Adds are allowed even on PAID orders (creates a balance due); only
    // shipped/delivered/cancelled block it.
    assertCanAddItems(orderRow);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  // Validate quantity.
  const qty = Math.floor(Number(input.quantity));
  if (!Number.isFinite(qty) || qty < 1) {
    return { ok: false, error: "Quantity must be a whole number ≥ 1." };
  }

  // Resolve variant — price is fetched server-side.
  const [variantRow] = await db
    .select({
      id: productVariants.id,
      price: productVariants.price,
      salePrice: productVariants.salePrice,
      saleFrom: productVariants.saleFrom,
      saleTo: productVariants.saleTo,
      costPrice: productVariants.costPrice,
      labelCache: productVariants.labelCache,
    })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.id, input.variantId),
        eq(productVariants.productId, input.productId),
      ),
    )
    .limit(1);

  if (!variantRow) {
    return {
      ok: false,
      error: `Variant not found for product ${input.productId}.`,
    };
  }

  const [productRow] = await db
    .select({
      name: products.name,
      slug: products.slug,
      images: products.images,
      thumbnailIndex: products.thumbnailIndex,
    })
    .from(products)
    .where(eq(products.id, input.productId))
    .limit(1);

  if (!productRow) {
    return { ok: false, error: `Product ${input.productId} not found.` };
  }

  // Effective price = salePrice when sale is active, else regular price.
  const now = new Date();
  const isOnSale =
    variantRow.salePrice !== null &&
    (variantRow.saleFrom === null || variantRow.saleFrom <= now) &&
    (variantRow.saleTo === null || variantRow.saleTo >= now);
  const unitPrice = isOnSale
    ? parseFloat(variantRow.salePrice!)
    : parseFloat(variantRow.price);

  // Pick product thumbnail image.
  let productImage: string | null = null;
  try {
    const rawImages =
      typeof productRow.images === "string"
        ? JSON.parse(productRow.images as string)
        : productRow.images;
    const arr = Array.isArray(rawImages) ? rawImages : [];
    const idx =
      typeof productRow.thumbnailIndex === "number" ? productRow.thumbnailIndex : 0;
    const entry = arr[idx] ?? arr[0];
    if (typeof entry === "string") productImage = entry;
    else if (entry && typeof entry === "object" && "url" in entry)
      productImage = (entry as { url: string }).url;
  } catch {
    productImage = null;
  }

  const lineTotal = (unitPrice * qty).toFixed(2);

  await db.insert(orderItems).values({
    id: randomUUID(),
    orderId,
    productId: input.productId,
    variantId: input.variantId,
    productName: productRow.name,
    productSlug: productRow.slug,
    productImage,
    size: null,
    variantLabel: variantRow.labelCache ?? null,
    configurationData: null,
    unitPrice: unitPrice.toFixed(2),
    unitCost: variantRow.costPrice ?? null,
    quantity: qty,
    lineTotal,
    productionDone: false,
    productionSort: null,
  });

  await recomputeOrderTotals(orderId);
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/admin/orders`);
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

// ── addManualLineItem ──────────────────────────────────────────────────────────
/**
 * Add a free-text manual line item (name + qty + price) to an unpaid order.
 * Uses the D-06 sentinel: productId="manual", variantId="manual".
 */
export async function addManualLineItem(
  orderId: string,
  input: { name: string; quantity: number; unitPrice: number | string },
): Promise<ActionResult> {
  await requireAdmin();

  const [orderRow] = await db
    .select({ id: orders.id, status: orders.status, paypalCaptureId: orders.paypalCaptureId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!orderRow) return { ok: false, error: "Order not found." };

  try {
    // Adds are allowed even on PAID orders (creates a balance due).
    assertCanAddItems(orderRow);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  // Validate name.
  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "Item name is required." };
  if (name.length > 200) return { ok: false, error: "Item name must be ≤ 200 characters." };

  // Validate quantity.
  const qty = Math.floor(Number(input.quantity));
  if (!Number.isFinite(qty) || qty < 1) {
    return { ok: false, error: "Quantity must be a whole number ≥ 1." };
  }

  // Validate unit price — must match /^\d+(\.\d{1,2})?$/ and be ≥ 0.
  const priceStr = String(input.unitPrice ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(priceStr)) {
    return { ok: false, error: "Unit price must be a valid amount (e.g. 10 or 10.50)." };
  }
  const unitPrice = parseFloat(priceStr);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return { ok: false, error: "Unit price must be 0 or greater." };
  }

  const lineTotal = (unitPrice * qty).toFixed(2);

  await db.insert(orderItems).values({
    id: randomUUID(),
    orderId,
    productId: "manual",
    variantId: "manual",
    productName: name,
    productSlug: "manual",
    productImage: null,
    size: null,
    variantLabel: null,
    configurationData: null,
    unitPrice: unitPrice.toFixed(2),
    unitCost: null,
    quantity: qty,
    lineTotal,
    productionDone: false,
    productionSort: null,
  });

  await recomputeOrderTotals(orderId);
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/admin/orders`);
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

// ── removeLineItem ─────────────────────────────────────────────────────────────
/**
 * Remove a line item from an unpaid order.
 * Guards ownership by including orderId in the WHERE clause (mirrors
 * updateOrderItemCost — prevents cross-order item removal via crafted itemId).
 */
export async function removeLineItem(
  orderId: string,
  itemId: string,
): Promise<ActionResult> {
  await requireAdmin();

  const [orderRow] = await db
    .select({ id: orders.id, status: orders.status, paypalCaptureId: orders.paypalCaptureId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!orderRow) return { ok: false, error: "Order not found." };

  try {
    assertEditable(orderRow);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  // Guard: only delete if the item belongs to this order.
  const existing = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(
      and(
        eq(orderItems.id, itemId),
        eq(orderItems.orderId, orderId),
      ),
    )
    .limit(1);

  if (existing.length === 0) {
    return { ok: false, error: "Line item not found on this order." };
  }

  await db
    .delete(orderItems)
    .where(
      and(
        eq(orderItems.id, itemId),
        eq(orderItems.orderId, orderId),
      ),
    );

  await recomputeOrderTotals(orderId);
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/admin/orders`);
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

// ── updateOrderCustomer ────────────────────────────────────────────────────────
/**
 * Update customer details (name, email, phone, full address) on an unpaid order.
 * After saving, re-quotes Delyva shipping since the destination may have changed.
 */
export async function updateOrderCustomer(
  orderId: string,
  input: {
    shippingName: string;
    customerEmail: string;
    shippingPhone: string;
    shippingLine1: string;
    shippingLine2?: string;
    shippingCity: string;
    shippingState: string;
    shippingPostcode: string;
  },
): Promise<ActionResult> {
  await requireAdmin();

  const [orderRow] = await db
    .select({
      id: orders.id,
      status: orders.status,
      paypalCaptureId: orders.paypalCaptureId,
      customerEmail: orders.customerEmail,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!orderRow) return { ok: false, error: "Order not found." };

  try {
    assertEditable(orderRow);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  // Validate and trim fields.
  const shippingName = (input.shippingName ?? "").trim();
  if (!shippingName) return { ok: false, error: "Recipient name is required." };

  const shippingPhone = (input.shippingPhone ?? "").trim();
  if (!shippingPhone) return { ok: false, error: "Phone is required." };

  const shippingLine1 = (input.shippingLine1 ?? "").trim();
  if (!shippingLine1) return { ok: false, error: "Address line 1 is required." };

  const shippingLine2 = (input.shippingLine2 ?? "").trim() || null;

  const shippingCity = (input.shippingCity ?? "").trim();
  if (!shippingCity) return { ok: false, error: "City is required." };

  const shippingState = (input.shippingState ?? "").trim();
  if (!shippingState) return { ok: false, error: "State is required." };
  if (!(MALAYSIAN_STATES as readonly string[]).includes(shippingState)) {
    return { ok: false, error: `"${shippingState}" is not a valid Malaysian state.` };
  }

  const shippingPostcode = (input.shippingPostcode ?? "").trim();
  if (!/^\d{5}$/.test(shippingPostcode)) {
    return { ok: false, error: "Postcode must be exactly 5 digits." };
  }

  // Email: if empty keep existing; if provided must be a valid email.
  let customerEmail = (input.customerEmail ?? "").trim();
  if (!customerEmail) {
    customerEmail = orderRow.customerEmail; // keep existing
  } else {
    // Basic email validation.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return { ok: false, error: "Customer email is not a valid email address." };
    }
  }

  await db
    .update(orders)
    .set({
      shippingName,
      customerEmail,
      shippingPhone,
      shippingLine1,
      shippingLine2,
      shippingCity,
      shippingState,
      shippingPostcode,
      shippingCountry: "Malaysia",
    })
    .where(eq(orders.id, orderId));

  // Address changed — re-quote shipping for the new destination.
  await recomputeOrderTotals(orderId);

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/admin/orders`);
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

// ── markBalancePaid ────────────────────────────────────────────────────────────
/**
 * Settle the outstanding balance on an order (2026-06-13). Sets amountPaid =
 * totalAmount — used after items were added to an already-paid order and the
 * customer has paid the difference. Admin-only; records nothing about HOW the
 * balance was paid (admin's judgement, like the manual "mark paid" flows).
 */
export async function markBalancePaid(orderId: string): Promise<ActionResult> {
  await requireAdmin();

  const [orderRow] = await db
    .select({ id: orders.id, totalAmount: orders.totalAmount })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!orderRow) return { ok: false, error: "Order not found." };

  await db
    .update(orders)
    .set({ amountPaid: orderRow.totalAmount })
    .where(eq(orders.id, orderId));

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/admin/orders`);
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}
