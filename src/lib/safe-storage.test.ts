/**
 * IG WebView hardening (Task 10) — safe-storage tests.
 * Run: npx vitest run src/lib/safe-storage.test.ts
 */

import { describe, it, expect, vi } from "vitest";
import { createSafeStorage, isStorageWritable } from "./safe-storage";

function makeStubStorage(overrides: Partial<Storage> = {}): Storage {
  const backing = new Map<string, string>();
  return {
    get length() {
      return backing.size;
    },
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => {
      backing.set(key, value);
    },
    removeItem: (key: string) => {
      backing.delete(key);
    },
    clear: () => backing.clear(),
    key: (index: number) => Array.from(backing.keys())[index] ?? null,
    ...overrides,
  } as Storage;
}

describe("createSafeStorage", () => {
  it("passes through reads/writes on a healthy storage", () => {
    const real = makeStubStorage();
    const safe = createSafeStorage(() => real);
    safe.setItem("a", "1");
    expect(safe.getItem("a")).toBe("1");
    safe.removeItem("a");
    expect(safe.getItem("a")).toBeNull();
  });

  it("setItem swallows a QuotaExceededError-style throw instead of propagating", () => {
    const throwing = makeStubStorage({
      setItem: () => {
        const err = new Error("QuotaExceededError");
        err.name = "QuotaExceededError";
        throw err;
      },
    });
    const safe = createSafeStorage(() => throwing);
    expect(() => safe.setItem("a", "1")).not.toThrow();
  });

  it("getItem returns null instead of throwing when the getter throws", () => {
    const throwing = makeStubStorage({
      getItem: () => {
        throw new Error("SecurityError");
      },
    });
    const safe = createSafeStorage(() => throwing);
    expect(() => safe.getItem("a")).not.toThrow();
    expect(safe.getItem("a")).toBeNull();
  });

  it("removeItem, clear, key, and length all swallow throws", () => {
    const throwing: Storage = {
      get length() {
        throw new Error("nope");
      },
      getItem: () => {
        throw new Error("nope");
      },
      setItem: () => {
        throw new Error("nope");
      },
      removeItem: () => {
        throw new Error("nope");
      },
      clear: () => {
        throw new Error("nope");
      },
      key: () => {
        throw new Error("nope");
      },
    };
    const safe = createSafeStorage(() => throwing);
    expect(() => safe.removeItem("a")).not.toThrow();
    expect(() => safe.clear()).not.toThrow();
    expect(safe.key(0)).toBeNull();
    expect(safe.length).toBe(0);
  });

  it("does not call the getter more than necessary per operation", () => {
    const real = makeStubStorage();
    const getter = vi.fn(() => real);
    const safe = createSafeStorage(getter);
    safe.setItem("a", "1");
    expect(getter).toHaveBeenCalledTimes(1);
  });
});

describe("isStorageWritable", () => {
  it("returns true for a healthy storage", () => {
    expect(isStorageWritable(() => makeStubStorage())).toBe(true);
  });

  it("returns false when setItem throws (quota / blocked storage)", () => {
    const throwing = makeStubStorage({
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    expect(isStorageWritable(() => throwing)).toBe(false);
  });

  it("returns false when the getter itself throws", () => {
    expect(
      isStorageWritable(() => {
        throw new Error("blocked");
      }),
    ).toBe(false);
  });
});
