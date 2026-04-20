"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { emailSubscribers } from "@/lib/db/schema";
import type { SubscriberStatusFilter } from "@/lib/subscriber-filters";

/**
 * Admin server actions for the email-subscribers queue (/admin/subscribers).
 *
 * IMPORTANT (CVE-2025-29927):
 * Every exported function calls `await requireAdmin()` as the FIRST await —
 * middleware alone is bypassable.
 *
 * NB: "use server" modules can only export async functions, so the filter
 * type-guard + shared enum live in @/lib/subscriber-filters.
 */

export type AdminSubscriberRow = {
  id: string;
  email: string;
  source: string | null;
  status: "active" | "unsubscribed" | "bounced";
  subscribedAt: Date;
  unsubscribedAt: Date | null;
  userId: string | null;
};

/** Totals for the filter-dropdown counts + badge. */
export type SubscriberCounts = {
  all: number;
  active: number;
  unsubscribed: number;
  bounced: number;
};

export async function getSubscriberCounts(): Promise<SubscriberCounts> {
  await requireAdmin();
  const rows = await db
    .select({
      status: emailSubscribers.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(emailSubscribers)
    .groupBy(emailSubscribers.status);
  const counts: SubscriberCounts = {
    all: 0,
    active: 0,
    unsubscribed: 0,
    bounced: 0,
  };
  for (const r of rows) {
    const c = Number(r.count);
    counts.all += c;
    if (r.status === "active") counts.active = c;
    else if (r.status === "unsubscribed") counts.unsubscribed = c;
    else if (r.status === "bounced") counts.bounced = c;
  }
  return counts;
}

/**
 * List subscribers, newest first. No LATERAL joins on MariaDB 10.11 so this
 * stays a plain SELECT (no child hydration needed — the row is flat).
 */
export async function listSubscribers(
  filter: SubscriberStatusFilter = "active",
  limit = 100,
  offset = 0,
): Promise<AdminSubscriberRow[]> {
  await requireAdmin();

  const base = db
    .select({
      id: emailSubscribers.id,
      email: emailSubscribers.email,
      source: emailSubscribers.source,
      status: emailSubscribers.status,
      subscribedAt: emailSubscribers.subscribedAt,
      unsubscribedAt: emailSubscribers.unsubscribedAt,
      userId: emailSubscribers.userId,
    })
    .from(emailSubscribers);

  const rows =
    filter === "all"
      ? await base
          .orderBy(desc(emailSubscribers.subscribedAt))
          .limit(limit)
          .offset(offset)
      : await base
          .where(eq(emailSubscribers.status, filter))
          .orderBy(desc(emailSubscribers.subscribedAt))
          .limit(limit)
          .offset(offset);

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    source: r.source,
    status: r.status,
    subscribedAt: r.subscribedAt,
    unsubscribedAt: r.unsubscribedAt,
    userId: r.userId,
  }));
}

/** Admin override — force a subscriber into `unsubscribed`. */
export async function adminUnsubscribe(id: string): Promise<{ ok: true }> {
  await requireAdmin();
  if (!id || typeof id !== "string") {
    throw new Error("Missing subscriber id");
  }
  await db
    .update(emailSubscribers)
    .set({ status: "unsubscribed", unsubscribedAt: new Date() })
    .where(
      and(
        eq(emailSubscribers.id, id),
        // Don't touch bounced rows — they carry independent meaning.
        eq(emailSubscribers.status, "active"),
      ),
    );
  revalidatePath("/admin/subscribers");
  return { ok: true };
}

/** Admin override — flip an entry back to active (rare but useful). */
export async function adminReactivate(id: string): Promise<{ ok: true }> {
  await requireAdmin();
  if (!id || typeof id !== "string") {
    throw new Error("Missing subscriber id");
  }
  await db
    .update(emailSubscribers)
    .set({ status: "active", unsubscribedAt: null })
    .where(eq(emailSubscribers.id, id));
  revalidatePath("/admin/subscribers");
  return { ok: true };
}
