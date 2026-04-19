"use server";

/**
 * Customer-side account actions for /account profile + /account/security.
 *
 * Scope (Plan 06-02):
 *  - updateProfile — display-name edit on /account
 *  - changeEmail   — wraps Better Auth's changeEmail (verification flow)
 *  - changePassword — wraps Better Auth's changePassword (currentPassword challenge)
 *
 * THREAT MODEL (per 06-CONTEXT + 06-02 PLAN):
 *  - T-06-02-auth: requireUser() FIRST await — CVE-2025-29927 closure
 *  - T-06-02-credential-stuffing: Better Auth re-auths currentPassword server-side
 *  - T-06-02-PII-log: console.error logs only the error object — never password / newEmail
 *  - T-06-02-enumeration: error copy is generic ("Could not start email change") so we
 *    don't leak whether the new email already exists or the password failed
 */

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user as userTable } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth-helpers";
import {
  changeEmailSchema,
  changePasswordSchema,
  profileUpdateSchema,
} from "@/lib/validators";

export async function updateProfile(input: unknown) {
  const session = await requireUser();
  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }
  await db
    .update(userTable)
    .set({ name: parsed.data.name })
    .where(eq(userTable.id, session.user.id));
  revalidatePath("/account");
  return { ok: true as const, message: "Profile updated." };
}

export async function changeEmail(input: unknown) {
  await requireUser();
  const parsed = changeEmailSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }

  try {
    // Better Auth's `changeEmail` sends a verification link to the NEW address.
    // The actual user.email column is updated only after that link is clicked.
    // We pass headers() so Better Auth can resolve the current session.
    await auth.api.changeEmail({
      body: {
        newEmail: parsed.data.newEmail,
        callbackURL: "/account/security?verified=1",
      },
      headers: await headers(),
    });
    return {
      ok: true as const,
      message: `Verification email sent to ${parsed.data.newEmail}. Click the link there to complete the change.`,
    };
  } catch (err) {
    // Generic error copy — don't leak whether the new email is already in use
    // or whether the current password was wrong.
    console.error("[changeEmail] Better Auth error", err);
    return {
      ok: false as const,
      error:
        "Could not start email change. Check your current password and try again.",
    };
  }
}

export async function changePassword(input: unknown) {
  await requireUser();
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }

  try {
    await auth.api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        // Keep the user logged in on this device. Phase 7+ may add a UI toggle
        // to revoke other sessions on demand.
        revokeOtherSessions: false,
      },
      headers: await headers(),
    });
    return { ok: true as const, message: "Password updated." };
  } catch (err) {
    console.error("[changePassword] Better Auth error", err);
    return {
      ok: false as const,
      error:
        "Could not change password. Check your current password and try again.",
    };
  }
}
