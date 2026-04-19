"use server";

/**
 * Customer-side address book actions for /account/addresses CRUD + the
 * /checkout AddressPicker (Plan 06-03, CUST-03).
 *
 * THREAT MODEL:
 *  - T-06-03-auth: requireUser() FIRST await on every export — CVE-2025-29927
 *  - T-06-03-IDOR: ownership predicate (`eq(addresses.userId, session.user.id)`)
 *    in every read AND mutate WHERE clause. No separate ownership SELECT
 *    that could TOCTOU.
 *  - T-06-03-enumeration: getMyAddress returns null for both missing AND
 *    not-yours; the page renders notFound() so HTTP responses are identical.
 *  - T-06-03-integrity: setDefault flips wrapped in db.transaction so the
 *    "exactly one default per user" invariant is never broken (MariaDB has
 *    no clean partial unique index — enforced at app layer).
 *  - T-06-03-cap: count() check before insert blocks > 10 addresses per user.
 */

import { and, count, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { addresses } from "@/lib/db/schema";
import { addressBookSchema } from "@/lib/validators";
import { requireUser } from "@/lib/auth-helpers";

const MAX_ADDRESSES = 10; // 06-CONTEXT Assumption 8

export async function listMyAddresses() {
  const session = await requireUser();
  return db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, session.user.id))
    .orderBy(desc(addresses.isDefault), desc(addresses.updatedAt));
}

export async function getMyAddress(id: string) {
  const session = await requireUser();
  if (typeof id !== "string" || id.length === 0) return null;
  const [row] = await db
    .select()
    .from(addresses)
    .where(
      and(eq(addresses.id, id), eq(addresses.userId, session.user.id)),
    )
    .limit(1);
  return row ?? null;
}

export async function createAddress(input: unknown) {
  const session = await requireUser();
  const parsed = addressBookSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }

  // Address cap (06-CONTEXT Assumption 8) — block 11th insert.
  const [{ c }] = await db
    .select({ c: count() })
    .from(addresses)
    .where(eq(addresses.userId, session.user.id));
  if (Number(c) >= MAX_ADDRESSES) {
    return {
      ok: false as const,
      error: `You can save up to ${MAX_ADDRESSES} addresses.`,
    };
  }

  const id = randomUUID();
  await db.transaction(async (tx) => {
    if (parsed.data.isDefault) {
      // Clear any prior default in the same transaction.
      await tx
        .update(addresses)
        .set({ isDefault: false })
        .where(eq(addresses.userId, session.user.id));
    }
    await tx.insert(addresses).values({
      id,
      userId: session.user.id,
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      line1: parsed.data.line1,
      line2: parsed.data.line2 ?? null,
      city: parsed.data.city,
      state: parsed.data.state,
      postcode: parsed.data.postcode,
      country: parsed.data.country,
      isDefault: parsed.data.isDefault,
    });
  });
  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
  return { ok: true as const, id };
}

export async function updateAddress(id: string, input: unknown) {
  const session = await requireUser();
  const parsed = addressBookSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }

  // Ownership gate before mutation (T-06-03-IDOR). getMyAddress already
  // gates on userId in WHERE, so a not-yours id returns null identical to
  // a missing one.
  const existing = await getMyAddress(id);
  if (!existing) {
    return { ok: false as const, error: "Address not found." };
  }

  await db.transaction(async (tx) => {
    if (parsed.data.isDefault && !existing.isDefault) {
      await tx
        .update(addresses)
        .set({ isDefault: false })
        .where(eq(addresses.userId, session.user.id));
    }
    await tx
      .update(addresses)
      .set({
        fullName: parsed.data.fullName,
        phone: parsed.data.phone,
        line1: parsed.data.line1,
        line2: parsed.data.line2 ?? null,
        city: parsed.data.city,
        state: parsed.data.state,
        postcode: parsed.data.postcode,
        country: parsed.data.country,
        isDefault: parsed.data.isDefault,
      })
      .where(
        and(eq(addresses.id, id), eq(addresses.userId, session.user.id)),
      );
  });
  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
  return { ok: true as const };
}

export async function deleteAddress(id: string) {
  const session = await requireUser();
  // Ownership gate in WHERE — no separate SELECT needed.
  await db
    .delete(addresses)
    .where(
      and(eq(addresses.id, id), eq(addresses.userId, session.user.id)),
    );
  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
  return { ok: true as const };
}

export async function setDefaultAddress(id: string) {
  const session = await requireUser();
  const existing = await getMyAddress(id);
  if (!existing) {
    return { ok: false as const, error: "Address not found." };
  }
  await db.transaction(async (tx) => {
    await tx
      .update(addresses)
      .set({ isDefault: false })
      .where(eq(addresses.userId, session.user.id));
    await tx
      .update(addresses)
      .set({ isDefault: true })
      .where(
        and(eq(addresses.id, id), eq(addresses.userId, session.user.id)),
      );
  });
  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
  return { ok: true as const };
}

export type SavedAddress = Awaited<ReturnType<typeof listMyAddresses>>[number];
