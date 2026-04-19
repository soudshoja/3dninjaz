import { BRAND } from "@/lib/brand";
import type { OrderStatus } from "@/lib/orders";

/**
 * Admin-facing status badge. Duplicated inside `src/components/admin/` (rather
 * than imported from a shared `src/components/orders/*`) so this plan does not
 * step on files owned by the parallel customer-side plan 03-03. Visual tokens
 * come from the unified 5-color palette (D3-02 / Phase 2 D-01):
 *
 *   pending     → purple  (waiting on the buyer)
 *   paid        → blue    (money captured, not yet processed)
 *   processing  → blue    (in the print/pick queue)
 *   shipped     → green   (out for delivery)
 *   delivered   → green   (done)
 *   cancelled   → ink     (terminal, neutral)
 */

const STATUS_THEME: Record<OrderStatus, { bg: string; fg: string; label: string }> = {
  pending:    { bg: `${BRAND.purple}22`, fg: BRAND.purple, label: "Pending" },
  paid:       { bg: `${BRAND.blue}22`,   fg: BRAND.blue,   label: "Paid" },
  processing: { bg: `${BRAND.blue}22`,   fg: BRAND.blue,   label: "Processing" },
  shipped:    { bg: `${BRAND.green}22`,  fg: BRAND.green,  label: "Shipped" },
  delivered:  { bg: `${BRAND.green}22`,  fg: BRAND.green,  label: "Delivered" },
  cancelled:  { bg: `${BRAND.ink}18`,    fg: BRAND.ink,    label: "Cancelled" },
};

export function AdminOrderStatusBadge({ status }: { status: OrderStatus }) {
  const theme = STATUS_THEME[status] ?? STATUS_THEME.pending;
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide whitespace-nowrap"
      style={{ backgroundColor: theme.bg, color: theme.fg }}
      aria-label={`Order status: ${theme.label}`}
    >
      {theme.label}
    </span>
  );
}
