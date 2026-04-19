"use server";

import { db } from "@/lib/db";
import { shippingRates } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  shippingRateSchema,
  MALAYSIAN_STATES,
} from "@/lib/validators";
import { getStoreSettingsCached } from "@/lib/store-settings";

// ============================================================================
// Plan 05-04 admin shipping rates + customer-side getShippingRate.
//
// IMPORTANT (T-05-04-EoP): requireAdmin() FIRST in admin actions.
// IMPORTANT (T-05-04-tampering): getShippingRate is read-only and customer-
// safe; the shipping cost is computed server-side from the DB row + the
// server-derived subtotal — client cannot inflate either.
//
// Seed: listShippingRates lazy-seeds 16 MY state rows at 0.00 if the table
// is empty. (The Phase 5 migration script also seeds; this is defense-in-
// depth in case the DB was recreated and the migration wasn't re-run.)
// ============================================================================

export type ShippingRateRow = {
  id: string;
  state: string;
  flatRate: string;
  updatedAt: Date;
};

export async function listShippingRates(): Promise<ShippingRateRow[]> {
  await requireAdmin();

  let rows = await db.select().from(shippingRates);
  if (rows.length === 0) {
    await db.insert(shippingRates).values(
      MALAYSIAN_STATES.map((state) => ({
        id: randomUUID(),
        state,
        flatRate: "0.00",
      })),
    );
    rows = await db.select().from(shippingRates);
  }
  // Order by MALAYSIAN_STATES tuple for predictable form rendering.
  const order = new Map<string, number>(
    MALAYSIAN_STATES.map((s, i) => [s, i]),
  );
  rows.sort(
    (a, b) =>
      (order.get(a.state) ?? 99) - (order.get(b.state) ?? 99),
  );
  return rows.map((r) => ({
    id: r.id,
    state: r.state,
    flatRate: r.flatRate,
    updatedAt: r.updatedAt,
  }));
}

type UpdateResult = { ok: true } | { ok: false; error: string };

export async function updateShippingRates(
  entries: Array<{ state: string; flatRate: string }>,
): Promise<UpdateResult> {
  await requireAdmin();
  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: false, error: "No rates supplied" };
  }
  for (const e of entries) {
    const parsed = shippingRateSchema.safeParse(e);
    if (!parsed.success) {
      return {
        ok: false,
        error: `${e.state}: ${parsed.error.issues[0].message}`,
      };
    }
  }
  await db.transaction(async (tx) => {
    for (const e of entries) {
      await tx
        .update(shippingRates)
        .set({ flatRate: e.flatRate })
        .where(eq(shippingRates.state, e.state));
    }
  });
  revalidatePath("/admin/shipping");
  revalidatePath("/checkout");
  return { ok: true };
}

/**
 * Customer-safe shipping cost lookup. Returns 0 + freeShipApplied=true when
 * subtotal meets the free-ship threshold; otherwise the per-state flat rate.
 *
 * No requireAdmin() — callable from the customer-side checkout flow.
 */
export async function getShippingRate(
  state: string,
  subtotalMYR: number,
): Promise<{ cost: number; freeShipApplied: boolean }> {
  const settings = await getStoreSettingsCached();
  const threshold = settings.freeShipThreshold
    ? parseFloat(settings.freeShipThreshold)
    : null;
  if (
    threshold !== null &&
    Number.isFinite(threshold) &&
    subtotalMYR >= threshold
  ) {
    return { cost: 0, freeShipApplied: true };
  }
  const [row] = await db
    .select()
    .from(shippingRates)
    .where(eq(shippingRates.state, state))
    .limit(1);
  if (!row) {
    // Defensive: state not in our table (data drift). Return 0 — operator
    // sees the issue when reconciling orders.
    return { cost: 0, freeShipApplied: false };
  }
  return { cost: parseFloat(row.flatRate), freeShipApplied: false };
}
