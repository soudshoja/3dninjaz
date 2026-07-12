# Pitfalls Research

**Domain:** Retrofitting database-per-tenant multi-tenancy + custom-domain routing onto a LIVE single-tenant Next.js/MariaDB e-commerce store, self-hosted on cPanel + Apache-userdata proxy + LiteSpeed (v2.0 Multi-Tenant Platform milestone)
**Researched:** 2026-07-12
**Confidence:** HIGH for codebase-grounded pitfalls (verified against actual source files), MEDIUM-HIGH for hosting/SSL specifics (verified against cPanel/Let's Encrypt docs and community sources, not yet tested on this box)

Scope note: locked decisions (database-per-tenant, custom domains, admin-provisioned fleet, live store = Tenant #1, Reseller plugin) are treated as given. This document is about how those decisions fail in THIS codebase on THIS server — not whether they are right.

---

## Critical Pitfalls

### Pitfall 1: The stale `db` singleton import — silent cross-tenant writes into Tenant #1

**What goes wrong:**
`src/lib/db/index.ts` exports a module-level singleton: `export const db = drizzle(pool, ...)`. Dozens of files import it (`src/actions/*.ts`, `src/lib/auth-helpers.ts`, `src/lib/catalog.ts`, `src/lib/accounting.ts`, ...). The retrofit replaces this with a request-scoped tenant DB resolver — but any ONE call site that keeps importing the old singleton continues to silently read/write the database the singleton points at, which will be Tenant #1 (the live store). Tenant B's admin edits a product; it appears in Tenant #1's live catalog. Tenant B's customer order lands in Tenant #1's orders table. No error is thrown anywhere.

**Why it happens:**
Module-level singletons are invisible to code review — the import line looks identical before and after the retrofit, and TypeScript is perfectly happy. This project has already been bitten by the exact same shape twice: the PDP two-view-paths bug (feature added to one code path, silently missing from the other) and the WhatsApp silent no-send (bad input → silent skip, no log). A missed call site in a 100+-action codebase is a statistical certainty, not a possibility.

**How to avoid:**
- Make the old import path impossible, not discouraged: delete/rename the `db` export from `src/lib/db/index.ts` so every stale import is a compile error. Replace with `getTenantDb(ctx)` (request-scoped) and a separately named `platformDb` for registry/super-admin tables. Never keep a default export that "happens to be" Tenant #1.
- Add an ESLint `no-restricted-imports` rule banning `@/lib/db` outside the tenant-resolution layer, so it cannot creep back.
- Grep-audit as an explicit phase task: `rg "from \"@/lib/db\"" src/` must return only the resolver module before the phase is verifiable.
- Same treatment for the other module-level singletons that bind to global state: `auth` in `src/lib/auth.ts`, PayPal client in `src/lib/paypal.ts`, `publicOrigin()` in `src/lib/public-url.ts`, mailer transport in `src/lib/mailer.ts`. Each is a tenant-context leak with the identical failure shape.

**Warning signs:**
- Any file still importing `db` from `@/lib/db` after the routing phase.
- A row appearing in Tenant #1's DB with a timestamp matching activity on another tenant's domain.
- "It works in dev" with only one tenant configured — single-tenant dev fleets cannot detect this class of bug. Dev must run ≥2 tenants from day one.

**Phase to address:**
The tenant-context/DB-resolution phase (first code phase of the milestone). This is the foundation everything else inherits — exactly like `requireAdmin()`-first was for v1.

---

### Pitfall 2: Connection-pool exhaustion — pool-per-tenant × `connectionLimit: 10` vs MariaDB's ~151 connections

**What goes wrong:**
The current pool is `connectionLimit: 10` for one database (`src/lib/db/index.ts`). The naive retrofit creates one such pool per tenant DB. MariaDB's default `max_connections` is 151, and cPanel MySQL users additionally carry `max_user_connections` limits (commonly 30–50 on cPanel boxes). At 10 connections per tenant: ~15 tenants saturates the server-wide limit; if all tenant DBs are accessed through one MySQL user (`ninjaz_*`), the per-user cap is hit far earlier — around 3–5 tenants. Symptom is not a clean error at provisioning time: it is `ER_TOO_MANY_CONNECTIONS` / `ER_TOO_MANY_USER_CONNECTIONS` under load, intermittently, taking down ALL tenants at once — including the live store — because everything shares one MariaDB instance and one Node process.

**Why it happens:**
mysql2 pools hold idle connections open indefinitely unless `maxIdle`/`idleTimeout` are set (they are not set today). Pools are created but never destroyed. Nobody notices during development with 2 tenants; the wall arrives with tenant #10–15 in production.

**How to avoid:**
- Build a `TenantPoolManager` from day one: lazy pool creation on first request, `connectionLimit: 3–5` per tenant (not 10), `maxIdle: 1`, `idleTimeout: 60_000`, a hard cap on simultaneous live pools with LRU eviction (`pool.end()` on evict).
- Since root SSH access exists: raise `max_connections` in `/etc/my.cnf` deliberately (e.g. 300–500 with headroom for cPanel's own connections) and set `max_user_connections` per MySQL user so no tenant can starve the fleet. Restart MariaDB in a maintenance window — this is a one-time op task, do it before tenant #2 exists.
- Decide the MySQL-user model explicitly: one user with grants on all tenant DBs (simple, but one shared per-user cap and zero DB-level isolation) vs one MySQL user per tenant DB (cPanel-native via UAPI, per-tenant caps, real grant isolation — recommended, and it makes the Reseller isolation exception auditable at the grant level).
- Monitor `SHOW STATUS LIKE 'Threads_connected'` from the existing watchdog cron; alert via the existing Telegram pipe at 70% of `max_connections`.

**Warning signs:**
- `Threads_connected` growing monotonically with tenant count and never shrinking (idle pools never released).
- Intermittent `ER_TOO_MANY_CONNECTIONS` in logs after adding a tenant — this means the budget math was never done.
- The dev store (ninjaz_3dn) and prod store (ninjaz_3dnp) already share this MariaDB instance — dev load can consume prod's connection budget TODAY; multi-tenancy multiplies this.

**Phase to address:**
Tenant-context/DB-resolution phase (pool manager is part of the resolver). MariaDB server tuning is a pre-phase ops task.

---

### Pitfall 3: ACME/AutoSSL DCV swallowed by the catch-all `ProxyPass "/"` — tenant SSL issuance fails on this exact Apache config

**What goes wrong:**
The current vhost proxies EVERYTHING to Node: `<Location "/"> ProxyPass ...` in `/etc/apache2/conf.d/userdata/{std,ssl}/2_4/ninjaz/app.3dninjaz.com/3dninjaz_app_proxy.conf`. cPanel AutoSSL validates domain control by serving a file from `/.well-known/acme-challenge/` out of the Apache docroot. With the catch-all proxy, that request is forwarded to Next.js instead — which 404s — and DCV fails for every tenant domain served through this proxy pattern. Failed validations also burn Let's Encrypt's failure budget (5 failures per identifier per hour), so retries make it worse, and the automation appears "randomly" broken.

**Why it happens:**
The proxy config was written for one domain whose cert already existed. Nobody re-validates AutoSSL against the proxy until the first tenant domain fails, in production, during onboarding, with the tenant watching.

**How to avoid:**
- Add `ProxyPass "/.well-known/acme-challenge" "!"` (exclusion) ahead of the catch-all in the userdata template used for tenant vhosts — or serve `/.well-known/` from the docroot via an explicit `Alias` like the existing `/errors` static pages already do. Test on a throwaway domain BEFORE the provisioning phase ships.
- Understand the AutoSSL preconditions as hard requirements of the onboarding flow: the tenant's DNS must already point at 152.53.86.223 before the domain is added; the domain must be attached to the cPanel account (addon/parked via UAPI) for AutoSSL to consider it; AutoSSL runs on a daily schedule, so provisioning must trigger `/usr/local/cpanel/bin/autossl_check --user=ninjaz` explicitly or the tenant waits up to 24h with a browser SSL warning.
- Build the onboarding state machine to check DNS FIRST (resolve A/AAAA, detect Cloudflare proxying, detect CAA records that forbid the CA) and refuse to request a cert until DNS verifies — failed DCV attempts are rate-limited resources, not free retries.
- Budget Let's Encrypt limits into fleet math: 50 certs/registered-domain/week is per TENANT domain here (each tenant is its own registered domain) so volume is fine — but the 5-failures-per-hour per identifier limit is the one careless retry loops hit.
- Have a documented manual fallback: `acme.sh` + UAPI `SSL::install_ssl` for domains AutoSSL mishandles (e.g. tenant insists on keeping Cloudflare orange-cloud — then THEY terminate TLS and the origin needs only the platform cert).

**Warning signs:**
- AutoSSL log entries showing DCV HTTP 404 for a tenant domain while the domain loads fine in a browser — that IS the proxy swallowing the challenge.
- Tenant onboarding docs that say "point your DNS, you're live" with no DNS-verification gate before cert request.
- Repeated cert requests for the same domain within an hour in the ACME logs.

**Phase to address:**
Domain/SSL provisioning phase. The `ProxyPass` exclusion test is a phase-entry spike, not a mid-phase discovery.

---

### Pitfall 4: Host-header trust — unknown hosts falling back to Tenant #1, and Better Auth deriving URLs from spoofable hosts

**What goes wrong:**
Tenant resolution reads the `Host`/`X-Forwarded-Host` header. Two failure modes:
1. **Default-to-Tenant-#1:** an unregistered or spoofed Host resolves to a fallback tenant (almost always the first/live one) instead of hard-failing. Anyone who points a random domain at the server IP — or sends a raw request with an arbitrary Host header through the Apache proxy — gets served the live store under an attacker-controlled origin, poisoning any cache keyed without the host and enabling password-reset-link poisoning (reset emails built from request host point at the attacker's domain).
2. **Better Auth origin drift:** `trustedOrigins` in `src/lib/auth.ts` is a hardcoded array today, and the project was ALREADY burned once by a missing origin (commit `d421bd9` — admin forms rejected cross-origin). With N tenant domains this becomes a recurring production incident: every tenant onboarding that forgets to extend origins breaks that tenant's login/checkout POSTs. Conversely, a lazily-broad fix (wildcard origins, `baseURL` derived from any request host) reopens the reset-poisoning hole.

**Why it happens:**
`ProxyPreserveHost On` forwards whatever the client sent. On managed platforms (Vercel etc.) the platform only routes verified domains to your app; on self-managed Apache/LiteSpeed, the default/catch-all vhost happily forwards garbage hosts to Node. The app is the last line of defense and must treat Host as untrusted input.

**How to avoid:**
- Tenant resolution = strict allowlist lookup against the platform registry (cached with explicit invalidation — see Pitfall 8). Unknown host → 421/404 static response, loudly logged. NEVER a default tenant. (This is the WhatsApp-silent-skip lesson inverted: unknown input must fail loud, not soft.)
- Better Auth: use its dynamic base URL support with `allowedHosts` fed from the tenant registry, and generate `trustedOrigins` from the registry, not a literal array. One code path, no per-tenant deploy step. Verify version 1.6.2 supports this or plan the upgrade cost explicitly.
- Every absolute URL builder goes through a tenant-aware replacement for `publicUrl()` (`src/lib/public-url.ts` is env-driven single-origin today — every email link, WhatsApp link, PayPal `return_url`, and sitemap entry it produces will be wrong for tenants until this is rewritten). Build URLs from the registry's canonical domain for the tenant, never from the incoming Host header.
- Sessions live in each tenant's own DB (Better Auth instance per tenant, bound to that tenant's Drizzle connection). This makes a stolen/copied session cookie from tenant A meaningless on tenant B's domain because the lookup misses. Do NOT centralize sessions in the platform DB "for convenience" — that single table would validate any tenant's token on any tenant's domain.

**Warning signs:**
- `curl -H "Host: evil.example" http://127.0.0.1:3000/` returning the live store instead of an error.
- Password-reset or order-confirmation email containing a link whose origin ≠ that tenant's registered domain.
- A `trustedOrigins` edit appearing in a tenant-onboarding runbook — that means origins are still static.

**Phase to address:**
Tenant registry + request-routing phase (resolution strictness); auth phase (Better Auth per-tenant instances + dynamic origins).

---

### Pitfall 5: Role-hierarchy conflation — `requireAdmin()` means something different once there are two kinds of admin

**What goes wrong:**
Today `requireAdmin()` (`src/lib/auth-helpers.ts`) checks `role === "admin"` against the single DB, and it is the carefully-enforced first `await` in every admin action. After the retrofit there are three principals: super-admin (platform), tenant-admin (per tenant), tenant-customer. If tenant admins are stored with `role: "admin"` in their tenant DB and the super-admin panel reuses the same helper — or super-admin routes are reachable under tenant domains — a tenant-admin session passes the role check on platform routes. The literal string `"admin"` no longer identifies a privilege level; it identifies a privilege level WITHIN a scope, and the scope check is the new thing that can be forgotten. Escalation paths: tenant-admin invoking super-admin actions (tenant create/suspend, registry edits), tenant-admin reaching another tenant's admin actions via Host manipulation, or the super-admin seed script (scripts/seed-admin.ts pattern) being run against a tenant DB and quietly minting a platform-privileged user in the wrong place.

**Why it happens:**
The v1 discipline ("requireAdmin first await, everywhere") was a single check with a single meaning. Retrofits preserve the FORM of the discipline (the call is still there) while its MEANING silently weakens — the check passes for the wrong principal. This is the most dangerous kind of security regression: every file looks correct in review.

**How to avoid:**
- Split the helpers by principal and scope, never by role string alone: `requireSuperAdmin()` (validates against the PLATFORM DB/auth instance only, only callable on the platform admin surface), `requireTenantAdmin()` (validates against the RESOLVED tenant's DB and returns the tenant context — actions use the returned context's DB handle, so a passing check and the DB being written are inseparable), `requireUser()` (per-tenant, as today).
- Serve the super-admin panel on ONE dedicated platform domain that is not a tenant domain; tenant resolution for that host maps to "platform", not a tenant. Super-admin routes must 404 on tenant domains.
- Preserve the existing convention verbatim: the scope-correct helper is the first `await` in every mutation (CVE-2025-29927 lesson carries over unchanged).
- Migration step: the current live admin user sits in Tenant #1's `user` table. Decide explicitly whether that human becomes (a) super-admin in the platform DB AND tenant-admin in Tenant #1 (two accounts), or (b) tenant-admin only with a fresh platform account. Do not let one row serve both purposes.
- If "log in as tenant" impersonation is built for support, gate it behind super-admin, time-box the impersonated session, and audit-log every use — impersonation is the classic escalation backdoor in fleet-admin panels.

**Warning signs:**
- Any auth helper whose body is a bare `role === "..."` comparison without binding to a scope/DB.
- Super-admin pages rendering (even as 403 shells) on a tenant domain.
- A single Better Auth instance/table validating sessions for both platform and tenant surfaces.

**Phase to address:**
Auth/roles phase, immediately after tenant routing exists and before any super-admin UI ships.

---

### Pitfall 6: Tenant #1 migration — moving data that didn't need to move, and breaking the store that pays the bills

**What goes wrong:**
The single highest-risk step. The classic mistakes: (a) exporting/importing the live DB into a "new" tenant DB (data copy = downtime + drift + orphaned references + a live store serving stale data), (b) letting the multi-tenant build make non-additive schema changes to the live DB so the old single-tenant build can no longer run against it (rollback destroyed), (c) breaking in-flight state — PayPal orders created pre-cutover captured post-cutover, Delyva shipment webhooks arriving days after cutover for orders booked before it, sessions invalidated so every logged-in customer is kicked out mid-checkout, (d) changing upload URL paths so every `images` JSON array in the products table points at dead files.

**Why it happens:**
"Migrate the store into the platform" sounds like a data move. Under database-per-tenant it should be a POINTER move: the existing prod DB (`ninjaz_3dnp`) simply BECOMES Tenant #1's database, registered in the platform registry, untouched. Teams copy data because the mental model says "new system = new database".

**How to avoid:**
- **Don't move the data.** Cutover = deploy multi-tenant build + registry row `3dninjaz.com → ninjaz_3dnp`. The only data that physically moves is platform-level extraction (super-admin account; platform settings), which is a handful of rows.
- **Additive-only schema during the transition window.** Any column/table the multi-tenant build needs in tenant DBs is added in advance while the single-tenant build still runs (it ignores unknown columns). Rollback is then literally: redeploy the previous single-tenant build against the same DB. Practice the rollback on dev before cutover.
- **Rehearse on the dev store first.** `app.3dninjaz.com` + `ninjaz_3dn` becomes Tenant #0 of a two-tenant dev fleet (dev store + one synthetic tenant) and runs that way for a full test cycle before prod cutover. This also satisfies the dev-first-then-prod rule already in force for this project.
- **In-flight state checklist:** PayPal webhook/return URLs (domain unchanged — verify handler resolves Tenant #1 for them), Delyva webhooks (same; the existing `delyvaShipmentId` UNIQUE-constraint idempotency now lives per-tenant-DB — confirm the webhook route resolves tenant BEFORE the dedup check), active carts (Zustand/localStorage — keyed per domain, unaffected), sessions (untouched if the DB isn't moved and `BETTER_AUTH_SECRET` is unchanged — do not rotate secrets at cutover).
- **Credentials relocation is its own step, not part of cutover:** PayPal creds live in env vars read at module level (`src/lib/paypal.ts`), and `PAYPAL_ENV` is global. Per-tenant gateways need creds in the platform/tenant DB (encrypted at rest). Move Tenant #1's creds from env → DB in a separate deploy AFTER cutover stabilizes, with the env path kept as fallback until verified.
- **Uploads:** the symlinked uploads root (`public/uploads/products → /home/ninjaz/uploads/3dninjaz_v1/products`, see `src/actions/configurator.ts`) becomes per-tenant (`UPLOADS_DIR` per tenant). Tenant #1 keeps its existing directory and public URL prefix EXACTLY as-is; new tenants get new roots. Never rewrite stored image paths.
- **Timing:** cutover in the lowest-traffic window, with the existing watchdog + Telegram alerting watched live, and a pre-written go/no-go checklist with a hard rollback trigger ("any checkout failure → roll back, no debugging in prod").

**Warning signs:**
- A migration plan containing `mysqldump ninjaz_3dnp` as a cutover step (backup yes, transfer no).
- A schema diff for the cutover deploy containing `DROP`, `RENAME`, or type changes on existing live tables.
- No written rollback runbook, or a rollback that has never been executed on dev.
- The dev/master squash-divergence pattern resurfacing: a long-lived multi-tenant branch drifting for weeks and producing a conflict-storm merge right before cutover. Keep the retrofit merging to dev continuously behind the registry flag instead.

**Phase to address:**
Dedicated "Tenant #1 cutover" phase, late in the milestone, gated on the dev-fleet rehearsal phase passing. Additive schema prep lands in earlier phases.

---

### Pitfall 7: Fleet schema drift — migrations that ran on some tenant DBs and not others

**What goes wrong:**
Every schema change must now run against N databases. A mid-fleet failure (network blip, lock timeout, disk full, one tenant's data violating a new constraint) leaves the fleet split: code expects the new schema, 20% of tenants still have the old one, and those tenants get 500s until someone notices. Worse, without per-DB version tracking nobody can even SAY which tenants have which schema. This project has an extra landmine: `drizzle-kit push` is already known to hang against this MariaDB over high latency (documented project quirk) — a fleet runner built on it will hang mid-fleet, which is the worst possible failure point.

**Why it happens:**
Single-tenant habits: "run the migration" is one command with one outcome. Fleet migration is a distributed operation with partial-failure semantics, but it arrives disguised as the same one command.

**How to avoid:**
- Migrations are plain SQL files (the project already fell back to raw DDL matching Drizzle's schema byte-for-byte — keep that convention), applied by a purpose-built runner that: iterates tenants from the registry, records per-tenant applied-version in a platform-DB table (tenant_id, migration_id, applied_at, status), stops-and-reports or skips-and-reports per policy, and is idempotent/re-runnable (re-run applies only what's missing).
- Canary order: dev Tenant #0 → a synthetic canary tenant → Tenant #1 (live store) LAST among prod tenants or first depending on risk appetite — but the order is explicit and fixed, not accidental.
- Startup guard: on boot (or on first pool creation per tenant), compare the tenant DB's version to the code's expected version; mismatched tenant → that tenant serves a maintenance page, the rest of the fleet stays up. Never let a version-mismatched tenant serve traffic with mismatched code.
- Additive-first bias: two-step (expand, then contract) migrations so old code tolerates new schema during the rollout window.
- Never `drizzle-kit push` against the fleet. Ever. It's already on the project's banned list for one DB; N DBs makes it worse.

**Warning signs:**
- A migration "playbook" that is a for-loop in someone's shell history rather than a runner with a status table.
- No answer within 30 seconds to "which schema version is tenant X on?"
- Errors mentioning unknown columns for SOME tenants only.

**Phase to address:**
Provisioning/fleet-operations phase (runner + version table ship with tenant provisioning, because provisioning a new tenant = running all migrations from zero — same machinery).

---

### Pitfall 8: Cross-tenant leakage through Next.js caching — `unstable_cache` tags and module state are process-global, tenants are not

**What goes wrong:**
One Node process serves every tenant. Next.js's data cache (`unstable_cache`), `revalidateTag`, full-route cache, and any module-level memoization are process-global. The project ALREADY uses `unstable_cache` + `revalidateTag` for shared-layout data (documented quirk: cross-route cache invalidation). If cache keys/tags aren't tenant-scoped: tenant A's storefront renders tenant B's cached settings/products (first-request-wins poisoning), and tenant A's admin saving a setting revalidates — or fails to revalidate — tenant B's pages. Same for in-memory memoization of "the" site settings, "the" WhatsApp number, "the" brand config: every module-level `let cached` in the codebase is now a cross-tenant bleed.

**Why it happens:**
Caching added under single-tenancy has tenant identity IMPLICITLY (there was only one). Retrofits systematically miss cache keys because they're not in the type system — a function that takes no tenant argument caches globally and TypeScript says nothing.

**How to avoid:**
- Sweep every `unstable_cache` call site: tenant id becomes part of BOTH the key parts and every tag (`settings` → `t:${tenantId}:settings`). Wrap `unstable_cache`/`revalidateTag` in tenant-aware helpers and ban direct imports (same ESLint pattern as Pitfall 1).
- Sweep module-level mutable state: `rg "^(let|var) " src/lib src/actions` and audit each for tenant-dependence.
- Full-route caching / ISR: with host-based tenancy, ensure rendering reads tenant from request context (headers) which forces dynamic rendering, or explicitly key static generation per tenant. Verify with two dev tenants showing different data on the same route.
- Check the proxy layer too: LiteSpeed serving Apache configs may have LSCache or mod_cache semantics on the vhost. If any proxy-level cache is enabled for tenant vhosts, it must vary on Host (per-vhost caches are fine; a shared catch-all vhost cache is not).

**Warning signs:**
- Tenant B's brand name/logo/product flashing on tenant A's domain after a deploy or restart (first-request poisoning signature).
- `revalidateTag("...")` calls with string literals containing no tenant id.
- Any `unstable_cache` wrapper whose function reads tenant from a closure or module scope instead of an argument.

**Phase to address:**
Tenant-context phase (helpers) + a dedicated leakage-audit task in the verification phase, tested with a ≥2-tenant dev fleet.

---

### Pitfall 9: Reseller plugin dissolving the isolation guarantee — cross-database joins and grant sprawl

**What goes wrong:**
The Reseller plugin needs cross-tenant/shared-catalog access — the deliberate exception. Because all tenant DBs sit on the SAME MariaDB server, the seductive implementation is a cross-database SQL join (`SELECT ... FROM ninjaz_t7.orders JOIN ninjaz_platform.catalog ...`) — MariaDB happily allows it if the MySQL user has grants on both. The moment that first join ships: (a) the MySQL user needs grants across DBs, and grant sprawl quietly spreads until "isolation" is a single compromised connection string away from every tenant's data; (b) the fleet is permanently welded to one physical server — no tenant can ever be moved to a second box because queries assume same-server schemas; (c) the platform's core promise ("full data separation") is false, discoverable by any auditor or attacker. Second failure mode: wholesale price leakage — the shared catalog carries platform wholesale prices, and a storefront query that forgets to overlay the tenant's retail margin renders wholesale prices to that tenant's customers.

**Why it happens:**
Same-server database-per-tenant makes the wrong thing easy. The exception ("Reseller needs shared data") arrives without an enforced boundary, so it gets implemented at the lowest layer available — SQL.

**How to avoid:**
- Resolve the open question from PROJECT.md explicitly and early: shared catalog lives in the PLATFORM database, accessed only through a dedicated service layer (`src/lib/reseller/` or plugin API) that takes tenant context and applies the tenant's pricing rules. Tenant-DB code never receives a connection with grants on the platform catalog beyond a read-only user scoped to the catalog tables — and NEVER grants on other tenants' DBs. Enforce at the MySQL grant level, not just code review: `SHOW GRANTS` per user is the audit.
- Ban cross-database table references in SQL: no `db_name.table` qualifiers anywhere in the codebase (`rg "ninjaz_\w+\." src/` as a CI check). All cross-boundary data flows through the service layer in application code — which MariaDB's no-LATERAL constraint already pushed the codebase toward anyway (manual multi-query hydration is the house style; reuse it across the DB boundary).
- Orders for reseller products: snapshot the resolved retail price, wholesale cost, and product data INTO the tenant's order rows at order time (the orders table already snapshots product data — extend the pattern). No FK, no live reference across DBs; the platform learns about reseller orders via an outbox/sync job writing to the platform DB, with the Delyva-style idempotency-key discipline for replays.
- Central inventory (if shared stock is decremented by many tenants): the platform DB is the single write authority with atomic decrements; tenants read availability through the service layer, tolerate staleness, and handle "went out of stock at order time" as a normal checkout failure path.
- Wholesale-price leakage: the service layer's tenant-facing read path must return only tenant-retail prices by construction (separate return type without the wholesale field), so leaking it requires deliberately importing the platform-side type — make the type system do the guarding.

**Warning signs:**
- Any SQL string or Drizzle schema referencing another database's name.
- `SHOW GRANTS` for a tenant's MySQL user listing more than its own DB (plus, at most, read-only catalog tables).
- A "temporary" grant added during Reseller debugging that never got revoked.
- Wholesale price visible in any storefront API response payload (check the JSON, not the UI).

**Phase to address:**
Plugin-architecture phase defines the boundary (service layer + grant model); Reseller phase implements against it. The grant-level audit is a verification-phase check.

---

### Pitfall 10: Everything OUTSIDE the request path stays single-tenant — crons, webhooks, watchdog, email identity

**What goes wrong:**
Tenant resolution via Host header only covers HTTP requests from browsers. The rest of the system has no Host header: cron jobs (Meshy cron, backfill scripts), the crash watchdog, seed/maintenance scripts (`scripts/*.ts` all import the singleton `db`), inbound webhooks (PayPal, Delyva — they hit a URL, and the URL's domain may not be the tenant's), and outbound email (nodemailer hardwired to `noreply@3dninjaz.com` via cPanel SMTP in `src/lib/mailer.ts`). Failure shapes: a cron that processes only Tenant #1 forever (silently — the WhatsApp-silent-skip shape again); a Delyva webhook for tenant B's shipment resolved against tenant A's DB and dropped by the idempotency guard (silent loss of delivery status); tenant stores sending customer email From `noreply@3dninjaz.com` — or worse, From the tenant's domain WITHOUT SPF/DKIM alignment, landing every order confirmation in spam.

**Why it happens:**
The retrofit's mental model is "requests have tenants". Background and inbound-integration surfaces are invisible until one misbehaves, and their failure mode is silence, not errors — this project's history (WhatsApp silent no-send, Delyva webhook process survival) shows these surfaces bite hardest.

**How to avoid:**
- Crons/scripts: every job takes an explicit tenant id or explicitly iterates the registry (`for tenant of activeTenants`) — no ambient default. The banned-singleton compile error from Pitfall 1 forces this at build time for all `scripts/*.ts`.
- Webhooks: tenant identity comes from the webhook REGISTRATION, not the request Host — encode tenant in the webhook path (`/api/webhooks/delyva/[tenantId]` with a per-tenant secret) when registering with each provider. Per-tenant gateway credentials (plugin architecture) imply per-tenant webhook registrations anyway. Verify signature/secret against THAT tenant's stored credentials before touching its DB. Unknown tenant id in a webhook → 404 + loud log, never a default.
- Email: decide per-tenant identity strategy up front. Cheapest viable: send From `<tenant-slug>@notify.<platform-domain>` (platform SPF/DKIM stays valid) with tenant branding in display name and body; per-tenant custom From domains only for tenants who complete DKIM DNS setup — an onboarding checklist item, not a default. Never send From a tenant domain whose DNS you don't control.
- Watchdog/ops: health checks should sample one URL PER TENANT DOMAIN (a `/api/health` that confirms tenant resolution + DB connectivity), not just port-3000-is-up — a single tenant's DB being broken must page, and today's port check can't see it.

**Warning signs:**
- A cron log that mentions no tenant id in any line.
- Delyva/PayPal webhook handlers that resolve tenant from `Host` or from nothing.
- Tenant order-confirmation emails in Gmail spam (SPF/DKIM misalignment signature).
- `scripts/` files untouched by the retrofit diff.

**Phase to address:**
Spread across phases, but make it an explicit checklist in the verification phase: enumerate every non-request entry point (cron, webhook, script, watchdog) and confirm each has explicit tenant handling.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| One MySQL user with grants on all tenant DBs | Simple provisioning, one connection config | Per-user connection cap shared fleet-wide; zero grant-level isolation; one leaked credential = all tenants | Only in the 2-tenant dev fleet; never in prod |
| Cross-database SQL joins for Reseller data | Fast to write, "it's all one server anyway" | Permanently welds fleet to one box; isolation guarantee becomes false; grant sprawl | Never |
| Default unknown Host → Tenant #1 | No 404s during DNS propagation windows | Host-header spoofing, cache poisoning, reset-link poisoning against the LIVE store | Never |
| Keeping PayPal creds in env vars "for now" post-cutover | Cutover deploy is smaller | Blocks plugin architecture; second tenant can't take payments; global `PAYPAL_ENV` can't diverge per tenant | Acceptable for cutover week only, with a dated removal task |
| Copying the full feature-set schema to tenants but skipping the migration-version table | Provisioning ships sooner | Fleet drift undetectable (Pitfall 7); every future migration is a manual audit | Never — version table costs one table |
| Manual per-tenant Apache userdata conf + manual AutoSSL trigger | No provisioning automation needed for tenant #2 | Every onboarding is an SSH session with root; human error on the live proxy config affects ALL vhosts; doesn't scale past ~5 tenants | Acceptable for tenants #2–3 while automation is built, if each step is a written runbook |
| Big-bang branch for the whole retrofit | No flag complexity | Repeats the dev/master squash-divergence conflict storm at 10× size; cutover diff unreviewable | Never — merge continuously behind registry-driven behavior |
| Tenant-prefixing cache tags "where it matters" (partially) | Less sweep work | Partial prefixing is indistinguishable from none — one unprefixed tag leaks; audits can't trust the convention | Never — all or nothing |

## Integration Gotchas

Common mistakes when connecting to external services under multi-tenancy.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| PayPal (per-tenant, via plugin arch) | Reusing module-level env creds (`src/lib/paypal.ts`) so every tenant transacts through the platform's PayPal account; capture verified against the WRONG tenant's credentials | Per-tenant encrypted creds in DB; client built per request from tenant context; capture + amount verification against that tenant's account; per-tenant sandbox/live flag replaces global `PAYPAL_ENV`. Audit the FULL wrapper once (project lesson: audit external APIs in one pass) |
| Delyva | Webhook tenant resolution from Host header; assuming one merchant account serves all tenants | Tenant id in the registered webhook path + per-tenant API creds; idempotency (`delyvaShipmentId` UNIQUE) checked inside the RESOLVED tenant DB; decide explicitly whether tenants share the platform Delyva account (then platform-level dedup table needed) or hold their own |
| cPanel UAPI (provisioning) | Treating provisioning (create DB, create user, grant, run schema, create uploads dir, add domain, trigger AutoSSL, write vhost conf, `lswsctrl reload`) as a script that either fully works or is re-run blindly | Idempotent state machine with per-step recorded status in the registry; every step re-runnable; partial-failure recovery is a first-class path (Delyva-idempotency lesson generalized). Use graceful `lswsctrl reload` only — `restart` is banned on this box |
| Better Auth | Hardcoded `trustedOrigins` (already caused incident `d421bd9`); one auth instance for all tenants; sessions centralized in platform DB | Per-tenant auth instance bound to tenant DB; origins + baseURL derived from tenant registry; platform auth instance separate, on the dedicated platform domain |
| nodemailer / cPanel SMTP | Sending tenant mail From tenant domains without SPF/DKIM; or all tenants From `noreply@3dninjaz.com` confusing customers | Platform-domain From with tenant display-name by default; custom From domain only after tenant completes DKIM/SPF DNS (onboarding checklist gate) |
| Let's Encrypt / AutoSSL | Requesting certs before DNS points at the box; retry loops burning the 5-failures/hour budget; catch-all ProxyPass swallowing DCV | DNS-verification gate before any cert request; `ProxyPass "/.well-known/acme-challenge" "!"` exclusion; explicit `autossl_check` trigger in provisioning; documented acme.sh fallback |
| WhatsApp/Evolution notifications | Notifications hardwired to the platform's number/instance; silent skip on unresolved tenant | Per-tenant notification config with explicit "not configured → log + skip visibly" (not silent); reuse `isDeliverablePhone` guard pattern per tenant |

## Performance Traps

Patterns that work at small scale but fail as usage grows — calibrated to ONE cPanel box, one Node process, one MariaDB instance.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Pool-per-tenant at current `connectionLimit: 10`, no idle reaping | `ER_TOO_MANY_CONNECTIONS` intermittently across ALL tenants; `Threads_connected` never decreases | Pool manager: limit 3–5/tenant, `maxIdle: 1`, `idleTimeout`, LRU cap on live pools; raise `max_connections` deliberately | ~5 tenants (per-user cap) / ~15 tenants (server cap) |
| One Node process serving N storefronts + N admin panels + Meshy/OCR background work | Event-loop lag on every tenant when one tenant does something heavy (bulk import, OCR, Meshy job) | Move heavy work to a separate worker process (same box) reading a job table; keep the web process request-only. The watchdog already knows how to babysit two processes | ~5–10 active tenants, earlier with Meshy/OCR use |
| Per-tenant crons scheduled identically (`*/2` etc.) | Load spikes every interval × N tenants; the evolution-api spawn-loop incident shape (load 100+) repeats | One fleet cron that iterates tenants sequentially with a lock file; never N crontab entries | ~10 tenants |
| MariaDB buffer pool shared across N databases with identical hot tables | All tenants slow down together as fleet grows; cache hit rate drops | Accept (same-box is the locked choice) but monitor; size `innodb_buffer_pool_size` for the fleet, not the single store, when tuning `/etc/my.cnf` | Gradual; noticeable ~20+ tenants |
| Backups as N× mysqldump in sequence during the nightly window | Backup window grows linearly; overlaps with traffic; disk fills (each tenant DB + uploads dir) | Per-tenant dump with compression + retention policy + disk-space alert via existing Telegram watchdog; uploads dirs in the backup plan explicitly | ~10–20 tenants or first large tenant |
| Tenant registry lookup (host → tenant) hitting the platform DB on every request | Added latency on EVERY request fleet-wide; platform DB becomes a single point of failure for all tenants | In-process cache with TTL + explicit invalidation on registry change (the project's own cross-route cache-busting lesson: `revalidateTag`-style, not `revalidatePath('/')`) | Immediately measurable; critical under load |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Unknown Host header resolving to a default tenant | Cache poisoning + password-reset-link poisoning against the live store; phantom domains serving the real catalog | Strict registry allowlist; unknown host → 421/404 static page, loud log (Pitfall 4) |
| Bare `role === "admin"` checks surviving into the three-tier hierarchy | Tenant-admin → super-admin escalation; tenant-admin acting on another tenant via Host manipulation | Scope-bound helpers returning the tenant context whose DB handle the action must use (Pitfall 5) |
| Sessions centralized in platform DB | Any tenant's session token validates on any tenant's domain | Sessions live per-tenant-DB; platform sessions separate |
| MySQL grant sprawl from Reseller debugging | One leaked connection string reads every tenant's customers/orders | Grant-level isolation; `SHOW GRANTS` audit in verification; CI ban on cross-DB qualifiers (Pitfall 9) |
| Tenant gateway credentials in env vars or plaintext DB columns | One box compromise = live payment creds for the whole fleet | Encrypted-at-rest creds column (app-level encryption, key outside the DB); creds never logged; per-tenant creds never returned by any API |
| Webhook handlers accepting unsigned/unattributed posts (existing Delyva HMAC gap, multiplied by N tenants) | Forged shipment/payment events against any tenant | Tenant id in webhook path + per-tenant secret verification; the existing unsigned-Delyva exception must NOT be grandfathered into the multi-tenant handler design |
| Super-admin panel reachable on tenant domains | Larger attack surface; phishing tenants with fake platform-login pages on look-alike tenant routes | Platform surface bound to one dedicated domain; 404 elsewhere |
| Provisioning scripts (seed-admin pattern) run against the wrong DB | Accidental privileged account minted in a tenant DB (or vice versa) | Scripts take explicit `--tenant` / `--platform` target; refuse to run without it; print target and require confirmation |
| Uploads path traversal across tenant roots | Tenant A reading/writing tenant B's product images (invoice-import code already does `path.resolve` containment — pattern must survive per-tenant roots) | Per-tenant upload root from tenant context; containment check against THAT root (extend the existing `resolveInside` pattern in `src/actions/admin-invoice-import.ts` / `configurator.ts`) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Onboarding a tenant before their DNS points at the box | Tenant sees SSL warnings / default vhost page for hours; support burden; burned DCV attempts | Onboarding UI shows DNS instructions + live verification check; cert requested only after DNS verifies; status visible to super-admin |
| Cert issuance delay (daily AutoSSL cycle) treated as "done" at provisioning | Tenant's first visit to their own store is an SSL error | Provisioning triggers `autossl_check` immediately; registry tracks cert status; tenant not marked "live" until cert verified |
| Tenant emails From the platform domain with no explanation | Tenant's customers confused by `noreply@3dninjaz.com` on another brand's receipt | Display-name branding + tenant reply-to; per-tenant From domain as a documented upgrade path |
| Suspending a tenant → raw 502/404 | Tenant's customers see a broken site, blame the tenant | Suspended-tenant state serves a branded "store unavailable" page (extend the existing static Apache error-page pattern) |
| Tenant #1 customers logged out / carts lost at cutover | Live revenue interruption, support tickets | Don't rotate auth secrets, don't move the DB, don't change the domain — pointer cutover preserves sessions and localStorage carts (Pitfall 6) |

## "Looks Done But Isn't" Checklist

- [ ] **Tenant routing:** works for registered domains — verify `curl -H "Host: unknown.test" http://127.0.0.1:3000/` returns 421/404, NOT the live store.
- [ ] **DB isolation:** CRUD works per tenant — verify `rg "from \"@/lib/db\"" src/ scripts/` returns only the resolver layer, and `SHOW GRANTS` per MySQL user shows single-DB scope.
- [ ] **Auth split:** logins work — verify a tenant-admin session is rejected on the platform domain AND on a different tenant's domain, by test, not by reasoning.
- [ ] **Caching:** pages render correctly — verify with TWO dev tenants that differ in every cached surface (settings, catalog, layout), after a cold restart, first request on tenant A then tenant B.
- [ ] **SSL automation:** first tenant cert issued — verify the DCV path exclusion survives `lswsctrl reload`, cert RENEWAL succeeds (60+ days later — calendar it), and a deliberately-wrong-DNS domain fails gracefully without burning retries.
- [ ] **Provisioning:** tenant created end-to-end — verify re-running provisioning on a half-created tenant completes it instead of erroring or duplicating.
- [ ] **Fleet migrations:** migration ran — verify the per-tenant version table matches code expectation for EVERY tenant, and a tenant deliberately left behind serves its maintenance page instead of 500s.
- [ ] **Webhooks:** payment/shipping flows work on Tenant #1 — verify a Delyva/PayPal webhook for tenant B updates tenant B's order while tenant A has an order with the same external id (cross-tenant id collision test).
- [ ] **Crons/scripts:** background jobs run — verify each job's log lines carry a tenant id and cover ALL active tenants, not just Tenant #1.
- [ ] **Reseller plugin:** wholesale pricing works — verify the storefront API payload (raw JSON) for a reseller product contains no wholesale price field, and the platform catalog is unreachable with a tenant's MySQL credentials.
- [ ] **Cutover rollback:** multi-tenant build deployed — verify the PREVIOUS single-tenant build still boots and serves against the same DB (proves additive-only schema held), rehearsed on dev.
- [ ] **Ops visibility:** watchdog green — verify per-tenant health URLs are checked and a single tenant's dead DB pages Telegram while other tenants stay up.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Stale singleton wrote tenant B's data into Tenant #1's DB | HIGH | Identify affected rows by timestamp + request logs; move rows to correct tenant DB with a scripted, reviewed migration; notify affected tenants; add the ESLint ban that should have existed |
| Connection exhaustion took the fleet down | MEDIUM | Immediate: `mysql -e "SHOW PROCESSLIST"` via root socket, kill idle pool connections, restart Node via watchdog; then: deploy pool-manager limits + raise `max_connections`; postmortem the budget math |
| Tenant cert failed / DCV burned rate limits | LOW-MEDIUM | Wait out the failure window (1 failure refills per 12 min); fix DNS/proxy root cause FIRST; use acme.sh + UAPI `install_ssl` manual path to unblock the tenant same-day |
| Tenant-admin escalated to platform actions | HIGH | Treat as incident: audit platform-DB changes since exposure window; rotate platform sessions + secrets; add the scope-bound helper tests that were missing |
| Cutover failed mid-flight | MEDIUM (if additive-only held) / SEVERE (if not) | Additive-only path: redeploy previous single-tenant build against the untouched DB — minutes. If schema was mutated: restore from the pre-cutover dump taken as a cutover gate, accept data loss since cutover, never skip that dump |
| Fleet migration stranded some tenants | MEDIUM | Version table tells you exactly who; stranded tenants serve maintenance page automatically (if the boot guard exists); re-run idempotent runner against stragglers only |
| Cross-tenant cache leak in production | MEDIUM | Restart Node (clears in-process caches) as immediate mitigation; identify the unkeyed cache site; assume leaked data was seen — assess disclosure obligations per what leaked |
| Reseller cross-DB join shipped | MEDIUM-HIGH | Revoke the grants first (breaks the feature, restores the guarantee), then rebuild through the service layer; audit what data was reachable during the window |

## Pitfall-to-Phase Mapping

Phase names are functional — actual numbering belongs to the roadmap. Ordering constraints matter more than numbers.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Stale `db` singleton | Tenant context & DB resolution (first code phase) | Compile-time: old export deleted; `rg` audit clean; ESLint rule active |
| 2. Pool exhaustion | Tenant context & DB resolution + pre-phase MariaDB tuning | Load test 2-tenant dev fleet; `Threads_connected` stable; caps in `/etc/my.cnf` |
| 3. ACME/ProxyPass DCV | Domain & SSL provisioning (spike the exclusion FIRST) | Throwaway domain issued end-to-end; renewal calendared |
| 4. Host-header trust | Tenant registry & routing; auth phase for origins | Unknown-host curl test; reset-email origin test per tenant |
| 5. Role hierarchy | Auth & roles phase (before any super-admin UI) | Cross-surface session rejection tests |
| 6. Tenant #1 cutover | Dedicated cutover phase, gated on dev-fleet rehearsal | Rollback rehearsed on dev; additive-only schema diff; in-flight webhook test |
| 7. Fleet migration drift | Provisioning & fleet operations phase | Version table + boot guard demonstrated by deliberately stranding a dev tenant |
| 8. Cache leakage | Tenant context phase (helpers) + verification audit | Two-tenant cold-start difference test |
| 9. Reseller isolation | Plugin architecture phase (boundary) → Reseller phase (implementation) | `SHOW GRANTS` audit; cross-DB qualifier CI check; wholesale-field payload check |
| 10. Non-request surfaces | Distributed; explicit checklist in verification phase | Enumerated entry-point list, each with tenant-id-bearing logs |

Ordering constraints implied: tenant context/registry → routing → auth split → provisioning/SSL → fleet ops → plugin architecture → Reseller → cutover last-ish (after rehearsal), with the dev fleet running ≥2 tenants from the earliest possible phase.

## Sources

- Codebase (primary — all pitfalls grounded against these): `src/lib/db/index.ts` (singleton pool, connectionLimit 10), `src/lib/auth-helpers.ts` (requireAdmin/requireUser), `src/lib/auth.ts` (hardcoded trustedOrigins), `src/lib/public-url.ts` (env-driven single origin), `src/lib/paypal.ts` (module-level env creds, global PAYPAL_ENV), `src/actions/configurator.ts` + `src/actions/admin-invoice-import.ts` (uploads roots + containment), `.planning/PROJECT.md` (v2.0 milestone scope), `CLAUDE.md` Pivots & Production Quirks (trustedOrigins incident d421bd9, drizzle-kit push hang, Delyva idempotency, WhatsApp silent-skip, dev/master squash divergence, lswsctrl reload-only rule, watchdog/Telegram, evolution-api spawn loop)
- [Let's Encrypt rate limits](https://letsencrypt.org/docs/rate-limits/) — 50 certs/registered-domain/week, 5 auth failures/identifier/hour, 12-min refill
- [AutoSSL Let's Encrypt rate limiting (thecpaneladmin)](https://www.thecpaneladmin.com/autossl-lets-encrypt-rate-limiting/) and [WHC AutoSSL troubleshooting](https://clients.whc.ca/en/knowledgebase/2193/Troubleshoot-and-Fix-cPanel-AutoSSL-Issues.html) — DCV preconditions, domain-must-resolve requirement
- [Custom domains for multi-tenant SaaS (DCHost)](https://www.dchost.com/blog/en/custom-domains-and-subdomains-for-multi-tenant-saas/) and [DNS-01 ACME for multi-tenant SaaS (DCHost)](https://www.dchost.com/blog/en/bring-your-own-domain-get-auto%E2%80%91ssl-how-dns%E2%80%9101-acme-scales-multi%E2%80%91tenant-saas-without-drama/) — DCV failure modes, DNS-verification gating, CDN/proxy interference
- [Atlas: database-per-tenant migration deployment](https://atlasgo.io/guides/database-per-tenant/deploying) and [Bytebase multi-tenant architecture patterns](https://www.bytebase.com/blog/multi-tenant-database-architecture-patterns-explained/) — mid-fleet failure semantics, schema drift detection, per-tenant version tracking
- [Node.js multi-tenancy connection pooling (OneUptime)](https://oneuptime.com/blog/post/2026-01-27-nodejs-multi-tenancy/view) and [mysql2 too-many-connections issue](https://github.com/sidorares/node-mysql2/issues/2362) — LRU pool managers, per-tenant pool sizing, idle-connection leaks
- [cPanel max_connections tuning (Stack Harbor)](https://stackharbor.com/en/knowledge-base/cpdb-tune-max-connections-cpanel/) and [HostGator max_user_connections](https://www.hostgator.com/help/article/max-user-connections-vs-too-many-connections) — MariaDB ~151 default, per-user caps 15–50 on cPanel boxes
- [Next.js multi-tenant guide](https://nextjs.org/docs/app/guides/multi-tenant) and [Next.js cache-poisoning advisory](https://github.com/vercel/next.js/security/advisories/GHSA-gp8f-8m3g-qvj9) and [Cache Components multi-tenant discussion](https://github.com/vercel/next.js/discussions/85239) — tenant-keyed caching, first-request-wins poisoning, module-singleton cache collapse
- [Better Auth dynamic base URL](https://better-auth.com/docs/guides/dynamic-base-url) and [multi-tenant cross-domain issue #4878](https://github.com/better-auth/better-auth/issues/4878) — allowedHosts, host-derived baseURL, cross-domain cookie failure modes
- [AWS DMS rollback strategies](https://aws.amazon.com/blogs/database/rolling-back-from-a-migration-with-aws-dms/) and [database migration patterns (Hatfield)](https://medium.com/@jaredhatfield/database-migration-patterns-6b5ede23d06e) — fall-forward vs fallback, dual-write pitfalls, phased cutover

---
*Pitfalls research for: 3D Ninjaz v2.0 Multi-Tenant Platform retrofit (database-per-tenant, custom domains, cPanel self-hosted)*
*Researched: 2026-07-12*
