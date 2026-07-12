/**
 * Phase 23 (23-04) — tests for the tenant registry TTL cache.
 * Run: npx vitest run src/lib/tenant/registry.test.ts
 *
 * "server-only" is mocked the same way pool-manager.test.ts does (the real
 * package throws outside a webpack/RSC build). @/lib/db is mocked so
 * TENANT_MODE is test-controllable and importing this file never triggers
 * the real db/index.ts's eager mysql2 pool creation. @/lib/tenant/pool-manager
 * is mocked so getPlatformDb never touches a live DB. platform-schema.ts is
 * imported for REAL — it's pure Drizzle table metadata (tenants,
 * tenantDomains, ensureTenantSettings), no DB connection happens at import
 * time, and using the real table objects lets us assert registry.ts queries
 * the exact tables we expect.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const { tenantModeState, selectMock, getPlatformDbMock } = vi.hoisted(() => {
  const tenantModeState = { value: "registry" as "single" | "registry" };
  const selectMock = vi.fn();
  const getPlatformDbMock = vi.fn(() => ({ select: selectMock }));
  return { tenantModeState, selectMock, getPlatformDbMock };
});

vi.mock("@/lib/db", () => ({
  get TENANT_MODE() {
    return tenantModeState.value;
  },
}));

vi.mock("@/lib/tenant/pool-manager", () => ({
  getPlatformDb: (...args: unknown[]) => getPlatformDbMock(...args),
}));

import {
  resolveDomain,
  warmRegistry,
  bustTenantRegistry,
  _resetForTests,
} from "./registry";
import { tenants, tenantDomains } from "@/lib/tenant/platform-schema";
import type { TenantRow, Tenant } from "@/lib/tenant/platform-schema";

type DomainRow = {
  id: string;
  tenantId: string;
  domain: string;
  isPrimary: boolean;
  sslIssuedAt: Date | null;
  createdAt: Date;
};

function makeTenantRow(overrides: Partial<TenantRow> = {}): TenantRow {
  return {
    id: "t1",
    name: "Shop",
    slug: "shop",
    dsn: "mysql://tenant1/db",
    status: "active",
    schemaVersion: 1,
    uploadsPrefix: "uploads/shop",
    primaryDomain: "shop.example.com",
    settingsJson: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeDomainRow(
  tenantId: string,
  domain: string,
  overrides: Partial<DomainRow> = {},
): DomainRow {
  return {
    id: `${tenantId}-${domain}`,
    tenantId,
    domain,
    isPrimary: true,
    sslIssuedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Wires selectMock to serve exactly ONE warmRegistry() load: registry.ts's
 * loadRegistry() calls `pdb.select().from(tenants)` then
 * `pdb.select().from(tenantDomains)`, sequentially awaited, in that order.
 */
function queueLoad(tenantRows: TenantRow[], domainRows: DomainRow[]) {
  selectMock
    .mockImplementationOnce(() => ({
      from: (table: unknown) => {
        expect(table).toBe(tenants);
        return Promise.resolve(tenantRows);
      },
    }))
    .mockImplementationOnce(() => ({
      from: (table: unknown) => {
        expect(table).toBe(tenantDomains);
        return Promise.resolve(domainRows);
      },
    }));
}

function queueFailure(err: Error) {
  selectMock.mockImplementationOnce(() => ({
    from: () => Promise.reject(err),
  }));
}

beforeEach(() => {
  tenantModeState.value = "registry";
  selectMock.mockReset();
  getPlatformDbMock.mockClear();
  _resetForTests();
  delete process.env.DATABASE_URL;
  delete process.env.TENANT_SINGLE_DOMAIN;
});

afterEach(() => {
  _resetForTests();
  vi.useRealTimers();
});

describe("resolveDomain — registry mode", () => {
  it("returns the seeded tenant when the domain is registered", async () => {
    queueLoad([makeTenantRow()], [makeDomainRow("t1", "shop.example.com")]);
    await warmRegistry();

    const tenant = resolveDomain("shop.example.com");
    expect(tenant).not.toBeNull();
    expect(tenant?.id).toBe("t1");
  });

  it("normalizes case + port — SHOP.Example.com:3000 hits the same entry as shop.example.com", async () => {
    queueLoad([makeTenantRow()], [makeDomainRow("t1", "shop.example.com")]);
    await warmRegistry();

    const tenant = resolveDomain("SHOP.Example.com:3000");
    expect(tenant?.id).toBe("t1");
  });

  it("returns null for an unregistered host — fail closed, never a default tenant", async () => {
    queueLoad([makeTenantRow()], [makeDomainRow("t1", "shop.example.com")]);
    await warmRegistry();

    expect(resolveDomain("unknown.test")).toBeNull();
  });

  it("ignores orphaned domain rows (tenantId with no matching tenant row) instead of synthesizing a tenant", async () => {
    queueLoad([makeTenantRow()], [makeDomainRow("does-not-exist", "ghost.example.com")]);
    await warmRegistry();

    expect(resolveDomain("ghost.example.com")).toBeNull();
  });

  it("does not populate a fallback tenant when the platform DB load fails", async () => {
    queueFailure(new Error("connection refused"));

    await expect(warmRegistry()).rejects.toThrow("connection refused");
    expect(resolveDomain("shop.example.com")).toBeNull();
  });
});

describe("TTL + bust", () => {
  it("serves from cache while unexpired, reloads from the platform DB after TTL expiry", async () => {
    vi.useFakeTimers();
    queueLoad([makeTenantRow()], [makeDomainRow("t1", "shop.example.com")]);
    await warmRegistry();
    expect(getPlatformDbMock).toHaveBeenCalledTimes(1);

    // Still within TTL — warming again must NOT reload.
    vi.advanceTimersByTime(30_000);
    await warmRegistry();
    expect(getPlatformDbMock).toHaveBeenCalledTimes(1);
    expect(resolveDomain("shop.example.com")?.id).toBe("t1");

    // Past TTL — next warm reloads.
    queueLoad(
      [makeTenantRow({ id: "t1-v2" })],
      [makeDomainRow("t1-v2", "shop.example.com")],
    );
    vi.advanceTimersByTime(31_000);
    await warmRegistry();
    expect(getPlatformDbMock).toHaveBeenCalledTimes(2);
    expect(resolveDomain("shop.example.com")?.id).toBe("t1-v2");
  });

  it("bustTenantRegistry() forces the next resolveDomain to be served from a fresh load", async () => {
    queueLoad([makeTenantRow()], [makeDomainRow("t1", "shop.example.com")]);
    await warmRegistry();
    expect(resolveDomain("shop.example.com")?.id).toBe("t1");

    bustTenantRegistry();
    expect(resolveDomain("shop.example.com")).toBeNull(); // cold until re-warmed

    queueLoad(
      [makeTenantRow({ id: "t1-v3" })],
      [makeDomainRow("t1-v3", "shop.example.com")],
    );
    await warmRegistry();
    expect(getPlatformDbMock).toHaveBeenCalledTimes(2);
    expect(resolveDomain("shop.example.com")?.id).toBe("t1-v3");
  });
});

describe("single-mode synthesis (TENANT_MODE=single)", () => {
  beforeEach(() => {
    tenantModeState.value = "single";
    process.env.DATABASE_URL = "mysql://single-db/app";
  });

  it("synthesizes exactly one tenant from DATABASE_URL and never touches the platform DB", async () => {
    await warmRegistry();
    expect(getPlatformDbMock).not.toHaveBeenCalled();

    const tenant = resolveDomain("anything.at.all");
    expect(tenant).not.toBeNull();
    expect(tenant?.id).toBe("single");
    expect(tenant?.dsn).toBe("mysql://single-db/app");
    expect(tenant?.status).toBe("active");
  });

  it("returns the SAME single tenant for ANY host — Host is ignored", async () => {
    await warmRegistry();
    expect(resolveDomain("a.example.com")?.id).toBe("single");
    expect(resolveDomain("totally-different.example.com")?.id).toBe("single");
    expect(resolveDomain("")?.id).toBe("single");
  });

  it("defaults to single-mode synthesis when TENANT_MODE is anything other than 'registry'", async () => {
    // Mirrors db/index.ts's own default: unset/unknown TENANT_MODE = single.
    // @ts-expect-error — intentionally testing an out-of-union runtime value.
    tenantModeState.value = undefined;
    await warmRegistry();
    expect(getPlatformDbMock).not.toHaveBeenCalled();
    expect(resolveDomain("whatever.example.com")?.id).toBe("single");
  });
});

describe("_resetForTests", () => {
  it("seeds a warm, non-expiring cache keyed by primaryDomain", () => {
    const tenant: Tenant = {
      id: "seed-1",
      name: "Seed",
      slug: "seed",
      dsn: "mysql://seed/db",
      status: "active",
      schemaVersion: 1,
      uploadsPrefix: "uploads/seed",
      primaryDomain: "seed.example.com",
      settings: {},
    };
    _resetForTests([tenant]);

    expect(resolveDomain("seed.example.com")).toEqual(tenant);
    expect(getPlatformDbMock).not.toHaveBeenCalled();
  });

  it("with no seed, nulls the cache so resolveDomain returns null until re-warmed", () => {
    _resetForTests();
    expect(resolveDomain("shop.example.com")).toBeNull();
  });
});
