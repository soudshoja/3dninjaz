/**
 * Quick task 260911-skew-checkout-selfheal — stale-bundle error detection
 * and one-shot self-heal recovery for the root error boundaries.
 *
 * Root cause: a client bundle older than the running server build makes a
 * content-derived server action id unresolvable server-side. React's
 * `reset()` re-renders the boundary against the SAME stale bundle, so it can
 * never recover on its own — only a fresh document fetch pulls the new
 * bundle (F-02). This module is a plain lib — NOT `"use server"` — so it can
 * freely export a type alongside the detector function.
 *
 * F-04 — why `"load failed"` / `"failed to fetch"` are EXACT-MATCH, not
 * substring: `"Upload failed"` contains the substring `"load failed"`.
 * iOS Safari's fetch-rejection message is exactly `Load failed`; Chrome/Edge's
 * is exactly `Failed to fetch`. Using `.includes(...)` for either would
 * misclassify unrelated upload/network errors as recoverable stale-bundle
 * errors. Do NOT "simplify" these two checks into substring matching.
 * `Failed to find Server Action` legitimately needs substring matching
 * because the action id (and "older or newer deployment" tail) varies per
 * occurrence.
 */

const STALE_BUNDLE_RELOAD_KEY = "pn:stale-bundle-reload";

/**
 * Returns true when `error` looks like one of the known stale-bundle /
 * deployment-skew failure signatures:
 *  1. "Failed to find Server Action ..." (substring — action id varies)
 *  2. "Load failed" (exact, case-insensitive — iOS Safari fetch rejection)
 *  3. "Failed to fetch" (exact, case-insensitive — Chrome/Edge)
 *  4. "NetworkError when attempting to fetch resource." (Firefox — startsWith)
 *  5. Webpack/Next chunk-load failure (name === "ChunkLoadError", or message
 *     containing "chunkloaderror" / starting with "loading chunk" /
 *     "loading css chunk")
 */
export function isStaleBundleError(error: unknown): boolean {
  if (error === null || typeof error !== "object") {
    return false;
  }

  const rawMessage = (error as { message?: unknown }).message;
  const rawName = (error as { name?: unknown }).name;

  const msg = String(
    typeof rawMessage === "string" ? rawMessage : "",
  )
    .trim()
    .toLowerCase();
  const name = String(typeof rawName === "string" ? rawName : "")
    .trim()
    .toLowerCase();

  if (msg.includes("failed to find server action")) {
    return true;
  }

  // Exact equality only — see F-04 header comment above.
  if (msg === "load failed") {
    return true;
  }

  if (msg === "failed to fetch") {
    return true;
  }

  if (msg.startsWith("networkerror")) {
    return true;
  }

  if (
    name === "chunkloaderror" ||
    msg.includes("chunkloaderror") ||
    msg.startsWith("loading chunk") ||
    msg.startsWith("loading css chunk")
  ) {
    return true;
  }

  return false;
}

/**
 * Rebuilds `href` with a single cache-busting `_v` query param set to
 * `stamp`. Pure and deterministic — takes `stamp` as an argument rather than
 * reading `Date.now()` internally so it is testable without stubbing time.
 * Deletes any pre-existing `_v` first so the param never accumulates across
 * repeated recovery attempts. Preserves the path, all other pre-existing
 * query params, and the hash fragment.
 */
export function buildCacheBustedUrl(href: string, stamp: number): string {
  const url = new URL(href);
  url.searchParams.delete("_v");
  url.searchParams.set("_v", String(stamp));
  return url.toString();
}

/**
 * Allows at most one automatic recovery reload per browsing session,
 * tracked in sessionStorage under `pn:stale-bundle-reload`. Marks the
 * attempt as consumed in the same call that grants it.
 *
 * D-02 — fails CLOSED: the entire body is wrapped in try/catch. If
 * sessionStorage is inaccessible (e.g. Safari private mode throws on
 * access) we cannot prove an attempt has not already happened, so we must
 * not auto-reload — return false rather than rethrow.
 *
 * Reads via `globalThis.sessionStorage` (not the bare global) so a node-env
 * test can stub it without a DOM.
 */
export function consumeAutoRecoveryAttempt(): boolean {
  try {
    const storage = (globalThis as { sessionStorage?: Storage })
      .sessionStorage;
    if (!storage) {
      return false;
    }
    if (storage.getItem(STALE_BUNDLE_RELOAD_KEY) !== null) {
      return false;
    }
    storage.setItem(STALE_BUNDLE_RELOAD_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Performs the actual recovery: a hard, cache-busted document navigation to
 * the current URL. Uses `location.replace` (never `assign`) so the broken
 * document does not enter session history — otherwise the customer's back
 * button would walk straight back into the stale-bundle error.
 * No-op outside a browser (`typeof window === "undefined"`).
 */
export function hardRecover(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.location.replace(
    buildCacheBustedUrl(window.location.href, Date.now()),
  );
}

export type StaleBundleRecoveryContext = {
  staleBundle: boolean;
  autoRecover: boolean;
};
