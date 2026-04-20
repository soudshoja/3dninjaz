// Plain (non-"use server") module so client components can import the event
// list without Next.js treating it as a server-action export.
export const DELYVA_EVENTS_TO_REGISTER = [
  "order.created",
  "order.failed",
  "order_tracking.change",
  "order_tracking.update",
] as const;

export type DelyvaRegisterableEvent =
  (typeof DELYVA_EVENTS_TO_REGISTER)[number];
