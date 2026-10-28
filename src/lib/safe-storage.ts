/**
 * Throw-proof Storage wrapper (IG WebView hardening, Task 10).
 *
 * `zustand` v5's `persist` middleware calls `storage.setItem` synchronously
 * inside `api.setState` — a throw (quota exceeded, Safari private-mode
 * `SecurityError`, storage disabled by an in-app WebView) propagates out of
 * the store action (e.g. `addItem()`) into the caller's click handler. React
 * state is already applied in memory before the throw fires, so the UI does
 * not actually break, but every tap logs an uncaught error. This wrapper
 * makes every method throw-proof: on failure it is a silent no-op / returns
 * null, exactly like `createJSONStorage`'s getter guard already does for
 * `getStorage()` itself.
 *
 * Plain lib module — no "use server", no React.
 */

export function createSafeStorage(get: () => Storage): Storage {
  return {
    get length() {
      try {
        return get().length;
      } catch {
        return 0;
      }
    },
    getItem(key: string): string | null {
      try {
        return get().getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key: string, value: string): void {
      try {
        get().setItem(key, value);
      } catch {
        // swallow — quota exceeded / SecurityError / storage disabled.
      }
    },
    removeItem(key: string): void {
      try {
        get().removeItem(key);
      } catch {
        // swallow
      }
    },
    clear(): void {
      try {
        get().clear();
      } catch {
        // swallow
      }
    },
    key(index: number): string | null {
      try {
        return get().key(index);
      } catch {
        return null;
      }
    },
  };
}

/**
 * Probe whether the underlying storage is actually writable right now.
 * Cheap synchronous check — writes and immediately removes a throwaway key.
 */
export function isStorageWritable(get: () => Storage): boolean {
  const PROBE_KEY = "__safe_storage_probe__";
  try {
    const storage = get();
    storage.setItem(PROBE_KEY, "1");
    storage.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}
