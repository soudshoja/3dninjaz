import { orders, orderItems, paymentProofs } from "@/lib/db/schema";
import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { getTenantContext } from "@/lib/tenant/context";
import type { TenantDb } from "@/lib/tenant/pool-manager";

/**
 * Checkout duplicate-order guard (incident 2026-06-12: two customers produced
 * 9 order rows for 2 purchases by retrying the WhatsApp / PayPal buttons).
 *
 * Traceability key: customer EMAIL or normalized PHONE — guests share the
 * guest@3dninjaz.local placeholder email, so phone is the reliable key there.
 *
 * Two behaviours, both scoped to UNPAID web orders with the SAME total in the
 * last 24h (same total = same purchase retried; a different total is a
 * different purchase and is never touched):
 *   - reuse:     identical retry (same items + config, bank transfer, <60 min)
 *                returns the existing order id instead of inserting a new row.
 *   - supersede: everything else gets auto-cancelled so at most ONE live
 *                unpaid attempt per customer per purchase survives.
 *
 * Orders with an uploaded payment proof are NEVER touched — the customer has
 * engaged with that row and an admin may be mid-review.
 *
 * Identity scoping (anti-spoofing): phone/email are requester-supplied, so an
 * authenticated requester only ever matches their OWN orders (userId =), and a
 * guest requester only matches guest orders (userId IS NULL). An anonymous
 * attempt can never cancel or reuse an order tied to a real account.
 * A superseded pending PayPal row that later captures anyway is safe:
 * capturePayPalOrder has no status guard and flips it straight to "paid".
 */

const PLACEHOLDER_EMAIL_RE = /@3dninjaz\.local$/i;
const SUPERSEDE_WINDOW_MS = 24 * 60 * 60 * 1000;
const REUSE_WINDOW_MS = 60 * 60 * 1000;

/** Digits only, national subscriber number (drops +60 / leading 0). */
export function normalizeMsisdn(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D+/g, "");
  return digits.replace(/^60/, "").replace(/^0+/, "");
}

type SignatureLine = {
  productId: string;
  variantId: string;
  quantity: number;
  /** JSON.stringify(configurationData) or null — distinguishes two made-to-
   *  order lines with different custom text but identical product/qty. */
  configJson: string | null;
};

/** Order-independent fingerprint of a cart for the identical-retry check. */
export function itemSignature(lines: SignatureLine[]): string {
  return lines
    .map((l) => `${l.productId}:${l.variantId}:${l.quantity}:${l.configJson ?? ""}`)
    .sort()
    .join("|");
}

export type DedupeResult = {
  /** Existing order to return instead of inserting (identical retry). */
  reuseOrderId: string | null;
  /** Stale unpaid attempt ids that were auto-cancelled. */
  cancelledIds: string[];
};

export async function dedupeUnpaidOrders({
  requesterUserId,
  email,
  phone,
  totalStr,
  reuseSignature,
}: {
  /** Session user id, or null for guest checkout. Scopes which rows are
   *  touchable: own orders when authenticated, guest-only orders otherwise. */
  requesterUserId: string | null;
  /** Real customer email, or null when unknown (guest without email). */
  email: string | null;
  /** Shipping phone of the new attempt (always present on the address form). */
  phone: string;
  /** Exact totalAmount string (e.g. "119.00") of the new attempt. */
  totalStr: string;
  /**
   * When set (bank-transfer flow), an existing awaiting_payment_review
   * bank-transfer order with this signature within 60 min is REUSED.
   * PayPal passes null — every PayPal click needs a fresh paypal_order_id.
   */
  reuseSignature: string | null;
}, db?: TenantDb): Promise<DedupeResult> {
  db ??= (await getTenantContext()).db;
  const result: DedupeResult = { reuseOrderId: null, cancelledIds: [] };

  const normEmail =
    email && !PLACEHOLDER_EMAIL_RE.test(email) ? email.trim().toLowerCase() : null;
  const normPhone = normalizeMsisdn(phone);
  if (!normEmail && !normPhone) return result;

  const since = new Date(Date.now() - SUPERSEDE_WINDOW_MS);
  const candidates = await db
    .select({
      id: orders.id,
      status: orders.status,
      paymentMethod: orders.paymentMethod,
      customerEmail: orders.customerEmail,
      shippingPhone: orders.shippingPhone,
      createdAt: orders.createdAt,
      notes: orders.notes,
    })
    .from(orders)
    .where(
      and(
        inArray(orders.status, ["pending", "awaiting_payment_review"]),
        isNull(orders.paypalCaptureId),
        eq(orders.totalAmount, totalStr),
        eq(orders.sourceType, "web"),
        gte(orders.createdAt, since),
        // Identity scope — see header comment. Spoofed phone/email from an
        // anonymous checkout must never reach an account holder's orders.
        requesterUserId
          ? eq(orders.userId, requesterUserId)
          : isNull(orders.userId),
      ),
    );

  // Match by real email OR normalized phone.
  const matched = candidates.filter((c) => {
    const cEmail = PLACEHOLDER_EMAIL_RE.test(c.customerEmail)
      ? null
      : c.customerEmail.trim().toLowerCase();
    if (normEmail && cEmail && cEmail === normEmail) return true;
    if (normPhone && normalizeMsisdn(c.shippingPhone) === normPhone) return true;
    return false;
  });
  if (matched.length === 0) return result;

  // Never touch orders the customer has uploaded a payment proof for.
  const matchedIds = matched.map((c) => c.id);
  const proofRows = await db
    .select({ orderId: paymentProofs.orderId })
    .from(paymentProofs)
    .where(inArray(paymentProofs.orderId, matchedIds));
  const withProof = new Set(proofRows.map((p) => p.orderId));
  const touchable = matched.filter((c) => !withProof.has(c.id));
  if (touchable.length === 0) return result;

  // Identical-retry reuse (bank transfer only) — newest matching attempt wins.
  if (reuseSignature) {
    const reuseSince = Date.now() - REUSE_WINDOW_MS;
    const reuseCandidates = touchable
      .filter(
        (c) =>
          c.paymentMethod === "bank_transfer" &&
          c.status === "awaiting_payment_review" &&
          new Date(c.createdAt).getTime() >= reuseSince,
      )
      .sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    if (reuseCandidates.length > 0) {
      const ids = reuseCandidates.map((c) => c.id);
      const lines = await db
        .select({
          orderId: orderItems.orderId,
          productId: orderItems.productId,
          variantId: orderItems.variantId,
          quantity: orderItems.quantity,
          configurationData: orderItems.configurationData,
        })
        .from(orderItems)
        .where(inArray(orderItems.orderId, ids));
      const byOrder = new Map<string, SignatureLine[]>();
      for (const l of lines) {
        const arr = byOrder.get(l.orderId) ?? [];
        arr.push({
          productId: l.productId,
          variantId: l.variantId,
          quantity: l.quantity,
          configJson: l.configurationData ?? null,
        });
        byOrder.set(l.orderId, arr);
      }
      for (const c of reuseCandidates) {
        if (itemSignature(byOrder.get(c.id) ?? []) === reuseSignature) {
          result.reuseOrderId = c.id;
          break;
        }
      }
    }
  }

  // Supersede the rest — cancel so only one live attempt remains.
  const toCancel = touchable.filter((c) => c.id !== result.reuseOrderId);
  for (const c of toCancel) {
    try {
      await db
        .update(orders)
        .set({
          status: "cancelled",
          notes:
            c.notes && c.notes.trim().length > 0
              ? c.notes
              : "Auto-cancelled: superseded by a newer checkout attempt from the same customer (duplicate payment retry).",
        })
        .where(
          and(
            eq(orders.id, c.id),
            // Re-check unpaid at write time — a capture racing in wins.
            isNull(orders.paypalCaptureId),
            inArray(orders.status, ["pending", "awaiting_payment_review"]),
          ),
        );
      result.cancelledIds.push(c.id);
    } catch (err) {
      // Best-effort cleanup — never block a new checkout on it.
      console.error(`[order-dedupe] failed to supersede ${c.id}:`, err);
    }
  }

  return result;
}
