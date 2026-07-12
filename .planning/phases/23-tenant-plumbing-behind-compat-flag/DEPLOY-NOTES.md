# Phase 23 — Tenant Plumbing Deploy Notes

This file is the ops record for Phase 23 (Tenant Plumbing Behind Compat Flag),
following the convention established in
`.planning/phases/04-brand-launch/DEPLOY-NOTES.md`.

**File status:** created by plan 23-03 (pool manager). Plan 23-01's Task 3
(create `ninjaz_platform_dev`, run `scripts/phase23-migrate.cjs`, capture
`SHOW CREATE TABLE` output) is a `checkpoint:human-action` delegated to the
orchestrator per `EXEC-GUARDRAILS.tmp.md` and had not yet run when this file
was created — its "Platform DB creation" section is expected to be appended
here separately, not by this plan.

---

## Connection budget (Phase 23)

### Live `max_connections` — pending orchestrator verification

Per `EXEC-GUARDRAILS.tmp.md` ("Other plans (23-02, 23-03, 23-04) ... None of
them touch a live database"), this agent did **not** open an SSH tunnel or
connect to the live cPanel MariaDB box to run
`SHOW VARIABLES LIKE 'max_connections';`. The budget math below uses the
**documented MariaDB 10.11 default** recorded during Phase 23 research
(`.planning/research/STACK.md` line 72; cross-referenced in
`.planning/research/PITFALLS.md` line 390 via the Stack Harbor / HostGator
cPanel tuning articles):

```
max_connections (documented default, NOT yet measured live) = 151
```

**Action required before this number is trusted for capacity planning:** run
the following against the real box (root socket or an app-user connection,
per `.planning/phases/23-tenant-plumbing-behind-compat-flag/23-03-PLAN.md`
Task 3) and replace this section with the actual output:

```sql
SHOW VARIABLES LIKE 'max_connections';
```

This mirrors how plan 23-01 Task 3 (live platform-DB creation) was delegated
to the orchestrator — see `23-01-SUMMARY.md`.

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
