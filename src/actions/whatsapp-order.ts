"use server";

import { db } from "@/lib/db";
import { orders, orderItems, productVariants, productOptionValues, products } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { composeVariantLabel, resolveEffectivePrice } from "@/lib/variants";
import { randomUUID } from "node:crypto";
import { getSessionUser } from "@/lib/auth-helpers";
import { orderAddressSchema, type OrderAddressInput } from "@/lib/validators";
import { validateCoupon, redeemCoupon } from "@/actions/coupons";
import { getShippingRate } from "@/actions/admin-shipping";
import { quoteForCart } from "@/actions/shipping-quote";
import { revalidatePath } from "next/cache";
import type { ConfigurationData } from "@/lib/config-fields";
import { ensureConfigJson } from "@/lib/config-fields";
import { productConfigFields } from "@/lib/db/schema";
import { sanitizeCustomText, customKey, buildConfigSummaryServer } from "@/lib/custom-text";

type BagLineInput = {
  variantId: string;
  quantity: number;
  configurationData?: ConfigurationData | null;
  productId?: string;
};

type CreateWhatsAppOrderInput = {
  address: OrderAddressInput;
  items: BagLineInput[];
  couponCode?: string | null;
  shippingServiceCode?: string | null;
  guestName?: string;   // required when not signed in
  guestEmail?: string;  // optional even for guests
};

type CreateWhatsAppOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string };

/**
 * Create a WhatsApp bank-transfer order. Mirrors createPayPalOrder exactly
 * for item-fetching, pricing, coupon, and shipping re-quote logic.
 * Differences: no PayPal API call; inserts with status "awaiting_payment_review"
 * and paymentMethod "bank_transfer".
 *
 * SECURITY CONTRACT: same as createPayPalOrder — the client sends only
 * { variantId, quantity } pairs; the server re-fetches and re-prices everything.
 */
export async function createWhatsAppOrder(
  input: CreateWhatsAppOrderInput,
): Promise<CreateWhatsAppOrderResult> {
  const user = await getSessionUser();
  const isGuest = !user;

  // For guests, guestName is required (it replaces the account name).
  if (isGuest) {
    const name = input.guestName?.trim();
    if (!name) {
      return { ok: false, error: "Please enter your name to continue." };
    }
  }

  const addr = orderAddressSchema.safeParse(input.address);
  if (!addr.success) {
    return { ok: false, error: "Please review the shipping address fields." };
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, error: "Your bag is empty." };
  }

  // Partition stocked vs configurable lines.
  const stockedInputLines = input.items.filter((l) => !l.configurationData);
  const configurableInputLines = input.items.filter((l) => !!l.configurationData);

  // Clamp quantities to min 1, dedupe by variantId.
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

  // Fetch variants + their products — manual two-query hydration (no LATERAL joins).
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

  // Fetch option values for variant label composition.
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
    unitPrice: string;
    unitCost: string | null;
    quantity: number;
    lineTotal: string;
  };

  const priceNow = new Date();
  const snapshots: Snap[] = variantRows.map((v) => {
    const quantity = qtyByVariant.get(v.id)!;
    const { effectivePrice } = resolveEffectivePrice(v, priceNow);
    const unit = Number(effectivePrice);
    const line = Number((unit * quantity).toFixed(2));
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
      unitCost: v.costPrice ?? null,
      quantity,
      lineTotal: line.toFixed(2),
    };
  });

  // Append configurable line snapshots.
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
  // Identical treatment as paypal.ts — WhatsApp orders MUST NOT trust client custom text.
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
        // Corrupt configJson — skip.
      }
    }

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
          delete values[customKey(sf.id)];
        }
      }

      if (selectFields.length > 0) {
        const existingParts = (line.configurationData.computedSummary ?? "")
          .split(" · ")
          .filter((p) =>
            !selectFields.some((sf) =>
              p.startsWith(sf.label + ": ") || p.startsWith(sf.label + ":"),
            ),
          );
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
        variantId: "NONE",
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

  // Shipping re-quote — same logic as createPayPalOrder.
  let shippingNum: number;
  let shippingServiceCode: string | null = null;
  let shippingServiceName: string | null = null;
  if (input.shippingServiceCode) {
    try {
      const quote = await quoteForCart(
        input.items.map((i) => {
          const row = variantRows.find((v) => v.id === i.variantId);
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
        const flat = await getShippingRate(addr.data.state, subtotal);
        shippingNum = Number(flat.cost.toFixed(2));
      }
    } catch (err) {
      console.error("[whatsapp-order] Delyva re-quote failed:", err);
      const flat = await getShippingRate(addr.data.state, subtotal);
      shippingNum = Number(flat.cost.toFixed(2));
    }
  } else {
    const shippingResult = await getShippingRate(addr.data.state, subtotal);
    shippingNum = Number(shippingResult.cost.toFixed(2));
  }
  shippingNum = Number(shippingNum.toFixed(2));
  const shippingStr = shippingNum.toFixed(2);

  // Coupon validation.
  let discount = 0;
  let validatedCouponId: string | null = null;
  if (input.couponCode && typeof input.couponCode === "string") {
    const valid = await validateCoupon(input.couponCode, subtotal);
    if (valid.ok) {
      discount = valid.discount;
      validatedCouponId = valid.couponId;
    }
  }

  const totalNum = Math.max(0, +(subtotal - discount + shippingNum).toFixed(2));
  const totalStr = totalNum.toFixed(2);

  // Insert order row with bank_transfer + awaiting_payment_review.
  const internalOrderId = randomUUID();
  try {
    await db.insert(orders).values({
      id: internalOrderId,
      userId: user?.id ?? null,
      status: "awaiting_payment_review",
      paymentMethod: "bank_transfer",
      subtotal: subtotalStr,
      shippingCost: shippingStr,
      totalAmount: totalStr,
      // Record the coupon discount on the order so it reflects in admin/customer
      // views, the invoice, and the WhatsApp message.
      discountAmount: discount.toFixed(2),
      discountCode: discount > 0 ? (input.couponCode ?? null) : null,
      currency: "MYR",
      customerEmail: user?.email ?? (input.guestEmail?.trim() || "guest@3dninjaz.local"),
      shippingName: addr.data.recipientName,
      shippingPhone: addr.data.phone,
      shippingLine1: addr.data.addressLine1,
      shippingLine2: addr.data.addressLine2 || null,
      shippingCity: addr.data.city,
      shippingState: addr.data.state,
      shippingPostcode: addr.data.postcode,
      shippingCountry: "Malaysia",
      shippingServiceCode: shippingServiceCode,
      shippingServiceName: shippingServiceName,
      shippingQuotedPrice: shippingServiceCode ? shippingStr : null,
    });

    await db.insert(orderItems).values(
      allSnapshots.map((s) => ({
        id: randomUUID(),
        orderId: internalOrderId,
        productId: s.productId,
        variantId: s.variantId,
        productName: s.productName,
        productSlug: s.productSlug,
        productImage: s.productImage,
        variantLabel: s.variantLabel || null,
        unitPrice: s.unitPrice,
        unitCost: s.unitCost,
        quantity: s.quantity,
        lineTotal: s.lineTotal,
        configurationData: s.configurationData
          ? JSON.stringify(s.configurationData)
          : null,
      })),
    );

    // Count the coupon usage against its cap (guest or member). user?.id is
    // null for guests — coupon_redemptions.user_id is nullable, so the
    // redemption still increments usage_count. Same acceptable failure mode as
    // PayPal: if the cap was hit in a race, the order keeps its discount but
    // the audit row is skipped (logged, never throws).
    if (validatedCouponId && discount > 0) {
      try {
        const redeemed = await redeemCoupon(
          validatedCouponId,
          internalOrderId,
          user?.id ?? null,
          subtotal,
        );
        if (!redeemed.ok) {
          console.warn(
            `[whatsapp-order] coupon ${input.couponCode} redemption refused for order ${internalOrderId}: ${redeemed.error}`,
          );
        }
      } catch (err) {
        console.error("[whatsapp-order] coupon redemption error:", err);
      }
    }

    revalidatePath("/admin/orders");
    revalidatePath("/orders");

    return { ok: true, orderId: internalOrderId };
  } catch (err) {
    console.error("[whatsapp-order] DB write failed:", err);
    return { ok: false, error: "We could not save your order. Please try again." };
  }
}
