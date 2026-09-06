"use server";

import { db } from "@/lib/db";
import { shippingRates, shippingFallbackRates } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  shippingRateSchema,
  MALAYSIAN_STATES,
} from "@/lib/validators";
import { getStoreSettingsCached } from "@/lib/store-settings";
import { getFallbackShippingRate } from "@/lib/shipping-fallback";

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
  weightKg = 1,
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

  // 260906: this used to read shipping_rates.flat_rate and return whatever it
  // found — including 0.00, which is what every one of the 16 MY state rows
  // held since the 2026-04-19 seed. Callers took that as "shipping is free"
  // and it silently zeroed real orders. A zero here now means "no rate
  // configured" and routes to the weight-bracketed fallback table instead.
  const fallback = await getFallbackShippingRate(state, weightKg);
  if (fallback) {
    return { cost: fallback.cost, freeShipApplied: false };
  }

  // Nothing configured anywhere. Return 0 so a UI estimate still renders, but
  // make the gap loud — order-creating paths use autoQuoteShipping, which
  // refuses to write a silent zero.
  console.warn(
    "[admin-shipping] no shipping rate configured for state=%s (weight %skg) — returning 0; seed brackets via scripts/shipping-fallback-rates-migrate.cjs",
    state,
    weightKg,
  );
  return { cost: 0, freeShipApplied: false };
}

// ── Weight-bracketed fallback rates (260906) ──────────────────────────────────

export type FallbackRateRow = {
  id: string;
  state: string;
  maxWeightKg: string;
  rate: string;
  source: "seed" | "learned" | "manual";
  updatedAt: Date;
};

/**
 * Every fallback bracket, ordered by the MY state tuple then ascending weight,
 * so the admin grid renders in a stable order.
 */
export async function listFallbackRates(): Promise<FallbackRateRow[]> {
  await requireAdmin();

  const rows = await db.select().from(shippingFallbackRates);
  const order = new Map<string, number>(MALAYSIAN_STATES.map((s, i) => [s, i]));
  rows.sort((a, b) => {
    const byState = (order.get(a.state) ?? 99) - (order.get(b.state) ?? 99);
    if (byState !== 0) return byState;
    return Number(a.maxWeightKg) - Number(b.maxWeightKg);
  });
  return rows.map((r) => ({
    id: r.id,
    state: r.state,
    maxWeightKg: r.maxWeightKg,
    rate: r.rate,
    source: r.source,
    updatedAt: r.updatedAt,
  }));
}

/**
 * Persist admin edits. Every touched row is marked source='manual' so the
 * runtime learner (which writes 'learned' rows from real Delyva quotes) never
 * overwrites an operator's number.
 */
export async function updateFallbackRates(
  entries: Array<{ id: string; rate: string }>,
): Promise<UpdateResult> {
  await requireAdmin();
  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: false, error: "No rates supplied" };
  }
  for (const e of entries) {
    if (!/^\d+(\.\d{1,2})?$/.test(String(e.rate).trim())) {
      return { ok: false, error: `Invalid rate "${e.rate}" — use e.g. 10.90` };
    }
  }
  await db.transaction(async (tx) => {
    for (const e of entries) {
      await tx
        .update(shippingFallbackRates)
        .set({ rate: String(e.rate).trim(), source: "manual" })
        .where(eq(shippingFallbackRates.id, e.id));
    }
  });
  revalidatePath("/admin/shipping");
  return { ok: true };
}
