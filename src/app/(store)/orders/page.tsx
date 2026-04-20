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
      className="min-h-screen bg-white"
      style={{ color: BRAND.ink }}
    >
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-14">
        <header className="mb-6 md:mb-10">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-5xl text-zinc-900">
            Your orders
          </h1>
          <p className="mt-2 text-zinc-600">
            Every drop you&apos;ve locked in.
          </p>
        </header>

        {rows.length === 0 ? (
          <div className="rounded-2xl p-8 text-center bg-white border border-zinc-200 shadow-sm">
            <p className="text-lg font-bold mb-2 text-zinc-900">No orders yet.</p>
            <p className="text-zinc-600 mb-6">
              Pick out something stealthy from the shop.
            </p>
            <Link
              href="/shop"
              className="inline-flex items-center rounded-full px-6 py-3 font-bold min-h-[48px] shadow-[0_4px_0_rgba(11,16,32,0.15)]"
              style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
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
