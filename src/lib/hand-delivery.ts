/**
 * Hand delivery: the admin hands the order to the customer in person, so no
 * courier is booked and no shipping is charged. Admin-only (POS). Stored on
 * the order as shippingCost 0.00, no service code, and this service name.
 */
export const HAND_DELIVERY_NAME = "Hand delivery";

export function isHandDelivery(serviceName: string | null | undefined): boolean {
  return serviceName === HAND_DELIVERY_NAME;
}
