# Phase 21 Deploy Notes — Admin Meshy AI 3D Generation Tool

**Purpose:** the launch-day checklist for cutting the Meshy admin tool over to
a real Meshy account. Code itself deploys via GitHub Actions on push to
`dev`/`master` only (`feedback_no_manual_deploys` memory) — every item below
is a **one-time SSH server operation**, never a code deploy.

Verified against the live cPanel box (`152.53.86.223`) on 2026-07-07 while
building this plan:

| | Dev | Prod |
|---|---|---|
| App dir | `/home/ninjaz/apps/3dninjaz_v1` | `/home/ninjaz/apps/3dninjaz_prod` |
| Node binary | `/home/ninjaz/nodevenv/apps/3dninjaz_v1/20/bin/node` (CloudLinux nodevenv Node 20) | `/opt/alt/alt-nodejs20/root/usr/bin/node` (standalone alt-node) |
| tsx binary | `./node_modules/.bin/tsx` (present, symlink to `../tsx/dist/cli.mjs`) | `./node_modules/.bin/tsx` (present) |
| Domain | `app.3dninjaz.com` (dev, live PayPal sandbox) | `3dninjaz.com` (prod, live) |
| `MESHY_API_KEY` in `.env.local` today | **not set** | **not set** |

Neither box has any `MESHY_*` env var yet — both are launch blockers tracked
here, not assumed-done.

---

## 1. Env vars (prod app env — one-time SSH edit of `.env.local`)

Add to `/home/ninjaz/apps/3dninjaz_prod/.env.local`:

```
MESHY_API_KEY=<real key from the Meshy dashboard — https://app.meshy.ai, Settings > API>
MESHY_STORAGE_DIR=/home/ninjaz/persistent_meshy
```

- `MESHY_API_KEY`: dev keeps the test-mode key `msy_dummy_api_key_for_test_mode_12345678`
  (21-CONTEXT — zero cost, instant fake successes, never produces a real
  downloadable model; that's expected on dev). **Prod gets the real key only.**
  Same sandbox/live split as `PAYPAL_ENV`.
- `MESHY_STORAGE_DIR`: absolute path OUTSIDE the deploy tree, exactly like
  `/home/ninjaz/uploads/3dninjaz_prod/products` is for `public/uploads`
  (see `prod-start.sh`/`start.sh` symlink-restore logic) — so `storage/meshy`
  never gets wiped or shadowed by a tarball redeploy. Unlike the uploads
  path, `src/lib/meshy/storage.ts` reads `MESHY_STORAGE_DIR` directly from
  `process.env` (`process.env.MESHY_STORAGE_DIR ?? "./storage/meshy"`) — no
  symlink dance is required, just set the env var and `mkdir` it once (step 2).

Set both dev and prod `.env.local` — dev already has `MESHY_API_KEY` (test
key); only `MESHY_STORAGE_DIR` needs adding on dev so the tool is fully
testable there before the real key ever touches prod.

Dev app env file: `/home/ninjaz/apps/3dninjaz_v1/.env.local`
Prod app env file: `/home/ninjaz/apps/3dninjaz_prod/.env.local`

---

## 2. One-time directory creation (root SSH)

```bash
mkdir -p /home/ninjaz/persistent_meshy
chown ninjaz:ninjaz /home/ninjaz/persistent_meshy
```

Run once per environment (dev needs its own `persistent_meshy` dir too —
do NOT share one directory between dev and prod, same reasoning as the
separate `/home/ninjaz/uploads/3dninjaz_v1/` vs `/home/ninjaz/uploads/3dninjaz_prod/`
split for product images). Suggested dev path:
`/home/ninjaz/persistent_meshy_dev` with `MESHY_STORAGE_DIR` on dev's
`.env.local` pointed at it — keeps dev's test-mode fake files fully separate
from anything that will ever hold real prod model data.

---

## 3. Cron registration (ninjaz user crontab)

Register on **dev first**, prod only after a human smoke-tests the sweep
end-to-end on dev (`feedback_dev_first_then_prod` memory). `crontab -u ninjaz -e`
(or `crontab -l | { cat; echo "<line>"; } | crontab -`), adding:

**Dev** (`<appdir>` = `3dninjaz_v1`, confirmed via `ls /home/ninjaz/apps/`):

```
*/5 * * * * cd /home/ninjaz/apps/3dninjaz_v1 && NODE_OPTIONS="--require ./scripts/_mock-server-only.cjs" ./node_modules/.bin/tsx --env-file=.env.local scripts/meshy-sweep.ts >> /home/ninjaz/scripts/meshy-sweep-dev.out 2>&1
```

**Prod** (`<appdir>` = `3dninjaz_prod`, confirmed via `ls /home/ninjaz/apps/`):

```
*/5 * * * * cd /home/ninjaz/apps/3dninjaz_prod && NODE_OPTIONS="--require ./scripts/_mock-server-only.cjs" ./node_modules/.bin/tsx --env-file=.env.local scripts/meshy-sweep.ts >> /home/ninjaz/scripts/meshy-sweep.out 2>&1
```

(Dev and prod log to different filenames — `meshy-sweep-dev.out` vs
`meshy-sweep.out` — so a `tail` on the box is unambiguous about which
environment produced a line.)

Re-verify `<appdir>` at registration time with `ls /home/ninjaz/apps/` —
directory names have drifted before (Phase 7's `/v1` subpath rename); the
values above are what was confirmed live on 2026-07-07.

---

## 4. Post-cutover verification

1. Run the sweep once by hand on the box to confirm it executes cleanly
   outside cron's environment:
   ```bash
   cd /home/ninjaz/apps/<appdir> && NODE_OPTIONS="--require ./scripts/_mock-server-only.cjs" ./node_modules/.bin/tsx --env-file=.env.local scripts/meshy-sweep.ts
   ```
   Expect `[meshy-sweep] nothing to do` (or `[meshy-sweep] done: N checked, 0 errors`
   if there happen to be in-flight generations) and exit 0.
2. Wait for the next `*/5` tick, then:
   ```bash
   cat /home/ninjaz/scripts/meshy-sweep.out   # prod
   cat /home/ninjaz/scripts/meshy-sweep-dev.out   # dev
   ```
   Confirm the file contains at least one `[meshy-sweep]` line with a fresh
   timestamp (cron actually fired).
3. Confirm the download route rejects anonymous access (no session cookie):
   ```bash
   curl -sI https://<domain>/api/admin/meshy/x/download?file=stl
   ```
   Expect a non-200-with-file response — 403/redirect/branded error page,
   never a raw model file. (`x` is a deliberately-invalid id; the route's
   `requireAdmin()` first-await should reject before the id is even looked up.)

---

## 5. Rollback

The feature is purely additive — no existing table, route, or shared
component is modified by Phase 21. To disable:

1. Remove the `/admin/meshy` sidebar entry (`src/components/admin/sidebar-nav.tsx`)
   so admins can no longer navigate to the tool from the UI.
2. Comment out (do not delete) the `*/5` crontab line on whichever
   environment(s) it was registered on, via `crontab -u ninjaz -e`.
3. `meshy_generations` / `meshy_revisions` tables and any files already
   written under `MESHY_STORAGE_DIR` can stay — there is nothing downstream
   that reads them once the sidebar entry and cron are gone, and no other
   feature has a foreign key into these tables (`product_id` is a nullable,
   FK-less column per the 21-CONTEXT open-question resolution).
4. No env var needs to be unset for rollback — an unused `MESHY_API_KEY` /
   `MESHY_STORAGE_DIR` sitting in `.env.local` is inert once nothing calls
   `src/lib/meshy/*`.

---

## Outstanding launch-day blockers tracked here

- [ ] `MESHY_API_KEY` (real key) set in prod `.env.local`
- [ ] `MESHY_STORAGE_DIR=/home/ninjaz/persistent_meshy` set in prod `.env.local`
      (and a dev-specific path set on dev `.env.local`)
- [ ] `/home/ninjaz/persistent_meshy` (prod) + dev equivalent created + chowned
- [ ] Cron line registered on dev, smoke-tested, then registered on prod
- [ ] Anonymous-access curl check against the download route returns a
      non-200-with-file response
