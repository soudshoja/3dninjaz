import { BRAND } from "@/lib/brand";
import type { OrderStatus } from "@/lib/orders";

/**
 * Status badge with palette-aware colours (Phase 2 D-01 unified palette).
 *
 *   pending    -> purple (awaiting payment)
 *   paid       -> blue   (payment captured)
 *   processing -> blue   (admin acknowledged, printing)
 *   shipped    -> green  (on the way)
 *   delivered  -> green  (terminal success)
 *   cancelled  -> ink    (terminal, neutral)
 *
 * `${hex}22` / `30` / `55` etc. are 8-digit hex RGBA — the last 2 hex digits
 * set the alpha. 0x22 ≈ 13% opacity (tint background), 0x55 ≈ 33%. The foreground
 * uses the fully opaque brand colour so contrast stays WCAG-compliant.
 */

const PALETTE: Record<OrderStatus, { bg: string; fg: string; label: string }> = {
  pending: { bg: `${BRAND.purple}22`, fg: BRAND.purple, label: "Pending" },
  paid: { bg: `${BRAND.blue}22`, fg: BRAND.blue, label: "Paid" },
  processing: { bg: `${BRAND.blue}22`, fg: BRAND.blue, label: "Processing" },
  shipped: { bg: `${BRAND.green}30`, fg: BRAND.ink, label: "Shipped" },
  delivered: { bg: `${BRAND.green}55`, fg: BRAND.ink, label: "Delivered" },
  cancelled: { bg: `${BRAND.ink}22`, fg: BRAND.ink, label: "Cancelled" },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const p = PALETTE[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider"
      style={{ backgroundColor: p.bg, color: p.fg }}
      aria-label={`Status: ${p.label}`}
    >
      {p.label}
    </span>
  );
}
