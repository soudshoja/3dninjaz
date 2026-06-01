"use server";

import { db } from "@/lib/db";
import {
  orders,
  orderItems,
  products,
  productVariants,
  coupons,
  user,
} from "@/lib/db/schema";
import { and, asc, desc, eq, inArray, like, ne, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { formatOrderNumber } from "@/lib/orders";
import { assertValidTransition } from "@/lib/orders";
import { getShippingRate } from "@/actions/admin-shipping";
import { applyCouponToSubtotal, type CouponSnapshot } from "@/lib/pricing";
import { redeemCoupon } from "@/actions/coupons";
import { pickImage } from "@/lib/image-manifest";
import { hydrateProductVariants } from "@/lib/variants";
import { getConfigurableProductData } from "@/lib/configurable-product-data";
import { renderDescription } from "@/lib/render-description";
import { ensureImagesV2 } from "@/lib/config-fields";
import type { PictureData } from "@/lib/image-manifest";
import type { PublicConfigField } from "@/lib/configurable-product-data";

/**
 * Phase 20 (20-05 / 20-09b) — Admin POS multi-line order builder server actions.
 *
 * Provides:
 *   - getPosProductSearch      : type-ahead search across active products
 *   - getPosProductHydration   : full PDP hydration for mounting <ProductDetail> in POS
 *   - createPosOrder           : write one orders row + N order_items in a transaction
 *   - setOrderAwaitingCustomer : transition pending → awaiting_customer
 *
 * Every export awaits `requireAdmin()` first (CVE-2025-29927 mitigation).
 * MariaDB 10.11 no-LATERAL rule: every read uses manual multi-query hydration.
 * D-06 sentinel: free-text lines write productId='manual' + variantId='manual'.
 *
 * 20-09b rework: getPosConfigFields + getStockedVariantsForPos removed —
 * the POS now mounts the customer <ProductDetail> directly (onAddToOrder callback)
 * so separate config-field and variant queries are no longer needed.
 */

// ============================================================================
// Types
// ============================================================================

export type PosProductResult = {
  id: string;
  name: string;
  productType: string;
  thumbnailUrl: string | null;
  variantCount: number;
  /** Minimum variant price (MYR). Null for configurable/keychain products
   *  that use priceTiers instead of a flat variant price. */
  minPrice: number | null;
};

/** Discriminated union for POS order lines. */
export type PosLineStocked = {
  kind: "stocked";
  productId: string;
  variantId: string;
  quantity: number;
  unitPriceOverride?: number;
};

export type PosLineConfigurable = {
  kind: "configurable";
  productId: string;
  variantId?: string;
  quantity: number;
  configurationData: string; // JSON string
  computedUnitPrice: number;
  unitPriceOverride?: number;
};

export type PosLineFreeText = {
  kind: "free_text";
  name: string;
  quantity: number;
  unitPrice: number;
  description?: string;
};

export type PosLine = PosLineStocked | PosLineConfigurable | PosLineFreeText;

export type PosOrderCustomer = {
  name: string;
  email?: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postcode: string;
  country?: string;
};

export type PosOrderInput = {
  lines: PosLine[];
  customer: PosOrderCustomer;
  shippingOverride?: number;
  couponCode?: string;
  shippingCourier?: { serviceCode: string; serviceName: string } | null;
};

export type CreatePosOrderResult =
  | { ok: true; orderId: string; orderNumber: string }
  | { ok: false; error: string };

/**
 * Hydration payload returned by getPosProductHydration.
 * Mirrors what src/app/(store)/products/[slug]/page.tsx fetches for ProductDetail.
 */
export type PosProductHydration = {
  product: {
    id: string;
    name: string;
    slug: string;
    description: string;
    descriptionHtml: string;
    images: string[];
    imageCaptions: (string | null | undefined)[];
    materialType: string | null;
    estimatedProductionDays: number | null;
    category: { name: string; slug: string } | null;
    options: Awaited<ReturnType<typeof hydrateProductVariants>>["options"];
    hydratedVariants: Awaited<ReturnType<typeof hydrateProductVariants>>["variants"];
    productType: "stocked" | "configurable" | "keychain" | "vending" | "simple";
    hideBasePrice: boolean;
  };
  pictures: PictureData[];
  variantPictures: Record<string, PictureData | null>;
  configurableData:
    | { fields: PublicConfigField[]; maxUnitCount: number | null; priceTiers: Record<string, number>; unitField: string | null }
    | undefined;
};

// Sentinel for /admin/orders email domain (mirrors admin-manual-orders.ts pattern)
const SENTINEL_EMAIL_DOMAIN = "@3dninjaz.local";

// ============================================================================
// resolvePosCustomerId — find-or-create customer user row inside a transaction
// ============================================================================

/**
 * Resolve (find or create) a customer `user` row inside the createPosOrder
 * transaction so the order is attributed to a real customer, not the admin.
 *
 * Resolution ladder (runs inside the caller's tx so it rolls back with the order):
 *  1. find-by-email: if customerEmail is a real address (not a sentinel), SELECT
 *     WHERE email = trimmedEmail AND id != adminUserId. The admin guard means that
 *     even if the operator typed the admin's own email the admin row is skipped and
 *     a new customer row is created instead (REQ-4).
 *  2. find-by-phone-via-orders (only when customerEmail is a sentinel): SELECT
 *     orders.userId WHERE shippingPhone = phone ORDER BY createdAt DESC LIMIT 1;
 *     skip any userId equal to adminUserId (legacy admin-attributed rows).
 *  3. create-new: INSERT user with randomUUID, role="customer", emailVerified=false.
 *     No `account` row — customer cannot log in until they do a password reset.
 *
 * Race handling: on ER_DUP_ENTRY (email UNIQUE collision from a concurrent create)
 * re-SELECT with the same admin guard. If that still returns nothing (the collision
 * was against the admin's own email row), throw a descriptive error.
 */
async function resolvePosCustomerId(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  args: {
    customerEmail: string;
    name: string;
    phone: string;
    adminUserId: string;
  },
): Promise<string> {
  const { customerEmail, name, phone, adminUserId } = args;

  const isSentinel = customerEmail.endsWith(SENTINEL_EMAIL_DOMAIN);

  // ── Step 1: find-by-email (skip sentinel emails — they are not real addresses) ──
  if (!isSentinel) {
    const [found] = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.email, customerEmail), ne(user.id, adminUserId)))
      .limit(1);
    if (found) return found.id;
  }

  // ── Step 2: find-by-phone via prior orders (only when no real email given) ──
  if (isSentinel && phone) {
    const [phoneOrder] = await tx
      .select({ userId: orders.userId })
      .from(orders)
      .where(eq(orders.shippingPhone, phone))
      .orderBy(desc(orders.createdAt))
      .limit(1);
    // phoneOrder.userId may be null for guest orders — skip those (no account to re-use).
    if (phoneOrder && phoneOrder.userId !== null && phoneOrder.userId !== adminUserId) {
      return phoneOrder.userId;
    }
  }

  // ── Step 3: create-new customer row ─────────────────────────────────────────
  const newId = randomUUID();
  const now = new Date();
  try {
    await tx.insert(user).values({
      id: newId,
      name,
      email: customerEmail,
      emailVerified: false,
      role: "customer",
      createdAt: now,
      updatedAt: now,
    });
    return newId;
  } catch (err: unknown) {
    // ER_DUP_ENTRY: concurrent create for the same email — re-select and reuse
    const isdup =
      (err as { code?: string; errno?: number }).code === "ER_DUP_ENTRY" ||
      (err as { errno?: number }).errno === 1062;
    if (isdup) {
      const [raceFound] = await tx
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.email, customerEmail), ne(user.id, adminUserId)))
        .limit(1);
      if (raceFound) return raceFound.id;
      // The collision was against the admin's own email row — operator data-entry error
      throw new Error(
        "The email entered belongs to the admin account. Please enter the customer's own email or leave it blank.",
      );
    }
    throw err;
  }
}

// ============================================================================
// Task 1: Read helpers
// ============================================================================

/**
 * Type-ahead product search for the POS product picker.
 * Returns up to 25 active products matching name or SKU.
 * Excludes archived/inactive products. No LATERAL joins (MariaDB 10.11).
 */
export async function getPosProductSearch(
  query: string,
): Promise<PosProductResult[]> {
  const session = await requireAdmin();
  void session;

  const trimmed = (query ?? "").trim();
  if (!trimmed) return [];

  // Search active products by name. MariaDB LIKE is case-insensitive by default
  // on utf8mb4_general_ci collation — no need for LOWER().
  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      productType: products.productType,
      images: products.images,
      thumbnailIndex: products.thumbnailIndex,
    })
    .from(products)
    .where(
      and(
        eq(products.isActive, true),
        like(products.name, `%${trimmed}%`),
      ),
    )
    .limit(25);

  if (productRows.length === 0) return [];

  // Batch fetch variant counts + min prices per product (no LATERAL)
  const productIds = productRows.map((p) => p.id);
  const variantAggRows = await db
    .select({
      productId: productVariants.productId,
      cnt: sql<number>`COUNT(*)`,
      minPrice: sql<string>`MIN(CAST(price AS DECIMAL(10,2)))`,
    })
    .from(productVariants)
    .where(inArray(productVariants.productId, productIds))
    .groupBy(productVariants.productId);

  const countByProduct = new Map<string, number>(
    variantAggRows.map((r) => [r.productId, Number(r.cnt)]),
  );
  const minPriceByProduct = new Map<string, number | null>(
    variantAggRows.map((r) => [
      r.productId,
      r.minPrice !== null ? Number(r.minPrice) : null,
    ]),
  );

  return productRows.map((p) => {
    // Pick thumbnail URL from images array (JSON LONGTEXT — parse safely)
    let thumbnailUrl: string | null = null;
    try {
      const rawImages = typeof p.images === "string"
        ? JSON.parse(p.images as string)
        : p.images;
      const arr = Array.isArray(rawImages) ? rawImages : [];
      const idx = typeof p.thumbnailIndex === "number" ? p.thumbnailIndex : 0;
      const entry = arr[idx] ?? arr[0];
      if (typeof entry === "string") thumbnailUrl = entry;
      else if (entry && typeof entry === "object" && "url" in entry)
        thumbnailUrl = entry.url as string;
    } catch {
      thumbnailUrl = null;
    }

    return {
      id: p.id,
      name: p.name,
      productType: p.productType,
      thumbnailUrl,
      variantCount: countByProduct.get(p.id) ?? 0,
      minPrice: minPriceByProduct.get(p.id) ?? null,
    };
  });
}

// ============================================================================
// Task 1a: getPosRecentProducts — initial product grid (no search query)
// ============================================================================

/**
 * Returns up to 40 active products sorted by most recently updated — used to
 * populate the POS product-tile grid before the admin types a search query.
 * MariaDB-safe: manual multi-query hydration (no LATERAL).
 */
export async function getPosRecentProducts(): Promise<PosProductResult[]> {
  await requireAdmin();

  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      productType: products.productType,
      images: products.images,
      thumbnailIndex: products.thumbnailIndex,
    })
    .from(products)
    .where(eq(products.isActive, true))
    .orderBy(desc(products.updatedAt))
    .limit(40);

  if (productRows.length === 0) return [];

  const productIds = productRows.map((p) => p.id);
  const variantAggRows = await db
    .select({
      productId: productVariants.productId,
      cnt: sql<number>`COUNT(*)`,
      minPrice: sql<string>`MIN(CAST(price AS DECIMAL(10,2)))`,
    })
    .from(productVariants)
    .where(inArray(productVariants.productId, productIds))
    .groupBy(productVariants.productId);

  const countByProduct = new Map<string, number>(
    variantAggRows.map((r) => [r.productId, Number(r.cnt)]),
  );
  const minPriceByProduct = new Map<string, number | null>(
    variantAggRows.map((r) => [
      r.productId,
      r.minPrice !== null ? Number(r.minPrice) : null,
    ]),
  );

  return productRows.map((p) => {
    let thumbnailUrl: string | null = null;
    try {
      const rawImages = typeof p.images === "string"
        ? JSON.parse(p.images as string)
        : p.images;
      const arr = Array.isArray(rawImages) ? rawImages : [];
      const idx = typeof p.thumbnailIndex === "number" ? p.thumbnailIndex : 0;
      const entry = arr[idx] ?? arr[0];
      if (typeof entry === "string") thumbnailUrl = entry;
      else if (entry && typeof entry === "object" && "url" in entry)
        thumbnailUrl = entry.url as string;
    } catch {
      thumbnailUrl = null;
    }

    return {
      id: p.id,
      name: p.name,
      productType: p.productType,
      thumbnailUrl,
      variantCount: countByProduct.get(p.id) ?? 0,
      minPrice: minPriceByProduct.get(p.id) ?? null,
    };
  });
}

// ============================================================================
// Task 1b: getPosProductHydration
// ============================================================================

/**
 * Fetch the full PDP hydration payload for a given product id.
 * Mirrors the server-side data fetching in src/app/(store)/products/[slug]/page.tsx
 * so the POS can mount <ProductDetail> with identical props.
 *
 * Does NOT include isWishlistedInitial / ratingAvg / ratingCount — POS passes
 * false / 0 for those (not needed in the admin context).
 *
 * Uses manual multi-query hydration (no LATERAL — MariaDB 10.11).
 */
export async function getPosProductHydration(
  productId: string,
): Promise<PosProductHydration | null> {
  const session = await requireAdmin();
  void session;

  // Fetch the base product row (active OR inactive — admin sees all)
  const [row] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!row) return null;

  // Resolve images array (MariaDB JSON LONGTEXT)
  const { ensureImagesArray: _ensureImages } = await (async () => {
    // Inline the same logic as catalog.ts ensureImagesArray
    function ensureImagesArray(raw: unknown): string[] {
      return ensureImagesV2(raw).map((e) => e.url);
    }
    return { ensureImagesArray };
  })();

  const images = _ensureImages(row.images);
  const imagesV2 = ensureImagesV2(row.images);
  const imageCaptions = imagesV2.map((e) => e.caption ?? null);

  // Category name/slug
  let category: { name: string; slug: string } | null = null;
  if (row.categoryId) {
    const { categories } = await import("@/lib/db/schema");
    const [catRow] = await db
      .select({ name: categories.name, slug: categories.slug })
      .from(categories)
      .where(eq(categories.id, row.categoryId))
      .limit(1);
    if (catRow) category = catRow;
  }

  // Hydrate options + variants (same helper the PDP page uses)
  const { options, variants: hydratedVariants } = await hydrateProductVariants(productId);

  // Configurable data — matches page.tsx condition verbatim
  const needsConfigData =
    row.productType === "configurable" ||
    row.productType === "keychain" ||
    row.productType === "vending" ||
    row.productType === "simple";
  const configurableData = needsConfigData
    ? await getConfigurableProductData(productId)
    : undefined;

  // Pre-resolve <picture> sources for all product images
  const pictures = await Promise.all(images.map((u) => pickImage(u)));

  // Per-variant PictureData for variants that have an imageUrl
  const variantPictureEntries = await Promise.all(
    hydratedVariants
      .filter((v) => v.imageUrl)
      .map(async (v) => [v.id, await pickImage(v.imageUrl!)] as const),
  );
  const variantPictures = Object.fromEntries(variantPictureEntries);

  const productType = (row.productType ?? "stocked") as
    | "stocked"
    | "configurable"
    | "keychain"
    | "vending"
    | "simple";

  return {
    product: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description ?? "",
      descriptionHtml: renderDescription(row.description ?? ""),
      images,
      imageCaptions,
      materialType: row.materialType ?? null,
      estimatedProductionDays: row.estimatedProductionDays ?? null,
      category,
      options,
      hydratedVariants,
      productType,
      hideBasePrice: row.hideBasePrice ?? false,
    },
    pictures,
    variantPictures,
    configurableData,
  };
}

// ============================================================================
// Task 2: createPosOrder (write path)
// ============================================================================

/**
 * Create a POS order with N order_items rows in a single transaction.
 * Handles stocked + configurable + free-text lines.
 * Atomic coupon redemption inside the transaction.
 * D-06: free-text lines use productId='manual' + variantId='manual' sentinels.
 * D-21: paymentMethod is null (set later when customer chooses).
 */
export async function createPosOrder(
  input: PosOrderInput,
): Promise<CreatePosOrderResult> {
  const session = await requireAdmin();

  const { lines, customer, shippingOverride, couponCode, shippingCourier } = input;

  if (!lines || lines.length === 0) {
    return { ok: false, error: "At least one line is required." };
  }

  // ── Step 1: Validate lines and resolve unit prices ──────────────────────

  type ResolvedLine = {
    productId: string;
    variantId: string;
    productName: string;
    productSlug: string | null;
    productImage: string | null;
    variantLabel: string | null;
    unitPrice: number;
    quantity: number;
    configurationData: string | null;
  };

  const resolvedLines: ResolvedLine[] = [];

  for (const line of lines) {
    if (line.kind === "free_text") {
      if (!line.name || line.name.trim().length === 0) {
        return { ok: false, error: "Free-text line must have a name." };
      }
      if (typeof line.unitPrice !== "number" || line.unitPrice < 0) {
        return { ok: false, error: `Invalid price for free-text line "${line.name}".` };
      }
      if (typeof line.quantity !== "number" || line.quantity < 1) {
        return { ok: false, error: `Invalid quantity for free-text line "${line.name}".` };
      }
      resolvedLines.push({
        productId: "manual",
        variantId: "manual",
        productName: line.name.trim(),
        productSlug: null,
        productImage: null,
        variantLabel: null,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        configurationData: null,
      });
      continue;
    }

    if (line.kind === "stocked") {
      // Validate variantId belongs to productId
      const [variantRow] = await db
        .select({
          id: productVariants.id,
          price: productVariants.price,
          salePrice: productVariants.salePrice,
          saleFrom: productVariants.saleFrom,
          saleTo: productVariants.saleTo,
          inStock: productVariants.inStock,
          labelCache: productVariants.labelCache,
        })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.id, line.variantId),
            eq(productVariants.productId, line.productId),
          ),
        )
        .limit(1);

      if (!variantRow) {
        return {
          ok: false,
          error: `Variant ${line.variantId} not found for product ${line.productId}.`,
        };
      }

      const [productRow] = await db
        .select({
          name: products.name,
          slug: products.slug,
          images: products.images,
          thumbnailIndex: products.thumbnailIndex,
        })
        .from(products)
        .where(eq(products.id, line.productId))
        .limit(1);

      if (!productRow) {
        return { ok: false, error: `Product ${line.productId} not found.` };
      }

      // Resolve effective price
      const now = new Date();
      const hasSalePrice = variantRow.salePrice !== null;
      const afterFrom = !variantRow.saleFrom || variantRow.saleFrom <= now;
      const beforeTo = !variantRow.saleTo || variantRow.saleTo >= now;
      const isOnSale = hasSalePrice && afterFrom && beforeTo;
      const basePrice = isOnSale
        ? parseFloat(variantRow.salePrice!)
        : parseFloat(variantRow.price);
      const unitPrice =
        typeof line.unitPriceOverride === "number"
          ? line.unitPriceOverride
          : basePrice;

      // Pick thumbnail image
      let productImage: string | null = null;
      try {
        const rawImages =
          typeof productRow.images === "string"
            ? JSON.parse(productRow.images as string)
            : productRow.images;
        const arr = Array.isArray(rawImages) ? rawImages : [];
        const idx =
          typeof productRow.thumbnailIndex === "number"
            ? productRow.thumbnailIndex
            : 0;
        const entry = arr[idx] ?? arr[0];
        if (typeof entry === "string") productImage = entry;
        else if (entry && typeof entry === "object" && "url" in entry)
          productImage = (entry as { url: string }).url;
      } catch {
        productImage = null;
      }

      resolvedLines.push({
        productId: line.productId,
        variantId: line.variantId,
        productName: productRow.name,
        productSlug: productRow.slug,
        productImage,
        variantLabel: variantRow.labelCache ?? null,
        unitPrice,
        quantity: line.quantity,
        configurationData: null,
      });
      continue;
    }

    if (line.kind === "configurable") {
      const [productRow] = await db
        .select({
          name: products.name,
          slug: products.slug,
          images: products.images,
          thumbnailIndex: products.thumbnailIndex,
        })
        .from(products)
        .where(eq(products.id, line.productId))
        .limit(1);

      if (!productRow) {
        return { ok: false, error: `Product ${line.productId} not found.` };
      }

      const unitPrice =
        typeof line.unitPriceOverride === "number"
          ? line.unitPriceOverride
          : line.computedUnitPrice;

      // Pick thumbnail image
      let productImage: string | null = null;
      try {
        const rawImages =
          typeof productRow.images === "string"
            ? JSON.parse(productRow.images as string)
            : productRow.images;
        const arr = Array.isArray(rawImages) ? rawImages : [];
        const idx =
          typeof productRow.thumbnailIndex === "number"
            ? productRow.thumbnailIndex
            : 0;
        const entry = arr[idx] ?? arr[0];
        if (typeof entry === "string") productImage = entry;
        else if (entry && typeof entry === "object" && "url" in entry)
          productImage = (entry as { url: string }).url;
      } catch {
        productImage = null;
      }

      // variantId: use the provided one or fall back to 'manual' sentinel for
      // configurable products with no variant axis (D-06)
      const variantId = line.variantId ?? "manual";

      resolvedLines.push({
        productId: line.productId,
        variantId,
        productName: productRow.name,
        productSlug: productRow.slug,
        productImage,
        variantLabel: null,
        unitPrice,
        quantity: line.quantity,
        configurationData: line.configurationData ?? null,
      });
      continue;
    }
  }

  // ── Step 2: Compute subtotal ─────────────────────────────────────────────

  const subtotal = resolvedLines.reduce(
    (sum, l) => sum + l.unitPrice * l.quantity,
    0,
  );

  // ── Step 3: Coupon validation (read-only; redemption happens in tx) ──────

  let discountAmount = 0;
  let validatedCouponId: string | null = null;
  let couponSnapshot: CouponSnapshot | null = null;

  if (couponCode && couponCode.trim().length > 0) {
    const upper = couponCode.trim().toUpperCase();

    // Fetch coupon row directly (admin is authenticated; skip the session check
    // in the customer-facing validateCoupon which gates on getSessionUser)
    const [couponRow] = await db
      .select()
      .from(coupons)
      .where(eq(coupons.code, upper))
      .limit(1);

    if (!couponRow) {
      return { ok: false, error: "Invalid coupon code." };
    }
    if (!couponRow.active) {
      return { ok: false, error: "Coupon is not active." };
    }
    const now = new Date();
    if (couponRow.startsAt && couponRow.startsAt > now) {
      return { ok: false, error: "Coupon is not yet valid." };
    }
    if (couponRow.endsAt && couponRow.endsAt < now) {
      return { ok: false, error: "Coupon has expired." };
    }

    couponSnapshot = {
      id: couponRow.id,
      code: couponRow.code,
      type: couponRow.type,
      amount: couponRow.amount,
      minSpend: couponRow.minSpend ?? null,
      startsAt: couponRow.startsAt ?? null,
      endsAt: couponRow.endsAt ?? null,
      usageCap: couponRow.usageCap ?? null,
      usageCount: couponRow.usageCount,
      active: !!couponRow.active,
    };

    try {
      const result = applyCouponToSubtotal(subtotal, couponSnapshot);
      discountAmount = result.discount;
      validatedCouponId = couponRow.id;
    } catch (e) {
      return {
        ok: false,
        error:
          e instanceof Error ? e.message : "Coupon could not be applied.",
      };
    }
  }

  // ── Step 4: Compute shipping ─────────────────────────────────────────────

  let shippingCost: number;
  if (typeof shippingOverride === "number") {
    shippingCost = shippingOverride;
  } else {
    try {
      const shippingResult = await getShippingRate(
        customer.state,
        subtotal - discountAmount,
      );
      shippingCost = shippingResult.cost;
    } catch {
      shippingCost = 0;
    }
  }

  // ── Step 5: Compute totals ───────────────────────────────────────────────

  const total = subtotal - discountAmount + shippingCost;

  // ── Step 6: Generate IDs ─────────────────────────────────────────────────

  const orderId = randomUUID();
  const orderNumber = formatOrderNumber(orderId);

  // Sentinel email when admin doesn't supply one
  const customerEmail =
    customer.email && customer.email.trim().length > 0
      ? customer.email.trim()
      : `manual+${orderId}${SENTINEL_EMAIL_DOMAIN}`;

  // ── Steps 7–9: Transaction — insert orders + order_items + redeem coupon ─

  try {
    await db.transaction(async (tx) => {
      // Resolve (find-or-create) a customer user row so the order is attributed
      // to the real customer, not the admin (REQ-1, REQ-4).
      const customerUserId = await resolvePosCustomerId(tx, {
        customerEmail,
        name: customer.name,
        phone: customer.phone,
        adminUserId: session.user.id,
      });

      // Insert orders row — D-21: paymentMethod is null
      await tx.insert(orders).values({
        id: orderId,
        userId: customerUserId,
        status: "pending",
        paymentMethod: null,
        subtotal: subtotal.toFixed(2),
        shippingCost: shippingCost.toFixed(2),
        totalAmount: total.toFixed(2),
        currency: "MYR",
        customerEmail,
        shippingName: customer.name,
        shippingPhone: customer.phone,
        shippingLine1: customer.addressLine1,
        shippingLine2: customer.addressLine2 ?? null,
        shippingCity: customer.city,
        shippingState: customer.state,
        shippingPostcode: customer.postcode,
        shippingCountry: customer.country ?? "Malaysia",
        shippingServiceCode: shippingCourier?.serviceCode ?? null,
        shippingServiceName: shippingCourier?.serviceName ?? null,
        shippingQuotedPrice: shippingCourier ? shippingCost.toFixed(2) : null,
        sourceType: "manual",
        // customItem* columns stay null for new POS orders (D-06 / REQ-20-2)
        customItemName: null,
        customItemDescription: null,
        customImages: null,
      });

      // Insert one order_items row per POS line
      for (const line of resolvedLines) {
        const lineTotal = (line.unitPrice * line.quantity).toFixed(2);
        await tx.insert(orderItems).values({
          id: randomUUID(),
          orderId,
          productId: line.productId,
          variantId: line.variantId,
          productName: line.productName,
          productSlug: line.productSlug ?? "",
          productImage: line.productImage ?? null,
          variantLabel: line.variantLabel ?? null,
          unitPrice: line.unitPrice.toFixed(2),
          quantity: line.quantity,
          lineTotal,
          configurationData: line.configurationData ?? null,
        });
      }

      // Step 9: Atomic coupon redemption (inside tx so it rolls back with order).
      // Attribute to customerUserId (not session.user.id) so per-customer coupon
      // usage limits track the customer, not the admin (locked decision).
      if (validatedCouponId) {
        const redemption = await redeemCoupon(
          validatedCouponId,
          orderId,
          customerUserId,
          subtotal,
        );
        if (!redemption.ok) {
          throw new Error(redemption.error ?? "Coupon already exhausted.");
        }
      }
    });
  } catch (err) {
    console.error("[admin-pos] createPosOrder transaction failed:", err);
    const msg =
      err instanceof Error ? err.message : "Could not save the order. Please retry.";
    return { ok: false, error: msg };
  }

  revalidatePath("/admin/orders");
  revalidatePath("/admin/pos");
  return { ok: true, orderId, orderNumber };
}

// ============================================================================
// Task 0b: getPosCustomerSearch — returning-customer lookup for the customer step
// ============================================================================

export type PosCustomerResult = {
  userId: string;
  name: string;
  email: string;
  orderCount: number;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postcode?: string;
};

/**
 * Search customers (non-admin users) by name, email, or phone for the POS
 * customer step. Returns up to 15 results with autofill data from their most
 * recent order.
 *
 * No LATERAL joins (MariaDB 10.11) — fetches matching users/phone-derived ids,
 * then fetches all their orders ordered by createdAt desc, and picks the most
 * recent per user in memory to populate address fields.
 *
 * Phone matching resolves via orders.shippingPhone (user table has no phone
 * column). The phone-candidate query always runs regardless of the name/email
 * match count so that phone-only walk-in searches are never short-circuited.
 */
export async function getPosCustomerSearch(
  query: string,
): Promise<PosCustomerResult[]> {
  await requireAdmin();

  const trimmed = (query ?? "").trim();
  if (!trimmed) return [];

  // ── Candidate source 1: name/email user match ────────────────────────────
  // Search non-admin users by name OR email (LIKE, case-insensitive on MariaDB utf8mb4_general_ci)
  const nameEmailRows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
    })
    .from(user)
    .where(
      and(
        ne(user.role, "admin"),
        or(
          like(user.name, `%${trimmed}%`),
          like(user.email, `%${trimmed}%`),
        ),
      ),
    )
    .limit(15);

  // ── Candidate source 2: phone match via prior orders ─────────────────────
  // `user` has no phone column — resolve phone matches via orders.shippingPhone.
  // This query ALWAYS runs (not gated on nameEmailRows.length) so that a
  // phone-only search (no name/email user match) is never short-circuited.
  // No LATERAL — plain WHERE + DISTINCT, group in memory.
  const phoneOrderRows = await db
    .select({ userId: orders.userId })
    .from(orders)
    .where(like(orders.shippingPhone, `%${trimmed}%`));

  // Collect phone-derived userIds (unique, exclude duplicates).
  // Filter out null userIds (guest orders have no account to look up).
  const phoneUserIdSet = new Set<string>(
    phoneOrderRows.map((r) => r.userId).filter((id): id is string => id !== null),
  );

  // ── Build union of candidate ids ─────────────────────────────────────────
  const nameEmailIdSet = new Set<string>(nameEmailRows.map((r) => r.id));
  // Phone-only ids: ids found via phone that aren't already in the name/email set
  const phoneOnlyIds = [...phoneUserIdSet].filter((id) => !nameEmailIdSet.has(id));

  // Fetch full user rows for phone-only ids, excluding admin
  let phoneOnlyRows: Array<{ id: string; name: string; email: string }> = [];
  if (phoneOnlyIds.length > 0) {
    phoneOnlyRows = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(
        and(
          ne(user.role, "admin"),
          inArray(user.id, phoneOnlyIds),
        ),
      );
  }

  // Union: name/email matches first (more specific), then phone-only matches
  const allUserRows = [...nameEmailRows, ...phoneOnlyRows].slice(0, 15);

  // If both candidate sources produced nothing, bail
  if (allUserRows.length === 0) return [];

  const userIds = allUserRows.map((u) => u.id);

  // ── Fetch orders for matched users ────────────────────────────────────────
  // No LATERAL — fetch all then group in memory.
  const orderRows = await db
    .select({
      userId: orders.userId,
      shippingName: orders.shippingName,
      shippingPhone: orders.shippingPhone,
      shippingLine1: orders.shippingLine1,
      shippingLine2: orders.shippingLine2,
      shippingCity: orders.shippingCity,
      shippingState: orders.shippingState,
      shippingPostcode: orders.shippingPostcode,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(inArray(orders.userId, userIds))
    .orderBy(desc(orders.createdAt));

  // Group orders in memory — pick most recent per user + count.
  // orderRows are filtered by inArray(orders.userId, userIds) so userId is
  // always non-null here; cast is safe.
  const latestOrder = new Map<string, typeof orderRows[number]>();
  const orderCount = new Map<string, number>();

  for (const row of orderRows) {
    const uid = row.userId as string; // non-null: WHERE userId IN (userIds)
    orderCount.set(uid, (orderCount.get(uid) ?? 0) + 1);
    if (!latestOrder.has(uid)) {
      latestOrder.set(uid, row); // Already sorted desc, so first seen = most recent
    }
  }

  return allUserRows.map((u) => {
    const latest = latestOrder.get(u.id);
    return {
      userId: u.id,
      name: u.name,
      email: u.email,
      orderCount: orderCount.get(u.id) ?? 0,
      phone: latest?.shippingPhone ?? undefined,
      addressLine1: latest?.shippingLine1 ?? undefined,
      addressLine2: latest?.shippingLine2 ?? undefined,
      city: latest?.shippingCity ?? undefined,
      state: latest?.shippingState ?? undefined,
      postcode: latest?.shippingPostcode ?? undefined,
    };
  });
}

// ============================================================================
// Task 3.5: getDraftLinkTemplate (thin read for send-draft modal)
// ============================================================================

/**
 * Return the draft_link_template from store_settings.
 * Thin wrapper so the client-side PosSendDraftModal can call it without
 * importing server-only store-settings.ts directly.
 */
export async function getDraftLinkTemplate(): Promise<string | null> {
  const session = await requireAdmin();
  void session;

  const { getStoreSettingsCached } = await import("@/lib/store-settings");
  const settings = await getStoreSettingsCached();
  return settings.draftLinkTemplate ?? null;
}

// ============================================================================
// Task 3: setOrderAwaitingCustomer (W-1 patch)
// ============================================================================

/**
 * Transition an order from pending → awaiting_customer.
 * Called by Plan 20-09 Task 4 (send-draft modal) after generatePaymentLink returns ok.
 * D-23: does NOT touch paymentLinks.usedAt — that is set only in confirmPaymentProof (20-07).
 */
export async function setOrderAwaitingCustomer(
  orderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAdmin();
  void session;

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    columns: { id: true, status: true },
  });

  if (!order) {
    return { ok: false, error: "Order not found." };
  }

  try {
    assertValidTransition(order.status, "awaiting_customer");
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Invalid status transition.",
    };
  }

  await db
    .update(orders)
    .set({ status: "awaiting_customer" })
    .where(eq(orders.id, orderId));

  revalidatePath("/admin/orders/" + orderId);
  revalidatePath("/admin/orders");
  return { ok: true };
}
