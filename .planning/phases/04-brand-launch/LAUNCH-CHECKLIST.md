# 3D Ninjaz — Launch-Day Checklist

**Target launch date:** 2026-06-01 (Malaysia)
**Phase:** 04 — Brand + Launch
**Plan:** 04-04 (final phase plan)
**Current preview:** `https://app.3dninjaz.com/` (Node app on 127.0.0.1:3100, LSWS reverse-proxy to subdomain)

Grep each section heading for checkboxes at launch. A single item left
unchecked is a go/no-go conversation with the team. The "hard blockers"
section must be 100% green before flipping domain root.

---

## Hard blockers (BLOCK launch if any are unchecked)

### 1. WhatsApp number swap (D-01)

- [ ] Real Malaysian WhatsApp number (format `60XXXXXXXXX`) provided by
      user, replacing placeholder `60000000000` in `src/lib/business-info.ts`.
- [ ] Contact page CTA button opens WhatsApp when tapped (test on real
      phone with WhatsApp installed).
- [ ] Footer mirror CTA uses the same number.
- [ ] `isWhatsAppPlaceholder()` returns `false` (no "Pending" badge
      rendered on `/contact`).

### 2. Social handles swap (D-05) — soft blocker

- [ ] Real Instagram URL provided by user, replacing `#` placeholder in
      `src/lib/business-info.ts` AND/OR `src/lib/site-metadata.ts`.
- [ ] Real TikTok URL provided by user, replacing `#` placeholder.
- [ ] JSON-LD `Organization.sameAs` in `src/app/layout.tsx` now includes
      the real handles.
- [ ] Footer social row renders real `<a>` tags (not the greyed-out
      `<span role="img">` placeholders).

> Soft blocker: launch can ship with socials hidden per DECISIONS.md D-05.
> If socials are still empty, leave them hidden rather than linking `#`.

### 3. Logo / hero image WebP conversion (seo-audit C1)

- [ ] `public/logo.png` optimised to WebP ≤ 150 KB (or PNG ≤ 300 KB).
      Current size: 1,551,583 bytes — unacceptable for hero LCP.
- [ ] `public/og-default.png` replaced with a dedicated 1200×630 social
      card (≤ 150 KB WebP / ≤ 250 KB PNG) so WhatsApp / Slack / Twitter
      previews do not download 1.5 MB per share.
- [ ] Lighthouse mobile Perf ≥ 90 on `/` and `/bag` after the swap.

### 4. Coming-soon noindex removal

- [ ] `<meta name="robots" content="noindex" />` removed from
      `coming-soon/index.html` (search for the `<!-- LAUNCH DAY -->`
      comment marker).
- [ ] Every storefront route that should be indexed (`/`, `/shop`,
      `/products/*`, `/about`, `/contact`, `/privacy`, `/terms`) emits
      `<meta name="robots" content="index, follow">` in rendered HTML.
      Verify with `curl`.
- [ ] Admin + auth + `/bag` + `/orders` routes keep their noindex (per
      Plan 04-03) — verify with `curl -s https://3dninjaz.com/admin | grep robots`.

### 5. Formspree form ID in coming-soon (if coming-soon still live for
      transitional period)

- [ ] `coming-soon/index.html` has real Formspree form ID (not the
      placeholder `REPLACE_WITH_FORMSPREE_ID`) — if we decide to keep
      the coming-soon page up briefly as a waitlist after the main
      site launches.
- [ ] Test submission lands in the monitored inbox.

> N/A if coming-soon is fully archived at launch.

### 6. Payment environment flip to live

- [ ] `PAYPAL_ENV=live` in cPanel Node.js app environment variables
      (was `sandbox` during Phase 3 validation).
- [ ] `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` swapped to the LIVE
      credentials issued by PayPal.
- [ ] Test order placed with a real PayPal buyer account against a
      low-price throwaway SKU; verify funds land in the merchant
      account and the refund path works.
- [ ] Admin order status transitions (pending → paid → shipped →
      delivered) all work against the live-paid order.

### 7. Apex domain swap (optional — current app is already on app.3dninjaz.com)

- [ ] Decide: keep storefront on `app.3dninjaz.com` (current, no changes needed) OR
      move it to the apex `3dninjaz.com` (requires Apache userdata edit).
- [ ] If moving to apex: back up current `public_html/` (coming-soon) via
      cPanel File Manager → Compress → Download.
- [ ] If moving to apex: rename `public_html/` → `public_html_old/` as the rollback copy.
- [ ] If moving to apex: update Apache userdata config to proxy the apex to
      `127.0.0.1:3100` (see DEPLOY-NOTES.md for details).
- [ ] If moving to apex: rebuild Apache conf: `/scripts/rebuildhttpdconf && /usr/local/lsws/bin/lswsctrl reload`
      (graceful reload, no downtime).

### 8. Apply `.htaccess` security headers + HTTPS redirect

- [ ] Upload `deploy/htaccess-launch.txt` → `/home/ninjaz/public_html/.htaccess`
      (or wherever the new public-facing path lives after step 7).
- [ ] `curl -I http://3dninjaz.com/` → 301 redirect to https://
- [ ] `curl -I https://3dninjaz.com/` → 200 with:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`

### 9. robots.txt + sitemap.xml reachable

- [ ] `curl https://app.3dninjaz.com/robots.txt` (or apex if swapped) → 200 with
      the rules generated by `src/app/robots.ts` (allow public routes; disallow
      /admin, /api, /bag, /checkout, /orders, auth routes; sitemap pointer).
- [ ] `curl https://app.3dninjaz.com/sitemap.xml` (or apex if swapped) → 200,
      valid XML, lists 6 static routes + all active products + categories.
- [ ] Sitemap XML validates at https://www.xml-sitemaps.com/validate-xml-sitemap.html.

### 10. Submit sitemap to Google Search Console

- [ ] Google Search Console property verified for `3dninjaz.com` (or
      `sc-domain:3dninjaz.com`) OR `app.3dninjaz.com` if staying on subdomain.
- [ ] Sitemap submitted at Search Console → Index → Sitemaps →
      `https://app.3dninjaz.com/sitemap.xml` (or apex URL if swapped).
- [ ] Requested indexing for `/` (or apex) via the URL inspection tool.

### 11. Smoke test — full order flow

- [ ] Homepage `/` loads in < 2 s on mobile, Lighthouse Perf ≥ 90
      post-logo-optim.
- [ ] `/shop` loads, product grid renders, category chips work.
- [ ] PDP `/products/<slug>` opens, gallery + size selector functional.
- [ ] Add-to-bag → cart drawer opens, line items correct.
- [ ] Checkout flow reaches PayPal sandbox (before live swap) OR live
      PayPal button (after live swap).
- [ ] Order confirmation page renders with order number.
- [ ] Order confirmation email arrives at the buyer's inbox (test with
      a Gmail + a Malaysian ISP address at minimum).
- [ ] `/orders` for the buyer shows the new order.
- [ ] `/admin/orders` for the admin user shows the new order + allows
      status transition.

### 12. Password-reset email smoke test — Malaysian inbox

- [ ] Request password reset with a real Malaysian email address
      (Gmail + jaring/streamyx/maxis domain).
- [ ] Email lands in inbox (not spam) within ~30 seconds.
- [ ] Link completes the reset flow end-to-end.

### 13. PDPA consent flow

- [ ] `/register` page renders the PDPA consent checkbox.
- [ ] Checkbox is `checked=false` by default (customer must
      affirmatively check it).
- [ ] Privacy Policy link opens `/privacy` in a new tab (or same tab).
- [ ] DB `users.pdpaConsentAt` timestamp is populated on successful
      registration (verify in admin or via direct DB query).

### 14. Admin smoke test

- [ ] Login as admin.
- [ ] Create a throwaway test product with S/M/L variants.
- [ ] Delete the test order created during step 11 (or transition it
      to `cancelled` if delete is not exposed).
- [ ] Confirm product-list and order-list pagination / filters work.

### 15. Monitoring for first 24h

- [ ] LSWS error log tailed: `tail -f /usr/local/lsws/logs/error.log`
      (root access; coordinate with hosting).
- [ ] Node app log tailed: `/home/ninjaz/apps/3dninjaz/app.log` (or
      wherever `nohup` writes stdout/stderr).
- [ ] Alert channel set up (email or Discord) for any 5xx spikes in
      LSWS error log.

### 16. Git release tag

- [ ] `git tag v1.0.0 && git push --tags`
- [ ] GitHub release notes written (summary of Phases 1-4, what shipped).

### 17. Celebrate

- [ ] ☕ + 🥷 time

---

## Soft follow-ups (post-launch, within 7 days)

- [ ] Monitor LCP on mobile — if logo is still LCP element, consider
      `priority` + `fetchpriority="high"` on the homepage instance.
- [ ] Review first 100 orders for address-form abandonment patterns.
- [ ] Enable cPanel AutoSSL renewal monitoring + alerts so the HSTS
      lock-out risk stays low (T-04-04-08).
- [ ] Submit to https://hstspreload.org after 6 months of stable HTTPS
      (minimum `max-age=31536000` already in place; we emit 63072000).
- [ ] Consider ISR revalidation on `/shop` to recover the 1-point
      Lighthouse Perf miss from DB TTFB (DEF-04-03-03).
- [ ] Plan-in Phase 2 a11y fixes (breadcrumb contrast, ProductCard
      aria-label pattern, Hero blue-on-ink contrast) during Phase 5 or
      a dedicated a11y sweep.

---

## Phase 1/2/3/4 success criteria — production verification

Re-verify each criterion on the LIVE site (not localhost) before calling
the launch done. Mark ✓ when verified, ✗ + note if failing.

### Phase 1 — Foundation

- [ ] User can register with email+password + PDPA consent checkbox.
- [ ] User can log in, stay logged in, log out from any page.
- [ ] User can reset password via emailed link.
- [ ] Admin can create a product with S/M/L prices.
- [ ] Admin can edit/delete/toggle active status on any product.

### Phase 2 — Storefront + Cart

- [ ] User can browse all active products in a responsive grid.
- [ ] User can open PDP showing gallery, description, size guide,
      material, lead time.
- [ ] User can select S/M/L and price updates.
- [ ] User can view bag, adjust quantities, remove items, see subtotal.

### Phase 3 — Checkout + Orders

- [ ] User can checkout with shipping address + PayPal in MYR.
- [ ] User sees order confirmation page immediately after payment.
- [ ] User receives order confirmation email.
- [ ] User can view order history at `/orders`.
- [ ] Admin can view all orders and update status.

### Phase 4 — Brand + Launch

- [ ] Site shows 3D Ninjaz logo + ninja copy + unified
      blue/green/purple + ink/cream palette on every page.
- [ ] About + Contact pages present; WhatsApp link works.
- [ ] Privacy policy is PDPA 2010 compliant; register checkbox links
      to it.
- [ ] Every page responsive 320-1440 with no horizontal scroll, 44px+
      tap targets, mobile load < 2 s.

---

## Sign-off

- [ ] Owner (user) has reviewed and approved all hard blockers as ✓.
- [ ] Launch date + time recorded here: `________________________`
- [ ] Deployed commit hash: `________________________`
- [ ] LSWS userdata config backup file path: `________________________`
- [ ] public_html backup ZIP path: `________________________`

_Last updated: 2026-04-21 (Documentation cleanup — app now on subdomain root, no basePath)_
