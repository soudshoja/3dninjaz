# Architecture Research

**Domain:** Multi-tenant pivot of an existing single-tenant Next.js 15 e-commerce app (database-per-tenant, custom-domain-per-tenant, admin-provisioned fleet)
**Project:** 3D Ninjaz — v2.0 Multi-Tenant Platform milestone
**Researched:** 2026-07-12 (supersedes the 2026-04-12 v1 single-tenant research, preserved in git history)
**Confidence:** HIGH for integration analysis (grounded in the live codebase, file-by-file); MEDIUM for cPanel UAPI domain-provisioning specifics and Better Auth multi-instance behavior at fleet scale (not yet exercised live)

---

## Ground Truth: What We Are Integrating With

Verified against the codebase (not assumed):

| Fact | Where | Multi-tenant consequence |
|------|-------|--------------------------|
| Single module-scope mysql2 pool (`connectionLimit: 10`) wrapped by one Drizzle instance, exported as `db` | `src/lib/db/index.ts` | ~70 source files import this singleton (116 `from "@/lib/db"` occurrences repo-wide). The singleton must dissolve into per-tenant acquisition. |
| Better Auth constructed **once at module scope**, bound to the singleton `db` via `drizzleAdapter`, with a **static** `trustedOrigins` array and `databaseHooks` that close over the singleton `db` | `src/lib/auth.ts` | One auth instance cannot serve N tenant DBs. Becomes a per-tenant factory + cache. `trustedOrigins` must be per-tenant domains. |
| `requireAdmin()` / `requireUser()` are the **first `await` in every protected handler** — deliberate CVE-2025-29927 mitigation (middleware is never the trust boundary) | `src/lib/auth-helpers.ts` | This discipline is the natural insertion point for tenant resolution. Tenant context resolution must live at the same layer, never in middleware alone. |
| Auth catch-all dispatches the singleton `auth.handler` | `src/app/api/auth/[[...all]]/route.ts` | Must resolve tenant from `Host` first, then dispatch that tenant's handler. |
| Middleware exists but only for maintenance mode; explicitly untrusted for auth | `src/middleware.ts` | Keep it that way. Tenant resolution trusted from middleware = repeating the exact mistake CVE-2025-29927 punished. |
| Custom Node server (`server.js`) behind Apache `ProxyPass / → 127.0.0.1:300x` with **`ProxyPreserveHost On`** | `server.js`, CLAUDE.md deploy topology | The original `Host` header reaches Node intact — Host-based tenant resolution works with zero proxy changes. But `npm run dev` = `next dev --turbopack` (no `server.js`), so nothing may depend on the custom server existing (rules out AsyncLocalStorage seeding in `server.js` as the primary mechanism). |
| Manual multi-query hydration everywhere (no LATERAL on MariaDB 10.11); JSON columns are LONGTEXT with manual parse helpers; app-generated `crypto.randomUUID()` PKs | `src/actions/products.ts` reference pattern, CLAUDE.md | All of this is **connection-agnostic** — the same code runs unchanged against whichever pool the tenant context hands it. The hydration pattern also solves cross-DB "joins" for the Reseller plugin (fetch from two connections, join in memory). |
| Migrations = idempotent raw-SQL `.cjs` applicators (INFORMATION_SCHEMA guards, charset probed from live `SHOW CREATE TABLE user`), **never** `drizzle-kit push` (documented hang) | `scripts/phase21-migrate.cjs` and 30+ siblings | Migration tooling must become fleet-aware (iterate registry, apply per tenant DB, track per-tenant schema version). |
| CI build opens an SSH tunnel to prod MariaDB **because static prerender executes DB queries** (sitemap, shop, layout `store_settings`) | `.github/workflows/deploy.yml` lines 156–186 | One build serves N tenants ⇒ DB-backed pages can no longer be prerendered against a single DB at build time. They become request-time dynamic (with per-tenant `unstable_cache` tags). Side effect: the CI DB tunnel can eventually be removed. |
| Customer-facing origins flow through one choke point: `publicOrigin()` in `src/lib/public-url.ts` (env-driven) | `src/lib/public-url.ts`, standing convention | Becomes tenant-aware (`tenant.primaryDomain`). Because the convention is already enforced repo-wide, this is one file plus call-site audit, not a scavenger hunt. |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `NEXT_PUBLIC_SITE_URL` are baked into the client bundle at build time | `.github/workflows/deploy.yml` build job | Baked values are per-build, not per-tenant. Fine for Tenant #1 cutover (same PayPal account, same domain); **must** move to runtime-delivered config before any tenant with different gateway credentials exists. |
| Uploads served through route handlers (`src/app/uploads/products/[bucket]/[id]/...`) over `public/uploads/products/<uuid>/` on disk; image URLs are **stored in DB JSON** | `src/lib/storage.ts`, upload routes | Tenant #1's existing paths must not move (stored URLs would break). New tenants get a namespaced prefix. |
| Per-store branding/settings already live in the DB (`store_settings` Phase 11; email templates as DB rows Phase 12; WhatsApp settings) | tenant DB schema | Everything DB-resident becomes per-tenant automatically once DB routing exists. This is the payoff of database-per-tenant: most of the feature set multi-tenants itself. |
| Two Node processes on the box: dev (`:3000`, DB `ninjaz_3dn`) and prod (`:3001`, DB `ninjaz_3dnp`), each auto-deployed by branch | CLAUDE.md deploy topology | Each environment gets its **own** platform registry DB (`ninjaz_platform_dev` / `ninjaz_platform`), mirroring the existing split. |

---

## System Overview (Target)

```
                        DNS: tenant domains → 152.53.86.223
┌────────────────────────────────────────────────────────────────────────┐
│  Apache/LiteSpeed (cPanel)                                              │
│  per-domain userdata vhost conf (one per tenant domain, one per env)    │
│  ProxyPass "/" → 127.0.0.1:3001 (prod) / :3000 (dev)                    │
│  ProxyPreserveHost On   +  AutoSSL cert per provisioned domain          │
├────────────────────────────────────────────────────────────────────────┤
│  ONE Node process per env (server.js, unchanged)                        │
│                                                                         │
│  Request handler / Server Action / Route Handler                        │
│    1st await:  requireSuperAdmin() | requireAdmin() | requireUser()     │
│                | getTenantContext()          ← THE trust boundary       │
│         │                                                               │
│         ▼                                                               │
│  ┌──────────────────────────┐      ┌─────────────────────────────────┐ │
│  │ Tenant Resolver           │      │ Pool Manager                    │ │
│  │ Host → registry cache     │──────│ Map<tenantId, {pool, drizzle}>  │ │
│  │ (in-proc, TTL + bust)     │      │ lazy create, LRU evict,         │ │
│  │ unknown host → 404        │      │ connectionLimit 3/tenant        │ │
│  │ suspended  → 503          │      └───────────────┬─────────────────┘ │
│  └────────────┬─────────────┘                       │                   │
│               │                       ┌─────────────┴────────────────┐  │
│  ┌────────────┴─────────────┐         │ Auth Instance Cache           │  │
│  │ Platform pool (singleton) │         │ Map<tenantId, betterAuth()>   │  │
│  │ registry, super-admin     │         │ + 1 platform auth instance    │  │
│  │ auth, plugin config,      │         └──────────────────────────────┘  │
│  │ shared reseller catalog   │                                           │
│  └──────────────────────────┘                                           │
├────────────────────────────────────────────────────────────────────────┤
│  MariaDB 10.11 (same box, loopback)                                     │
│  ninjaz_platform      ← NEW: registry, platform auth, plugins, catalog  │
│  ninjaz_3dnp          ← Tenant #1 = the EXISTING prod DB, unmoved       │
│  ninjaz_t_<slug>      ← Tenant #2..N, provisioned from baseline SQL     │
├────────────────────────────────────────────────────────────────────────┤
│  Filesystem: public/uploads/products/** (Tenant #1 legacy, frozen)      │
│              public/uploads/t/<tenantId>/products/** (new tenants)      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Where Tenant Resolution Happens (the core decision)

**Answer: in the data-access/auth layer, at the handler level — as an extension of the existing first-`await` guard discipline. Middleware gets no new trust responsibilities.**

Three layers, each with a distinct job:

1. **Apache vhost layer (routing, not trust).** Only provisioned domains have a vhost + proxy conf, so arbitrary Hosts mostly never reach Node. This is a filter, not a guarantee (default-vhost catch-alls exist) — the app must still hard-fail unknown hosts.

2. **Handler layer (THE trust boundary).** A new `getTenantContext()` — `React.cache()`-memoized per request — reads `Host` from `await headers()`, normalizes it, resolves it against the in-process registry cache, and returns `{ tenant, db, auth }`. It throws `notFound()` for unknown hosts and a 503 for suspended tenants. `requireAdmin()` / `requireUser()` call it internally as their own first step, so **every existing guarded handler becomes tenant-aware without changing the call-site convention**. This is deliberate: the CVE-2025-29927 lesson in this repo is that per-handler re-verification is the only boundary that holds, and tenant identity is now part of what must be re-verified (wrong-tenant DB access is a worse failure than missing auth).

3. **Middleware (unchanged responsibilities).** Keeps maintenance mode. It MAY later set advisory hints (never a tenant-ID header the handlers trust — a spoofed `x-tenant-id` is exactly the class of bug the existing convention exists to kill).

### Why not the low-diff AsyncLocalStorage/`db`-Proxy trick

`server.js` is a custom server, so wrapping `handle(req, res)` in `als.run({ host }, ...)` and turning the `db` export into a synchronous Proxy over a warm registry cache *would* leave all ~70 import sites untouched. Rejected as the primary mechanism because:

- `npm run dev` runs `next dev --turbopack`, not `server.js` — dev and prod would take different code paths through the single most safety-critical piece of the platform.
- The failure mode of implicit resolution (ALS empty → fallback pool) is **silent cross-tenant data access**. The explicit pattern fails loudly instead.
- It couples correctness to Next.js internal async-context propagation across upgrades.

The explicit refactor is larger (~70 mechanical file edits) but most call sites already begin with `await requireAdmin()` / `await requireUser()` — those get `db` for free from the returned context. Enforce completeness with an ESLint `no-restricted-imports` rule banning `import { db } from "@/lib/db"` outside `src/lib/tenant/` — it rides the existing CI `verify` job (typecheck + lint is already branch-protection-required).

**Reference shape:**

```typescript
// src/lib/tenant/context.ts
import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveDomain } from "./registry";     // warm in-proc map, TTL + bust
import { getTenantDb } from "./pool-manager";   // lazy pool per tenant, LRU
import { getTenantAuth } from "./auth-cache";   // lazy betterAuth() per tenant

export const getTenantContext = cache(async () => {
  const h = await headers();
  const host = (h.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  const tenant = resolveDomain(host);           // sync once cache is warm
  if (!tenant) notFound();                      // NEVER fall back to a default tenant
  if (tenant.status === "suspended") throw new TenantSuspendedError(tenant.id); // → 503
  return { tenant, db: getTenantDb(tenant), auth: getTenantAuth(tenant) };
});
```

```typescript
// src/lib/auth-helpers.ts — same names, same first-await call sites, tenant-aware inside
export async function requireAdmin() {
  const { tenant, db, auth } = await getTenantContext();   // tenant binding FIRST
  const session = await auth.api.getSession({ headers: await headers() });
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session || role !== "admin") throw new Error("Forbidden");
  return { session, tenant, db };                          // handlers get db for free
}
```

---

## Component Responsibilities (NEW vs MODIFIED)

| Component | Status | Responsibility | Implementation notes |
|-----------|--------|----------------|----------------------|
| Platform DB `ninjaz_platform` (+ `_dev`) | **NEW** | Tenant registry, tenant domains, platform (super-admin) Better Auth tables, plugin registry + per-tenant plugin config, shared Reseller catalog (per Features research) | A real separate MariaDB database on the same box — NOT tables inside a tenant DB. Created via raw SQL (root socket), same as all DDL in this repo. |
| `tenants` table | **NEW** | id (app-generated UUID, per repo convention), name, slug, **dsn** (full `mysql://` DSN, not just db name — allows moving tenant DBs to another server later without schema change), status enum(`active`,`suspended`), schemaVersion, uploadsPrefix, primaryDomain, settingsJson (LONGTEXT + parse helper, per repo JSON convention), createdAt | |
| `tenant_domains` table | **NEW** | domain (UNIQUE, lowercased, no port) → tenantId, isPrimary, sslIssuedAt | UNIQUE constraint is the collision guard, same idempotency style as `order_shipments.delyvaShipmentId`. |
| `src/lib/tenant/registry.ts` | **NEW** | In-process domain→tenant map. Warm-loaded at boot, TTL refresh (~60s), explicit bust on super-admin mutation. Single Node process per env ⇒ in-proc cache is authoritative (no cross-instance invalidation problem; the known `revalidateTag` cross-route quirk doesn't apply to a plain module Map). | Synchronous lookup once warm; async refresh path. |
| `src/lib/tenant/pool-manager.ts` | **NEW** | `getTenantDb(tenant)` → lazy `mysql.createPool({ uri: dsn, connectionLimit: 3, maxIdle: 1, idleTimeout: 60_000, charset: "utf8mb4" })` + `drizzle(pool, { schema, mode: "default" })`, cached in a Map, LRU-evicted (`pool.end()`) past `TENANT_POOL_MAX` (default 20). Drizzle schema objects are metadata-only and shared across all tenant instances. | Replaces the singleton in `src/lib/db/index.ts`. Platform pool stays a permanent singleton (connectionLimit 4) — the direct heir of today's `db`. No SSL, per the existing loopback-only rationale. |
| `src/lib/tenant/context.ts` | **NEW** | `getTenantContext()` as above; `getPlatformContext()` for the super-admin surface (asserts Host == platform panel domain). | `React.cache()` for per-request memoization in RSC + server actions; route handlers re-resolve (cheap map hit). |
| `src/lib/db/index.ts` | **MODIFIED** | Stops exporting a live `db`. Exports `platformDb` (singleton) and re-exports pool-manager accessors. In `TENANT_MODE=single` (compat/dev mode) it synthesizes a one-tenant registry from `DATABASE_URL` — today's behavior, byte-for-byte, Host ignored. | The compat mode is both the migration ramp and local-dev DX. |
| `src/lib/auth.ts` | **MODIFIED → factory** | `buildTenantAuth(tenant, db)` returning `betterAuth({ database: drizzleAdapter(db), baseURL: "https://" + tenant.primaryDomain, trustedOrigins: tenant domains, ... })`, cached per tenant in `src/lib/tenant/auth-cache.ts` (**NEW**), invalidated with the registry. `databaseHooks` (welcome email, guest-order phone linking) close over the tenant `db` and tenant mailer instead of singletons. Separate `platformAuth` instance bound to `platformDb`. | Shared `BETTER_AUTH_SECRET` is acceptable: default Better Auth sessions are DB-backed random tokens, and a token from tenant A does not exist in tenant B's `session` table. Per-tenant secrets = optional hardening, not required. Cookies are host-scoped per custom domain — no collision. |
| `src/app/api/auth/[[...all]]/route.ts` | **MODIFIED** | Resolve tenant from Host → dispatch `getTenantAuth(tenant).handler`. Platform panel domain uses a separate mount `/api/platform-auth/[[...all]]` bound to `platformAuth` (cleaner than overloading one route). | |
| `src/lib/auth-helpers.ts` | **MODIFIED** | See role hierarchy below. Names and first-`await` discipline preserved; return values grow to `{ session, tenant, db }`. `requireUser()` keeps its deletedAt/banned hot-path + cold-path reload logic verbatim, now against the tenant `db`. | |
| ~70 files importing `db` | **MODIFIED (mechanical)** | Guarded handlers: `const { db } = await requireAdmin();` / `requireUser()`. Public read paths (catalog, PDP, sitemap): `const { db } = await getTenantContext();`. Webhooks: resolve via Host the same way. | Enforced by lint rule. |
| `src/lib/public-url.ts` | **MODIFIED** | `publicOrigin()` resolves from tenant context (falls back to env in single mode). All emails/WhatsApp/payment links/Delyva webhook registrations already flow through it. | |
| `src/lib/mailer.ts` | **MODIFIED** | `getTenantMailer(tenant)` — per-tenant SMTP config from tenant settings, platform SMTP + per-tenant from-address as fallback. SPF/DKIM per tenant domain is an ops checklist item per tenant. | |
| Super-admin panel `src/app/(platform)/platform/**` | **NEW** | Tenant CRUD, suspend/activate, domain management, provisioning status, plugin config. Served only on the platform panel domain (e.g. `panel.3dninjaz.com`). | Every action starts `await requireSuperAdmin()`. |
| DB-backed prerendered pages (shop, sitemap, layout settings, /about) | **MODIFIED** | `force-dynamic` (or per-tenant `unstable_cache` with tags namespaced `t:<tenantId>:...` — extending the existing revalidateTag pattern). | Removes the CI build-time DB dependency (deploy.yml SSH tunnel) once complete. |
| Upload actions + serving routes | **MODIFIED** | Prefix from `tenant.uploadsPrefix`. Tenant #1's prefix = legacy `products/` (stored URLs keep working); new tenants = `t/<tenantId>/products/`. | Image URLs live in DB JSON — moving Tenant #1's files is forbidden. |
| Migration tooling | **MODIFIED convention** | `scripts/lib/tenant-iter.cjs` (**NEW**): read registry, yield per-tenant mysql2 connections; every future `phaseNN-migrate.cjs` runs its idempotent `apply(conn, dbName)` per tenant and bumps `tenants.schemaVersion`. `scripts/generate-tenant-baseline.cjs` (**NEW**): `mysqldump --no-data` (or `SHOW CREATE TABLE` loop) from Tenant #1 → `scripts/tenant-baseline.sql`, regenerated after every fleet migration. Provisioning applies the baseline, never replays 30 historical scripts. | Charset-probe rule and INFORMATION_SCHEMA idempotency guards carry over unchanged. |
| `scripts/create-tenant.cjs` | **NEW** | CREATE DATABASE + grants → apply baseline → seed tenant-admin (parameterized port of the two-step `scripts/seed-admin.ts` pattern: `signUpEmail` then Drizzle role update — `auth.api.createUser` ignores `role`, documented gotcha) → insert registry rows → health-check with `Host:` header. | |
| `scripts/provision-tenant-domain.sh` | **NEW (ops runbook, root)** | cPanel UAPI domain add (alias/addon under the account) → write Apache userdata conf pair (`std` + `ssl`) mirroring the existing `3dninjaz_app_proxy.conf` (`<Location "/">` ProxyPass to the env's port, `ProxyPreserveHost On`) → `/usr/local/lsws/bin/lswsctrl reload` (graceful — **never** `restart`) → trigger AutoSSL → verify HTTPS + app 200. | Node runs as `ninjaz` and cannot write `/etc/apache2` — v1 domain provisioning is a root-run script from the super-admin runbook, not an in-app button. Automating via a root-owned job queue is a later enhancement. |
| Background jobs (Meshy cron, backfills) | **MODIFIED** | Iterate registry (or take `--tenant=` param) via `tenant-iter`. Watchdog/Telegram stays process-level (platform concern). | |
| Payment plugin interface | **NEW (architecture-only v1)** | `PaymentProvider` interface (createOrder / capture / webhook-verify / refund) receiving `{ tenant, db, config }`; per-tenant gateway config in platform DB `tenant_plugins.configJson`. PayPal becomes the first internal implementation. Client-side: gateway client-ID delivered as an RSC prop from tenant config, **not** `NEXT_PUBLIC_*`. | Not needed for Tenant #1 cutover (baked env == Tenant #1's PayPal); required before any tenant with different credentials. |
| Reseller data path | **NEW (shape reserved)** | Shared catalog lives in the platform DB. Whichever model Features research picks is supported: shared-read = handler holds tenant pool + platform pool simultaneously and joins in memory (the established manual-hydration pattern, applied across two connections); sync-copy = background job reads platform DB, writes tenant DB. **No cross-database SQL JOINs** even though same-server MariaDB technically allows them — it would couple the fleet to single-server topology and break the per-tenant DSN escape hatch. | This is the answer to "does the app hold TWO simultaneous DB connections in some request paths" — yes: tenant pool + the always-present platform singleton pool, by design, at ~zero extra connection cost. |

---

## Role Hierarchy (preserving the CVE-2025-29927 discipline)

Database-per-tenant makes this almost free: **tenant-level roles don't change at all.** The existing `role: "admin"` user in `ninjaz_3dnp` simply *becomes* Tenant #1's tenant-admin — zero data migration. A user in tenant A's DB literally does not exist in tenant B's DB; isolation is structural, not a WHERE clause.

| Tier | Identity lives in | Guard (first `await`, handler-level) | What it verifies — in order |
|------|-------------------|--------------------------------------|------------------------------|
| Super-admin | Platform DB (own Better Auth instance) | `requireSuperAdmin()` **(NEW)** | 1) Host == platform panel domain (re-checked in-handler, not trusted from middleware) 2) session valid against **platform** auth 3) `role === "superadmin"` |
| Tenant-admin | That tenant's DB (`user.role = 'admin'`, unchanged) | `requireAdmin()` **(MODIFIED, same name/call sites)** | 1) resolve tenant from Host (unknown → 404, suspended → 503) 2) session valid against **that tenant's** auth instance 3) `role === "admin"` → returns `{ session, tenant, db }` |
| Tenant-customer | That tenant's DB (`role = 'customer'`, unchanged) | `requireUser()` **(MODIFIED, same name/call sites)** | 1) resolve tenant 2) tenant-scoped session 3) existing deletedAt/banned hot-path + cold-path reload, unchanged, against the tenant `db` |

Rules that keep the discipline intact:

- Tenant resolution **precedes** session lookup inside every guard — session tables are per-tenant, so "is this session valid" cannot even be asked without first binding the right DB. Wrong-tenant session validation is structurally impossible.
- A super-admin session grants **nothing** on any tenant domain, and a tenant-admin session grants nothing on the platform panel or any other tenant. No shared user table, no cross-DB role claims, no JWT spanning tenants.
- Super-admin "impersonate tenant admin" is **out of v1** (would require a cross-instance token-exchange design). The v1 substitute is the existing operational pattern: `ADMIN_RESET_PASSWORD=1` seed-script rotation, parameterized per tenant.
- The `(session.user as { role: string })` cast / `src/types/auth.d.ts` stub carries over per instance (Better Auth 1.6.2 still doesn't type `role`).

---

## Recommended Project Structure (delta only)

```
src/
├── lib/
│   ├── tenant/
│   │   ├── registry.ts        # domain→tenant cache (warm, TTL, bust)
│   │   ├── pool-manager.ts    # per-tenant pools + LRU; platform pool singleton
│   │   ├── context.ts         # getTenantContext() / getPlatformContext()
│   │   ├── auth-cache.ts      # per-tenant betterAuth() instances + platformAuth
│   │   └── mailer-cache.ts    # per-tenant nodemailer transports
│   ├── db/index.ts            # MODIFIED: platformDb + accessors; TENANT_MODE=single shim
│   ├── auth.ts                # MODIFIED: buildTenantAuth(tenant, db) factory
│   ├── auth-helpers.ts        # MODIFIED: guards return { session, tenant, db }
│   └── plugins/
│       └── payments/          # PaymentProvider interface + PayPal impl (v1: interface + port)
├── app/
│   ├── (platform)/platform/** # NEW super-admin panel (platform domain only)
│   └── api/platform-auth/[[...all]]/route.ts  # NEW platform Better Auth mount
├── actions/
│   └── platform-tenants.ts    # NEW super-admin tenant CRUD (requireSuperAdmin() first)
scripts/
├── lib/tenant-iter.cjs        # NEW fleet iterator for .cjs applicators
├── generate-tenant-baseline.cjs / tenant-baseline.sql   # NEW
├── create-tenant.cjs          # NEW provision DB + baseline + seed admin + registry
└── provision-tenant-domain.sh # NEW root ops runbook (vhost + proxy conf + AutoSSL + lswsctrl reload)
```

---

## Data Flow Changes

### Storefront/admin request — current vs target

```
CURRENT:  Apache(app vhost) → Node → handler → await requireAdmin() → singleton db → hydrate → respond

TARGET:   Apache(tenant vhost, ProxyPreserveHost) → Node → handler
            → await requireAdmin()                       ← unchanged call site
                ├─ Host → registry cache → tenant        ← NEW (inside the guard)
                ├─ getTenantAuth(tenant).getSession()    ← per-tenant session table
                └─ returns { session, tenant, db }       ← tenant pool
            → same manual multi-query hydration, same JSON parse helpers, same UUID inserts
            → publicUrl(tenant) for any outbound links   → respond
```

### Inbound webhooks (PayPal, Delyva)

Webhooks are registered per tenant origin (Delyva registration already flows through `publicUrl()`), so deliveries arrive on the tenant's own domain → the same Host resolution binds the right DB and the right gateway credentials for signature verification. Tenant #1's already-registered webhook URLs are unchanged by the cutover (same domain, same paths). Idempotency guards (UNIQUE `delyvaShipmentId` → `ER_DUP_ENTRY` no-op) carry over per tenant DB.

### Reseller (shape reserved for Features research)

```
Tenant PDP/pricing path:
  tenant pool ──► tenant-local rows        ┐
  platform pool ► shared catalog rows      ├─► in-memory join (established hydration pattern)
                                           ┘
```
Two pools live in one request. The platform pool is a permanent singleton, so this adds ~zero connection pressure.

### Fleet migration flow

```
scripts/phaseNN-migrate.cjs
  → platform DB: SELECT active tenants (dsn, schemaVersion)
  → per tenant: mysql2 connect → INFORMATION_SCHEMA-guarded DDL (charset probed per DB) → bump schemaVersion
  → regenerate tenant-baseline.sql from Tenant #1
```

---

## Build Order (what must exist before Tenant #1 cutover, and the cutover itself)

The single most important property: **the existing prod DB `ninjaz_3dnp` already IS a tenant database.** Database-per-tenant means Tenant #1 requires **no data migration whatsoever** — the registry row points at the existing DB, and the cutover is a *code-path* cutover, reversible by env flip. This is what eliminates the big-bang risk.

**Phase A — Tenant plumbing behind a compat flag (no behavior change).**
Platform DB + registry schema + registry cache + pool manager + `getTenantContext()`, all inert behind `TENANT_MODE=single` (default), which synthesizes one tenant from `DATABASE_URL` exactly as today. Deployable to dev continuously. Raw-SQL applicator creates `ninjaz_platform_dev` / `ninjaz_platform`.

**Phase B — Singleton dissolution sweep.**
Guards return `{ session, tenant, db }`; auth factory + per-tenant instance cache; auth catch-all dispatch; mailer factory; `publicUrl(tenant)`; mechanical `db`-import sweep (~70 files); lint rule bans `@/lib/db` value imports; DB-backed prerendered pages go dynamic (+ per-tenant cache tags). Ship to dev in `TENANT_MODE=single`; full regression of the money paths (checkout E2E, PayPal + Delyva webhooks, auth flows, admin CRUD). *This phase is the bulk of the risk and it all happens while behavior is provably unchanged.*

**Phase C — Super-admin surface + provisioning tooling.**
Platform Better Auth + `requireSuperAdmin()` + panel (tenant CRUD/suspend); `generate-tenant-baseline.cjs`; `create-tenant.cjs`; `provision-tenant-domain.sh`; fleet `tenant-iter.cjs` migration wrapper. Panel domain (e.g. `panel.3dninjaz.com`) provisioned with the same vhost runbook — eating our own provisioning dog food before any tenant does.

**Phase D — Tenant #1 cutover (dev first, then prod).**
Runbook, per environment:
1. Insert registry rows: tenant `3dninjaz` → dsn of the env's existing DB; domain `app.3dninjaz.com` (dev) / `3dninjaz.com` (prod); uploadsPrefix = legacy.
2. Take the standing DB backup (existing `backup-orders-schema.cjs` discipline) — precaution only; no data is moved.
3. Flip `TENANT_MODE=registry` in the env's `.env.local`, restart the Node app (watchdog covers a failed boot).
4. Smoke: storefront 200, customer login (**sessions survive** — same DB, same session table, same `BETTER_AUTH_SECRET`, host-scoped cookie on the same domain), admin login, product image loads (legacy upload paths), sandbox order end-to-end, PayPal webhook capture, Delyva quote.
5. Negative smoke: request with an unregistered Host header (curl direct to the loopback port) → must 404, never fall back to Tenant #1.
6. **Rollback = flip `TENANT_MODE=single`, restart.** Seconds, zero data movement, no schema to un-migrate. Soak on dev for days before repeating on prod.

**Phase E — Second (test) tenant, end-to-end.**
Spare domain → full provisioning path (DNS → create-tenant → domain script → AutoSSL) → isolation tests: tenant B admin cannot see tenant A data; session cookie from A rejected on B; uploads namespaced; per-tenant SMTP from-address. Only after this passes is the platform real.

**Phase F — Payment plugin architecture + Reseller scaffolding.**
`PaymentProvider` interface; PayPal ported onto it; runtime delivery of the gateway client-ID (removes `NEXT_PUBLIC_PAYPAL_CLIENT_ID` dependence); per-tenant Delyva/SMTP config surfaces; Reseller shared-catalog tables in the platform DB per the Features-research decision. Ordered last deliberately: it touches money paths and is not needed for the Tenant #1 cutover, but is a hard prerequisite for any tenant with its own merchant account.

---

## Scaling Considerations

| Scale | Notes |
|-------|-------|
| 1–10 tenants (v1 reality: admin-provisioned fleet) | Single box is fine. Connection budget: platform pool 4 + N×3 tenant pools per process; at 10 prod tenants ≈ 34 connections for prod + the dev process's own pools — well under typical MariaDB defaults, but **verify `SHOW VARIABLES LIKE 'max_connections'` on the box before Phase D** and record it in DEPLOY-NOTES. |
| 10–50 tenants | LRU pool eviction earns its keep; raise `max_connections`; measure per-instance Better Auth memory in Phase E (each instance is a plain object + adapter — expected cheap, unmeasured at fleet scale). Move heavy tenants' DBs off-box — the registry stores full DSNs precisely so this is a row update, not a refactor. |
| Beyond | Multiple Node processes / another host; the in-proc registry cache then needs an invalidation story (60s TTL staleness already suffices). Out of v1 scope. |

**First bottleneck:** MariaDB connections (do the math before every fleet growth spurt). **Second:** dynamic-rendering TTFB on catalog pages — mitigate with per-tenant `unstable_cache` tags, already the established pattern.

---

## Anti-Patterns (specific to this integration)

1. **Trusting middleware for tenant identity.** Setting `x-tenant-id` in middleware and reading it in handlers reintroduces CVE-2025-29927-class spoofing. Handlers resolve Host themselves inside the first-`await` guard, every time.
2. **Default-tenant fallback on unknown Host.** "Can't resolve? Serve Tenant #1" turns a config typo into a cross-tenant data leak — the worst possible failure for this platform. Unknown host = hard 404; suspended = 503. The only fallback is the explicit `TENANT_MODE=single` compat mode, which ignores Host entirely and is retired from prod after cutover soak.
3. **A shared `tenant_id` column "just for one table".** The moment one tenant-owned table lives in a shared DB, every query needs WHERE-clause discipline and the structural isolation guarantee is gone. Cross-tenant needs (Reseller) live in the **platform** DB as platform-owned data, accessed via the second connection.
4. **Cross-database SQL JOINs to the platform DB.** Works today on same-server MariaDB; silently breaks the per-tenant-DSN escape hatch and per-tenant grants. Use the two-connection in-memory join — the repo's manual hydration pattern already is exactly this.
5. **`drizzle-kit push` per tenant.** Documented to hang against this remote; at N tenants it's N hangs. Fleet raw-SQL applicators only, with per-tenant `schemaVersion` so a half-applied fleet migration is visible and resumable.
6. **Per-tenant builds or per-tenant `NEXT_PUBLIC_*` values.** One build serves all tenants; anything tenant-specific must be runtime data (tenant settings / plugin config → RSC props), never baked env.
7. **Provisioning tenant DBs by replaying the 30 historical phase scripts.** Fragile and order-dependent. Provision from a regenerated `tenant-baseline.sql` snapshot; keeping the snapshot current is a mandatory step of every fleet migration.
8. **`lswsctrl restart` during domain provisioning.** Graceful `reload` only — hard restart affects other users on the shared box (standing rule).

---

## Integration Points

### External services

| Service | Integration pattern | Notes |
|---------|---------------------|-------|
| cPanel/Apache/LiteSpeed | Per-tenant-domain userdata vhost conf pair (std+ssl) cloned from `3dninjaz_app_proxy.conf`, `ProxyPreserveHost On`, graceful reload | Root-only filesystem writes ⇒ v1 = root runbook script, not an in-app button. UAPI adds the domain to the account; AutoSSL issues the cert once DNS resolves. MEDIUM confidence on exact UAPI calls — validate on the panel domain in Phase C before any tenant domain. |
| PayPal | Per-tenant credentials via payment-plugin config (Phase F); Tenant #1 rides existing env creds through cutover | Webhook signature verification must use the resolved tenant's creds. MY-merchant card-funding quirks become per-tenant config concerns. |
| Delyva | Per-tenant creds in tenant settings, platform creds as fallback; webhook registration already per-origin via `publicUrl()` | 30kg cap, itemType routing, East-MY min-weight floor — all connection-agnostic, unchanged. |
| SMTP (cPanel) | Per-tenant transporter cache; per-tenant from-domain requires SPF/DKIM per tenant domain (ops checklist item in the provisioning runbook) | |
| GitHub Actions deploy | Unchanged mechanics; Phase B removes the build-time DB-tunnel need once no page prerenders from DB | `DATABASE_URL` secret becomes the platform DSN in registry mode. |

### Internal boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Guard layer ↔ registry/pool manager | Direct calls, per-request `cache()` memoization | The guard is the ONLY sanctioned entry to tenant DB handles (lint-enforced). |
| Tenant request path ↔ platform DB | Second (singleton) pool, in-memory joins | Reseller reads, plugin-config reads. Never SQL-level cross-DB. |
| Super-admin panel ↔ tenant DBs | Via pool manager for read-only fleet dashboards; mutations of tenant data stay inside each tenant's own admin | Keeps the blast radius of platform-panel bugs small. |
| Background jobs ↔ fleet | `tenant-iter` (registry-driven), per-tenant connections | Meshy cron, backfills, future billing. |

---

## Open Questions (flagged, not blocking Phase A/B)

1. **Reseller catalog model** — shared-read vs sync-copy — owned by the Features researcher; both shapes are accommodated above (platform-DB home + dual-connection pattern either way).
2. **Per-tenant vs shared MariaDB app user.** A single app user with grants on all tenant DBs is operationally simplest on one box; per-tenant DB users are stronger defense-in-depth and slot into the per-tenant DSN field with no code change. Decide at Phase C.
3. **Super-admin → tenant-admin impersonation** — deliberately out of v1; revisit with a signed token-exchange design if ops pain justifies it.
4. **Domain-provisioning automation depth** — v1 runbook script vs root-owned queue worker triggered from the panel. Start manual (fleet is admin-provisioned and small); automate when tenant #3+ makes it tedious.

## Sources

- Live codebase (primary): `src/lib/db/index.ts`, `src/lib/auth.ts`, `src/lib/auth-helpers.ts`, `src/app/api/auth/[[...all]]/route.ts`, `src/middleware.ts`, `server.js`, `next.config.ts`, `package.json`, `scripts/phase21-migrate.cjs`, `scripts/seed-admin.ts` (pattern), `.github/workflows/deploy.yml`, `src/lib/public-url.ts`, upload routes under `src/app/uploads/`
- `CLAUDE.md` — deploy topology, MariaDB 10.11 gotchas, Better Auth 1.6.2 specifics, LiteSpeed rules
- `.planning/PROJECT.md` — v2.0 milestone locked scope
- Better Auth docs (multi-instance/baseURL/trustedOrigins semantics; DB-backed session tokens) — consistent with the pinned 1.6.2 behavior already documented in-repo
- mysql2 pool options (`maxIdle`, `idleTimeout`) — mysql2 v3 documented API

---
*Architecture research for: 3D Ninjaz v2.0 multi-tenant platform pivot*
*Researched: 2026-07-12*
