"use server";

import { db } from "@/lib/db";
import { user, orders } from "@/lib/db/schema";
import { eq, ne, desc, count, sum, max, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { userSuspendSchema } from "@/lib/validators";

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
  lifetimeSpend: number;
  lastOrderAt: Date | null;
};

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  await requireAdmin();

  const users = await db
    .select()
    .from(user)
    .where(ne(user.role, "admin"))
    .orderBy(desc(user.createdAt));

  if (users.length === 0) return [];

  const ids = users.map((u) => u.id);

  const orderStats = await db
    .select({
      userId: orders.userId,
      c: count(),
      spend: sum(orders.totalAmount),
      lastAt: max(orders.createdAt),
    })
    .from(orders)
    .where(inArray(orders.userId, ids))
    .groupBy(orders.userId);

  const statsMap = new Map(
    orderStats.map((r) => [
      r.userId,
      {
        orderCount: Number(r.c),
        lifetimeSpend: r.spend ? parseFloat(String(r.spend)) : 0,
        lastOrderAt: r.lastAt ? new Date(r.lastAt) : null,
      },
    ]),
  );

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    banned: !!u.banned,
    banReason: u.banReason ?? null,
    banExpires: u.banExpires ?? null,
    createdAt: u.createdAt,
    orderCount: statsMap.get(u.id)?.orderCount ?? 0,
    lifetimeSpend: statsMap.get(u.id)?.lifetimeSpend ?? 0,
    lastOrderAt: statsMap.get(u.id)?.lastOrderAt ?? null,
  }));
}

type SuspendResult = { ok: true } | { ok: false; error: string };

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
      banExpires: null,
    })
    .where(eq(user.id, userId));

  revalidatePath("/admin/users");
  return { ok: true };
}

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
