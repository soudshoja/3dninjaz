import "server-only";
import { db } from "@/lib/db";
import { storeSettings, seedStoreSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

// In-memory cache — single Node process. v1 deploys to a single Vercel/cPanel
// instance so this is safe (T-05-04-multi-instance accepted).
declare global {
  // eslint-disable-next-line no-var
  var __storeSettingsCache:
    | { value: StoreSettings; expiresAt: number }
    | null
    | undefined;
}

const TTL_MS = 60_000;

/**
 * Cached singleton accessor for `store_settings`. Lazy-seeds the row on first
 * call when the table is empty (so day-1 deploys don't crash if the operator
 * forgets to run a seed script). Subsequent calls within 60 seconds reuse
 * the cached value to avoid hammering the DB on hot pages (banner, footer).
 */
export async function getStoreSettingsCached(): Promise<StoreSettings> {
  const now = Date.now();
  if (
    global.__storeSettingsCache &&
    global.__storeSettingsCache.expiresAt > now
  ) {
    return global.__storeSettingsCache.value;
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

  global.__storeSettingsCache = { value, expiresAt: now + TTL_MS };
  return value;
}

/**
 * Invalidate the cache. Called by every mutation in `admin-settings.ts`
 * after a successful UPDATE.
 */
export function clearStoreSettingsCache(): void {
  global.__storeSettingsCache = null;
}

/**
 * Phase 20 (20-04) alias — same as clearStoreSettingsCache.
 * Exported under this name so Plan 20-04 bank/template writer can call it
 * without importing a "clear" function that sounds like destructive data deletion.
 */
export const invalidateStoreSettingsCache = clearStoreSettingsCache;
