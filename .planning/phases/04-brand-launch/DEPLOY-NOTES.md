# 3D Ninjaz — Deploy Notes

**Target env:** cPanel (LiteSpeed / LSWS) on `3dninjaz.com`
**Deploy mechanism (D-07):** Node.js app managed by cPanel Node.js Selector
  → see https://docs.cpanel.net/knowledge-base/web-services/how-to-install-a-node.js-application/

Last updated: 2026-04-21 (Documentation cleanup — app moved to subdomain root)

---

## Current state (2026-04-21 onwards)

The storefront is `https://app.3dninjaz.com/` (live). It runs the full Next.js
app against production MariaDB with `PAYPAL_ENV=live`. The apex
`https://3dninjaz.com/` still serves a static coming-soon page from
`public_html/` (to be decommissioned at full launch).

### Runtime topology (current)

```
customer (https://app.3dninjaz.com/*)
  │
  │ TLS terminated by LSWS on the cPanel host
  │
  ▼
LSWS (LiteSpeed Web Server, port 443/80)
  │
  │ Apache userdata drop-in:
  │ /etc/apache2/conf.d/userdata/*/2_4/ninjaz/app.3dninjaz.com/3dninjaz_app_proxy.conf
  │
  │ ProxyPass / http://127.0.0.1:3100/
  │ ProxyPassReverse / http://127.0.0.1:3100/
  │
  ▼
Node.js (Next.js 15 custom server)
  /home/ninjaz/apps/3dninjaz/server.js
  listening on 127.0.0.1:3100
  started via: /home/ninjaz/apps/3dninjaz/start.sh (bash script, @reboot cron)
```

### Historical note: /v1 topology (2026-04-19 to 2026-04-20)

The initial preview used a `/v1` subpath with `NEXT_PUBLIC_BASE_PATH=/v1` baked into the bundle. This approach was replaced on 2026-04-21 to serve the app at the subdomain root (`app.3dninjaz.com`), eliminating the need for basePath rewrites at domain swap time.

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

### Values that were flipped (2026-04-20)

| Key                   | Preview value | Current value                           |
| --------------------- | ------------- | --------------------------------------- |
| `PAYPAL_ENV`          | `sandbox`     | `live` — ✅ DONE (2026-04-20)           |
| `PAYPAL_CLIENT_ID`    | sandbox ID    | live ID — ✅ DONE                      |
| `PAYPAL_CLIENT_SECRET`| sandbox secret| live secret — ✅ DONE                  |
| `NEXT_PUBLIC_BASE_PATH` | (N/A — never used in current build) | (not set, app at root) |
| `NEXT_PUBLIC_SITE_URL`| (N/A)         | (not explicitly set, defaults to `https://app.3dninjaz.com`) |

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

## How to move from app.3dninjaz.com → 3dninjaz.com (apex swap)

**Current state:** App is on `app.3dninjaz.com/` (subdomain) with no basePath.
At full launch, the operator may choose to move the live app to the apex
`3dninjaz.com/` and retire the coming-soon page.

### Execution path: Apache userdata + document root swap

1. Back up the current userdata configs:

   ```bash
   sudo cp /etc/apache2/conf.d/userdata/*/2_4/ninjaz/app.3dninjaz.com/* \
           /root/backups/app.3dninjaz.com.$(date +%Y%m%d-%H%M%S).tar
   ```

2. Move or alias the app vhost to the apex domain. Two options:

   **Option A (Simplest):** Reconfigure Apache to proxy the apex to the same app:
   - Edit `/etc/apache2/conf.d/userdata/{std,ssl}/2_4/ninjaz/3dninjaz.com/3dninjaz_apex_proxy.conf`
   - Set `ProxyPass "/"` + `ProxyPassReverse "/"` → `http://127.0.0.1:3100/`
   - Same Node app on `127.0.0.1:3100` serves both `app.3dninjaz.com` and `3dninjaz.com`

   **Option B (Safer for rollback):** Keep the app on `app.3dninjaz.com`, add a redirect:
   - Add permanent redirect `3dninjaz.com/* → app.3dninjaz.com/*`
   - Search engines migrate to the new canonical URL over time

3. Update `BETTER_AUTH_URL` in env vars if the canonical domain is changing (see `src/lib/auth.ts`).

4. Remove or archive the coming-soon `public_html/` to avoid directory conflicts.

5. Rebuild + reload Apache + test:

   ```bash
   sudo /scripts/rebuildhttpdconf
   sudo /usr/local/lsws/bin/lswsctrl reload   # graceful reload, no downtime
   ```

6. Smoke test (see LAUNCH-CHECKLIST.md post-launch checklist).

### Rollback (if smoke test fails)

The rollback window is ~60 seconds:

1. Restore the backed-up userdata configs.
2. Rebuild + reload Apache.
3. Verify the app is still live on `app.3dninjaz.com/`.

No rebuild or basePath changes needed—the app was already serving at root.

---

## Build notes — basePath is NOT used

Unlike the old `/v1` topology, the current app does NOT use `NEXT_PUBLIC_BASE_PATH`.
`next.config.ts` reads:

```ts
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";  // always empty string
```

This means:
- Asset URLs are at root (`/_next/static/...`, not `/{basePath}/_next/...`)
- Domain swap does NOT require a rebuild
- Moving from `app.3dninjaz.com` to `3dninjaz.com` is a pure Apache/DNS change

**Historical note:** The 2026-04-19 preview used `NEXT_PUBLIC_BASE_PATH=/v1` to serve
at a subpath. That was replaced on 2026-04-21 with subdomain-root topology.

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
| Host reboot kills Node app   | Cron `@reboot` + start script in `scripts/start.sh` — ✅ DONE (2026-04-20).           |
| HSTS lockout on cert renewal failure | cPanel AutoSSL renewal monitoring; add alert on cert expiry < 14 days.       |
| basePath mismatch at swap    | ✅ N/A — app serves at root with no basePath. Domain swap is Apache/DNS only.        |
| PayPal live creds leak       | Env vars in cPanel Node app UI only; `.env.production` never committed; .gitignore   |
| Uploaded product images lost on redeploy | Symlink `public/uploads` → `/home/ninjaz/persistent_uploads/`           |
| Coming-soon noindex reaches live | Already flagged in `LAUNCH-CHECKLIST.md` step 4; removed on launch day.          |

---

## Decision log for this plan

- **Subdomain-root topology (D-07 revised, 2026-04-21):** Node app on `127.0.0.1:3100` +
  LSWS ProxyPass `/` → app, served at `app.3dninjaz.com/`. No basePath in the bundle.
  Simplifies launch: domain swap is pure Apache config + DNS, no rebuild needed.
  Replaces earlier `/v1` subpath approach.
- **App already deployed on subdomain:** The current live app is `https://app.3dninjaz.com/`
  with no `/v1` subpath. The older Phase 7 decision to use `/v1` was superseded
  during Phase 7 execution (2026-04-20).
- **`.htaccess` staged, not committed to public_html:** File lives in
  `deploy/htaccess-launch.txt` so rollout is explicit. Commiting it
  directly to public_html would overwrite the coming-soon .htaccess
  (if any) before we're ready.
- **Rollback via rename, not delete:** `public_html` → `public_html_old`
  keeps the coming-soon files alive on disk. Delete only after the
  launch is confirmed stable for ~1 week.
- **Hard cap on auto-fix rule scope:** Plan 04-04 established the initial
  deploy scaffold; subsequent iterations (Phase 7) adjusted the topology.
  All launch-day mutations are on the launch checklist for the human operator.
