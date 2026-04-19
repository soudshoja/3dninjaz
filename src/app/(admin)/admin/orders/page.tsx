import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-helpers";
import { listAdminOrders } from "@/actions/admin-orders";
import { BRAND } from "@/lib/brand";
import { AdminOrderRow } from "@/components/admin/admin-order-row";
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
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const { status } = await searchParams;
  const filter = (VALID.includes(status as StatusFilter) ? status : "all") as StatusFilter;
  const rows = await listAdminOrders(filter);

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
          <AdminOrderFilter />
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
          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#ffffff" }}
          >
            {/*
              Horizontal scroll lives INSIDE the card (D3-20). The page itself
              must never scroll sideways at 320 / 375 / 390 / 768 / 1024 / 1440.
            */}
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-sm">
                <thead>
                  <tr
                    className="text-left"
                    style={{ backgroundColor: `${BRAND.ink}0d` }}
                  >
                    <th className="p-3">Order #</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Items</th>
                    <th className="p-3">Total</th>
                    <th className="p-3">Status</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <AdminOrderRow key={o.id} order={o} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
