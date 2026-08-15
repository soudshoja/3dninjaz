---
id: 260815-rsk
status: complete
date: 2026-08-15
commits: b9fa719 (digest), 18bcbf1 (deploy fix), 21fb753 (customer reminder)
prs: "#201 dev, #202 dev, #204 dev, #203 master (OPEN)"
branch: feat/draft-stale-digest, fix/deploy-ship-scripts, feat/draft-customer-reminder
base: origin/dev
---

# Quick Task 260815-rsk — Summary

## Shipped (dev)

**Admin digest (#201).** Cron at 09:00 MYT sends one WhatsApp to `601125434730` listing every
`checkout_drafts` row still `open` and >24h old, grouped by MYT creation date, then stamps
`notified_at` so each is reported exactly once.

**Customer reminder (#204).** Second pass on the same cron, **disabled by default**, that
WhatsApps each customer once ~24h after they abandoned checkout. New Notification Center event
`draft_abandoned_reminder` (toggle + editable template). Bookkeeping in a separate
`customer_notified_at` column.

**Deploy fix (#202).** `scripts/` was never in the deploy bundle.

## Scope deviations from PLAN.md

1. **`scripts/` was not deployed** — the plan's T3 assumed the cron would reach the box on merge.
   It could not: `deploy.yml` packed only `.next public server.js package.json package-lock.json
   next.config.ts`. The box's `scripts/` was an April leftover, so `reconcile-paypal.cjs` running
   there was also 4 months stale. Fixed in #202 rather than hand-copying the file, which would
   have created exactly the untracked drift the no-manual-deploys rule exists to prevent.
2. **Customer-facing reminder added mid-task.** PLAN.md listed it under Out of scope; the user
   asked for it directly ("trigger a message to them as reminder"). Built with guards after an
   explicit go/no-go on the ban risk.

## The seeding trap (worth remembering)

`getWhatsappNotificationsAll()` lazy-seeds newly added event keys with `enabled: true`. Adding
`draft_abandoned_reminder` naively would have switched itself on during an unrelated deploy and
started messaging customers with nobody having decided to. Closed by a per-key `DEFAULT_ENABLED`
map in `src/lib/whatsapp/events.ts`; the reminder seeds disabled.

Same mechanism explains why dev was missing 4 notification rows (`order_pending`,
`order_bank_transfer_instructions`, `order_approved`, `return_expired`) — nobody had loaded
`/admin/notifications` since those keys were added. They backfill on next visit. Not a bug.

## Verified on dev

| Check | Result |
|---|---|
| Migration `notified_at` | applied to `ninjaz_3dn`, idempotent on 2nd run, `timestamp NULL DEFAULT NULL` |
| Migration `customer_notified_at` | applied, refuses to run if `notified_at` is missing |
| Admin digest dry-run | 3h-old draft correctly excluded; 30h + 54h grouped under their MYT dates |
| Nothing stamped on dry-run | `SELECT COUNT(*) WHERE notified_at IS NOT NULL` stayed 0 |
| Customer pass, key unseeded | skipped with a reason |
| Customer pass, outside hours | `0:00 MYT is outside 9-20 — skipped` |
| Customer pass, `--force-window` | rendered correctly; `0123456789` → `60123456789` |
| Unusable phone `"12"` | skipped, left unstamped for a later corrected number |
| Cron registered | dev crontab, all 4 pre-existing entries preserved |
| Test data | seeded rows and the temporary enabled row deleted afterwards |

Cron has not fired yet — it was registered at ~12:20 UTC, after that day's 01:00 UTC slot. First
real fire is 01:00 UTC (09:00 MYT) the following day.

## Two defects found, NOT fixed (outside this task)

**1. Emoji are corrupted in prod WhatsApp templates.** `whatsapp_notifications` on `ninjaz_3dnp`
stores a literal `?` where the emoji should be:

```
order_confirmation   Hi {{customerName}}! ? Your 3D Ninjaz order {{orderNumber}} is confirm
order_delivered      ...Enjoy! ?
```

Customers are receiving that today. The table and column are `utf8mb4`, and `src/lib/db/index.ts`
sets `charset: "utf8mb4"` on the pool — so the loss happened on some earlier seeding path, not the
app's normal write. Root cause NOT confirmed. `order_bank_transfer_instructions` kept its emoji,
which suggests rows written later (or edited through the admin UI) are fine. Cheapest fix is
probably re-saving those two templates from `/admin/notifications`.

**2. Dev has no `NEXT_PUBLIC_SITE_URL`.** `publicOrigin()` therefore falls back to the prod domain,
so customer-facing links generated on dev (WhatsApp, emails, payment links) point at
`3dninjaz.com`. The dev digest's "Follow up" link points at the prod admin while listing dev rows.
Per the documented convention dev should resolve to `app.3dninjaz.com`.

## Prod status

**Not deployed.** PR **#203** is open against `master` — a deliberate 3-commit cherry-pick
(#200 attribution, #201 digest, #202 deploy fix), not a dev→master merge, because dev is 33 commits
ahead and carries Phase 25 / Meshy / production-split work with pending migrations and unfinished
UAT. The customer reminder (#204) is dev-only and deliberately not in that release.

After #203 merges, prod still needs, manually:
1. `node scripts/drafts-notified-at-migrate.cjs` against `ninjaz_3dnp`
2. crontab entry under `ninjaz` pointing at `/home/ninjaz/apps/3dninjaz_prod`
