import { BRAND } from "@/lib/brand";
import type { OrderStatus } from "@/lib/orders";

/**
 * Admin-side progress strip. Duplicated here (rather than imported from
 * `src/components/orders/*`) because the customer-facing order components are
 * being built in a parallel plan and don't exist yet at this commit.
 *
 * Displays the four forward stages (ordered -> processing -> shipped ->
 * delivered) with cancelled as a special terminal state. Completed stages
 * render filled dots; upcoming stages render hollow dots. No icons or
 * animations — just a sturdy visual aid for the admin.
 */

const STAGES = ["ordered", "processing", "shipped", "delivered"] as const;

type Stage = (typeof STAGES)[number];

function stageIndexForStatus(status: OrderStatus): number {
  switch (status) {
    case "pending":
    case "paid":
      return 0; // ordered
    case "processing":
      return 1;
    case "shipped":
      return 2;
    case "delivered":
      return 3;
    default:
      return -1;
  }
}

const STAGE_LABELS: Record<Stage, string> = {
  ordered: "Ordered",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
};

export function AdminOrderTimeline({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return (
      <div
        className="rounded-xl p-4 text-sm font-semibold"
        style={{ backgroundColor: `${BRAND.ink}10`, color: BRAND.ink }}
        aria-label="Order cancelled"
      >
        This order is cancelled.
      </div>
    );
  }

  const activeIdx = stageIndexForStatus(status);

  return (
    <ol className="flex flex-wrap items-center gap-2 sm:gap-4" aria-label="Order progress">
      {STAGES.map((stage, idx) => {
        const done = idx <= activeIdx;
        return (
          <li key={stage} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-full border-2"
              style={{
                borderColor: done ? BRAND.green : `${BRAND.ink}33`,
                backgroundColor: done ? BRAND.green : "transparent",
              }}
            />
            <span
              className="text-xs sm:text-sm font-semibold"
              style={{ color: done ? BRAND.ink : `${BRAND.ink}88` }}
            >
              {STAGE_LABELS[stage]}
            </span>
            {idx < STAGES.length - 1 ? (
              <span
                aria-hidden="true"
                className="h-0.5 w-6 sm:w-10"
                style={{ backgroundColor: idx < activeIdx ? BRAND.green : `${BRAND.ink}22` }}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
