/**
 * Pure precondition for "Mark balance as paid" — no I/O.
 *
 * A balance only exists after a payment was recorded and the total then grew
 * (items added), so we require amountPaid > 0: an order with nothing recorded
 * is a normal unpaid order and must go through the regular mark-paid /
 * payment-proof flow instead. Cancelled orders are refused because setting
 * amountPaid would count them as sales in accounting.
 */
export type SettleCheck = { ok: true } | { ok: false; error: string };

export function canSettleBalance(o: {
  status: string;
  totalAmount: string | number;
  amountPaid: string | number | null | undefined;
}): SettleCheck {
  if (o.status === "cancelled") {
    return { ok: false, error: "This order is cancelled - its balance cannot be marked as paid." };
  }
  const total = Math.round(Number(o.totalAmount) * 100);
  const paid = Math.round(Number(o.amountPaid ?? 0) * 100);
  if (!(paid > 0)) {
    return {
      ok: false,
      error: "No payment has been recorded on this order yet - use the normal mark-as-paid flow.",
    };
  }
  if (paid >= total) {
    return { ok: false, error: "There is no balance due on this order." };
  }
  return { ok: true };
}
