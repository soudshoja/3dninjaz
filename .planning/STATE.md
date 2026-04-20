---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Phase 07 complete — manual orders + PayPal ops mirror + image pipeline + branded errors all live."
last_updated: "2026-04-20T02:10:00.000Z"
last_activity: 2026-04-20 -- Phase 07 complete (9/9 plans, ADM-16..ADM-23 + IMG-01..IMG-03 + ERR-01..ERR-03 closed)
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 39
  completed_plans: 39
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-12)

**Core value:** Customers can easily browse and buy unique 3D printed products with a simple, clean shopping experience.
**Current focus:** Phase 07 complete. Manual orders end-to-end with PayPal payment links, /admin/payments mirrors PayPal Activity dashboard, refund flow with two-step confirm + idempotent webhook, dispute management, nightly recon cron (waiting on PayPal Reporting feature enablement — Q-07-08), sharp image pipeline with WebP/AVIF/JPEG variants + long-cache headers, branded 404/500/maintenance pages with maintenance-mode middleware.

## Current Position

Phase: 07 (Manual Orders + PayPal Ops Mirror + Image Pipeline + Custom Errors) — COMPLETE (all 9 plans)
Next Phase: v1.0 launch (human-gated launch checklist + verifier sweeps for Phases 5/6/7)
Status: All 39 v1.0 plans complete across 7 phases
Last activity: 2026-04-20 -- Phase 07 deployed live; cron registered; PayPal Reporting NOT_AUTHORIZED logged to recon_runs (Q-07-08 — admin contacts PayPal support)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 30
- Phase 01 total duration: ~2 hours executor time (cumulative incremental work)
- Phase 02 total duration: ~35 minutes executor time (single session)
- Phase 03 total duration: ~varies (4 plans shipped)
- Phase 04 total duration: ~100 min across 4 plans
- Phase 05 total duration: ~195 min across 7 plans (parallel with Phase 06)
- Phase 06 total duration: ~98 min across 7 plans
- Average duration: ~20 min / plan

**By Phase:**

| Phase | Plans | Total  | Avg/Plan |
|-------|-------|--------|----------|
| 01    | 4     | ~2h    | ~30min   |
| 02    | 4     | ~35min | ~9min    |
| 03    | 4     | —      | —        |
| 04    | 4     | ~100min| ~25min   |
| 05    | 7     | ~195min| ~28min   |
| 06    | 7     | ~98min | ~14min   |
| 07    | 9     | ~120min| ~13min   |

**Recent Trend:**

- Last 7 plans (Phase 5): 05-01 ✓, 05-02 ✓, 05-03 ✓, 05-04 ✓, 05-05 ✓, 05-06 ✓, 05-07 ✓
- Trend: Phase 5 Admin Extensions complete in single executor session running in parallel with Phase 6. All ADM-07..ADM-15, PROMO-01/02, INV-01/02, REV-01, SHIP-01, SETTINGS-01, REPORT-01 requirements closed.

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
- 2026-04-19 (Phase 6 06-01): drizzle-kit push hung against cPanel MariaDB (Phase 3 01 precedent). Fallback raw-SQL applicator at scripts/phase6-migrate.cjs ships the 4 new tables (addresses, wishlists, order_requests, reviews) + user.deletedAt column. Uses latin1 charset to match existing user/products tables (FK constraint requires identical charset).
- 2026-04-19 (Phase 6 06-01): requireUser() helper added with hot+cold dual deletedAt check (defense-in-depth against Better Auth ban propagation lag).
- 2026-04-19 (Phase 6 06-01): @react-pdf/renderer 4.5.1 added as runtime dep for invoice PDF rendering.
- 2026-04-19 (Phase 6 06-03): Address cap = 10 per user (Q-06-08 implicit; Assumption 8). One-default-per-user enforced via db.transaction (MariaDB no partial unique index).
- 2026-04-19 (Phase 6 06-04): Wishlist cap = 50 items per user (Q-06-08 resolution). UNIQUE(user_id, product_id) DB-side + ER_DUP_ENTRY catch as idempotent success. ProductCard restructured to outer relative div with sibling WishlistButton (avoids nested-interactive-element HTML invalidity).
- 2026-04-19 (Phase 6 06-05): Buyer-gate via server-side INNER JOIN order_items + orders WITH status IN paid|processing|shipped|delivered (T-06-05-buyer). Reviews 'Former customer' anonymisation when user.deletedAt set (T-06-05-PDPA). Wave-3 slot strategy: 06-05 commits stub components for 06-06; /orders/[id]/page.tsx edited only once.
- 2026-04-19 (Phase 6 06-06): Invoice PDF route at /orders/[id]/invoice.pdf via @react-pdf/renderer renderToStream → Buffer; Cache-Control private, no-store; in-process Map rate limit 10/user/hour. Cancel/return one-pending-per-order rule enforced at app layer; admin approve-cancel atomic via db.transaction + assertValidTransition.
- 2026-04-19 (Phase 6 06-07): Account closure anonymizes email to deleted-<userId>@3dninjaz.local (frees original for re-registration per Q-06-07); db.transaction wraps anonymize + addresses delete + wishlists delete + session delete; best-effort Better Auth banUser outside transaction. Re-registration with original email creates a brand-new disjoint account.
- 2026-04-19 (Phase 5 05-01): Phase 5 schema landed via raw SQL migration (scripts/phase5-migrate.cjs) — 6 new tables (coupons, coupon_redemptions, email_templates, store_settings, shipping_rates, events) + 2 product_variants columns (in_stock, low_stock_threshold). 16 MY state rows seeded in shipping_rates at 0.00. The schema.ts/validators.ts edits were committed via Phase 6's d9bf71a (parallel append-only writes — both phases coexisted cleanly).
- 2026-04-19 (Phase 5 05-02): Q-05-02 daily buckets for all 7d/30d/90d ranges. Q-05-03 client onClick → /api/events/track endpoint (sha256 IP hash, 100 req/min/IP rate limit). Q-05-07 Better Auth banned=true; in-flight sessions die at next request (accepted). Recharts (NOT shadcn Chart wrapper) used directly — saves a dep.
- 2026-04-19 (Phase 5 05-03): Q-05-01 coupon UX: input above PayPal in summary card, separate -RM line, inline error. Coupon code threaded through PayPal customId='COUPON:CODE' to survive approval→capture (avoids adding columns to orders). Atomic redemption via UPDATE coupons SET usage_count=usage_count+1 WHERE id=? AND (usage_cap IS NULL OR usage_count < usage_cap) — race-safe.
- 2026-04-19 (Phase 5 05-04): /admin/inventory standalone page (avoided product-form refactor). store_settings cached 60s in module-global; lazy-seeded on first read. shipping_rates seeded by migration; getShippingRate is customer-safe (no requireAdmin). paypal.ts now uses getShippingRate(state, subtotal) instead of hardcoded "0.00".
- 2026-04-19 (Phase 5 05-05): Q-05-05 REJECT external image URLs in CSV (zero SSRF surface). Single-transaction commit, full rollback on any failure. Template CSV generated client-side from a 12-column header constant; no separate static file. 24h cleanup of public/uploads/imports/ deferred (cron task).
- 2026-04-19 (Phase 5 05-06): Q-05-08 DOMPurify strict allowlist; FORBID_ATTR explicit on event handlers; ALLOW_DATA_ATTR=false. items_table is the only HTML_VARS member. Preview iframe uses srcDoc + sandbox='' (no allow-scripts). Existing email senders refactored to renderTemplate with legacy hardcoded fallback during rollout.
- 2026-04-19 (Phase 5 05-07): Q-05-04 minimal review schema (rating + body + status enum). Default filter 'pending'. Hard delete with 2-step confirm (no audit log v1). Sidebar badge prop-drilled from layout via getPendingReviewCount.
- 2026-04-20 (Phase 7 07-01): Schema additions land via raw-SQL applicator (drizzle-kit push hangs on remote MariaDB — Phase 6 06-01 precedent). 9 new orders columns + 3 new tables (payment_links, dispute_cache, recon_runs). custom_images stored as LONGTEXT (MariaDB JSON quirk). recon_runs.runDate is VARCHAR(10) yyyy-mm-dd to sidestep mysql2 timezone coercion in cron CJS.
- 2026-04-20 (Phase 7 07-02): @paypal/paypal-server-sdk v2.3.x has NO DisputesController — direct fetch + cached OAuth bearer for all dispute + reporting endpoints. paypalApiBase + getAccessToken added to src/lib/paypal.ts; sibling files paypal-refund.ts / paypal-disputes.ts / paypal-reporting.ts.
- 2026-04-20 (Phase 7 07-03): Manual order URL contains ONLY 192-bit token (T-07-X-PII-on-payment-link). Customer-email sentinel format manual+<orderId>@3dninjaz.local for orders without an email. Public route lives at root /payment-links/[token] (NOT under (store)) so storefront chrome doesn't render.
- 2026-04-20 (Phase 7 07-04): /admin/payments enriched with gross/fee/net + refund chip filter. PaymentDetail cache-hydrates orders.paypalFee/Net/sellerProtection/settleDate on first successful PayPal getCaptureDetails call. settle date proxied via updateTime when status=COMPLETED (SDK exposes no explicit settle_date).
- 2026-04-20 (Phase 7 07-05): Q-07-01 default applied — two-step confirm refund. Server-side cap amount <= remaining. PAYMENT.CAPTURE.REFUNDED webhook idempotent via GREATEST(local, paypal.total_refunded). Reusable rate-limit.ts (5/min refunds, 10/min disputes).
- 2026-04-20 (Phase 7 07-06): Q-07-07 default applied — 15-min cache stale window + manual Refresh button. ensureDisputeMapped() refuses unknown disputeIds AND cached rows with orderId=null (T-07-06-dispute-spoof). SidebarNav badge handler generalised to switch on item.badge key (serves both pendingReviewCount + reconDriftCount).
- 2026-04-20 (Phase 7 07-07): Q-07-08 PayPal Reporting API NOT_AUTHORIZED on first cron run — script writes status='error' + errorMessage to recon_runs as designed; admin will see badge + dashboard widget pointing at /admin/recon. Reporting feature must be enabled by PayPal support before drift detection can begin. Cron registered at @daily on cPanel.
- 2026-04-20 (Phase 7 07-08): writeUpload return shape changed from file URL to base URL (directory). pickImage(baseUrl) reads manifest.json and emits 3 sources (avif/webp/jpeg) with srcset enumerating all widths. ProductCard converted to async server component. ProductGallery (client) accepts pre-resolved PictureData[] from PDP page (server). Cache-Control: public, max-age=31536000, immutable on /uploads/*.
- 2026-04-20 (Phase 7 07-09): Q-07-05 default applied — env-only MAINTENANCE_MODE toggle. BrandedFiveHundred props strictly { requestId, reset? } — error.message/stack NEVER passed (T-07-09-error-page-leak). /payment-links/** added to maintenance allowlist (customers paying for manual orders shouldn't be blocked).
- 2026-04-20 (Phase 7 deploy): Two deploy iterations needed — first build had no basePath (404s for everything); second build with NEXT_PUBLIC_BASE_PATH=/v1 + custom server.js that strips /v1 prefix before passing to Next handler. server.js now honours HOST=127.0.0.1 from start.sh (was binding to public IP via HOSTNAME env). All routes verified live: /v1/admin/orders/new (307 auth), /v1/admin/payments (307), /v1/admin/disputes (307), /v1/admin/recon (307), /v1/some-bogus (404 branded), /v1/payment-links/invalid (200 branded "not found"), /v1/maintenance (200), /v1/api/paypal/webhook POST (400 missing sig). sharp 0.34.5 installed natively on cPanel CloudLinux Node 20.

### Pending Todos

- **Launch (human-gated, not a code plan)** — follow `.planning/phases/04-brand-launch/LAUNCH-CHECKLIST.md`:
  - D-01 WhatsApp number swap (now in /admin/settings — admin can edit at runtime via 05-04 settings form)
  - D-05 Instagram + TikTok URLs (also editable via /admin/settings)
  - Logo WebP optimisation (DEF-04-03-04)
  - PayPal env → live in cPanel Node app env vars
  - Document root swap (DEPLOY-NOTES.md Path A)
  - Upload `deploy/htaccess-launch.txt` as `/home/ninjaz/public_html/.htaccess`
  - Submit sitemap to Google Search Console
  - `git tag v1.0.0 && git push --tags`
- Phase 5 + Phase 6 verifier sweeps (`/gsd-verify-phase 05` and `/gsd-verify-phase 06`).
- 24h cleanup cron for `public/uploads/imports/` (deferred from 05-05).
- Optional follow-up: migrate storefront pages (about/contact/privacy/terms/whatsapp-cta) from `business-info.ts` BUSINESS const to `getStoreSettingsCached()` so admin edits surface without code change. Currently business-info.ts retained for back-compat; 05-04 added the DB-backed accessor only.

### Blockers/Concerns

- **Logo LCP (DEF-04-03-04):** `public/logo.png` at 1.55 MB dominates LCP on every route — MUST optimise to WebP before launch.
- **basePath rebuild required at swap:** preview tarball built with `NEXT_PUBLIC_BASE_PATH=/v1`. Rebuild with empty basePath before flipping document root, or the app serves 404s for `_next/static/*`. See DEPLOY-NOTES.md.
- **HSTS lockout risk:** 2-year HSTS with preload is strong; cert renewal failure would lock users out. cPanel AutoSSL renewal monitoring required.
- **Node app reboot survival:** `@reboot /home/ninjaz/apps/3dninjaz_v1/start.sh` cron is registered (verified by Phase 7 deploy crontab listing).
- **D-01 WhatsApp placeholder** + **D-05 social handles** still stubs — both are hard blockers for launch (checklist step 1 + 2).
- Email deliverability to Malaysian addresses — Phase 3 smoke test pending; re-verify against real MY ISP in LAUNCH-CHECKLIST.md step 12.
- **PayPal Reporting API NOT_AUTHORIZED (Q-07-08):** Phase 7 nightly recon cron is installed but first run errored with NOT_AUTHORIZED. Admin must contact PayPal support to enable the Reporting feature on the live merchant account. Until then, recon_runs.status='error' on every run; drift detection is paused but admin sees the error on /admin/recon.
- **Sharp deploy footprint:** sharp native binaries add ~80MB to node_modules but are required for the Phase 7 image pipeline. Install was clean on cPanel CloudLinux Node 20 — no fallback needed.
- **Custom server.js basePath stripping:** Apache forwards `/v1/*` -> `127.0.0.1:3100/v1/*` and Next does NOT auto-strip basePath at the request layer. Custom server.js now manually strips `/v1` prefix before calling `handle(req, res, parsedUrl)`. If anyone re-deploys WITHOUT this server.js, every route will 404. See `/home/ninjaz/apps/3dninjaz_v1/server.js`.

## Session Continuity

Last session: 2026-04-20T02:10:00.000Z
Stopped at: Phase 07 complete (all 9 plans). Manual orders + PayPal ops mirror + sharp image pipeline + branded errors live on https://3dninjaz.com/v1. Cron registered. Q-07-08 NOT_AUTHORIZED handled gracefully.
Resume file: .planning/LAUNCH-CHECKLIST.md (Phase 4) for human-gated launch tasks; run `/gsd-verify-phase 05`, `/gsd-verify-phase 06`, `/gsd-verify-phase 07` to validate. Then PayPal Support contact for Reporting API enablement (Q-07-08).
