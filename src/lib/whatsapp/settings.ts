/**
 * Cached WhatsApp settings + notifications getters/writers (server-only).
 *
 * Mirrors src/lib/store-settings.ts pattern: 60s in-memory cache + lazy seed
 * + clear function. NOT "use server" — exports sync helpers.
 */
import "server-only";
import {
  whatsappSettings,
  whatsappNotifications,
  seedWhatsappSettings,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { seedWhatsappNotifications } from "@/lib/whatsapp/events";
import type { WhatsappNotificationRow } from "@/lib/whatsapp/types";
import { getTenantContext } from "@/lib/tenant/context";
import type { TenantDb } from "@/lib/tenant/pool-manager";

// ---------------------------------------------------------------------------
// In-memory cache — single Node process serves every tenant, so this MUST be
// keyed by tenant id (Pitfall 8 — the second concrete first-request-wins
// global cache after store-settings.ts, 24-04 W4). Mirrors that Map<tenantId,
// {value, expiresAt}> shape exactly. In single mode there is exactly one key
// ("single"), so behavior is byte-identical to the old single-value cache.
// ---------------------------------------------------------------------------
declare global {
  // eslint-disable-next-line no-var
  var __whatsappSettingsCache:
    | Map<string, { value: typeof whatsappSettings.$inferSelect; expiresAt: number }>
    | undefined;
}

const cache: Map<string, { value: typeof whatsappSettings.$inferSelect; expiresAt: number }> =
  global.__whatsappSettingsCache ?? new Map();
if (process.env.NODE_ENV !== "production") {
  global.__whatsappSettingsCache = cache;
}

const TTL_MS = 60_000;

/**
 * Cached per-tenant accessor for `whatsapp_settings`. Lazy-seeds the row on
 * first call when the table is empty. Subsequent calls within 60 seconds
 * reuse the cached value. The sender should use getWhatsappStateFresh() for
 * freshness-critical reads (connection state).
 */
export async function getWhatsappSettingsCached(
  db?: TenantDb,
): Promise<typeof whatsappSettings.$inferSelect> {
  const { tenant, db: ctxDb } = await getTenantContext();
  db ??= ctxDb;

  const now = Date.now();
  const cached = cache.get(tenant.id);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const [row] = await db
    .select()
    .from(whatsappSettings)
    .where(eq(whatsappSettings.id, "default"))
    .limit(1);

  let value: typeof whatsappSettings.$inferSelect;
  if (row) {
    value = row;
  } else {
    const seed = seedWhatsappSettings();
    await db.insert(whatsappSettings).values(seed);
    const [fresh] = await db
      .select()
      .from(whatsappSettings)
      .where(eq(whatsappSettings.id, "default"))
      .limit(1);
    if (!fresh) throw new Error("Failed to seed whatsapp_settings");
    value = fresh;
  }

  cache.set(tenant.id, { value, expiresAt: now + TTL_MS });
  return value;
}

/**
 * Invalidate the settings cache. STAYS SYNCHRONOUS (W6, mirrors W4 in
 * store-settings.ts 24-04): with an id, deletes only that tenant's entry;
 * with no id, clears every entry — in single mode there is exactly one, so
 * this is byte-identical to today's `= null`.
 */
export function clearWhatsappSettingsCache(tenantId?: string): void {
  if (tenantId) {
    cache.delete(tenantId);
  } else {
    cache.clear();
  }
}

/**
 * Read connection state FRESH (no cache). Used by the sender so it doesn't
 * send after a disconnect that happened within the 60s cache window.
 */
export async function getWhatsappStateFresh(db?: TenantDb): Promise<{
  state: "close" | "connecting" | "open";
  connectedNumber: string | null;
  notificationsEnabled: boolean;
}> {
  db ??= (await getTenantContext()).db;
  const [row] = await db
    .select({
      connectionState: whatsappSettings.connectionState,
      connectedNumber: whatsappSettings.connectedNumber,
      notificationsEnabled: whatsappSettings.notificationsEnabled,
    })
    .from(whatsappSettings)
    .where(eq(whatsappSettings.id, "default"))
    .limit(1);

  if (!row) {
    // Row doesn't exist yet — seed it lazily (first deploy)
    await db.insert(whatsappSettings).values(seedWhatsappSettings()).catch(() => {
      // ignore duplicate insert race
    });
    return { state: "close", connectedNumber: null, notificationsEnabled: false };
  }

  return {
    state: row.connectionState,
    connectedNumber: row.connectedNumber ?? null,
    notificationsEnabled: Boolean(row.notificationsEnabled),
  };
}

/**
 * Persist connection state change. Called by the webhook and QR-poll actions.
 * Only updates connectedNumber when a non-null value is passed.
 */
export async function updateWhatsappConnectionState(
  state: "close" | "connecting" | "open",
  connectedNumber?: string | null,
  opts?: { qr?: boolean },
  db?: TenantDb,
): Promise<void> {
  const { tenant, db: ctxDb } = await getTenantContext();
  db ??= ctxDb;
  const now = new Date();
  await db
    .update(whatsappSettings)
    .set({
      connectionState: state,
      ...(connectedNumber !== undefined ? { connectedNumber } : {}),
      ...(state === "open" ? { lastConnectedAt: now } : {}),
      ...(opts?.qr ? { lastQrAt: now } : {}),
    })
    .where(eq(whatsappSettings.id, "default"));
  clearWhatsappSettingsCache(tenant.id);
}

/** Update the master notifications toggle. */
export async function setNotificationsEnabled(enabled: boolean, db?: TenantDb): Promise<void> {
  const { tenant, db: ctxDb } = await getTenantContext();
  db ??= ctxDb;
  await db
    .update(whatsappSettings)
    .set({ notificationsEnabled: enabled })
    .where(eq(whatsappSettings.id, "default"));
  clearWhatsappSettingsCache(tenant.id);
}

// ---------------------------------------------------------------------------
// Notifications (no cache — read fresh; lazy seed on empty table)
// ---------------------------------------------------------------------------

/**
 * Get all notification rows. Lazy-seeds default rows when the table is empty.
 * Coerces TINYINT(1) enabled → boolean.
 */
export async function getWhatsappNotificationsAll(
  db?: TenantDb,
): Promise<WhatsappNotificationRow[]> {
  db ??= (await getTenantContext()).db;
  let rows = await db.select().from(whatsappNotifications);

  // Lazy-seed: empty table gets all defaults; a populated table gets any
  // NEWLY ADDED event keys backfilled (so new notification types ship
  // without a manual DB insert). Existing rows are never touched.
  const seeds = seedWhatsappNotifications();
  const have = new Set(rows.map((r) => r.eventKey));
  const missing = seeds.filter((s) => !have.has(s.eventKey));
  if (missing.length > 0) {
    // Ignore duplicate-key errors on concurrent first-request race.
    await db.insert(whatsappNotifications).values(missing).catch(() => {});
    rows = await db.select().from(whatsappNotifications);
  }

  return rows.map((r) => ({
    eventKey: r.eventKey,
    enabled: Boolean(r.enabled),
    template: r.template,
  }));
}

/**
 * Get a single notification row by event key. Triggers lazy seed if the
 * table is empty (same path as getWhatsappNotificationsAll).
 */
export async function getWhatsappNotification(
  eventKey: string,
  db?: TenantDb,
): Promise<WhatsappNotificationRow | null> {
  db ??= (await getTenantContext()).db;
  // Ensure table is seeded
  await getWhatsappNotificationsAll(db);

  const [row] = await db
    .select()
    .from(whatsappNotifications)
    .where(eq(whatsappNotifications.eventKey, eventKey))
    .limit(1);

  if (!row) return null;
  return {
    eventKey: row.eventKey,
    enabled: Boolean(row.enabled),
    template: row.template,
  };
}
