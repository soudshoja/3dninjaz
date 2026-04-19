import { BRAND } from "@/lib/brand";
import type { OrderStatus } from "@/lib/orders";
import { Check } from "lucide-react";

/**
 * Four-step horizontal timeline: Ordered -> Processing -> Shipped -> Delivered.
 *
 * Cancelled orders render an ink-bordered single message.
 * Pending (not-yet-paid) orders render a purple waiting indicator.
 *
 * Completed steps show a green circle with a check icon; the current step
 * shows the green circle (no check) with aria-current="step" for a11y.
 * Future steps render a muted ink tint.
 */

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: "paid", label: "Ordered" },
  { key: "processing", label: "Processing" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
];

export function OrderTimeline({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return (
      <div
        className="rounded-2xl p-4 border-2 font-semibold"
        style={{ borderColor: BRAND.ink, color: BRAND.ink }}
        role="status"
      >
        This order was cancelled.
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div
        className="rounded-2xl p-4 border-2 font-semibold"
        style={{ borderColor: BRAND.purple, color: BRAND.purple }}
        role="status"
      >
        Waiting for payment confirmation…
      </div>
    );
  }

  const currentIdx = STEPS.findIndex((s) => s.key === status);

  return (
    <ol
      className="flex items-center gap-0 md:gap-2"
      aria-label="Order progress"
    >
      {STEPS.map((s, i) => {
        const done = i <= currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <li key={s.key} className="flex-1 flex items-center">
            <div className="flex flex-col items-center flex-1">
              <div
                className="h-9 w-9 md:h-10 md:w-10 rounded-full flex items-center justify-center font-bold text-sm"
                style={{
                  backgroundColor: done ? BRAND.green : `${BRAND.ink}18`,
                  color: BRAND.ink,
                }}
                aria-current={isCurrent ? "step" : undefined}
              >
                {done ? <Check className="h-5 w-5" aria-hidden /> : i + 1}
              </div>
              <span className="mt-2 text-[11px] md:text-xs font-semibold text-center">
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 ? (
              <div
                className="h-[3px] flex-1 rounded"
                style={{
                  backgroundColor: i < currentIdx ? BRAND.green : `${BRAND.ink}18`,
                }}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
