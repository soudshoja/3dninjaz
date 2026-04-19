// Phase 6 06-06 component (this file will be replaced in plan 06-06).
// Pre-created here so 06-05's edit to /orders/[id]/page.tsx imports cleanly.
export type OrderRequestRow = {
  id: string;
  type: "cancel" | "return";
  status: "pending" | "approved" | "rejected";
  reason: string;
  adminNotes: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
};
export function OrderRequestsList(_props: { requests: OrderRequestRow[] }) {
  return null;
}
