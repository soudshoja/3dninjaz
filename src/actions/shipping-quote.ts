"use server";

import "server-only";
import { inArray } from "drizzle-orm";
import crypto from "node:crypto";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { products, productVariants } from "@/lib/db/schema";
import { delyvaApi, DelyvaError, parseQuoteServices } from "@/lib/delyva";
import { loadShippingConfig, resolveItemType } from "@/lib/shipping-config";
import { filterByEnabledCatalog } from "@/lib/delyva-filter";
import { checkRateLimit } from "@/lib/rate-limit";

// ============================================================================
// Phase 9 (09-01) — checkout shipping-quote helper (NOT YET WIRED TO UI).
//
// The theme agent is currently iterating on storefront checkout. Once their
// pass lands, a follow-up task will wire `quoteForCart` into the checkout
// shipping-options widget. For now this is a server-action-only surface:
//
//   1. Load shippingConfig (origin + markup + enabled services + threshold).
//   2. Sum cart weights: totalWeight = Σ (product.shippingWeightKg × quantity)
//      across every line item. Fallback per-unit weight = defaultWeightKg.
//      Example: 5 × 500g items → 2.5 kg total sent to Delyva.
//   3. Guard: if totalWeight > 30 kg (Delyva single-parcel cap) return a
//      friendly error instead of quoting — we don't auto-split parcels yet.
//   4. Call delyvaApi.quote with weight ONLY (no dimensions). Delyva will
//      price on actual weight; volumetric is skipped until we store real
//      per-product box dims and can aggregate them properly.
//   5. Filter by enabledServices allowlist (empty = allow all).
//   6. Apply markup:  finalPrice = price + price*markupPercent/100 + markupFlat
//   7. Apply free-shipping threshold: when cartSubtotal >= threshold, all
//      services are returned with finalPrice=0 (shipping becomes a cost
//      the store absorbs; the service still needs to be selected so we know
//      which courier was booked for the order).
//
// Do NOT import this from any storefront client component yet — the theme
// agent will wire it after their theme pass is deployed.
// ============================================================================

export type CartItemForQuote = {
  productId: string;
  /** AD-08 — variantId is now mandatory. quoteForCart batch-fetches weight_g
   * server-side by variantId; never trusts client-supplied weight values
   * (T-17-09-weight-spoofing). Phase 16-05 cart v2 stores variantId for every
   * line, so every existing caller already has it. */
  variantId: string;
  quantity: number;
  unitPrice: number; // MYR
};

export type CartDestination = {
  address1: string;
  address2?: string | null;
  city: string;
  state: string;
  postcode: string;
  country?: string;
};

export type QuoteOption = {
  serviceCode: string;
  serviceName: string;
  basePrice: number; // raw price from Delyva (MYR)
  finalPrice: number; // after markup / free-shipping
  currency: string;
  etaMin?: number | null;
  etaMax?: number | null;
  freeShipApplied: boolean;
};

export type QuoteResult =
  | { ok: true; options: QuoteOption[]; subtotal: number; weightKg: number }
  | { ok: false; error: string };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Server-action entry point consumed by future checkout UI. No auth gate —
 * this is customer-facing. Rate-limiting / abuse prevention should be
 * layered on at the route handler in follow-up work (Phase 9 FU-01).
 */
export async function quoteForCart(
  items: CartItemForQuote[],
  destination: CartDestination,
): Promise<QuoteResult> {
  // Risk-12 — 20 quotes per 60s per IP-hash. Checkout UI already debounces,
  // so legit users stay well under; scripted abusers hit the cap quickly.
  const h = await headers();
  const rawIp =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip")?.trim() ??
    "unknown";
  const ipHash = crypto
    .createHash("sha256")
    .update(rawIp)
    .digest("hex")
    .slice(0, 16);
  const gate = checkRateLimit(`shipping-quote:${ipHash}`, 20, 60_000);
  if (!gate.ok) {
    return { ok: false, error: "Too many quote requests. Try again shortly." };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Cart is empty" };
  }
  if (
    !destination?.postcode ||
    !/^\d{5}$/.test(destination.postcode.trim())
  ) {
    return { ok: false, error: "Valid destination postcode required" };
  }

  const cfg = await loadShippingConfig();

  // --- weight + subtotal (AD-08: per-variant weight resolution)
  // Weight ladder: variant.weight_g ?? product.shippingWeightKg*1000 ?? defaultWeightKg
  // Server always re-fetches weight_g by variantId — never trusts client values (T-17-09).
  const fallbackWeight = Number(cfg.defaultWeightKg); // kg

  // Batch-fetch product-level weights
  const productIds = Array.from(new Set(items.map((i) => i.productId)));
  const prodRows = productIds.length
    ? await db
        .select({ id: products.id, weight: products.shippingWeightKg })
        .from(products)
        .where(inArray(products.id, productIds))
    : [];
  const productWeights = new Map<string, number>();
  for (const p of prodRows) {
    if (p.weight) productWeights.set(p.id, Number(p.weight));
  }

  // Batch-fetch per-variant weights (AD-08)
  const variantIds = Array.from(new Set(items.map((i) => i.variantId)));
  const variantRows = variantIds.length
    ? await db
        .select({ id: productVariants.id, weightG: productVariants.weightG })
        .from(productVariants)
        .where(inArray(productVariants.id, variantIds))
    : [];
  const variantWeights = new Map<string, number | null>();
  for (const v of variantRows) {
    variantWeights.set(v.id, v.weightG ?? null);
  }

  let totalWeight = 0;
  let subtotal = 0;
  for (const it of items) {
    const variantWeightG = variantWeights.get(it.variantId) ?? null;
    let w: number;
    if (variantWeightG !== null) {
      // Tier 1: per-variant weight_g (grams → kg)
      w = variantWeightG / 1000;
    } else {
      const productWeightKg = productWeights.get(it.productId) ?? null;
      if (productWeightKg !== null) {
        // Tier 2: product-level shippingWeightKg
        w = productWeightKg;
      } else {
        // Tier 3: final fallback — emit warn so admin knows weight data is missing
        console.warn("[shipping] no weight data for variantId=%s productId=%s — using defaultWeightKg=%s", it.variantId, it.productId, fallbackWeight);
        w = fallbackWeight;
      }
    }
    totalWeight += w * it.quantity;
    subtotal += it.unitPrice * it.quantity;
  }
  if (totalWeight <= 0) totalWeight = fallbackWeight;

  // Delyva single-parcel max is 30 kg for most courier services. We don't
  // currently split orders across multiple parcels, so surface a friendly
  // error and let the customer contact us or split the order themselves.
  const MAX_PARCEL_WEIGHT_KG = 30;
  if (totalWeight > MAX_PARCEL_WEIGHT_KG) {
    return {
      ok: false,
      error: `Your order is ${round2(totalWeight)} kg which exceeds the ${MAX_PARCEL_WEIGHT_KG} kg single-parcel limit. Please split into smaller orders or contact us to arrange shipping.`,
    };
  }

  // --- quote
  try {
    const q = await delyvaApi.quote({
      origin: {
        address1: cfg.originAddress1,
        address2: cfg.originAddress2 ?? undefined,
        city: cfg.originCity,
        state: cfg.originState,
        postcode: cfg.originPostcode,
        country: cfg.originCountry,
      },
      destination: {
        address1: destination.address1 ?? "",
        address2: destination.address2 ?? undefined,
        city: destination.city,
        state: destination.state,
        postcode: destination.postcode.trim(),
        country: (destination.country ?? "MY").toUpperCase(),
      },
      weight: { unit: "kg", value: round2(totalWeight) },
      // PACKAGE routes to Grab-only (returns 0 standard couriers). Coercion
      // to PARCEL is centralised in resolveItemType() so every Delyva call-
      // site uses the same rule. See CLAUDE.md "Delyva itemType shipping
      // type distinction".
      itemType: resolveItemType(cfg.defaultItemType),
    });

    // Defensive parser — see src/lib/delyva.ts parseQuoteServices for the
    // full shape discussion.
    const all = parseQuoteServices(q);

    // Phase 15 — filter by shipping_service_catalog.is_enabled. Shared
    // helper so the admin booking path (quoteRatesForOrder) matches byte-
    // for-byte (BLOCKER 4 fix).
    const filtered = await filterByEnabledCatalog(all, cfg);

    // --- markup + free-shipping
    const markupPct = Number(cfg.markupPercent ?? 0);
    const markupFlat = Number(cfg.markupFlat ?? 0);
    const threshold = cfg.freeShippingThreshold ? Number(cfg.freeShippingThreshold) : null;
    const freeShip = threshold !== null && subtotal >= threshold;

    const options: QuoteOption[] = filtered.map((s) => {
      const base = Number(s.price.amount);
      const marked = base + (base * markupPct) / 100 + markupFlat;
      return {
        // The bookable code passed back into POST /order — must be
        // service.code (e.g. "SPXDMY-PN-BD1"), NOT companyCode.
        serviceCode: s.serviceCode,
        serviceName: s.serviceName,
        basePrice: round2(base),
        finalPrice: freeShip ? 0 : round2(marked),
        currency: s.price.currency ?? "MYR",
        etaMin: s.etaMin,
        etaMax: s.etaMax,
        freeShipApplied: freeShip,
      };
    });

    return {
      ok: true,
      options,
      subtotal: round2(subtotal),
      weightKg: round2(totalWeight),
    };
  } catch (e) {
    if (e instanceof DelyvaError)
      return { ok: false, error: `${e.code}: ${e.message}` };
    return { ok: false, error: (e as Error).message };
  }
}
