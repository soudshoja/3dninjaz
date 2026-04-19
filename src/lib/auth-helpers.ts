import "server-only";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user as userTable } from "@/lib/db/schema";

/**
 * Throws if the current request is not an authenticated admin. Every server
 * action that mutates admin-protected data MUST call this at the top of the
 * function — middleware-only protection was bypassable via CVE-2025-29927,
 * so we verify the session role on every handler.
 */
export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "admin") {
    throw new Error("Forbidden");
  }
  return session;
}

export async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

/**
 * Phase 6 06-01 — `requireUser()` is the customer-side sibling of
 * `requireAdmin()`. Every customer-scoped server action MUST call this as the
 * FIRST `await` in the handler (CVE-2025-29927: middleware-only protection is
 * bypassable; the only safe boundary is action-level re-verification).
 *
 * Behaviour:
 *   - Throws "Unauthorized" when there is no Better Auth session.
 *   - Hot-path: rejects when session.user.deletedAt is set (Better Auth
 *     surfaces additionalFields when configured).
 *   - Cold-path: when session.user.deletedAt is `undefined` (the column is
 *     not yet declared in Better Auth's additionalFields config), reload the
 *     user row once per request and reject if `deletedAt` or `banned` is set.
 *     Defense-in-depth against the brief window between
 *     `/account/close` writing the soft-delete and the session cache catching
 *     up (T-06-01-closure, T-06-07-lag).
 */
export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new Error("Unauthorized");
  }

  const surface = session.user as { deletedAt?: Date | string | null };
  if (surface.deletedAt) {
    throw new Error("Unauthorized");
  }

  // Cold-path reload — at most one extra SELECT per request when Better Auth
  // doesn't surface the column on session.user.
  if (surface.deletedAt === undefined) {
    const [row] = await db
      .select({
        deletedAt: userTable.deletedAt,
        banned: userTable.banned,
      })
      .from(userTable)
      .where(eq(userTable.id, session.user.id))
      .limit(1);
    if (!row || row.deletedAt || row.banned) {
      throw new Error("Unauthorized");
    }
  }

  return session;
}
