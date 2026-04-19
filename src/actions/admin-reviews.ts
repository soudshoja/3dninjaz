"use server";

import { db } from "@/lib/db";
import { reviews, products, user } from "@/lib/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { reviewModerationSchema } from "@/lib/validators";

// ============================================================================
// Plan 05-07 admin reviews moderation actions.
//
// IMPORTANT (T-05-07-EoP):
// Every exported function calls `await requireAdmin()` as the FIRST await.
//
// IMPORTANT (T-05-07-XSS):
// Review.body is rendered as a React text node — never as raw HTML. The
// admin queue components do not use any unsafe-HTML rendering escape hatch.
// ============================================================================

export type AdminReviewRow = {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  userId: string;
  userName: string;
  userEmail: string;
  rating: number;
  body: string;
  status: "pending" | "approved" | "hidden";
  createdAt: Date;
};

export type ReviewStatusFilter = "pending" | "approved" | "hidden" | "all";

/**
 * List reviews for the moderation queue. Default filter is "pending" so the
 * queue greets the admin with the work that needs doing.
 *
 * Joins products + user via leftJoin (manual hydration — no LATERAL on
 * MariaDB 10.11) so the admin can see the product name and reviewer email.
 */
export async function listAdminReviews(
  filter: ReviewStatusFilter = "pending",
): Promise<AdminReviewRow[]> {
  await requireAdmin();

  const baseQuery = db
    .select({
      id: reviews.id,
      productId: reviews.productId,
      userId: reviews.userId,
      rating: reviews.rating,
      body: reviews.body,
      status: reviews.status,
      createdAt: reviews.createdAt,
      productName: products.name,
      productSlug: products.slug,
      userName: user.name,
      userEmail: user.email,
    })
    .from(reviews)
    .leftJoin(products, eq(reviews.productId, products.id))
    .leftJoin(user, eq(reviews.userId, user.id));

  const rows =
    filter !== "all"
      ? await baseQuery
          .where(eq(reviews.status, filter))
          .orderBy(desc(reviews.createdAt))
      : await baseQuery.orderBy(desc(reviews.createdAt));

  return rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    productName: r.productName ?? "[deleted product]",
    productSlug: r.productSlug ?? "",
    userId: r.userId,
    userName: r.userName ?? "[deleted user]",
    userEmail: r.userEmail ?? "",
    rating: r.rating,
    body: r.body ?? "",
    status: r.status,
    createdAt: r.createdAt,
  }));
}

type ModerateResult = { ok: true } | { ok: false; error: string };

/**
 * Move a review between pending/approved/hidden. mysqlEnum + Zod enum gate
 * the value; invalid statuses are rejected without DB access.
 */
export async function moderateReview(
  formData: FormData,
): Promise<ModerateResult> {
  await requireAdmin();

  const parsed = reviewModerationSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  await db
    .update(reviews)
    .set({ status: parsed.data.status })
    .where(eq(reviews.id, parsed.data.id));

  revalidatePath("/admin/reviews");
  return { ok: true };
}

/**
 * Hard-delete a review. Intentional admin capability (T-05-07-hard-delete);
 * audit log not in v1.
 */
export async function deleteReview(id: string): Promise<ModerateResult> {
  await requireAdmin();
  if (typeof id !== "string" || id.length === 0) {
    return { ok: false, error: "Invalid review ID" };
  }
  await db.delete(reviews).where(eq(reviews.id, id));
  revalidatePath("/admin/reviews");
  return { ok: true };
}

/**
 * Count of pending reviews — used by the admin layout badge. Wrapped in its
 * own export so the layout can prop-drill it into <SidebarNav>.
 *
 * NOTE: This DOES call requireAdmin() so a non-admin caller cannot abuse it
 * to fingerprint pending counts via the API surface. The layout already
 * gated entry, so this is belt-and-braces.
 */
export async function getPendingReviewCount(): Promise<number> {
  await requireAdmin();
  const [row] = await db
    .select({ c: count() })
    .from(reviews)
    .where(eq(reviews.status, "pending"));
  return Number(row?.c ?? 0);
}
