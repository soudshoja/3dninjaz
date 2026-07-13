import "server-only";
import { auth, buildTenantAuth } from "@/lib/auth";
import type { Tenant } from "@/lib/tenant/platform-schema";
import type { TenantDb } from "@/lib/tenant/pool-manager";

// ============================================================================
// Phase 24 (24-02) — per-tenant Better Auth instance cache.
//
// Mirrors pool-manager.ts's getTenantDb short-circuit + hot-reload-safe
// global Map + insertion-order LRU exactly. Under TENANT_MODE=single (the
// deployed default) getTenantAuth returns the EXISTING `auth` compat shim
// (src/lib/auth.ts) untouched — zero new Better Auth instances, zero
// behavior change. Once TENANT_MODE=registry is flipped (dev-only until
// Phase 27), each tenant gets its own lazily-built, cached instance.
//
// Cache-bust TODO (Phase 26): wire a bustTenantAuthCache() call alongside
// registry.ts's bustTenantRegistry() when the super-admin panel mutates a
// tenant's domains/settings that Better Auth reads (trustedOrigins,
// baseURL). No caller wired yet — deliberately left for Phase 26.
// ============================================================================

const SINGLE_TENANT_ID = "single";
const TENANT_AUTH_MAX = Number(process.env.TENANT_POOL_MAX ?? 20);

type TenantAuthInstance = typeof auth;

// Hot-reload-safe module singleton — mirrors pool-manager.ts's
// __tenantPools pattern. Without this, `next dev` hot reloads would
// re-build every tenant's Better Auth instance on each edit.
declare global {
  // eslint-disable-next-line no-var
  var __tenantAuths: Map<string, TenantAuthInstance> | undefined;
}

const tenantAuths: Map<string, TenantAuthInstance> =
  global.__tenantAuths ?? new Map();
if (process.env.NODE_ENV !== "production") {
  global.__tenantAuths = tenantAuths;
}

/**
 * Lazy per-tenant Better Auth instance, cached by tenant id.
 *
 * Single-mode short-circuit (TENANT_MODE !== "registry", or the synthesized
 * single tenant's id): returns the EXISTING `auth` compat shim untouched —
 * byte-identical to today, no new instance built.
 */
export function getTenantAuth(tenant: Tenant, db: TenantDb): TenantAuthInstance {
  if (process.env.TENANT_MODE !== "registry" || tenant.id === SINGLE_TENANT_ID) {
    return auth;
  }

  const existing = tenantAuths.get(tenant.id);
  if (existing) {
    // Insertion-order LRU: re-insert to move this entry to the tail
    // (most-recently-used) — same pattern as pool-manager.ts.
    tenantAuths.delete(tenant.id);
    tenantAuths.set(tenant.id, existing);
    return existing;
  }

  const instance = buildTenantAuth(tenant, db);
  tenantAuths.set(tenant.id, instance);

  if (tenantAuths.size > TENANT_AUTH_MAX) {
    const oldestKey = tenantAuths.keys().next().value;
    if (oldestKey !== undefined) {
      tenantAuths.delete(oldestKey);
    }
  }

  return instance;
}

/**
 * Test/ops-only — clears every cached per-tenant instance. No production
 * caller yet (see cache-bust TODO above).
 */
export function bustTenantAuthCache(): void {
  tenantAuths.clear();
}
