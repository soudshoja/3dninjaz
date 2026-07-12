import "server-only";
import {
  mysqlTable,
  varchar,
  longtext,
  boolean,
  int,
  timestamp,
  mysqlEnum,
  unique,
} from "drizzle-orm/mysql-core";

// ============================================================================
// Phase 23 (23-01) — Platform registry schema.
//
// This is the SOURCE OF TRUTH for tenant -> DSN -> domain resolution, read
// by the pool manager, registry, and context resolver (plans 23-03/23-04).
//
// These tables live in a physically SEPARATE database (`ninjaz_platform` /
// `ninjaz_platform_dev`) from every tenant DB (ARCHITECTURE.md system
// overview, rows 66-68). They must NEVER be added to `src/lib/db/schema.ts`
// — that schema object is wired to the tenant `db` pool, and mixing platform
// tables into it risks an accidental cross-DB query through the wrong pool.
// ============================================================================

export const tenants = mysqlTable("tenants", {
  id: varchar("id", { length: 36 }).primaryKey(), // app-generated crypto.randomUUID()
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  // Full mysql:// DSN, not just a db name — lets a tenant DB relocate to
  // another server via a registry row update, never a schema change
  // (ARCHITECTURE.md component table row 139).
  dsn: varchar("dsn", { length: 512 }).notNull(),
  status: mysqlEnum("status", ["active", "suspended"]).notNull().default("active"),
  schemaVersion: int("schema_version").notNull().default(0),
  uploadsPrefix: varchar("uploads_prefix", { length: 255 }).notNull(),
  primaryDomain: varchar("primary_domain", { length: 255 }).notNull(),
  // JSON stored as LONGTEXT (MariaDB) — mysql2 returns raw strings, never
  // auto-parsed. See ensureTenantSettings below.
  settingsJson: longtext("settings_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tenantDomains = mysqlTable(
  "tenant_domains",
  {
    id: varchar("id", { length: 36 }).primaryKey(), // app-generated crypto.randomUUID()
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    // Lowercased, port-stripped at write time.
    domain: varchar("domain", { length: 255 }).notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    sslIssuedAt: timestamp("ssl_issued_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    // Collision guard — same idempotency style as uq_shipments_order.
    domainUnique: unique("uq_tenant_domains_domain").on(t.domain),
  }),
);

export type TenantRow = typeof tenants.$inferSelect;

export type TenantSettings = Record<string, unknown>;

/**
 * MariaDB stores JSON as LONGTEXT; mysql2 returns raw strings — normalise
 * at the read path so callers don't have to care.
 */
export function ensureTenantSettings(raw: unknown): TenantSettings {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as TenantSettings) : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") return raw as TenantSettings;
  return {};
}

// Normalized tenant the resolver hands to callers (settingsJson parsed).
// Plans 23-03/23-04 import this exact shape.
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  dsn: string;
  status: "active" | "suspended";
  schemaVersion: number;
  uploadsPrefix: string;
  primaryDomain: string;
  settings: TenantSettings;
}
