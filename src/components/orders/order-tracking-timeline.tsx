import Image from "next/image";
import { BRAND } from "@/lib/brand";
import {
  bucketForStatusCode,
  bucketLabel,
  type ShipmentTrackingView,
  type TrackingBucket,
} from "@/lib/shipment-tracking";
import { CopyTrackingButton } from "@/components/orders/copy-tracking-button";

/**
 * Shared tracking timeline rendered on BOTH the customer order detail page
 * (/orders/[id]) and the admin order detail page (/admin/orders/[id]).
 *
 * Server component — no client state, no event handlers. The one client
 * interaction (copy tracking number) lives in CopyTrackingButton.
 *
 * The `dense` prop tightens spacing for the admin surface, which packs this
 * timeline under a row of action buttons and a stack of other panels.
 */

type Props = {
  view: ShipmentTrackingView;
  dense?: boolean;
};

export function OrderTrackingTimeline({ view, dense }: Props) {
  // Empty state — no shipment booked yet. The customer page uses this
  // friendly copy; the admin panel wraps its own "Book courier" UI around
  // this component and only shows the timeline once a shipment exists.
  if (!view.hasShipment) {
    return (
      <div
        className="rounded-2xl p-5 flex items-center gap-4 flex-wrap"
        style={{ backgroundColor: `${BRAND.blue}10`, color: BRAND.ink }}
        role="status"
      >
        <Image
          src="/icons/ninja/emoji/thank-you.png"
          alt=""
          width={64}
          height={64}
          className="h-16 w-16 object-contain shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="font-bold">Your order is being prepared.</p>
          <p className="text-sm text-slate-700 mt-1">
            We&apos;ll ship it soon and your live tracking will appear here.
          </p>
        </div>
      </div>
    );
  }

  const bucket = bucketForStatusCode(view.statusCode, true);
  const banner = bannerFor(bucket);

  return (
    <div className={dense ? "space-y-4" : "space-y-6"}>
      {/* Status banner */}
      <div
        className={`rounded-2xl p-4 md:p-5 flex items-center gap-4 flex-wrap border-2`}
        style={{
          backgroundColor: banner.bg,
          borderColor: banner.border,
          color: BRAND.ink,
        }}
        role="status"
      >
        <Image
          src={banner.icon}
          alt=""
          width={56}
          height={56}
          className="h-14 w-14 object-contain shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base md:text-lg">
            {view.statusMessage || bucketLabel(bucket)}
          </p>
          <p className="text-sm text-slate-700 mt-0.5">
            {banner.subline}
          </p>
        </div>
      </div>

      {view.cachedNote ? (
        <p
          className="rounded-xl px-3 py-2 text-xs"
          style={{ backgroundColor: "#fef3c7", color: "#78350f" }}
          role="status"
        >
          {view.cachedNote}
        </p>
      ) : null}

      {/* Consignment row */}
      {view.consignmentNo || view.trackingNo ? (
        <div
          className="rounded-xl border p-3 md:p-4 flex flex-wrap items-center gap-3"
          style={{ borderColor: "#e4e4e7", backgroundColor: "#ffffff" }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
              Tracking
            </p>
            <p className="font-mono text-sm md:text-base break-words text-zinc-900">
              {view.consignmentNo ?? view.trackingNo}
            </p>
          </div>
          {view.consignmentNo ? (
            <CopyTrackingButton value={view.consignmentNo} />
          ) : null}
        </div>
      ) : null}

      {/* Driver card — only shown when personnel info is present */}
      {view.personnel ? <DriverCard personnel={view.personnel} /> : null}

      {/* Event timeline */}
      {view.timeline.length > 0 ? (
        <div>
          <h3 className="font-[var(--font-heading)] text-lg mb-3">
            Delivery events
          </h3>
          <ol className="space-y-3">
            {view.timeline.map((evt, i) => {
              const evtBucket = bucketForStatusCode(evt.statusCode, true);
              const dot = dotColorFor(evtBucket);
              const latest = i === 0;
              return (
                <li
                  key={`${evt.at.getTime()}-${i}`}
                  className="rounded-xl border p-3 md:p-4 flex items-start gap-3"
                  style={{
                    borderColor: "#e4e4e7",
                    backgroundColor: latest ? "#ffffff" : "#fafafa",
                  }}
                >
                  <span
                    className="mt-1 h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: dot }}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-zinc-900 text-sm md:text-base">
                      {evt.note}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatDateTime(evt.at)}
                      {" · "}
                      <span className="font-mono">#{evt.statusCode}</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {/* Live map */}
      {view.mapEmbedUrl ? (
        <div>
          <h3 className="font-[var(--font-heading)] text-lg mb-3">
            Live map
          </h3>
          <div
            className="rounded-xl overflow-hidden border"
            style={{ borderColor: "#e4e4e7" }}
          >
            <iframe
              src={view.mapEmbedUrl}
              style={{ width: "100%", height: dense ? 340 : 420, border: 0 }}
              loading="lazy"
              title="Live courier tracking map"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// --------------------------- Internals ---------------------------

function DriverCard({
  personnel,
}: {
  personnel: NonNullable<ShipmentTrackingView["personnel"]>;
}) {
  const hasAnything =
    personnel.name || personnel.phone || personnel.vehicle || personnel.plate;
  if (!hasAnything) return null;

  return (
    <div
      className="rounded-xl border p-3 md:p-4"
      style={{ borderColor: "#e4e4e7", backgroundColor: "#ffffff" }}
    >
      <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
        Driver
      </p>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          {personnel.name ? (
            <p className="font-semibold text-zinc-900">{personnel.name}</p>
          ) : (
            <p className="text-slate-500 italic">Courier assigned</p>
          )}
          {personnel.vehicle || personnel.plate ? (
            <p className="text-sm text-slate-600 mt-0.5">
              {[personnel.vehicle, personnel.plate].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
        {personnel.phone ? (
          <a
            href={`tel:${personnel.phone.replace(/\s+/g, "")}`}
            className="rounded-full px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: BRAND.blue }}
          >
            Call {personnel.phone}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function formatDateTime(d: Date): string {
  try {
    return d.toLocaleString("en-MY", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d.toISOString();
  }
}

function bannerFor(b: TrackingBucket): {
  icon: string;
  bg: string;
  border: string;
  subline: string;
} {
  switch (b) {
    case "delivered":
      return {
        icon: "/icons/ninja/emoji/success.png",
        bg: `${BRAND.green}25`,
        border: BRAND.green,
        subline: "Your order has been delivered.",
      };
    case "out_for_delivery":
      return {
        icon: "/icons/ninja/nav/shop.png",
        bg: `${BRAND.blue}15`,
        border: BRAND.blue,
        subline: "Out for delivery today.",
      };
    case "in_transit":
      return {
        icon: "/icons/ninja/nav/shop.png",
        bg: `${BRAND.blue}10`,
        border: BRAND.blue,
        subline: "Your package is on the move.",
      };
    case "picked_up":
      return {
        icon: "/icons/ninja/nav/shop.png",
        bg: `${BRAND.blue}10`,
        border: BRAND.blue,
        subline: "Picked up by the courier.",
      };
    case "cancelled":
      return {
        icon: "/icons/ninja/emoji/warning.png",
        bg: "#fee2e2",
        border: "#f87171",
        subline: "This shipment was cancelled.",
      };
    case "exception":
      return {
        icon: "/icons/ninja/emoji/warning.png",
        bg: "#fef3c7",
        border: "#f59e0b",
        subline: "There was a delivery issue. We're looking into it.",
      };
    case "awaiting":
    default:
      return {
        icon: "/icons/ninja/emoji/thank-you.png",
        bg: `${BRAND.purple}15`,
        border: BRAND.purple,
        subline: "Waiting for the courier to collect your parcel.",
      };
  }
}

function dotColorFor(b: TrackingBucket): string {
  switch (b) {
    case "delivered":
      return BRAND.green;
    case "cancelled":
      return "#ef4444";
    case "exception":
      return "#f59e0b";
    case "out_for_delivery":
    case "in_transit":
    case "picked_up":
      return BRAND.blue;
    case "awaiting":
    default:
      return "#a1a1aa";
  }
}
