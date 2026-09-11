// ============================================================================
// Shared snapshot -> CartItemForQuote mapper for the two customer checkout
// paths (createPayPalOrder, whatsapp-order). Both previously built their
// autoQuoteShipping items from `input.items` (the raw client bag) instead of
// `allSnapshots` (the server-derived snapshot rows that include configurable
// lines). That mismatch meant configurable lines reached the quote with an
// empty productId, no configValues, and unitPrice 0 — quoted at
// defaultWeightKg = 0.1 regardless of real weight. See
// .planning/quick/260911-oln-fix-configurable-line-shipping-weight/PLAN.md.
//
// ConfigurationData.values here is a LIVE object (paypal.ts / whatsapp-order.ts
// attach the parsed ConfigurationData directly to each snapshot row) — unlike
// the checkout-drafts path, where configJson is a JSON string that must be
// parsed first. No parse step needed in this mapper.
//
// This is a plain lib module — NOT "use server". It is imported as a value
// into two "use server" action files; only *exports* of a "use server" module
// are compiled into RPC endpoints, so a value import here is safe, but this
// module itself must never gain a "use server" directive (it exports a type
// alongside the function, which would break under that compilation).
// ============================================================================

import type { CartItemForQuote } from "@/lib/shipping-quote-types";

// variantId sentinels that mean "this line has no real variant" — normalize
// all of them to `null` so the weight ladder correctly skips the per-variant
// tier instead of trying to look up a fake variant id.
//   "NONE"   — configurable customer-checkout lines (src/actions/paypal.ts:468)
//   "manual" — admin POS free-text lines (src/actions/admin-pos.ts:594)
//   ""       — defensive; should not occur on these snapshot rows, but a
//              blank string is not a real variant either.
const NO_VARIANT_SENTINELS = new Set(["NONE", "manual", ""]);

export type SnapshotLineForQuote = {
  productId: string | null | undefined;
  variantId: string | null | undefined;
  quantity: number | string;
  unitPrice: number | string;
  configurationData: { values: Record<string, string> } | null | undefined;
};

/**
 * Map server-derived snapshot rows (the `allSnapshots` array built in
 * createPayPalOrder / createWhatsAppOrder) into the CartItemForQuote[] shape
 * autoQuoteShipping expects. Pure and synchronous — no DB access.
 */
export function snapshotsToQuoteItems(
  snaps: readonly SnapshotLineForQuote[],
): CartItemForQuote[] {
  return snaps.map((s) => {
    const productId = String(s.productId ?? "");

    const rawVariantId = s.variantId ?? "";
    const variantId = NO_VARIANT_SENTINELS.has(rawVariantId) ? null : rawVariantId;

    const rawQuantity = Math.floor(Number(s.quantity));
    const quantity = Number.isFinite(rawQuantity) && rawQuantity > 0 ? rawQuantity : 1;

    const rawUnitPrice = Number(s.unitPrice);
    const unitPrice = Number.isFinite(rawUnitPrice) ? rawUnitPrice : 0;

    const values = s.configurationData?.values;
    const configValues =
      values && Object.keys(values).length > 0 ? values : undefined;

    return {
      productId,
      variantId,
      quantity,
      unitPrice,
      configValues,
    };
  });
}
