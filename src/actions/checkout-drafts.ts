"use server";

import { db } from "@/lib/db";
import { checkoutDrafts } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getSessionUser, requireAdmin } from "@/lib/auth-helpers";
import { normalizeMsisdn } from "@/lib/order-dedupe";
import { revalidatePath } from "next/cache";

/**
 * Checkout-draft actions (2026-06-13).
 *
 * saveCheckoutDraft is PUBLIC by design — guests at /checkout call it the
 * moment name + phone are typed, so the admin can see "had a booking but
 * didn't pay" even when the customer never presses a pay button. Inputs are
 * length-clamped and the bag snapshot is rebuilt field-by-field server-side;
 * nothing here is trusted for money (drafts are informational only).
 */

type DraftItemInput = {
  name?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  lineTotal?: unknown;
};

type SaveDraftInput = {
  /** Per-browser localStorage key — upsert target. */
  draftKey: string;
  recipientName: string;
  phone: string;
  email?: string | null;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postcode?: string;
  } | null;
  items?: DraftItemInput[] | null;
  subtotal?: number | null;
};

const clamp = (v: unknown, max: number) =>
  typeof v === "string" ? v.slice(0, max).trim() : "";

export async function saveCheckoutDraft(
  input: SaveDraftInput,
): Promise<{ ok: boolean }> {
  try {
    const draftKey = clamp(input?.draftKey, 64);
    const recipientName = clamp(input?.recipientName, 200);
    const phone = clamp(input?.phone, 32);
    const phoneNorm = normalizeMsisdn(phone);
    // Require a sane key + the two traceability fields before storing.
    if (!/^[A-Za-z0-9-]{8,64}$/.test(draftKey)) return { ok: false };
    if (!recipientName || phoneNorm.length < 8) return { ok: false };

    const user = await getSessionUser();
    const email = clamp(input?.email, 255) || null;

    const a = input?.address ?? null;
    const addressJson = a
      ? JSON.stringify({
          line1: clamp(a.line1, 200),
          line2: clamp(a.line2, 200),
          city: clamp(a.city, 100),
          state: clamp(a.state, 64),
          postcode: clamp(a.postcode, 10),
        })
      : null;

    const items = Array.isArray(input?.items)
      ? input.items.slice(0, 50).map((it) => ({
          name: clamp(it?.name, 200),
          quantity: Math.max(1, Math.min(999, Math.floor(Number(it?.quantity) || 1))),
          unitPrice: String(Number(it?.unitPrice) || 0),
          lineTotal: String(Number(it?.lineTotal) || 0),
        }))
      : [];
    const itemsJson = JSON.stringify(items);
    const subtotal = (Math.max(0, Number(input?.subtotal) || 0)).toFixed(2);

    await db
      .insert(checkoutDrafts)
      .values({
        id: randomUUID(),
        draftKey,
        userId: user?.id ?? null,
        recipientName,
        phone,
        phoneNorm,
        email,
        addressJson,
        itemsJson,
        subtotal,
        status: "open",
      })
      .onDuplicateKeyUpdate({
        set: {
          userId: user?.id ?? null,
          recipientName,
          phone,
          phoneNorm,
          email,
          addressJson,
          itemsJson,
          subtotal,
          // A returning customer editing the same browser draft re-opens it.
          status: "open",
        },
      });
    return { ok: true };
  } catch (err) {
    console.error("[checkout-drafts] save failed:", err);
    return { ok: false };
  }
}

export type AdminDraftRow = {
  id: string;
  recipientName: string;
  phone: string;
  email: string | null;
  address: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postcode?: string;
  } | null;
  items: { name: string; quantity: number; unitPrice: string; lineTotal: string }[];
  subtotal: string;
  status: "open" | "converted" | "dismissed";
  createdAt: Date;
  updatedAt: Date;
};

/** Admin: list drafts, open first then most recently touched. */
export async function listCheckoutDrafts(): Promise<AdminDraftRow[]> {
  await requireAdmin();
  const rows = await db
    .select()
    .from(checkoutDrafts)
    .orderBy(desc(checkoutDrafts.updatedAt))
    .limit(200);
  // JSON columns come back as LONGTEXT strings on MariaDB — parse defensively.
  const parse = <T,>(raw: string | null, fallback: T): T => {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  };
  return rows.map((r) => ({
    id: r.id,
    recipientName: r.recipientName,
    phone: r.phone,
    email: r.email,
    address: parse(r.addressJson, null),
    items: parse(r.itemsJson, []),
    subtotal: r.subtotal,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

/** Admin: hide a draft that was followed up or is junk. */
export async function dismissCheckoutDraft(
  id: string,
): Promise<{ ok: boolean }> {
  await requireAdmin();
  await db
    .update(checkoutDrafts)
    .set({ status: "dismissed" })
    .where(eq(checkoutDrafts.id, id));
  revalidatePath("/admin/drafts");
  return { ok: true };
}
