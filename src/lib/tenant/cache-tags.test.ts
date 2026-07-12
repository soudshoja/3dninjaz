/**
 * Phase 23 (23-02) — RED tests for tenant-aware cache-tag helpers.
 * Run: npx vitest run src/lib/tenant/cache-tags.test.ts
 */

import { describe, it, expect } from "vitest";
import { tenantTag, tenantCacheKey } from "./cache-tags";

describe("tenantTag", () => {
  it("prefixes a tag with t:<tenantId>:", () => {
    expect(tenantTag("abc", "settings")).toBe("t:abc:settings");
  });

  it("prefixes an existing repo tag the same way", () => {
    expect(tenantTag("abc", "nav-category-tree")).toBe(
      "t:abc:nav-category-tree",
    );
  });

  it("yields a different tag for a different tenantId with the same logical tag", () => {
    expect(tenantTag("A", "x")).not.toBe(tenantTag("B", "x"));
  });

  it("single-mode id is a real string and prefixes identically — no key-format fork", () => {
    expect(tenantTag("single", "x")).toBe("t:single:x");
  });

  it("throws if tenantId is empty", () => {
    expect(() => tenantTag("", "settings")).toThrow(
      "tenantTag: tenantId required",
    );
  });
});

describe("tenantCacheKey", () => {
  it("deep-equals [t:<tenantId>, ...parts] for multiple parts", () => {
    expect(tenantCacheKey("abc", "products", "list")).toEqual([
      "t:abc",
      "products",
      "list",
    ]);
  });

  it("deep-equals [t:<tenantId>] when no parts are given (namespace alone)", () => {
    expect(tenantCacheKey("abc")).toEqual(["t:abc"]);
  });

  it("throws if tenantId is empty", () => {
    expect(() => tenantCacheKey("")).toThrow(
      "tenantCacheKey: tenantId required",
    );
  });
});
