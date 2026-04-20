"use server";

import { db } from "@/lib/db";
import { disputeCache, orders } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  listDisputesPage,
  getDispute,
  acceptClaim,
  provideEvidence,
  escalateToArbiter,
} from "@/lib/paypal-disputes";
import { checkRateLimit } from "@/lib/rate-limit";
import { revalidatePath } from "next/cache";

/**
 * Phase 7 (07-06) — disputes server actions.
 *
 * dispute_cache is a read-through aggregate. listDisputes() auto-syncs when
 * the most-recent row's lastSyncedAt is older than 15 min (Q-07-07 default).
 * Detail page always live-fetches the dispute (no cache) so admin sees the
 * freshest thread + evidence.
 *
 * Mutating actions (acceptClaim, provideEvidence, escalate) verify
 * dispute_cache.orderId IS NOT NULL (T-07-06-dispute-spoof) and rate-limit
 * 10/min/admin (T-07-06-DoS).
 */

const STALE_MS = 15 * 60_000;

type RawDispute = {
  disputed_transactions?: Array<{
    seller_transaction_id?: string;
  }>;
};

async function resolveOrderIdForDispute(
  raw: unknown,
): Promise<string | null> {
  const r = raw as RawDispute;
  const sellerTxnId = r?.disputed_transactions?.[0]?.seller_transaction_id;
  if (!sellerTxnId) return null;
  const row = await db.query.orders.findFirst({
    where: eq(orders.paypalCaptureId, sellerTxnId),
    columns: { id: true },
  });
  return row?.id ?? null;
}

export type SyncDisputesResult = {
  synced: number;
  errors: number;
};

export async function syncDisputes(): Promise<SyncDisputesResult> {
  await requireAdmin();
  let synced = 0;
  let errors = 0;
  try {
    const page = await listDisputesPage({ pageSize: 50 });
    for (const item of page.items) {
      let orderId: string | null = null;
      let rawJson: unknown = null;
      try {
        const full = await getDispute(item.disputeId);
        rawJson = full;
        orderId = await resolveOrderIdForDispute(full);
      } catch (e) {
        errors++;
        console.error("[disputes] fetch failed", item.disputeId, e);
      }

      const existing = await db.query.disputeCache.findFirst({
        where: eq(disputeCache.disputeId, item.disputeId),
      });
      const payload = {
        disputeId: item.disputeId,
        orderId,
        status: item.status,
        reason: item.reason ?? null,
        amount: item.amountValue,
        currency: item.currency,
        createDate: new Date(item.createTime),
        updateDate: new Date(item.updateTime),
        lastSyncedAt: new Date(),
        rawJson: rawJson ? JSON.stringify(rawJson) : null,
      };
      if (existing) {
        await db
          .update(disputeCache)
          .set(payload)
          .where(eq(disputeCache.id, existing.id));
      } else {
        await db.insert(disputeCache).values({
          id: randomUUID(),
          ...payload,
        });
      }
      synced++;
    }
    return { synced, errors };
  } catch (e) {
    console.error("[disputes] syncDisputes failed:", e);
    return { synced, errors: errors + 1 };
  }
}

export type DisputeRow = {
  id: string;
  disputeId: string;
  orderId: string | null;
  status: string;
  reason: string | null;
  amount: string | null;
  currency: string | null;
  createDate: Date;
  updateDate: Date;
  lastSyncedAt: Date;
};

export async function listDisputes(
  input: { status?: string } = {},
): Promise<DisputeRow[]> {
  await requireAdmin();

  // Auto-sync on stale cache (Q-07-07 default).
  const newest = await db
    .select({ lastSyncedAt: disputeCache.lastSyncedAt })
    .from(disputeCache)
    .orderBy(desc(disputeCache.lastSyncedAt))
    .limit(1);
  if (
    newest.length === 0 ||
    newest[0].lastSyncedAt.getTime() < Date.now() - STALE_MS
  ) {
    try {
      await syncDisputes();
    } catch (e) {
      console.error("[disputes] auto-sync failed:", e);
      // Continue with cached rows.
    }
  }

  const rows = input.status
    ? await db
        .select()
        .from(disputeCache)
        .where(eq(disputeCache.status, input.status))
        .orderBy(desc(disputeCache.updateDate))
    : await db
        .select()
        .from(disputeCache)
        .orderBy(desc(disputeCache.updateDate));

  return rows.map((r) => ({
    id: r.id,
    disputeId: r.disputeId,
    orderId: r.orderId,
    status: r.status,
    reason: r.reason,
    amount: r.amount,
    currency: r.currency,
    createDate: r.createDate,
    updateDate: r.updateDate,
    lastSyncedAt: r.lastSyncedAt,
  }));
}

export type DisputeDetail = {
  cached: DisputeRow;
  live: unknown | null;
  order: {
    id: string;
    customerEmail: string;
    totalAmount: string;
    currency: string;
    status: string;
  } | null;
};

export async function getDisputeWithOrder(
  disputeId: string,
): Promise<DisputeDetail | null> {
  await requireAdmin();
  const cached = await db.query.disputeCache.findFirst({
    where: eq(disputeCache.disputeId, disputeId),
  });
  if (!cached) return null; // T-07-06-dispute-spoof: refuse arbitrary disputeId

  let live: unknown = null;
  try {
    live = await getDispute(disputeId);
  } catch (err) {
    console.error("[disputes] live fetch failed:", err);
  }

  let order: DisputeDetail["order"] = null;
  if (cached.orderId) {
    const o = await db.query.orders.findFirst({
      where: eq(orders.id, cached.orderId),
      columns: {
        id: true,
        customerEmail: true,
        totalAmount: true,
        currency: true,
        status: true,
      },
    });
    if (o) {
      order = {
        id: o.id,
        customerEmail: o.customerEmail,
        totalAmount: o.totalAmount,
        currency: o.currency,
        status: o.status as string,
      };
    }
  }

  return {
    cached: {
      id: cached.id,
      disputeId: cached.disputeId,
      orderId: cached.orderId,
      status: cached.status,
      reason: cached.reason,
      amount: cached.amount,
      currency: cached.currency,
      createDate: cached.createDate,
      updateDate: cached.updateDate,
      lastSyncedAt: cached.lastSyncedAt,
    },
    live,
    order,
  };
}

type DisputeCacheRow = typeof disputeCache.$inferSelect;

function ensureDisputeMapped(
  cached: DisputeCacheRow | undefined,
  userId: string,
): { ok: true } | { ok: false; error: string; retryAfterMs?: number } {
  if (!cached) return { ok: false, error: "Dispute not found." };
  if (!cached.orderId) {
    return {
      ok: false,
      error:
        "This dispute is not yet mapped to a local order. Click Refresh, then retry.",
    };
  }
  const limit = checkRateLimit(`dispute:${userId}`, 10, 60_000);
  if (!limit.ok) {
    return {
      ok: false,
      error: `Too many dispute actions; try again in ${Math.ceil(limit.retryAfterMs / 1000)}s.`,
      retryAfterMs: limit.retryAfterMs,
    };
  }
  return { ok: true };
}

export type DisputeActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function acceptClaimAction(
  disputeId: string,
  input: {
    note: string;
    refundAmount?: { value: string; currencyCode: string };
  },
): Promise<DisputeActionResult> {
  const session = await requireAdmin();
  const cached = await db.query.disputeCache.findFirst({
    where: eq(disputeCache.disputeId, disputeId),
  });
  const guard = ensureDisputeMapped(cached, session.user.id);
  if (!guard.ok) return guard;

  const r = await acceptClaim(disputeId, input);
  if (!r.ok) {
    return {
      ok: false,
      error: `PayPal refused: ${r.body.slice(0, 200)}`,
    };
  }
  try {
    await syncDisputes();
  } catch (e) {
    console.error("[disputes] post-action sync failed:", e);
  }
  revalidatePath(`/admin/disputes/${disputeId}`);
  revalidatePath(`/admin/disputes`);
  return { ok: true };
}

export async function provideEvidenceAction(
  disputeId: string,
  formData: FormData,
): Promise<DisputeActionResult> {
  const session = await requireAdmin();
  const cached = await db.query.disputeCache.findFirst({
    where: eq(disputeCache.disputeId, disputeId),
  });
  const guard = ensureDisputeMapped(cached, session.user.id);
  if (!guard.ok) return guard;

  const notes = String(formData.get("notes") ?? "").slice(0, 2000);
  const evidenceType = String(formData.get("evidence_type") ?? "OTHER");

  const files: Array<{ name: string; mediaType: string; data: Buffer }> = [];
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("file") || !(v instanceof File)) continue;
    if (v.size > 10 * 1024 * 1024) {
      return { ok: false, error: `${v.name} exceeds 10 MB` };
    }
    if (files.length >= 3) {
      return {
        ok: false,
        error: "Max 3 files per submission (PayPal limit)",
      };
    }
    files.push({
      name: v.name,
      mediaType: v.type || "application/octet-stream",
      data: Buffer.from(await v.arrayBuffer()),
    });
  }

  const r = await provideEvidence(disputeId, {
    evidences: [
      {
        evidence_type: evidenceType,
        notes,
        documents: files,
      },
    ],
  });
  if (!r.ok) {
    return {
      ok: false,
      error: `PayPal refused: ${r.body.slice(0, 200)}`,
    };
  }
  try {
    await syncDisputes();
  } catch (e) {
    console.error("[disputes] post-action sync failed:", e);
  }
  revalidatePath(`/admin/disputes/${disputeId}`);
  return { ok: true };
}

export async function escalateAction(
  disputeId: string,
  input: { note: string },
): Promise<DisputeActionResult> {
  const session = await requireAdmin();
  const cached = await db.query.disputeCache.findFirst({
    where: eq(disputeCache.disputeId, disputeId),
  });
  const guard = ensureDisputeMapped(cached, session.user.id);
  if (!guard.ok) return guard;

  const r = await escalateToArbiter(disputeId, input);
  if (!r.ok) {
    return {
      ok: false,
      error: `PayPal refused: ${r.body.slice(0, 200)}`,
    };
  }
  try {
    await syncDisputes();
  } catch (e) {
    console.error("[disputes] post-action sync failed:", e);
  }
  revalidatePath(`/admin/disputes/${disputeId}`);
  return { ok: true };
}
