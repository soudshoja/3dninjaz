import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, productVariants, productConfigFields } from "@/lib/db/schema";
import { delyvaApi, DelyvaError, parseQuoteServices } from "@/lib/delyva";
import { loadShippingConfig, resolveItemType } from "@/lib/shipping-config";
import { filterByEnabledCatalog } from "@/lib/delyva-filter";
import { ensureConfigJson, ensureTiers } from "@/lib/config-fields";
import type { SelectFieldConfig } from "@/lib/config-fields";
import { resolveOptionWeightKg, resolveTierWeightKg } from "@/lib/option-weight";
import type { FieldWeightEntry } from "@/lib/option-weight";
import { learnShippingRate } from "@/lib/shipping-fallback";
import type {
  CartDestination,
  CartItemForQuote,
  QuoteOption,
  QuoteResult,
} from "@/lib/shipping-quote-types";

// ============================================================================
// Delyva cart-quote engine — the ONE implementation of "what does shipping
// cost for these items to this address".
//
// Extracted from src/actions/shipping-quote.ts (260906) so that server-side
// order creators (POS, draft conversion, manual orders, PayPal / bank-transfer
// capture) share the customer checkout's exact pricing instead of each
// re-deriving it. Previously only the two customer paths quoted Delyva at all;
// everything else fell through to a flat table that was 0.00 for every state,
// which is why admin-created orders shipped free.
//
// This module is NOT a "use server" file, so it may export types and sync
// helpers freely. The rate-limited RPC wrapper lives in
// src/actions/shipping-quote.ts.
//
// Steps:
//   1. Load shippingConfig (origin + markup + enabled services + threshold).
//   2. Resolve per-line weight via the ladder: selected-option weight (DB
//      re-read) -> per-tier weight -> variant.weight_g -> product
//      .shippingWeightKg -> defaultWeightKg. Never trusts a client weight.
//   3. Guard the 30 kg Delyva single-parcel cap.
//   4. Quote Delyva on total weight, filter by the enabled service catalog.
//   5. Apply markup, then the free-shipping threshold.
//   6. Record the cheapest real price into the weight-bracketed fallback
//      table (see src/lib/shipping-fallback.ts).
// ============================================================================

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Quote every enabled courier for a cart. No rate limiting and no auth gate —
 * callers decide. `quoteForCart` in src/actions/shipping-quote.ts is the
 * customer-facing, rate-limited entry point.
 */
export async function computeCartQuote(
  items: CartItemForQuote[],
  destination: CartDestination,
): Promise<QuoteResult> {
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
  // Weight ladder (Tier 0 new): selected-option weight (DB re-read) -> variant.weight_g
  //   -> product.shippingWeightKg -> defaultWeightKg
  // Server always re-fetches weights — never trusts client values (T-17-09).
  const fallbackWeight = Number(cfg.defaultWeightKg); // kg

  // Batch-fetch product-level weights
  const productIds = Array.from(new Set(items.map((i) => i.productId)));
  const prodRows = productIds.length
    ? await db
        .select({
          id: products.id,
          weight: products.shippingWeightKg,
          unitField: products.unitField,
          weightTiers: products.weightTiers,
        })
        .from(products)
        .where(inArray(products.id, productIds))
    : [];
  const productWeights = new Map<string, number>();
  // Per-tier weight (keychain/clicker): unit field id + grams-by-count map.
  const productTierWeights = new Map<
    string,
    { unitField: string | null; weightTiers: Record<string, number> }
  >();
  for (const p of prodRows) {
    if (p.weight) productWeights.set(p.id, Number(p.weight));
    const wt = ensureTiers(p.weightTiers);
    if (Object.keys(wt).length > 0) {
      productTierWeights.set(p.id, { unitField: p.unitField ?? null, weightTiers: wt });
    }
  }

  // Batch-fetch per-variant weights (AD-08)
  const variantIds = Array.from(
    new Set(items.map((i) => i.variantId).filter((v): v is string => !!v)),
  );
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

  // Tier 0: batch-fetch select-type config fields for items that carry configValues.
  // MariaDB no-LATERAL — inArray query, join in memory. Server re-reads option weight
  // from configJson; never trusts a client-supplied numeric weight (T-17-09).
  const configProductIds = Array.from(
    new Set(items.filter((i) => i.configValues && Object.keys(i.configValues).length > 0).map((i) => i.productId)),
  );
  const fieldsByProduct = new Map<string, FieldWeightEntry[]>();
  if (configProductIds.length > 0) {
    const cfRows = await db
      .select({
        id: productConfigFields.id,
        productId: productConfigFields.productId,
        fieldType: productConfigFields.fieldType,
        configJson: productConfigFields.configJson,
      })
      .from(productConfigFields)
      .where(inArray(productConfigFields.productId, configProductIds));

    for (const row of cfRows) {
      if (row.fieldType !== "select") continue;
      try {
        const parsed = ensureConfigJson("select", row.configJson) as SelectFieldConfig;
        const optionsByValue = new Map<string, number>();
        for (const opt of parsed.options) {
          if (typeof opt.weight === "number") {
            optionsByValue.set(opt.value, opt.weight);
          }
        }
        if (optionsByValue.size === 0) continue; // no options have weight — skip
        const existing = fieldsByProduct.get(row.productId) ?? [];
        existing.push({ fieldId: row.id, optionsByValue });
        fieldsByProduct.set(row.productId, existing);
      } catch {
        // Parse error on corrupt configJson — skip this field, fall through
      }
    }
  }

  let totalWeight = 0;
  let subtotal = 0;
  for (const it of items) {
    let w: number;

    // Tier 0: per-option weight from DB configJson (configurable products)
    // + per-tier weight (keychain/clicker — grams by unit-field char count).
    // Both are config-derived and summed; the DB is the source of truth for
    // grams (T-17-09 — never trust a client weight).
    const hasConfig = it.configValues && Object.keys(it.configValues).length > 0;
    const optKg = hasConfig
      ? resolveOptionWeightKg(it.configValues!, fieldsByProduct.get(it.productId) ?? [])
      : null;
    const tw = productTierWeights.get(it.productId);
    const tierKg = hasConfig && tw
      ? resolveTierWeightKg(tw.unitField, it.configValues!, tw.weightTiers)
      : null;
    const configKg =
      optKg !== null || tierKg !== null ? (optKg ?? 0) + (tierKg ?? 0) : null;

    if (configKg !== null) {
      w = configKg;
    } else {
      const variantWeightG = it.variantId
        ? (variantWeights.get(it.variantId) ?? null)
        : null;
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
            console.warn(
            "[shipping] no weight data for variantId=%s productId=%s — using defaultWeightKg=%s",
            it.variantId ?? "(none)",
            it.productId,
            fallbackWeight,
          );
          w = fallbackWeight;
        }
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

    // Feed the weight-bracketed fallback table with a real courier price so
    // a later outage falls back to something accurate instead of a stale flat
    // rate. Best-effort and awaited only so the write lands before the request
    // ends; learnShippingRate swallows its own errors.
    const cheapestReal = options
      .map((o) => (o.freeShipApplied ? round2(o.basePrice + (o.basePrice * markupPct) / 100 + markupFlat) : o.finalPrice))
      .filter((p) => p > 0)
      .sort((a, b) => a - b)[0];
    if (cheapestReal !== undefined) {
      await learnShippingRate(destination.state, totalWeight, cheapestReal);
    }

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
