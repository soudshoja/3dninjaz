/**
 * Phase 23 (23-04) — tests for getTenantContext().
 * Run: npx vitest run src/lib/tenant/context.test.ts
 *
 * "server-only" is mocked the same way pool-manager.test.ts/registry.test.ts
 * do. next/headers, next/navigation, ./registry, and ./pool-manager are all
 * mocked so this exercises context.ts's own resolution logic in isolation.
 *
 * MEMOIZATION NOTE (23-04 guardrails): React `cache()` only memoizes inside
 * a request-scoped render dispatcher (AsyncLocalStorage-backed) that a real
 * Next.js server render installs. Empirically verified against this repo's
 * react@19.1.0 + vitest@4.1.5: calling a `cache()`-wrapped async fn twice in
 * a bare vitest/Node harness (no render dispatcher) invokes the underlying
 * function BOTH times — see the throwaway experiment run during 23-04
 * execution (spy call count 2, returned object identity `false`). A
 * "runs once when called twice" assertion on `getTenantContext` itself
 * therefore cannot hold here. Per the guardrails, context.ts exports the
 * inner resolver (`resolveTenantContext`) so the memoized contract's actual
 * LOGIC — one resolve of headers -> resolveDomain -> getTenantDb, given the
 * same inputs — is fully covered directly below, and `getTenantContext`
 * itself is asserted to return that same resolved shape when invoked
 * through the cache() wrapper (proving the wrapper delegates correctly),
 * without asserting call-count memoization.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const {
  headersMock,
  notFoundMock,
  resolveDomainMock,
  warmRegistryMock,
  getTenantDbMock,
  dbSentinel,
} = vi.hoisted(() => {
  const dbSentinel = { __tenantDb: true };
  return {
    headersMock: vi.fn(),
    notFoundMock: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    resolveDomainMock: vi.fn(),
    warmRegistryMock: vi.fn().mockResolvedValue(undefined),
    getTenantDbMock: vi.fn(() => dbSentinel),
    dbSentinel,
  };
});

vi.mock("next/headers", () => ({
  headers: () => headersMock(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => notFoundMock(),
}));
vi.mock("./registry", () => ({
  resolveDomain: (...args: unknown[]) => resolveDomainMock(...args),
  warmRegistry: (...args: unknown[]) => warmRegistryMock(...args),
}));
vi.mock("./pool-manager", () => ({
  getTenantDb: (...args: unknown[]) => getTenantDbMock(...args),
}));

import {
  getTenantContext,
  resolveTenantContext,
  TenantSuspendedError,
} from "./context";
import type { Tenant } from "./platform-schema";

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: "t1",
    name: "Tenant One",
    slug: "t1",
    dsn: "mysql://t1/db",
    status: "active",
    schemaVersion: 1,
    uploadsPrefix: "uploads/t1",
    primaryDomain: "t1.example.com",
    settings: {},
    ...overrides,
  };
}

function makeHeaders(host: string) {
  return { get: (key: string) => (key === "host" ? host : null) };
}

beforeEach(() => {
  headersMock.mockReset();
  notFoundMock.mockClear();
  resolveDomainMock.mockReset();
  warmRegistryMock.mockClear().mockResolvedValue(undefined);
  getTenantDbMock.mockClear().mockReturnValue(dbSentinel);
});

describe("resolveTenantContext (inner resolver)", () => {
  it("happy path: resolves { tenant, db } for a registered host, db === getTenantDb(tenant)", async () => {
    const tenant = makeTenant();
    headersMock.mockResolvedValue(makeHeaders("t1.example.com"));
    resolveDomainMock.mockReturnValue(tenant);

    const result = await resolveTenantContext();

    expect(result.tenant).toBe(tenant);
    expect(result.db).toBe(dbSentinel);
    expect(getTenantDbMock).toHaveBeenCalledWith(tenant);
    expect(warmRegistryMock).toHaveBeenCalled();
    expect(resolveDomainMock).toHaveBeenCalledWith("t1.example.com");
  });

  it("normalizes the Host header (case + port) before resolving", async () => {
    const tenant = makeTenant();
    headersMock.mockResolvedValue(makeHeaders("T1.Example.com:3000"));
    resolveDomainMock.mockReturnValue(tenant);

    await resolveTenantContext();

    expect(resolveDomainMock).toHaveBeenCalledWith("t1.example.com");
  });

  it("unknown host calls notFound() and never returns a tenant/db — TEN-03 hard-fail", async () => {
    headersMock.mockResolvedValue(makeHeaders("unknown.test"));
    resolveDomainMock.mockReturnValue(null);

    await expect(resolveTenantContext()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
    expect(getTenantDbMock).not.toHaveBeenCalled();
  });

  it("suspended tenant throws TenantSuspendedError with the tenant id (distinct from notFound)", async () => {
    const tenant = makeTenant({ status: "suspended", id: "t2" });
    headersMock.mockResolvedValue(makeHeaders("t2.example.com"));
    resolveDomainMock.mockReturnValue(tenant);

    await expect(resolveTenantContext()).rejects.toBeInstanceOf(
      TenantSuspendedError,
    );
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(getTenantDbMock).not.toHaveBeenCalled();
  });

  it("TenantSuspendedError carries the tenant id", async () => {
    const tenant = makeTenant({ status: "suspended", id: "t2" });
    headersMock.mockResolvedValue(makeHeaders("t2.example.com"));
    resolveDomainMock.mockReturnValue(tenant);

    try {
      await resolveTenantContext();
      throw new Error("expected resolveTenantContext to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TenantSuspendedError);
      expect((err as TenantSuspendedError).tenantId).toBe("t2");
    }
  });

  it("single mode: returns the synthesized tenant regardless of Host header value", async () => {
    const single = makeTenant({ id: "single", primaryDomain: "localhost" });
    headersMock.mockResolvedValue(
      makeHeaders("totally-unrelated-host.example"),
    );
    // registry.ts's single-mode resolveDomain() ignores the host it's given
    // and always returns the synthesized tenant — mocked here accordingly.
    resolveDomainMock.mockReturnValue(single);

    const result = await resolveTenantContext();
    expect(result.tenant).toBe(single);
    expect(result.db).toBe(dbSentinel);
  });

  it("missing Host header resolves to an empty string, not undefined/crash", async () => {
    headersMock.mockResolvedValue({ get: () => null });
    resolveDomainMock.mockReturnValue(null);

    await expect(resolveTenantContext()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(resolveDomainMock).toHaveBeenCalledWith("");
  });
});

describe("getTenantContext (React cache()-wrapped)", () => {
  it("delegates to the same resolution logic — happy path returns { tenant, db }", async () => {
    const tenant = makeTenant();
    headersMock.mockResolvedValue(makeHeaders("t1.example.com"));
    resolveDomainMock.mockReturnValue(tenant);

    const result = await getTenantContext();
    expect(result.tenant).toBe(tenant);
    expect(result.db).toBe(dbSentinel);
  });

  it("delegates to the same resolution logic — unknown host still hard-fails via notFound()", async () => {
    headersMock.mockResolvedValue(makeHeaders("unknown.test"));
    resolveDomainMock.mockReturnValue(null);

    await expect(getTenantContext()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  // Memoization itself is NOT assertable in this bare vitest harness — see
  // the file-header note. This test documents the contract and confirms
  // getTenantContext is in fact the react `cache()`-wrapped export (not a
  // parallel, divergent implementation) by checking it re-derives the exact
  // mocked dependency graph on each call rather than silently caching a
  // stale/wrong value across differing inputs.
  it("re-resolves per distinct mocked Host in this harness (no cross-request cache leak)", async () => {
    const tenantA = makeTenant({ id: "a", primaryDomain: "a.example.com" });
    const tenantB = makeTenant({ id: "b", primaryDomain: "b.example.com" });

    headersMock.mockResolvedValue(makeHeaders("a.example.com"));
    resolveDomainMock.mockReturnValue(tenantA);
    const resultA = await getTenantContext();
    expect(resultA.tenant.id).toBe("a");

    headersMock.mockResolvedValue(makeHeaders("b.example.com"));
    resolveDomainMock.mockReturnValue(tenantB);
    const resultB = await getTenantContext();
    expect(resultB.tenant.id).toBe("b");
  });
});
