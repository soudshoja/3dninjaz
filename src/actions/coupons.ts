"use server";

import { db } from "@/lib/db";
import { coupons, couponRedemptions } from "@/lib/db/schema";
import { eq, and, isNull, lt, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getSessionUser } from "@/lib/auth-helpers";
import { couponRedemptionInputSchema } from "@/lib/validators";
import {
  applyCouponToSubtotal,
  CouponValidationError,
  type CouponSnapshot,
} from "@/lib/pricing";

// ============================================================================
// Plan 05-03 customer-facing coupon validation + redemption.
//
// SECURITY (T-05-03-tampering / D3-07):
//   - validateCoupon and redeemCoupon NEVER trust client-supplied amounts.
//   - The server re-fetches the coupon row by code and recomputes the
//     discount via applyCouponToSubtotal.
//   - validateCoupon requires a session (T-05-03-enumeration — anon cannot
//     scrape valid codes).
//
// SECURITY (T-05-03-state):
//   - redeemCoupon uses a conditional UPDATE that increments usage_count
//     only when usage_cap is null OR usage_count < usage_cap. Two
//     concurrent customers with usage_cap=1 cannot both succeed.
// ============================================================================

export type CouponValidation =
  | {
      ok: true;
      couponId: string;
      code: string;
      type: "percentage" | "fixed";
      discount: number;
      finalTotal: number;
    }
  | { ok: false; error: string };

function rowToSnapshot(row: typeof coupons.$inferSelect): CouponSnapshot {
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
  };
}

/**
 * Validate a coupon against a server-derived subtotal. Read-only — does NOT
 * mutate usage_count. Called as the user types/applies the code on /checkout.
 */
export async function validateCoupon(
  code: string,
  subtotalMYR: number,
): Promise<CouponValidation> {
  // T-05-03-enumeration — require a session so anonymous bots cannot crawl
  // codes via timing-attack guesses.
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return { ok: false, error: "Sign in to apply a coupon" };
  }

  // Normalise + validate code shape before DB lookup.
  const upper = String(code ?? "")
    .toUpperCase()
    .trim();
  const parsed = couponRedemptionInputSchema.safeParse({ code: upper });
  if (!parsed.success) {
    return { ok: false, error: "Invalid code format" };
  }

  const [row] = await db
    .select()
    .from(coupons)
    .where(eq(coupons.code, parsed.data.code))
    .limit(1);
  if (!row) return { ok: false, error: "Invalid coupon code" };

  const snapshot = rowToSnapshot(row);
  try {
    const { discount, finalTotal } = applyCouponToSubtotal(
      Math.max(0, Number(subtotalMYR) || 0),
      snapshot,
    );
    return {
      ok: true,
      couponId: row.id,
      code: row.code,
      type: row.type,
      discount,
      finalTotal,
    };
  } catch (e) {
    if (e instanceof CouponValidationError) {
      return { ok: false, error: e.userMessage };
    }
    throw e;
  }
}

export type RedeemResult =
  | { ok: true; amountApplied: number }
  | { ok: false; error: string };

/**
 * Atomically redeem a coupon — called from the order capture flow AFTER the
 * order row is created and PayPal capture succeeded. Uses a conditional
 * UPDATE so a race cannot oversell on usage_cap.
 *
 * Returns ok:false on any race loss (zero affectedRows). Caller should NOT
 * roll back the order if redemption fails — the customer already paid; we
 * just lose the discount.
 */
export async function redeemCoupon(
  couponId: string,
  orderId: string,
  userId: string,
  subtotalMYR: number,
): Promise<RedeemResult> {
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(coupons)
      .where(eq(coupons.id, couponId))
      .limit(1);
    if (!row) return { ok: false, error: "Coupon not found" };

    const snapshot = rowToSnapshot(row);
    let discount: number;
    try {
      const res = applyCouponToSubtotal(subtotalMYR, snapshot);
      discount = res.discount;
    } catch (e) {
      const msg =
        e instanceof CouponValidationError ? e.userMessage : "Coupon invalid";
      return { ok: false, error: msg };
    }

    // Conditional atomic increment.
    // SET usage_count = usage_count + 1
    //   WHERE id=? AND (usage_cap IS NULL OR usage_count < usage_cap)
    const result = await tx
      .update(coupons)
      .set({ usageCount: sql`${coupons.usageCount} + 1` })
      .where(
        and(
          eq(coupons.id, couponId),
          or(
            isNull(coupons.usageCap),
            lt(coupons.usageCount, coupons.usageCap),
          ),
        ),
      );

    // mysql2 driver wraps the result; affectedRows is on the first element of
    // the tuple (Drizzle returns the raw [ResultSetHeader, FieldPacket[]]).
    const affected =
      (result as unknown as Array<{ affectedRows?: number }>)[0]
        ?.affectedRows ?? 0;
    if (affected === 0) {
      return { ok: false, error: "Coupon has just been fully redeemed" };
    }

    await tx.insert(couponRedemptions).values({
      id: randomUUID(),
      couponId,
      orderId,
      userId,
      amountApplied: discount.toFixed(2),
    });

    return { ok: true, amountApplied: discount };
  });
}
