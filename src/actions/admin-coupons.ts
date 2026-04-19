"use server";

import { db } from "@/lib/db";
import { coupons, couponRedemptions } from "@/lib/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth-helpers";
import { couponSchema } from "@/lib/validators";

// ============================================================================
// Plan 05-03 admin coupon CRUD.
//
// IMPORTANT (T-05-03-EoP):
//   requireAdmin() FIRST await in every export.
//
// IMPORTANT (T-05-03-immutable-code):
//   updateCoupon strips `code` from the UPDATE payload — coupon codes must
//   remain stable after issuance so audit trails line up with real codes.
//
// IMPORTANT (T-05-03-delete-audit):
//   deleteCoupon refuses if any redemption references the coupon. Admin
//   must deactivate instead (preserves PDPA audit trail).
// ============================================================================

export type CouponListRow = {
  id: string;
  code: string;
  type: "percentage" | "fixed";
  amount: string;
  minSpend: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageCap: number | null;
  usageCount: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export async function listCoupons(): Promise<CouponListRow[]> {
  await requireAdmin();
  const rows = await db
    .select()
    .from(coupons)
    .orderBy(desc(coupons.createdAt));
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    type: r.type,
    amount: r.amount,
    minSpend: r.minSpend ?? null,
    startsAt: r.startsAt ?? null,
    endsAt: r.endsAt ?? null,
    usageCap: r.usageCap ?? null,
    usageCount: r.usageCount,
    active: !!r.active,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function getCoupon(id: string): Promise<CouponListRow | null> {
  await requireAdmin();
  const [row] = await db
    .select()
    .from(coupons)
    .where(eq(coupons.id, id))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    amount: row.amount,
    minSpend: row.minSpend ?? null,
    startsAt: row.startsAt ?? null,
    endsAt: row.endsAt ?? null,
    usageCap: row.usageCap ?? null,
    usageCount: row.usageCount,
    active: !!row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type MutateResult = { ok: true; id?: string } | { ok: false; error: string };

function parseCouponForm(formData: FormData) {
  return couponSchema.safeParse({
    code: String(formData.get("code") ?? "").toUpperCase().trim(),
    type: formData.get("type"),
    amount: formData.get("amount"),
    minSpend: formData.get("minSpend") || null,
    startsAt: formData.get("startsAt") || null,
    endsAt: formData.get("endsAt") || null,
    usageCap: formData.get("usageCap") || null,
    active: formData.get("active") === "true",
  });
}

export async function createCoupon(
  formData: FormData,
): Promise<MutateResult> {
  await requireAdmin();
  const parsed = parseCouponForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const data = parsed.data;

  const id = randomUUID();
  try {
    await db.insert(coupons).values({
      id,
      code: data.code,
      type: data.type,
      amount: data.amount,
      minSpend: data.minSpend ?? null,
      startsAt: data.startsAt ? new Date(data.startsAt) : null,
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
      usageCap: data.usageCap ?? null,
      usageCount: 0,
      active: data.active,
    });
  } catch (err: unknown) {
    const raw = String((err as Error)?.message ?? "");
    if (raw.includes("ER_DUP_ENTRY") || raw.includes("Duplicate entry")) {
      return { ok: false, error: "Code already exists" };
    }
    console.error("[admin-coupons] createCoupon failed:", err);
    return { ok: false, error: "Unable to create coupon" };
  }
  revalidatePath("/admin/coupons");
  return { ok: true, id };
}

export async function updateCoupon(
  id: string,
  formData: FormData,
): Promise<MutateResult> {
  await requireAdmin();
  const parsed = parseCouponForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const data = parsed.data;

  // T-05-03-immutable-code — strip code from the update payload.
  await db
    .update(coupons)
    .set({
      type: data.type,
      amount: data.amount,
      minSpend: data.minSpend ?? null,
      startsAt: data.startsAt ? new Date(data.startsAt) : null,
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
      usageCap: data.usageCap ?? null,
      active: data.active,
    })
    .where(eq(coupons.id, id));

  revalidatePath("/admin/coupons");
  revalidatePath(`/admin/coupons/${id}/edit`);
  return { ok: true, id };
}

export async function deactivateCoupon(id: string): Promise<MutateResult> {
  await requireAdmin();
  await db.update(coupons).set({ active: false }).where(eq(coupons.id, id));
  revalidatePath("/admin/coupons");
  return { ok: true };
}

export async function reactivateCoupon(id: string): Promise<MutateResult> {
  await requireAdmin();
  await db.update(coupons).set({ active: true }).where(eq(coupons.id, id));
  revalidatePath("/admin/coupons");
  return { ok: true };
}

export async function deleteCoupon(id: string): Promise<MutateResult> {
  await requireAdmin();

  // T-05-03-delete-audit — refuse if redemptions exist
  const [redRow] = await db
    .select({ c: count() })
    .from(couponRedemptions)
    .where(eq(couponRedemptions.couponId, id));
  if (Number(redRow?.c ?? 0) > 0) {
    return {
      ok: false,
      error:
        "Cannot delete — coupon has redemptions. Deactivate instead to preserve the audit trail.",
    };
  }
  await db.delete(coupons).where(eq(coupons.id, id));
  revalidatePath("/admin/coupons");
  return { ok: true };
}
