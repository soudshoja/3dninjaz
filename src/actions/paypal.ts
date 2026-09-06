"use server";

import { db } from "@/lib/db";
import { orders, orderItems, productVariants, productOptionValues, products } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { composeVariantLabel, resolveEffectivePrice } from "@/lib/variants";
import { randomUUID } from "node:crypto";
import { getSessionUser } from "@/lib/auth-helpers";
import { orderAddressSchema, type OrderAddressInput } from "@/lib/validators";
import { ordersController, PAYPAL_CURRENCY } from "@/lib/paypal";
import { CheckoutPaymentIntent } from "@paypal/paypal-server-sdk";
import { formatOrderNumber } from "@/lib/orders";
import { sendOrderConfirmationEmail } from "@/lib/email/order-confirmation";
import { sendWhatsAppNotification, sendWhatsAppInvoicePdf } from "@/lib/whatsapp/sender";
import { validateCoupon, redeemCoupon } from "@/actions/coupons";
import { publicUrl } from "@/lib/public-url";
import { autoQuoteShipping } from "@/lib/shipping-auto";
import { revalidatePath } from "next/cache";
import type { ConfigurationData } from "@/lib/config-fields";
import { ensureConfigJson } from "@/lib/config-fields";
import { productConfigFields } from "@/lib/db/schema";
import { sanitizeCustomText, customKey, buildConfigSummaryServer } from "@/lib/custom-text";
import { dedupeUnpaidOrders } from "@/lib/order-dedupe";
import { markDraftsConverted } from "@/lib/checkout-drafts";

type BagLineInput = {
  variantId: string;
  quantity: number; // 1..10
  // Phase 19 (19-09) — configurable lines carry configuration snapshot.
  // Stocked lines omit this field (undefined). The server trusts computedPrice
  // for configurable items because there is no DB variant to re-verify against;
  // the price was server-derived at add-to-bag time (D-12).
  configurationData?: ConfigurationData | null;
  // Phase 19 gap fix — configurable lines also send productId so the order_items
  // snapshot can carry the real product reference (slug looked up server-side).
  // Empty productId would break "View product" links from order detail and the
  // admin's printer manifest. Stocked lines derive productId from variantId.
  productId?: string;
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
  // Guest checkout — required when no session user is present. Must be a
  // valid email address; this is where the order confirmation is sent.
  customerEmail?: string | null;
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
  // Guest checkout: user may be null. Email is OPTIONAL for guests — if they
  // provide one it must be well-formed; otherwise we fall back to a placeholder
  // and (for PayPal) back-fill from the payer info on capture.
  let resolvedEmail: string;
  if (user) {
    resolvedEmail = user.email;
  } else {
    const guestEmail = typeof input.customerEmail === "string" ? input.customerEmail.trim() : "";
    if (guestEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail) || guestEmail.length > 254) {
        return { ok: false, error: "Please enter a valid email address (or leave it blank)." };
      }
      resolvedEmail = guestEmail;
    } else {
      resolvedEmail = "guest@3dninjaz.local";
    }
  }

  // Validate address shape server-side even though the client validated too.
  const addr = orderAddressSchema.safeParse(input.address);
  if (!addr.success) {
    return { ok: false, error: "Please review the shipping address fields." };
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, error: "Your bag is empty." };
  }

  // Phase 19 (19-09): partition stocked vs configurable lines.
  const stockedInputLines = input.items.filter((l) => !l.configurationData);
  const configurableInputLines = input.items.filter((l) => !!l.configurationData);

  // Clamp quantities to min 1, dedupe by variantId (sum quantities if dup).
  const qtyByVariant = new Map<string, number>();
  for (const line of stockedInputLines) {
    if (typeof line.variantId !== "string" || line.variantId.length === 0) {
      continue;
    }
    const q = Math.max(1, Math.floor(Number(line.quantity) || 0));
    qtyByVariant.set(
      line.variantId,
      (qtyByVariant.get(line.variantId) ?? 0) + q,
    );
  }
  const variantIds = [...qtyByVariant.keys()];
  if (variantIds.length === 0 && configurableInputLines.length === 0) {
    return { ok: false, error: "Your bag is empty." };
  }

  // Fetch variants + their products — manual two-query hydration instead of
  // db.query.*.findMany({ with: { product: true } }) which emits LATERAL joins
  // that MariaDB 10.11 rejects (ER_PARSE_ERROR). Shape returned matches the
  // old relational API: each row has a `product` field attached.
  const rawVariants = variantIds.length > 0
    ? await db.select().from(productVariants).where(inArray(productVariants.id, variantIds))
    : [];
  const productIdsForVariants = [
    ...new Set(rawVariants.map((v) => v.productId)),
  ];
  const productRows = productIdsForVariants.length
    ? await db
        .select()
        .from(products)
        .where(inArray(products.id, productIdsForVariants))
    : [];
  const productByIdForVariants = new Map(productRows.map((p) => [p.id, p]));
  const variantRows = rawVariants.map((v) => ({
    ...v,
    product: productByIdForVariants.get(v.productId)!,
  }));
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

  // Phase 19 (19-09) — append configurable line snapshots.
  // Price is trusted from configurationData.computedPrice (server-derived at
  // add-to-bag time — no DB variant to re-verify for made-to-order items).
  // Phase 19 gap fix — fetch real productId/slug/name for configurable lines
  // so order_items has true product references (admin printer manifest +
  // "View product" links from order detail).
  const configurableProductIds = [
    ...new Set(
      configurableInputLines
        .map((l) => l.productId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const configurableProductRows =
    configurableProductIds.length > 0
      ? await db
          .select({ id: products.id, slug: products.slug, name: products.name })
          .from(products)
          .where(inArray(products.id, configurableProductIds))
      : [];
  const productById = new Map(configurableProductRows.map((p) => [p.id, p]));

  // quick task 260610-kh3 — T-kh3-01: server re-validation of customInput options.
  // Re-read select config fields from DB for all configurable products, then
  // sanitize/enforce required+maxLength on every __custom value before snapshot.
  // Pricing/SKU/weight resolution is NOT touched (D-4).
  if (configurableProductIds.length > 0) {
    const configFieldRows = await db
      .select({
        id: productConfigFields.id,
        productId: productConfigFields.productId,
        fieldType: productConfigFields.fieldType,
        label: productConfigFields.label,
        configJson: productConfigFields.configJson,
      })
      .from(productConfigFields)
      .where(
        inArray(productConfigFields.productId, configurableProductIds),
      );

    // Build map: productId -> fieldId -> { label, options }
    type SelectFieldMeta = {
      id: string;
      label: string;
      options: Array<{ label: string; value: string; customInput?: boolean; customMaxLength?: number }>;
    };
    const selectFieldsByProduct = new Map<string, SelectFieldMeta[]>();
    for (const row of configFieldRows) {
      if (row.fieldType !== "select") continue;
      try {
        const cfg = ensureConfigJson("select", row.configJson) as { options: SelectFieldMeta["options"] };
        const existing = selectFieldsByProduct.get(row.productId) ?? [];
        existing.push({ id: row.id, label: row.label, options: cfg.options });
        selectFieldsByProduct.set(row.productId, existing);
      } catch {
        // Corrupt configJson — skip; don't block checkout for unrelated fields.
      }
    }

    // Mutate each configurable line's values in-place.
    for (const line of configurableInputLines) {
      if (!line.configurationData) continue;
      const pid = line.productId ?? "";
      const selectFields = selectFieldsByProduct.get(pid) ?? [];
      const values = line.configurationData.values as Record<string, string>;

      for (const sf of selectFields) {
        const chosenValue = values[sf.id];
        if (!chosenValue) continue;
        const opt = sf.options.find((o) => o.value === chosenValue);
        if (!opt) continue;

        if (opt.customInput) {
          // Required: read, sanitize, enforce non-empty.
          const raw = values[customKey(sf.id)] ?? "";
          const sanitized = sanitizeCustomText(raw, opt.customMaxLength ?? 30);
          if (sanitized.length === 0) {
            return {
              ok: false,
              error: `Please enter the required text for "${opt.label}".`,
            };
          }
          values[customKey(sf.id)] = sanitized;
        } else {
          // Non-flagged option: strip any smuggled __custom value (T-kh3-03).
          delete values[customKey(sf.id)];
        }
      }

      // Rebuild computedSummary server-side from sanitized values (T-kh3-02).
      if (selectFields.length > 0) {
        // Collect non-select parts from the existing client summary by splitting
        // on " · " and filtering out parts we will rebuild from select fields.
        // Simpler: re-derive all parts from scratch for select fields; keep the
        // client summary for non-select fields (text/colour/number) unchanged.
        const existingParts = (line.configurationData.computedSummary ?? "")
          .split(" · ")
          .filter((p) => {
            // Filter out any part whose label matches a select field we will rebuild.
            return !selectFields.some((sf) =>
              p.startsWith(sf.label + ": ") || p.startsWith(sf.label + ":"),
            );
          });
        line.configurationData.computedSummary = buildConfigSummaryServer(
          selectFields,
          values,
          existingParts,
        );
      }
    }
  }

  type ConfigSnap = typeof snapshots[0] & { configurationData: ConfigurationData | null };
  const allSnapshots: ConfigSnap[] = [
    ...snapshots.map((s) => ({ ...s, configurationData: null as ConfigurationData | null })),
    ...configurableInputLines.map((line) => {
      const cfg = line.configurationData!;
      const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
      const unitPrice = cfg.computedPrice.toFixed(2);
      const product = line.productId ? productById.get(line.productId) : undefined;
      return {
        variantId: "NONE", // sentinel — configurable lines have no variant
        productId: product?.id ?? line.productId ?? "",
        productName: product?.name ?? cfg.computedSummary.slice(0, 127),
        productSlug: product?.slug ?? "",
        productImage: null,
        variantLabel: cfg.computedSummary,
        unitPrice,
        unitCost: null as string | null,
        quantity: qty,
        lineTotal: (cfg.computedPrice * qty).toFixed(2),
        configurationData: cfg,
      };
    }),
  ];

  const subtotal = allSnapshots.reduce((sum, s) => sum + Number(s.lineTotal), 0);
  const subtotalStr = subtotal.toFixed(2);

  // The server never trusts a client-supplied shipping price — it re-quotes
  // against Delyva here (T-09-01-tampering).
  //
  // 260906 — one shipping engine for every order path. Always quotes Delyva
  // from the destination address (previously a customer who never touched the
  // courier picker skipped the quote entirely and got the flat table, which
  // was 0.00 for all 16 states). autoQuoteShipping honours the courier the
  // customer chose when it is still offered, else takes the cheapest, else
  // falls back to the weight-bracketed table. It never returns a silent zero.
  const autoShip = await autoQuoteShipping(
    input.items.map((i) => {
      const row = variantRows.find((v) => v.id === i.variantId);
      // Use the server-snapshot unitPrice (already sale-resolved) so the
      // free-shipping threshold check matches what we actually charge.
      const snap = allSnapshots.find((s) => s.variantId === i.variantId);
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
    input.shippingServiceCode ?? null,
  );

  if (!autoShip.ok) {
    return {
      ok: false,
      error:
        "We could not calculate shipping to that address right now. Please check your postcode and try again, or contact us.",
    };
  }

  const shippingNum = Number(autoShip.quote.cost.toFixed(2));
  const shippingServiceCode = autoShip.quote.serviceCode;
  const shippingServiceName = autoShip.quote.serviceName;
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
            items: allSnapshots.map((s) => ({
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

  // Duplicate guard (incident 2026-06-12): auto-cancel this customer's older
  // unpaid attempts with the same total (abandoned PayPal pendings, unproofed
  // bank-transfer retries) so only this attempt stays live. No reuse here —
  // every PayPal click needs its own fresh paypal_order_id. Safe even if an
  // old popup captures later: capturePayPalOrder flips the row to paid
  // regardless of its current status.
  try {
    const dedupe = await dedupeUnpaidOrders({
      requesterUserId: user?.id ?? null,
      email:
        resolvedEmail && !resolvedEmail.endsWith("@3dninjaz.local")
          ? resolvedEmail
          : null,
      phone: addr.data.phone,
      totalStr,
      reuseSignature: null,
    });
    if (dedupe.cancelledIds.length > 0) {
      console.info(
        `[paypal] superseded stale attempts: ${dedupe.cancelledIds.join(", ")}`,
      );
    }
  } catch (err) {
    console.error("[paypal] dedupe guard failed:", err);
  }

  // Insert pending order + items. Deterministic internal UUID so we don't
  // depend on MariaDB's $returningId behavior (which uses LAST_INSERT_ID
  // and does not round-trip non-integer UUIDs reliably on mysql2).
  const internalOrderId = randomUUID();
  // For guest orders: generate a token for the emailed order-view link.
  const guestAccessToken = user ? null : randomUUID();
  try {
    await db.insert(orders).values({
      id: internalOrderId,
      userId: user?.id ?? null,
      guestAccessToken,
      status: "pending",
      paypalOrderId,
      subtotal: subtotalStr,
      shippingCost: shippingStr,
      totalAmount: totalStr,
      // Record the coupon discount on the order so it reflects everywhere.
      discountAmount: discount.toFixed(2),
      discountCode: discount > 0 ? (input.couponCode ?? null) : null,
      currency: PAYPAL_CURRENCY,
      customerEmail: resolvedEmail,
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
      allSnapshots.map((s) => ({
        id: randomUUID(),
        orderId: internalOrderId,
        productId: s.productId,
        variantId: s.variantId, // "NONE" sentinel for configurable lines
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
        // Phase 19 (19-09) — configurationData snapshot for made-to-order lines.
        // Stocked lines write null (no change to existing behaviour).
        configurationData: s.configurationData
          ? JSON.stringify(s.configurationData)
          : null,
      })),
    );

    // A real order now exists — close out this customer's checkout drafts.
    void markDraftsConverted({ phone: addr.data.phone, userId: user?.id ?? null });

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
  const user = await getSessionUser(); // may be null for guests
  if (!paypalOrderId || typeof paypalOrderId !== "string") {
    return { ok: false, error: "Missing PayPal order ID." };
  }

  const existing = await db.query.orders.findFirst({
    where: eq(orders.paypalOrderId, paypalOrderId),
  });
  if (!existing) {
    return { ok: false, error: "Order not found." };
  }
  // Ownership gate (positive rule — denies by default):
  //   - Authenticated order (userId set): require the session user to own it.
  //   - Guest order (userId null): allow capture by anyone holding the
  //     unguessable paypalOrderId — PayPal approval already proves intent.
  if (existing.userId !== null) {
    if (!user || existing.userId !== user.id) {
      return { ok: false, error: "Order not found." };
    }
  }
  // Guest orders (userId null) pass through — secured by the paypalOrderId.
  // Guests view their order via the unguessable guestAccessToken (?t=...);
  // authenticated users use the normal /orders/[id] route.

  // Idempotency (D3-09): if we already captured, return existing result
  // without calling PayPal again.
  if (existing.paypalCaptureId) {
    const tokenSuffix = (existing.guestAccessToken && !existing.userId)
      ? `?t=${existing.guestAccessToken}`
      : "";
    return {
      ok: true,
      orderId: existing.id,
      orderNumber: formatOrderNumber(existing.id),
      redirectTo: `/orders/${existing.id}${tokenSuffix}`,
    };
  }

  // Capture via PayPal. PayPal itself is idempotent on an approved order —
  // repeat calls return ORDER_ALREADY_CAPTURED which we map to success below.
  let captureId: string | null = null;
  let captureStatus = "";
  // Capture the PayPal fee/net at capture time so accounting reports are correct
  // immediately (otherwise they stay NULL until an admin opens the payment page).
  let paypalFeeValue: string | null = null;
  let paypalNetValue: string | null = null;
  // Plan 05-03: pull the customId we set in createPayPalOrder so we know
  // which coupon (if any) to redeem after capture succeeds.
  let appliedCouponCode: string | null = null;
  // Hoisted so guest email back-fill can read payer info after the try block.
  let captureResponse: Awaited<ReturnType<ReturnType<typeof ordersController>["captureOrder"]>> | null = null;
  try {
    captureResponse = await ordersController().captureOrder({
      id: paypalOrderId,
      prefer: "return=representation",
    });
    const response = captureResponse;
    const order = response.result;
    const capture = order?.purchaseUnits?.[0]?.payments?.captures?.[0];
    captureId = capture?.id ?? null;
    captureStatus = capture?.status ?? "";
    // seller_receivable_breakdown is present on the capture when we request
    // prefer=return=representation — no extra API call needed.
    const recv = (capture as {
      sellerReceivableBreakdown?: {
        paypalFee?: { value?: string };
        netAmount?: { value?: string };
      };
    })?.sellerReceivableBreakdown;
    paypalFeeValue = recv?.paypalFee?.value ?? null;
    paypalNetValue = recv?.netAmount?.value ?? null;
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
        const tok = (refetched.guestAccessToken && !refetched.userId)
          ? `?t=${refetched.guestAccessToken}`
          : "";
        return {
          ok: true,
          orderId: refetched.id,
          orderNumber: formatOrderNumber(refetched.id),
          redirectTo: `/orders/${refetched.id}${tok}`,
        };
      }
    }
    console.error("[paypal] captureOrder failed:", err);
    return { ok: false, error: "We could not capture your PayPal payment." };
  }

  // Update our row to paid + record capture ID. amountPaid = the total at
  // capture time, so a later admin item-add shows a balance due.
  await db
    .update(orders)
    .set({
      status: "paid",
      paypalCaptureId: captureId,
      amountPaid: existing.totalAmount,
      // May be null if PayPal omitted the breakdown; the payment page lazily
      // back-fills later in that case.
      paypalFee: paypalFeeValue,
      paypalNet: paypalNetValue,
    })
    .where(eq(orders.id, existing.id));

  // For guest orders with a placeholder/blank email: back-fill customerEmail
  // from PayPal payer info so the confirmation/tracking link can reach them.
  if (!existing.userId && captureResponse) {
    try {
      const payerEmail = (captureResponse as { result?: { payer?: { emailAddress?: string } } })
        .result?.payer?.emailAddress;
      if (payerEmail) {
        await db.update(orders)
          .set({ customerEmail: payerEmail })
          .where(eq(orders.id, existing.id));
      }
    } catch {
      // non-critical — order is paid regardless
    }
  }

  // Shipping is booked MANUALLY by an admin from /admin/orders/[id] when
  // ready (ops decision 2026-06-01) — do NOT auto-book the courier on payment.

  // Plan 05-03 — atomic coupon redemption AFTER capture succeeds. If the
  // coupon's usage_cap was hit between approval and capture, we lose the
  // discount on the audit trail but the customer already paid the
  // discounted amount (it was sent to PayPal as the order total). This is
  // an acceptable failure mode — log it for the operator. Guest orders
  // (userId null) DO redeem now — coupon_redemptions.user_id is nullable, so a
  // guest redemption still increments usage_count against the cap; the audit
  // row just has no user attached.
  if (appliedCouponCode) {
    try {
      const subtotalNum = parseFloat(existing.subtotal);
      const valid = await validateCoupon(appliedCouponCode, subtotalNum);
      if (valid.ok) {
        const redeemed = await redeemCoupon(
          valid.couponId,
          existing.id,
          existing.userId ?? null,
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

  // Await the order-confirmation email send. Previously this was
  // `void sendOrderConfirmationEmail(...)`, but on Node-runtime server
  // actions Next.js may abort the pending promise after the response
  // returns to the client, so customers stopped receiving confirmations.
  // sendOrderConfirmationEmail catches its own SMTP errors and never
  // throws — awaiting it adds ~500ms-1s to the capture response but
  // guarantees the email is actually sent before we hand control back.
  try {
    await sendOrderConfirmationEmail(existing.id);
  } catch (err) {
    console.error("[paypal] confirmation email dispatch failed:", err);
  }
  void sendWhatsAppNotification("order_confirmation", existing.shippingPhone, {
    customerName: existing.shippingName,
    orderNumber: formatOrderNumber(existing.id),
    orderUrl: publicUrl(`/orders/${existing.id}`),
  }).catch(() => {});
  void sendWhatsAppInvoicePdf(existing.id, existing.shippingPhone).catch(() => {});

  revalidatePath(`/orders/${existing.id}`);
  revalidatePath("/orders");

  // Build the redirect URL. Guest orders include ?t=<token> so the order
  // detail page allows unauthenticated access via the tokenized link.
  const guestTokenQS = (existing.guestAccessToken && !existing.userId)
    ? `&t=${existing.guestAccessToken}`
    : "";
  return {
    ok: true,
    orderId: existing.id,
    orderNumber: formatOrderNumber(existing.id),
    // `?from=checkout` toggles the success banner on /orders/[id] (Plan 03-03).
    // Guests append the unguessable ?t=token so the tokenized order page lets
    // them view it without an account.
    redirectTo: `/orders/${existing.id}?from=checkout${guestTokenQS}`,
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
  // Manual two-query hydration — MariaDB 10.11 does not support the LATERAL
  // joins Drizzle emits for db.query.*.findFirst({ with: { items: true } }).
  const orderRow = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (orderRow.length === 0) return null;
  const row = orderRow[0];
  const userWithRole = user as unknown as { id: string; role: string };
  if (row.userId !== userWithRole.id && userWithRole.role !== "admin") return null;
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, row.id));
  return { ...row, items };
}
