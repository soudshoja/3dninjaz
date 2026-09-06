"use server";

import "server-only";
import crypto from "node:crypto";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";
import { computeCartQuote } from "@/lib/shipping-quote-core";
import type {
  CartDestination,
  CartItemForQuote,
  QuoteResult,
} from "@/lib/shipping-quote-types";

// ============================================================================
// Customer-facing shipping-quote RPC.
//
// The pricing itself lives in src/lib/shipping-quote-core.ts so that the
// server-side order creators (POS, draft conversion, manual orders, PayPal /
// bank-transfer capture) can call the SAME engine without paying the
// per-IP rate limit meant for browsers. This file is only the gate.
//
// NOTE: do NOT export types from this module. Next compiles every export of a
// "use server" file as an async server action; a type export becomes a runtime
// reference to a binding with no runtime value → `ReferenceError` and a 500 on
// /checkout. Shared types live in @/lib/shipping-quote-types.
// ============================================================================

/**
 * Rate-limited quote for the checkout and POS pickers.
 * No auth gate — this is customer-facing.
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

  return computeCartQuote(items, destination);
}
