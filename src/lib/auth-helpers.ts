import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

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
