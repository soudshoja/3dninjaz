"use server";

import { db } from "@/lib/db";
import { orders, paymentLinks, user as userTable } from "@/lib/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { randomUUID, randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/auth-helpers";
import { manualOrderSchema, type ManualOrderInput } from "@/lib/validators";
import { revalidatePath } from "next/cache";

/**
 * Phase 7 (07-03) — manual orders + payment links server actions.
 *
 * Admin books a one-off custom order from /admin/orders/new. We snapshot the
 * customer name/email/phone on the orders row regardless of whether the email
 * resolves to an existing user (PDPA — survives user deletion). Manual orders
 * do not insert order_items; the line item lives in
 * orders.customItemName/Description/Images.
 *
 * Payment links are tokenised: 192-bit entropy via crypto.randomBytes(24),
 * 30-day expiry. URL contains ONLY the token (T-07-X-PII-on-payment-link).
 *
 * Every export awaits `requireAdmin()` first (CVE-2025-29927 mitigation).
 */

const PAYMENT_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PUBLIC_LINK_BASE =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.3dninjaz.com";
const SENTINEL_EMAIL_DOMAIN = "@3dninjaz.local";

export type CreateManualOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string };

export async function createManualOrder(
  input: ManualOrderInput,
): Promise<CreateManualOrderResult> {
  const session = await requireAdmin();

  const parsed = manualOrderSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input",
    };
  }
  const data = parsed.data;

  // Resolve to existing user by email when possible (better customer dashboard
  // experience if the customer ever logs in). We always snapshot
  // customerEmail/Name/Phone on the orders row regardless of match — PDPA.
  let userId = session.user.id; // admin owns the order book by default
  if (data.customerEmail) {
    const matched = await db.query.user.findFirst({
      where: eq(userTable.email, data.customerEmail),
      columns: { id: true },
    });
    if (matched) userId = matched.id;
  }

  const orderId = randomUUID();
  const amountStr = data.amount.toFixed(2);
  // Sentinel email when admin doesn't supply one — prevents NULL constraint
  // violation and signals "no customer email" to /admin/orders rendering.
  const customerEmail =
    data.customerEmail && data.customerEmail.length > 0
      ? data.customerEmail
      : `manual+${orderId}${SENTINEL_EMAIL_DOMAIN}`;

  try {
    await db.insert(orders).values({
      id: orderId,
      userId,
      status: "pending",
      // No paypalOrderId/CaptureId — link generation is the next step.
      subtotal: amountStr,
      shippingCost: "0.00",
      totalAmount: amountStr,
      currency: "MYR",
      customerEmail,
      shippingName: data.shipping.recipientName,
      shippingPhone: data.shipping.phone,
      shippingLine1: data.shipping.addressLine1,
      shippingLine2: data.shipping.addressLine2 || null,
      shippingCity: data.shipping.city,
      shippingState: data.shipping.state,
      shippingPostcode: data.shipping.postcode,
      shippingCountry: "Malaysia",
      // Phase 7 fields
      sourceType: "manual",
      customItemName: data.itemName,
      customItemDescription: data.itemDescription || null,
      customImages: data.images,
    });
  } catch (err) {
    console.error("[admin-manual-orders] insert failed:", err);
    return { ok: false, error: "Could not save the manual order. Please retry." };
  }

  revalidatePath("/admin/orders");
  return { ok: true, orderId };
}

export type GeneratePaymentLinkResult =
  | {
      ok: true;
      linkId: string;
      token: string;
      url: string;
      expiresAt: Date;
    }
  | { ok: false; error: string };

export async function generatePaymentLink({
  orderId,
}: {
  orderId: string;
}): Promise<GeneratePaymentLinkResult> {
  const session = await requireAdmin();

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
  });
  if (!order) return { ok: false, error: "Order not found." };
  if (order.paypalCaptureId) {
    return {
      ok: false,
      error: "This order is already paid; no new link can be generated.",
    };
  }
  if (
    order.status === "processing" ||
    order.status === "shipped" ||
    order.status === "delivered"
  ) {
    return {
      ok: false,
      error: `Cannot generate a link for an order in status '${order.status}'.`,
    };
  }

  // 192-bit entropy URL-safe token (T-07-X-token-bruteforce).
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + PAYMENT_LINK_TTL_MS);
  const linkId = randomUUID();

  try {
    await db.insert(paymentLinks).values({
      id: linkId,
      orderId,
      token,
      expiresAt,
      createdBy: session.user.id,
    });
  } catch (err) {
    console.error("[admin-manual-orders] link insert failed:", err);
    return { ok: false, error: "Could not create link. Please retry." };
  }

  revalidatePath(`/admin/orders/${orderId}`);
  return {
    ok: true,
    linkId,
    token,
    url: `${PUBLIC_LINK_BASE}/payment-links/${token}`,
    expiresAt,
  };
}

export type PaymentLinkRow = {
  id: string;
  token: string;
  url: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

export async function listOrderPaymentLinks(
  orderId: string,
): Promise<PaymentLinkRow[]> {
  await requireAdmin();
  const rows = await db
    .select({
      id: paymentLinks.id,
      token: paymentLinks.token,
      expiresAt: paymentLinks.expiresAt,
      usedAt: paymentLinks.usedAt,
      createdAt: paymentLinks.createdAt,
    })
    .from(paymentLinks)
    .where(eq(paymentLinks.orderId, orderId))
    .orderBy(desc(paymentLinks.createdAt));
  return rows.map((r) => ({
    id: r.id,
    token: r.token,
    url: `${PUBLIC_LINK_BASE}/payment-links/${r.token}`,
    expiresAt: r.expiresAt,
    usedAt: r.usedAt,
    createdAt: r.createdAt,
  }));
}

export async function revokePaymentLink(
  linkId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const row = await db.query.paymentLinks.findFirst({
    where: eq(paymentLinks.id, linkId),
  });
  if (!row) return { ok: false, error: "Link not found." };
  if (row.usedAt) {
    // Already terminal — return ok so the UI doesn't bounce.
    return { ok: true };
  }
  await db
    .update(paymentLinks)
    .set({ usedAt: new Date() })
    .where(eq(paymentLinks.id, linkId));
  revalidatePath(`/admin/orders/${row.orderId}`);
  return { ok: true };
}

/**
 * Returns the most recent active link for an order (not used, not expired)
 * or null. Convenience for components that only render one CTA.
 */
export async function getActivePaymentLink(
  orderId: string,
): Promise<PaymentLinkRow | null> {
  await requireAdmin();
  const now = new Date();
  const rows = await db
    .select({
      id: paymentLinks.id,
      token: paymentLinks.token,
      expiresAt: paymentLinks.expiresAt,
      usedAt: paymentLinks.usedAt,
      createdAt: paymentLinks.createdAt,
    })
    .from(paymentLinks)
    .where(and(eq(paymentLinks.orderId, orderId), isNull(paymentLinks.usedAt)))
    .orderBy(desc(paymentLinks.createdAt))
    .limit(1);
  if (rows.length === 0) return null;
  const r = rows[0];
  if (r.expiresAt < now) return null;
  return {
    id: r.id,
    token: r.token,
    url: `${PUBLIC_LINK_BASE}/payment-links/${r.token}`,
    expiresAt: r.expiresAt,
    usedAt: r.usedAt,
    createdAt: r.createdAt,
  };
}
