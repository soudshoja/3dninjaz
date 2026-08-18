"use server";

import { db } from "@/lib/db";
import {
  quotations,
  quotationItems,
  orders,
  orderItems,
} from "@/lib/db/schema";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { updateOrderStatus } from "@/actions/admin-orders";
import {
  computeDeposit,
  computeLineTotal,
  computeQuoteTotal,
  ensureTermsArray,
  DEFAULT_QUOTE_TERMS,
  type QuotationInput,
  type QuotationWithItems,
} from "@/lib/quotations";

/**
 * Admin quotation actions (2026-08-18).
 *
 * The quotation is the first document a client receives. When payment is
 * marked, a normal `orders` row is created and the EXISTING invoice pipeline
 * runs unchanged — nothing here modifies orders/order_items behaviour.
 *
 * IMPORTANT: requireAdmin() is the first await in every export (CVE-2025-29927
 * — middleware alone is bypassable).
 *
 * IMPORTANT: this file is "use server". It must export only async functions.
 * Types and sync helpers live in src/lib/quotations.ts.
 */

const SENTINEL_EMAIL_DOMAIN = "@3dninjaz.local";

function clampText(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max).trim() : "";
}

/** Money guard: never let a NaN or negative reach a DECIMAL column. */
function safeMoney(v: string): string {
  const n = parseFloat(v);
  return isFinite(n) && n >= 0 ? n.toFixed(2) : "0.00";
}

function normaliseInput(input: QuotationInput) {
  const items = (Array.isArray(input.items) ? input.items : [])
    .slice(0, 60)
    .map((l) => ({
      description: clampText(l.description, 500),
      quantity: Math.max(0, Math.min(999999, Math.floor(Number(l.quantity) || 0))),
      unitPrice: safeMoney(String(l.unitPrice ?? "0")),
      lineTotal: safeMoney(computeLineTotal(l)),
    }))
    .filter((l) => l.description.length > 0);

  const total = safeMoney(computeQuoteTotal(items));
  const depositPercent = (() => {
    const p = parseFloat(String(input.depositPercent ?? "50"));
    return isFinite(p) && p >= 0 && p <= 100 ? p.toFixed(2) : "50.00";
  })();

  const terms = Array.isArray(input.terms)
    ? input.terms.map((t) => clampText(t, 1000)).filter(Boolean).slice(0, 30)
    : DEFAULT_QUOTE_TERMS;

  return {
    items,
    total,
    depositPercent,
    depositAmount: computeDeposit(total, depositPercent),
    terms,
  };
}

export async function listQuotations(): Promise<QuotationWithItems[]> {
  await requireAdmin();
  const rows = await db
    .select()
    .from(quotations)
    .orderBy(desc(quotations.createdAt))
    .limit(200);
  // List view does not need line items; keep the shape consistent for callers.
  return rows.map((r) => ({ ...r, items: [] }));
}

export async function getQuotation(
  id: string,
): Promise<QuotationWithItems | null> {
  await requireAdmin();
  const [row] = await db
    .select()
    .from(quotations)
    .where(eq(quotations.id, id))
    .limit(1);
  if (!row) return null;

  // Manual hydration — MariaDB has no LATERAL, so db.query…with would fail.
  const items = await db
    .select()
    .from(quotationItems)
    .where(eq(quotationItems.quotationId, id))
    .orderBy(asc(quotationItems.position));

  return { ...row, items };
}

export async function createQuotation(
  input: QuotationInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireAdmin();

  const contactName = clampText(input.contactName, 200);
  if (!contactName) return { ok: false, error: "Client name is required." };
  const validUntil = clampText(input.validUntil, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    return { ok: false, error: "Valid-until date must be YYYY-MM-DD." };
  }

  const n = normaliseInput(input);
  const id = randomUUID();

  try {
    await db.insert(quotations).values({
      id,
      status: "draft",
      contactName,
      companyName: clampText(input.companyName, 200) || null,
      contactEmail: clampText(input.contactEmail, 255) || null,
      contactPhone: clampText(input.contactPhone, 32) || null,
      contactAddress: clampText(input.contactAddress, 1000) || null,
      projectDescription: clampText(input.projectDescription, 4000) || null,
      productionLeadTime: clampText(input.productionLeadTime, 120) || null,
      validUntil,
      terms: JSON.stringify(n.terms),
      subtotal: n.total,
      totalAmount: n.total,
      depositPercent: n.depositPercent,
      depositAmount: n.depositAmount,
      notes: clampText(input.notes, 2000) || null,
    });

    if (n.items.length > 0) {
      await db.insert(quotationItems).values(
        n.items.map((l, i) => ({
          id: randomUUID(),
          quotationId: id,
          position: i,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
        })),
      );
    }
  } catch (err) {
    console.error("[admin-quotations] create failed:", err);
    return { ok: false, error: "Could not save the quotation." };
  }

  revalidatePath("/admin/quotations");
  return { ok: true, id };
}

export async function updateQuotation(
  id: string,
  input: QuotationInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  const [existing] = await db
    .select({ id: quotations.id, status: quotations.status })
    .from(quotations)
    .where(eq(quotations.id, id))
    .limit(1);
  if (!existing) return { ok: false, error: "Quotation not found." };
  if (existing.status === "deposit_paid" || existing.status === "completed") {
    return {
      ok: false,
      error: "This quotation has been paid and can no longer be edited.",
    };
  }

  const contactName = clampText(input.contactName, 200);
  if (!contactName) return { ok: false, error: "Client name is required." };
  const validUntil = clampText(input.validUntil, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    return { ok: false, error: "Valid-until date must be YYYY-MM-DD." };
  }

  const n = normaliseInput(input);

  try {
    await db
      .update(quotations)
      .set({
        contactName,
        companyName: clampText(input.companyName, 200) || null,
        contactEmail: clampText(input.contactEmail, 255) || null,
        contactPhone: clampText(input.contactPhone, 32) || null,
        contactAddress: clampText(input.contactAddress, 1000) || null,
        projectDescription: clampText(input.projectDescription, 4000) || null,
        productionLeadTime: clampText(input.productionLeadTime, 120) || null,
        validUntil,
        terms: JSON.stringify(n.terms),
        subtotal: n.total,
        totalAmount: n.total,
        depositPercent: n.depositPercent,
        depositAmount: n.depositAmount,
        notes: clampText(input.notes, 2000) || null,
      })
      .where(eq(quotations.id, id));

    // Items are replaced wholesale — simpler and safer than diffing positions.
    await db.delete(quotationItems).where(eq(quotationItems.quotationId, id));
    if (n.items.length > 0) {
      await db.insert(quotationItems).values(
        n.items.map((l, i) => ({
          id: randomUUID(),
          quotationId: id,
          position: i,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
        })),
      );
    }
  } catch (err) {
    console.error("[admin-quotations] update failed:", err);
    return { ok: false, error: "Could not save the quotation." };
  }

  revalidatePath("/admin/quotations");
  revalidatePath(`/admin/quotations/${id}`);
  return { ok: true };
}

/** Mark a draft as sent. The PDF itself is downloaded/sent by the admin. */
export async function markQuotationSent(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const res = await db
    .update(quotations)
    .set({ status: "sent", sentAt: new Date() })
    .where(and(eq(quotations.id, id), eq(quotations.status, "draft")));
  const changed = (res as unknown as { affectedRows?: number }).affectedRows ?? 0;
  if (changed === 0) {
    return { ok: false, error: "Only a draft quotation can be marked as sent." };
  }
  revalidatePath("/admin/quotations");
  revalidatePath(`/admin/quotations/${id}`);
  return { ok: true };
}

/**
 * Convert a quotation into an order, once. The claim below is the idempotency
 * guard: a second concurrent click updates 0 rows and returns the order the
 * winner created, so a double-click can never produce two orders. The UNIQUE
 * key on quotations.order_id is the database-level backstop.
 */
async function claimAndCreateOrder(
  id: string,
  nextStatus: "deposit_paid" | "completed",
  amountPaid: string,
): Promise<{ ok: true; orderId: string } | { ok: false; error: string }> {
  const quote = await getQuotation(id);
  if (!quote) return { ok: false, error: "Quotation not found." };
  if (quote.orderId) return { ok: true, orderId: quote.orderId };
  if (quote.status === "cancelled") {
    return { ok: false, error: "This quotation was cancelled." };
  }
  if (quote.items.length === 0) {
    return { ok: false, error: "Add at least one line item before converting." };
  }

  const orderId = randomUUID();

  const claim = await db
    .update(quotations)
    .set({
      orderId,
      status: nextStatus,
      depositPaidAt: new Date(),
      ...(nextStatus === "completed" ? { completedAt: new Date() } : {}),
    })
    .where(and(eq(quotations.id, id), isNull(quotations.orderId)));

  const claimed = (claim as unknown as { affectedRows?: number }).affectedRows ?? 0;
  if (claimed === 0) {
    const again = await getQuotation(id);
    if (again?.orderId) return { ok: true, orderId: again.orderId };
    return { ok: false, error: "Could not convert this quotation." };
  }

  const total = safeMoney(quote.totalAmount);
  const customerEmail =
    quote.contactEmail && quote.contactEmail.length > 0
      ? quote.contactEmail
      : `manual+${orderId}${SENTINEL_EMAIL_DOMAIN}`;

  try {
    await db.insert(orders).values({
      id: orderId,
      userId: quote.userId ?? null,
      status: "pending",
      subtotal: total,
      shippingCost: "0.00",
      totalAmount: total,
      amountPaid: safeMoney(amountPaid),
      currency: "MYR",
      customerEmail,
      shippingName: quote.contactName,
      shippingPhone: quote.contactPhone ?? "",
      // Quotes carry a free-text address, not a validated Malaysian one. The
      // admin completes the shipping block on the order before booking a
      // courier; these placeholders only satisfy the NOT NULL columns.
      shippingLine1: quote.contactAddress || "To be confirmed",
      shippingLine2: null,
      shippingCity: "To be confirmed",
      shippingState: "Selangor",
      shippingPostcode: "00000",
      shippingCountry: "Malaysia",
      sourceType: "manual",
      notes: `Created from quotation #${String(quote.quoteNo).padStart(4, "0")}.`,
    });

    await db.insert(orderItems).values(
      quote.items.map((it) => ({
        id: randomUUID(),
        orderId,
        // The existing isManualLine() sentinel — invoice-branded.tsx already
        // renders these by bare productName, so the invoice needs no change.
        productId: "manual",
        variantId: "manual",
        productName: it.description,
        productSlug: "",
        productImage: null,
        variantLabel: null,
        unitPrice: it.unitPrice,
        quantity: Math.max(1, it.quantity),
        lineTotal: it.lineTotal,
        configurationData: null,
      })),
    );
  } catch (err) {
    console.error("[admin-quotations] order creation failed:", err);
    // Release the claim so the admin can retry rather than being stuck with a
    // quote pointing at an order that was never written.
    await db
      .update(quotations)
      .set({ orderId: null, status: quote.status })
      .where(eq(quotations.id, id))
      .catch(() => {});
    return { ok: false, error: "Could not create the order. Check server logs." };
  }

  revalidatePath("/admin/quotations");
  revalidatePath(`/admin/quotations/${id}`);
  revalidatePath("/admin/orders");
  return { ok: true, orderId };
}

/**
 * Deposit received. Creates the linked order with amountPaid = deposit; the
 * existing invoice then renders Amount Paid + Balance Due + bank block on its
 * own, with no change to the invoice renderer.
 */
export async function markQuotationDepositPaid(
  id: string,
): Promise<{ ok: true; orderId: string } | { ok: false; error: string }> {
  await requireAdmin();
  const quote = await getQuotation(id);
  if (!quote) return { ok: false, error: "Quotation not found." };
  return claimAndCreateOrder(id, "deposit_paid", quote.depositAmount);
}

/**
 * Paid in full. Converts first if it was never converted (a 100%-upfront
 * quote), then hands off to the EXISTING updateOrderStatus, which fires the
 * invoice and notifications exactly as it does for any other order.
 */
export async function markQuotationPaidInFull(
  id: string,
): Promise<{ ok: true; orderId: string } | { ok: false; error: string }> {
  await requireAdmin();

  const quote = await getQuotation(id);
  if (!quote) return { ok: false, error: "Quotation not found." };

  let orderId = quote.orderId ?? null;
  if (!orderId) {
    const converted = await claimAndCreateOrder(id, "completed", quote.totalAmount);
    if (!converted.ok) return converted;
    orderId = converted.orderId;
  }

  const result = await updateOrderStatus(orderId, "paid");
  if (!result.ok) {
    return { ok: false, error: result.error ?? "Could not mark the order paid." };
  }

  await db
    .update(quotations)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(quotations.id, id));

  revalidatePath("/admin/quotations");
  revalidatePath(`/admin/quotations/${id}`);
  revalidatePath("/admin/orders");
  return { ok: true, orderId };
}

export async function cancelQuotation(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const [row] = await db
    .select({ orderId: quotations.orderId })
    .from(quotations)
    .where(eq(quotations.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "Quotation not found." };
  if (row.orderId) {
    return { ok: false, error: "This quotation is already linked to an order." };
  }
  await db
    .update(quotations)
    .set({ status: "cancelled" })
    .where(eq(quotations.id, id));
  revalidatePath("/admin/quotations");
  revalidatePath(`/admin/quotations/${id}`);
  return { ok: true };
}

/** Drafts only — anything sent is a record of what the client received. */
export async function deleteQuotation(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const res = await db
    .delete(quotations)
    .where(and(eq(quotations.id, id), eq(quotations.status, "draft")));
  const changed = (res as unknown as { affectedRows?: number }).affectedRows ?? 0;
  if (changed === 0) {
    return { ok: false, error: "Only a draft quotation can be deleted." };
  }
  revalidatePath("/admin/quotations");
  return { ok: true };
}

/** Default terms for a new quote form, read through the parser for safety. */
export async function getDefaultQuoteTerms(): Promise<string[]> {
  await requireAdmin();
  return ensureTermsArray(JSON.stringify(DEFAULT_QUOTE_TERMS));
}
