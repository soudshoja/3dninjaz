import "server-only";
import { loadShippingConfig } from "@/lib/shipping-config";
import { computeCartQuote } from "@/lib/shipping-quote-core";
import { getFallbackShippingRate } from "@/lib/shipping-fallback";
import type {
  CartDestination,
  CartItemForQuote,
} from "@/lib/shipping-quote-types";

// ============================================================================
// autoQuoteShipping — the single entry point for "an order is being created
// and it has an address; what do we charge for shipping?" (260906)
//
// Every order-creating path uses this: PayPal capture, bank-transfer /
// WhatsApp checkout, admin POS, draft -> order conversion and manual orders.
// Before this existed only the two customer paths quoted Delyva; the admin
// paths read a flat table that was 0.00 for all 16 states, so admin-created
// orders shipped free (6 of 21 on prod).
//
// Ladder, in order:
//   1. Cheapest enabled Delyva service for the real cart weight.
//   2. Weight-bracketed fallback table (which the quote path keeps current).
//   3. `null` cost + `reason` — the caller decides. Nobody silently gets 0.
//
// The distinction that matters: `cost: 0` is a legitimate answer ONLY when
// `freeShipApplied` is true (the configured free-shipping threshold was met).
// A missing rate returns `estimated: true` with the reason, or a null cost —
// never a quiet zero.
// ============================================================================

export type AutoQuote = {
  cost: number;
  serviceCode: string | null;
  serviceName: string | null;
  weightKg: number;
  /** true when the price came from the fallback table, not a live quote. */
  estimated: boolean;
  /** true when the free-shipping threshold zeroed a real quote. */
  freeShipApplied: boolean;
  /** Set when the live quote failed; explains why we fell back. */
  reason?: string;
};

export type AutoQuoteResult =
  | { ok: true; quote: AutoQuote }
  | { ok: false; error: string; weightKg: number };

function hasUsableAddress(d: CartDestination | null | undefined): d is CartDestination {
  return !!(
    d &&
    d.state &&
    d.postcode &&
    /^\d{5}$/.test(String(d.postcode).trim())
  );
}

/**
 * Estimate parcel weight without a Delyva call — used only to pick the right
 * fallback bracket when the quote itself failed. Mirrors the core engine's
 * final tier (defaultWeightKg per unit) rather than re-reading every product,
 * because if Delyva is down we want a cheap answer, not a second round-trip.
 */
async function estimateWeightKg(items: CartItemForQuote[]): Promise<number> {
  try {
    const cfg = await loadShippingConfig();
    const per = Number(cfg.defaultWeightKg);
    const unit = Number.isFinite(per) && per > 0 ? per : 0.5;
    const qty = items.reduce((n, i) => n + (Number(i.quantity) || 0), 0);
    return qty > 0 ? unit * qty : unit;
  } catch {
    return 0.5;
  }
}

/**
 * Price shipping for an order being created.
 *
 * @param preferredServiceCode honour an admin/customer courier choice when it
 *   is still offered; otherwise the cheapest enabled service is used.
 */
export async function autoQuoteShipping(
  items: CartItemForQuote[],
  destination: CartDestination | null | undefined,
  preferredServiceCode?: string | null,
): Promise<AutoQuoteResult> {
  if (!hasUsableAddress(destination)) {
    // Quotations and half-finished drafts land here. There is nothing to
    // quote against, so say so — the admin books a courier on the order page
    // once a real address exists, which re-runs this via refreshOrderShipping.
    const weightKg = await estimateWeightKg(items ?? []);
    return {
      ok: false,
      error: "No valid Malaysian shipping address (needs state + 5-digit postcode).",
      weightKg,
    };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "No items to quote.", weightKg: 0 };
  }

  let quoteError = "Delyva quote unavailable";
  let weightKg = 0;

  try {
    const q = await computeCartQuote(items, destination);
    if (q.ok) {
      weightKg = q.weightKg;
      if (q.options.length > 0) {
        const preferred = preferredServiceCode
          ? q.options.find((o) => o.serviceCode === preferredServiceCode)
          : undefined;
        const chosen =
          preferred ??
          [...q.options].sort((a, b) => a.finalPrice - b.finalPrice)[0];

        return {
          ok: true,
          quote: {
            cost: chosen.finalPrice,
            serviceCode: chosen.serviceCode,
            serviceName: chosen.serviceName,
            weightKg: q.weightKg,
            estimated: false,
            freeShipApplied: chosen.freeShipApplied,
          },
        };
      }
      quoteError = "No courier available for this destination";
    } else {
      quoteError = q.error;
    }
  } catch (err) {
    quoteError = err instanceof Error ? err.message : String(err);
    console.error("[shipping-auto] live quote threw:", err);
  }

  // Live quote unusable — fall back to the weight bracket. Weight from the
  // failed quote when we got that far, otherwise a cheap estimate.
  if (weightKg <= 0) weightKg = await estimateWeightKg(items);

  const fallback = await getFallbackShippingRate(destination.state, weightKg);
  if (fallback) {
    console.warn(
      "[shipping-auto] using %s fallback RM%s for %s @ %skg (bracket %skg) — %s",
      fallback.source,
      fallback.cost.toFixed(2),
      destination.state,
      weightKg.toFixed(2),
      fallback.bracketKg,
      quoteError,
    );
    return {
      ok: true,
      quote: {
        cost: fallback.cost,
        serviceCode: null,
        serviceName: null,
        weightKg,
        estimated: true,
        freeShipApplied: false,
        reason: quoteError,
      },
    };
  }

  return { ok: false, error: quoteError, weightKg };
}
