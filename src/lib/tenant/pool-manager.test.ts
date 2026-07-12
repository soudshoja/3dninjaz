/**
 * Phase 23 (23-03) — tests for the per-tenant pool manager.
 * Run: npx vitest run src/lib/tenant/pool-manager.test.ts
 *
 * The real "server-only" package throws when required outside a Server
 * Component/webpack build (it has no special-case for plain Node/vitest —
 * verified directly against node_modules/server-only/index.js), so it must
 * be mocked here the same way real consumers rely on the webpack alias.
 * @/lib/db/schema and @/lib/tenant/platform-schema are mocked too — the
 * latter's real file also starts with `import "server-only"`, and neither
 * module's actual field contents matter once drizzle()/createPool() are
 * themselves mocked below.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/schema", () => ({}));
vi.mock("@/lib/tenant/platform-schema", () => ({}));

type FakePool = { end: ReturnType<typeof vi.fn> };

function makeFakePool(): FakePool {
  return { end: vi.fn().mockResolvedValue(undefined) };
}

const createPoolMock = vi.fn(() => makeFakePool());
vi.mock("mysql2/promise", () => ({
  default: { createPool: (...args: unknown[]) => createPoolMock(...args) },
}));

const drizzleMock = vi.fn((pool: unknown) => ({ __pool: pool }));
vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: (...args: unknown[]) => drizzleMock(...args),
}));

const { singletonSentinel } = vi.hoisted(() => ({
  singletonSentinel: { __singleton: true },
}));
vi.mock("@/lib/db", () => ({ db: singletonSentinel }));

import {
  getTenantDb,
  getPlatformDb,
  disposeTenantPool,
  _resetForTests,
} from "./pool-manager";
import type { Tenant } from "@/lib/tenant/platform-schema";

function makeTenant(id: string, dsn = `mysql://tenant-${id}/db`): Tenant {
  return {
    id,
    name: `Tenant ${id}`,
    slug: id,
    dsn,
    status: "active",
    schemaVersion: 1,
    uploadsPrefix: `uploads/${id}`,
    primaryDomain: `${id}.example.com`,
    settings: {},
  };
}

// File-wide safety net — guarantees the Map/platform-pool singleton never
// leaks a stray entry between tests (or between describe blocks) regardless
// of what any individual test's own afterEach does.
afterEach(() => {
  _resetForTests();
});

describe("getTenantDb", () => {
  const originalTenantMode = process.env.TENANT_MODE;
  const originalPlatformUrl = process.env.PLATFORM_DATABASE_URL;

  beforeEach(() => {
    createPoolMock.mockClear();
    drizzleMock.mockClear();
  });

  afterEach(() => {
    _resetForTests();
    process.env.TENANT_MODE = originalTenantMode;
    process.env.PLATFORM_DATABASE_URL = originalPlatformUrl;
  });

  it("returns the SAME cached instance when called twice for the same tenant", () => {
    process.env.TENANT_MODE = "registry";
    const tenantA = makeTenant("a");
    const first = getTenantDb(tenantA);
    const second = getTenantDb(tenantA);
    expect(first).toBe(second);
    expect(createPoolMock).toHaveBeenCalledTimes(1);
  });

  it("returns DIFFERENT instances for different tenants", () => {
    process.env.TENANT_MODE = "registry";
    const dbA = getTenantDb(makeTenant("a"));
    const dbB = getTenantDb(makeTenant("b"));
    expect(dbA).not.toBe(dbB);
    expect(createPoolMock).toHaveBeenCalledTimes(2);
  });

  it("builds tenant pools with the exact STACK.md pool values from tenant.dsn", () => {
    process.env.TENANT_MODE = "registry";
    getTenantDb(makeTenant("a", "mysql://user:pass@host/tenant_a"));
    expect(createPoolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: "mysql://user:pass@host/tenant_a",
        connectionLimit: 3,
        maxIdle: 1,
        idleTimeout: 60_000,
        waitForConnections: true,
      }),
    );
  });

  it("evicts the least-recently-used entry past TENANT_POOL_MAX and calls pool.end() on it", () => {
    process.env.TENANT_MODE = "registry";
    const pools: FakePool[] = [];
    createPoolMock.mockImplementation(() => {
      const p = makeFakePool();
      pools.push(p);
      return p;
    });

    // Default TENANT_POOL_MAX is 20 — the 21st distinct tenant pushes size to
    // 21 and must evict the oldest (index 0).
    for (let i = 0; i < 21; i++) {
      getTenantDb(makeTenant(`t${i}`));
    }

    expect(pools[0].end).toHaveBeenCalledTimes(1);
    expect(pools[20].end).not.toHaveBeenCalled();
  });

  it("in single mode (TENANT_MODE=single) returns the existing singleton — no pool created", () => {
    process.env.TENANT_MODE = "single";
    const result = getTenantDb(makeTenant("whatever"));
    expect(result).toBe(singletonSentinel);
    expect(createPoolMock).not.toHaveBeenCalled();
  });

  it("returns the existing singleton for tenant.id === 'single' even in registry mode", () => {
    process.env.TENANT_MODE = "registry";
    const result = getTenantDb(makeTenant("single"));
    expect(result).toBe(singletonSentinel);
    expect(createPoolMock).not.toHaveBeenCalled();
  });

  it("defaults to single-mode behavior when TENANT_MODE is unset", () => {
    delete process.env.TENANT_MODE;
    const result = getTenantDb(makeTenant("whoever"));
    expect(result).toBe(singletonSentinel);
    expect(createPoolMock).not.toHaveBeenCalled();
  });
});

describe("_resetForTests", () => {
  afterEach(() => {
    process.env.TENANT_MODE = "single";
  });

  it("clears the Map and calls pool.end() on every live pool", () => {
    process.env.TENANT_MODE = "registry";
    const pools: FakePool[] = [];
    createPoolMock.mockImplementation(() => {
      const p = makeFakePool();
      pools.push(p);
      return p;
    });

    getTenantDb(makeTenant("a"));
    getTenantDb(makeTenant("b"));
    expect(pools).toHaveLength(2);

    _resetForTests();

    expect(pools[0].end).toHaveBeenCalledTimes(1);
    expect(pools[1].end).toHaveBeenCalledTimes(1);

    // A subsequent call for the same tenant id builds a fresh pool — proof
    // the Map was actually cleared, not just ended in place.
    createPoolMock.mockClear();
    getTenantDb(makeTenant("a"));
    expect(createPoolMock).toHaveBeenCalledTimes(1);
  });
});

describe("disposeTenantPool", () => {
  afterEach(() => {
    _resetForTests();
    process.env.TENANT_MODE = "single";
  });

  it("ends and evicts a single tenant's pool", async () => {
    process.env.TENANT_MODE = "registry";
    const pools: FakePool[] = [];
    createPoolMock.mockImplementation(() => {
      const p = makeFakePool();
      pools.push(p);
      return p;
    });

    getTenantDb(makeTenant("a"));
    await disposeTenantPool("a");

    expect(pools[0].end).toHaveBeenCalledTimes(1);

    createPoolMock.mockClear();
    getTenantDb(makeTenant("a"));
    expect(createPoolMock).toHaveBeenCalledTimes(1);
  });

  it("is a no-op for an unknown tenant id", async () => {
    await expect(disposeTenantPool("does-not-exist")).resolves.toBeUndefined();
  });
});

describe("getPlatformDb", () => {
  afterEach(() => {
    _resetForTests();
    delete process.env.PLATFORM_DATABASE_URL;
  });

  it("throws a clear error when PLATFORM_DATABASE_URL is unset", () => {
    delete process.env.PLATFORM_DATABASE_URL;
    expect(() => getPlatformDb()).toThrow(/PLATFORM_DATABASE_URL not set/);
  });

  it("builds a connectionLimit: 4 singleton and caches it across calls", () => {
    process.env.PLATFORM_DATABASE_URL = "mysql://user:pass@host/ninjaz_platform";
    createPoolMock.mockClear();

    const first = getPlatformDb();
    const second = getPlatformDb();

    expect(first).toBe(second);
    expect(createPoolMock).toHaveBeenCalledTimes(1);
    expect(createPoolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: "mysql://user:pass@host/ninjaz_platform",
        connectionLimit: 4,
        waitForConnections: true,
      }),
    );
  });
});
