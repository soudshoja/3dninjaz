"use server";

/**
 * Wishlist server actions (Plan 06-04, CUST-04).
 *
 * THREAT MODEL:
 *  - T-06-04-auth: requireUser() FIRST await on every mutation; getSessionUser
 *    on read-only paths used inside server components that have already
 *    auth-gated.
 *  - T-06-04-IDOR: ownership predicate on every WHERE clause.
 *  - T-06-04-integrity: UNIQUE(user_id, product_id) at the DB layer + ER_DUP_ENTRY
 *    catch in toggleWishlist treats the race as idempotent success.
 *  - T-06-04-deleted-product: listMyWishlist silently drops wishlist rows whose
 *    product is gone or inactive — no dangling links / 404s on /account/wishlist.
 *  - T-06-04-N+1: getWishlistedProductIds batches the per-card check into one
 *    inArray query for shop / featured-rail server components.
 */

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { products, productVariants, wishlists } from "@/lib/db/schema";
import { wishlistAddSchema } from "@/lib/validators";
import { getSessionUser, requireUser } from "@/lib/auth-helpers";

const WISHLIST_LIMIT = 50; // Q-06-08 resolution: 50 items per user max

function ensureImagesArray(raw: unknown): string[] {
  // MariaDB stores JSON as LONGTEXT; mysql2 returns raw strings.
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === "string");
  }
  if (typeof raw === "string") {
    if (raw.trim() === "") return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === "string");
      }
    } catch {
      return [];
    }
  }
  return [];
}

export async function isWishlisted(productId: string): Promise<boolean> {
  // Used inside server components on PDP / product card during render.
  const user = await getSessionUser();
  if (!user) return false;
  const [row] = await db
    .select({ id: wishlists.id })
    .from(wishlists)
    .where(
      and(eq(wishlists.userId, user.id), eq(wishlists.productId, productId)),
    )
    .limit(1);
  return !!row;
}

/**
 * Batch helper — accepts up to N product ids and returns the subset the
 * current user has wishlisted. Avoids the N+1 hit on shop / featured
 * grids that render many ProductCards.
 */
export async function getWishlistedProductIds(
  productIds: string[],
): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();
  const user = await getSessionUser();
  if (!user) return new Set();
  const rows = await db
    .select({ productId: wishlists.productId })
    .from(wishlists)
    .where(
      and(
        eq(wishlists.userId, user.id),
        inArray(wishlists.productId, productIds),
      ),
    );
  return new Set(rows.map((r) => r.productId));
}

export async function toggleWishlist(
  input: unknown,
): Promise<
  | { ok: true; state: "added" | "removed" }
  | { ok: false; error: string }
> {
  const session = await requireUser();
  const parsed = wishlistAddSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid product id." };
  }

  // Existence check first — if the row exists we DELETE (toggle off);
  // otherwise INSERT. UNIQUE(user_id, product_id) at the DB layer protects
  // against the concurrent-add race even if our pre-check is stale.
  const [existing] = await db
    .select({ id: wishlists.id })
    .from(wishlists)
    .where(
      and(
        eq(wishlists.userId, session.user.id),
        eq(wishlists.productId, parsed.data.productId),
      ),
    )
    .limit(1);

  if (existing) {
    await db.delete(wishlists).where(eq(wishlists.id, existing.id));
    revalidatePath("/account/wishlist");
    return { ok: true, state: "removed" };
  }

  // Cap check (Q-06-08) — 50 items per user. Counts cheap because of the
  // user_id index from 06-01.
  const allRows = await db
    .select({ id: wishlists.id })
    .from(wishlists)
    .where(eq(wishlists.userId, session.user.id));
  if (allRows.length >= WISHLIST_LIMIT) {
    return {
      ok: false,
      error: `Wishlist is full (${WISHLIST_LIMIT} items max). Remove one to save another.`,
    };
  }

  try {
    await db.insert(wishlists).values({
      id: randomUUID(),
      userId: session.user.id,
      productId: parsed.data.productId,
    });
  } catch (err) {
    // UNIQUE race — concurrent add. Treat as idempotent success.
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "ER_DUP_ENTRY"
    ) {
      return { ok: true, state: "added" };
    }
    console.error("[toggleWishlist] insert failed", err);
    return { ok: false, error: "Could not update wishlist." };
  }

  revalidatePath("/account/wishlist");
  return { ok: true, state: "added" };
}

export async function removeFromWishlist(productId: string) {
  const session = await requireUser();
  await db
    .delete(wishlists)
    .where(
      and(
        eq(wishlists.userId, session.user.id),
        eq(wishlists.productId, productId),
      ),
    );
  revalidatePath("/account/wishlist");
  return { ok: true as const };
}

export type WishlistedItem = {
  wishlistId: string;
  wishlistedAt: Date;
  product: {
    id: string;
    name: string;
    slug: string;
    description: string;
    images: string[];
    materialType: string | null;
    isActive: boolean;
  };
  variants: Array<{
    id: string;
    productId: string;
    size: "S" | "M" | "L";
    price: string;
    widthCm: string | null;
    heightCm: string | null;
    depthCm: string | null;
  }>;
};

export async function listMyWishlist(): Promise<WishlistedItem[]> {
  const session = await requireUser();

  // Manual hydration — MariaDB 10.11 rejects LATERAL joins (see catalog.ts).
  const rows = await db
    .select({
      id: wishlists.id,
      productId: wishlists.productId,
      createdAt: wishlists.createdAt,
    })
    .from(wishlists)
    .where(eq(wishlists.userId, session.user.id))
    .orderBy(desc(wishlists.createdAt));

  if (rows.length === 0) return [];

  const productIds = rows.map((r) => r.productId);

  // Hydrate active products only — silently drop wishlisted rows whose
  // product was deleted or deactivated (T-06-04-deleted-product).
  const productRows = await db
    .select()
    .from(products)
    .where(
      and(inArray(products.id, productIds), eq(products.isActive, true)),
    );

  const variants =
    productIds.length > 0
      ? await db
          .select()
          .from(productVariants)
          .where(inArray(productVariants.productId, productIds))
          .orderBy(asc(productVariants.size))
      : [];

  const productById = new Map(
    productRows.map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        images: ensureImagesArray(p.images),
        materialType: p.materialType,
        isActive: p.isActive,
      },
    ]),
  );

  const variantsByProduct = new Map<string, typeof variants>();
  for (const v of variants) {
    const arr = variantsByProduct.get(v.productId) ?? [];
    arr.push(v);
    variantsByProduct.set(v.productId, arr);
  }

  const out: WishlistedItem[] = [];
  for (const r of rows) {
    const product = productById.get(r.productId);
    if (!product) continue;
    out.push({
      wishlistId: r.id,
      wishlistedAt: r.createdAt,
      product,
      variants: variantsByProduct.get(r.productId) ?? [],
    });
  }
  return out;
}
