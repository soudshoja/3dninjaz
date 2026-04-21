"use server";

import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  orders,
  orderItems,
  orderShipments,
  shippingConfig,
  shippingServiceCatalog,
  products,
} from "@/lib/db/schema";
import { requireAdmin, getSessionUser } from "@/lib/auth-helpers";
import { delyvaApi, DelyvaError, parseQuoteServices } from "@/lib/delyva";
import type { InventoryItem, DelyvaContact, OrderDetails } from "@/lib/delyva";
import {
  buildTrackingView,
  type ShipmentTrackingView,
} from "@/lib/shipment-tracking";
import { DELYVA_EVENTS_TO_REGISTER } from "@/lib/delyva-events";
import {
  SHIPPING_CONFIG_ID,
  loadShippingConfig,
  rowToShippingConfig,
} from "@/lib/shipping-config";
import type { ShippingConfigRow as ShippingConfigRowType } from "@/lib/shipping-config";
import { sendOrderShippedEmail } from "@/actions/send-emails";
import { formatOrderNumber } from "@/lib/orders";

// ============================================================================
// Phase 9 (09-01) — admin-side shipping configuration + Delyva-backed order
// shipment booking. All mutating actions enforce requireAdmin() as the FIRST
// await (CVE-2025-29927).
//
// "use server" restrictions (Next.js 15): only async functions can be
// exported. Types and interfaces are fine (compiled away). Everything else
// (consts, helper factories) lives in src/lib/shipping-config.ts and
// src/lib/delyva-events.ts.
// ============================================================================

// --------------------------- Types (re-exported for callers) ---------------------------
export type ShippingConfigRow = ShippingConfigRowType;

export type UpdateShippingConfigInput = {
  originAddress1: string;
  originAddress2?: string;
  originCity: string;
  originState: string;
  originPostcode: string;
  originCountry?: string;
  originContactName: string;
  originContactEmail: string;
  originContactPhone: string;
  defaultItemType: "PARCEL" | "PACKAGE" | "BULKY";
  defaultWeightKg: string;
  markupPercent: string;
  markupFlat: string;
  freeShippingThreshold: string | null;
  enabledServices: string[];
};

export type ConnectionResult =
  | { ok: true; name: string; customerId: string; subscription: string | null }
  | { ok: false; error: string };

export type ShipmentRow = {
  id: string;
  orderId: string;
  delyvaOrderId: string | null;
  serviceCode: string | null;
  consignmentNo: string | null;
  trackingNo: string | null;
  statusCode: number | null;
  statusMessage: string | null;
  personnelName: string | null;
  personnelPhone: string | null;
  quotedPrice: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// --------------------------- Config surface ---------------------------

/**
 * Load the singleton shipping-config row (admin gate). Lazy-creates a
 * placeholder row if the Phase 9 migration was skipped (defense-in-depth).
 */
export async function getShippingConfig(): Promise<ShippingConfigRow> {
  await requireAdmin();
  const rows = await db
    .select()
    .from(shippingConfig)
    .where(eq(shippingConfig.id, SHIPPING_CONFIG_ID))
    .limit(1);
  if (rows.length > 0) return rowToShippingConfig(rows[0]);

  // Seed fallback — identical to the migration seed.
  await db.insert(shippingConfig).values({
    id: SHIPPING_CONFIG_ID,
    originAddress1: "Unit 3-01, Menara XYZ",
    originCity: "Kuala Lumpur",
    originState: "WP Kuala Lumpur",
    originPostcode: "50450",
    originCountry: "MY",
    originContactName: "3D Ninjaz Workshop",
    originContactEmail: "ops@3dninjaz.com",
    originContactPhone: "+60123456789",
  });
  const r = await db
    .select()
    .from(shippingConfig)
    .where(eq(shippingConfig.id, SHIPPING_CONFIG_ID))
    .limit(1);
  return rowToShippingConfig(r[0]);
}

export async function updateShippingConfig(
  input: UpdateShippingConfigInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  const required = [
    input.originAddress1,
    input.originCity,
    input.originState,
    input.originPostcode,
    input.originContactName,
    input.originContactEmail,
    input.originContactPhone,
    input.defaultWeightKg,
  ];
  if (required.some((v) => !v || !v.trim())) {
    return { ok: false, error: "Origin address and contact fields are required" };
  }

  const postcode = input.originPostcode.trim();
  if (!/^\d{5}$/.test(postcode)) {
    return { ok: false, error: "Postcode must be 5 digits" };
  }
  if (!/^\d+(\.\d{1,3})?$/.test(input.defaultWeightKg.trim())) {
    return { ok: false, error: "Default weight must be a positive decimal" };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(input.markupPercent.trim())) {
    return { ok: false, error: "Markup percent must be numeric" };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(input.markupFlat.trim())) {
    return { ok: false, error: "Markup flat must be numeric" };
  }
  if (
    input.freeShippingThreshold &&
    !/^\d+(\.\d{1,2})?$/.test(input.freeShippingThreshold.trim())
  ) {
    return { ok: false, error: "Free-shipping threshold must be numeric or empty" };
  }

  await db
    .update(shippingConfig)
    .set({
      originAddress1: input.originAddress1.trim(),
      originAddress2: input.originAddress2?.trim() || null,
      originCity: input.originCity.trim(),
      originState: input.originState.trim(),
      originPostcode: postcode,
      originCountry: (input.originCountry ?? "MY").trim().toUpperCase().slice(0, 2),
      originContactName: input.originContactName.trim(),
      originContactEmail: input.originContactEmail.trim(),
      originContactPhone: input.originContactPhone.trim(),
      defaultItemType: input.defaultItemType,
      defaultWeightKg: input.defaultWeightKg.trim(),
      markupPercent: input.markupPercent.trim(),
      markupFlat: input.markupFlat.trim(),
      freeShippingThreshold: input.freeShippingThreshold?.trim() || null,
      enabledServices: JSON.stringify(
        Array.from(
          new Set(
            (input.enabledServices ?? []).map((s) => s.trim()).filter(Boolean),
          ),
        ),
      ),
    })
    .where(eq(shippingConfig.id, SHIPPING_CONFIG_ID));

  revalidatePath("/admin/shipping");
  revalidatePath("/admin/shipping/delyva");
  return { ok: true };
}

// --------------------------- Delyva connection probes ---------------------------

export async function testDelyvaConnection(): Promise<ConnectionResult> {
  await requireAdmin();
  try {
    const u = await delyvaApi.getUser();
    return {
      ok: true,
      name: u.name ?? "(unnamed)",
      customerId: process.env.DELYVA_CUSTOMER_ID ?? "?",
      subscription: u.subscription ?? null,
    };
  } catch (e) {
    if (e instanceof DelyvaError)
      return { ok: false, error: `${e.code}: ${e.message}` };
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Normalized service row surfaced to admin / checkout UI. `serviceCode` is the
 * field that gets persisted to `order_shipments.service_code` and passed back
 * to POST /order when booking — it is the nested `service.code` from the
 * Delyva response (e.g. "SPXDMY-PN-BD1"), NOT the brand-level `companyCode`.
 */
export type NormalizedService = {
  serviceCode: string;
  serviceName: string;
  companyCode: string | null;
  companyName: string | null;
  companyLogo: string | null;
  price: { amount: number; currency: string };
  etaMin: number | null;
  etaMax: number | null;
  serviceType: string | null;
};

/**
 * Probe Delyva for available services by running a KL→PJ sample quote.
 *
 * Defensive parsing — see `parseQuoteServices()` in src/lib/delyva.ts. The
 * real response shape is `services[].service.{code,name,serviceCompany.*}`
 * (verified against api.delyva.app/v1.0 on 2026-04-20); an older assumption
 * that entries had a flat top-level `serviceCompany.companyCode` was wrong
 * and caused "Cannot read properties of undefined (reading 'companyCode')".
 */
export async function listDelyvaServices(): Promise<
  { ok: true; services: NormalizedService[] } | { ok: false; error: string }
> {
  await requireAdmin();
  const cfg = await loadShippingConfig();
  try {
    const q = await delyvaApi.quote({
      origin: {
        address1: cfg.originAddress1,
        address2: cfg.originAddress2 ?? undefined,
        city: cfg.originCity,
        state: cfg.originState,
        postcode: cfg.originPostcode,
        country: cfg.originCountry,
      },
      destination: {
        address1: "No. 88, Jalan SS2/55",
        city: "Petaling Jaya",
        state: "Selangor",
        postcode: "47300",
        country: "MY",
      },
      weight: { unit: "kg", value: 1 },
      itemType: cfg.defaultItemType,
    });
    const services = parseQuoteServices(q);
    return { ok: true, services };
  } catch (e) {
    if (e instanceof DelyvaError)
      return { ok: false, error: `${e.code}: ${e.message}` };
    return { ok: false, error: (e as Error).message };
  }
}

export async function registerWebhooks(): Promise<
  | { ok: true; registered: string[]; url: string }
  | { ok: false; error: string }
> {
  await requireAdmin();

  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.BETTER_AUTH_URL ??
    "";
  const url = `${base.replace(/\/$/, "")}/api/webhooks/delyva`;
  const secret = process.env.DELYVA_WEBHOOK_SHARED_SECRET;
  if (!secret) return { ok: false, error: "DELYVA_WEBHOOK_SHARED_SECRET missing" };
  if (!base) return { ok: false, error: "NEXT_PUBLIC_SITE_URL missing" };

  const registered: string[] = [];
  try {
    for (const event of DELYVA_EVENTS_TO_REGISTER) {
      await delyvaApi.subscribeWebhook(event, url, secret);
      registered.push(event);
    }
    return { ok: true, registered, url };
  } catch (e) {
    if (e instanceof DelyvaError)
      return {
        ok: false,
        error: `${e.code}: ${e.message} (subscribed so far: ${registered.join(", ") || "none"})`,
      };
    return { ok: false, error: (e as Error).message };
  }
}

// --------------------------- Per-order booking flow ---------------------------

export async function getOrderShipment(
  orderId: string,
): Promise<ShipmentRow | null> {
  await requireAdmin();
  const rows = await db
    .select()
    .from(orderShipments)
    .where(eq(orderShipments.orderId, orderId))
    .limit(1);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    orderId: r.orderId,
    delyvaOrderId: r.delyvaOrderId ?? null,
    serviceCode: r.serviceCode ?? null,
    consignmentNo: r.consignmentNo ?? null,
    trackingNo: r.trackingNo ?? null,
    statusCode: r.statusCode ?? null,
    statusMessage: r.statusMessage ?? null,
    personnelName: r.personnelName ?? null,
    personnelPhone: r.personnelPhone ?? null,
    quotedPrice: r.quotedPrice ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function quoteRatesForOrder(orderId: string): Promise<
  { ok: true; services: NormalizedService[] } | { ok: false; error: string }
> {
  await requireAdmin();
  const row = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (row.length === 0) return { ok: false, error: "Order not found" };
  const order = row[0];

  const cfg = await loadShippingConfig();
  const weight = await sumOrderWeight(orderId, Number(cfg.defaultWeightKg));

  try {
    const q = await delyvaApi.quote({
      origin: {
        address1: cfg.originAddress1,
        address2: cfg.originAddress2 ?? undefined,
        city: cfg.originCity,
        state: cfg.originState,
        postcode: cfg.originPostcode,
        country: cfg.originCountry,
      },
      destination: {
        address1: order.shippingLine1,
        address2: order.shippingLine2 ?? undefined,
        city: order.shippingCity,
        state: order.shippingState,
        postcode: order.shippingPostcode,
        country: "MY",
      },
      weight: { unit: "kg", value: Math.max(weight, Number(cfg.defaultWeightKg)) },
      itemType: cfg.defaultItemType,
    });
    const all = parseQuoteServices(q);
    // Allowlist matches either the bookable serviceCode (e.g. "SPXDMY-PN-BD1")
    // or the courier brand companyCode (e.g. "SPXDMY") — admin may have saved
    // either shape across the bug's lifetime, and matching both is harmless.
    const allow = new Set(cfg.enabledServices);
    const filtered =
      allow.size === 0
        ? all
        : all.filter(
            (s) =>
              allow.has(s.serviceCode) ||
              (s.companyCode !== null && allow.has(s.companyCode)),
          );
    return { ok: true, services: filtered };
  } catch (e) {
    if (e instanceof DelyvaError)
      return { ok: false, error: `${e.code}: ${e.message}` };
    return { ok: false, error: (e as Error).message };
  }
}

async function sumOrderWeight(
  orderId: string,
  fallbackKg: number,
): Promise<number> {
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  if (items.length === 0) return fallbackKg;

  // Product-weight lookup — multi-query hydration (MariaDB LATERAL quirk).
  const prodRows = await db
    .select({
      id: products.id,
      weight: products.shippingWeightKg,
    })
    .from(products);
  const weights = new Map<string, number>();
  for (const p of prodRows) {
    if (p.weight) weights.set(p.id, Number(p.weight));
  }

  let total = 0;
  for (const i of items) {
    const w = weights.get(i.productId) ?? fallbackKg;
    total += w * i.quantity;
  }
  return total;
}

/**
 * Book a Delyva courier for an already-paid order. Two-step flow:
 *   1. createDraft (process: false)
 *   2. process() to confirm dispatch
 *   3. getOrder() to pull consignmentNo + trackingNo
 */
export async function bookShipmentForOrder(
  orderId: string,
  serviceCode: string,
  opts?: { quotedPrice?: string | null },
): Promise<
  | {
      ok: true;
      shipmentId: string;
      delyvaOrderId: string;
      consignmentNo: string | null;
    }
  | { ok: false; error: string }
> {
  await requireAdmin();

  if (!serviceCode) return { ok: false, error: "serviceCode required" };

  // Idempotency — reject if a shipment already exists for this order.
  const existing = await db
    .select({ id: orderShipments.id, delyvaOrderId: orderShipments.delyvaOrderId })
    .from(orderShipments)
    .where(eq(orderShipments.orderId, orderId))
    .limit(1);
  if (existing.length > 0) {
    return {
      ok: false,
      error: `Shipment already booked (delyvaOrderId=${existing[0].delyvaOrderId ?? "pending"})`,
    };
  }

  const orderRow = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (orderRow.length === 0) return { ok: false, error: "Order not found" };
  const order = orderRow[0];

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const cfg = await loadShippingConfig();

  const prodRows = items.length ? await db.select().from(products) : [];
  const prodById = new Map<string, typeof products.$inferSelect>(
    prodRows.map((p) => [p.id, p]),
  );

  const fallbackWeight = Number(cfg.defaultWeightKg);
  const inventory: InventoryItem[] = items.map((i) => {
    const p = prodById.get(i.productId);
    const weight = p?.shippingWeightKg
      ? Number(p.shippingWeightKg)
      : fallbackWeight;
    const dim =
      p?.shippingLengthCm && p?.shippingWidthCm && p?.shippingHeightCm
        ? {
            length: p.shippingLengthCm,
            width: p.shippingWidthCm,
            height: p.shippingHeightCm,
          }
        : { length: 20, width: 20, height: 20 };
    return {
      name: i.productName,
      type: cfg.defaultItemType,
      price: { currency: "MYR", amount: Number(i.unitPrice) },
      weight: { unit: "kg", value: weight },
      dimension: dim,
      quantity: i.quantity,
    };
  });

  const pickupAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const deliveryAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

  const originContact: DelyvaContact = {
    name: cfg.originContactName,
    email: cfg.originContactEmail,
    phone: cfg.originContactPhone,
    address1: cfg.originAddress1,
    address2: cfg.originAddress2 ?? undefined,
    city: cfg.originCity,
    state: cfg.originState,
    postcode: cfg.originPostcode,
    country: cfg.originCountry,
  };
  const destContact: DelyvaContact = {
    name: order.shippingName,
    email: order.customerEmail,
    phone: order.shippingPhone,
    address1: order.shippingLine1,
    address2: order.shippingLine2 ?? undefined,
    city: order.shippingCity,
    state: order.shippingState,
    postcode: order.shippingPostcode,
    country: "MY",
  };

  try {
    const draft = await delyvaApi.createDraft({
      serviceCode,
      source: "3d-ninjaz-web",
      extId: order.id,
      referenceNo: order.id.slice(0, 8).toUpperCase(),
      origin: { scheduledAt: pickupAt, inventory, contact: originContact },
      destination: { scheduledAt: deliveryAt, contact: destContact },
    });

    await delyvaApi.process(draft.id, {
      serviceCode,
      originScheduledAt: pickupAt,
      destinationScheduledAt: deliveryAt,
    });

    let details = null as Awaited<ReturnType<typeof delyvaApi.getOrder>> | null;
    try {
      details = await delyvaApi.getOrder(draft.id);
    } catch (e) {
      console.warn("getOrder after process failed", (e as Error).message);
    }

    const shipmentId = randomUUID();
    await db.insert(orderShipments).values({
      id: shipmentId,
      orderId: order.id,
      delyvaOrderId: String(draft.id),
      serviceCode,
      consignmentNo: details?.consignmentNo ?? null,
      trackingNo: details?.trackingNo ?? null,
      statusCode: details?.statusCode ?? null,
      statusMessage: details?.statusMessage ?? null,
      personnelName: details?.personnel?.name ?? null,
      personnelPhone: details?.personnel?.phone ?? null,
      quotedPrice: opts?.quotedPrice ?? null,
      serviceSnapshot: JSON.stringify({
        serviceCode,
        bookedAt: new Date().toISOString(),
      }),
    });

    revalidatePath(`/admin/orders/${orderId}`);

    // Send order shipped notification email (fire-and-forget).
    const courierName = order.shippingServiceName || "Your courier";
    void sendOrderShippedEmail({
      customerEmail: order.customerEmail,
      customerName: order.shippingName,
      orderNumber: formatOrderNumber(order.id),
      courierName,
      trackingNo: details?.trackingNo || "pending",
      consignmentNo: details?.consignmentNo || "pending",
      orderId: order.id,
    }).catch((err) =>
      console.error("[bookShipment] shipped email failed:", err)
    );

    return {
      ok: true,
      shipmentId,
      delyvaOrderId: String(draft.id),
      consignmentNo: details?.consignmentNo ?? null,
    };
  } catch (e) {
    if (e instanceof DelyvaError)
      return { ok: false, error: `${e.code}: ${e.message}` };
    return { ok: false, error: (e as Error).message };
  }
}

export async function cancelShipment(
  orderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const s = await db
    .select()
    .from(orderShipments)
    .where(eq(orderShipments.orderId, orderId))
    .limit(1);
  if (s.length === 0 || !s[0].delyvaOrderId) {
    return { ok: false, error: "No shipment to cancel" };
  }
  try {
    const res = await delyvaApi.cancel(s[0].delyvaOrderId);
    await db
      .update(orderShipments)
      .set({
        statusCode: res.statusCode,
        statusMessage: res.message ?? "Cancelled",
      })
      .where(eq(orderShipments.orderId, orderId));
    revalidatePath(`/admin/orders/${orderId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof DelyvaError)
      return { ok: false, error: `${e.code}: ${e.message}` };
    return { ok: false, error: (e as Error).message };
  }
}

// --------------------------- Tracking view (customer + admin) ---------------------------

/**
 * Internal helper — given a loaded shipment mirror row, pull the latest live
 * tracking from Delyva (5-second cap), fall back to the mirror row on timeout
 * or failure, and best-effort update the mirror with the freshest fields.
 *
 * Used by both `getMyOrderTracking` and `getAdminOrderTracking`. It does NOT
 * enforce any authorization — the callers are responsible for that.
 */
async function hydrateTrackingView(
  shipment: ShipmentRow | null,
): Promise<ShipmentTrackingView> {
  if (!shipment || !shipment.delyvaOrderId) {
    return buildTrackingView({ shipment, live: null, cachedNote: null });
  }

  let live: OrderDetails | null = null;
  let cachedNote: string | null = null;

  try {
    live = await delyvaApi.getOrderFast(shipment.delyvaOrderId, 5000);
  } catch (e) {
    if (e instanceof DelyvaError && e.code === "TIMEOUT") {
      cachedNote = "Showing last-known status — live tracking is slow right now.";
    } else {
      cachedNote = "Showing last-known status — live tracking is unavailable.";
    }
  }

  // Best-effort mirror update for next-time cached read. Wrapped separately so
  // a DB write failure does not break the render.
  if (live) {
    try {
      await db
        .update(orderShipments)
        .set({
          consignmentNo: live.consignmentNo ?? shipment.consignmentNo,
          trackingNo: live.trackingNo ?? shipment.trackingNo,
          statusCode: live.statusCode ?? shipment.statusCode,
          statusMessage: live.statusMessage ?? shipment.statusMessage,
          personnelName: live.personnel?.name ?? shipment.personnelName,
          personnelPhone: live.personnel?.phone ?? shipment.personnelPhone,
          lastTrackingEventAt: new Date(),
        })
        .where(eq(orderShipments.orderId, shipment.orderId));
    } catch (e) {
      console.warn(
        "hydrateTrackingView: mirror update failed",
        (e as Error).message,
      );
    }
  }

  return buildTrackingView({ shipment, live, cachedNote });
}

/**
 * Customer-facing tracking fetch. Enforces ownership as the FIRST await
 * (CVE-2025-29927 — middleware alone is bypassable). Returns an empty-shape
 * view when the caller is the owner but no shipment has been booked yet, so
 * the UI can render a friendly "preparing" state instead of a 404.
 *
 * Returns `null` when the viewer does not own the order (same shape as a
 * missing order — blocks enumeration).
 */
export async function getMyOrderTracking(
  orderId: string,
): Promise<ShipmentTrackingView | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (typeof orderId !== "string" || orderId.length === 0) return null;

  const orderRows = await db
    .select({ id: orders.id, userId: orders.userId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (orderRows.length === 0) return null;
  const order = orderRows[0];
  const userWithRole = user as unknown as { id: string; role: string };
  if (order.userId !== userWithRole.id && userWithRole.role !== "admin") {
    // Same null shape for "not found" and "not yours" — blocks enumeration.
    return null;
  }

  const shipRows = await db
    .select()
    .from(orderShipments)
    .where(eq(orderShipments.orderId, orderId))
    .limit(1);
  const shipment: ShipmentRow | null =
    shipRows.length === 0
      ? null
      : {
          id: shipRows[0].id,
          orderId: shipRows[0].orderId,
          delyvaOrderId: shipRows[0].delyvaOrderId ?? null,
          serviceCode: shipRows[0].serviceCode ?? null,
          consignmentNo: shipRows[0].consignmentNo ?? null,
          trackingNo: shipRows[0].trackingNo ?? null,
          statusCode: shipRows[0].statusCode ?? null,
          statusMessage: shipRows[0].statusMessage ?? null,
          personnelName: shipRows[0].personnelName ?? null,
          personnelPhone: shipRows[0].personnelPhone ?? null,
          quotedPrice: shipRows[0].quotedPrice ?? null,
          createdAt: shipRows[0].createdAt,
          updatedAt: shipRows[0].updatedAt,
        };

  return hydrateTrackingView(shipment);
}

/**
 * Admin-facing tracking fetch. Admin gate is the FIRST await. Always returns
 * a view (including empty-shape for orders with no shipment booked).
 */
export async function getAdminOrderTracking(
  orderId: string,
): Promise<ShipmentTrackingView> {
  await requireAdmin();
  const rows = await db
    .select()
    .from(orderShipments)
    .where(eq(orderShipments.orderId, orderId))
    .limit(1);
  const shipment: ShipmentRow | null =
    rows.length === 0
      ? null
      : {
          id: rows[0].id,
          orderId: rows[0].orderId,
          delyvaOrderId: rows[0].delyvaOrderId ?? null,
          serviceCode: rows[0].serviceCode ?? null,
          consignmentNo: rows[0].consignmentNo ?? null,
          trackingNo: rows[0].trackingNo ?? null,
          statusCode: rows[0].statusCode ?? null,
          statusMessage: rows[0].statusMessage ?? null,
          personnelName: rows[0].personnelName ?? null,
          personnelPhone: rows[0].personnelPhone ?? null,
          quotedPrice: rows[0].quotedPrice ?? null,
          createdAt: rows[0].createdAt,
          updatedAt: rows[0].updatedAt,
        };
  return hydrateTrackingView(shipment);
}

export async function refreshShipmentStatus(
  orderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const s = await db
    .select()
    .from(orderShipments)
    .where(eq(orderShipments.orderId, orderId))
    .limit(1);
  if (s.length === 0 || !s[0].delyvaOrderId) {
    return { ok: false, error: "No shipment to refresh" };
  }
  try {
    const details = await delyvaApi.getOrder(s[0].delyvaOrderId);
    await db
      .update(orderShipments)
      .set({
        consignmentNo: details.consignmentNo ?? s[0].consignmentNo,
        trackingNo: details.trackingNo ?? s[0].trackingNo,
        statusCode: details.statusCode ?? s[0].statusCode,
        statusMessage: details.statusMessage ?? s[0].statusMessage,
        personnelName: details.personnel?.name ?? s[0].personnelName,
        personnelPhone: details.personnel?.phone ?? s[0].personnelPhone,
        lastTrackingEventAt: new Date(),
      })
      .where(eq(orderShipments.orderId, orderId));
    revalidatePath(`/admin/orders/${orderId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof DelyvaError)
      return { ok: false, error: `${e.code}: ${e.message}` };
    return { ok: false, error: (e as Error).message };
  }
}

// ============================================================================
// Phase 15 — Service catalog (multi-corridor probe + admin toggle)
// ============================================================================

export type ServiceCatalogRow = {
  id: string;
  serviceCode: string;
  companyCode: string;
  companyName: string;
  serviceName: string | null;
  serviceType: string | null;
  samplePrice: string | null;
  etaMinMinutes: number | null;
  etaMaxMinutes: number | null;
  isEnabled: boolean;
  lastSeenAt: Date;
};

export type RefreshCatalogResult =
  | {
      ok: true;
      totalProbed: number;
      uniqueServices: number;
      newlyAdded: number;
    }
  | { ok: false; error: string };

/**
 * Multi-corridor Delyva probe — discovers the union of all courier services
 * across 5 representative MY destinations. Results are upserted into
 * shipping_service_catalog, preserving any existing is_enabled values.
 * requireAdmin() is the first await (CVE-2025-29927).
 */
export async function refreshServiceCatalog(): Promise<RefreshCatalogResult> {
  await requireAdmin();

  const cfg = await loadShippingConfig();

  // Probe corridors: **from the origin (KL) to key destinations across MY**.
  // This discovers which courier services are available for shipments from
  // the origin to each region (not intra-city services within each destination).
  // Fewer services may be available to remote regions (e.g., Sabah/Sarawak) —
  // the catalog reflects the realistic set of nationwide options.
  const PROBES = [
    {
      name: "KL→KL (local)",
      destination: {
        address1: "",
        city: "Kuala Lumpur",
        state: "WP Kuala Lumpur",
        postcode: "50450",
        country: "MY",
      },
    },
    {
      name: "KL→Penang",
      destination: {
        address1: "",
        city: "George Town",
        state: "Pulau Pinang",
        postcode: "10200",
        country: "MY",
      },
    },
    {
      name: "KL→JB",
      destination: {
        address1: "",
        city: "Johor Bahru",
        state: "Johor",
        postcode: "80100",
        country: "MY",
      },
    },
    {
      name: "KL→KK",
      destination: {
        address1: "",
        city: "Kota Kinabalu",
        state: "Sabah",
        postcode: "88000",
        country: "MY",
      },
    },
    {
      name: "KL→Kuching",
      destination: {
        address1: "",
        city: "Kuching",
        state: "Sarawak",
        postcode: "93000",
        country: "MY",
      },
    },
  ] as const;

  const origin = {
    address1: cfg.originAddress1,
    address2: cfg.originAddress2 ?? undefined,
    city: cfg.originCity,
    state: cfg.originState,
    postcode: cfg.originPostcode,
    country: cfg.originCountry,
  };

  // Collect unique services across all probe corridors.
  // Key = serviceCode; value = last-seen NormalizedService entry.
  const seen = new Map<string, NormalizedService>();
  let totalProbed = 0;

  for (const probe of PROBES) {
    try {
      const q = await delyvaApi.quote({
        origin,
        destination: probe.destination,
        weight: { unit: "kg", value: 1 },
        itemType: cfg.defaultItemType,
      });
      const services = parseQuoteServices(q);
      console.log(
        `[refreshServiceCatalog] probe ${probe.name}: found ${services.length} service(s)`,
      );
      totalProbed += services.length;
      for (const svc of services) {
        if (!seen.has(svc.serviceCode)) {
          console.log(
            `[refreshServiceCatalog] adding service: ${svc.serviceCode} (${svc.serviceName} by ${svc.companyCode})`,
          );
          seen.set(svc.serviceCode, svc);
        }
      }
    } catch (e) {
      // A single corridor failure (e.g. no service to Sabah) should not abort
      // the whole refresh. Log and continue.
      console.warn(
        `[refreshServiceCatalog] probe ${probe.name} failed:`,
        (e as Error).message,
      );
    }
  }

  if (seen.size === 0) {
    return {
      ok: false,
      error:
        "All corridor probes failed — check DELYVA_API_KEY and origin address",
    };
  }

  // Load existing catalog rows to determine which are new and to preserve
  // is_enabled. We compare by serviceCode (the UNIQUE key).
  const existingRows = await db
    .select({ serviceCode: shippingServiceCatalog.serviceCode })
    .from(shippingServiceCatalog);
  const existingCodes = new Set(existingRows.map((r) => r.serviceCode));

  const now = new Date();
  let newlyAdded = 0;

  // Wrap upsert operations in a transaction for consistency.
  await db.transaction(async (tx) => {
    for (const [serviceCode, svc] of seen.entries()) {
      try {
        if (existingCodes.has(serviceCode)) {
          // UPDATE — refresh probe data but DO NOT touch is_enabled.
          await tx
            .update(shippingServiceCatalog)
            .set({
              companyCode: svc.companyCode ?? "",
              companyName: svc.companyName ?? "",
              serviceName: svc.serviceName ?? null,
              serviceType: svc.serviceType ?? null,
              samplePrice: svc.price.amount.toFixed(2),
              etaMinMinutes: svc.etaMin ?? null,
              etaMaxMinutes: svc.etaMax ?? null,
              lastSeenAt: now,
            })
            .where(eq(shippingServiceCatalog.serviceCode, serviceCode));
          console.log(`[refreshServiceCatalog] updated service ${serviceCode}`);
        } else {
          // INSERT — new service, default is_enabled = true.
          await tx.insert(shippingServiceCatalog).values({
            id: randomUUID(),
            serviceCode,
            companyCode: svc.companyCode ?? "",
            companyName: svc.companyName ?? "",
            serviceName: svc.serviceName ?? null,
            serviceType: svc.serviceType ?? null,
            samplePrice: svc.price.amount.toFixed(2),
            etaMinMinutes: svc.etaMin ?? null,
            etaMaxMinutes: svc.etaMax ?? null,
            isEnabled: true,
            lastSeenAt: now,
          });
          console.log(`[refreshServiceCatalog] inserted service ${serviceCode}`);
          newlyAdded++;
        }
      } catch (e) {
        console.error(
          `[refreshServiceCatalog] error upserting ${serviceCode}:`,
          (e as Error).message,
        );
        throw e;
      }
    }
  });

  revalidatePath("/admin/shipping/delyva");
  return {
    ok: true,
    totalProbed,
    uniqueServices: seen.size,
    newlyAdded,
  };
}

/**
 * Return all catalog rows sorted by company_name then service_code.
 * requireAdmin() is first await.
 */
export async function getServiceCatalog(): Promise<ServiceCatalogRow[]> {
  await requireAdmin();
  const rows = await db
    .select()
    .from(shippingServiceCatalog)
    .orderBy(
      shippingServiceCatalog.companyName,
      shippingServiceCatalog.serviceCode,
    );
  return rows.map((r) => ({
    id: r.id,
    serviceCode: r.serviceCode,
    companyCode: r.companyCode,
    companyName: r.companyName,
    serviceName: r.serviceName ?? null,
    serviceType: r.serviceType ?? null,
    samplePrice: r.samplePrice ?? null,
    etaMinMinutes: r.etaMinMinutes ?? null,
    etaMaxMinutes: r.etaMaxMinutes ?? null,
    isEnabled: Boolean(r.isEnabled),
    lastSeenAt: r.lastSeenAt,
  }));
}

/**
 * Toggle a single service tier on/off.
 * requireAdmin() is first await.
 */
export async function updateServiceEnabled(
  serviceCode: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  if (!serviceCode?.trim()) return { ok: false, error: "serviceCode required" };
  await db
    .update(shippingServiceCatalog)
    .set({ isEnabled: enabled })
    .where(eq(shippingServiceCatalog.serviceCode, serviceCode));
  revalidatePath("/admin/shipping/delyva");
  return { ok: true };
}

/**
 * Bulk toggle all rate tiers under a courier brand.
 * requireAdmin() is first await.
 */
export async function updateCompanyEnabled(
  companyCode: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  if (!companyCode?.trim()) return { ok: false, error: "companyCode required" };
  await db
    .update(shippingServiceCatalog)
    .set({ isEnabled: enabled })
    .where(eq(shippingServiceCatalog.companyCode, companyCode));
  revalidatePath("/admin/shipping/delyva");
  return { ok: true };
}

/**
 * Batch persist is_enabled changes for multiple service codes at once.
 * Accepts a map of { [serviceCode]: enabled }. requireAdmin() is first await.
 */
export async function batchUpdateServiceEnabled(
  changes: Record<string, boolean>,
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  await requireAdmin();
  const entries = Object.entries(changes);
  if (entries.length === 0) return { ok: true, updated: 0 };

  // Split into enable / disable batches and do two bulk UPDATEs.
  const toEnable = entries
    .filter(([, v]) => v)
    .map(([k]) => k);
  const toDisable = entries
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (toEnable.length > 0) {
    await db
      .update(shippingServiceCatalog)
      .set({ isEnabled: true })
      .where(inArray(shippingServiceCatalog.serviceCode, toEnable));
  }
  if (toDisable.length > 0) {
    await db
      .update(shippingServiceCatalog)
      .set({ isEnabled: false })
      .where(inArray(shippingServiceCatalog.serviceCode, toDisable));
  }

  revalidatePath("/admin/shipping/delyva");
  return { ok: true, updated: entries.length };
}
