import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { formatOrderNumber, type OrderStatus } from "@/lib/orders";
import { formatMYR } from "@/lib/format";
import { AdminOrderStatusBadge } from "./admin-order-status-badge";

type AdminOrderRowData = {
  id: string;
  status: OrderStatus;
  totalAmount: string;
  createdAt: Date;
  customerEmail: string;
  shippingName: string;
  /** Shown under the customer name (replaces email — admin request 2026-06-13). */
  shippingPhone: string;
  user: { email: string; name: string } | null;
  itemCount: number;
  /** Phase 20 (20-10) — 24×24 slip thumbnail shown when row is in awaiting_payment_review filter. */
  slipThumbnailUrl?: string | null;
};

/**
 * Single <tr> for /admin/orders. Presentational — all data arrives in props.
 * Uses the customer email/name snapshot fields on the orders row when the
 * user FK has been nullified or the buyer was deleted (PDPA, D3-23).
 *
 * Phase 20 (20-10): When slipThumbnailUrl is provided, renders a 24×24 slip
 * thumbnail at the left edge of the Order # cell (UI-SPEC §Surface 4 row enhancement).
 */
export function AdminOrderRow({ order }: { order: AdminOrderRowData }) {
  return (
    <tr className="border-t border-black/10">
      <td className="p-3 font-mono text-xs">
        <div className="flex items-center gap-2">
          {order.slipThumbnailUrl && (
            <Link href={`/admin/orders/${order.id}`} tabIndex={-1} aria-hidden>
              <Image
                src={order.slipThumbnailUrl}
                alt="Payment slip"
                width={24}
                height={24}
                className="rounded object-cover shrink-0"
                style={{ width: 24, height: 24 }}
              />
            </Link>
          )}
          <Link
            href={`/admin/orders/${order.id}`}
            className="underline decoration-dotted"
            style={{ color: BRAND.ink }}
          >
            {formatOrderNumber(order.id)}
          </Link>
        </div>
      </td>
      <td className="p-3">
        <p className="font-semibold truncate max-w-[200px]">{order.shippingName}</p>
        <p className="text-xs text-slate-600 truncate max-w-[200px]">
          {order.shippingPhone}
        </p>
      </td>
      <td className="p-3 text-sm whitespace-nowrap">
        {new Date(order.createdAt).toLocaleDateString("en-MY")}
      </td>
      <td className="p-3 text-sm whitespace-nowrap">{order.itemCount}</td>
      <td className="p-3 whitespace-nowrap font-bold">{formatMYR(order.totalAmount)}</td>
      <td className="p-3">
        <AdminOrderStatusBadge status={order.status} />
      </td>
      <td className="p-3">
        <Link
          href={`/admin/orders/${order.id}`}
          className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold min-h-[40px] whitespace-nowrap"
          style={{ backgroundColor: BRAND.ink, color: "#ffffff" }}
        >
          View
        </Link>
      </td>
    </tr>
  );
}

/**
 * Mobile card (≤md) for /admin/orders — same props as AdminOrderRow.
 * Renders every field and the View action at a 44px tap target.
 */
export function AdminOrderCard({ order }: { order: AdminOrderRowData }) {
  return (
    <Link
      href={`/admin/orders/${order.id}`}
      className="block p-3 space-y-1"
      style={{ color: BRAND.ink }}
    >
      {/* Order # + status on one row */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {order.slipThumbnailUrl && (
            <Image
              src={order.slipThumbnailUrl}
              alt="Payment slip"
              width={24}
              height={24}
              className="rounded object-cover shrink-0"
              style={{ width: 24, height: 24 }}
            />
          )}
          <span className="font-mono text-xs font-semibold truncate">
            {formatOrderNumber(order.id)}
          </span>
        </div>
        <AdminOrderStatusBadge status={order.status} />
      </div>

      {/* Customer name + phone */}
      <p className="font-semibold text-sm break-words min-w-0">{order.shippingName}</p>
      <p className="text-xs text-slate-600 break-words min-w-0">{order.shippingPhone}</p>

      {/* Date · items · total */}
      <p className="text-xs text-slate-600">
        {new Date(order.createdAt).toLocaleDateString("en-MY")}
        {" · "}
        {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
        {" · "}
        <span className="font-bold" style={{ color: BRAND.ink }}>
          {formatMYR(order.totalAmount)}
        </span>
      </p>

      {/* View button */}
      <div className="pt-1">
        <span
          className="inline-flex items-center justify-center rounded-full px-4 text-sm font-semibold min-h-[44px] w-full"
          style={{ backgroundColor: BRAND.ink, color: "#ffffff" }}
        >
          View order
        </span>
      </div>
    </Link>
  );
}
