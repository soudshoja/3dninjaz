"use client";

/**
 * Quick task 260430-kmr — debounced localStorage autosave hook for the unified
 * product edit page.
 *
 * Storage key:  productDraft:<productId>   (or productDraft:new for create)
 * Debounce:     1000ms
 * Cross-tab:    OUT OF SCOPE — `draft` is captured ONCE on mount via lazy
 *               useState initializer; we don't subscribe to `storage` events.
 *
 * Restore is idempotent (returns the same snapshot) until the consumer calls
 * `discard()`; the parent form decides when to surface a banner offering the
 * snapshot.
 *
 * Failure modes:
 *   - SSR     → falls back to `null` (no `window`).
 *   - Bad JSON → caught + treated as "no draft".
 *   - Quota exceeded on write → silently drops; never surfaces an error.
 */

import { useEffect, useRef, useState } from "react";

type DraftPayload<T> = {
  value: T;
  /** ms-since-epoch (Date.now()) — used for the "Restored from <timestamp>" banner. */
  savedAt: number;
};

const KEY_PREFIX = "productDraft:";

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

export function useProductDraft<T>(productId: string, value: T): ProductDraft<T> {
  const storageKey = `${KEY_PREFIX}${productId || "new"}`;

  // Lazy initialiser — runs ONCE on mount, never re-runs on prop changes. This
  // is the only read path; cross-tab sync is intentionally out of scope.
  const [draft] = useState<DraftPayload<T> | null>(() => readDraft<T>(storageKey));

  // Debounced write of `value` to localStorage on every change.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({ value, savedAt: Date.now() }),
        );
      } catch {
        // Quota exceeded / private mode — silently drop. The form still works,
        // we just don't have an autosave to fall back on if the tab closes.
      }
    }, 1000);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [storageKey, value]);

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
