"use server";

// Phase 6 06-06 stub — full implementation lands in plan 06-06.
// Pre-created here so 06-05's edit to /orders/[id]/page.tsx imports cleanly.
import type { OrderRequestRow } from "@/components/orders/order-requests-list";

export async function listMyOrderRequests(
  _orderId: string,
): Promise<OrderRequestRow[]> {
  return [];
}
