import "server-only";
import { getPlatformDb } from "@/lib/tenant/pool-manager";
import { TENANT_MODE } from "@/lib/db";
import {
  tenants,
  tenantDomains,
  ensureTenantSettings,
  type Tenant,
} from "@/lib/tenant/platform-schema";

// ============================================================================
// Phase 23 (23-04) — in-process domain -> tenant registry cache.
//
// This is the tenant-isolation trust boundary the whole platform depends on
// (TEN-03): resolveDomain(host) NEVER returns a default/first tenant on a
// miss — an unrecognized Host must fail closed (null -> caller 404s, see
// context.ts). A failed load must NOT stamp a fallback either — a bad read
// from the platform DB leaves the cache exactly as it was (cold on first
// boot), so resolveDomain keeps returning null rather than serving stale or
// default data. See PITFALLS.md Pitfall 4 / ARCHITECTURE.md anti-pattern 2.
//
// Analog: src/lib/store-settings.ts (module-level TTL cache, single Node
// process, explicit bust). Deltas here: cache a Map<domain, Tenant> loaded
// in one pass instead of a single row; expose a SYNCHRONOUS resolveDomain()
// once warm, plus an async warmRegistry()/loadRegistry() pair; and — under
// TENANT_MODE=single (the deployed default) — synthesize exactly one tenant
// from DATABASE_URL, ignore Host entirely, and never touch the platform DB.
// ============================================================================

const TTL_MS = 60_000;
const SINGLE_TENANT_ID = "single";

interface RegistryCache {
  map: Map<string, Tenant>;
  // Set only in TENANT_MODE=single — when present, resolveDomain returns
  // this tenant for ANY host (today's behavior). Never set in registry mode.
  singleTenant: Tenant | null;
  expiresAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __tenantRegistry: RegistryCache | null | undefined;
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/:\d+$/, "");
}

function synthesizeSingleTenant(): Tenant {
  return {
    id: SINGLE_TENANT_ID,
    name: "single",
    slug: "single",
    dsn: process.env.DATABASE_URL ?? "",
    status: "active",
    schemaVersion: 0,
    uploadsPrefix: "products",
    primaryDomain: process.env.TENANT_SINGLE_DOMAIN ?? "localhost",
    settings: {},
  };
}

async function loadRegistry(): Promise<{
  map: Map<string, Tenant>;
  singleTenant: Tenant | null;
}> {
  if (TENANT_MODE !== "registry") {
    // Compat flag off (or unset) — never touch the platform DB.
    return { map: new Map(), singleTenant: synthesizeSingleTenant() };
  }

  // Registry mode — one SELECT per table, hydrate + join in memory (NO
  // LATERAL joins; MariaDB 10.11 has none — manual multi-query hydration
  // per CLAUDE.md).
  const pdb = getPlatformDb();
  const tenantRows = await pdb.select().from(tenants);
  const domainRows = await pdb.select().from(tenantDomains);

  const byId = new Map<string, Tenant>();
  for (const row of tenantRows) {
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      slug: row.slug,
      dsn: row.dsn,
      status: row.status,
      schemaVersion: row.schemaVersion,
      uploadsPrefix: row.uploadsPrefix,
      primaryDomain: row.primaryDomain,
      settings: ensureTenantSettings(row.settingsJson),
    });
  }

  const map = new Map<string, Tenant>();
  for (const domainRow of domainRows) {
    const tenant = byId.get(domainRow.tenantId);
    // Orphaned domain row (no matching tenant) — ignore it. NEVER synthesize
    // a tenant from a domain row alone.
    if (!tenant) continue;
    map.set(normalizeHost(domainRow.domain), tenant);
  }

  return { map, singleTenant: null };
}

/**
 * Sync resolver — call after `warmRegistry()`. Returns `null` on ANY miss
 * (unknown host, cold/expired cache never warmed, or a failed prior load).
 * NEVER returns a first/default entry as a fallback — that is the TEN-03
 * trust boundary this module exists to hold.
 */
export function resolveDomain(host: string): Tenant | null {
  const cache = global.__tenantRegistry;
  if (!cache) return null; // cold — caller must call warmRegistry() first
  if (cache.singleTenant) return cache.singleTenant; // TENANT_MODE=single: Host ignored
  const normalized = normalizeHost(host);
  return cache.map.get(normalized) ?? null;
}

/**
 * Loads/refreshes the registry if the cache is cold or past TTL_MS. On a
 * failed load, the previous (or, on first boot, absent) cache is left
 * untouched — no fallback is ever stamped, so resolveDomain keeps failing
 * closed rather than serving stale/default data.
 */
export async function warmRegistry(): Promise<void> {
  const now = Date.now();
  if (global.__tenantRegistry && global.__tenantRegistry.expiresAt > now) {
    return; // still warm
  }
  const { map, singleTenant } = await loadRegistry();
  global.__tenantRegistry = { map, singleTenant, expiresAt: now + TTL_MS };
}

/**
 * Super-admin mutation hook (Phase 26 consumer) — invalidates the cache so
 * the next resolveDomain() call is served from a fresh warmRegistry() load.
 */
export function bustTenantRegistry(): void {
  global.__tenantRegistry = null;
}

/**
 * Test-only — stamps a fresh, non-expiring cache from `seed` (keyed by each
 * tenant's primaryDomain), or nulls the cache entirely when no seed is
 * given. Lets registry.test.ts and context.test.ts exercise host resolution
 * deterministically without a live platform DB.
 */
export function _resetForTests(seed?: Tenant[]): void {
  if (!seed) {
    global.__tenantRegistry = null;
    return;
  }
  const map = new Map<string, Tenant>();
  for (const tenant of seed) {
    map.set(normalizeHost(tenant.primaryDomain), tenant);
  }
  global.__tenantRegistry = {
    map,
    singleTenant: null,
    expiresAt: Number.MAX_SAFE_INTEGER,
  };
}
