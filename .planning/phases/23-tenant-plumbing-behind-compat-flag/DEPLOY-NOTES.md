# Phase 23 — Tenant Plumbing Deploy Notes

This file is the ops record for Phase 23 (Tenant Plumbing Behind Compat Flag),
following the convention established in
`.planning/phases/04-brand-launch/DEPLOY-NOTES.md`.

**File status:** created by plan 23-03 (pool manager). Plan 23-01's Task 3
(create `ninjaz_platform_dev`, run `scripts/phase23-migrate.cjs`, capture
`SHOW CREATE TABLE` output) was a `checkpoint:human-action` delegated to the
orchestrator per `EXEC-GUARDRAILS.tmp.md` — **completed 2026-07-13**, see the
"Platform DB creation (dev)" section at the bottom of this file.

---

## Connection budget (Phase 23)

### Live `max_connections` — VERIFIED on the box (orchestrator, 2026-07-13)

Measured live against the cPanel MariaDB box (`152.53.86.223`) via the app
user over the SSH tunnel (`127.0.0.1:3307`), `SHOW VARIABLES` /
`SHOW STATUS`:

```
max_connections       = 151   (matches the documented MariaDB 10.11 default)
max_user_connections  = 0     (0 = no per-user cap; the fleet is bounded by
                               the 151 global limit, NOT a tighter per-user
                               ceiling — this REMOVES the "~3–5 tenants on a
                               per-user cap" risk PITFALLS.md Pitfall 2 raised)
Threads_connected     = 14    (baseline in-use at measurement time)
```

The `max_user_connections = 0` result is materially good news: PITFALLS.md
Pitfall 2 warned pool exhaustion could hit at ~3–5 tenants IF one MySQL user
held all grants under a tight per-user cap. There is no per-user cap here, so
the real ceiling is the 151 global `max_connections` and the burst math below
governs — the crossover is ~N≈24 tenants, not ~5.

### Fleet connection budget math

Per-process budget (platform pool is a permanent singleton; tenant pools are
lazy, capped by `TENANT_POOL_MAX`, and idle-shrink via `maxIdle: 1` +
`idleTimeout: 60_000`):

- **Platform pool:** 4 connections (singleton, permanent) per Node process.
- **Per active tenant:** up to 3 connections (burst ceiling,
  `connectionLimit: 3`); steady-state ~1 connection per recently-active
  tenant (`maxIdle: 1` shrinks the pool back down within 60s of inactivity).
- **Two Node processes share the box:** dev on `:3000` (`ninjaz_3dn`) and
  prod on `:3001` (`ninjaz_3dnp`) — see CLAUDE.md deploy topology.

**Worst-case burst formula** (both processes, every tenant simultaneously
bursting to its ceiling):

```
2 × (4 + N × 3)
```

| N (active tenants) | Worst-case burst | Steady-state (≈ 1/tenant + platform) |
|---------------------|-------------------|----------------------------------------|
| 1 (single-mode synthesized tenant) | 2 × (4 + 1×3) = 14 | 2 × (4 + 1) = 10 |
| 5  | 2 × (4 + 5×3)  = 38  | 2 × (4 + 5)  = 18  |
| 10 | 2 × (4 + 10×3) = 68  | 2 × (4 + 10) = 28  |
| 15 | 2 × (4 + 15×3) = 98  | 2 × (4 + 15) = 38  |
| 30 | 2 × (4 + 30×3) = 188 | 2 × (4 + 30) = 68  |

Against the documented default `max_connections = 151`: worst-case burst
crosses that ceiling around N≈24 tenants (`2 × (4 + 24×3) = 152`), i.e. the
burst-case headroom runs out before the ~30-tenant point where
`PITFALLS.md` Pitfall 2 flags LRU eviction as "earning its keep." Steady-state
headroom is much larger — the steady-state formula `2 × (4 + N)` only
approaches 151 around N≈71 tenants — so the realistic near-term risk is a
simultaneous cold-start burst across many tenants at once (e.g. a fleet-wide
redeploy or a traffic spike hitting many idle tenants at once), not steady
browsing traffic.

**Pre-Phase-27 ops task:** per `ARCHITECTURE.md` Scaling Considerations, once
the live-measured `max_connections` is recorded above and the fleet
approaches its burst headroom, raise `max_connections` in `/etc/my.cnf`
deliberately (PITFALLS.md suggests 300-500 with per-user caps via
`max_user_connections`) during a maintenance window — this is a one-time,
deliberate ops task, not something Phase 23's code does automatically.

### Single mode adds ZERO pools

In `TENANT_MODE=single` (the current, and only, deployed default — see
`src/lib/db/index.ts` `TENANT_MODE` export), `getTenantDb()` always returns
the existing `src/lib/db` singleton pool regardless of which tenant object is
passed in. **No per-tenant `mysql.createPool()` call ever happens in single
mode** — verified by the `pool-manager.test.ts` assertion that
`mysql.createPool` is not called for the single tenant. The budget math above
only applies once `TENANT_MODE=registry` is flipped to run a multi-tenant dev
fleet (dev-only until the Phase 27 cutover per `ARCHITECTURE.md`).

---

## Platform DB creation (dev) — 23-01 Task 3 (orchestrator, 2026-07-13)

The platform registry database was stood up on the live cPanel box and the
Phase 23 migration applied against it. This is the dev-scoped platform DB; the
prod platform DB (`ninjaz_platform`) is created with the **same procedure**,
deferred to the Phase 27 cutover runbook.

**Database:** `ninjaz_platform_dev` (new, empty — cannot affect the live store
DBs `ninjaz_3dn`/`ninjaz_3dnp`; reversible with `DROP DATABASE ninjaz_platform_dev`).

**Creation path (root-only, why it's a checkpoint):** the app MySQL user
cannot self-serve `CREATE DATABASE`/`GRANT` on this shared cPanel box, so the
orchestrator created it via cPanel **UAPI** over root SSH:

```
uapi --user=ninjaz Mysql create_database name=ninjaz_platform_dev
uapi --user=ninjaz Mysql set_privileges_on_database \
     user=ninjaz_3dn database=ninjaz_platform_dev privileges=ALL
```

- **Grant model:** the SAME app user that owns `ninjaz_3dn` (`ninjaz_3dn`) was
  granted ALL PRIVILEGES on `ninjaz_platform_dev` (shared-app-user model per
  STACK.md; per-tenant MySQL users are a deferred Phase-C hardening decision).
  Verified in `mysql.db`: grants present for all cPanel-managed hosts
  (`127.0.0.1`, `localhost`, `152.53.86.223`, and the whitelisted external IPs).

**Connection note (local runs):** the laptop's public IP is NOT on the box's
Remote-MySQL whitelist, so `:3306` direct is `ER_ACCESS_DENIED`. Local runs of
`scripts/phase23-migrate.cjs` reach the box through the SSH tunnel on
`127.0.0.1:3307` (`ssh -L 3307:127.0.0.1:3306 root@152.53.86.223`), with both
`DATABASE_URL` (charset probe target) and `PLATFORM_DATABASE_URL` overridden to
`127.0.0.1:3307`. `.env.local` carries `PLATFORM_DATABASE_URL` pointing at
`ninjaz_platform_dev` (mirrors `DATABASE_URL`'s host; gitignored).

**Charset probe:** `SHOW CREATE TABLE user` on `ninjaz_3dn` returned
`DEFAULT CHARSET=latin1` — both platform tables were created `latin1` to match
(never hardcoded; probed live per the migration's Phase 23 deviation #2).

**Migration proof (run 1 — apply):** both tables created; `SHOW CREATE TABLE`:

```
CREATE TABLE `tenants` (
  `id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `slug` varchar(128) NOT NULL,
  `dsn` varchar(512) NOT NULL,
  `status` enum('active','suspended') NOT NULL DEFAULT 'active',
  `schema_version` int(11) NOT NULL DEFAULT 0,
  `uploads_prefix` varchar(255) NOT NULL,
  `primary_domain` varchar(255) NOT NULL,
  `settings_json` longtext DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tenants_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci

CREATE TABLE `tenant_domains` (
  `id` varchar(36) NOT NULL,
  `tenant_id` varchar(36) NOT NULL,
  `domain` varchar(255) NOT NULL,
  `is_primary` tinyint(1) NOT NULL DEFAULT 0,
  `ssl_issued_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tenant_domains_domain` (`domain`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci
```

Byte-for-byte matches `src/lib/tenant/platform-schema.ts` (column order/types,
`dsn` varchar(512) full-DSN width, both PKs, both UNIQUE keys, LONGTEXT
`settings_json`, latin1 charset).

**Idempotency proof (run 2):** `Applied (0): none` / `Skipped (2): tenants,
tenant_domains` — the INFORMATION_SCHEMA guard confirmed both tables already
existed and applied nothing. Satisfies Phase 23 success criterion 3.

**Prod (`ninjaz_platform`):** NOT created in this phase. Same UAPI
create-database + grant + migration procedure, executed during the Phase 27
Tenant #1 cutover runbook against a prod-scoped `ninjaz_platform` DB.
