"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user as userTable } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  changePasswordSchema,
  profileUpdateSchema,
} from "@/lib/validators";

// ============================================================================
// /admin/profile actions — display-name update + password change.
//
// Mirrors src/actions/account.ts (customer-side) but gated behind requireAdmin
// so non-admins cannot reach these routes even if they discover the URL.
// CVE-2025-29927 — admin checks must run as the FIRST await on every handler;
// middleware-only protection is bypassable.
// ============================================================================

export async function updateAdminProfile(input: unknown) {
  const session = await requireAdmin();
  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }
  await db
    .update(userTable)
    .set({ name: parsed.data.name })
    .where(eq(userTable.id, session.user.id));
  revalidatePath("/admin/profile");
  return { ok: true as const, message: "Profile updated." };
}

export async function changeAdminPassword(input: unknown) {
  await requireAdmin();
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }
  try {
    await auth.api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        // Keep this device signed in so the admin doesn't get bounced to
        // /login mid-session. Phase 7+ may add a "revoke other sessions"
        // toggle once we have multi-admin scenarios.
        revokeOtherSessions: false,
      },
      headers: await headers(),
    });
    return { ok: true as const, message: "Password updated." };
  } catch (err) {
    // Generic copy — never echo Better Auth's internal error text in case it
    // hints at the current password length / hash format.
    console.error("[admin-profile] changePassword failed", err);
    return {
      ok: false as const,
      error:
        "Could not change password. Check your current password and try again.",
    };
  }
}
