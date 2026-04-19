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
  user: { email: string; name: string } | null;
  itemCount: number;
};

/**
 * Single <tr> for /admin/orders. Presentational — all data arrives in props.
 * Uses the customer email/name snapshot fields on the orders row when the
 * user FK has been nullified or the buyer was deleted (PDPA, D3-23).
 */
export function AdminOrderRow({ order }: { order: AdminOrderRowData }) {
  return (
    <tr className="border-t border-black/10">
      <td className="p-3 font-mono text-xs">
        <Link
          href={`/admin/orders/${order.id}`}
          className="underline decoration-dotted"
          style={{ color: BRAND.ink }}
        >
          {formatOrderNumber(order.id)}
        </Link>
      </td>
      <td className="p-3">
        <p className="font-semibold truncate max-w-[200px]">{order.shippingName}</p>
        <p className="text-xs text-slate-600 truncate max-w-[200px]">
          {order.user?.email ?? order.customerEmail}
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
