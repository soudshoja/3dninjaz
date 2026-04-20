# deploy/ — Launch-day cPanel assets

Files staged here are **not** auto-deployed. They are launch-day artifacts
that require a manual swap via cPanel File Manager or SSH + root approval.

## Files

| File                  | Target location on cPanel                  | Purpose |
| --------------------- | ------------------------------------------ | ------- |
| `htaccess-launch.txt` | `/home/ninjaz/public_html/.htaccess`       | HTTPS redirect + HSTS + security headers once document root is flipped from coming-soon to the Next.js app. |

## Current preview deploy — context

- The Next.js app runs as the `ninjaz` cPanel user on `127.0.0.1:3100`
  (via `nohup node server.js`). See `.planning/phases/04-brand-launch/DEPLOY-NOTES.md`.
- LSWS reverse-proxies `https://app.3dninjaz.com/` → that Node app, using
  an Apache userdata drop-in at:
  `/etc/apache2/conf.d/userdata/*/2_4/ninjaz/app.3dninjaz.com/app_3dninjaz.conf`
  (previous preview mounted at `3dninjaz.com/v1` via a `<Location "/v1">` block —
  that config has been superseded by the subdomain mount).
- The preview does **not** currently require the `.htaccess` in this
  directory. The coming-soon static site still owns `public_html/` and
  is served from the root of `3dninjaz.com`.

## When to swap in htaccess-launch.txt

Launch day, after the document-root flip described in `DEPLOY-NOTES.md`
("How to flip preview → production"). Order of operations:

1. Back up the current public_html/ (including any existing `.htaccess`)
   via cPanel File Manager → Compress → Download.
2. Rename `public_html/` to `public_html_old/` (coming-soon rollback
   copy).
3. Point the Node app's public path (or the document root) at the
   production domain root.
4. Upload `deploy/htaccess-launch.txt` as `/home/ninjaz/public_html/.htaccess`
   (or wherever the new public-facing path lives).
5. Verify:
   - `curl -I http://3dninjaz.com/` → 301 to https://
   - `curl -I https://3dninjaz.com/` → 200 + `Strict-Transport-Security`,
     `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
     `Permissions-Policy` headers
   - `curl https://3dninjaz.com/robots.txt` → 200 with the Next.js-rendered
     rules from `src/app/robots.ts`
   - `curl https://3dninjaz.com/sitemap.xml` → 200 with product + static
     route entries

## Rollback

If smoke tests fail, `public_html_old/` holds the coming-soon backup.
Revert the document-root pointer; the restore takes ~60 seconds via
cPanel. The launch `.htaccess` written here does NOT touch the rollback
copy as long as you renamed rather than deleted `public_html/`.

## Do NOT commit to this directory

- `.env*` files
- Any DB dumps
- Deploy tarballs (e.g. `deploy-v1.tar.gz`)
- Any file containing secrets, passwords, tokens

These stay in `.gitignore` and are transported separately.
