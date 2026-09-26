"use server";

/**
 * WhatsApp outbox admin actions.
 *
 * "use server" - ONLY async function exports (types live in
 * src/lib/whatsapp/outbox-types.ts). requireAdmin() is the FIRST await in
 * every export (CVE-2025-29927).
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { orders, whatsappOutbox } from "@/lib/db/schema";
import { formatOrderNumber } from "@/lib/orders";
import {
  OUTBOX_FILTER_STATUSES,
  RESENDABLE_STATUSES,
  type OutboxFilter,
  type OutboxListResult,
  type OutboxStatus,
} from "@/lib/whatsapp/outbox-types";

const PAGE_SIZE = 50;
const PAGE_PATH = "/admin/notifications/outbox";

function iso(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString();
}

export async function listOutbox(input: {
  filter?: OutboxFilter;
  page?: number;
}): Promise<OutboxListResult> {
  await requireAdmin();

  const filter = input.filter ?? "all";
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const where =
    filter === "all"
      ? undefined
      : inArray(whatsappOutbox.status, [...OUTBOX_FILTER_STATUSES[filter]]);

  const rows = await db
    .select()
    .from(whatsappOutbox)
    .where(where)
    .orderBy(desc(whatsappOutbox.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const [totalRow] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(whatsappOutbox)
    .where(where);

  const countRows = await db
    .select({ status: whatsappOutbox.status, n: sql<number>`COUNT(*)` })
    .from(whatsappOutbox)
    .groupBy(whatsappOutbox.status);
  const counts: Record<string, number> = {};
  for (const c of countRows) counts[c.status] = Number(c.n);

  // Second query + in-memory join (no relational `with:` - LATERAL is
  // unsupported on MariaDB 10.11).
  const orderIds = [
    ...new Set(rows.map((r) => r.orderId).filter((x): x is string => !!x)),
  ];
  const names = new Map<string, string>();
  if (orderIds.length > 0) {
    const os = await db
      .select({ id: orders.id, name: orders.shippingName })
      .from(orders)
      .where(inArray(orders.id, orderIds));
    for (const o of os) names.set(o.id, o.name);
  }

  return {
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: iso(r.createdAt),
      eventKey: r.eventKey,
      // Link only when the order still exists (outbox outlives orders).
      orderId: r.orderId && names.has(r.orderId) ? r.orderId : null,
      orderNumber: r.orderId ? formatOrderNumber(r.orderId) : null,
      customerName: r.orderId ? (names.get(r.orderId) ?? null) : null,
      recipient: r.recipient,
      status: r.status as OutboxStatus,
      attempts: r.attempts,
      nextAttemptAt: iso(r.nextAttemptAt),
      ackStatus: r.ackStatus ?? null,
      lastError: r.lastError ?? null,
    })),
    total: Number(totalRow?.n ?? 0),
    page,
    pageSize: PAGE_SIZE,
    counts,
  };
}

export async function resendOutboxRow(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  // Stamps created_at = NOW() so the cold-start age guard does not instantly
  // re-kill it - the deliberate admin-authorised escape hatch. The status
  // predicate makes it atomic (a row that just went out is not re-queued).
  const res = await db
    .update(whatsappOutbox)
    .set({
      status: "queued",
      attempts: 0,
      nextAttemptAt: sql`NOW()`,
      createdAt: sql`NOW()`,
      providerKeyId: null,
      ackStatus: null,
      ackRank: -1,
      lastError: null,
    })
    .where(
      and(
        eq(whatsappOutbox.id, id),
        inArray(whatsappOutbox.status, [...RESENDABLE_STATUSES]),
      ),
    );
  const n =
    (Array.isArray(res)
      ? (res[0] as { affectedRows?: number })?.affectedRows
      : (res as { affectedRows?: number })?.affectedRows) ?? 0;
  if (n === 0) return { ok: false, error: "Row is not in a resendable state." };
  revalidatePath(PAGE_PATH);
  return { ok: true };
}

export async function cancelOutboxRow(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const res = await db
    .update(whatsappOutbox)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(whatsappOutbox.id, id),
        inArray(whatsappOutbox.status, ["queued", "failed_retryable"]),
      ),
    );
  const n =
    (Array.isArray(res)
      ? (res[0] as { affectedRows?: number })?.affectedRows
      : (res as { affectedRows?: number })?.affectedRows) ?? 0;
  if (n === 0) return { ok: false, error: "Row can no longer be cancelled." };
  revalidatePath(PAGE_PATH);
  return { ok: true };
}
