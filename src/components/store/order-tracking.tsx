"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  bucketForStatusCode,
  bucketLabel,
  type ShipmentTrackingView,
} from "@/lib/shipment-tracking";
import {
  OrderTrackingTimeline,
  dotColorFor,
} from "@/components/orders/order-tracking-timeline";

function formatShortTime(d: Date): string {
  try {
    return d.toLocaleString("en-MY", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d.toISOString();
  }
}

export function OrderTracking({ view }: { view: ShipmentTrackingView }) {
  const [expanded, setExpanded] = useState(false);

  // No shipment booked yet — show the empty state directly, nothing to collapse
  if (!view.hasShipment) {
    return <OrderTrackingTimeline view={view} audience="customer" />;
  }

  const bucket = bucketForStatusCode(view.statusCode, true, {
    statusText: view.statusMessage,
    hasProgress: Boolean(view.trackingNo || view.personnel),
  });
  const dot = dotColorFor(bucket);
  const latest = view.timeline[0] ?? null;
  const label =
    latest?.note ?? view.statusMessage ?? bucketLabel(bucket);
  const time = latest ? formatShortTime(latest.at) : null;

  return (
    <div>
      {/* Collapsed summary row — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 rounded-2xl border p-3 md:p-4 text-left transition-colors hover:bg-slate-50"
        style={{ borderColor: "#e4e4e7", backgroundColor: "#ffffff" }}
        aria-expanded={expanded}
      >
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: dot }}
          aria-hidden
        />
        <span className="flex-1 min-w-0">
          <span className="font-semibold text-zinc-900 text-sm block truncate">
            {label}
          </span>
          {time && (
            <span className="text-xs text-slate-500">{time}</span>
          )}
        </span>
        {view.serviceName && (
          <span className="hidden sm:block text-xs text-slate-400 shrink-0">
            {view.serviceName}
          </span>
        )}
        <ChevronDown
          className="h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200"
          style={{ transform: expanded ? "rotate(180deg)" : undefined }}
        />
      </button>

      {/* Expanded full timeline — banner hidden since the row above is the summary */}
      {expanded && (
        <div className="mt-4">
          <OrderTrackingTimeline
            view={view}
            audience="customer"
            hideBanner
          />
        </div>
      )}
    </div>
  );
}
