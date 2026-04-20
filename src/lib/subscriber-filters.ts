/**
 * Shared pure helpers for the /admin/subscribers page + its server actions.
 * Kept outside the "use server" file because "use server" modules are only
 * permitted to export async functions.
 */

export type SubscriberStatusFilter =
  | "all"
  | "active"
  | "unsubscribed"
  | "bounced";

export const SUBSCRIBER_STATUS_FILTERS: SubscriberStatusFilter[] = [
  "all",
  "active",
  "unsubscribed",
  "bounced",
];

export function isValidSubscriberFilter(
  v: string | undefined,
): v is SubscriberStatusFilter {
  return (
    typeof v === "string" &&
    SUBSCRIBER_STATUS_FILTERS.includes(v as SubscriberStatusFilter)
  );
}
