"use server";

import { db } from "@/lib/db";
import { orders, orderItems, productVariants, productOptionValues } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { composeVariantLabel, resolveEffectivePrice } from "@/lib/variants";
import { randomUUID } from "node:crypto";
import { getSessionUser } from "@/lib/auth-helpers";
import { orderAddressSchema, type OrderAddressInput } from "@/lib/validators";
import { ordersController, PAYPAL_CURRENCY } from "@/lib/paypal";
import { CheckoutPaymentIntent } from "@paypal/paypal-server-sdk";
import { formatOrderNumber } from "@/lib/orders";
import { sendOrderConfirmationEmail } from "@/lib/email/order-confirmation";
import { validateCoupon, redeemCoupon } from "@/actions/coupons";
import { getShippingRate } from "@/actions/admin-shipping";
import { quoteForCart } from "@/actions/shipping-quote";
import { revalidatePath } from "next/cache";

type BagLineInput = {
  variantId: string;
  quantity: number; // 1..10
};

type CreateOrderInput = {
  address: OrderAddressInput;
  items: BagLineInput[];
  // Plan 05-03 — optional coupon. Server-side validateCoupon recomputes the
  // discount; client-supplied amount is ignored entirely (T-05-03-tampering).
  couponCode?: string | null;
  // Phase 9b — customer-selected Delyva service. Server re-quotes and
  // re-derives the price — the client never dictates shipping cost
  // (T-09-01-tampering). When null, falls back to the flat-rate table.
  shippingServiceCode?: string | null;
};

type CreateOrderResult =
  | {
      ok: true;
      paypalOrderId: string;
      internalOrderId: string;
      // Echo the discount back so the UI can display the line item the
      // customer is paying for.
      discount?: number;
      couponCode?: string;
    }
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
    // Phase 13 (T-05-04-tampering): server-side OOS check.
    // Phase 18: allow pre-order through — only reject OOS variants when
    // allow_preorder=FALSE. Reject hard when the variant is hidden.
    const trackedAndOOS = v.trackStock === true && (v.stock ?? 0) <= 0;
    const allowPreorder = v.allowPreorder === true;
    const legacyOOS = v.trackStock !== true && v.inStock === false;
    if ((trackedAndOOS && !allowPreorder) || legacyOOS) {
      return {
        ok: false,
        error: `${v.product?.name ?? "An item"} is sold out. Please remove it from your bag.`,
      };
    }
  }

  // Build snapshot lines with server-derived prices (NEVER client prices).
  // Phase 16-05 — compose variant labels for each variant in one extra query.
  // Fetch option values referenced by all variants in the bag.
  const optionValueIds = [
    ...new Set(
      variantRows.flatMap((v) =>
        [
          v.option1ValueId,
          v.option2ValueId,
          v.option3ValueId,
          v.option4ValueId,
          v.option5ValueId,
          v.option6ValueId,
        ].filter((id): id is string => typeof id === "string"),
      ),
    ),
  ];
  const optionValueRows =
    optionValueIds.length > 0
      ? await db
          .select()
          .from(productOptionValues)
          .where(inArray(productOptionValues.id, optionValueIds))
      : [];
  const valueById = new Map(optionValueRows.map((v) => [v.id, v]));

  type Snap = {
    variantId: string;
    productId: string;
    productName: string;
    productSlug: string;
    productImage: string | null;
    variantLabel: string;
    unitPrice: string; // Drizzle decimal string, kept verbatim
    // Phase 10 (10-01) — snapshot of productVariants.costPrice at checkout
    // time. NULL if the variant has no cost set yet; admin can backfill via
    // the order detail page's Costs & Profit panel.
    unitCost: string | null;
    quantity: number;
    lineTotal: string;
  };
  // Phase 17 — resolve effective (sale-aware) unit price ONCE per checkout-
  // create at server-now. This is what PayPal sees, what gets snapshotted into
  // order_items.unitPrice, and what we re-use for the Delyva weight quote.
  // Reading v.price raw would charge the non-sale price even when the
  // storefront advertised the sale (D-BLOCKER-1).
  const priceNow = new Date();
  const snapshots: Snap[] = variantRows.map((v) => {
    const quantity = qtyByVariant.get(v.id)!;
    const { effectivePrice } = resolveEffectivePrice(v, priceNow);
    const unit = Number(effectivePrice);
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
    // Phase 16-05 — compose variantLabel from option values; fall back to
    // legacy size column for pre-backfill rows (dual-read window).
    const labelParts: string[] = [];
    for (const vid of [
      v.option1ValueId,
      v.option2ValueId,
      v.option3ValueId,
      v.option4ValueId,
      v.option5ValueId,
      v.option6ValueId,
    ]) {
      if (vid) {
        const val = valueById.get(vid);
        if (val) labelParts.push(val.value);
      }
    }
    const variantLabel =
      labelParts.length > 0
        ? composeVariantLabel(labelParts)
        : (v.labelCache ?? "");

    return {
      variantId: v.id,
      productId: v.productId,
      productName: v.product.name,
      productSlug: v.product.slug,
      productImage: firstImage,
      variantLabel,
      unitPrice: effectivePrice,
      // Drizzle returns decimal as string | null; pass through as-is.
      unitCost: v.costPrice ?? null,
      quantity,
      lineTotal: line.toFixed(2),
    };
  });

  const subtotal = snapshots.reduce((sum, s) => sum + Number(s.lineTotal), 0);
  const subtotalStr = subtotal.toFixed(2);

  // Phase 9b — prefer Delyva live quote if the customer picked a courier.
  // Fall back to the Phase 5 per-state flat rate when no serviceCode is set.
  // The server never trusts client-supplied shipping prices — we re-quote
  // against Delyva here (T-09-01-tampering).
  let shippingNum: number;
  let shippingServiceCode: string | null = null;
  let shippingServiceName: string | null = null;
  if (input.shippingServiceCode) {
    try {
      const quote = await quoteForCart(
        input.items.map((i) => {
          const row = variantRows.find((v) => v.id === i.variantId);
          // Use the server-snapshot unitPrice (already sale-resolved) so the
          // Delyva free-shipping threshold check matches what we actually
          // charge the customer.
          const snap = snapshots.find((s) => s.variantId === i.variantId);
          return {
            productId: row?.productId ?? "",
            variantId: i.variantId,
            quantity: qtyByVariant.get(i.variantId) ?? i.quantity,
            unitPrice: snap ? Number(snap.unitPrice) : 0,
          };
        }),
        {
          address1: addr.data.addressLine1,
          address2: addr.data.addressLine2 ?? null,
          city: addr.data.city,
          state: addr.data.state,
          postcode: addr.data.postcode,
          country: "MY",
        },
      );
      if (quote.ok) {
        const match = quote.options.find(
          (o) => o.serviceCode === input.shippingServiceCode,
        );
        if (match) {
          shippingNum = match.finalPrice;
          shippingServiceCode = match.serviceCode;
          shippingServiceName = match.serviceName;
        } else {
          // Requested service no longer available — fall back to cheapest.
          const cheapest = [...quote.options].sort(
            (a, b) => a.finalPrice - b.finalPrice,
          )[0];
          if (cheapest) {
            shippingNum = cheapest.finalPrice;
            shippingServiceCode = cheapest.serviceCode;
            shippingServiceName = cheapest.serviceName;
          } else {
            const flat = await getShippingRate(addr.data.state, subtotal);
            shippingNum = Number(flat.cost.toFixed(2));
          }
        }
      } else {
        // Delyva quote failed — fall back to flat-rate table so checkout
        // doesn't hard-fail. The admin still sees which state shipped to.
        const flat = await getShippingRate(addr.data.state, subtotal);
        shippingNum = Number(flat.cost.toFixed(2));
      }
    } catch (err) {
      console.error("[paypal] Delyva re-quote failed:", err);
      const flat = await getShippingRate(addr.data.state, subtotal);
      shippingNum = Number(flat.cost.toFixed(2));
    }
  } else {
    // Plan 05-04 — shipping cost from per-state DB rate + free-ship threshold.
    const shippingResult = await getShippingRate(addr.data.state, subtotal);
    shippingNum = Number(shippingResult.cost.toFixed(2));
  }
  shippingNum = Number(shippingNum.toFixed(2));
  const shippingStr = shippingNum.toFixed(2);

  // Plan 05-03 — server-side coupon application. Even if the client never
  // supplied a code, this branch is a no-op. If they did supply one, we
  // re-validate against the DB and recompute the discount; the client
  // can never inflate the discount (T-05-03-tampering).
  let discount = 0;
  let appliedCouponCode: string | null = null;
  if (input.couponCode && typeof input.couponCode === "string") {
    const valid = await validateCoupon(input.couponCode, subtotal);
    if (valid.ok) {
      discount = valid.discount;
      appliedCouponCode = valid.code;
    }
    // If coupon is invalid we silently drop it — the customer sees the
    // error inline via the CouponApply component before submitting; if it
    // expired between apply + checkout-confirm, we just proceed at full
    // price rather than blocking the order.
  }

  const totalNum = Math.max(0, +(subtotal - discount + shippingNum).toFixed(2));
  const totalStr = totalNum.toFixed(2);

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
                ...(discount > 0
                  ? {
                      discount: {
                        currencyCode: PAYPAL_CURRENCY,
                        value: discount.toFixed(2),
                      },
                    }
                  : {}),
              },
            },
            items: snapshots.map((s) => ({
              name: (s.variantLabel
                ? `${s.productName} — ${s.variantLabel}`
                : s.productName
              ).slice(0, 127),
              quantity: String(s.quantity),
              unitAmount: {
                currencyCode: PAYPAL_CURRENCY,
                value: s.unitPrice,
              },
              sku: s.variantId.slice(0, 127),
            })),
            // customId carries the coupon code so the capture flow can
            // re-look-up + redeem it without an extra column on orders.
            ...(appliedCouponCode
              ? { customId: `COUPON:${appliedCouponCode}` }
              : {}),
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
      // Phase 9b — Delyva service snapshot. Null when the customer didn't
      // pick one (e.g. flat-rate fallback path).
      shippingServiceCode: shippingServiceCode,
      shippingServiceName: shippingServiceName,
      shippingQuotedPrice: shippingServiceCode ? shippingStr : null,
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
        // Phase 16-07: size column dropped; historical orders retain size via order_items.size (nullable)
        // Phase 16-05 — snapshot variant label at order creation time so
        // order history is stable even after option renames.
        variantLabel: s.variantLabel || null,
        unitPrice: s.unitPrice,
        // Phase 10 (10-01) — cost snapshot at order creation. NULL when the
        // variant has no costPrice set yet.
        unitCost: s.unitCost,
        quantity: s.quantity,
        lineTotal: s.lineTotal,
      })),
    );

    return {
      ok: true,
      paypalOrderId,
      internalOrderId,
      ...(discount > 0
        ? { discount, couponCode: appliedCouponCode ?? undefined }
        : {}),
    };
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
  // Plan 05-03: pull the customId we set in createPayPalOrder so we know
  // which coupon (if any) to redeem after capture succeeds.
  let appliedCouponCode: string | null = null;
  try {
    const response = await ordersController().captureOrder({
      id: paypalOrderId,
      prefer: "return=representation",
    });
    const order = response.result;
    const capture = order?.purchaseUnits?.[0]?.payments?.captures?.[0];
    captureId = capture?.id ?? null;
    captureStatus = capture?.status ?? "";
    const customId = order?.purchaseUnits?.[0]?.customId ?? null;
    if (customId && customId.startsWith("COUPON:")) {
      appliedCouponCode = customId.slice("COUPON:".length);
    }
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

  // Plan 05-03 — atomic coupon redemption AFTER capture succeeds. If the
  // coupon's usage_cap was hit between approval and capture, we lose the
  // discount on the audit trail but the customer already paid the
  // discounted amount (it was sent to PayPal as the order total). This is
  // an acceptable failure mode — log it for the operator.
  if (appliedCouponCode) {
    try {
      const subtotalNum = parseFloat(existing.subtotal);
      const valid = await validateCoupon(appliedCouponCode, subtotalNum);
      if (valid.ok) {
        const redeemed = await redeemCoupon(
          valid.couponId,
          existing.id,
          existing.userId,
          subtotalNum,
        );
        if (!redeemed.ok) {
          console.warn(
            `[paypal] coupon ${appliedCouponCode} redemption refused after capture for order ${existing.id}: ${redeemed.error}`,
          );
        }
      } else {
        console.warn(
          `[paypal] coupon ${appliedCouponCode} no longer valid at capture for order ${existing.id}: ${valid.error}`,
        );
      }
    } catch (err) {
      console.error("[paypal] coupon redemption error:", err);
    }
  }

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
  const userWithRole = user as unknown as { id: string; role: string };
  if (row.userId !== userWithRole.id && userWithRole.role !== "admin") return null;
  return row;
}
