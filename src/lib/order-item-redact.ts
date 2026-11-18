// Customer-facing reads of order_items must never carry our cost. unit_cost is
// now snapshotted on almost every new order (Accounting v2), so any whole-row
// select that reaches a customer page, an RSC prop or a server action result
// has to pass through this. Keeps the row shape so types do not change.

export function redactOrderItemCost<
  T extends { unitCost: string | null; unitCostSource: "snapshot" | "estimate" | "manual" | null },
>(item: T): T {
  return { ...item, unitCost: null, unitCostSource: null };
}
