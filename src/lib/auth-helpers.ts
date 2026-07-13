import "server-only";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getTenantContext } from "@/lib/tenant/context";
import { user as userTable } from "@/lib/db/schema";

/**
 * Throws if the current request is not an authenticated admin. Every server
 * action that mutates admin-protected data MUST call this at the top of the
 * function — middleware-only protection was bypassable via CVE-2025-29927,
 * so we verify the session role on every handler.
 *
 * Phase 24 (24-03): tenant binding (via getTenantContext) is resolved BEFORE
 * the session lookup, so a session is only ever validated against its own
 * tenant's session table — wrong-tenant session validation is structurally
 * impossible. The return is a backward-compatible SPREAD of Better Auth's
 * `{ session, user }` result plus `{ tenant, db }`, so every existing
 * `const session = await requireAdmin(); session.user...` call site keeps
 * compiling unchanged.
 */
export async function requireAdmin() {
  const { tenant, db, auth } = await getTenantContext(); // tenant binding FIRST
  const session = await auth.api.getSession({ headers: await headers() });
  const userWithRole = session?.user as unknown as { role: string } | undefined;
  if (!session || userWithRole?.role !== "admin") {
    throw new Error("Forbidden");
  }
  return { ...session, tenant, db }; // { session, user, tenant, db }
}

export async function getSessionUser() {
  const { auth } = await getTenantContext();
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null; // shape UNCHANGED — 18 callers depend on this
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
 *
 * Phase 24 (24-03): tenant binding (via getTenantContext) is resolved BEFORE
 * the session lookup, and the cold-path reload runs against the CONTEXT
 * tenant db — so a stale session on one tenant cannot be validated against
 * another tenant's user table. The return is a backward-compatible SPREAD
 * of Better Auth's `{ session, user }` result plus `{ tenant, db }`.
 */
export async function requireUser() {
  const { tenant, db, auth } = await getTenantContext(); // tenant binding FIRST
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new Error("Unauthorized");
  }

  const surface = session.user as { deletedAt?: Date | string | null };
  if (surface.deletedAt) {
    throw new Error("Unauthorized");
  }

  // Cold-path reload — at most one extra SELECT per request when Better Auth
  // doesn't surface the column on session.user. Runs against the context
  // tenant db (verbatim logic from Phase 6, now tenant-scoped).
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

  return { ...session, tenant, db }; // { session, user, tenant, db }
}
