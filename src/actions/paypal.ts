"use server";

import { db } from "@/lib/db";
import { orders, orderItems, productVariants } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getSessionUser } from "@/lib/auth-helpers";
import { orderAddressSchema, type OrderAddressInput } from "@/lib/validators";
import { ordersController, PAYPAL_CURRENCY } from "@/lib/paypal";
import { CheckoutPaymentIntent } from "@paypal/paypal-server-sdk";
import { formatOrderNumber } from "@/lib/orders";
import { sendOrderConfirmationEmail } from "@/lib/email/order-confirmation";
import { revalidatePath } from "next/cache";

type BagLineInput = {
  variantId: string;
  quantity: number; // 1..10
};

type CreateOrderInput = {
  address: OrderAddressInput;
  items: BagLineInput[];
};

type CreateOrderResult =
  | { ok: true; paypalOrderId: string; internalOrderId: string }
  | { ok: false; error: string };

type CaptureOrderResult =
  | { ok: true; orderId: string; orderNumber: string; redirectTo: string }
  | { ok: false; error: string };

/**
 * Create a PayPal order from a validated bag snapshot.
 *
 * SECURITY CONTRACT (D3-07, T-03-10):
 *   - The client sends ONLY { variantId, quantity } pairs.
 *   - The server re-fetches each variant from the DB, pulls the authoritative
 *     unit price, clamps quantity to 1..10 (matches the Phase 2 store soft cap),
 *     and re-derives subtotal. A client-sent unit price is silently ignored.
 *   - If any variant is missing or its product is inactive, the whole request
 *     is rejected.
 *   - We create the PayPal order FIRST, then write a matching pending order
 *     row keyed by the PayPal order ID so that the downstream capture step
 *     (and webhook) can reconcile via a UNIQUE lookup.
 */
export async function createPayPalOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, error: "You must be signed in to check out." };
  }

  // Validate address shape server-side even though the client validated too.
  const addr = orderAddressSchema.safeParse(input.address);
  if (!addr.success) {
    return { ok: false, error: "Please review the shipping address fields." };
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, error: "Your bag is empty." };
  }

  // Clamp quantities 1..10 and dedupe by variantId (sum quantities if dup).
  const qtyByVariant = new Map<string, number>();
  for (const line of input.items) {
    if (typeof line.variantId !== "string" || line.variantId.length === 0) {
      continue;
    }
    const q = Math.max(1, Math.min(10, Math.floor(Number(line.quantity) || 0)));
    qtyByVariant.set(
      line.variantId,
      Math.min(10, (qtyByVariant.get(line.variantId) ?? 0) + q),
    );
  }
  const variantIds = [...qtyByVariant.keys()];
  if (variantIds.length === 0) {
    return { ok: false, error: "Your bag is empty." };
  }

  // Fetch variants + their products in one relational query.
  const variantRows = await db.query.productVariants.findMany({
    where: inArray(productVariants.id, variantIds),
    with: { product: true },
  });
  if (variantRows.length !== variantIds.length) {
    return { ok: false, error: "One or more items are no longer available." };
  }
  for (const v of variantRows) {
    if (!v.product?.isActive) {
      return { ok: false, error: "One or more items are no longer available." };
    }
  }

  // Build snapshot lines with server-derived prices (NEVER client prices).
  type Snap = {
    variantId: string;
    productId: string;
    productName: string;
    productSlug: string;
    productImage: string | null;
    size: "S" | "M" | "L";
    unitPrice: string; // Drizzle decimal string, kept verbatim
    quantity: number;
    lineTotal: string;
  };
  const snapshots: Snap[] = variantRows.map((v) => {
    const quantity = qtyByVariant.get(v.id)!;
    const unit = Number(v.price);
    const line = Number((unit * quantity).toFixed(2));
    // product.images is stored as JSON array; MariaDB driver returns it as
    // either array or JSON-stringified array depending on column config.
    // Normalize to array, then pick the first if any.
    const rawImages = v.product.images as unknown;
    let firstImage: string | null = null;
    if (Array.isArray(rawImages) && rawImages.length > 0) {
      firstImage = String(rawImages[0]);
    } else if (typeof rawImages === "string" && rawImages.length > 0) {
      try {
        const parsed = JSON.parse(rawImages) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) {
          firstImage = String(parsed[0]);
        }
      } catch {
        // leave null
      }
    }
    return {
      variantId: v.id,
      productId: v.productId,
      productName: v.product.name,
      productSlug: v.product.slug,
      productImage: firstImage,
      size: v.size,
      unitPrice: v.price,
      quantity,
      lineTotal: line.toFixed(2),
    };
  });

  const subtotal = snapshots.reduce((sum, s) => sum + Number(s.lineTotal), 0);
  const subtotalStr = subtotal.toFixed(2);
  const shippingStr = "0.00";
  const totalStr = subtotalStr; // v1: shipping free (D3-05)

  // Create PayPal order via SDK (Orders v2).
  let paypalOrderId: string;
  try {
    const response = await ordersController().createOrder({
      body: {
        intent: CheckoutPaymentIntent.Capture,
        purchaseUnits: [
          {
            amount: {
              currencyCode: PAYPAL_CURRENCY,
              value: totalStr,
              breakdown: {
                itemTotal: {
                  currencyCode: PAYPAL_CURRENCY,
                  value: subtotalStr,
                },
                shipping: {
                  currencyCode: PAYPAL_CURRENCY,
                  value: shippingStr,
                },
              },
            },
            items: snapshots.map((s) => ({
              name: `${s.productName} (Size ${s.size})`.slice(0, 127),
              quantity: String(s.quantity),
              unitAmount: {
                currencyCode: PAYPAL_CURRENCY,
                value: s.unitPrice,
              },
              sku: s.variantId.slice(0, 127),
            })),
          },
        ],
      },
      prefer: "return=representation",
    });
    // ApiResponse<Order>: .result is the parsed Order object.
    paypalOrderId = response.result.id ?? "";
    if (!paypalOrderId) {
      throw new Error("PayPal did not return an order ID");
    }
  } catch (err) {
    // Surface the currency-not-supported case with a helpful message per D3-06.
    // The SDK throws ApiError with .message + .body; also network-level errors
    // show up as raw Error. Stringify defensively.
    const raw = (() => {
      try {
        return JSON.stringify(err) + String((err as Error)?.message ?? "");
      } catch {
        return String(err ?? "");
      }
    })();
    if (raw.includes("CURRENCY_NOT_SUPPORTED")) {
      return {
        ok: false,
        error:
          "PayPal declined MYR for this merchant account. The business profile must be a Malaysian account. Contact the operator.",
      };
    }
    console.error("[paypal] createOrder failed:", err);
    return {
      ok: false,
      error: "Unable to start PayPal checkout. Please try again.",
    };
  }

  // Insert pending order + items. Deterministic internal UUID so we don't
  // depend on MariaDB's $returningId behavior (which uses LAST_INSERT_ID
  // and does not round-trip non-integer UUIDs reliably on mysql2).
  const internalOrderId = randomUUID();
  try {
    await db.insert(orders).values({
      id: internalOrderId,
      userId: user.id,
      status: "pending",
      paypalOrderId,
      subtotal: subtotalStr,
      shippingCost: shippingStr,
      totalAmount: totalStr,
      currency: PAYPAL_CURRENCY,
      customerEmail: user.email,
      shippingName: addr.data.recipientName,
      shippingPhone: addr.data.phone,
      shippingLine1: addr.data.addressLine1,
      shippingLine2: addr.data.addressLine2 || null,
      shippingCity: addr.data.city,
      shippingState: addr.data.state,
      shippingPostcode: addr.data.postcode,
      shippingCountry: "Malaysia",
    });

    await db.insert(orderItems).values(
      snapshots.map((s) => ({
        id: randomUUID(),
        orderId: internalOrderId,
        productId: s.productId,
        variantId: s.variantId,
        productName: s.productName,
        productSlug: s.productSlug,
        productImage: s.productImage,
        size: s.size,
        unitPrice: s.unitPrice,
        quantity: s.quantity,
        lineTotal: s.lineTotal,
      })),
    );

    return { ok: true, paypalOrderId, internalOrderId };
  } catch (err) {
    console.error("[paypal] DB write after createOrder failed:", err);
    // PayPal order exists but we failed to persist. The webhook will reconcile
    // on PAYMENT.CAPTURE.COMPLETED if the user proceeds; otherwise the PayPal
    // order will auto-expire (default 3h unapproved).
    return { ok: false, error: "We could not save your order. Please try again." };
  }
}

/**
 * Capture a previously-approved PayPal order and flip our row to "paid".
 * Idempotent (D3-09, T-03-13): if orders.paypalCaptureId is already set,
 * return the existing row without re-calling PayPal.
 */
export async function capturePayPalOrder({
  paypalOrderId,
}: {
  paypalOrderId: string;
}): Promise<CaptureOrderResult> {
  const user = await getSessionUser();
  if (!user) {
    return {
      ok: false,
      error: "You must be signed in to complete your order.",
    };
  }
  if (!paypalOrderId || typeof paypalOrderId !== "string") {
    return { ok: false, error: "Missing PayPal order ID." };
  }

  const existing = await db.query.orders.findFirst({
    where: eq(orders.paypalOrderId, paypalOrderId),
  });
  if (!existing) {
    return { ok: false, error: "Order not found." };
  }
  // Only the owner may capture; admins don't capture on behalf of customers.
  if (existing.userId !== user.id) {
    return { ok: false, error: "Order not found." };
  }

  // Idempotency (D3-09): if we already captured, return existing result
  // without calling PayPal again.
  if (existing.paypalCaptureId) {
    return {
      ok: true,
      orderId: existing.id,
      orderNumber: formatOrderNumber(existing.id),
      redirectTo: `/orders/${existing.id}`,
    };
  }

  // Capture via PayPal. PayPal itself is idempotent on an approved order —
  // repeat calls return ORDER_ALREADY_CAPTURED which we map to success below.
  let captureId: string | null = null;
  let captureStatus = "";
  try {
    const response = await ordersController().captureOrder({
      id: paypalOrderId,
      prefer: "return=representation",
    });
    const order = response.result;
    const capture = order?.purchaseUnits?.[0]?.payments?.captures?.[0];
    captureId = capture?.id ?? null;
    captureStatus = capture?.status ?? "";
    if (!captureId || captureStatus !== "COMPLETED") {
      return {
        ok: false,
        error: "Payment was not completed. Please try again.",
      };
    }
  } catch (err) {
    // If PayPal tells us the order is already captured, refetch and succeed.
    const raw = (() => {
      try {
        return (
          JSON.stringify(err) + String((err as Error)?.message ?? "")
        );
      } catch {
        return String(err ?? "");
      }
    })();
    if (raw.includes("ORDER_ALREADY_CAPTURED")) {
      const refetched = await db.query.orders.findFirst({
        where: eq(orders.paypalOrderId, paypalOrderId),
      });
      if (refetched?.paypalCaptureId) {
        return {
          ok: true,
          orderId: refetched.id,
          orderNumber: formatOrderNumber(refetched.id),
          redirectTo: `/orders/${refetched.id}`,
        };
      }
    }
    console.error("[paypal] captureOrder failed:", err);
    return { ok: false, error: "We could not capture your PayPal payment." };
  }

  // Update our row to paid + record capture ID.
  await db
    .update(orders)
    .set({ status: "paid", paypalCaptureId: captureId })
    .where(eq(orders.id, existing.id));

  // Fire-and-forget order-confirmation email (Plan 03-03).
  // T-03-26 / D3-10 UX contract: SMTP failure must NEVER block the capture
  // response. sendOrderConfirmationEmail itself catches and logs internally;
  // we also attach a catch here as a belt-and-braces guard in case the
  // top-level DB read inside that function throws before the inner try/catch.
  void sendOrderConfirmationEmail(existing.id).catch((err) =>
    console.error("[paypal] confirmation email dispatch failed:", err),
  );

  revalidatePath(`/orders/${existing.id}`);
  revalidatePath("/orders");

  return {
    ok: true,
    orderId: existing.id,
    orderNumber: formatOrderNumber(existing.id),
    // `?from=checkout` toggles the success banner on /orders/[id] (Plan 03-03).
    // T-03-24: cosmetic only — no behavior change if the flag is spoofed.
    redirectTo: `/orders/${existing.id}?from=checkout`,
  };
}

/**
 * Read an order + its items for the current user. Used by /orders/[id]
 * and the confirmation page. Admin bypass reads own userId mismatch but
 * requires role === "admin" (D3-22, T-03-14) — blocks email enumeration
 * via guessed order IDs.
 */
export async function getOrderForCurrentUser(orderId: string) {
  const user = await getSessionUser();
  if (!user) return null;
  const row = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: { items: true },
  });
  if (!row) return null;
  if (row.userId !== user.id && user.role !== "admin") return null;
  return row;
}
