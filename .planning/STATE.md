---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Phase 04 Brand + Launch complete. Phase 05 Admin Extensions planned — ready to execute."
last_updated: "2026-04-20T00:00:00.000Z"
last_activity: 2026-04-20 -- Phase 04 complete (all 4 plans)
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 16
  completed_plans: 16
  percent: 80
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-12)

**Core value:** Customers can easily browse and buy unique 3D printed products with a simple, clean shopping experience.
**Current focus:** Phase 04 complete — launch-ready. Next: Phase 05 Admin Extensions.

## Current Position

Phase: 04 (Brand + Launch) — COMPLETE
Next Phase: 05 (Admin Extensions)
Plan: 4 of 4 (all complete)
Status: Phase 04 complete, ready for Phase 05
Last activity: 2026-04-20 -- Phase 04 brand + launch shipped

Progress: [████████░░] 80%

## Performance Metrics

**Velocity:**

- Total plans completed: 16
- Phase 01 total duration: ~2 hours executor time (cumulative incremental work)
- Phase 02 total duration: ~35 minutes executor time (single session)
- Phase 03 total duration: ~varies (4 plans shipped)
- Phase 04 total duration: ~100 min across 4 plans
- Average duration: ~20 min / plan

**By Phase:**

| Phase | Plans | Total  | Avg/Plan |
|-------|-------|--------|----------|
| 01    | 4     | ~2h    | ~30min   |
| 02    | 4     | ~35min | ~9min    |
| 03    | 4     | —      | —        |
| 04    | 4     | ~100min| ~25min   |

**Recent Trend:**

- Last 5 plans: 04-01 ✓, 04-02 ✓, 04-03 ✓, 04-04 ✓, v1 launch-ready
- Trend: launch-ready — Phase 4 closed the v1 milestone. robots/sitemap/htaccess shipped, checklist + deploy notes ready for human operator.

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
- 2026-04-20 (Phase 4 DECISIONS.md D-07): Deploy via cPanel Node.js app. Preview live at `3dninjaz.com/v1` via LSWS reverse-proxy to `127.0.0.1:3100`. Document-root swap at launch per DEPLOY-NOTES.md.
- 2026-04-20 (Phase 4 Plan 04-04): Next.js 15 file-based `robots.ts` + `sitemap.ts`. Sitemap is DB-backed (getActiveProducts + getActiveCategories), preview-aware via NEXT_PUBLIC_SITE_URL, fail-soft on DB failure. `.htaccess` with HTTPS+HSTS+security-headers STAGED in `deploy/` for launch-day swap — not auto-applied.
- 2026-04-20 (Phase 4 Plan 04-04): Node app reboot survival via cron `@reboot` + start script (Option A); systemd user unit documented as Option B. cPanel does not expose `loginctl enable-linger` by default, so cron is the reliable path.
- 2026-04-20 (Phase 4 Plan 04-04): HSTS max-age 63072000 (2 years) + preload ready. Submission to hstspreload.org deferred to post-launch +6 months.

### Pending Todos

- **Launch (human-gated, not a code plan)** — follow `.planning/phases/04-brand-launch/LAUNCH-CHECKLIST.md`:
  - D-01 WhatsApp number swap in `src/lib/business-info.ts`
  - D-05 Instagram + TikTok URLs
  - Logo WebP optimisation (DEF-04-03-04)
  - PayPal env → live in cPanel Node app env vars
  - Document root swap (DEPLOY-NOTES.md Path A)
  - Upload `deploy/htaccess-launch.txt` as `/home/ninjaz/public_html/.htaccess`
  - Submit sitemap to Google Search Console
  - `git tag v1.0.0 && git push --tags`
- Phase 5 planning / execution (Admin Extensions).

### Blockers/Concerns

- **Logo LCP (DEF-04-03-04):** `public/logo.png` at 1.55 MB dominates LCP on every route — MUST optimise to WebP before launch.
- **basePath rebuild required at swap:** preview tarball built with `NEXT_PUBLIC_BASE_PATH=/v1`. Rebuild with empty basePath before flipping document root, or the app serves 404s for `_next/static/*`. See DEPLOY-NOTES.md.
- **HSTS lockout risk:** 2-year HSTS with preload is strong; cert renewal failure would lock users out. cPanel AutoSSL renewal monitoring required.
- **Node app reboot survival:** currently `nohup` (dies on reboot). Add cron `@reboot` start script per DEPLOY-NOTES.md Fix A BEFORE launch.
- **D-01 WhatsApp placeholder** + **D-05 social handles** still stubs — both are hard blockers for launch (checklist step 1 + 2).
- Email deliverability to Malaysian addresses — Phase 3 smoke test pending; re-verify against real MY ISP in LAUNCH-CHECKLIST.md step 12.

## Session Continuity

Last session: 2026-04-20T00:00:00.000Z
Stopped at: Phase 04 Brand + Launch complete. Phase 05 Admin Extensions planned — ready to execute.
Resume file: .planning/phases/05-admin-extensions/05-01-PLAN.md (if the phase folder + plans exist; otherwise run /gsd-plan-phase 05).
