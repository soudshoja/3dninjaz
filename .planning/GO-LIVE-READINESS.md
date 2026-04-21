# Go-Live Readiness Report

**Generated:** 2026-04-21  
**App URL:** https://app.3dninjaz.com/  
**Apex (coming-soon):** https://3dninjaz.com/ (to be decommissioned at launch)

---

## What Admin Must Do Before Flipping Live (Top Priority)

1. Fill real WhatsApp number + Instagram/TikTok URLs at `/admin/settings`
2. Optimise logo: `public/logo.png` (1.55 MB) → WebP ~200 KB, replace file, redeploy
3. Build Privacy Policy + Terms of Service pages (code, not admin task)
4. ~~Rebuild app without `/v1` basePath~~ — N/A (already serves at subdomain root with no basePath set)
5. Fill cost defaults at `/admin/settings` (filament/g, electricity/kWh, labor/hr, overhead %)
6. Send a test order end-to-end with live PayPal to verify capture + email delivery

---

## A. Products / Operations

| Item | Status | Notes |
|------|--------|-------|
| Products have real photos | ⚠️ Needs admin check | Cannot verify from code. Admin must confirm no placeholder images are active. |
| Product prices sensible (MYR) | ⚠️ Needs admin check | Admin must review all active product variant prices before launch. |
| Product weights populated | ⚠️ Needs admin check | `product_variants.weightKg` drives Delyva shipping quotes. Zero/null weight returns RM 0 quote. |
| Shipping origin = real workshop address | ⚠️ Needs admin action | Set at `/admin/shipping` → Origin section. Currently may be placeholder. |
| Shipping contact email + phone real | ⚠️ Needs admin action | Set at `/admin/settings` → Contact section. |
| Free shipping threshold (RM 200) | ⚠️ Needs admin check | Configured at `/admin/shipping`. Verify the threshold value is correct. |
| Cost defaults filled | ⚠️ Needs admin action | `/admin/settings` → Cost Defaults. Required for profit reporting to be meaningful. |
| End-to-end order test in staging | ⚠️ Needs admin action | Place a real order with live PayPal, confirm capture, confirm email received. |

---

## B. Payments

| Item | Status | Notes |
|------|--------|-------|
| `PAYPAL_ENV=live` on server | ✅ Ready | Switched 2026-04-20. OAuth verified. |
| Live PayPal client ID in bundle | ✅ Ready | Set via `NEXT_PUBLIC_PAYPAL_CLIENT_ID` env on server. |
| Live checkout test | ⚠️ Needs admin action | Admin must place a small live order (RM 1 test product) to confirm capture end-to-end. |
| PayPal Reporting scope enabled | ⚠️ Needs PayPal support | `reporting/search/read` scope returns NOT_AUTHORIZED on nightly recon. Contact PayPal support to enable Reporting feature on merchant account. Recon cron will keep failing until resolved. |

---

## C. Auth + Users

| Item | Status | Notes |
|------|--------|-------|
| Admin password rotated from default | ⚠️ Needs admin action | Run `ADMIN_RESET_PASSWORD=1 npx tsx scripts/seed-admin.ts` if default password was never changed. |
| Better Auth `trustedOrigins` includes prod domain | ✅ Ready | `https://3dninjaz.com` added in commit `d421bd9`. |
| Password reset flow | ✅ Ready | Uses `authClient.requestPasswordReset()` via cPanel SMTP. |
| Email verification | ✅ Ready | Optional — enabled in Better Auth config. |

---

## D. Email

| Item | Status | Notes |
|------|--------|-------|
| SMTP config valid | ✅ Ready | cPanel SMTP via `noreply@3dninjaz.com`. Config in `.env.local`. |
| Sender address works | ✅ Ready | `noreply@3dninjaz.com` configured in `src/lib/mailer.ts`. |
| Test email sent to real inbox | ⚠️ Needs admin action | Send a test order confirmation to `info@3dninjaz.com` or a personal MY inbox. Verify not spam. |
| 12 templates reviewed | ⚠️ Needs admin review | Preview all templates at `/admin/email-templates`. Check subject lines + copy for Malaysian audience tone. |
| Unsubscribe flow | ✅ Ready | Token-based unsubscribe at `/api/unsubscribe?token=<hex>` + `/unsubscribed` page. |
| `order_cancelled` send trigger | ⚠️ Deferred | Template exists; send trigger not wired (no admin cancel flow yet). Not a launch blocker. |
| `review_request` scheduled send | ⚠️ Deferred | Template exists; 3-day post-delivery cron not built. Not a launch blocker. |

---

## E. Shipping (Delyva)

| Item | Status | Notes |
|------|--------|-------|
| Origin address correct | ⚠️ Needs admin check | Set at `/admin/shipping`. Verify street, city, postcode, state are the real workshop. |
| Delyva API key + secret set | ✅ Ready | `DELYVA_API_KEY` + `DELYVA_API_SECRET` in `.env.local`. |
| 4 webhooks registered | ✅ Ready | `shipment.created`, `shipment.accepted`, `shipment.picked_up`, `shipment.delivered` registered against prod URL in commit `6272653`. |
| Test: book real shipment + verify label | ⚠️ Needs admin action | Book a test shipment from `/admin/orders/[id]`. Confirm label URL opens, tracking webhook fires. |
| Free-shipping threshold | ⚠️ Needs admin check | Confirm RM 200 threshold is set correctly at `/admin/shipping`. |

---

## F. Content

| Item | Status | Notes |
|------|--------|-------|
| About Us copy | ✅ Ready | Aligned with user spec in commit `9660ca6`. |
| Contact info real | ⚠️ Needs admin action | WhatsApp `60000000000` is a placeholder. Fill real number at `/admin/settings`. |
| Social URLs | ⚠️ Needs admin action | Instagram + TikTok are `#` placeholders. Fill at `/admin/settings`. Footer hides icons when empty — no broken links. |
| Privacy policy page | ❌ Blocked | No `/privacy` page exists. Required for PDPA compliance — registration checkbox links to it. Must be built before launch. |
| Terms of service page | ❌ Blocked | No `/terms` page exists. Needed for legal coverage. Build before launch. |
| Error pages branded | ✅ Ready | 404, 500, maintenance pages + Apache 502/503/504 static fallbacks all live. |

---

## G. Technical

| Item | Status | Notes |
|------|--------|-------|
| `/admin/inventory` removed | ✅ Ready | Inventory managed inline in product form (Phase 13). Nav item removed. |
| `/admin/email-templates` auth-gated | ✅ Ready | Returns 307 redirect to login for unauthenticated requests. |
| `/admin/shipping/delyva` auth-gated | ✅ Ready | Returns 307. |
| Branded 502/503/504 Apache fallback | ✅ Ready | Static HTML in `public/errors/` served via Apache `Alias` + `ErrorDocument`. |
| Coming-soon `noindex` on apex | ⚠️ Needs action at launch | `https://3dninjaz.com/` coming-soon page has `<meta robots="noindex">`. Remove or swap domain on launch day. |
| Node persistence on reboot | ✅ Ready | `@reboot` cron registered. Verified in Phase 7 deploy. |
| SSL cert valid | ✅ Ready | cPanel AutoSSL on `3dninjaz.com`. Verify renewal monitoring is on. |
| Sitemap | ✅ Ready | `/sitemap.xml` — DB-backed, product + category URLs. Submit to Google Search Console post-launch. |
| Robots.txt | ✅ Ready | `/robots.txt` — generated by Next.js. Verify after domain swap to apex. |
| basePath rebuild for domain swap | ✅ N/A | App already serves at subdomain root with no basePath. No rebuild needed at domain transition. |
| Analytics | ❌ Not set up | No GA4 or Plausible wired. Not a hard blocker but blind to traffic at launch. |

---

## H. Legal / Compliance

| Item | Status | Notes |
|------|--------|-------|
| Privacy policy at `/privacy` | ❌ Blocked | Not built. PDPA 2010 requires this. Registration checkbox should link here. |
| Terms of service at `/terms` | ❌ Blocked | Not built. |
| Cookie consent banner | ⚠️ Low priority | MY market does not legally require; good hygiene. Defer post-launch. |
| GST/SST at checkout | ⚠️ Assumption | SST toggle exists in shipping config but is OFF. Prices shown are SST-exclusive. Confirm with accountant whether SST applies to this business before launch. |
| Business registration in footer | ⚠️ Needs admin check | Footer may show company name from `store_settings`. Confirm registration number is displayed if legally required. |

---

## I. SEO

| Item | Status | Notes |
|------|--------|-------|
| Meta tags (title, description) | ✅ Ready | Set via Next.js `metadata` exports. Verify each key page has a unique description. |
| Open Graph images | ⚠️ Partial | OG image configured at root. Product pages may not have product-specific OG images. |
| Structured data (Product schema) | ⚠️ Unknown | Cannot verify from code audit. Check PDP source for `application/ld+json`. |
| Sitemap submitted | ⚠️ Post-launch task | Submit `https://3dninjaz.com/sitemap.xml` to Google Search Console after domain swap. |

---

## J. Marketing Readiness

| Item | Status | Notes |
|------|--------|-------|
| Newsletter signup | ✅ Ready | Footer form + `/api/subscribe` + double opt-out unsubscribe. |
| Admin subscriber CSV export | ✅ Ready | `/admin/subscribers` → Export CSV button. |
| Social handles filled | ⚠️ Needs admin action | Instagram + TikTok at `/admin/settings`. |
| Launch announcement plan | ⚠️ Admin decision | No code dependency. Decide: soft launch (share link privately first) or open launch. |

---

## Summary Verdict

**NOT ready to launch yet.** Two hard code blockers exist, plus several admin actions required.

### Hard Blockers (code work needed before launch)
1. **Privacy Policy page** (`/privacy`) — PDPA 2010 compliance; registration consent checkbox links to it
2. **Terms of Service page** (`/terms`) — legal coverage

### Admin Actions Required Before Launch (no code needed)
1. Fill real WhatsApp number + Instagram/TikTok at `/admin/settings`
2. Optimise `public/logo.png` to WebP (~200 KB); replace file on server
3. Verify + fill Delyva origin address at `/admin/shipping`
4. Fill cost defaults at `/admin/settings` (filament, electricity, labor, overhead rates)
5. Test a live PayPal order end-to-end + verify order confirmation email lands in inbox (not spam)
6. Review all 12 email templates at `/admin/email-templates` for tone + correctness
7. Rotate admin password if not already changed from default

### Proceed After Code + Admin Actions
- Contact PayPal support to enable Reporting API (NOT_AUTHORIZED on recon cron — not a launch blocker but fix ASAP)
- Submit sitemap to Google Search Console post-domain-swap
- `git tag v1.0.0 && git push --tags`
