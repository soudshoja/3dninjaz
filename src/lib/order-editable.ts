/**
 * Order editability guard — pure, no I/O.
 *
 * An order is EDITABLE when:
 *   - status is one of: pending | awaiting_customer | awaiting_payment_review
 *   - AND paypalCaptureId is null/empty (no payment has been captured)
 *
 * An order is LOCKED when:
 *   - paypalCaptureId is a non-empty string, OR
 *   - status is one of: paid | processing | shipped | delivered | cancelled
 *
 * Used by:
 *   - src/actions/admin-order-edit.ts (assertEditable before every mutation)
 *   - src/app/(admin)/admin/orders/[id]/page.tsx (gate edit UI rendering)
 */

export const LOCKED_STATUSES = [
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export type LockedStatus = (typeof LOCKED_STATUSES)[number];

export function isOrderEditable(o: {
  status: string;
  paypalCaptureId: string | null | undefined;
}): boolean {
  if (o.paypalCaptureId && o.paypalCaptureId.trim().length > 0) return false;
  if ((LOCKED_STATUSES as readonly string[]).includes(o.status)) return false;
  return true;
}

export function assertEditable(o: {
  status: string;
  paypalCaptureId: string | null | undefined;
}): void {
  if (!isOrderEditable(o)) {
    throw new Error(
      "Order is locked — it has been paid and can no longer be edited.",
    );
  }
}

/**
 * Adding items is allowed more broadly than full editing: a customer can ask
 * for MORE items even after paying (2026-06-13). Adding to a paid order grows
 * totalAmount and creates a balance due. We only block adds once the parcel is
 * out the door or the order is dead.
 */
export const NO_ADD_STATUSES = ["shipped", "delivered", "cancelled"] as const;

export function canAddItems(o: { status: string }): boolean {
  return !(NO_ADD_STATUSES as readonly string[]).includes(o.status);
}

export function assertCanAddItems(o: { status: string }): void {
  if (!canAddItems(o)) {
    throw new Error(
      "Items can't be added — this order is already shipped, delivered or cancelled.",
    );
  }
}
