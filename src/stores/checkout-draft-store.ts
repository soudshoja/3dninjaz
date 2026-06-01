/**
 * Checkout address draft store — persists the in-progress shipping address form
 * to localStorage so logged-in users can navigate away and return with their
 * typed values intact.
 *
 * Key: `checkout-address-draft-{userId}` — per-user, per-device.
 * Cleared automatically on successful PayPal capture (see paypal-provider.tsx).
 *
 * Design notes:
 * - Not a Zustand store — the draft is simple key/value localStorage read/write.
 *   Zustand's persist middleware would add unnecessary overhead here because we
 *   need per-user keys, not a global key. We use plain helpers instead.
 * - The form calls saveDraft() on a debounced watch; clearDraft() is called after
 *   a successful order capture.
 * - `country` is always "Malaysia" and not persisted (it is read-only in the form).
 */

export type AddressDraft = {
  recipientName?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postcode?: string;
};

function storageKey(userId: string) {
  return `checkout-address-draft-${userId}`;
}

/** Read the stored draft for this user. Returns null if nothing saved or parse fails. */
export function readDraft(userId: string): AddressDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AddressDraft;
    // Basic sanity — must be a plain object
    if (typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Persist the current form values as a draft for this user. */
export function saveDraft(userId: string, draft: AddressDraft): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(draft));
  } catch {
    // localStorage may be full or disabled — silently ignore
  }
}

/** Remove the stored draft (called after successful order capture). */
export function clearDraft(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    // ignore
  }
}
