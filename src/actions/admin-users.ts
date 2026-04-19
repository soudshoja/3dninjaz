"use server";

import { db } from "@/lib/db";
import { user, orders } from "@/lib/db/schema";
import { eq, ne, sql, desc, count, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { userSuspendSchema } from "@/lib/validators";

// ============================================================================
// Plan 05-02 admin user actions.
//
// IMPORTANT (T-05-02-EoP / CVE-2025-29927):
// Every exported function MUST call `await requireAdmin()` as its FIRST
// statement, BEFORE any DB access.
//
// IMPORTANT (T-05-02-self-suspend, T-05-02-admin-on-admin):
// suspendUser refuses self-targeting and refuses to suspend another admin.
// Better Auth admin plugin's banned=true field is set; existing sessions
// continue until next request (Q-05-07 — accepted).
// ============================================================================

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  banReason: string | null;
  banExpires: Date | null;
  createdAt: Date;
  orderCount: number;
};

/**
 * List every non-admin user with order count, newest first.
 *
 * Two SELECTs (manual hydration — MariaDB 10.11 has no LATERAL joins):
 *   1) users WHERE role != 'admin' ORDER BY createdAt DESC
 *   2) order count grouped by userId, joined in memory
 */
export async function listAdminUsers(): Promise<AdminUserRow[]> {
  await requireAdmin();

  const users = await db
    .select()
    .from(user)
    .where(ne(user.role, "admin"))
    .orderBy(desc(user.createdAt));

  if (users.length === 0) return [];

  const ids = users.map((u) => u.id);
  const orderCounts = await db
    .select({ userId: orders.userId, c: count() })
    .from(orders)
    .where(inArray(orders.userId, ids))
    .groupBy(orders.userId);

  const countMap = new Map(orderCounts.map((r) => [r.userId, Number(r.c)]));

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    banned: !!u.banned,
    banReason: u.banReason ?? null,
    banExpires: u.banExpires ?? null,
    createdAt: u.createdAt,
    orderCount: countMap.get(u.id) ?? 0,
  }));
}

type SuspendResult = { ok: true } | { ok: false; error: string };

/**
 * Suspend a user via Better Auth admin plugin's `banned` field.
 *
 * Refuses (T-05-02-EoP):
 *   - target === current admin (no self-suspend)
 *   - target.role === 'admin' (no admin-on-admin suspend)
 */
export async function suspendUser(formData: FormData): Promise<SuspendResult> {
  const session = await requireAdmin();

  const parsed = userSuspendSchema.safeParse({
    userId: formData.get("userId"),
    suspend: formData.get("suspend") === "true",
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { userId, suspend, reason } = parsed.data;

  if (userId === session.user.id) {
    return { ok: false, error: "Cannot suspend yourself" };
  }

  const [target] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!target) return { ok: false, error: "User not found" };
  if (target.role === "admin") {
    return { ok: false, error: "Cannot suspend an admin user" };
  }

  await db
    .update(user)
    .set({
      banned: suspend,
      banReason: suspend ? reason ?? null : null,
      // v1: permanent suspension until explicit unsuspend; future could expose
      // a "suspend until" datepicker.
      banExpires: null,
    })
    .where(eq(user.id, userId));

  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Unsuspend a previously banned user. Clears banReason + banExpires too.
 */
export async function unsuspendUser(userId: string): Promise<SuspendResult> {
  await requireAdmin();

  if (typeof userId !== "string" || userId.length === 0) {
    return { ok: false, error: "Invalid user ID" };
  }

  const [target] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!target) return { ok: false, error: "User not found" };

  await db
    .update(user)
    .set({ banned: false, banReason: null, banExpires: null })
    .where(eq(user.id, userId));

  revalidatePath("/admin/users");
  return { ok: true };
}

// Suppress unused-warning for sql (we may need it later for raw NOT-IN style
// queries; keeping the import groomed avoids flicker).
void sql;
