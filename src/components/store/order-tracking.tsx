import type { ShipmentTrackingView } from "@/lib/shipment-tracking";
import { OrderTrackingTimeline } from "@/components/orders/order-tracking-timeline";

/**
 * Customer-side wrapper around the shared OrderTrackingTimeline. Lives in
 * /components/store so it can evolve independently of the admin panel
 * without cross-coupling their layouts.
 */
export function OrderTracking({ view }: { view: ShipmentTrackingView }) {
  return <OrderTrackingTimeline view={view} />;
}
