---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Phase 01 Foundation complete. Ready to execute Phase 02 Storefront + Cart."
last_updated: "2026-04-19T23:45:00.000Z"
last_activity: 2026-04-19 -- Phase 01 complete (all 4 plans)
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 4
  completed_plans: 4
  percent: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-12)

**Core value:** Customers can easily browse and buy unique 3D printed products with a simple, clean shopping experience.
**Current focus:** Phase 02 — Storefront + Cart

## Current Position

Phase: 01 (Foundation) — COMPLETE
Next Phase: 02 (Storefront + Cart)
Plan: 4 of 4 (all complete)
Status: Phase 01 complete, ready for Phase 02
Last activity: 2026-04-19 -- Phase 01 foundation shipped

Progress: [██▌░░░░░░░] 25%

## Performance Metrics

**Velocity:**

- Total plans completed: 4
- Phase 01 total duration: ~2 hours executor time (cumulative incremental work)
- Average duration: ~30 min / plan

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01    | 4     | ~2h   | ~30min   |

**Recent Trend:**

- Last 5 plans: 01-01 ✓, 01-02 ✓, 01-03 ✓, 01-04 ✓
- Trend: steady velocity, no blockers

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Init: Per-variant pricing (ProductVariant table with S/M/L prices) — must be in Phase 1 schema, not retrofitted
- Init: Server-side PayPal price capture — never trust client-sent amounts
- Init: Handler-level admin auth checks required — middleware alone is bypassable (CVE-2025-29927)
- Init: Stack locked — Next.js 15 + Drizzle + Neon PostgreSQL + Better Auth + Cloudinary + Zustand + Resend + Vercel
- 2026-04-16: Stack pivot — Neon→cPanel MySQL, Cloudinary→local filesystem uploads, Resend→cPanel SMTP. Reason: self-hosted on 3dninjaz.com cPanel, full access granted.
- 2026-04-16: Project renamed — Print Ninjaz → 3D Ninjaz. Logo uploaded as /public/logo.png (placeholder, admin-replaceable later).
- 2026-04-19: App-generated UUIDs (randomUUID) for products, categories, variants in application code — so image upload paths can be built before INSERT (needed for the drag-and-drop uploader's pre-save bucket).
- 2026-04-19: Manual relation hydration replaces Drizzle's `with: {}` — MariaDB 10.11 does NOT support LATERAL joins (parse error). Multi-query fan-out + in-memory join is the workaround.
- 2026-04-19: JSON columns on MariaDB are stored as LONGTEXT; mysql2 does not auto-parse. Added `ensureImagesArray` at the read path to return a proper string[].
- 2026-04-19: Better Auth password reset uses `authClient.requestPasswordReset(...)` (not the older `forgetPassword` name).
- 2026-04-19: Admin user is seeded via `auth.api.signUpEmail` (matches Better Auth's password hashing pipeline) then role promoted to 'admin' via direct Drizzle update — Better Auth's `createUser` endpoint ignores role unless called with an authenticated admin session.

### Pending Todos

None yet.

### Blockers/Concerns

- Email deliverability to Malaysian addresses — needs smoke test during Phase 3 (send a real reset password email via cPanel SMTP)
- PayPal Sandbox MYR currency support — verify before building Phase 3 checkout
- SST compliance threshold — confirm with accountant before launch (Phase 4)
- Orphaned `public/uploads/products/new/` files after failed product create flow — Phase 4 housekeeping task
- Future plans may need `with: { relation }` Drizzle queries; document the LATERAL-on-MariaDB limitation in CLAUDE.md if we see it hit again

## Session Continuity

Last session: 2026-04-19T23:45:00.000Z
Stopped at: Phase 01 Foundation complete — 4/4 plans shipped. Ready to execute Phase 02 Storefront + Cart.
Resume file: .planning/phases/02-storefront-cart/02-01-PLAN.md (if the phase folder exists)
