"use server";

import { db } from "@/lib/db";
import { user, orders, addresses } from "@/lib/db/schema";
import { eq, desc, count, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { formatOrderNumber } from "@/lib/orders";

// ============================================================================
// CRM — admin-only customer detail actions.
//
// IMPORTANT (CVE-2025-29927): requireAdmin() is the FIRST await in every
// exported function before any DB access.
//
// IMPORTANT (MariaDB 10.11 / JSON-as-LONGTEXT):
// user.tags is declared json but stored as LONGTEXT. mysql2 does NOT
// auto-parse it, so we call ensureTagsArray() at every read site.
// ============================================================================

type LifecycleStage =
  | "lead"
  | "new"
  | "active"
  | "at_risk"
  | "dormant"
  | "vip";

/** Excluded statuses for revenue calculation (not real money) */
const EXCLUDED_STATUSES = ["cancelled", "awaiting_customer"] as const;

/**
 * Parse MariaDB JSON-as-LONGTEXT → string[]. Safe for null / already-array.
 */
function ensureTagsArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function computeLifecycle(
  orderCount: number,
  lifetimeSpend: number,
  lastOrderAt: Date | null,
): LifecycleStage {
  if (orderCount === 0) return "lead";

  const now = Date.now();
  const last = lastOrderAt ? lastOrderAt.getTime() : null;
  const daysSinceLast = last ? (now - last) / (1000 * 60 * 60 * 24) : Infinity;

  // vip supersedes active
  if (lifetimeSpend >= 500 && daysSinceLast <= 90) return "vip";
  if (daysSinceLast <= 90) return "active";
  if (daysSinceLast <= 180) return "at_risk";
  if (daysSinceLast > 180) return "dormant";

  // fallback: 1 order, lifetime ≤ RM 200
  if (orderCount === 1 && lifetimeSpend <= 200) return "new";
  return "active";
}

export type AdminUserDetail = {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  banReason: string | null;
  createdAt: Date;
  isSentinelEmail: boolean;
  pdpaConsentAt: Date | null;
  addresses: Array<{
    id: string;
    fullName: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postcode: string;
    country: string;
    isDefault: boolean;
    createdAt: Date;
  }>;
  stats: {
    orderCount: number;
    lifetimeSpend: number;
    avgOrderValue: number;
    firstOrderAt: Date | null;
    lastOrderAt: Date | null;
    lifecycleStage: LifecycleStage;
  };
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: string;
    currency: string;
    createdAt: Date;
    paypalCaptureId: string | null;
  }>;
  notes: string | null;
  tags: string[];
  phone: string | null;
};

/**
 * Full CRM detail for a single customer. Admin-only.
 *
 * Three SELECTs (manual hydration — MariaDB 10.11 has no LATERAL joins):
 *   1) user row by id
 *   2) addresses for user
 *   3) orders for user — stats aggregation + recent list built in memory
 */
export async function getAdminUserDetail(
  userId: string,
): Promise<AdminUserDetail | null> {
  await requireAdmin();

  if (typeof userId !== "string" || userId.length === 0) return null;

  const [u] = await db
    .select()
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!u) return null;

  // Fetch addresses (no LATERAL — separate SELECT)
  const userAddresses = await db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, userId))
    .orderBy(desc(addresses.isDefault), desc(addresses.updatedAt));

  // Fetch all orders for this user — we need totalAmount + dates for stats
  // as well as the 10 most recent for display.
  const userOrders = await db
    .select({
      id: orders.id,
      status: orders.status,
      totalAmount: orders.totalAmount,
      currency: orders.currency,
      createdAt: orders.createdAt,
      paypalCaptureId: orders.paypalCaptureId,
      shippingPhone: orders.shippingPhone,
      shippingName: orders.shippingName,
      shippingLine1: orders.shippingLine1,
      shippingLine2: orders.shippingLine2,
      shippingCity: orders.shippingCity,
      shippingState: orders.shippingState,
      shippingPostcode: orders.shippingPostcode,
      shippingCountry: orders.shippingCountry,
    })
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt));

  // Compute stats in memory
  const billable = userOrders.filter(
    (o) =>
      !(EXCLUDED_STATUSES as readonly string[]).includes(o.status),
  );
  const lifetimeSpend = billable.reduce(
    (acc, o) => acc + parseFloat(String(o.totalAmount)),
    0,
  );
  const orderCount = userOrders.length;
  const avgOrderValue = orderCount > 0 ? lifetimeSpend / billable.length || 0 : 0;
  const firstOrderAt =
    userOrders.length > 0
      ? new Date(userOrders[userOrders.length - 1].createdAt)
      : null;
  const lastOrderAt =
    userOrders.length > 0 ? new Date(userOrders[0].createdAt) : null;

  const lifecycleStage = computeLifecycle(orderCount, lifetimeSpend, lastOrderAt);

  const recentOrders = userOrders.slice(0, 10).map((o) => ({
    id: o.id,
    orderNumber: formatOrderNumber(o.id),
    status: o.status,
    totalAmount: String(o.totalAmount),
    currency: o.currency,
    createdAt: new Date(o.createdAt),
    paypalCaptureId: o.paypalCaptureId ?? null,
  }));

  // Phone from most recent order's shipping_phone
  const phone = userOrders.length > 0 ? (userOrders[0].shippingPhone ?? null) : null;

  // Address list: prefer the customer's saved address book. When empty (guest
  // / checkout-only customers never persist to the addresses table), fall back
  // to the shipping address they entered on their most recent order so the CRM
  // profile still shows where they are.
  let addressList = userAddresses.map((a) => ({
    id: a.id,
    fullName: a.fullName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2 ?? null,
    city: a.city,
    state: a.state,
    postcode: a.postcode,
    country: a.country,
    isDefault: a.isDefault,
    createdAt: a.createdAt,
  }));

  if (addressList.length === 0) {
    const latest = userOrders.find((o) => o.shippingLine1 && o.shippingLine1.trim());
    if (latest) {
      addressList = [
        {
          id: `order:${latest.id}`,
          fullName: latest.shippingName,
          phone: latest.shippingPhone ?? "",
          line1: latest.shippingLine1,
          line2: latest.shippingLine2 ?? null,
          city: latest.shippingCity,
          state: latest.shippingState,
          postcode: latest.shippingPostcode,
          country: latest.shippingCountry,
          isDefault: true,
          createdAt: new Date(latest.createdAt),
        },
      ];
    }
  }

  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    banned: !!u.banned,
    banReason: u.banReason ?? null,
    createdAt: u.createdAt,
    isSentinelEmail: u.email.endsWith("@3dninjaz.local"),
    pdpaConsentAt: u.pdpaConsentAt ?? null,
    addresses: addressList,
    stats: {
      orderCount,
      lifetimeSpend,
      avgOrderValue,
      firstOrderAt,
      lastOrderAt,
      lifecycleStage,
    },
    recentOrders,
    notes: u.notes ?? null,
    tags: ensureTagsArray(u.tags),
    phone: phone ?? null,
  };
}

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Write admin notes to a user. Cap at 5000 chars.
 */
export async function updateUserNotes(
  userId: string,
  notes: string | null,
): Promise<ActionResult> {
  await requireAdmin();

  if (typeof userId !== "string" || userId.length === 0) {
    return { ok: false, error: "Invalid user ID" };
  }
  if (notes !== null && notes.length > 5000) {
    return { ok: false, error: "Notes must be 5000 characters or fewer" };
  }

  const [target] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!target) return { ok: false, error: "User not found" };

  await db
    .update(user)
    .set({ notes: notes ?? null })
    .where(eq(user.id, userId));

  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}

/**
 * Write tags to a user. Normalises: trim, lowercase, dedupe, cap per-tag 32
 * chars, max 10 tags.
 */
export async function updateUserTags(
  userId: string,
  tags: string[],
): Promise<ActionResult> {
  await requireAdmin();

  if (typeof userId !== "string" || userId.length === 0) {
    return { ok: false, error: "Invalid user ID" };
  }
  if (!Array.isArray(tags)) {
    return { ok: false, error: "tags must be an array" };
  }

  const normalised = Array.from(
    new Set(
      tags
        .map((t) => t.trim().toLowerCase().slice(0, 32))
        .filter((t) => t.length > 0),
    ),
  ).slice(0, 10);

  const [target] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!target) return { ok: false, error: "User not found" };

  // JSON.stringify so MariaDB stores it as a valid JSON array in LONGTEXT
  await db
    .update(user)
    .set({ tags: normalised })
    .where(eq(user.id, userId));

  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}
