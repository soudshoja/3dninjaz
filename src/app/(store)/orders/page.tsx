import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth-helpers";
import { listMyOrders } from "@/actions/orders";
import { OrderCard } from "@/components/orders/order-card";
import { BRAND } from "@/lib/brand";

/**
 * /orders — customer order history (ORD-01, D3-16).
 *
 * Server component:
 *  - Auth gate: unauthenticated -> /login?next=/orders (D3-03 parity).
 *  - force-dynamic because we read the session cookie; cached HTML would
 *    leak one user's history to another.
 *  - Renders every order belonging to the signed-in user (all statuses,
 *    including abandoned pending orders so users can retry payment).
 */

export const dynamic = "force-dynamic";

export default async function OrdersIndexPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/orders");

  const rows = (await listMyOrders()) ?? [];

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-14">
        <header className="mb-6 md:mb-10">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-5xl">
            Your orders
          </h1>
          <p className="mt-2 text-slate-700">
            Every drop you&apos;ve locked in.
          </p>
        </header>

        {rows.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: "#ffffff" }}
          >
            <p className="text-lg font-bold mb-2">No orders yet.</p>
            <p className="text-slate-600 mb-6">
              Pick out something stealthy from the shop.
            </p>
            <Link
              href="/shop"
              className="inline-flex items-center rounded-full px-6 py-3 font-bold text-white min-h-[48px]"
              style={{ backgroundColor: BRAND.ink }}
            >
              Browse drops
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {rows.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
