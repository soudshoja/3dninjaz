---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Phase 02 Storefront + Cart complete. Ready to execute Phase 03 Checkout + Orders."
last_updated: "2026-04-19T16:45:00.000Z"
last_activity: 2026-04-19 -- Phase 02 complete (all 4 plans)
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 8
  completed_plans: 8
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-12)

**Core value:** Customers can easily browse and buy unique 3D printed products with a simple, clean shopping experience.
**Current focus:** Phase 03 — Checkout + Orders (PayPal integration)

## Current Position

Phase: 02 (Storefront + Cart) — COMPLETE
Next Phase: 03 (Checkout + Orders)
Plan: 4 of 4 (all complete)
Status: Phase 02 complete, ready for Phase 03
Last activity: 2026-04-19 -- Phase 02 storefront + cart shipped

Progress: [█████░░░░░] 50%

## Performance Metrics

**Velocity:**

- Total plans completed: 8
- Phase 01 total duration: ~2 hours executor time (cumulative incremental work)
- Phase 02 total duration: ~35 minutes executor time (single session)
- Average duration: ~20 min / plan

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01    | 4     | ~2h   | ~30min   |
| 02    | 4     | ~35min| ~9min    |

**Recent Trend:**

- Last 5 plans: 01-04 ✓, 02-01 ✓, 02-02 ✓, 02-03 ✓, 02-04 ✓
- Trend: accelerating — Phase 2 leveraged Phase 1 scaffolding (auth, DB, admin) cleanly, no blockers.

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
- 2026-04-16: Project renamed — Print Ninjaz → 3D Ninjaz. Logo uploaded as /public/logo.png.
- 2026-04-19: App-generated UUIDs (randomUUID) for products, categories, variants in application code.
- 2026-04-19: Manual relation hydration replaces Drizzle's `with: {}` — MariaDB 10.11 does NOT support LATERAL joins. Multi-query fan-out + in-memory join is the workaround. Phase 2's src/lib/catalog.ts uses the same pattern.
- 2026-04-19: JSON columns on MariaDB are stored as LONGTEXT; mysql2 does not auto-parse. `ensureImagesArray()` helper called on every read path.
- 2026-04-19: Better Auth password reset uses `authClient.requestPasswordReset(...)`.
- 2026-04-19: Admin user seeded via `auth.api.signUpEmail` then role promoted to 'admin' via direct Drizzle update.
- 2026-04-19 (Phase 2 DECISIONS.md D-01): Unified 3-color palette everywhere (blue/green/purple + ink/cream). Replaces Phase 1 "Template A" green/orange tokens. Admin AND storefront use the same palette — no split.
- 2026-04-19 (Phase 2 DECISIONS.md D-02): User-facing vocabulary is "bag" — `/bag` route, "Your bag" drawer/page headings, "Add to bag" buttons. Internal file/var names stay `cart-*` to minimize diff.
- 2026-04-19 (Phase 2 DECISIONS.md D-03): `/checkout` returns 404 until Phase 3 ships. Accepted; link exists now in drawer + /bag page.
- 2026-04-19 (Phase 2 DECISIONS.md D-04): Mobile-first is non-negotiable. 390×844 + 375×667 viewports validated. Tap targets 48px secondary / 60px primary. Vaul bottom-sheet on ≤768px.
- 2026-04-19 (Phase 2): Cart persisted via Zustand `persist` middleware at localStorage key `print-ninjaz-cart-v1`. `isDrawerOpen` excluded via `partialize` so reload doesn't reopen drawer. MAX_PER_LINE=10 soft cap (D2-20).

### Pending Todos

- Phase 3: `/checkout` page (currently 404). See D-03.
- Phase 3: Customer order history page.
- Phase 3: Server-side PayPal capture endpoint + webhook.
- Phase 3: Pre-checkout cart validation (drop lines where product was deleted/deactivated — see T-02-04-06).

### Blockers/Concerns

- Email deliverability to Malaysian addresses — needs smoke test during Phase 3 (send a real order confirmation email via cPanel SMTP).
- PayPal Sandbox MYR currency support — verify before building Phase 3 checkout.
- SST compliance threshold — confirm with accountant before launch (Phase 4).
- Orphaned `public/uploads/products/new/` files after failed product create flow — Phase 4 housekeeping.
- Pre-existing Phase 1 TS error in `src/lib/orders.test.ts` (import extension `.ts`) — documented in `.planning/phases/02-storefront-cart/deferred-items.md`. Does not affect runtime. Fix with GSD-quick before Phase 3 adds order tests.
- Phase 2 leaves a dangling `/checkout` link in the drawer + /bag page — intentional per D-03; Phase 3 owner should land on /checkout first.

## Session Continuity

Last session: 2026-04-19T16:45:00.000Z
Stopped at: Phase 02 Storefront + Cart complete — all 4 plans shipped (02-01 brand primitives, 02-02 store shell + homepage + shop, 02-03 PDP, 02-04 Zustand cart + vaul drawer + /bag). Ready for Phase 03 Checkout + Orders.
Resume file: .planning/phases/03-checkout-orders/03-01-PLAN.md (if the phase folder exists; otherwise run /gsd-plan-phase 03).
