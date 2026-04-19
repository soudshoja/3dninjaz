"use server";

/**
 * Customer-facing reviews actions (Plan 06-05, CUST-05).
 *
 * Buyer-only review submission via an EXISTS (INNER JOIN) subquery against
 * order_items + orders. Admin moderation queue is owned by Phase 5 05-07.
 *
 * THREAT MODEL:
 *  - T-06-05-auth: requireUser() FIRST await on every mutation
 *  - T-06-05-buyer: server-side subquery is authoritative; the client UI
 *    that hides the CTA is a convenience layer only.
 *  - T-06-05-cancelled-bypass: QUALIFYING_ORDER_STATUSES explicitly excludes
 *    pending + cancelled.
 *  - T-06-05-integrity: pre-check + UNIQUE(user_id, product_id) ER_DUP_ENTRY
 *    catch — double-submit race lands as "already reviewed".
 *  - T-06-05-PDPA: reviewer name shows "Former customer" when user.deletedAt
 *    is set, honouring closure without destroying the review.
 *  - T-06-05-admin-gate: action does NOT special-case admin role; admin must
 *    have bought to author a review (separates authorship from moderation).
 *  - T-06-05-pending-leak: listProductReviews WHERE status='approved' only —
 *    pending/hidden never queryable from the storefront helper.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  orderItems,
  orders,
  reviews,
  user as userTable,
} from "@/lib/db/schema";
import { reviewSubmitSchema } from "@/lib/validators";
import { getSessionUser, requireUser } from "@/lib/auth-helpers";

// Statuses that prove the user actually received (or is receiving) the product.
const QUALIFYING_ORDER_STATUSES = [
  "paid",
  "processing",
  "shipped",
  "delivered",
] as const;

export async function hasUserReviewedProduct(
  productId: string,
): Promise<boolean> {
  const session = await getSessionUser();
  if (!session) return false;
  const [row] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(
      and(eq(reviews.userId, session.id), eq(reviews.productId, productId)),
    )
    .limit(1);
  return !!row;
}

/**
 * Batch helper — single inArray query returning the productIds the current
 * user has already reviewed. Used on /orders/[id] to suppress the per-item
 * Review CTA without an N+1 round-trip.
 */
export async function getReviewedProductIds(
  productIds: string[],
): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();
  const session = await getSessionUser();
  if (!session) return new Set();
  const rows = await db
    .select({ productId: reviews.productId })
    .from(reviews)
    .where(
      and(
        eq(reviews.userId, session.id),
        inArray(reviews.productId, productIds),
      ),
    );
  return new Set(rows.map((r) => r.productId));
}

export async function submitReview(input: unknown) {
  const session = await requireUser();
  const parsed = reviewSubmitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }

  // Buyer-gate: EXISTS (SELECT 1 FROM order_items oi JOIN orders o
  //   WHERE o.user_id = ? AND oi.product_id = ? AND o.status IN (...))
  // The enum-array passed to inArray must be a fresh non-readonly array of
  // the enum-literal type; spread to satisfy Drizzle's MySqlEnumColumn
  // overload (which rejects readonly arrays).
  const qualifying = [...QUALIFYING_ORDER_STATUSES];
  const [buyerRow] = await db
    .select({ n: sql<number>`1` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.userId, session.user.id),
        eq(orderItems.productId, parsed.data.productId),
        inArray(orders.status, qualifying),
      ),
    )
    .limit(1);
  if (!buyerRow) {
    return {
      ok: false as const,
      error: "Only buyers can review this product.",
    };
  }

  // Pre-check on (user_id, product_id) — friendly error before we even try
  // the insert. UNIQUE constraint at DB layer catches the rare race.
  const [existing] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(
      and(
        eq(reviews.userId, session.user.id),
        eq(reviews.productId, parsed.data.productId),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      ok: false as const,
      error: "You have already reviewed this product.",
    };
  }

  try {
    await db.insert(reviews).values({
      id: randomUUID(),
      userId: session.user.id,
      productId: parsed.data.productId,
      rating: parsed.data.rating,
      body: parsed.data.body,
      status: "pending",
    });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "ER_DUP_ENTRY"
    ) {
      return {
        ok: false as const,
        error: "You have already reviewed this product.",
      };
    }
    console.error("[submitReview] insert failed", err);
    return { ok: false as const, error: "Could not submit review." };
  }

  revalidatePath(`/orders`);
  // Approved reviews appear on the PDP, but pending ones don't —
  // no PDP revalidation needed at submit time. Phase 5 admin approve
  // handler is responsible for revalidating /products/[slug] on approval.
  return {
    ok: true as const,
    message: "Review submitted. It will appear after moderation.",
  };
}

export type ApprovedReview = {
  id: string;
  rating: number;
  body: string;
  createdAt: Date;
  reviewerName: string;
};

export type ProductReviewsSummary = {
  reviews: ApprovedReview[];
  avgRating: number;
  totalApproved: number;
};

export async function listProductReviews(
  productId: string,
  opts: { limit?: number } = {},
): Promise<ProductReviewsSummary> {
  const limit = Math.min(opts.limit ?? 10, 50);

  // Approved reviews list (latest first, capped).
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      body: reviews.body,
      createdAt: reviews.createdAt,
      userId: reviews.userId,
    })
    .from(reviews)
    .where(
      and(eq(reviews.productId, productId), eq(reviews.status, "approved")),
    )
    .orderBy(desc(reviews.createdAt))
    .limit(limit);

  // Summary (avg, count) is a separate query so the badge in the PDP header
  // can render without paying for the full list when only stats are needed.
  const [summary] = await db
    .select({
      avg: sql<string | null>`AVG(${reviews.rating})`,
      cnt: sql<number>`COUNT(*)`,
    })
    .from(reviews)
    .where(
      and(eq(reviews.productId, productId), eq(reviews.status, "approved")),
    );

  if (rows.length === 0) {
    return { reviews: [], avgRating: 0, totalApproved: 0 };
  }

  // Hydrate reviewer names via single inArray query (MariaDB no-LATERAL).
  const userIds = Array.from(new Set(rows.map((r) => r.userId)));
  const userRows = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      deletedAt: userTable.deletedAt,
    })
    .from(userTable)
    .where(inArray(userTable.id, userIds));
  const nameById = new Map(
    userRows.map((u) => [u.id, u.deletedAt ? "Former customer" : u.name]),
  );

  return {
    reviews: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      createdAt: r.createdAt,
      reviewerName: nameById.get(r.userId) ?? "Former customer",
    })),
    avgRating: summary?.avg ? Number(summary.avg) : 0,
    totalApproved: Number(summary?.cnt ?? 0),
  };
}
