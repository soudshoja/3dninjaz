# Project Research Summary

**Project:** 3D Ninjaz — v2.0 Multi-Tenant Platform milestone
**Domain:** Multi-tenant pivot of a LIVE single-tenant Next.js 15 / MariaDB e-commerce store — database-per-tenant, custom-domain-per-tenant, admin-provisioned fleet, self-hosted on cPanel/LiteSpeed
**Researched:** 2026-07-12
**Confidence:** HIGH overall (all four docs grounded in the live codebase file-by-file; MEDIUM only on cPanel AutoSSL-behind-proxy behavior and exact UAPI provisioning calls — both flagged for early smoke tests)

## Executive Summary

This milestone is a **patterns-and-provisioning problem, not a packages problem**. Almost nothing new gets installed (two minor version bumps: mysql2, better-auth). The real work is dissolving three module-level singletons — the `db` export in `src/lib/db/index.ts` (~70 importing files), the Better Auth instance, and the env-driven `publicOrigin()`/mailer/PayPal globals — into per-tenant factories resolved from a new platform registry database (`ninjaz_platform`) by Host header, at the handler layer, as an extension of the repo's existing first-`await` guard discipline (`requireAdmin()` et al.). Every generic multi-tenant tutorial assumes Vercel + Neon + Cloudflare; none of that applies here — and the single-Node-process, single-MariaDB-box deployment actually makes the hard problems (cache invalidation, connection budgeting, registry caching) trivially easy. Custom-domain SSL is solved by what the box already has: addon domain per tenant + cPanel AutoSSL, with one critical proxy-config exclusion for ACME DCV paths.

The single most important architectural fact: **the existing prod DB (`ninjaz_3dnp`) already IS a tenant database.** Tenant #1 cutover is a pointer move (registry row + `TENANT_MODE` env flip), not a data migration — reversible in seconds, sessions and carts intact. This eliminates the milestone's headline risk (breaking the live store) provided two rules hold: additive-only schema during the transition window, and continuous merges to dev behind a compat flag instead of a long-lived big-bang branch.

The biggest genuine risks are (1) a single missed `db`-singleton import silently writing another tenant's data into the live store — mitigated by deleting the export (compile error, not convention) plus an ESLint ban; (2) connection-pool exhaustion at ~5–15 tenants — mitigated by a lazy pool manager with `connectionLimit: 3`/`maxIdle: 1`/`idleTimeout` and deliberate MariaDB `max_connections` tuning; and (3) the Reseller plugin quietly dissolving the isolation guarantee via cross-database SQL — mitigated by an explicitly resolved catalog architecture (below). The Reseller catalog question flagged as open in PROJECT.md **is now resolved**: platform-owned catalog + one-way sync-copy into each reseller tenant's own DB, in-memory joins across the two always-available pools only, cross-database SQL joins banned outright.

## Key Findings

### Recommended Stack

Nothing structural changes. The validated single-tenant stack (Next.js 15.5.15, Drizzle 0.45.2, mysql2, Better Auth 1.6.x, MariaDB 10.11 on cPanel) stays; multi-tenancy is built from patterns over it plus the server-side tooling the box already has. Full detail in [STACK.md](STACK.md).

**Core technologies:**
- **mysql2 ^3.22.6** (bump): per-tenant lazy pools — `maxIdle: 1` + `idleTimeout: 60s` is the entire answer to pool explosion; ~30 tenant pools decay to ~1 idle socket each
- **better-auth ^1.6.23** (bump, same range): `trustedOrigins` accepts an async function + wildcards — tenant custom domains trusted from the registry per request, no redeploy; one cached Better Auth instance per tenant, sessions in the tenant DB (isolation for free)
- **drizzle-orm ^0.45.2 (STAY)**: do NOT ride the 1.0.0-rc line mid-pivot; `drizzle(pool, ...)` is cheap per tenant
- **Next.js 15.5.15 (STAY)**: Node-runtime middleware is stable if ever needed; no Next 16 upgrade this milestone
- **cPanel AutoSSL + API 2 `AddonDomain::addaddondomain` + UAPI Mysql calls** (server-side, no packages): the whole domain/DB/TLS provisioning toolchain over existing root SSH
- **lru-cache ^11.5.2** (optional): only if the fleet outgrows a plain `Map` + idle shrink (~30+ tenants)

**What NOT to use** (all rejected with rationale in STACK.md): Caddy/Traefik/nginx-proxy (LiteSpeed owns 80/443 on this shared box), Redis for registry caching (single process — in-memory Map is strictly correct), shared-pool `USE`/`changeUser` switching (silent wrong-tenant reads), `drizzle-kit push` against any tenant DB (already banned, now ×N), ProxySQL-style poolers.

### Expected Features

The admin-provisioned fleet model (Spree "invitation-only provisioning", AWS/Azure control-plane pattern) is genuinely LESS work than SaaS tutorials suggest — signup, billing, plans, quotas, and trials are all out of scope by locked decision. Full landscape in [FEATURES.md](FEATURES.md).

**Must have (table stakes, v1):**
- Control-plane DB: tenant registry + domains + super-admin auth (own Better Auth instance) — the foundation everything depends on
- Host-header tenant resolution + per-tenant DB connection cache — the multi-tenant request path itself
- Provisioning as an **idempotent state machine** (`pending → provisioning → active → suspended`), not a script — DB create, migrate, seed, domain+TLS, activate; every step recorded and retryable
- Fleet schema-migration runner + per-tenant version table + per-tenant backups — the recurring cost of DB-per-tenant, and the rollback story
- Super-admin panel: tenant list/detail, create wizard, suspend/unsuspend, sync-status dashboard
- Tenant #1 migration as a staged, reversible pointer cutover (no data copy)
- Payment-gateway plugin interface with PayPal as the one shipped implementation (locked "architecture room")
- Reseller plugin: central entitlements + wholesale price lists, one-way catalog sync engine, wholesale→`cost_price` mapping, retail-price init, availability propagation, order forwarding to the supplier's production queue, settlement ledger (manual transfer v1)
- Reseller margin rules (auto wholesale %) — LOW cost, kills the biggest price-admin chore; pulled into v1

**Should have (v1.x, trigger-based):**
- Impersonation ("log in as tenant admin") with audit log — first time super-admin must debug inside a tenant
- Tracking sync-back + reseller-branded shipping notifications — first real reseller order volume
- Cross-fleet analytics rollup; reseller browse-and-import UI; post-provision smoke checks; tenant templates

**Defer (v2+ / anti-features):**
- Self-serve signup + billing; two-way catalog sync / reseller content edits; per-tenant feature gating; process-per-tenant; automated payment splitting; real-time cross-DB stock checks; cross-tenant SSO; theme builder; wildcard subdomains — each has an explicit rejection rationale in FEATURES.md

### Architecture Approach

Tenant resolution lives in **the data-access/auth layer at the handler level** — `getTenantContext()` (React `cache()`-memoized) reads Host from `headers()`, resolves against an in-process registry cache (TTL + explicit bust; single Node process makes this authoritative), and returns `{ tenant, db, auth }`. The existing guards keep their names and first-`await` call sites but become tenant-aware inside, so every guarded handler inherits tenancy without changing convention — the CVE-2025-29927 discipline extended, not replaced. Middleware gains no trust responsibilities. The AsyncLocalStorage/`db`-Proxy low-diff shortcut is explicitly rejected (dev vs prod code-path divergence; silent-fallback failure mode). Compat flag `TENANT_MODE=single` synthesizes one tenant from `DATABASE_URL`, byte-for-byte today's behavior — the migration ramp AND the rollback. Full design in [ARCHITECTURE.md](ARCHITECTURE.md).

**Major components:**
1. **Platform DB `ninjaz_platform`(+`_dev`)** — tenant registry (full DSNs, not just db names — the tenant-relocation escape hatch), domains, platform auth, plugin config, reseller catalog/entitlements/ledger
2. **`src/lib/tenant/*`** — registry cache, pool manager (lazy, `connectionLimit: 3`, LRU-evict), context resolver, per-tenant auth-instance cache, per-tenant mailer cache
3. **Modified guard layer** — `requireSuperAdmin()` (platform DB, platform domain only) / `requireAdmin()` / `requireUser()` (tenant-scoped; return `{ session, tenant, db }`); tenant binding precedes session lookup, so wrong-tenant session validation is structurally impossible
4. **Provisioning tooling** — `create-tenant.cjs` (DB + baseline SQL snapshot + seeded admin + registry), root-run `provision-tenant-domain.sh` (addon domain + userdata proxy conf + AutoSSL + graceful `lswsctrl reload`), fleet `tenant-iter.cjs` migration wrapper with per-tenant `schemaVersion`
5. **Payment plugin interface** — `PaymentProvider` receiving `{ tenant, db, config }`; PayPal ported first; gateway client-ID becomes runtime tenant config, never `NEXT_PUBLIC_*`

### RESOLVED: Reseller catalog model (the PROJECT.md open question)

This is a **decided architecture, not an open question**, and the three research docs converge on it:

- **Decision: platform-owned catalog + one-way sync-COPY into each reseller tenant's own DB.** The supplier (Tenant #1) remains the source of truth; entitlements and wholesale price lists live in the platform DB; the sync engine copies entitled products — **same app-generated UUIDs** — into each reseller tenant's database and keeps platform-owned fields updated on a cursor over the existing `updatedAt onUpdateNow()` columns. Tenant-owned fields (retail price, sale, visibility, featured, category) are never touched. Request-time shared-catalog reads are **rejected, not deferred**.
- **Why copy wins here specifically:** the tenant schema's FK graph (order_items, reviews, coupons, config fields, `colors` RESTRICT FK, variants) forces local product rows anyway; MariaDB has no FDW; failure isolation — the locked reason for DB-per-tenant — survives (sync outage = staleness, never fleet downtime); orders already snapshot prices so minutes-stale is harmless; and writing wholesale into the reseller's `product_variants.cost_price` lights up the existing margin readout, `order_items.unit_cost` snapshot, and the entire accounting module with **zero tenant-app code changes**. This is Shopify Collective / Printify / Printful's exact model.
- **How the "two DBs in one request" tension resolves:** STACK.md correctly found that the single shared MySQL app user's per-DB grants technically enable cross-database SQL on this one MariaDB instance. ARCHITECTURE.md rules on it: some request paths legitimately hold **two simultaneous connections** — the tenant's own pool plus the permanent platform singleton pool — joined **in memory** via this repo's established manual-hydration pattern (the no-LATERAL house style, applied across two connections, at ~zero extra connection cost). **Cross-database SQL joins are banned outright** even though the grants allow them: they would weld the fleet to single-server topology, break the per-tenant-DSN escape hatch, and falsify the isolation promise (PITFALLS.md Pitfall 9). Enforcement is mechanical: CI grep for `ninjaz_\w+\.` qualifiers in SQL, `SHOW GRANTS` audit, and a service layer whose tenant-facing return type simply has no wholesale-price field.

### Critical Pitfalls

Top five of ten (all codebase-grounded, full detail + recovery strategies in [PITFALLS.md](PITFALLS.md)):

1. **Stale `db` singleton import → silent cross-tenant writes into the live store.** Delete/rename the export so every stale import is a compile error; ESLint `no-restricted-imports` ban; `rg` audit as a phase gate; same treatment for `auth`, PayPal client, `publicOrigin()`, mailer. Dev fleet runs ≥2 tenants from day one — a single-tenant dev cannot detect this class of bug.
2. **Connection-pool exhaustion (~5 tenants on cPanel per-user caps, ~15 on server default 151).** Pool manager with `connectionLimit: 3`, `maxIdle: 1`, `idleTimeout`, LRU eviction; pre-phase ops task: raise `max_connections` in `/etc/my.cnf` and set per-user caps; `Threads_connected` alert via the existing Telegram watchdog.
3. **AutoSSL DCV swallowed by the catch-all `ProxyPass "/"`.** The existing proxy conf forwards `/.well-known/acme-challenge/` to Next.js, which 404s → every tenant cert fails and burns Let's Encrypt rate limits. `ProxyPass "/.well-known/acme-challenge" "!"` exclusion in the tenant vhost template; DNS-verification gate before any cert request; smoke-test on a throwaway domain as a phase-ENTRY spike.
4. **Host-header trust: unknown host must hard-fail (404/421), NEVER default to Tenant #1** — default-tenant fallback = cache poisoning + password-reset-link poisoning against the live store. Better Auth origins/baseURL derived from the registry (the `d421bd9` hardcoded-origins incident, generalized); all outbound URLs from the registry's canonical domain, never the incoming Host.
5. **Role conflation once there are two kinds of admin.** `requireSuperAdmin()` vs `requireAdmin()` split by principal AND scope (separate auth instances, separate DBs); super-admin panel bound to one dedicated platform domain, 404 on tenant domains; bare `role === "admin"` string checks are the regression signature.

Also mandatory awareness: Tenant #1 cutover is a pointer move with additive-only schema (Pitfall 6); fleet migration drift needs a per-tenant version table + boot guard (7); every `unstable_cache` key/tag gets a `t:<tenantId>:` prefix — partial prefixing equals none (8); crons/webhooks/scripts/watchdog have no Host header and each needs explicit tenant handling — webhook tenant identity comes from the registration path, not the request Host (10).

## Implications for Roadmap

Based on research, suggested phase structure (mirrors ARCHITECTURE.md's build order A–F, validated against FEATURES.md dependencies and the PITFALLS phase mapping):

### Phase 1: Tenant plumbing behind a compat flag
**Rationale:** Foundation everything inherits; deployable continuously with zero behavior change (`TENANT_MODE=single` default). Pre-phase ops task rides along: MariaDB `max_connections` tuning + budget math.
**Delivers:** Platform DB (`ninjaz_platform_dev`/`ninjaz_platform`) + registry schema; registry cache; pool manager; `getTenantContext()`; tenant-aware cache-tag helpers.
**Addresses:** Tenant registry, host resolution (FEATURES table stakes A).
**Avoids:** Pitfalls 1, 2, 8 (singleton, pool exhaustion, cache leakage — the helpers land before any consumer).

### Phase 2: Singleton dissolution sweep
**Rationale:** The bulk of the milestone's mechanical risk, executed while behavior is provably unchanged in compat mode — full regression of money paths (checkout, PayPal + Delyva webhooks, auth, admin CRUD) on dev.
**Delivers:** Guards return `{ session, tenant, db }`; Better Auth factory + per-tenant instance cache + registry-driven trustedOrigins; auth catch-all dispatch; tenant-aware `publicUrl()`/mailer; ~70-file `db`-import sweep; ESLint ban; DB-backed prerendered pages go dynamic with per-tenant cache tags (retires the CI DB tunnel).
**Uses:** mysql2/better-auth bumps (STACK.md).
**Implements:** Guard layer + auth-cache components; avoids Pitfalls 1, 4, 5.

### Phase 3: Super-admin surface + provisioning tooling
**Rationale:** Control surface and fleet ops must exist before any second tenant; the platform panel domain is provisioned with the same runbook — eating the provisioning dog food before a tenant does. **Phase-entry spike: AutoSSL DCV proxy-exclusion test on a throwaway domain** (the one MEDIUM-confidence stack item).
**Delivers:** Platform Better Auth + `requireSuperAdmin()` + panel (tenant CRUD/suspend); `generate-tenant-baseline.cjs` + `create-tenant.cjs` (idempotent state machine); `provision-tenant-domain.sh` root runbook; fleet migration runner + per-tenant `schemaVersion` + per-tenant backups.
**Addresses:** Provisioning state machine, fleet migrations, super-admin panel (FEATURES P1). Avoids Pitfalls 3, 5, 7.

### Phase 4: Tenant #1 cutover (dev first, then prod)
**Rationale:** Pointer cutover, gated on Phase 2/3 soak; the live store migrates with zero data movement and a seconds-long rollback (`TENANT_MODE=single` flip). Dev store rehearses as Tenant #0 first, per the dev-first rule.
**Delivers:** Registry rows pointing at existing DBs; runbook execution with positive + negative smoke (unknown-Host curl must 404); rollback rehearsed on dev.
**Avoids:** Pitfall 6 (no dump-transfer, additive-only schema, sessions/carts/webhooks preserved).

### Phase 5: Second (test) tenant end-to-end + isolation verification
**Rationale:** The platform is only real once a synthetic tenant passes the full provisioning path and the isolation test battery. This is the milestone's verification gate.
**Delivers:** Spare domain → DNS → create-tenant → domain script → AutoSSL → live storefront; cross-tenant session rejection, cache cold-start difference test, uploads namespacing, `SHOW GRANTS` audit, per-tenant health checks in the watchdog, the full "Looks Done But Isn't" checklist from PITFALLS.md.
**Avoids:** Pitfalls 4, 8, 10 verified by test, not reasoning.

### Phase 6: Payment plugin architecture
**Rationale:** Touches money paths, not needed for Tenant #1 (baked env == Tenant #1's PayPal), but a hard prerequisite for any tenant with its own merchant account — and the Reseller plugin rides on the plugin registry it introduces.
**Delivers:** `PaymentProvider` interface; PayPal ported behind it; runtime delivery of gateway client-ID (removes `NEXT_PUBLIC_PAYPAL_CLIENT_ID`); per-tenant encrypted gateway config; minimal plugin enablement flags.
**Implements:** Plugin interface component (ARCHITECTURE Phase F, first half).

### Phase 7: Reseller plugin
**Rationale:** Last because it depends on everything: Tenant #1 as supplier (Phase 4), a second tenant to resell (Phase 5), and plugin flags (Phase 6). The resolved sync-copy model bounds the blast radius to an offline sync engine.
**Delivers:** Control-plane entitlements + wholesale price lists + margin rules; one-way catalog sync engine (FK-ordered graph copy, same UUIDs, field ownership, soft-discontinue, provenance columns); wholesale→`cost_price` mapping; order forwarding into the supplier's production queue; settlement ledger; sync-status dashboard.
**Avoids:** Pitfall 9 (service-layer boundary, grant audit, no cross-DB SQL, wholesale-price-free response types).

### Phase Ordering Rationale

- **Dependency chain is strict:** registry → resolution → auth split → provisioning → cutover → second tenant → plugins → reseller. FEATURES.md's dependency graph and PITFALLS.md's phase mapping independently produce this same order.
- **Risk front-loading with zero behavior change:** Phases 1–2 carry most of the mechanical risk but ship behind the compat flag, merged continuously to dev — deliberately avoiding the documented dev/master squash-divergence conflict storm a long-lived branch would cause.
- **The live store is protected structurally:** cutover is late, rehearsed, reversible, and requires no data movement; the previous single-tenant build must still boot against the same DB (additive-only schema proves it).
- **≥2-tenant dev fleet from Phase 4 onward** — the only configuration that can detect singleton/cache leakage bugs at all.

### Research Flags

Phases likely needing deeper research/spikes during planning:
- **Phase 3:** AutoSSL DCV behind the ProxyPass — MEDIUM confidence, needs one live smoke test on a throwaway domain BEFORE the provisioning script is built around it; exact cPanel API 2 `addaddondomain` + UAPI call behavior on this box; addon-domain limit in the WHM package.
- **Phase 3 (decision point):** shared MySQL app user vs per-tenant MySQL users. STACK.md leans shared-user-with-grants for simplicity; PITFALLS.md recommends per-tenant users for grant-level isolation and per-user connection caps. Note: with sync-copy resolved, the shared user's cross-DB-SQL "benefit" is explicitly unused — which strengthens the per-tenant-user case. Decide explicitly at Phase 3; the registry's DSN field accommodates either with no code change.
- **Phase 6:** Better Auth multi-instance memory footprint at fleet scale (expected cheap, unmeasured); per-tenant PayPal webhook signature verification against per-tenant creds.
- **Phase 7:** wholesale transform for tier-priced (`priceTiers`) configurable/keychain products — v1 rule sketched in FEATURES.md, verify against real reseller pricing before building.

Phases with standard patterns (skip research-phase):
- **Phase 1–2:** patterns fully specified in ARCHITECTURE.md with reference code; entirely in-repo mechanics.
- **Phase 4–5:** runbook-driven; the checklists in ARCHITECTURE.md Phase D and PITFALLS.md are the plan.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified against npm directly; Next/Better Auth capabilities against official docs; MEDIUM only on AutoSSL-behind-proxy (one smoke test resolves it) |
| Features | HIGH | Strong consistent industry precedent (AWS/Azure control-plane, Spree, Shopify Collective/Printify/Printful for the reseller model); MEDIUM on cPanel/LiteSpeed domain+TLS specifics |
| Architecture | HIGH | Grounded file-by-file in the live codebase; MEDIUM on UAPI provisioning specifics and Better Auth multi-instance at scale (not yet exercised live) |
| Pitfalls | HIGH | All ten grounded against actual source files and this project's own incident history; MEDIUM-HIGH on hosting/SSL specifics |

**Overall confidence:** HIGH

### Gaps to Address

- **AutoSSL DCV vs catch-all proxy:** the single load-bearing unknown. Handle as a Phase 3 entry spike on a throwaway domain; documented `acme.sh` + UAPI `install_ssl` fallback exists if it fails.
- **MySQL user model (shared vs per-tenant):** genuinely open, decide at Phase 3 with the grant-audit implications in view (see Research Flags). Registry DSN design makes it a non-breaking decision either way.
- **`max_connections` on the box:** verify `SHOW VARIABLES LIKE 'max_connections'` and record in DEPLOY-NOTES before Phase 4; do the budget math again before every fleet growth spurt.
- **Impersonation:** deliberately out of v1 (cross-instance token exchange design needed); the seed-script password-rotation pattern is the interim support path.
- **Per-tenant email deliverability:** platform-domain From with tenant display-name by default; custom From domains gated on tenant completing SPF/DKIM DNS — an onboarding checklist item, not code.

## Sources

### Primary (HIGH confidence)
- Live codebase: `src/lib/db/index.ts`, `src/lib/auth.ts`, `src/lib/auth-helpers.ts`, `src/lib/public-url.ts`, `src/lib/paypal.ts`, `src/lib/mailer.ts`, `src/actions/products.ts`, `src/lib/db/schema.ts`, `server.js`, `src/middleware.ts`, `scripts/seed-admin.ts`, `scripts/phase21-migrate.cjs`, `.github/workflows/deploy.yml`, upload routes
- `CLAUDE.md` (deploy topology, MariaDB gotchas, Better Auth specifics, incident history) + `.planning/PROJECT.md` (locked v2.0 scope)
- npm registry via `npm view` (2026-07-12): mysql2 3.22.6, drizzle-orm 0.45.2, better-auth 1.6.23, lru-cache 11.5.2
- Official docs: Next.js 15.5 release blog (Node middleware stable), Better Auth options/security/dynamic-base-URL, Drizzle release status, MySQL2 pool options, Let's Encrypt rate limits, Azure SQL multitenant patterns, Shopify Collective retailer/price-list docs

### Secondary (MEDIUM confidence)
- cPanel API 2 `AddonDomain::addaddondomain` path (community-sourced; no UAPI equivalent exists) — validate on the panel domain in Phase 3
- AutoSSL DCV behavior behind `ProxyPass` (cPanel/Let's Encrypt community + vendor troubleshooting docs) — smoke test required
- cPanel MariaDB per-user connection caps (hosting KBs) — verify actual values on this box
- AWS SaaS control-plane guidance, Spree multi-tenant capabilities, Printify/Printful sync model, Atlas/Bytebase fleet-migration patterns, OneUptime Node multi-tenancy pooling

---
*Research completed: 2026-07-12*
*Ready for roadmap: yes*