// ============================================================================
// Pure types shared by the shipping-quote core (server) and the checkout /
// POS pickers (client).
//
// Deliberately free of `server-only` and of any runtime import so client
// components can `import type` from here. Types must NOT be exported from
// src/actions/shipping-quote.ts: Next compiles every export of a "use server"
// module into an RPC endpoint, and a type export becomes a runtime reference
// to a binding that does not exist → ReferenceError and a 500 on /checkout.
// ============================================================================

export type CartItemForQuote = {
  productId: string;
  /**
   * Optional. Cart lines carry a real variant id; drafts, POS free-text lines
   * and quotations do not. When absent the weight ladder skips the per-variant
   * tier and resolves from config options -> product weight -> defaultWeightKg.
   */
  variantId?: string | null;
  quantity: number;
  unitPrice: number; // MYR
  /**
   * fieldId -> selected option.value for configurable products.
   * Server re-reads option.weight from product_config_fields.configJson —
   * NEVER trusts a client weight (T-17-09).
   */
  configValues?: Record<string, string>;
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
