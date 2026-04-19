/**
 * Seed script to create the first admin user.
 *
 * Run with: npm run seed:admin
 * (which runs `tsx --env-file=.env.local scripts/seed-admin.ts`)
 *
 * Reads ADMIN_EMAIL / ADMIN_PASSWORD from env, falls back to safe defaults.
 * If the user already exists, the script exits successfully without error.
 */

import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { user } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL ?? "admin@3dninjaz.com";
  const password = process.env.ADMIN_PASSWORD ?? "changeme123";
  const name = "3D Ninjaz Admin";

  // Check if the user already exists up-front so we can give a clean message
  // without relying on Better Auth's error shape.
  const existing = await db
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existing.length > 0) {
    const current = existing[0];
    if (current.role !== "admin") {
      await db
        .update(user)
        .set({ role: "admin" })
        .where(eq(user.id, current.id));
      console.log(
        `[seed-admin] existing user ${email} promoted to admin role.`
      );
    } else {
      console.log(`[seed-admin] admin user ${email} already exists, skipping.`);
    }
    return;
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
