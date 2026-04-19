import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { formatOrderNumber, type OrderStatus } from "@/lib/orders";
import { OrderStatusBadge } from "./order-status-badge";
import { formatMYR } from "@/lib/format";

/**
 * List-view card for /orders. Shows order number, status, date, item count,
 * total, and a lead-image thumbnail (first item's snapshotted image).
 *
 * Tap target is the entire card (48px+ minimum height from padding). Hover
 * lift mirrors the product card affordance from Phase 2.
 */

type OrderListItem = {
  id: string;
  status: OrderStatus;
  totalAmount: string;
  currency: string;
  createdAt: Date;
  items: Array<{
    quantity: number;
    productImage: string | null;
    productName: string;
  }>;
};

export function OrderCard({ order }: { order: OrderListItem }) {
  const itemCount = order.items.reduce((n, i) => n + i.quantity, 0);
  const firstImage = order.items.find((i) => i.productImage)?.productImage ?? null;

  return (
    <Link
      href={`/orders/${order.id}`}
      className="block rounded-2xl p-4 md:p-5 transition hover:-translate-y-1 hover:shadow-lg min-h-[96px]"
      style={{ backgroundColor: "#ffffff" }}
    >
      <div className="flex items-start gap-4">
        <div
          className="h-16 w-16 md:h-20 md:w-20 rounded-xl overflow-hidden shrink-0"
          style={{ backgroundColor: `${BRAND.blue}15` }}
        >
          {firstImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- snapshot path may
            // be a removed product; Next Image would throw on 404 where <img> is tolerant
            <img
              src={firstImage}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-[var(--font-heading)] text-lg truncate">
              {formatOrderNumber(order.id)}
            </p>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {new Date(order.createdAt).toLocaleDateString("en-MY")}
            {" · "}
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </p>
        </div>
        <div className="text-right">
          <p className="font-[var(--font-heading)] text-xl">
            {formatMYR(order.totalAmount)}
          </p>
          <p className="text-xs text-slate-500">{order.currency}</p>
        </div>
      </div>
    </Link>
  );
}
