---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 18 Plan 06 complete — variant-editor.tsx now mounts ColourPickerDialog behind a Pick from library button on Colour-named options; confirm runs through refresh() (Pattern B). Plan 18-07 (PDP swatch grid + always-visible name caption) is next.
last_updated: "2026-04-26T07:12:14Z"
last_activity: 2026-04-26
progress:
  total_phases: 18
  completed_phases: 7
  total_plans: 62
  completed_plans: 46
  percent: 74
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-12)

**Core value:** Customers can easily browse and buy unique 3D printed products with a simple, clean shopping experience.
**Current focus:** Phase 18 — Colour Management

**Session 2026-04-21 closeout:**

- All 52 session commits deployed + verified live
- Master + dev branches synced
- Delyva service catalog fix deployed (admin clicks Refresh → populates ~100 services from Grab/Pos Laju/GDEx/J&T/City-Link)
- PayPal live + reporting scope grant pending (Q-07-08)
- Admin guide live at `/admin/guide` with 32 articles + launch checklist link
- Email system complete: 12 templates wired, lifecycle triggers for order_confirmation/paid/shipped/delivered + password_reset/email_verification/newsletter
- Social icons + subscribers list + About Us + error pages (404/500/maintenance) all live
- Theme lightened, brand icons added, cost breakdown UI polished
- Outstanding admin tasks before launch: fill WhatsApp/Instagram/TikTok, fill cost defaults, place live PayPal test order, verify email delivery, optimize logo to WebP
- Node persistence confirmed working; SSL + sitemap ready
- Not ready to launch until admin data tasks complete + privacy/terms pages built + logo optimized

**Next action:** Human-gated launch — see `.planning/GO-LIVE-READINESS.md`.

## Current Position

Phase: 18 (Colour Management) — EXECUTING
Plan: 7 of 9 (6 complete: 18-01 schema foundation + 18-02 seed parser + 18-03 admin CRUD + 18-04 delete/cascade-rename + 18-05 picker modal + 18-06 variant-editor integration)
Next Phase: GO-LIVE — admin must complete checklist items in GO-LIVE-READINESS.md
Status: Ready to execute
Last activity: 2026-04-26

Progress: [██████████] 100% (code) | Pre-launch admin actions pending

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
| Phase 18 P02 | 10 | 1 tasks | 1 files |
| Phase 18 P03 | 50 | 6 tasks | 9 files |
| Phase 18 P04 | 10 | 4 tasks | 3 files |
| Phase 18 P06 | 5 | 4 tasks | 4 files |

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
- 2026-04-20 (Phase 4 DECISIONS.md D-07): Deploy via cPanel Node.js app. Initial plan: preview at `3dninjaz.com/v1`. Revised 2026-04-21: app now lives at `app.3dninjaz.com/` (subdomain root, no basePath).
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
- 2026-04-20 (Phase 7 deploy iteration 2): build with NEXT_PUBLIC_BASE_PATH=/v1 + custom server.js that strips /v1 prefix before passing to Next handler. server.js honours HOST=127.0.0.1 from start.sh. All routes verified live on `/v1/` subpath. sharp 0.34.5 installed natively on cPanel CloudLinux Node 20.
- 2026-04-21 (Phase 7 / deploy revised): App topology changed from `/v1` subpath to subdomain root (`app.3dninjaz.com/`). No basePath in the bundle. Custom server.js still in place but no longer strips basePath (Apache now proxies `/` instead of `/v1`). Documentation updated in CLAUDE.md, DEPLOY-NOTES.md, LAUNCH-CHECKLIST.md to reflect current state.

- 2026-04-22 (Phase 17 AD-01): Sale price time-gate at read — `isOnSale` computed in `hydrateProductVariants` at query time using `now = new Date()`. No cron or cache invalidation required; stale reads within a single request cycle are acceptable.
- 2026-04-22 (Phase 17 AD-02): Variant image upload reuses Phase 7 `writeUpload` pipeline (multi-resolution avif/webp/jpeg + manifest). `pickImage(baseUrl)` resolves PictureData server-side in PDP page.tsx; passed as `variantPictures: Record<string, PictureData | null>` prop to ProductDetail.
- 2026-04-22 (Phase 17 AD-03): Bulk edit via checkbox toolbar in variant-editor.tsx. BulkOp discriminated union: set-price | multiply-price | add-price | set-sale-price | set-active | delete. Single `bulkUpdateVariants` server action; Pattern B refetch after completion.
- 2026-04-22 (Phase 17 AD-04): OOS combo gating: `disabled` + `aria-disabled` + `tabIndex=-1` + `title="Out of stock"` on both swatch and pill buttons. onClick guard returns early if `!available`.
- 2026-04-22 (Phase 17 AD-05): Single-default invariant enforced via `db.transaction` in `setDefaultVariant` action: clear all `is_default=false` for product, then set target variant `is_default=true`. App-layer transaction, no DB trigger.
- 2026-04-22 (Phase 17 AD-06): Reactivity contract for variant-editor.tsx — Pattern A: optimistic update + rollback on error (field edits: price, sale price, stock, SKU, weight). Pattern B: `getVariantEditorData` full refetch after shape-changing ops (generate matrix, add/remove option, image upload, bulk ops, delete). `router.refresh()` never called in any mutation path.
- 2026-04-22 (Phase 17 AD-07): Legacy cleanup findings (L-01..L-19) executed as atomic commits. Each finding = one commit. ~11 commits landed in 17-04.
- 2026-04-22 (Phase 17 AD-08): Per-variant shipping weight — `weight_g INT NULL` on `product_variants`. Delyva quote resolution ladder: `variant.weight_g ?? product.shippingWeightKg × 1000 ?? defaultWeightKg` (0.5 kg). `console.warn` emitted on final fallback citing variantId + productId. `CartItemForQuote.variantId` made mandatory; all callers updated.

- 2026-04-26 (Phase 18 Plan 01): Schema foundation shipped. `colors` table (11 cols, InnoDB latin1 to match `product_option_values` charset) + `product_option_values.color_id VARCHAR(36) NULL` FK with `ON DELETE RESTRICT`. Live DDL applied via SSH-tunneled mysql client (cPanel Remote MySQL whitelist had rotated off the local dev IP); migration script proven idempotent end-to-end on the cPanel host (Node 20 + mysql2). Drizzle schema byte-aligned to `SHOW CREATE TABLE`. Helpers shipped: `slugifyColourBase` + `buildColourSlugMap` (D-14 cross-brand collision suffix), `getColourPublic` / `getColourAdmin` (REQ-7 — codes/family/previous_hex never customer-facing), `getReadableTextOn` (WCAG 2.2 SC 1.4.11 luminance), `colourSchema` Zod validator. Wave 2 (`18-02-PLAN.md` seed script) unblocked.
- [Phase ?]: 2026-04-26 (Phase 18 Plan 02): HTML colour seed parser shipped. scripts/seed-colours.ts uses regex+Function-eval (D-01) anchored on 'const order =' to extract data block; section-key → (familyType, familySubtype) lookup tables for both brands; idempotent natural-key upsert. First run inserted 351 rows (95 Bambu + 256 Polymaker); second run reports 0 inserts / 0 updates. Polymaker dual (21 rows) + gradient (10 rows) skipped at seed time per RESEARCH P-3. Em-dash code normalised to NULL per P-4. Local IP whitelist re-applied via root SSH + uapi --user=ninjaz Mysql add_host (same wall as Plan 18-01).
- 2026-04-26 (Phase 18 Plan 03): /admin/colours CRUD module shipped. 6 server actions in src/actions/admin-colours.ts (list/get/create/update/archive/reactivate), each starting with `await requireAdmin()` first await per CVE-2025-29927. 3 RSC route files (list/new/[id]/edit). ColourForm client component with 8 fields + native `<input type="color">` swatch picker bidirectionally synced with hex text input + live URL slug preview via slugifyColourBase. ColourRowActions Base UI dropdown — DropdownMenuLabel wrapped in DropdownMenuGroup per CLAUDE.md commit 51a90c9 (Base UI 1.3 quirk). + New colour CTA uses BRAND.ink (UI-SPEC override; coupons uses BRAND.green). Sidebar nav entry below Coupons. Hard-delete + cascade-rename deferred to Plan 18-04. Rule 1 deviation: extracted pure slug helpers into src/lib/colour-slug.ts so client-side colour-form.tsx imports don't pull mysql2/Drizzle/node:* APIs into the browser bundle through @/lib/colours; back-compat re-export keeps Plan 18-01 server-side callers working unchanged.
- [Phase ?]: 2026-04-26 (Phase 18 Plan 04): deleteColour + renameColour + IN_USE guard shipped. MutateResult discriminated union extends with IN_USE branch. getProductsUsingColour uses 3-query manual hydration (pov→option→product) per MariaDB no-LATERAL rule. renameColour wraps cascade in db.transaction with diff-aware WHERE (D-11 manual-wins): UPDATE pov SET value=:new, swatch_hex=:new WHERE color_id=:id AND value=:pre.name. 1000-row D-12 guardrail returns error before transaction starts. labelCache nulled across all 6 positional option slots in parallel inside transaction (mirror renameOptionValue at variants.ts:288-294). FK violation race-condition catch re-runs guard and re-surfaces IN_USE. colour-row-actions.tsx Delete dropdown opens two-step modal that swaps to IN_USE error mode showing affected products with /admin/products/:id/edit Open links + Archive-instead recovery CTA. colour-form.tsx edit submit calls renameColour FIRST when name/hex changed (cascade-safe), then updateColour for non-cascade metadata.
- 2026-04-26 (Phase 18 Plan 06): variant-editor.tsx integration shipped. Module-scoped isColourOption helper (case-insensitive `name === "color" || === "colour"`) gates 4 sites: input placeholder relabel ("Add custom (not in library)..."), section header caption ("Custom (not in library)"), Pick from library button (with lucide:Palette icon), helper-text paragraph below the row. ColourPickerDialog mounts as a sibling to the existing delete-option/delete-value dialogs at the JSX bottom; pickerOptionId state (string | null) supports multiple Colour-named options on the same product without ambiguity. alreadyAttachedColourIds computed inline at mount via options.find().values.map(v => v.colorId).filter(Boolean) into Set<string>. onConfirmed wired to `await refresh()` — Phase 17 AD-06 Pattern B refetch contract preserved (no router.refresh() anywhere). HydratedOptionValue.colorId field added (was missing from public type even though Plan 18-01 schema had the column); both hydration mappers (variants.ts, catalog.ts) updated to surface it. REQ-6 6-axis cap verified by inspection: addProductOption guard at existing.length >= 6 is name-agnostic; picker dialog has zero references to addProductOption. Stale Plan 18-04 reference on /admin/colours/[id]/edit page intro updated to current cascade-rename behaviour.

### Pending Todos

- **Launch (human-gated)** — see `.planning/GO-LIVE-READINESS.md` for the full checklist. Top blockers:
  - WhatsApp real number at `/admin/settings` (placeholder `60000000000`)
  - Instagram + TikTok URLs at `/admin/settings`
  - Logo WebP optimisation (`public/logo.png` 1.55 MB → WebP ~200 KB)
  - ~~Document root swap + rebuild without basePath~~ — N/A (app already at subdomain root, no basePath)
  - Privacy policy + Terms of Service pages (not yet built)
  - Submit sitemap to Google Search Console post-launch
  - `git tag v1.0.0 && git push --tags`
- PayPal Reporting API enablement — contact PayPal support (Q-07-08 NOT_AUTHORIZED).
- 24h cleanup cron for `public/uploads/imports/` (deferred from 05-05).
- `order_cancelled` email send trigger (template exists; admin cancel action not yet built).
- `review_request` scheduled send 3 days post-delivery (template exists; cron task not built).
- Auto stock decrement on order capture (Phase 13 deferred item).
- Optional: migrate `business-info.ts` static consts to `getStoreSettingsCached()` so About/Contact pages reflect admin edits without redeploy.

### Blockers/Concerns

- **Logo LCP (DEF-04-03-04):** `public/logo.png` at 1.55 MB dominates LCP on every route — MUST optimise to WebP before launch.
- ~~**basePath rebuild required at swap**~~ — N/A (2026-04-21): app now serves at subdomain root with no basePath. Domain swap is Apache/DNS only, no rebuild needed.
- **HSTS lockout risk:** 2-year HSTS with preload is strong; cert renewal failure would lock users out. cPanel AutoSSL renewal monitoring required.
- **Node app reboot survival:** `@reboot /home/ninjaz/apps/3dninjaz/start.sh` cron is registered (verified by Phase 7 deploy crontab listing).
- **D-01 WhatsApp placeholder** + **D-05 social handles** still stubs — both are hard blockers for launch (checklist step 1 + 2).
- Email deliverability to Malaysian addresses — Phase 3 smoke test pending; re-verify against real MY ISP in LAUNCH-CHECKLIST.md step 12.
- **PayPal Reporting API NOT_AUTHORIZED (Q-07-08):** Phase 7 nightly recon cron is installed but first run errored with NOT_AUTHORIZED. Admin must contact PayPal support to enable the Reporting feature on the live merchant account. Until then, recon_runs.status='error' on every run; drift detection is paused but admin sees the error on /admin/recon.
- **Sharp deploy footprint:** sharp native binaries add ~80MB to node_modules but are required for the Phase 7 image pipeline. Install was clean on cPanel CloudLinux Node 20 — no fallback needed.

### Roadmap Evolution

- 2026-04-24: Phase 16 added — Product Variant System (Generic Options). Replaces rigid `productVariants.size` enum with generic options/values/variants model. Supports size+color AND parts-based products. Plans not yet created.
- 2026-04-24: Phase 17 added — variant enhancements + reactivity + legacy cleanup. Planned by Opus, executed by Sonnet, deploy: Haiku. Closes the 5 critical WooCommerce gaps surfaced by the Phase 16 gap analysis (sale price, variant image upload + PDP swap, bulk edit toolbar, OOS hardening, default pre-selection), codifies the admin-editor reactivity contract (AD-06 — Pattern A optimistic + Pattern B `getVariantEditorData` refetch; no `router.refresh()` in mutation paths), and executes a 19-finding legacy cleanup sweep (SizeSelector/SizeGuide deletion, `"S"|"M"|"L"` purge, `legacyAddToCart` removal, admin-guide rewrite, CSV price_s/m/l back-compat removal, stale JSDoc comments). Schema adds 5 columns to `product_variants`: `sale_price`, `sale_from`, `sale_to`, `is_default`, `weight_g`. `order_items` schema untouched. 5 plans shipped 2026-04-22.

## Session Continuity

Last session: 2026-04-26T07:12:14Z
Stopped at: Phase 18 Plan 06 complete — variant-editor.tsx integrates ColourPickerDialog behind a Pick from library button on Colour-named options. isColourOption helper, pickerOptionId state, alreadyAttachedColourIds derivation, Custom (not in library) caption + helper copy, Pattern B refetch via await refresh(). HydratedOptionValue.colorId surfaced in public type + both hydration mappers. REQ-6 6-axis cap verified untouched. Plan 18-07 (PDP swatch grid + always-visible name caption) is next.
Resume file: None
