---
phase: 04-brand-launch
plan: 04
subsystem: brand-launch/seo-deploy
status: complete
wave: 3
tags:
  - seo
  - robots
  - sitemap
  - security-headers
  - htaccess
  - launch
  - deploy
requirements:
  - BRAND-01
  - RESP-02
decisions:
  - D-07
dependency_graph:
  requires:
    - src/lib/site-metadata.ts    # Plan 04-01 — SITE.url
    - src/lib/catalog.ts          # Phase 2 — getActiveProducts + getActiveCategories
    - coming-soon/index.html      # pre-launch static splash
  provides:
    - src/app/robots.ts           # Next.js 15 file-convention robots.txt
    - src/app/sitemap.ts          # Next.js 15 file-convention sitemap.xml
    - deploy/htaccess-launch.txt  # staged launch-day .htaccess for public_html
    - deploy/README.md            # swap procedure for the staged .htaccess
    - .planning/phases/04-brand-launch/LAUNCH-CHECKLIST.md
    - .planning/phases/04-brand-launch/DEPLOY-NOTES.md
  affects:
    - coming-soon/index.html      # flagged for launch-day noindex removal
    - coming-soon/README.md       # points to LAUNCH-CHECKLIST.md
tech_stack:
  added: []
  patterns:
    - Next.js 15 file-based robots + sitemap conventions
    - NEXT_PUBLIC_SITE_URL override so preview deploys at /v1 stay self-consistent
    - fail-soft sitemap (fall back to static routes if DB unreachable at render time)
    - comment-marker protocol (<!-- LAUNCH DAY: --> grep-able flags)
    - staged deploy artifacts under deploy/ (no auto-apply)
key_files:
  created:
    - src/app/robots.ts
    - src/app/sitemap.ts
    - deploy/htaccess-launch.txt
    - deploy/README.md
    - .planning/phases/04-brand-launch/LAUNCH-CHECKLIST.md
    - .planning/phases/04-brand-launch/DEPLOY-NOTES.md
  modified:
    - coming-soon/index.html
    - coming-soon/README.md
metrics:
  duration: ~15 min
  files_created: 6
  files_modified: 2
  tasks_completed: 5
  commits: 4
  completed_at: 2026-04-20
---

# Phase 4 Plan 04: robots + sitemap + security headers + launch checklist Summary

Final Phase 4 plan — shipped the Next.js 15 file-based `robots.ts` + `sitemap.ts` (dynamic, DB-backed, preview-safe), staged a launch-day `.htaccess` with HTTPS redirect + HSTS + security headers outside `public_html/` for deliberate swap-in, flagged the coming-soon `noindex` for removal, and committed the 17-point launch checklist plus cPanel deploy notes covering Node-app reboot survival and the preview→production swap procedure.

## Objective — status

Flip 3D Ninjaz from pre-launch (coming-soon static with noindex) to launch-ready infrastructure. Code and documentation are done; the swap itself is a human-gated operation (per the plan's `checkpoint:human-verify` task) and is captured in `LAUNCH-CHECKLIST.md` + `DEPLOY-NOTES.md` for launch day. Per the executor prompt, the preview is already live and this plan does NOT rebuild or redeploy.

## What changed

### `src/app/robots.ts` (new)

Next.js 15 file-based `robots()` exporting `MetadataRoute.Robots`:

- `userAgent: "*"` with an explicit allow list (`/`, `/shop`, `/products/`, `/about`, `/contact`, `/privacy`, `/terms`).
- Disallow list covers every per-user, auth, or API surface: `/admin`, `/admin/`, `/api/`, `/bag`, `/checkout`, `/orders`, `/orders/`, `/login`, `/register`, `/forgot-password`, `/reset-password`.
- `sitemap: ${SITE.url}/sitemap.xml` and `host: SITE.url` so crawlers honour the canonical origin.
- Comments explain that robots.txt is a crawler hint, not a security boundary (T-04-04-01); real access control stays at the handler / layout level.

### `src/app/sitemap.ts` (new)

Next.js 15 file-based `sitemap()` exporting `MetadataRoute.Sitemap`:

- Six static routes: `/`, `/shop`, `/about`, `/contact`, `/privacy`, `/terms`. Priorities weighted (home 1.0, shop 0.9, static 0.4-0.6).
- Dynamic: queries `getActiveProducts()` + `getActiveCategories()` from `src/lib/catalog.ts`. Emits `/products/<slug>` with `lastModified: p.updatedAt` and `/shop?category=<slug>` with `lastModified: c.createdAt`.
- **Preview-aware:** resolves base URL from `NEXT_PUBLIC_SITE_URL` env when set (so `/v1` preview entries stay self-consistent), falling back to `SITE.url` (`https://3dninjaz.com`).
- **Fail-soft:** wraps DB fetch in try/catch. If DB is unreachable at render time (Passenger cold start, pool warm-up), emits the six static routes only with a `console.warn`. Crawlers retry on their normal cadence; stale-for-a-cycle is preferable to a 500 (T-04-04-02 is upheld because the filter `isActive=true` still runs when DB is reachable).

### `deploy/htaccess-launch.txt` (new, staged)

Launch-day `.htaccess` for `/home/ninjaz/public_html/` once the document root is flipped to the Next.js app:

- HTTPS enforcement: `RewriteCond %{HTTPS} !=on` + 301 redirect.
- HSTS: `max-age=63072000; includeSubDomains; preload` (T-04-04-04). Comments flag the cert-renewal-monitoring requirement (T-04-04-08).
- `X-Content-Type-Options: nosniff` (T-04-04-05).
- `X-Frame-Options: SAMEORIGIN` (T-04-04-06).
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- Commented Node proxy template for future flat-proxy deployments.

Staged to `deploy/` — NOT auto-deployed. Swap is a manual launch-day step documented in `LAUNCH-CHECKLIST.md` step 8.

### `deploy/README.md` (new)

Explains that files in `deploy/` are launch-day artifacts, not auto-deployed. Lists target cPanel paths, references LAUNCH-CHECKLIST.md + DEPLOY-NOTES.md, and enumerates what MUST NOT be committed (`.env*`, DB dumps, deploy tarballs, any secrets).

### `coming-soon/index.html` (modified)

Added `<!-- LAUNCH DAY: remove the noindex meta below (see .planning/phases/04-brand-launch/LAUNCH-CHECKLIST.md) -->` comment above the existing `<meta name="robots" content="noindex" />` line. The `noindex` itself is preserved — the coming-soon page is still serving from `public_html/` root and remains correctly de-indexed until launch day.

### `coming-soon/README.md` (modified)

Updated the "Notes" section pointing readers at the `<!-- LAUNCH DAY: -->` grep marker and the launch checklist / deploy notes.

### `.planning/phases/04-brand-launch/LAUNCH-CHECKLIST.md` (new)

17 hard-blocker steps + soft follow-ups + Phase 1-4 success-criteria re-verification matrix + sign-off block. Hard blockers cover:

1. WhatsApp number swap (D-01).
2. Social handles swap (D-05) — soft blocker.
3. Logo / hero image WebP conversion (seo-audit C1 / DEF-04-03-04).
4. Coming-soon noindex removal.
5. Formspree form ID (if coming-soon kept briefly).
6. PayPal env → live.
7. Document root swap (D-07 coordination).
8. `.htaccess` security headers + HTTPS.
9. robots.txt + sitemap.xml reachable.
10. Submit sitemap to Google Search Console.
11. Full order-flow smoke test.
12. Password-reset email smoke test — Malaysian inbox.
13. PDPA consent flow verification (`checked=false` default + DB timestamp).
14. Admin smoke.
15. 24h monitoring (LSWS + Node app.log).
16. Git tag `v1.0.0`.
17. Celebrate.

Plus Phase 1-4 success-criteria re-verification matrix (copied from ROADMAP.md) so the operator can walk through every phase's acceptance criteria on the live site before calling launch done.

### `.planning/phases/04-brand-launch/DEPLOY-NOTES.md` (new)

Documents:

- Current preview topology diagram (customer → LSWS → userdata ProxyPass → Node on 127.0.0.1:3100).
- Current `nohup` start procedure and why it doesn't survive reboots.
- **Three reboot-survival options** with trade-offs: cron `@reboot` + start script (recommended), systemd user unit (cleaner but cPanel often blocks `loginctl enable-linger`), PM2 (no net benefit).
- Chosen fix: Option A — cron `@reboot`.
- Env var flip matrix for launch (`PAYPAL_ENV` sandbox→live, basePath, site URL).
- How to update env vars in place (cPanel UI or vi + restart).
- **Preview→production swap procedure** (Path A: edit LSWS userdata; Path B: cPanel UI document-root change) with exact conf snippets before/after.
- Rollback procedure (~60 s via `mv public_html_old public_html` + restore userdata).
- **basePath rebuild requirement** — explicit warning that the preview tarball was built with `NEXT_PUBLIC_BASE_PATH=/v1`, so flipping userdata from `/v1` to `/` requires a REBUILD with empty basePath before the swap, not just a proxy change.
- Secret handling (never commit `.env.production`; use cPanel UI or SFTP).
- Cross-reference list mapping LAUNCH-CHECKLIST.md steps to this document.
- Open decisions / risk register.

## Task commits

1. **Task 1 — robots.ts + sitemap.ts** — `8de0e4a` (feat)
2. **Task 2 — .htaccess staged in deploy/** — `f1bed08` (feat)
3. **Task 3 — coming-soon noindex flag** — `f82671d` (chore)
4. **Tasks 4+5 — LAUNCH-CHECKLIST.md + DEPLOY-NOTES.md** — `5222f22` (docs)

All committed on `master`.

## Decisions made

- **`robots.ts` + `sitemap.ts` over static files.** Static `public/robots.txt` would not be Next.js-basePath-aware (`/v1` vs `/` preview/prod split). Using `src/app/robots.ts` + `src/app/sitemap.ts` lets Next.js handle basePath automatically AND regenerates the sitemap on each build + ISR interval, so newly-activated products surface without a manual regeneration step.
- **Allow list explicit rather than `allow: ["/"]` alone.** Even though a single top-level allow implicitly allows every descendent, enumerating the actual public routes makes the policy self-documenting and easier to review at a glance. Crawlers merge allow/disallow by longest-match; explicit allow + explicit disallow is unambiguous.
- **Sitemap fails soft, not hard.** A 500 on `/sitemap.xml` is worse than a temporarily-thin sitemap — it tells Google "this site is broken" and hurts crawl budget. The try/catch emits static routes only on failure, preserving canonical coverage.
- **Category entries use `?category=<slug>` query.** 3D Ninjaz uses a single `/shop` route with a category query param, not a dedicated `/shop/<category>` path. The sitemap encodes the query string; Google accepts URLs with query params in sitemap.
- **HSTS 2-year max-age + preload.** Stronger signal than the 1-year default in the plan's `.htaccess` template. cPanel AutoSSL is configured for LetsEncrypt renewal; with monitoring (checklist soft follow-up 3), the lockout risk is low. Preload submission happens after 6 months of stable HTTPS per the hstspreload.org policy.
- **Staged, not auto-deployed .htaccess.** Committing directly to `public_html/` (even via a build step) would cross-contaminate with the coming-soon files that still live there. `deploy/htaccess-launch.txt` + README makes the rollout explicit and auditable.
- **Coming-soon file committed rather than archived.** On disk audit showed `coming-soon/` as untracked. The commit treats the folder as part of the repo (source of truth for rollback) rather than a gitignored build artefact. The `<!-- LAUNCH DAY: -->` grep marker makes launch-day noindex removal a one-line find.
- **Deploy notes enumerate multiple reboot-survival options.** The recommendation is Option A (cron `@reboot`), but we document systemd + PM2 because different cPanel hosts allow different things. A future host migration might enable systemd; the template is pre-written.

## Deviations from plan

### Auto-fixed issues

**1. [Rule 1 — Bug] Fixed TypeScript error on `category.updatedAt` field access**

- **Found during:** Task 1 verification (`npx tsc --noEmit`).
- **Issue:** The sitemap initially used `c.updatedAt ?? now` for category `lastModified`, but `src/lib/db/schema.ts` only defines `createdAt` on the categories table. TypeScript error `TS2339: Property 'updatedAt' does not exist on type '{ id: string; name: string; slug: string; createdAt: Date; }'`.
- **Fix:** Changed to `c.createdAt ?? now` with an inline comment explaining the schema difference.
- **Files modified:** `src/app/sitemap.ts`.
- **Verified:** `npx tsc --noEmit` → exit 0 post-fix.
- **Committed in:** `8de0e4a` (Task 1 — fix folded into the same commit before the commit created).

**2. [Rule 2 — Critical functionality] Added `NEXT_PUBLIC_SITE_URL` override in sitemap base URL resolution**

- **Found during:** Reviewing the current preview deploy context (sitemap.ts would emit `https://3dninjaz.com/products/...` URLs even when served from `/v1` preview, mismatching the actual reachable URLs).
- **Issue:** The plan spec said "Base URL from env (`NEXT_PUBLIC_SITE_URL` or default `https://3dninjaz.com`)". Without this override, sitemap URLs on the preview would be wrong and confuse any early crawler probing the `/v1` sitemap.
- **Fix:** Added `resolveBaseUrl()` helper that checks env first with a trailing-slash strip; the plan's intent is satisfied.
- **Files modified:** `src/app/sitemap.ts`.
- **Committed in:** `8de0e4a` (Task 1).

**3. [Rule 3 — Unblocks scope] Included `getActiveCategories` in the sitemap despite category routes being query-string variants**

- **Found during:** Task 1 implementation — the prompt said "Also emit category entries if categories exist".
- **Issue:** 3D Ninjaz routes categories as `/shop?category=<slug>` (a query-string variant of `/shop`), not a dedicated path. Naively skipping them would lose discovery signal for category landing pages.
- **Fix:** Emitted query-string URLs with proper `encodeURIComponent(c.slug)`. Google sitemap validator accepts query-string URLs.
- **Files modified:** `src/app/sitemap.ts`.
- **Committed in:** `8de0e4a` (Task 1).

**Total deviations:** 3 auto-fixes (1 TS bug in my own code, 2 scope completions preemptively aligned with the prompt's explicit requirements). No architectural changes. No auth gates.

## Smoke tests

Smoke tests via `curl https://3dninjaz.com/v1/robots.txt` and `curl https://3dninjaz.com/v1/sitemap.xml` are launch-day tasks — the preview is up per the executor prompt ("Do NOT run npm run build or deploy again — preview is already up"), and the Node app on `127.0.0.1:3100` requires network access to the cPanel host. The automated checks performed:

| Check                                         | Command                                              | Result |
| --------------------------------------------- | ---------------------------------------------------- | ------ |
| `src/app/robots.ts` created                   | `test -f src/app/robots.ts`                          | ok     |
| `src/app/sitemap.ts` created                  | `test -f src/app/sitemap.ts`                         | ok     |
| robots has disallow list                      | `grep -q "disallow" src/app/robots.ts`               | ok     |
| robots blocks /admin                          | `grep -q "/admin" src/app/robots.ts`                 | ok (3 hits) |
| sitemap uses getActiveProducts                | `grep -q "getActiveProducts" src/app/sitemap.ts`     | ok (3 hits) |
| sitemap uses getActiveCategories              | `grep -q "getActiveCategories" src/app/sitemap.ts`   | ok (2 hits) |
| TypeScript clean                              | `npx tsc --noEmit`                                   | exit 0 (no errors) |
| `.htaccess` staged                            | `test -f deploy/htaccess-launch.txt`                 | ok     |
| .htaccess has HTTPS                           | `grep -q "HTTPS" deploy/htaccess-launch.txt`         | ok     |
| .htaccess has HSTS                            | `grep -q "Strict-Transport-Security" ...`            | ok     |
| .htaccess has nosniff                         | `grep -q "X-Content-Type-Options" ...`               | ok     |
| .htaccess has SAMEORIGIN                      | `grep -q "X-Frame-Options" ...`                      | ok     |
| .htaccess has Referrer-Policy                 | `grep -q "Referrer-Policy" ...`                      | ok     |
| .htaccess has Permissions-Policy              | `grep -q "Permissions-Policy" ...`                   | ok     |
| coming-soon has LAUNCH DAY flag               | `grep -q "LAUNCH DAY" coming-soon/index.html`        | ok     |
| coming-soon noindex still in place            | `grep -q "robots.*noindex" coming-soon/index.html`   | ok (intentional until launch) |
| LAUNCH-CHECKLIST.md committed                 | `test -f .planning/phases/04-brand-launch/LAUNCH-CHECKLIST.md` | ok |
| DEPLOY-NOTES.md committed                     | `test -f .planning/phases/04-brand-launch/DEPLOY-NOTES.md`     | ok |

Launch-day smoke tests (`curl` against live preview URLs) will be executed by the operator per `LAUNCH-CHECKLIST.md` steps 9 + 11.

## Threat-model coverage

| Threat                                   | Disposition | Mitigation in shipped code / docs                                                              |
| ---------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| T-04-04-01 (admin routes indexed)        | mitigate    | `src/app/robots.ts` disallow covers `/admin`, `/admin/`, `/api/`. Handler-level auth (Phase 1) is the real gate. |
| T-04-04-02 (draft products in sitemap)   | mitigate    | `src/app/sitemap.ts` calls `getActiveProducts()` which filters `isActive=true`. Verified at read time. |
| T-04-04-03 (WhatsApp placeholder live)   | mitigate    | `LAUNCH-CHECKLIST.md` step 1 is a hard blocker. Plan 04-02's `isWhatsAppPlaceholder()` UI badge surfaces the state. |
| T-04-04-04 (HTTP first-request leakage)  | mitigate    | `deploy/htaccess-launch.txt` 301 HTTP→HTTPS + HSTS max-age 2y preload.                        |
| T-04-04-05 (MIME sniffing on uploads)    | mitigate    | `X-Content-Type-Options: nosniff` in staged `.htaccess`.                                      |
| T-04-04-06 (clickjacking admin)          | mitigate    | `X-Frame-Options: SAMEORIGIN` in staged `.htaccess`.                                           |
| T-04-04-07 (no launch audit trail)       | mitigate    | `LAUNCH-CHECKLIST.md` + git history + commit hashes form the audit record.                     |
| T-04-04-08 (HSTS lockout on cert fail)   | mitigate    | `DEPLOY-NOTES.md` risk register + soft follow-up 3 in the checklist require cPanel AutoSSL monitoring. |
| T-04-04-09 (coming-soon noindex conflict)| mitigate    | `<!-- LAUNCH DAY -->` grep marker + checklist step 4 remove the noindex at launch.            |
| T-04-04-10 (WhatsApp social engineering) | mitigate    | Privacy + Contact + Terms publish the same WhatsApp number; cross-reference prevents spoofing. Checklist step 1 validates the production number is the real one. |

## Known stubs

None introduced by this plan. The WhatsApp placeholder (D-01) and social handles (D-05) are pre-existing stubs from Plans 04-02 / 04-03 and are explicitly tracked in `LAUNCH-CHECKLIST.md` hard blockers 1 and 2.

## Threat flags

None. No new network endpoints, auth paths, file-access patterns, or schema changes at trust boundaries.

## TDD Gate Compliance

This plan is `type: execute`, not `type: tdd` — no RED/GREEN/REFACTOR gate sequence expected.

## Self-Check

**Files:**
- `src/app/robots.ts` — FOUND
- `src/app/sitemap.ts` — FOUND
- `deploy/htaccess-launch.txt` — FOUND
- `deploy/README.md` — FOUND
- `.planning/phases/04-brand-launch/LAUNCH-CHECKLIST.md` — FOUND
- `.planning/phases/04-brand-launch/DEPLOY-NOTES.md` — FOUND
- `coming-soon/index.html` — FOUND (with LAUNCH DAY marker + existing noindex preserved)
- `coming-soon/README.md` — FOUND (updated Notes section)

**Commits:**
- `8de0e4a` — FOUND (Task 1: robots.ts + sitemap.ts)
- `f1bed08` — FOUND (Task 2: staged .htaccess + README)
- `f82671d` — FOUND (Task 3: coming-soon noindex flag + README)
- `5222f22` — FOUND (Tasks 4+5: LAUNCH-CHECKLIST + DEPLOY-NOTES)

## Self-Check: PASSED

## Next steps

Phase 4 is code-complete. Remaining work is **human-gated launch execution**:

1. Owner reviews LAUNCH-CHECKLIST.md hard blockers.
2. Owner provides D-01 WhatsApp number + D-05 social handles.
3. Operator optimises `public/logo.png` to WebP per DEF-04-03-04.
4. Operator rebuilds app with `NEXT_PUBLIC_BASE_PATH=` empty.
5. Operator flips document root per `DEPLOY-NOTES.md` Path A.
6. Operator uploads `deploy/htaccess-launch.txt` as `/home/ninjaz/public_html/.htaccess`.
7. Operator runs checklist steps 11-15 (order flow, email, PDPA, admin smoke, monitoring).
8. `git tag v1.0.0` + push tag.

Phase 5 (Admin Extensions) is planned in ROADMAP.md and ready to execute when the v1 launch is stable.

---

*Phase: 04-brand-launch*
*Plan: 04*
*Completed: 2026-04-20*
