import { checkoutDrafts } from "@/lib/db/schema";
import { and, eq, or } from "drizzle-orm";
import { normalizeMsisdn } from "@/lib/order-dedupe";
import { getTenantContext } from "@/lib/tenant/context";
import type { TenantDb } from "@/lib/tenant/pool-manager";

/**
 * Flip a customer's open checkout drafts to "converted" once a real order
 * exists. Matched by normalized phone OR userId. Lives in lib (NOT a "use
 * server" file) so it is never exposed as a public endpoint — only the order
 * creation actions call it. Best-effort: never throws.
 */
export async function markDraftsConverted({
  phone,
  userId,
}: {
  phone: string;
  userId: string | null;
}, db?: TenantDb): Promise<void> {
  try {
    db ??= (await getTenantContext()).db;
    const phoneNorm = normalizeMsisdn(phone);
    if (!phoneNorm && !userId) return;
    const match = userId
      ? or(eq(checkoutDrafts.phoneNorm, phoneNorm), eq(checkoutDrafts.userId, userId))
      : eq(checkoutDrafts.phoneNorm, phoneNorm);
    await db
      .update(checkoutDrafts)
      .set({ status: "converted" })
      .where(and(eq(checkoutDrafts.status, "open"), match));
  } catch (err) {
    console.error("[checkout-drafts] markDraftsConverted failed:", err);
  }
}
