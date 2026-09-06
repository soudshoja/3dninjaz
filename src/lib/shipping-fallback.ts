import "server-only";
import { and, asc, eq, gte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { shippingFallbackRates, shippingRates } from "@/lib/db/schema";

// ============================================================================
// Weight-bracketed shipping fallback (260906).
//
// Used ONLY when a live Delyva quote is unavailable. Before this existed the
// fallback was `shipping_rates.flat_rate`, which had been 0.00 for all 16
// states since the 2026-04-19 seed — so every fallback silently shipped free.
//
// Two problems fixed here:
//   1. A zero rate is treated as "unset", never as "free". Free shipping is a
//      deliberate decision (the free-ship threshold), never a data gap.
//   2. One flat rate per state cannot be right. Observed Delyva prices for the
//      SAME state span RM5.00 / 5.60 / 6.30 / 10.50 purely on parcel weight,
//      so the fallback is bracketed by weight and learns from real quotes.
// ============================================================================

/** Bracket ceilings in kg, ascending. Mirrors the migration seed. */
export const FALLBACK_BRACKETS_KG = [0.5, 1, 2, 3, 5, 10, 20, 30] as const;

/**
 * Round a parcel weight up to the bracket the fallback table is keyed on.
 * Anything above the top bracket clamps to it — the 30 kg Delyva single-parcel
 * cap is enforced upstream, so this only guards against odd data.
 */
export function bracketForWeight(weightKg: number): number {
  const w = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 0.5;
  for (const b of FALLBACK_BRACKETS_KG) {
    if (w <= b) return b;
  }
  return FALLBACK_BRACKETS_KG[FALLBACK_BRACKETS_KG.length - 1];
}

export type FallbackRate = {
  cost: number;
  /** Bracket ceiling (kg) the rate was read from. */
  bracketKg: number;
  source: "seed" | "learned" | "manual" | "legacy";
};

/**
 * Look up the fallback rate for a destination state and parcel weight.
 *
 * Ladder:
 *   1. shipping_fallback_rates — first bracket >= weight (learned rates win
 *      simply by being the row that is there).
 *   2. shipping_rates.flat_rate — legacy single-rate table, if non-zero.
 *   3. null — no usable rate. Callers MUST surface this, never coerce to 0.
 */
export async function getFallbackShippingRate(
  state: string,
  weightKg: number,
): Promise<FallbackRate | null> {
  const bracket = bracketForWeight(weightKg);

  const rows = await db
    .select({
      rate: shippingFallbackRates.rate,
      maxWeightKg: shippingFallbackRates.maxWeightKg,
      source: shippingFallbackRates.source,
    })
    .from(shippingFallbackRates)
    .where(
      and(
        eq(shippingFallbackRates.state, state),
        gte(shippingFallbackRates.maxWeightKg, String(bracket)),
      ),
    )
    .orderBy(asc(shippingFallbackRates.maxWeightKg))
    .limit(1);

  const row = rows[0];
  if (row) {
    const cost = Number(row.rate);
    if (Number.isFinite(cost) && cost > 0) {
      return {
        cost: Math.round(cost * 100) / 100,
        bracketKg: Number(row.maxWeightKg),
        source: row.source,
      };
    }
  }

  // Legacy flat table — only trusted when it carries a real (non-zero) value.
  const [legacy] = await db
    .select({ flatRate: shippingRates.flatRate })
    .from(shippingRates)
    .where(eq(shippingRates.state, state))
    .limit(1);

  if (legacy) {
    const cost = Number(legacy.flatRate);
    if (Number.isFinite(cost) && cost > 0) {
      return { cost: Math.round(cost * 100) / 100, bracketKg: bracket, source: "legacy" };
    }
  }

  console.warn(
    "[shipping-fallback] no usable fallback rate for state=%s weight=%skg (bracket %skg) — run scripts/shipping-fallback-rates-migrate.cjs",
    state,
    weightKg,
    bracket,
  );
  return null;
}

/**
 * Record a real Delyva price so the fallback tracks live courier pricing
 * instead of freezing at the seeded estimate. Called after every successful
 * quote; best-effort, never allowed to break the quote it learned from.
 *
 * Admin-edited rows (source='manual') are left alone — an operator override
 * outranks the learner.
 */
export async function learnShippingRate(
  state: string,
  weightKg: number,
  cost: number,
): Promise<void> {
  if (!state || !Number.isFinite(cost) || cost <= 0) return;
  const bracket = bracketForWeight(weightKg);

  try {
    const [existing] = await db
      .select({
        id: shippingFallbackRates.id,
        rate: shippingFallbackRates.rate,
        source: shippingFallbackRates.source,
      })
      .from(shippingFallbackRates)
      .where(
        and(
          eq(shippingFallbackRates.state, state),
          eq(shippingFallbackRates.maxWeightKg, bracket.toFixed(3)),
        ),
      )
      .limit(1);

    const value = (Math.round(cost * 100) / 100).toFixed(2);

    if (!existing) {
      await db.insert(shippingFallbackRates).values({
        id: randomUUID(),
        state,
        maxWeightKg: bracket.toFixed(3),
        rate: value,
        source: "learned",
      });
      return;
    }

    if (existing.source === "manual") return; // operator override wins
    if (Number(existing.rate) === Number(value)) return; // no-op write

    await db
      .update(shippingFallbackRates)
      .set({ rate: value, source: "learned" })
      .where(eq(shippingFallbackRates.id, existing.id));
  } catch (err) {
    // Learning is an optimisation. A failure here must never fail a checkout.
    console.warn("[shipping-fallback] learn failed for %s @ %skg:", state, weightKg, err);
  }
}
