# 3D Ninjaz — Deploy Notes

**Target env:** cPanel (LiteSpeed / LSWS) on `3dninjaz.com`
**Deploy mechanism (D-07):** Node.js app managed by cPanel Node.js Selector
  → see https://docs.cpanel.net/knowledge-base/web-services/how-to-install-a-node.js-application/

Last updated: 2026-04-19 (Plan 04-04 execution)

---

## Current preview state

The live preview is `https://3dninjaz.com/v1`. It runs the full Next.js
app against production MariaDB with `PAYPAL_ENV=sandbox`. The root
`https://3dninjaz.com/` still serves the static coming-soon page from
`public_html/`.

### Runtime topology

```
customer (https://3dninjaz.com/v1/*)
  │
  │ TLS terminated by LSWS on the cPanel host
  │
  ▼
LSWS (LiteSpeed Web Server, port 443/80)
  │
  │ Apache userdata drop-in:
  │ /etc/apache2/conf.d/userdata/*/2_4/ninjaz/3dninjaz.com/3dninjaz_v1.conf
  │
  │ ProxyPass /v1 http://127.0.0.1:3100/
  │ ProxyPassReverse /v1 http://127.0.0.1:3100/
  │
  ▼
Node.js (Next.js 15 custom server)
  /home/ninjaz/apps/3dninjaz/server.js
  listening on 127.0.0.1:3100
  started via: nohup /opt/alt/alt-nodejs20/root/usr/bin/node server.js &
```

### How the Node app is currently started

```bash
# on cPanel as ninjaz user (SSH):
cd /home/ninjaz/apps/3dninjaz
nohup /opt/alt/alt-nodejs20/root/usr/bin/node server.js > app.log 2>&1 &
disown
```

### Known problem: `nohup` dies on reboot

`nohup` detaches from the TTY but does NOT survive host reboots. The
cPanel host is on a provider SLA that can restart at any time for kernel
patching. After a reboot, the Node app does not come back up, and the
preview 502s until someone manually re-runs the start command.

### Fix options

**Option A — cron `@reboot` start script (SIMPLEST, recommended):**

As the `ninjaz` user, add to crontab:

```
@reboot /home/ninjaz/apps/3dninjaz/scripts/start.sh >> /home/ninjaz/apps/3dninjaz/app.log 2>&1
```

Then create `/home/ninjaz/apps/3dninjaz/scripts/start.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /home/ninjaz/apps/3dninjaz
# kill any existing Node bound to 3100
PIDS=$(pgrep -u ninjaz -f 'node server.js' || true)
if [ -n "$PIDS" ]; then kill $PIDS; sleep 2; fi
export NODE_ENV=production
export PORT=3100
exec /opt/alt/alt-nodejs20/root/usr/bin/node server.js
```

`chmod +x scripts/start.sh`. Test by rebooting the host OR by killing
the current node process and waiting — a manual re-run confirms the
script works before relying on `@reboot`.

**Option B — systemd user unit (CLEANER, but cPanel restricts):**

cPanel shared hosting does NOT expose `loginctl enable-linger` + user
systemd by default. If the host operator grants it, the unit template
is:

```ini
# ~/.config/systemd/user/3dninjaz.service
[Unit]
Description=3D Ninjaz Next.js app on /v1
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/ninjaz/apps/3dninjaz
Environment=NODE_ENV=production
Environment=PORT=3100
ExecStart=/opt/alt/alt-nodejs20/root/usr/bin/node server.js
Restart=on-failure
RestartSec=5s
StandardOutput=append:/home/ninjaz/apps/3dninjaz/app.log
StandardError=append:/home/ninjaz/apps/3dninjaz/app.log

[Install]
WantedBy=default.target
```

Enable with:

```bash
systemctl --user daemon-reload
systemctl --user enable 3dninjaz.service
systemctl --user start 3dninjaz.service
# and for survival across reboots when no user session is active:
loginctl enable-linger ninjaz   # requires root
```

If `loginctl enable-linger` fails (`Operation not permitted`), the
operator must grant it — otherwise fall back to Option A.

**Option C — PM2:** works but adds a dependency layer, still depends on
either a startup hook (`pm2 startup`) which requires root OR the same
cron `@reboot` Option A uses. No net benefit over Option A for this
deployment.

### Chosen fix for launch

**Option A** — cron `@reboot` + start script. Zero extra dependencies,
no root required, runs with the `ninjaz` user's privileges, survives
reboots. Add this to the launch checklist as step 7.5 ("add @reboot
cron before flipping document root").

---

## Environment configuration

### .env files (NEVER committed)

- `.env.local` — local dev overrides.
- `.env.production` — production overrides used when building the
  deploy tarball. **For preview currently has `PAYPAL_ENV=sandbox`.**
  Swap to `live` at launch.

Both files are in `.gitignore`. Verify with `git check-ignore -v .env.production`.

### Values that MUST flip at launch

| Key                   | Preview value | Launch value                            |
| --------------------- | ------------- | --------------------------------------- |
| `PAYPAL_ENV`          | `sandbox`     | `live`                                  |
| `PAYPAL_CLIENT_ID`    | sandbox ID    | live ID from PayPal merchant dashboard  |
| `PAYPAL_CLIENT_SECRET`| sandbox secret| live secret                             |
| `NEXT_PUBLIC_BASE_PATH` | `/v1`       | empty (launch swap means `/` is the app)|
| `NEXT_PUBLIC_SITE_URL`| `https://3dninjaz.com/v1` (if set) | `https://3dninjaz.com`         |

### Values that stay the same

- `DATABASE_URL` — already the production MariaDB instance.
- `BETTER_AUTH_SECRET` — same (rotating it invalidates all sessions).
- `BETTER_AUTH_URL` — update to the new base URL if changing host path.
- `SMTP_*` — same cPanel SMTP credentials.

### How to update env vars in place (no tarball redeploy)

If the Node app was set up via cPanel Node.js Selector:

1. cPanel → Setup Node.js App → select the `3dninjaz` app.
2. "Environment Variables" section → edit values → Save.
3. Click "Restart".

If the Node app was started via `nohup`:

```bash
# ssh as ninjaz
cd /home/ninjaz/apps/3dninjaz
vi .env.production   # or any editor
pkill -f 'node server.js'
./scripts/start.sh &
disown
```

---

## How to flip preview → production

The preview lives at `/v1`; the production swap moves it to `/`. Two
execution paths:

### Path A (recommended): edit LSWS userdata config

1. Back up the current userdata config:

   ```bash
   sudo cp /etc/apache2/conf.d/userdata/*/2_4/ninjaz/3dninjaz.com/3dninjaz_v1.conf \
           /root/backups/3dninjaz_v1.conf.$(date +%Y%m%d-%H%M%S)
   ```

2. Edit the userdata file. Change the `Location /v1` block to
   `Location /`:

   ```apache
   # BEFORE
   <IfModule LiteSpeed>
     Include /etc/apache2/conf.d/userdata/*/2_4/ninjaz/3dninjaz.com/*.conf
     ProxyPass /v1 http://127.0.0.1:3100/
     ProxyPassReverse /v1 http://127.0.0.1:3100/
   </IfModule>

   # AFTER
   <IfModule LiteSpeed>
     ProxyPass / http://127.0.0.1:3100/
     ProxyPassReverse / http://127.0.0.1:3100/
   </IfModule>
   ```

3. Update `NEXT_PUBLIC_BASE_PATH` in the Node app's env vars (remove
   or set to empty string). Restart the Node app so Next.js picks up
   the change (basePath is read at build time — may require a rebuild
   if the tarball was compiled with `/v1` baked in; see build notes
   below).

4. Rename coming-soon to rollback copy:

   ```bash
   mv /home/ninjaz/public_html /home/ninjaz/public_html_old
   mkdir -p /home/ninjaz/public_html
   ```

   > Alternatively, leave `public_html/` intact but override the
   > domain's document root to a blank directory. Renaming is simpler.

5. Upload `deploy/htaccess-launch.txt` to
   `/home/ninjaz/public_html/.htaccess`.

6. Rebuild + restart Apache:

   ```bash
   sudo /scripts/rebuildhttpdconf
   sudo /scripts/restartsrv_httpd
   ```

7. Smoke test (see LAUNCH-CHECKLIST.md step 11).

### Path B: cPanel "Change Document Root"

If the operator prefers a UI-driven swap:

1. cPanel → Domains → `3dninjaz.com` → "Configuration" →
   "Document Root" → change from `public_html` to, say,
   `apps/3dninjaz/public` (or a symlinked dir).
2. Update the LSWS userdata file so ProxyPass uses `/` instead of `/v1`.
3. Same rebuild/restart sequence.

Path A is preferred because it minimises cPanel-UI actions that can
be difficult to audit/rollback.

### Rollback (if smoke test fails)

The rollback window is ~60 seconds. Reverse the swap:

1. `mv /home/ninjaz/public_html_old /home/ninjaz/public_html`
2. Restore the backed-up LSWS userdata file.
3. Rebuild + restart Apache.
4. Re-enable `NEXT_PUBLIC_BASE_PATH=/v1` + re-point Node app to serve
   at `/v1` again.

Document in the launch-day journal the exact time of rollback + the
first failing smoke-test step so we can diagnose before retrying.

---

## Build notes — why basePath matters

`next.config.ts` reads `NEXT_PUBLIC_BASE_PATH` at BUILD time:

```ts
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  basePath,
  assetPrefix: basePath || undefined,
};
```

The preview tarball was built with `NEXT_PUBLIC_BASE_PATH=/v1`, so
all asset URLs and internal links include `/v1/` prefixes. Flipping
LSWS userdata from `/v1` to `/` WITHOUT a rebuild will produce broken
links (browser requests `/v1/_next/static/...` but server responds 404
because proxy now strips `/v1`).

**Launch plan MUST either:**

1. Rebuild the app with `NEXT_PUBLIC_BASE_PATH=` empty BEFORE the
   document-root swap, OR
2. Keep the preview live at `/v1` AND add a separate redirect from
   `/` → `/v1` (temporary), OR
3. Rebuild AND swap in the same change window.

Option 3 is the recommended path. Build locally with empty basePath,
re-tarball, SFTP upload, extract over `/home/ninjaz/apps/3dninjaz/`,
restart Node, THEN flip the userdata config.

---

## Secret handling

- `.env.production` is in `.gitignore`. Do NOT commit it.
- Secrets are transported via cPanel's Node.js Selector env-var UI
  (pastes into a form; not stored in the tarball).
- OR via SFTP upload of `.env.production` to the app root (outside
  public_html, not web-reachable).
- `_deploy/run.php` is a temporary bootstrap tool with a hard-coded
  token — remove from production after the initial Node app setup
  completes. It has an `action=selfkill` map entry exactly for this.

---

## Checklist-synced items

The launch-day tasks in `LAUNCH-CHECKLIST.md` depend on this document:

- Step 7 (document root swap) → follow "How to flip preview → production"
  above.
- Step 8 (`.htaccess` deploy) → upload `deploy/htaccess-launch.txt`.
- Step 15 (monitoring) → tail `/home/ninjaz/apps/3dninjaz/app.log` +
  LSWS error log.
- Post-launch follow-ups step 3 (HSTS preload after 6 months) → the
  header `Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"`
  is already in `deploy/htaccess-launch.txt`; submission to
  hstspreload.org is the only remaining action.

---

## Open decisions / risks

| Risk                         | Mitigation                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| Host reboot kills Node app   | Cron `@reboot` + start script (Fix A above).                                         |
| HSTS lockout on cert renewal failure | cPanel AutoSSL renewal monitoring; add alert on cert expiry < 14 days.       |
| basePath mismatch at swap    | Rebuild WITH `NEXT_PUBLIC_BASE_PATH=` empty BEFORE document-root flip.               |
| PayPal live creds leak       | Env vars in cPanel Node app UI only; `.env.production` never committed; .gitignore   |
| Uploaded product images lost on redeploy | Symlink `public/uploads` → `/home/ninjaz/persistent_uploads/`           |
| Coming-soon noindex reaches live | Already flagged in `LAUNCH-CHECKLIST.md` step 4; removed on launch day.          |

---

## Decision log for this plan

- **Preview strategy (D-07 partial):** Node app on `127.0.0.1:3100` +
  LSWS ProxyPass `/v1` → app. Works today; survives launch swap with
  a rebuild.
- **`.htaccess` staged, not committed to public_html:** File lives in
  `deploy/htaccess-launch.txt` so rollout is explicit. Commiting it
  directly to public_html would overwrite the coming-soon .htaccess
  (if any) before we're ready.
- **Rollback via rename, not delete:** `public_html` → `public_html_old`
  keeps the coming-soon files alive on disk. Delete only after the
  launch is confirmed stable for ~1 week.
- **Hard cap on auto-fix rule scope:** Plan 04-04 does NOT rebuild the
  app, does NOT redeploy the tarball, does NOT change the current
  preview behavior. All launch-day mutations are on the launch
  checklist for the human operator to execute.
