import "server-only";
import { storeSettings, seedStoreSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getTenantContext } from "@/lib/tenant/context";
import type { TenantDb } from "@/lib/tenant/pool-manager";

/**
 * Full settings row inferred from Drizzle schema.
 *
 * Phase 20 (20-04) — 4 new nullable fields ride the existing 60s cache:
 *   bankName            — bank display name (e.g. "Maybank")
 *   bankAccountNumber   — account number shown on draft page
 *   bankAccountHolder   — registered account holder name
 *   draftLinkTemplate   — Mustache-style body for WhatsApp/email deeplinks
 *
 * D-16: if bankName / bankAccountNumber / bankAccountHolder is NULL/empty the
 * Bank Transfer card is hidden on the customer draft page (server guard).
 * D-18: draftLinkTemplate supports {{customer_name}}, {{link}} placeholders.
 */
export type StoreSettings = typeof storeSettings.$inferSelect;

// In-memory cache — single Node process serves every tenant, so this MUST be
// keyed by tenant id (Pitfall 8 — an unkeyed process-global cache is a
// cross-tenant read). Mirrors src/lib/tenant/registry.ts's Map-with-TTL
// shape and src/lib/tenant/pool-manager.ts's hot-reload guard. In single
// mode there is exactly one key ("single"), so behavior is byte-identical
// to the old single-value cache.
declare global {
  // eslint-disable-next-line no-var
  var __storeSettingsCache:
    | Map<string, { value: StoreSettings; expiresAt: number }>
    | undefined;
}

const cache: Map<string, { value: StoreSettings; expiresAt: number }> =
  global.__storeSettingsCache ?? new Map();
if (process.env.NODE_ENV !== "production") {
  global.__storeSettingsCache = cache;
}

const TTL_MS = 60_000;

/**
 * Cached per-tenant accessor for `store_settings`. Lazy-seeds the row on
 * first call when the table is empty (so day-1 deploys don't crash if the
 * operator forgets to run a seed script). Subsequent calls within 60
 * seconds reuse the cached value to avoid hammering the DB on hot pages
 * (banner, footer).
 *
 * Request callers pass nothing — tenant + db resolve via getTenantContext().
 * Non-request callers (scripts/crons) pass an explicit ctx so they don't
 * need a request-scoped headers() call.
 */
export async function getStoreSettingsCached(
  ctx?: { db: TenantDb; tenantId: string },
): Promise<StoreSettings> {
  let db: TenantDb;
  let tenantId: string;
  if (ctx) {
    db = ctx.db;
    tenantId = ctx.tenantId;
  } else {
    const resolved = await getTenantContext();
    db = resolved.db;
    tenantId = resolved.tenant.id;
  }

  const now = Date.now();
  const cached = cache.get(tenantId);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const [row] = await db
    .select()
    .from(storeSettings)
    .where(eq(storeSettings.id, "default"))
    .limit(1);

  let value: StoreSettings;
  if (row) {
    value = row;
  } else {
    // Seed on first read
    const seed = seedStoreSettings();
    await db.insert(storeSettings).values(seed);
    const [fresh] = await db
      .select()
      .from(storeSettings)
      .where(eq(storeSettings.id, "default"))
      .limit(1);
    if (!fresh) {
      throw new Error("Failed to seed store_settings");
    }
    value = fresh;
  }

  cache.set(tenantId, { value, expiresAt: now + TTL_MS });
  return value;
}

/**
 * Invalidate the cache. Called by every mutation in `admin-settings.ts`
 * after a successful UPDATE.
 *
 * W4 (locked, 24-04 plan): stays SYNCHRONOUS — resolving tenant.id here
 * would require an async signature, creating a floating-promise cache-bust
 * class at mutation call sites (PR #39 precedent). Request-context callers
 * already hold `tenant.id` from their own guard/context resolve and pass it
 * explicitly.
 *
 * With an id: deletes only that tenant's entry. With no id: clears every
 * entry — in single mode there is exactly one, so this is byte-identical to
 * today's `= null`; in registry mode a no-id clear over-invalidates every
 * tenant's cache (a cache MISS, not a data leak) — flagged as a Phase-25
 * perf follow-up once 24-07 sweeps the mutation call sites to pass
 * tenant.id explicitly.
 */
export function clearStoreSettingsCache(tenantId?: string): void {
  if (tenantId) {
    cache.delete(tenantId);
  } else {
    cache.clear();
  }
}

/**
 * Phase 20 (20-04) alias — same as clearStoreSettingsCache.
 * Exported under this name so Plan 20-04 bank/template writer can call it
 * without importing a "clear" function that sounds like destructive data deletion.
 */
export const invalidateStoreSettingsCache = clearStoreSettingsCache;
