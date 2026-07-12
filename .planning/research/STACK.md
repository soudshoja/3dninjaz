# Stack Research

**Domain:** Multi-tenant platform pivot — database-per-tenant + custom-domain-per-tenant on self-hosted cPanel/MariaDB (v2.0 milestone)
**Researched:** 2026-07-12
**Confidence:** HIGH (package versions verified against npm registry directly; Next.js/Better Auth capabilities verified against official docs; cPanel API surface verified against vendor + community docs — MEDIUM on exact AutoSSL-behind-proxy behavior, needs one smoke test on the real box)

> Supersedes the 2026-04-12 v1 stack research (which predated the MariaDB/cPanel pivot). This document covers ONLY the additions/changes needed for multi-tenancy. The existing single-tenant stack (Next.js 15.5.15, Drizzle 0.45.2, mysql2, Better Auth 1.6.x, MariaDB 10.11 on cPanel) is validated and stays.

## Headline Finding

**Multi-tenancy on this hosting reality is a patterns-and-provisioning problem, not a packages problem.** Almost nothing new gets installed. The work is: (1) retire the singleton `export const db` in `src/lib/db/index.ts` in favor of per-tenant pool + Drizzle instance caching, (2) a thin host-header resolution layer, (3) scripted cPanel provisioning (addon domain + DB + AutoSSL) over the root-SSH/UAPI access that already exists, (4) a small platform registry database. Every "multi-tenant SaaS stack" tutorial assumes Vercel + Neon/PlanetScale + Cloudflare — none of that applies here, and the single-Node-process deployment actually makes several hard problems (cache invalidation, connection budgeting) trivially easy.

## Recommended Stack

### Core Technologies (changes/additions only)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| mysql2 | ^3.22.6 (bump from ^3.11.0) | Per-tenant connection pools | Latest verified on npm 2026-07-12. Pool options `maxIdle` + `idleTimeout` (default 60s) are the entire answer to "pool explosion": idle tenant pools shrink toward `maxIdle` sockets automatically, so 30 tenant pools cost near-zero idle connections. Recent releases include fixes to the idle-connection cleanup path (see sidorares/node-mysql2 #2493, #3020) — worth the bump before relying on this behavior. |
| drizzle-orm | ^0.45.2 (STAY — do not upgrade) | Per-tenant DB clients | 0.45.2 is the current `latest` stable tag on npm. The 1.0.0-rc line (rc.4, May 2026) is pre-release — do NOT migrate ORM majors mid-milestone. `drizzle(pool, { schema, mode: "default" })` is cheap to instantiate per tenant; the expensive part is the mysql2 pool underneath, which the maxIdle/idleTimeout config handles. |
| better-auth | ^1.6.23 (bump from 1.6.2, same range) | Per-tenant auth over custom domains | Verified: `trustedOrigins` accepts an **async function `(request) => string[]`** and wildcard patterns — this is how tenant custom domains get trusted without a redeploy (resolve from the tenant registry per request). Official "Dynamic Base URL" guide covers multi-domain `baseURL` resolution. Each tenant gets a cached Better Auth instance wired to its tenant Drizzle client; sessions live in the tenant DB (full isolation for free). |
| Next.js | 15.5.15 (STAY — already sufficient) | Host-based tenant resolution | Node.js runtime middleware (`export const config = { runtime: 'nodejs' }`) is **stable in 15.5** (announced in the Next.js 15.5 release blog) — the app is already on 15.5.15, so middleware CAN hit mysql2 directly if needed. No Next 16 upgrade required for this milestone (16.2.10 is current but adds nothing needed here). |
| cPanel AutoSSL | built-in (server-side, no package) | SSL for tenant custom domains | AutoSSL automatically issues + renews Let's Encrypt/Sectigo DV certs for **all addon domains on the account** — this is the certificate automation answer for this host. No certbot, no acme.sh, no Caddy. Trigger per-tenant issuance with `/usr/local/cpanel/bin/autossl_check --user=ninjaz` after adding the addon domain. |
| Node built-ins | Node 20 (existing nodevenv) | `AsyncLocalStorage`, `crypto` | No packages needed for request context or for future Hesabe AES-256-CBC (HesabeCrypt) — Node `crypto` covers it. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lru-cache | ^11.5.2 | Hard cap on tenant pool/instance cache with `dispose` → `pool.end()` | Optional. Only if the fleet grows past ~30 tenants and you want a guaranteed upper bound on open pools. For an admin-provisioned fleet of dozens, a plain `Map` + mysql2 idle shrink is sufficient. Requires Node 20+ (satisfied). |
| drizzle-kit | ^0.31.10 (existing) | **Author** migration SQL offline via `drizzle-kit generate` | Keep the existing convention: NEVER `drizzle-kit push` against the remote (documented hang). Generate SQL locally, apply via the fleet migration runner (below). |
| tsx | ^4.21 (existing) | Provisioning + fleet-migration scripts | `scripts/provision-tenant.ts`, `scripts/migrate-all-tenants.ts` — same pattern as the existing `scripts/seed-admin.ts`. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `cpapi2` / `uapi` CLI (root SSH) | Scripted tenant provisioning on the cPanel box | Addon domains: **cPanel API 2** `AddonDomain::addaddondomain` — cPanel recommends UAPI generally but has NO UAPI equivalent for addon domain creation, API 2 is the supported path. DBs: UAPI `Mysql::create_database`, `Mysql::create_user`, `Mysql::set_privileges_on_database`. Both callable via `cpapi2 --user=ninjaz ...` / `uapi --user=ninjaz ...` over the existing root SSH, or via the documented Basic-auth HTTPS endpoint on :2083. |
| `/scripts/ensure_vhost_includes --user=ninjaz` | Apply per-domain Apache userdata proxy includes | Run after writing the tenant's proxy conf; then `/usr/local/lsws/bin/lswsctrl reload` (graceful — NEVER `restart`, per existing deploy rules). |
| `/usr/local/cpanel/bin/autossl_check --user=ninjaz` | Force AutoSSL run for newly added tenant domain | Run after DNS is confirmed pointing at 152.53.86.223. Until the cert issues, the domain serves the default cert — a brief invalid-cert window is normal and expected. |

## The Four Questions, Answered

### 1. Per-request DB resolution without pool explosion (Drizzle/mysql2)

**Pattern: lazy pool-per-tenant with aggressive idle shrink, cached in a module-level Map.**

```ts
// src/lib/db/tenant.ts (replaces the singleton export const db)
const tenants = new Map<string, { pool: mysql.Pool; db: TenantDb }>();

function getTenantDb(dbName: string): TenantDb {
  let entry = tenants.get(dbName);
  if (!entry) {
    const pool = mysql.createPool({
      host: "127.0.0.1", user: PLATFORM_DB_USER, password: PLATFORM_DB_PASS,
      database: dbName, charset: "utf8mb4",
      connectionLimit: 3,   // per-tenant burst ceiling
      maxIdle: 1,           // idle pools decay to 1 socket...
      idleTimeout: 60_000,  // ...within 60s of inactivity
      waitForConnections: true,
    });
    entry = { pool, db: drizzle(pool, { schema, mode: "default" }) };
    tenants.set(dbName, entry);
  }
  return entry.db;
}
```

Why this works HERE specifically:
- **Single Node process** (`next start` behind Apache/LSWS proxy) — one Map, one budget. No serverless multi-instance multiplication.
- **Connection math:** MariaDB 10.11 default `max_connections` = 151. 30 tenants × `connectionLimit: 3` = 90 worst-case *burst* ceiling, but steady-state is ~1 socket per recently-active tenant thanks to `maxIdle: 1` + `idleTimeout`. The dev process (port 3000) and prod process (port 3001) share the server — budget both. Keep the existing single-tenant pool's `connectionLimit: 10` habit OUT of tenant pools.
- **One shared MySQL app user, granted per-tenant-DB at provisioning time** (`Mysql::set_privileges_on_database` per tenant DB). This keeps pool config uniform, keeps registry free of per-tenant passwords, and — because all tenant DBs live on the SAME MariaDB instance — enables cross-database SQL (`SELECT ... FROM ninjaz_platform.wholesale_catalog ...`) if the Reseller-plugin research lands on a shared central catalog. That resolves the flagged pooling concern: cross-tenant reads need NO extra pools, just a qualified table name or the platform pool.
- **Drizzle integration is unchanged per call site** — each tenant's `db` is a normal `MySql2Database<typeof schema>`. All existing MariaDB conventions (manual multi-query hydration, `ensureImagesArray`, app-generated UUIDs) carry over untouched.

**The real cost is the refactor, not the runtime:** ~19 files import the singleton `db` from `src/lib/db`. They must switch to resolving the tenant DB per request (see #2). This is the milestone's largest mechanical change — flag it for the Architecture researcher/planner. Do NOT try to preserve `import { db }` via a Proxy shim: Next 15's `headers()` is async, so a synchronous proxy can't resolve the tenant, and AsyncLocalStorage context set in middleware does not reliably propagate into RSC render. An explicit `await getDb()` helper (wrapping `headers()` + registry lookup + `getTenantDb()`, memoized per-request with React `cache()`) is the honest pattern.

### 2. Custom-domain → tenant resolution in Next.js 15

**Pattern: keep middleware thin (host pass-through + platform-route gating); resolve tenant in the Node layer with a per-request `cache()` + process-level TTL cache.**

- Middleware reads `req.headers.get("host")` (lowercase, strip port), stamps it as `x-tenant-host` on the forwarded request, and gates super-admin `/platform` routes to the platform's own domain. `ProxyPreserveHost On` is already set in the Apache userdata conf, so Host arrives intact — and because host === origin, Server Actions' origin check passes without `serverActions.allowedOrigins` config (if "Invalid Server Actions request" ever appears, that config accepts wildcards).
- Tenant lookup (`host → { tenantId, dbName, status }`) happens in a `resolveTenant()` helper: in-memory `Map` with a 30–60s TTL, backed by the platform registry DB. **Single process = in-memory cache is actually correct** — no Redis, no distributed invalidation. Super-admin mutations can bust the cache synchronously in the same process; TTL covers the dev/prod-are-separate-processes edge.
- Unknown host → 404/landing; `status = suspended` → 503 page. Do this in the root layout or `resolveTenant()`, not middleware, so the registry query doesn't sit on the static-asset hot path.
- If a middleware-level DB lookup ever becomes necessary, `runtime: 'nodejs'` middleware is stable on the already-deployed 15.5.15 — available, just not the default recommendation.
- **No path rewriting needed.** Unlike the Vercel Platforms starter (which rewrites to `/[tenant]/...` folders), every tenant here runs the SAME storefront code — only the DB behind it changes. Routing structure stays as-is.

### 3. SSL automation for tenant custom domains on cPanel/Apache/LiteSpeed

**Pattern: addon domain per tenant on the `ninjaz` account + cPanel AutoSSL. No new software.**

Per-tenant provisioning sequence (scripted, root SSH):
1. Tenant points their domain's A record at 152.53.86.223 (apex needs A/ALIAS; verify DNS resolves before proceeding).
2. `cpapi2 --user=ninjaz AddonDomain addaddondomain newdomain=<domain> subdomain=<slug> dir=/home/ninjaz/tenant-stub` — cPanel creates the vhost. Raise the account's addon-domain limit in the WHM package first.
3. Write the per-domain proxy include (templated from the existing `3dninjaz_app_proxy.conf`) to `/etc/apache2/conf.d/userdata/{std,ssl}/2_4/ninjaz/<domain>/proxy.conf`, run `/scripts/ensure_vhost_includes --user=ninjaz`, then `lswsctrl reload` (graceful).
4. `/usr/local/cpanel/bin/autossl_check --user=ninjaz` — AutoSSL issues via HTTP DCV and auto-renews forever after. Each addon domain is its own vhost/cert, so the 100-domains-per-cert limit never binds.
5. Insert the registry row; bust the resolver cache.

**Critical gotcha — DCV vs the proxy:** the proxy include forwards `/` to Node, which would swallow AutoSSL's `/.well-known/` validation requests. The template MUST exclude DCV paths *before* proxying, e.g. `ProxyPass "/.well-known/" "!"` (or an equivalent `<Location "/.well-known/">ProxyPass !</Location>` ordered to win). Port 80 must stay open — HTTP DCV needs it even if browsing is forced to HTTPS. cPanel also ships Global DCV Passthrough rewrite rules, but do not bet issuance on them winning against a `<Location "/">` ProxyPass — the explicit exclusion is cheap insurance. **Smoke-test this once on the real box with a throwaway domain before building the provisioning script around it** (the one MEDIUM-confidence item here).

Why per-domain includes and not one user-level include: cPanel supports user-level userdata conf applying to all of a user's vhosts, but this account hosts BOTH dev (→ :3000) and prod (→ :3001) upstreams — a blanket include would misroute one of them. Per-domain templated confs match the existing convention anyway.

### 4. Tenant registry storage

**Pattern: one small platform database (`ninjaz_platform`) on the same MariaDB instance.**

- Tables: `tenants` (id, name, dbName, status, settings…), `tenant_domains` (domain → tenantId; supports www + apex per tenant), later `tenant_plugins`. Own Drizzle schema file, own tiny pool (`connectionLimit: 2–3`) created at boot — this is the ONLY eagerly-created pool.
- Same-instance placement is deliberate: zero new infra, included in existing cPanel backups, and available for cross-DB SQL if the Reseller shared-catalog design needs it (see #1). Create it with the same UAPI Mysql calls as tenant DBs.
- Registry is the source of truth for: domain routing, DB names, tenant status, per-tenant SMTP/from-address (nodemailer transports cached per tenant like pools — each tenant's from-domain needs its own SPF/DKIM, flag for Features), and payment-gateway plugin config (which gateway + encrypted credentials per tenant — the plugin architecture's config lives here; the plugin *code* is in-repo TypeScript, no new packages for v1: PayPal SDK already installed, Hesabe/MyFatoorah are plain REST + Node `crypto`).
- Fleet migrations: raw SQL files (authored via `drizzle-kit generate`, applied never via `push`) + a `tsx` runner that loops registry tenants, applies pending files per tenant DB, and records them in a per-tenant `_migrations` table. Cron/watchdog/Meshy jobs likewise iterate the registry.

## Installation

```bash
# Bumps only — no new runtime architecture packages
npm install mysql2@^3.22.6 better-auth@^1.6.23

# Optional (only if fleet outgrows a plain Map cache)
npm install lru-cache@^11.5.2

# Server-side: nothing to install — cPanel AutoSSL, cpapi2/uapi, ensure_vhost_includes
# and lswsctrl already exist on the box.
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Pool-per-tenant + idle shrink | Single shared pool + `USE`/`changeUser` per acquire | Only at 500+ tenant scale where even burst ceilings matter. Drizzle acquires connections internally per query, so you can't reliably interpose `USE` — a missed reset silently reads the WRONG TENANT'S DATA. Not worth it at this fleet size. |
| One shared MySQL app user (per-DB grants) | MySQL user per tenant (creds in registry, encrypted) | If a compliance requirement demands credential-level isolation per tenant. Costs: per-tenant secrets management, no cross-DB queries for the Reseller catalog, more provisioning steps. |
| Single `ninjaz` cPanel account, addon domain per tenant | Dedicated cPanel account per tenant | If tenants ever get filesystem access or the addon-domain count nears account limits. Stronger FS/AutoSSL-quota isolation, but multiplies every provisioning step and complicates the shared Node process's uploads dir. |
| Tenant resolution in Node layer (`resolveTenant()` + `cache()`) | `runtime: 'nodejs'` middleware querying mysql2 directly | If a hard requirement emerges to reject unknown hosts before ANY rendering. Stable on 15.5.15, works — just puts DB latency on every request path. |
| cPanel AutoSSL | acme.sh/certbot with custom hooks | Only if AutoSSL's DCV provably cannot pass on this box (test first). Manual ACME means owning install-into-vhost + renewal + LSWS reload orchestration that AutoSSL does for free. |
| Next.js 15.5.15 (stay) | Next 16.x upgrade | Next milestone at the earliest. Nothing in multi-tenancy requires 16; don't stack a framework major on top of an architecture pivot. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Neon / PlanetScale / Turso / RDS "database-per-tenant" services | Cloud-managed multi-tenant DB patterns assume their control planes. This project's DB is self-hosted MariaDB 10.11 on the cPanel box — locked, working, backed up. | UAPI-provisioned MariaDB databases on the existing instance |
| Caddy on-demand TLS / Traefik / nginx-proxy + acme-companion | The textbook answer for arbitrary customer domains — but ports 80/443 are owned by LiteSpeed on this shared cPanel server. Displacing LSWS breaks every other site on the box. | cPanel AutoSSL + addon domains (revisit Caddy only on a future dedicated VPS) |
| drizzle-orm 1.0.0-beta/rc | Pre-release (`latest` is still 0.45.2). An ORM major migration mid-architecture-pivot doubles the risk surface. | drizzle-orm ^0.45.2 |
| `drizzle-kit push` against tenant DBs | Already banned in project conventions (hangs on remote schema-pull); with N tenant DBs it also has no fleet story. | `drizzle-kit generate` + raw-SQL fleet runner |
| Shared-pool `changeUser`/`USE` database switching | Cross-tenant data-leak class of bug if any acquire path misses the switch; incompatible with Drizzle's internal connection acquisition. | Pool-per-tenant with `maxIdle`/`idleTimeout` |
| ProxySQL / PgBouncer-style external pooler | Legit tech, wrong scale — a single Node process with ~30 idle-shrinking pools doesn't need a pooling middlebox on a cPanel box. | mysql2 pool options |
| Redis (for tenant-registry caching) | Single Node process — an in-memory Map with TTL + same-process invalidation is strictly simpler and correct here. | `Map` + TTL (lru-cache if a hard cap is wanted) |
| Subdomain-tenancy kits (Vercel Platforms domain APIs, wildcard-cookie schemes) | Locked decision is custom domains, not `*.platform.com` subdomains; Vercel's domain/cert APIs don't exist off-Vercel. | Host-header resolution + cPanel addon domains |
| `isomorphic-dompurify` or any ESM-only addition in new tenant code | Known prod breakage in this repo's CJS bundle (documented quirk). | Existing in-repo sanitizer (`src/lib/sanitize.ts`) |

## Stack Patterns by Variant

**If the Reseller plugin lands on a SHARED central catalog:**
- Put the wholesale catalog in `ninjaz_platform`; tenant-side reads use cross-database SQL on the same MariaDB instance (shared app user already has grants) or the platform pool.
- No additional pooling infrastructure needed — this was the flagged concern and it dissolves on same-instance placement.

**If the Reseller plugin lands on PER-TENANT catalog copies:**
- A sync job (tsx script iterating the registry) copies/updates catalog rows into each tenant DB; still zero new packages.

**If the fleet outgrows the cPanel box (>50 active tenants or connection pressure):**
- That is the moment to move the platform to a dedicated VPS, put Caddy (on-demand TLS with an `ask` endpoint hitting the tenant registry) or a wildcard-less nginx+acme setup on 443, and raise `max_connections`. Not v1.

**If a tenant demands their own SMTP/from-domain:**
- Per-tenant nodemailer transport config in the registry, transports cached like pools; requires tenant DNS work (SPF/DKIM) — operational, not stack.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| next@15.5.15 | `runtime: 'nodejs'` middleware | Stable as of 15.5 (official release blog) — no upgrade needed |
| drizzle-orm@0.45.2 | mysql2@3.22.6 | `drizzle-orm/mysql2` driver; `mode: "default"` (existing setting) unchanged |
| mysql2@3.22.6 | MariaDB 10.11 | `maxIdle`/`idleTimeout` are client-side pool options — server-version agnostic |
| better-auth@1.6.23 | drizzle-orm@0.45.2 | Same drizzle adapter as today; async `trustedOrigins(request)` + wildcard origins verified in 1.6.x docs |
| lru-cache@11.5.2 | Node 20 (nodevenv) | v11 requires Node 20+ — satisfied by the existing `/home/ninjaz/nodevenv/.../20/bin/node` |
| cPanel API 2 `AddonDomain::addaddondomain` | current cPanel | No UAPI equivalent exists — API 2 remains the supported programmatic path for addon domains |

## Sources

- npm registry via `npm view` (2026-07-12) — exact versions: mysql2 3.22.6, drizzle-orm 0.45.2 (latest tag; 1.0.0-rc.4 on `rc`), better-auth 1.6.23, lru-cache 11.5.2, next 16.2.10, drizzle-kit 0.31.10 — HIGH confidence
- [MySQL2 docs](https://sidorares.github.io/node-mysql2/docs) + [node-mysql2 #2493](https://github.com/sidorares/node-mysql2/issues/2493) / [#3020](https://github.com/sidorares/node-mysql2/issues/3020) — `maxIdle` (default = connectionLimit), `idleTimeout` (default 60000ms), idle-cleanup fixes — HIGH
- [Next.js 15.5 release blog](https://nextjs.org/blog/next-15-5) — Node.js middleware runtime stable in 15.5 — HIGH
- [Better Auth options reference](https://better-auth.com/docs/reference/options) + [security reference](https://better-auth.com/docs/reference/security) + [Dynamic Base URL guide](https://better-auth.com/docs/guides/dynamic-base-url) — async function + wildcard `trustedOrigins`, multi-domain baseURL — HIGH
- [Drizzle latest releases](https://orm.drizzle.team/docs/latest-releases) — 1.0.0-rc line status (pre-release) — HIGH
- [InMotion: cPanel API MySQL](https://www.inmotionhosting.com/support/edu/cpanel/how-to-create-a-mysql-database-using-the-cpanel-api/) + [dev.to UAPI operations](https://dev.to/iamtakdir/cpanel-uapi-operations-for-creating-subdomains-mysql-databases-and-file-operations-47g9) — `Mysql::create_database` / `create_user` / `set_privileges_on_database` — HIGH
- [WebHostingTalk: addon domains via API](https://www.webhostingtalk.com/showthread.php?t=1660731) — API 2 `AddonDomain::addaddondomain`, no UAPI equivalent — MEDIUM (community-sourced; cPanel moved official API doc URLs)
- [VPSBlocks: custom Apache rules in cPanel](https://www.vpsblocks.com.au/support/Knowledgebase/Article/View/434/11/custom-apache-rules-in-cpanel) + [Zyxware userdata includes](https://www.zyxware.com/articles/2714/how-to-make-custom-changes-to-virtualhost-settings-in-httpdconf-on-a-whmcpanel-vps) — userdata include levels, `/scripts/ensure_vhost_includes --user=` — MEDIUM
- [HostMyCode: AutoSSL troubleshooting 2026](https://www.hostmycode.com/tutorials/cpanel-autossl-troubleshooting-tutorial-2026-fix-lets-encrypt-failures-dcv-errors-broken-chains-whm) + [Let's Encrypt community: AutoSSL on addon domains](https://community.letsencrypt.org/t/autossl-on-addon-domains/19888) — AutoSSL covers all addon domains per account, HTTP DCV needs `/.well-known/` reachable on port 80 without proxy/redirect interference — MEDIUM (proxy-exclusion behavior needs one live smoke test)
- Repo inspection: `src/lib/db/index.ts` (singleton pool, connectionLimit 10, loopback no-TLS), `src/middleware.ts` (maintenance-mode middleware to extend), `package.json` (current pins) — HIGH

---
*Stack research for: v2.0 multi-tenant platform pivot (database-per-tenant, custom domains, cPanel/MariaDB self-hosted)*
*Researched: 2026-07-12*
