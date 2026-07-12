import "server-only";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "@/lib/db/schema";
import * as platformSchema from "@/lib/tenant/platform-schema";
import type { Tenant } from "@/lib/tenant/platform-schema";
import { db as singletonDb } from "@/lib/db";

// ============================================================================
// Phase 23 (23-03) — Per-tenant connection-pool manager.
//
// Under TENANT_MODE=single (the deployed default) getTenantDb reuses today's
// single src/lib/db pool — zero new connections, zero behavior change. Once
// TENANT_MODE=registry is flipped (dev-only until Phase 27), each tenant gets
// its own lazily-created mysql2 pool, capped hard by the STACK.md-verified
// tenant-pool values below — a much smaller ceiling than the existing
// singleton's per-pool connection cap, deliberately kept OUT of tenant pools
// — and bounded fleet-wide by an insertion-order LRU cap (TENANT_POOL_MAX).
// See PITFALLS.md Pitfall 2: reusing the singleton's larger per-pool cap for
// every tenant pool exhausts MariaDB's ~151 connections at ~15 tenants and
// takes down the whole fleet.
// ============================================================================

type TenantDb = MySql2Database<typeof schema>;
type PlatformDb = MySql2Database<typeof platformSchema>;

const SINGLE_TENANT_ID = "single";
const TENANT_POOL_MAX = Number(process.env.TENANT_POOL_MAX ?? 20);

// Hot-reload-safe module singletons — mirrors src/lib/db/index.ts lines 8-11,
// 40-43. Without this, `next dev` hot reloads would re-create every tenant
// pool on each edit and exhaust the cPanel connection limit.
declare global {
  // eslint-disable-next-line no-var
  var __tenantPools: Map<string, { pool: mysql.Pool; db: TenantDb }> | undefined;
  // eslint-disable-next-line no-var
  var __platformPool: { pool: mysql.Pool; db: PlatformDb } | undefined;
}

const tenantPools: Map<string, { pool: mysql.Pool; db: TenantDb }> =
  global.__tenantPools ?? new Map();
if (process.env.NODE_ENV !== "production") {
  global.__tenantPools = tenantPools;
}

/**
 * Lazy per-tenant Drizzle instance, backed by a per-tenant mysql2 pool.
 *
 * Single-mode short-circuit (TENANT_MODE !== "registry", or the synthesized
 * single tenant's id): returns the EXISTING src/lib/db singleton untouched —
 * no pool is created, no behavior changes from today.
 */
export function getTenantDb(tenant: Tenant): TenantDb {
  if (process.env.TENANT_MODE !== "registry" || tenant.id === SINGLE_TENANT_ID) {
    return singletonDb;
  }

  const existing = tenantPools.get(tenant.id);
  if (existing) {
    // Insertion-order LRU: re-insert to move this entry to the tail
    // (most-recently-used). Plain Map suffices at this fleet size — swap for
    // lru-cache only past ~30 tenants (STACK.md).
    tenantPools.delete(tenant.id);
    tenantPools.set(tenant.id, existing);
    return existing.db;
  }

  const pool = mysql.createPool({
    uri: tenant.dsn,
    charset: "utf8mb4",
    connectionLimit: 3,
    maxIdle: 1,
    idleTimeout: 60_000,
    waitForConnections: true,
  });
  const entry = { pool, db: drizzle(pool, { schema, mode: "default" as const }) };
  tenantPools.set(tenant.id, entry);

  if (tenantPools.size > TENANT_POOL_MAX) {
    const oldestKey = tenantPools.keys().next().value;
    if (oldestKey !== undefined) {
      const oldest = tenantPools.get(oldestKey);
      tenantPools.delete(oldestKey);
      if (oldest) void oldest.pool.end();
    }
  }

  return entry.db;
}

/**
 * Permanent singleton against PLATFORM_DATABASE_URL (connectionLimit: 4).
 * Lazy on purpose — single-mode dev/CI machines (and the CI build, which
 * runs DB queries at build time) have no platform DB and must still boot.
 * Nothing at module scope calls this.
 */
export function getPlatformDb(): PlatformDb {
  if (!global.__platformPool) {
    const uri = process.env.PLATFORM_DATABASE_URL;
    if (!uri) {
      throw new Error(
        "PLATFORM_DATABASE_URL not set — required in TENANT_MODE=registry",
      );
    }
    const pool = mysql.createPool({
      uri,
      charset: "utf8mb4",
      connectionLimit: 4,
      waitForConnections: true,
    });
    global.__platformPool = {
      pool,
      db: drizzle(pool, { schema: platformSchema, mode: "default" as const }),
    };
  }
  return global.__platformPool.db;
}

/** Ends and evicts a single tenant's pool (e.g. tenant suspended/offboarded). */
export async function disposeTenantPool(tenantId: string): Promise<void> {
  const entry = tenantPools.get(tenantId);
  if (entry) {
    tenantPools.delete(tenantId);
    await entry.pool.end();
  }
}

/** Test-only — ends every live pool and clears both module singletons. */
export function _resetForTests(): void {
  for (const entry of tenantPools.values()) {
    void entry.pool.end();
  }
  tenantPools.clear();
  global.__platformPool = undefined;
}
