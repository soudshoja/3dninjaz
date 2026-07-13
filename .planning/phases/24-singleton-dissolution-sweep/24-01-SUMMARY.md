---
phase: 24-singleton-dissolution-sweep
plan: 01
subsystem: infra
tags: [multi-tenant, mailer, nodemailer, public-url, tenant-context]

# Dependency graph
requires:
  - phase: 23-multi-tenant-plumbing
    provides: "Tenant type (platform-schema.ts), getTenantDb short-circuit pattern (pool-manager.ts), getTenantContext (context.ts)"
provides:
  - "getTenantMailer(tenant) / getTenantMailFrom(tenant) — per-tenant SMTP transport with single-mode short-circuit"
  - "publicOrigin(tenant?) / publicUrl(path, tenant?) — tenant-aware outbound URL builder, registry-domain sourced, never Host-derived"
  - "sendResetPasswordEmail/sendMail optional tenant param, routed through the mailer cache"
affects: [25-super-admin-provisioning, 26-super-admin-panel, 27-tenant-cutover]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-mode short-circuit: `if (process.env.TENANT_MODE !== \"registry\" || tenant.id === \"single\") return <today's singleton>` — mirrored from pool-manager.ts's getTenantDb into mailer-cache.ts's getTenantMailer/getTenantMailFrom"
    - "Optional trailing tenant param on existing exported functions preserves back-compat for all pre-Wave-2 callers (publicOrigin/publicUrl/sendMail/sendResetPasswordEmail)"
    - "Dynamic import inside a function body to break a static circular import (mailer.ts <-> tenant/mailer-cache.ts)"

key-files:
  created:
    - src/lib/tenant/mailer-cache.ts
  modified:
    - src/lib/public-url.ts
    - src/lib/mailer.ts

key-decisions:
  - "SMTP overrides read from tenant.settings.smtp (host/port/user/password); tenant.settings.mailFrom for From-address override — both optional, falling back to platform SMTP_*/MAIL_FROM env when absent, so a registry-mode tenant with no override behaves like the platform transport"
  - "No LRU eviction on the tenant-mailer Map (unlike pool-manager.ts's TENANT_POOL_MAX) — transports are cheap and the fleet is small; flagged in-code as a Phase 25 follow-up"
  - "resolveSender() dynamic-imports tenant/mailer-cache.ts from mailer.ts to avoid a static circular import, since mailer-cache.ts imports getMailer/MAIL_FROM from mailer.ts"

patterns-established:
  - "Leaf-infrastructure tenant-awareness: optional tenant arg + single-mode short-circuit to the exact existing singleton, zero behavior change until TENANT_MODE=registry is flipped"

requirements-completed: [TEN-02]

# Metrics
duration: ~15min
completed: 2026-07-13
---

# Phase 24 Plan 01: Per-Tenant Mailer + Tenant-Aware Public URL Summary

**Per-tenant SMTP transport cache (getTenantMailer/getTenantMailFrom) and tenant-aware publicOrigin/publicUrl, both short-circuiting to today's exact env-driven singletons under TENANT_MODE=single.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-13T16:07:16+08:00
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `src/lib/tenant/mailer-cache.ts` created: `getTenantMailer(tenant)` and `getTenantMailFrom(tenant)`, mirroring pool-manager.ts's `getTenantDb` short-circuit pattern exactly — single mode returns `getMailer()`/`MAIL_FROM` untouched, registry mode lazily builds and caches a per-tenant nodemailer transport from `tenant.settings.smtp` with platform SMTP_* env fallback.
- `publicOrigin()`/`publicUrl()` in `src/lib/public-url.ts` gained an optional trailing `tenant?: Tenant` param. In registry mode with a non-"single" tenant, origin is `https://${tenant.primaryDomain}` — sourced only from the registry, never from `headers()`/Host (Pitfall 4 reset-link poisoning guard). No tenant arg, or single mode, preserves today's exact env chain.
- `sendResetPasswordEmail`/`sendMail` in `src/lib/mailer.ts` gained an optional `tenant?: Tenant` param, resolved via a new `resolveSender()` helper that picks `getMailer()`+`MAIL_FROM` when tenant is undefined, or `getTenantMailer`/`getTenantMailFrom` (dynamic import, avoids a static circular import) when a tenant is supplied.

## Task Commits

Each task was committed atomically:

1. **Task 1: Per-tenant mailer cache (getTenantMailer) with single-mode short-circuit** - `500b861` (feat)
2. **Task 2: Tenant-aware publicOrigin()/publicUrl() + mailer senders route through tenant transport** - `258b9fe` (feat)

## Files Created/Modified
- `src/lib/tenant/mailer-cache.ts` (created) - `getTenantMailer`/`getTenantMailFrom`, hot-reload-safe `global.__tenantMailers` Map, single-mode short-circuit to `getMailer()`/`MAIL_FROM`
- `src/lib/public-url.ts` (modified) - `publicOrigin(tenant?)`/`publicUrl(path, tenant?)`, registry-domain-sourced origin in registry mode, unchanged env fallback otherwise
- `src/lib/mailer.ts` (modified) - `resolveSender()` helper; `sendResetPasswordEmail`/`sendMail` gain optional `tenant` param; `getMailer()`/`MAIL_FROM` exports left untouched

## Decisions Made
- SMTP overrides live under `tenant.settings.smtp` (host/port/user/password) and `tenant.settings.mailFrom` — both optional; absence means the registry-mode tenant transport is built from the same platform `SMTP_*` env values `getMailer()` uses (no schema change, no new columns — `settings` is already a JSON/LONGTEXT column per Phase 23).
- Used a dynamic `await import("@/lib/tenant/mailer-cache")` inside `resolveSender()` in mailer.ts rather than a static top-level import, because mailer-cache.ts statically imports `getMailer`/`MAIL_FROM` from mailer.ts — a static import cycle. Confirmed `tsc --noEmit` clean with this approach.
- No LRU eviction added to the tenant-mailer Map, per plan instruction — documented in-code as a Phase 25 follow-up (T-24-01-03 in the plan's threat register, disposition "accept").

## Deviations from Plan

None - plan executed exactly as written. Both tasks' `<action>` blocks were followed concretely; all acceptance criteria (grep + tsc) passed on first attempt with no rework.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. (Per-tenant SMTP override is opt-in via `tenant.settings.smtp`, populated by the Phase 25/26 provisioning tooling, not required for this wave.)

## Next Phase Readiness

- Leaf infrastructure for Wave 1 is complete: `getTenantMailer`/`getTenantMailFrom` and tenant-aware `publicOrigin`/`publicUrl` exist and are byte-identical to today's behavior under `TENANT_MODE=single` (the deployed mode).
- Wave 2 (auth factory) can now close over `getTenantMailer` for per-tenant password-reset email delivery, and over `publicOrigin(tenant)` for reset-link generation without ever touching the incoming Host header.
- No existing call site was edited — `sendMail`, `sendResetPasswordEmail`, `publicUrl`, `publicOrigin` all remain callable with zero args exactly as before; the ~17 existing call sites referenced in the plan are deliberately left for later waves.

## Verification

- `npx tsc --noEmit` (filtered `| grep -v '^\.next/'` to exclude pre-existing stale `.next/` meshy type artifacts, per plan note): **0 output, exits 0 — CLEAN** after both tasks and confirmed again at the end of the plan.
- `rg -c "TENANT_MODE" src/lib/tenant/mailer-cache.ts` → 5 (>=1 required)
- `rg -c "getMailer\(\)" src/lib/tenant/mailer-cache.ts` → 2 (>=1 required)
- `rg "export function getTenantMailer" src/lib/tenant/mailer-cache.ts` → matched (line 87)
- `rg -c "primaryDomain" src/lib/public-url.ts` → 2 (>=1 required)
- `rg "headers\(" src/lib/public-url.ts` → 0 matches (origin never sourced from Host)
- `rg "tenant\?: Tenant" src/lib/mailer.ts` → matched (3 sites: `resolveSender`, `sendResetPasswordEmail` opts, `sendMail` opts)
- `git status --short` after both commits shows only pre-existing untracked `.agents/` and `skills-lock.json` (out of scope for this plan) — no stray modified/untracked files from this work.
- `git diff --diff-filter=D --name-only HEAD~2 HEAD` → empty (no accidental file deletions across both task commits).

**Single-mode byte-identical proof:** the acceptance grep `rg -c "getMailer\(\)" src/lib/tenant/mailer-cache.ts` (2 matches — both inside the `TENANT_MODE !== "registry" || tenant.id === "single"` short-circuit branches of `getTenantMailer`/`getTenantMailFrom`) proves the registry-mode code path is dead under the deployed `TENANT_MODE=single`: every call returns the pre-existing `getMailer()` transport / `MAIL_FROM` constant unchanged. Combined with `rg "headers\(" src/lib/public-url.ts` → 0 (no Host-derived origin exists in the file at all, single-mode or otherwise), no outbound URL or mail transport can diverge from today's behavior while `TENANT_MODE` stays `single`.

## Self-Check: PASSED

- `src/lib/tenant/mailer-cache.ts` — FOUND
- `src/lib/public-url.ts` — FOUND (modified)
- `src/lib/mailer.ts` — FOUND (modified)
- Commit `500b861` — FOUND in `git log --oneline`
- Commit `258b9fe` — FOUND in `git log --oneline`

---
*Phase: 24-singleton-dissolution-sweep*
*Completed: 2026-07-13*
