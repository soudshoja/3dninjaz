/**
 * Seed script to create the first admin user, and optionally rotate the
 * password of an existing admin in place.
 *
 * Run with: npm run seed:admin
 * (which runs `tsx --env-file=.env.local scripts/seed-admin.ts`)
 *
 * Environment variables:
 *   ADMIN_EMAIL          — email of the admin to create / rotate (required in practice)
 *   ADMIN_PASSWORD       — password (create mode: initial; rotate mode: new)
 *   ADMIN_RESET_PASSWORD — when set to "1" and the user already exists, updates
 *                          the credential-provider password hash in place using
 *                          Better Auth's own hasher. User id, role,
 *                          email_verified and sessions are preserved.
 *
 * Safety properties:
 *   - Never logs the password value.
 *   - Never deletes user or account rows; rotation is an UPDATE of account.password only.
 *   - Idempotent: running the rotation twice with the same password succeeds
 *     without error (the hash changes — scrypt salts are per-call — but
 *     verification against the same input still passes).
 *   - If the credential account row is missing, the script exits with a
 *     non-zero status rather than silently creating one.
 */

import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { account, user } from "../src/lib/db/schema";
import { and, eq } from "drizzle-orm";

async function rotatePassword(userId: string, newPassword: string) {
  // Better Auth exposes its hash/verify implementation via the internal
  // auth.$context promise. Using it ensures the scrypt parameters match
  // what sign-in expects when validating.
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(newPassword);

  // Update only the credential-provider row for this user. Social-login rows
  // (if any ever exist) must not be touched.
  const result = await db
    .update(account)
    .set({ password: hash, updatedAt: new Date() })
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));

  // Drizzle returns [ResultSetHeader, ...] for mysql2. affectedRows tells us
  // whether we actually touched a row.
  const header = Array.isArray(result) ? result[0] : result;
  const affected =
    header && typeof header === "object" && "affectedRows" in header
      ? (header as { affectedRows: number }).affectedRows
      : undefined;

  if (affected === 0) {
    throw new Error(
      `No credential account row found for user id ${userId}. Refusing to create one silently.`
    );
  }

  return affected;
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL ?? "admin@3dninjaz.com";
  const password = process.env.ADMIN_PASSWORD ?? "changeme123";
  const resetMode = process.env.ADMIN_RESET_PASSWORD === "1";
  const name = "3D Ninjaz Admin";

  const existing = await db
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existing.length > 0) {
    const current = existing[0];

    // Promote to admin if needed (pre-existing behaviour, kept for
    // backward compatibility).
    if (current.role !== "admin") {
      await db
        .update(user)
        .set({ role: "admin" })
        .where(eq(user.id, current.id));
      console.log(
        `[seed-admin] existing user ${email} promoted to admin role.`
      );
    }

    if (resetMode) {
      try {
        const affected = await rotatePassword(current.id, password);
        console.log(
          `[seed-admin] password rotated for ${email} (user id ${current.id}, account rows updated: ${affected}).`
        );
      } catch (err) {
        console.error("[seed-admin] password rotation failed:", err);
        process.exit(1);
      }
      return;
    }

    console.log(
      `[seed-admin] admin user ${email} already exists, skipping. ` +
        `Set ADMIN_RESET_PASSWORD=1 to rotate the password.`
    );
    return;
  }

  // Create path — user does not exist yet.
  if (resetMode) {
    console.error(
      `[seed-admin] ADMIN_RESET_PASSWORD=1 was set but no user exists for ${email}. Aborting.`
    );
    process.exit(1);
  }

  try {
    // Better Auth's signUp endpoint will create the user and a password
    // credential row in the account table. We use signUp over createUser so
    // the password hashing pipeline matches what sign-in expects.
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
    });

    if (!signUpResult || !("user" in signUpResult) || !signUpResult.user) {
      throw new Error("signUpEmail did not return a user");
    }

    // signUp creates the user with the default role ("customer" per D-08).
    // Promote to admin via direct Drizzle update.
    await db
      .update(user)
      .set({ role: "admin" })
      .where(eq(user.id, signUpResult.user.id));

    console.log(
      `[seed-admin] admin user created: ${email} (id=${signUpResult.user.id})`
    );
  } catch (err) {
    console.error("[seed-admin] failed to create admin:", err);
    process.exit(1);
  }
}

seedAdmin()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("[seed-admin] unexpected error:", err);
    process.exit(1);
  });
