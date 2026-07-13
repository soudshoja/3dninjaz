import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-helpers";
import { listAdminOrders } from "@/actions/admin-orders";
import { getPaymentProofsAwaitingReviewCount } from "@/actions/admin-payment-proofs";
import { paymentProofs } from "@/lib/db/schema";
import { eq, inArray, desc } from "drizzle-orm";
import { BRAND } from "@/lib/brand";
import { AdminOrdersList } from "@/components/admin/admin-orders-list";
import { AdminOrderFilter } from "@/components/admin/admin-order-filter";
import type { OrderStatus } from "@/lib/orders";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Orders",
  robots: { index: false, follow: false },
};

type StatusFilter = "all" | OrderStatus;

const VALID: StatusFilter[] = [
  "all",
  "pending",
  "awaiting_customer",
  "awaiting_payment_review",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

/**
 * /admin/orders — list every order with a filter-chip row and a horizontally
 * scrollable table (D3-20: the page never scrolls sideways; the table scrolls
 * inside its card on narrow viewports).
 *
 * requireAdmin() is called here at the top even though (admin)/layout.tsx also
 * redirects unauthenticated users — belt-and-braces, CVE-2025-29927.
 *
 * Phase 20 (20-10):
 *   - Passes pendingProofCount to AdminOrderFilter for the amber badge.
 *   - When filter = awaiting_payment_review, hydrates the latest pending
 *     payment_proofs row per order (manual hydration — MariaDB has no LATERAL).
 *     Slip thumbnail shown at left edge of each row per UI-SPEC §Surface 4.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { db } = await requireAdmin();
  const { status } = await searchParams;
  const filter = (VALID.includes(status as StatusFilter) ? status : "all") as StatusFilter;
  const rows = await listAdminOrders(filter);

  // Count of awaiting_payment_review orders — drives filter chip badge + sidebar badge.
  const pendingProofCount = await getPaymentProofsAwaitingReviewCount();

  // When the awaiting_payment_review filter is active, hydrate the latest
  // pending slip thumbnail per order. Manual multi-query hydration (no LATERAL).
  const slipThumbnailByOrder = new Map<string, string | null>();
  if (filter === "awaiting_payment_review" && rows.length > 0) {
    const orderIds = rows.map((r) => r.id);
    const proofRows = await db
      .select({
        orderId: paymentProofs.orderId,
        thumbnailUrl: paymentProofs.thumbnailUrl,
        imageUrl: paymentProofs.imageUrl,
        createdAt: paymentProofs.createdAt,
      })
      .from(paymentProofs)
      .where(
        inArray(paymentProofs.orderId, orderIds),
      )
      .orderBy(desc(paymentProofs.createdAt));

    // Pick the latest proof per order (first match after ORDER BY DESC createdAt).
    for (const p of proofRows) {
      if (!slipThumbnailByOrder.has(p.orderId)) {
        // Prefer thumbnail; fall back to full imageUrl if thumbnail is null (PDFs).
        slipThumbnailByOrder.set(p.orderId, p.thumbnailUrl ?? p.imageUrl ?? null);
      }
    }
  }

  return (
    <main className="min-h-screen" style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-4">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">Orders</h1>
          <p className="mt-1 text-slate-600">
            {rows.length} {rows.length === 1 ? "order" : "orders"} · filter:{" "}
            <strong>{filter}</strong>
          </p>
        </header>

        <div className="mb-4">
          <AdminOrderFilter pendingProofCount={pendingProofCount} />
        </div>

        {rows.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: "#ffffff" }}
          >
            <p className="text-lg font-bold mb-2">No orders match this filter.</p>
            <p className="text-sm text-slate-600">
              Try another status or clear the filter.
            </p>
          </div>
        ) : (
          // Client island — multi-select + bulk delete (2026-06-13). Renders
          // the same desktop table + mobile cards as before; D3-20 horizontal
          // scroll stays inside the card.
          <AdminOrdersList
            rows={rows.map((o) => ({
              ...o,
              slipThumbnailUrl: slipThumbnailByOrder.get(o.id) ?? null,
            }))}
          />
        )}
      </div>
    </main>
  );
}
