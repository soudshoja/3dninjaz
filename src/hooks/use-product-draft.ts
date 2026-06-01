"use client";

/**
 * Quick task 260430-kmr — debounced localStorage autosave hook for the unified
 * product edit page.
 *
 * Storage key:  productDraft:<scope>:<productId>  (e.g. productDraft:form:abc-123)
 *               scope defaults to "form" for backwards-compatibility with the
 *               original `productDraft:<id>` callers — the key shape changed in
 *               the generalisation pass (2026-05-02) but default behaviour is
 *               identical.
 * Debounce:     1000ms
 * Cross-tab:    OUT OF SCOPE — `draft` is captured ONCE on mount via lazy
 *               useState initializer; we don't subscribe to `storage` events.
 *
 * Restore is idempotent (returns the same snapshot) until the consumer calls
 * `discard()`; the parent form decides when to surface a banner offering the
 * snapshot.
 *
 * Failure modes:
 *   - SSR          → falls back to `null` (no `window`).
 *   - Bad JSON     → caught + treated as "no draft".
 *   - Quota / priv → surfaced via optional `onError` callback; silently
 *                    dropped when no callback is passed.
 *
 * beforeunload flush:
 *   A `beforeunload` listener synchronously flushes any pending debounce write
 *   so keystrokes in the last <1 s before tab-close are not lost.
 */

import { useEffect, useRef, useState } from "react";

type DraftPayload<T> = {
  value: T;
  /** ms-since-epoch (Date.now()) — used for the "Restored from <timestamp>" banner. */
  savedAt: number;
};

const KEY_PREFIX = "productDraft:";

function buildKey(scope: string, productId: string): string {
  return `${KEY_PREFIX}${scope}:${productId || "new"}`;
}

function readDraft<T>(storageKey: string): DraftPayload<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.savedAt === "number" &&
      Number.isFinite(parsed.savedAt)
    ) {
      return parsed as DraftPayload<T>;
    }
    return null;
  } catch {
    return null;
  }
}

export type ProductDraft<T> = {
  /** Snapshot read at mount time, or null when no snapshot exists. */
  draft: DraftPayload<T> | null;
  /** Returns the snapshot's `value` (or null when no snapshot). */
  restore: () => T | null;
  /** Removes the localStorage entry; called after a successful Save. */
  discard: () => void;
};

type UseProductDraftOptions = {
  /**
   * Namespacing scope for the storage key.
   * Defaults to "form" — produces key `productDraft:form:<id>`.
   * Other consumers use "configurator" or "variants".
   */
  scope?: string;
  /**
   * Called immediately after a debounced write succeeds.
   * Receives the ms-since-epoch timestamp of the write.
   */
  onSaved?: (savedAt: number) => void;
  /**
   * Called when localStorage.setItem throws (QuotaExceededError, private mode,
   * security error). If omitted, errors are silently dropped.
   */
  onError?: (err: unknown) => void;
};

export function useProductDraft<T>(
  productId: string,
  value: T,
  options?: UseProductDraftOptions,
): ProductDraft<T> {
  const scope = options?.scope ?? "form";
  const onSaved = options?.onSaved;
  const onError = options?.onError;

  const storageKey = buildKey(scope, productId);

  // Lazy initialiser — runs ONCE on mount, never re-runs on prop changes. This
  // is the only read path; cross-tab sync is intentionally out of scope.
  const [draft] = useState<DraftPayload<T> | null>(() => readDraft<T>(storageKey));

  // Keep a ref to the latest pending value so the beforeunload handler can
  // flush it synchronously without relying on closure staleness.
  const pendingValueRef = useRef<T>(value);
  pendingValueRef.current = value;

  // Track whether a debounce timer is currently pending.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced write of `value` to localStorage on every change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const savedAt = Date.now();
      try {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({ value: pendingValueRef.current, savedAt }),
        );
        onSaved?.(savedAt);
      } catch (err) {
        onError ? onError(err) : void 0;
        // When no callback: silently drop. The form still works; we just don't
        // have an autosave to fall back on if the tab closes.
      }
    }, 1000);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [storageKey, value, onSaved, onError]);

  // beforeunload flush — if a debounce timer is pending, write immediately so
  // keystrokes in the last <1 s before tab-close are not orphaned.
  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleBeforeUnload() {
      if (timerRef.current === null) return; // no pending timer, nothing to flush
      clearTimeout(timerRef.current);
      timerRef.current = null;
      const savedAt = Date.now();
      try {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({ value: pendingValueRef.current, savedAt }),
        );
      } catch {
        // Cannot show a toast during beforeunload — silently drop.
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [storageKey]);

  function restore(): T | null {
    return draft?.value ?? null;
  }

  function discard() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }

  return { draft, restore, discard };
}
