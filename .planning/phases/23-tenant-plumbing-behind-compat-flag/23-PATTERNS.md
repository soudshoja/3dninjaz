# Phase 23: Tenant Plumbing Behind Compat Flag - Pattern Map

**Mapped:** 2026-07-12
**Files analyzed:** 8 new/modified files (+1 docs artifact)
**Analogs found:** 7 / 8 (React `cache()` per-request memoization has no in-repo precedent — reference code supplied in ARCHITECTURE.md)

## Critical Constraint (read first)

Phase 23 builds the NEW platform-DB / registry / pool-manager machinery **alongside** the existing singleton. `src/lib/db/index.ts` keeps `export const db` fully intact — the ~70 existing call sites of `db` are untouched until Phase 24. Under `TENANT_MODE=single` (the default, and the only mode deployed), behavior must be byte-for-byte today's. Nothing in Phase 23 may import from the new `src/lib/tenant/*` modules into existing request paths.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/tenant/platform-schema.ts` (NEW — see placement note) | model (Drizzle schema) | CRUD | `src/lib/db/schema.ts` (`user` L28–53, `orderShipments` L1563–1589) | exact (style) |
| `scripts/phase23-migrate.cjs` (NEW) | migration | batch / DDL | `scripts/phase21-migrate.cjs` (whole file, 206 lines) | exact |
| `src/lib/tenant/registry.ts` (NEW) | service (in-proc TTL cache) | request-response (cached read) | `src/lib/store-settings.ts` (whole file, 89 lines) | exact |
| `src/lib/tenant/pool-manager.ts` (NEW) | service (connection infra) | request-response | `src/lib/db/index.ts` (whole file, 46 lines) | exact |
| `src/lib/tenant/context.ts` (NEW) | guard/provider (`getTenantContext()`) | request-response | `src/lib/auth-helpers.ts` L1–21 + ARCHITECTURE.md reference code | role-match |
| `src/lib/tenant/cache-tags.ts` (NEW) | utility | transform | `src/lib/catalog.ts` L347–351, L478–482 | exact |
| `src/lib/db/index.ts` (MODIFIED — additive only) | config (DB entry point) | request-response | itself | exact |
| `src/lib/tenant/*.test.ts` (NEW, vitest) | test | — | `src/lib/rate-limit.ts` L40–43 + `src/lib/config-hash.test.ts` (co-located vitest convention, vitest ^4.1.5) | role-match |
| `.planning/phases/23-…/DEPLOY-NOTES.md` (NEW, docs) | docs (ops record) | — | `.planning/phases/04-brand-launch/DEPLOY-NOTES.md` | exact (convention) |

**Placement note (planner decision):** the orchestrator scope says "schema additions to `src/lib/db/schema.ts`", but STACK.md ("Tenant registry storage") specifies the platform registry gets its **own Drizzle schema file + own tiny pool**, and ARCHITECTURE.md places it in a physically separate database (`ninjaz_platform`). Recommend a separate `src/lib/tenant/platform-schema.ts` so the tenant `db` instance's `schema` object never contains platform tables (prevents accidental cross-DB queries through the wrong pool). Either way, the table-definition *style* analog is `src/lib/db/schema.ts` below.

---

## Pattern Assignments

### `src/lib/tenant/platform-schema.ts` (model, CRUD)

**Analog:** `src/lib/db/schema.ts`

**Imports pattern** (`src/lib/db/schema.ts` lines 1–18):
```typescript
import {
  mysqlTable,
  varchar,
  char,
  text,
  mediumtext,
  longtext,
  boolean,
  int,
  decimal,
  timestamp,
  datetime,
  mysqlEnum,
  json,
  index,
  unique,
} from "drizzle-orm/mysql-core";
import { relations, sql } from "drizzle-orm";
```

**PK + timestamps + role-string pattern** (`src/lib/db/schema.ts` lines 28–37 — `user` table):
```typescript
export const user = mysqlTable("user", {
  id: varchar("id", { length: 36 }).primaryKey(),          // app-generated crypto.randomUUID()
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  role: varchar("role", { length: 32 }).notNull().default("customer"),
```

**UNIQUE-constraint-as-idempotency-guard + LONGTEXT JSON snapshot + onUpdateNow** (`src/lib/db/schema.ts` lines 1563–1589 — `orderShipments`, the analog for `tenant_domains.domain` UNIQUE):
```typescript
export const orderShipments = mysqlTable(
  "order_shipments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    orderId: varchar("order_id", { length: 36 }).notNull(),
    // ...
    // JSON — full service object from the quote at booking time.
    serviceSnapshot: longtext("service_snapshot"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    orderIdUnique: unique("uq_shipments_order").on(t.orderId),
  }),
);
```

**Apply to Phase 23 tables** (fields per ARCHITECTURE.md component table, rows 139–140):
- `tenants`: `id` varchar(36) PK (app UUID), `name`, `slug`, `dsn` (full `mysql://` DSN — NOT just db name), `status` `mysqlEnum(["active","suspended"])`, `schemaVersion` int, `uploadsPrefix`, `primaryDomain`, `settingsJson` `longtext` (+ parse helper, see Shared Patterns), `createdAt`.
- `tenant_domains`: `domain` (lowercased, port-stripped) with `unique("uq_tenant_domains_domain")` — the collision guard, same idempotency style as `uq_shipments_order`; `tenantId`, `isPrimary`, `sslIssuedAt`.

Status-enum style precedent: `mysqlEnum` is already imported; DDL-side enum example in `scripts/phase21-migrate.cjs` line 116 (`status ENUM(...) NOT NULL DEFAULT 'generating'`).

---

### `scripts/phase23-migrate.cjs` (migration, batch/DDL)

**Analog:** `scripts/phase21-migrate.cjs` — copy the whole structure. This project **never** runs `drizzle-kit push` against the remote (documented hang, CLAUDE.md MariaDB gotchas). Raw-SQL `.cjs` applicators are the only supported DDL path.

**Env loader — no dotenv-cli** (`scripts/phase21-migrate.cjs` lines 29–55):
```javascript
const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
```

**INFORMATION_SCHEMA idempotency guard** (lines 60–67):
```javascript
async function tableExists(conn, dbName, tableName) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, tableName],
  );
  return rows.length > 0;
}
```

**Charset probe — NEVER hardcode DEFAULT CHARSET** (lines 91–101):
```javascript
const [userCreateRows] = await conn.query("SHOW CREATE TABLE `user`");
const userCreateSql = userCreateRows[0]["Create Table"];
const charsetMatch = userCreateSql.match(/DEFAULT CHARSET=(\w+)/);
if (!charsetMatch) throw new Error("...Could not determine charset...");
const parentCharset = charsetMatch[1];
// ... later: ) ENGINE=InnoDB DEFAULT CHARSET=${parentCharset}
```

**Guarded CREATE + applied/skipped tracking + verification + summary** (lines 106–146, 183–197):
```javascript
if (!(await tableExists(conn, dbName, "meshy_generations"))) {
  await conn.query(`CREATE TABLE \`meshy_generations\` ( ... ) ENGINE=InnoDB DEFAULT CHARSET=${parentCharset}`);
  applied.push("meshy_generations table created");
} else {
  skipped.push("meshy_generations");
}
// ...
const [mgCreate] = await conn.query("SHOW CREATE TABLE `meshy_generations`");
console.log(mgCreate[0]["Create Table"]);   // byte-alignment audit vs Drizzle schema
// ... SUMMARY block, then:
run().catch((err) => { console.error("[phase21-migrate] FATAL:", err.message || err); process.exit(1); });
```

**Phase 23 deviations from the template (flag for the planner):**
1. **Two databases per box** — the script must create/target `ninjaz_platform_dev` (dev) and `ninjaz_platform` (prod). It should accept a `PLATFORM_DATABASE_URL` env var (added to `.env.local` per env), and may need `CREATE DATABASE IF NOT EXISTS` — which the shared app user may lack privileges for. STACK.md says DB creation goes through UAPI `Mysql::create_database` + `set_privileges_on_database` (root SSH / cpapi). Recommended split: DB creation = one-time UAPI/ops step recorded in DEPLOY-NOTES; the `.cjs` applicator assumes the empty DB exists and creates tables idempotently (re-runnable, per convention).
2. **Charset probe has no FK parent in a fresh platform DB.** Probe the *tenant* DB's `user` table (via `DATABASE_URL`) and reuse that charset for the platform tables — preserves the "read charset live, never assume" rule with the same probe target the template already uses.
3. UUID PKs are app-generated at INSERT time (`crypto.randomUUID()`), so the DDL uses plain `varchar(36)`/`CHAR(36)` PK with no DB-side default — same as the template.

---

### `src/lib/tenant/registry.ts` (service — in-proc domain→tenant TTL cache)

**Analog:** `src/lib/store-settings.ts` — this file IS the registry-cache pattern already in production: module-level TTL cache, single-Node-process rationale, explicit invalidation export.

**Cache shape + hot-reload-safe global + TTL** (`src/lib/store-settings.ts` lines 1, 21–31):
```typescript
import "server-only";
// In-memory cache — single Node process. v1 deploys to a single ... cPanel
// instance so this is safe (T-05-04-multi-instance accepted).
declare global {
  // eslint-disable-next-line no-var
  var __storeSettingsCache:
    | { value: StoreSettings; expiresAt: number }
    | null
    | undefined;
}

const TTL_MS = 60_000;
```

**TTL check → DB reload → restamp** (lines 39–74, condensed):
```typescript
export async function getStoreSettingsCached(): Promise<StoreSettings> {
  const now = Date.now();
  if (global.__storeSettingsCache && global.__storeSettingsCache.expiresAt > now) {
    return global.__storeSettingsCache.value;
  }
  const [row] = await db.select().from(storeSettings)
    .where(eq(storeSettings.id, "default")).limit(1);
  // ...
  global.__storeSettingsCache = { value, expiresAt: now + TTL_MS };
  return value;
}
```

**Explicit bust for mutations** (lines 80–89):
```typescript
export function clearStoreSettingsCache(): void {
  global.__storeSettingsCache = null;
}
export const invalidateStoreSettingsCache = clearStoreSettingsCache;
```

**Registry deltas vs the analog:** cache a `Map<domain, Tenant>` (all rows in one SELECT from the platform pool) instead of a single row; expose a **synchronous** `resolveDomain(host)` once warm plus an async warm/refresh path (ARCHITECTURE.md L141); normalize keys `host.toLowerCase().replace(/:\d+$/, "")`; export `bustTenantRegistry()` for super-admin mutations (Phase 26 consumer). In `TENANT_MODE=single`, synthesize the one-tenant registry from `DATABASE_URL` and never touch the platform DB. Module-Map-with-key pattern precedent also in `src/lib/rate-limit.ts` lines 15–17 (`const buckets = new Map<string, Bucket>()` under `import "server-only"`).

---

### `src/lib/tenant/pool-manager.ts` (service — per-tenant pools + platform singleton)

**Analog:** `src/lib/db/index.ts` — the pool construction, DSN handling, no-SSL rationale, and drizzle wrapping all copy from here.

**Pool construction from DSN + fallback + charset** (`src/lib/db/index.ts` lines 13–38):
```typescript
// SSL is intentionally NOT configured — the Node app and the MariaDB 10.11
// instance share the same cPanel host (loopback only), so TLS would add
// handshake cost for no threat-model benefit.
function buildPool(): mysql.Pool {
  const url = process.env.DATABASE_URL;
  if (url && url.startsWith("mysql://")) {
    return mysql.createPool({
      uri: url,
      connectionLimit: 10,
      waitForConnections: true,
      charset: "utf8mb4",
    });
  }
  // Fallback to discrete env vars if DATABASE_URL is missing.
  return mysql.createPool({ host: process.env.DB_HOST, /* ... */ });
}
```

**Hot-reload global + drizzle wrap** (lines 8–11, 40–46):
```typescript
declare global {
  // eslint-disable-next-line no-var
  var __mysqlPool: mysql.Pool | undefined;
}
// ...
const pool = global.__mysqlPool ?? buildPool();
if (process.env.NODE_ENV !== "production") {
  global.__mysqlPool = pool;
}
export const db = drizzle(pool, { schema, mode: "default" });
```

**Per-tenant pool config comes from research, not the analog** — the analog's `connectionLimit: 10` is explicitly the wrong number for tenant pools (STACK.md: "Keep the existing single-tenant pool's `connectionLimit: 10` habit OUT of tenant pools"). Use the STACK.md reference (STACK.md lines 48–68):
```typescript
const tenants = new Map<string, { pool: mysql.Pool; db: TenantDb }>();
function getTenantDb(tenant: Tenant): TenantDb {
  let entry = tenants.get(tenant.id);
  if (!entry) {
    const pool = mysql.createPool({
      uri: tenant.dsn,            // registry stores full DSNs
      charset: "utf8mb4",
      connectionLimit: 3,         // per-tenant burst ceiling
      maxIdle: 1,                 // idle pools decay to 1 socket...
      idleTimeout: 60_000,        // ...within 60s of inactivity
      waitForConnections: true,
    });
    entry = { pool, db: drizzle(pool, { schema, mode: "default" }) };
    tenants.set(tenant.id, entry);
  }
  return entry.db;
}
```
Platform pool = permanent singleton, `connectionLimit: 2–4`, same `buildPool()` shape against `PLATFORM_DATABASE_URL`. LRU eviction past `TENANT_POOL_MAX` (default 20) with `pool.end()` on dispose — plain Map + insertion-order eviction is sufficient at this fleet size (STACK.md: lru-cache only at ~30+ tenants). Drizzle schema objects are metadata-only and shared across all tenant instances. **Requires the mysql2 bump to ^3.22.6** (`maxIdle`/`idleTimeout` cleanup fixes — STACK.md).

---

### `src/lib/tenant/context.ts` (guard/provider — `getTenantContext()`)

**Analog:** `src/lib/auth-helpers.ts` (the guard idiom this module must be shaped to slot under in Phase 24) + ARCHITECTURE.md reference code (no in-repo `React.cache()` precedent — see No Analog Found).

**Guard idiom being extended** (`src/lib/auth-helpers.ts` lines 1–6, 14–21):
```typescript
import "server-only";
import { headers } from "next/headers";
// ...
/**
 * ... middleware-only protection was bypassable via CVE-2025-29927,
 * so we verify the session role on every handler.
 */
export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userWithRole = session?.user as unknown as { role: string } | undefined;
  if (!session || userWithRole?.role !== "admin") {
    throw new Error("Forbidden");
  }
  return session;
}
```

**Target shape** (ARCHITECTURE.md lines 101–118 — copy verbatim as the skeleton):
```typescript
// src/lib/tenant/context.ts
import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveDomain } from "./registry";
import { getTenantDb } from "./pool-manager";

export const getTenantContext = cache(async () => {
  const h = await headers();
  const host = (h.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  const tenant = resolveDomain(host);           // sync once cache is warm
  if (!tenant) notFound();                      // NEVER fall back to a default tenant
  if (tenant.status === "suspended") throw new TenantSuspendedError(tenant.id); // → 503
  return { tenant, db: getTenantDb(tenant) };
});
```
Phase 23 scope notes: the `auth` member of the context (per-tenant Better Auth) is **Phase 24** — keep the return type extensible (`{ tenant, db }` now; Phase 24 adds `auth`). In `TENANT_MODE=single` the resolver returns the synthesized tenant regardless of Host — today's behavior. In multi mode (dev only, success criterion 2): unknown host → hard `notFound()`, suspended → 503-class error; **never** a default-tenant fallback (ARCHITECTURE.md anti-pattern 2). Do not touch `src/middleware.ts` — it keeps maintenance mode only and gains no trust responsibilities.

---

### `src/lib/tenant/cache-tags.ts` (utility — tenant-prefixed cache keys/tags)

**Analog:** `src/lib/catalog.ts` — the repo's one `unstable_cache` + tag pattern, plus its documented cross-route quirk.

**Tag constant + rationale comment** (`src/lib/catalog.ts` lines 347–351):
```typescript
// Cache tag for the nav category tree. Admin product/category mutations call
// `revalidateTag(CATEGORY_TREE_TAG)` so every store route picks up the new
// tree on next render — `revalidatePath('/', 'layout')` only busts `/` itself,
// leaving /shop, /products/*, /about, etc. rendering a stale (store) layout.
export const CATEGORY_TREE_TAG = "nav-category-tree";
```

**unstable_cache wrapper** (lines 478–482):
```typescript
export const getActiveCategoryTree = unstable_cache(
  getActiveCategoryTreeUncached,
  ["nav-category-tree"],
  { tags: [CATEGORY_TREE_TAG] },
);
```

**Bust call-site convention** (`src/actions/categories.ts` line 99 and 8 siblings; `src/actions/products.ts` lines 495, 701–738, 1130):
```typescript
revalidateTag(CATEGORY_TREE_TAG);
```

**Phase 23 helper contract** (success criterion 5 — lands BEFORE any consumer so partial prefixing is impossible):
```typescript
// t:<tenantId>:<tag> — every unstable_cache key AND tag must flow through these.
export function tenantTag(tenantId: string, tag: string): string;
export function tenantCacheKey(tenantId: string, ...parts: string[]): string[];
```
In `TENANT_MODE=single` the synthesized tenant still gets a real id so keys are prefixed identically in both modes (no key-format fork between modes). Existing `CATEGORY_TREE_TAG` call sites migrate in Phase 24 with the sweep — do not touch them in Phase 23.

---

### `src/lib/db/index.ts` (MODIFIED — additive only)

**Analog:** itself. Phase 23 changes are strictly additive:
- KEEP `export const db` and `export { pool }` byte-for-byte (lines 40–46) — Phase 24 dissolves them, not Phase 23.
- ADD `platformDb` singleton (same `buildPool()` shape against `PLATFORM_DATABASE_URL`, `connectionLimit: 2–4`, own `declare global` slot for hot-reload, no SSL per the existing comment lines 13–15) — or re-export it from `src/lib/tenant/pool-manager.ts`.
- ADD the `TENANT_MODE` read (default `"single"`). In single mode the tenant machinery synthesizes one tenant from `DATABASE_URL` and may **reuse the existing singleton pool as that tenant's pool** — zero new connections, zero behavior change.
- The platform pool must be lazy or tolerate `PLATFORM_DATABASE_URL` being unset in single mode — dev/CI machines without the platform DB must still boot (CI build currently executes DB queries at build time via the SSH tunnel; do not add a second hard DB dependency to the build).

---

### `src/lib/tenant/*.test.ts` (test)

**Analog:** vitest ^4.1.5 (package.json line 62), co-located `*.test.ts` convention (`src/lib/config-hash.test.ts`, `src/lib/config-fields.test.ts`, `src/lib/__tests__/`). Test-reset export pattern (`src/lib/rate-limit.ts` lines 40–43):
```typescript
/** Test-only — clears all buckets so tests can run deterministically. */
export function _resetRateLimitForTests(): void {
  buckets.clear();
}
```
Registry and pool-manager should export the same style of `_resetForTests()` hooks (clear Map, end pools) so host-resolution, TTL-expiry, unknown-host-404, and single-mode-synthesis cases are unit-testable without a live DB (inject rows / fake DSNs).

---

## Shared Patterns

### `import "server-only"` first line
**Source:** `src/lib/auth-helpers.ts:1`, `src/lib/rate-limit.ts:1`, `src/lib/store-settings.ts:1`
**Apply to:** every `src/lib/tenant/*.ts` module. These modules hold DSNs and pools — a client-bundle import must be a build error.

### App-generated UUID PKs — `crypto.randomUUID()` on INSERT
**Source:** convention documented in `src/lib/db/schema.ts` lines 1606–1608; live call site `src/actions/payment-links.ts:309` (`const proofId = crypto.randomUUID();`)
**Apply to:** `tenants.id`, `tenant_domains.id` inserts (Phase 25/26 consumers, but the schema must assume it now). Never `$returningId()` or SQL `UUID()`.

### JSON-as-LONGTEXT parse helper
**Source:** `src/lib/catalog.ts` lines 33–40:
```typescript
/**
 * MariaDB stores JSON as LONGTEXT; mysql2 returns raw strings. Normalise
 * images back to string[] at the read path so callers don't have to care.
 */
function ensureImagesArray(raw: unknown): string[] { ... }
```
**Apply to:** `tenants.settingsJson` — ship an `ensureTenantSettings(raw)` parse helper next to the schema; every read site goes through it. mysql2 does NOT auto-parse.

### Hot-reload-safe module singletons
**Source:** `src/lib/db/index.ts` lines 8–11 + 40–43; `src/lib/store-settings.ts` lines 23–29 (`declare global { var __x }`, stamp only when `NODE_ENV !== "production"` for pools; always for caches)
**Apply to:** platform pool, tenant pool Map, registry cache — otherwise `next dev` hot-reloads exhaust the cPanel connection limit (the exact incident the existing comment records).

### Idempotent raw-SQL migration discipline
**Source:** `scripts/phase21-migrate.cjs` (whole file)
**Apply to:** `scripts/phase23-migrate.cjs`. Never `drizzle-kit push`; INFORMATION_SCHEMA guards on every mutation; charset probed live; `SHOW CREATE TABLE` verification output; applied/skipped summary; `process.exit(1)` on fatal.

### Hard-fail on unresolvable tenant — no default fallback
**Source:** ARCHITECTURE.md anti-patterns 1–2 (and the repo's CVE-2025-29927 first-`await` discipline in `src/lib/auth-helpers.ts` doc comments)
**Apply to:** `registry.ts` + `context.ts`. Unknown host → `notFound()`; suspended → 503; middleware never trusted for tenant identity; no `x-tenant-id` header trust.

### DEPLOY-NOTES ops record
**Source:** `.planning/phases/04-brand-launch/DEPLOY-NOTES.md` convention (referenced in CLAUDE.md deploy topology)
**Apply to:** success criterion 4 — record `SHOW VARIABLES LIKE 'max_connections'` output from the box + the fleet connection budget math (platform 4 + N×3 tenant pools × 2 processes) in this phase's DEPLOY-NOTES.

---

## No Analog Found

Files/patterns with no close match in the codebase (planner should use RESEARCH.md/ARCHITECTURE.md patterns instead):

| File / Pattern | Role | Data Flow | Reason |
|----------------|------|-----------|--------|
| `React.cache()` per-request memoization in `context.ts` | provider | request-response | `import { cache } from "react"` appears nowhere in `src/` — first use. Copy the ARCHITECTURE.md reference shape (lines 101–118) verbatim. Route handlers re-resolve (cheap map hit); RSC + server actions share the memo. |
| LRU pool eviction (`TENANT_POOL_MAX`) | service | — | No eviction pattern exists in-repo. STACK.md: plain Map + mysql2 idle-shrink suffices at this fleet size; add insertion-order eviction with `pool.end()` on dispose; `lru-cache@^11.5.2` only if fleet outgrows ~30 tenants. |

## Metadata

**Analog search scope:** `src/lib/**`, `src/lib/db/**`, `src/actions/**`, `scripts/**`, `.planning/research/**`, `.planning/ROADMAP.md`
**Files scanned:** ~15 read/grepped (targeted reads on `schema.ts` 2,386 lines and `catalog.ts` via grep-then-offset)
**Pattern extraction date:** 2026-07-12
**Version pins from research:** mysql2 ^3.22.6 (bump required for `maxIdle`/`idleTimeout` reliability), drizzle-orm ^0.45.2 (stay), better-auth ^1.6.23 (bump lands with Phase 24, not needed here)
