import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCacheBustedUrl,
  consumeAutoRecoveryAttempt,
  isStaleBundleError,
} from "./is-stale-bundle-error";

describe("isStaleBundleError", () => {
  it.each([
    [
      "exact production Server Action string",
      new Error(
        'Failed to find Server Action "62dd0a82452496754f85ca77e71e61aa7a76beb5". This request might be from an older or newer deployment.',
      ),
    ],
    ["TypeError('Load failed')", new TypeError("Load failed")],
    ["Error('load failed') (lowercase)", new Error("load failed")],
    ["TypeError('Failed to fetch')", new TypeError("Failed to fetch")],
    [
      "Firefox NetworkError",
      new Error("NetworkError when attempting to fetch resource."),
    ],
    ["ChunkLoadError name", Object.assign(new Error("boom"), { name: "ChunkLoadError" })],
    ["Loading chunk N failed message", new Error("Loading chunk 482 failed.")],
  ])("returns true for %s", (_label, error) => {
    expect(isStaleBundleError(error)).toBe(true);
  });

  it("returns false for 'Upload failed' — the F-04 substring trap; this is the point of the module", () => {
    expect(isStaleBundleError(new Error("Upload failed"))).toBe(false);
  });

  it.each([
    ["Image upload failed", new Error("Image upload failed")],
    [
      "unrelated payment error",
      new Error("Payment could not be completed. Please try again."),
    ],
    ["unrelated validation error", new Error("Enter a valid address first.")],
    ["null", null],
    ["undefined", undefined],
    ["bare string 'Load failed'", "Load failed"],
    ["empty object", {}],
    ["number", 42],
  ])("returns false for %s", (_label, error) => {
    expect(isStaleBundleError(error)).toBe(false);
  });
});

describe("buildCacheBustedUrl", () => {
  it("preserves the path and sets _v to the given stamp", () => {
    const out = buildCacheBustedUrl(
      "https://3dninjaz.com/checkout",
      1757568000000,
    );
    const url = new URL(out);
    expect(url.pathname).toBe("/checkout");
    expect(url.searchParams.get("_v")).toBe("1757568000000");
  });

  it("is idempotent on repeat — feeding its own output back yields exactly one _v", () => {
    const first = buildCacheBustedUrl(
      "https://3dninjaz.com/checkout",
      1757568000000,
    );
    const second = buildCacheBustedUrl(first, 1757568099999);
    const url = new URL(second);
    expect(url.searchParams.getAll("_v").length).toBe(1);
    expect(url.searchParams.get("_v")).toBe("1757568099999");
  });

  it("preserves an unrelated existing param", () => {
    const out = buildCacheBustedUrl(
      "https://3dninjaz.com/checkout?ref=ig",
      1757568000000,
    );
    const url = new URL(out);
    expect(url.searchParams.get("ref")).toBe("ig");
  });

  it("preserves the hash fragment", () => {
    const out = buildCacheBustedUrl(
      "https://3dninjaz.com/checkout#summary",
      1757568000000,
    );
    expect(new URL(out).hash).toBe("#summary");
  });
});

describe("consumeAutoRecoveryAttempt", () => {
  const original = (globalThis as { sessionStorage?: Storage })
    .sessionStorage;

  afterEach(() => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = original;
  });

  function makeMemoryStorage(): Storage {
    const store = new Map<string, string>();
    return {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
      key: () => null,
      get length() {
        return store.size;
      },
    } as Storage;
  }

  it("returns true on the first call, false on subsequent calls in the same session", () => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage =
      makeMemoryStorage();

    expect(consumeAutoRecoveryAttempt()).toBe(true);
    expect(consumeAutoRecoveryAttempt()).toBe(false);
    expect(consumeAutoRecoveryAttempt()).toBe(false);
  });

  it("fails closed (returns false, does not throw) when sessionStorage.getItem throws", () => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = {
      getItem: () => {
        throw new Error("SecurityError: private mode");
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: () => null,
      length: 0,
    } as unknown as Storage;

    expect(() => consumeAutoRecoveryAttempt()).not.toThrow();
    expect(consumeAutoRecoveryAttempt()).toBe(false);
  });
});
