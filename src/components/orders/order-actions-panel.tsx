import { CancelRequestButton } from "@/components/orders/cancel-request-button";
import { ReturnRequestButton } from "@/components/orders/return-request-button";
import { RETURN_WINDOW_MS } from "@/lib/order-windows";

/**
 * Phase 6 06-06 — server-side eligibility gate for the cancel + return forms.
 * 260601-afs — passes orderLines to ReturnRequestButton for per-item picker.
 *
 * Renders nothing when neither action is available; pending request gates both
 * (Assumption 7 — one pending per order).
 *
 * Mirrors the eligibility checks in submitOrderRequest / submitReturnRequest
 * so the UI never surfaces a button the server would reject.
 */

export type OrderLineForReturn = {
  id: string;
  productName: string;
  quantity: number;
};

export function OrderActionsPanel({
  orderId,
  status,
  updatedAt,
  hasPendingRequest,
  orderLines,
}: {
  orderId: string;
  status: string;
  updatedAt: Date;
  hasPendingRequest: boolean;
  orderLines: OrderLineForReturn[];
}) {
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  const canCancel =
    !hasPendingRequest && (status === "pending" || status === "paid");
  const canReturn =
    !hasPendingRequest && status === "delivered" && ageMs <= RETURN_WINDOW_MS;

  if (!canCancel && !canReturn && !hasPendingRequest) return null;

  return (
    <section
      aria-labelledby="order-actions"
      className="rounded-2xl p-4 md:p-6 mb-6 bg-white"
    >
      <h2
        id="order-actions"
        className="font-[var(--font-heading)] text-xl mb-4"
      >
        Order actions
      </h2>
      {hasPendingRequest ? (
        <p className="text-sm text-slate-600">
          You have a pending request on this order. We&apos;ll review it and
          email you when it&apos;s decided.
        </p>
      ) : null}
      <div className="flex gap-3 flex-wrap">
        {canCancel ? <CancelRequestButton orderId={orderId} /> : null}
        {canReturn ? (
          <ReturnRequestButton orderId={orderId} orderLines={orderLines} />
        ) : null}
      </div>
    </section>
  );
}
