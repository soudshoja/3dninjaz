# Phase 4 — Post-planning decisions (2026-04-20)

User resolved 7 open questions. These SUPERSEDE 04-CONTEXT.md defaults where they conflict.

## D-01: WhatsApp number
MY format (`60XXXXXXXXX`). User to provide the actual number before Plan 04-04 launch. Use placeholder `60000000000` in source until then. Launch checklist must flag this as a hard blocker.

## D-02: Legal / trading name
**"3D Ninjaz"** — no `Sdn Bhd`, `Enterprise`, or any suffix. Footer + privacy policy + terms pages use this name as-is.

## D-03: SST / tax registration
**None / not registered.** Remove any "SST" or tax-number references from Terms and footer. Privacy/Terms must NOT mention "prices inclusive of SST" — simply state "prices displayed in MYR" with no tax-status claim.

## D-04: DPO / data-request email
**info@3dninjaz.com** (mailbox confirmed existing on cPanel). All PDPA notices, privacy policy "Contact the DPO" section, and footer "Contact" link target this address.

## D-05: Social handles
**Pending** — user will provide Instagram + TikTok URLs later. Use placeholder `#` in source until provided. Launch checklist flags these as soft warnings (not hard blockers — launch can proceed with socials removed).

## D-06: Data retention
**✅ Default approved** — 7 years orders / 3 years accounts post-last-login. Document in privacy policy.

## D-07: Deploy mechanism
**Node.js app on cPanel** (cPanel → "Setup Node.js App"). Deploy strategy:

1. **Dev phase (current):** app runs locally. coming-soon static stays on `3dninjaz.com` root.
2. **Staging:** deploy Next.js Node app to `app.3dninjaz.com` subdomain (or any unused subdomain) using cPanel Node.js App + `npm run build && npm start`. Verify full order flow against cPanel MySQL in production-like env.
3. **Launch:** swap `3dninjaz.com` document root from `public_html/` (coming-soon) to the Node.js app's public path. Remove `<meta robots="noindex">` from coming-soon files OR leave them deleted after swap. Keep coming-soon files archived in `public_html_old/` for rollback.
4. **Rollback plan:** if launch smoke test fails, revert document root pointer back to `public_html_old/` — takes ~60 seconds via cPanel.

Implementation notes for Plan 04-04:
- Use cPanel "Setup Node.js App" → Node version 20.x → application root `/home/ninjaz/apps/3dninjaz` → startup file `server.js` (or `npm start`)
- Create `server.js` shim wrapping Next.js `next start -p $PORT`
- PM2 not needed; cPanel manages the process
- Environment variables: paste contents of `.env.local` into cPanel's "Environment Variables" section (DO NOT commit `.env.local` to git; upload via SFTP or paste via cPanel UI)
- Symlink `/public/uploads` to a persistent path outside the app dir so deploys don't wipe product images: `/home/ninjaz/persistent_uploads/` → symlinked into the app

## Still pending (non-blocking)
- Q4-01 WhatsApp number — user to provide
- Q4-05 Social handles — user to provide
- PayPal sandbox MYR end-to-end verification (during Phase 3 Plan 02 execution)
- SMTP MY-inbox deliverability verification (during Phase 3 Plan 03 execution)
