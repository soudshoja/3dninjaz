# Phase 5: Admin Extensions - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning
**Depends on:** Phase 1 (admin scaffold), Phase 3 (admin order management pattern, state machine), Phase 4 (business-info.ts, brand palette)

<domain>
## Phase Boundary

Phase 5 converts the operational admin surface from "just enough to ship v1" (Phase 1 product CRUD + Phase 3 order management) into a full day-to-day operations console. Zero new customer-facing features except **coupon redemption at checkout** and **storefront "sold out" indication** — everything else is admin-only. AI-powered custom generation, 3D viewers, and customer reviews UI remain out of scope (reviews admin-side only — schema + moderation queue; storefront review submission deferred).

The nine features delivered:

1. **User management** — `/admin/users` list non-admin accounts, suspend/unsuspend (leverages Better Auth admin plugin `banned` field already in schema)
2. **Coupons** — `/admin/coupons` CRUD + `/checkout` customer-side apply
3. **Inventory toggle** — per-variant `inStock` + optional `lowStockThreshold` + storefront "sold out" treatment
4. **Bulk CSV import** — `/admin/products/import` upload → preview → commit
5. **Store settings UI** — `/admin/settings` replaces static `src/lib/business-info.ts` with DB-backed + in-memory cache
6. **Analytics dashboard** — upgrade `/admin` page with revenue chart, top products, funnel (Recharts via shadcn Charts)
7. **Email template editor** — `/admin/email-templates` — edit HTML of order-confirmation + password-reset templates with `{{variables}}` + live preview, stored in new `email_templates` table
8. **Reviews moderation** — schema + `/admin/reviews` queue (approve/hide/delete). Storefront review submission UI is OUT of Phase 5
9. **Shipping rates + SST toggle** — `/admin/shipping` flat rate per MY state, free-ship threshold, SST on/off

No new external third-party service. Every feature stays on the already-wired stack:
- MariaDB 10.11 via Drizzle (manual hydration pattern — no LATERAL joins)
- Better Auth session + `requireAdmin()` role gate
- Nodemailer via cPanel SMTP (email templates render to HTML for `sendMail()`)
- shadcn/ui + Tailwind v4 + unified palette (D-01)
- Recharts under the hood of shadcn Charts (new dep)
- papaparse + csv-parse (new deps for CSV handling)
- DOMPurify or isomorphic-dompurify (new dep for email template HTML sanitisation)

## Integration Points (existing codebase)

**Admin shell extension:**
- `src/app/(admin)/layout.tsx` — add 5 new nav entries (Users, Coupons, Settings, Email templates, Reviews, Shipping) to both desktop sidebar + mobile horizontal strip
- `src/components/admin/sidebar-nav.tsx` — add Lucide icons (Users, Tag, Settings, Mail, Star, Truck)

**Schema extensions (one plan):**
- New tables: `coupons`, `coupon_redemptions`, `email_templates`, `reviews`, `store_settings`, `shipping_rates`
- Add columns: `product_variants.in_stock BOOLEAN DEFAULT TRUE`, `product_variants.low_stock_threshold INT NULL`
- No schema change needed for user suspension — Better Auth admin plugin `banned/banReason/banExpires` already present

**Shared utilities reused:**
- `src/lib/auth-helpers.ts` — `requireAdmin()` used as FIRST await in every new action (CVE-2025-29927 mitigation, T-03-30 pattern)
- `src/lib/validators.ts` — extend with coupon, review, shipping, settings Zod schemas
- `src/lib/orders.ts` — reuse `formatOrderNumber`, `OrderStatus` for analytics queries
- `src/lib/format.ts` — `formatMYR` for revenue display
- `src/lib/brand.ts` — unified 5-token palette (D-01) for chart fills/strokes
- `src/lib/mailer.ts` — `sendMail()` consumes email template renders
- `src/lib/business-info.ts` — DEPRECATED in favor of `getStoreSettings()` DB-backed accessor; file retained as fallback defaults only (rename or inline to migrations)
- `src/lib/storage.ts` — pattern reused for CSV upload storage (`public/uploads/imports/<uuid>.csv`) with 24h cleanup

**Admin routes (all under `src/app/(admin)/admin/`):**
- `users/` (list)
- `coupons/` (list + new/[id]/edit)
- `settings/` (single form)
- `email-templates/` (list + [key]/edit)
- `reviews/` (moderation queue)
- `shipping/` (flat rates per state + free-ship threshold + SST toggle)
- `products/import/` (CSV flow)
- `/admin` (existing dashboard page — REPLACE stats cards with analytics)

**Customer-facing surgical touches:**
- `src/app/(store)/checkout/page.tsx` — add "Apply coupon code" input + redemption logic (PROMO-01, PROMO-02) via server action
- `src/components/store/product-card.tsx` + product detail page — show "Sold out" badge when ALL variants `!inStock`
- `src/components/store/size-selector.tsx` (or equivalent) — disable specific size buttons when variant `!inStock` (INV-01)
- `src/actions/orders.ts` (or checkout action) — accept optional `couponCode`, re-validate server-side, apply discount to subtotal, increment coupon usage atomically

## Assumptions (verify with user in open questions)

1. **User-mgmt scope = suspend only.** No password reset, no role promotion (would require admin-promotion UX). Admin can suspend/unsuspend only. Deletion requests go through manual workflow (PDPA) NOT admin panel (T-05-X-PDPA).
2. **Coupon model = simple.** Single-use per customer optional (not hard requirement); percentage OR fixed MYR (not both); min-spend optional; date range optional; usage cap optional. Stackable = NO (one coupon per order, first redemption wins).
3. **Inventory = toggle only.** No quantity tracking (PROJECT.md out-of-scope: "Inventory tracking — manual management fine at low volume"). `inStock` is a boolean. `lowStockThreshold` is an admin-only alert field (admin sees a yellow dot on the product row if low stock is hit — but low stock is manually tracked until real inventory lands).
4. **Analytics = live DB aggregation.** No pre-aggregated `daily_stats` table yet; v1 aggregates on every page load with `createdAt` range filters and `SUM(totalAmount)`. If this becomes slow (>1s at 1000+ orders), Phase 6 adds pre-aggregation. Revenue metric uses orders with status IN ('paid', 'processing', 'shipped', 'delivered') — excludes pending & cancelled.
5. **Funnel = session-level event counts.** "Visits" counted via a new `page_views` table populated by a lightweight middleware insertion (one row per distinct session+path per day). Add-to-bag = Zustand store event writes via `/api/events/track` fire-and-forget. Checkout started = server-action create-order invocation count. Paid = orders with status != 'pending'. If `page_views` proves too noisy → make the middleware opt-in or drop to a `window.__analytics` placeholder; finalize in plan 05-02.
6. **Bulk CSV = additive only, no updates.** CSV creates new products; edits still go through the form. Columns: `name, slug, description, category_name, price_s, price_m, price_l, material_type, estimated_production_days, image_url_1, image_url_2, image_url_3`. Missing columns OK; bad rows reported in preview.
7. **Email templates stored in DB.** Seed on first-run migration with current hardcoded templates for keys `order_confirmation` and `password_reset`. `{{variable}}` substitution happens server-side via a simple regex replace. Admin edits raw HTML (sanitised via DOMPurify before send). Preview renders in an `iframe srcDoc=` sandbox (no JS execution since sanitiser strips script).
8. **Reviews schema = forward-looking.** Admin moderation queue built. Storefront review submission is DEFERRED to future phase. Reviews default `status='pending'` so the moderation queue has data when customer-side lands.
9. **Shipping rates = flat per state, stored as table.** One row per MY state + FT (13 + 3 = 16 rows). Admin edits the price. Free-ship threshold is a single number in `store_settings`. SST toggle is a boolean in `store_settings` — OFF for v1 per Phase 4 D-03, ready to flip. Integration with checkout: `/checkout` action looks up shipping from `shipping_rates` WHERE state = input.state; if order subtotal >= free_ship_threshold, shipping = 0.
10. **Settings = singleton row.** `store_settings` has a single row with id='default'. Lazy-loaded and cached in memory (module-scope `let cached: StoreSettings | null = null` with 60s TTL or manual invalidation on write).
11. **Admin mobile nav overflow.** With 4 (pre-Phase-5) + 7 (new) = 11 nav items, the mobile horizontal chip strip WILL overflow. That's intentional and acceptable — horizontal scroll on chip row is a common pattern (see `admin-order-filter.tsx` precedent). Desktop sidebar stacks vertically as usual.

## Out of Scope (explicit)

- Storefront customer review submission UI (only admin moderation queue + schema)
- Webhook for third-party inventory sync
- Multi-warehouse or multi-location stock
- Coupon stacking (one per order)
- Per-customer coupon restrictions ("new customers only")
- Subscription coupons / recurring discounts
- Customer-facing coupon listing page
- Translation/i18n of coupon messages
- Advanced analytics: cohort retention, LTV, geographic heatmap
- A/B testing of email templates
- Email deliverability analytics (open/click tracking)
- Returns/refunds UI (admin manually issues PayPal refunds via the PayPal dashboard)
- Shipping label printing / tracking number integration
- Tax calculation by line-item category (flat SST on/off only)

</domain>

<open_questions>
## Open Questions (for user before/during execution)

**Q-05-01: Coupon UX on checkout.** Does "Apply coupon" sit above or below order summary? Inline error if invalid, or toast? Should applied discount show as a separate line item (preferred) or bake into subtotal?
→ Claude's guess: inline input ABOVE PayPal buttons, below address form, with inline error messaging and a separate "Discount (COUPON20)" line in the summary. Confirm before execution.

**Q-05-02: Analytics time grain.** Dashboard shows 7/30/90 day toggles — is the chart x-axis daily buckets for all three, or does 90-day switch to weekly? Does revenue chart show gross or net (after discount)?
→ Claude's guess: daily buckets for all three (simpler; 90 days = 90 x-axis points = fine with Recharts). Revenue = `totalAmount` (already post-discount since checkout writes post-discount subtotal). Confirm.

**Q-05-03: Analytics data source for funnel.** Page views require instrumentation — is a middleware-based `page_views` table acceptable (small row-per-session-path-day), or prefer a Vercel Analytics / Plausible integration? Add-to-bag events fire-and-forget via POST /api/events/track?
→ Claude's guess: ship the DB-backed `page_views` table. Middleware-based instrumentation, opt-out via cookie for admins. If the user wants Plausible instead, we swap in Phase 6.

**Q-05-04: Reviews schema depth now vs later.** Minimal (rating 1-5 + text + approved bool) or forward-compatible (rating, text, images, moderator-notes, reported-by-user, helpful-count)?
→ Claude's guess: minimal for Phase 5 (just rating + text + status enum), add optional fields when storefront submission lands.

**Q-05-05: CSV import image handling.** If CSV contains `image_url_1` as an external URL (Unsplash, Cloudinary CDN, etc), do we (a) accept as-is stored in products.images, (b) download + re-host in public/uploads, or (c) reject?
→ Claude's guess: (c) for v1 — reject external URLs; admin must upload images via product form after import. Simpler, no SSRF surface. CSV image columns populate `/uploads/products/...` paths ONLY if admin uploads first. Confirm vs (b) which is "nicer" but adds download + SSRF defense.

**Q-05-06: Low-stock threshold — alert where?**
→ Claude's guess: yellow dot on product row in `/admin/products` + dashboard widget "Low stock alerts (3)". No email. Confirm.

**Q-05-07: User suspend → do existing sessions die immediately?**
→ Claude's guess: Better Auth admin plugin handles `banned=true` on next request; in-flight sessions continue until next call. Acceptable. Confirm if admin wants hard-kick via session deletion.

**Q-05-08: Email template editor HTML safety.** Admin is trusted but defense-in-depth: sanitise via DOMPurify (strips `<script>`, inline handlers) before send AND in preview iframe. Variable substitution happens after sanitisation, and variables are HTML-escaped. Agreed?
→ Claude's guess: yes, DOMPurify server-side before `sendMail()`. Variables stay as `{{customer_name}}` placeholders in the stored HTML; substitution is a regex `replace` over the sanitised HTML with HTML-escaped values. Confirm.

</open_questions>

<canonical_refs>
## Canonical References

### Skills & Research
- `paypal-checkout/SKILL.md` — PayPal refund API (out of scope but referenced in order detail)
- Not needed: no AI/3D skills, no new external services

### Existing Codebase (MUST read before modifying)
- `src/lib/auth-helpers.ts` — `requireAdmin()` pattern
- `src/lib/db/schema.ts` — existing 10 tables: user, session, account, verification, categories, products, product_variants, orders, order_items
- `src/actions/admin-orders.ts` — canonical admin server action pattern (requireAdmin first, manual hydration, revalidatePath, typed return)
- `src/app/(admin)/layout.tsx` — desktop sidebar + mobile horizontal chip strip
- `src/components/admin/sidebar-nav.tsx` — icon + label + active-state pattern
- `src/app/(admin)/admin/orders/page.tsx` — list-page pattern (force-dynamic, filter chips, overflow-x-auto table card)
- `src/app/(admin)/admin/orders/[id]/page.tsx` — detail-page pattern (six-card layout, mobile single-col / md two-col)
- `src/components/admin/admin-order-status-form.tsx` — state-machine form with useTransition
- `src/components/admin/admin-order-filter.tsx` — filter chip pattern
- `src/actions/products.ts` — `ensureImagesArray` + manual category/variant hydration (MariaDB 10.11 JSON-as-LONGTEXT + no LATERAL)
- `src/lib/business-info.ts` — current static business info (becomes DB-backed in plan 05-04)
- `.planning/phases/02-storefront-cart/DECISIONS.md` — D-01 unified palette, D-04 mobile hard rules
- `.planning/phases/03-checkout-orders/03-CONTEXT.md` — D3-20 mobile rules carry forward
- `.planning/phases/04-brand-launch/DECISIONS.md` — D-03 SST off (toggle defaults to false)

### Libraries (new deps — install in 05-01)
- `recharts` (via shadcn Charts) — analytics dashboard
- `papaparse` (client-side CSV preview) + `csv-parse` (server-side streaming commit) — bulk import
- `isomorphic-dompurify` — email template HTML sanitisation
- `date-fns` (already installed? verify) — analytics date range math

### Threat Model Anchors
- T-03-30 baseline: `requireAdmin()` as FIRST await — CVE-2025-29927
- T-03-31 baseline: server-side state-machine validation — apply to coupon validation, order status, review status
- Every plan adds its own threat register; see `<threat_register>` in each PLAN.md

</canonical_refs>