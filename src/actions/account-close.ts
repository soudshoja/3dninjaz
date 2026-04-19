"use server";

/**
 * Phase 6 06-07 — customer self-service account closure (CUST-08).
 *
 * THREAT MODEL:
 *  - T-06-07-auth: requireUser() FIRST await
 *  - T-06-07-consent: accountCloseSchema.literal("DELETE") rejects accidental
 *    or JS-coerced submissions
 *  - T-06-07-atomicity: db.transaction wraps anonymize + cascade + session
 *    delete in one atomic unit — no half-closed state possible
 *  - T-06-07-session-kill: hard-delete from session table is the guaranteed
 *    kill; banUser is a best-effort secondary signal for Better Auth's
 *    in-memory caches
 *  - T-06-07-PDPA: orders / order_requests / reviews preserved (D-06 7y).
 *    Anonymized email format `deleted-<userId>@3dninjaz.local` keeps the
 *    UNIQUE email constraint satisfied while freeing the original email
 *    for re-registration (Assumption 7)
 *  - T-06-07-PII-log: console.error logs only the error object's default
 *    string — never email, name, or session token
 */

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  addresses,
  session as sessionTable,
  user as userTable,
  wishlists,
} from "@/lib/db/schema";
import { accountCloseSchema } from "@/lib/validators";
import { requireUser } from "@/lib/auth-helpers";

export async function closeMyAccount(input: unknown) {
  const s = await requireUser();

  const parsed = accountCloseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Type DELETE to confirm." };
  }

  const userId = s.user.id;
  const anonymizedEmail = `deleted-${userId}@3dninjaz.local`;

  // Atomic anonymize + customer-data wipe + session delete.
  // Orders / order_requests / reviews preserved by NO-cascade FKs — D-06 7y.
  await db.transaction(async (tx) => {
    await tx
      .update(userTable)
      .set({
        email: anonymizedEmail,
        emailVerified: false,
        name: "Former customer",
        image: null,
        banned: true,
        banReason: "Account closed by user (CUST-08)",
        deletedAt: new Date(),
      })
      .where(eq(userTable.id, userId));

    // Customer-convenience data — no audit value, hard delete.
    await tx.delete(addresses).where(eq(addresses.userId, userId));
    await tx.delete(wishlists).where(eq(wishlists.userId, userId));

    // Hard-kill all session rows so the cookie is dead everywhere.
    await tx.delete(sessionTable).where(eq(sessionTable.userId, userId));
  });

  // Best-effort Better Auth admin plugin banUser for any in-memory session
  // caches. DB state is already closed; failure here doesn't matter — the
  // requireUser() deletedAt cold-reload is the backstop.
  try {
    const banApi = (
      auth.api as unknown as {
        banUser?: (args: {
          body: { userId: string; banReason?: string };
          headers: Headers;
        }) => Promise<unknown>;
      }
    ).banUser;
    if (typeof banApi === "function") {
      await banApi({
        body: { userId, banReason: "Account closed by user" },
        headers: await headers(),
      });
    }
  } catch (err) {
    console.error(
      "[closeMyAccount] banUser best-effort failed (DB state already closed)",
      err,
    );
  }

  // Cookies are gone. Redirect to homepage with a closure flag — the
  // homepage banner acknowledges the closure.
  redirect("/?closed=1");
}
