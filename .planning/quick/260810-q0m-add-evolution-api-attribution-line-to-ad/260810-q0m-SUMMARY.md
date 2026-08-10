---
id: 260810-q0m
status: complete
date: 2026-08-10
commit: d374898
branch: feat/evolution-api-attribution
base: origin/dev
---

# Quick Task 260810-q0m — Summary

## What shipped

One presentational block in `src/app/(admin)/admin/settings/page.tsx` (+19 lines), rendered
directly under `<WhatsappConnectPanel />` inside the existing `mt-8 max-w-2xl space-y-6` stack:

> WhatsApp notifications powered by [Evolution API](https://github.com/evolution-foundation/evolution-api) (Apache-2.0).

`text-xs text-slate-500`, link opens in a new tab with `rel="noopener noreferrer"`. A block
comment above it names the licence clause so a later copy-cleanup pass does not remove it as
decoration.

## Why (licence finding)

Evolution API is **not MIT** — the assumption that prompted this task. Its `LICENSE` (verified
on the running install at `/home/ninjaz/evolution-api` and against the upstream repo) is
Apache-2.0 **plus additional conditions**; `package.json` declares `"license": "Apache-2.0"`
but the LICENSE file adds riders, which is why GitHub's licence API returns
`spdx_id: NOASSERTION`, `name: Other`.

- **Clause 1a** (no removing LOGO/copyright from Evolution's frontend components) — does not
  apply; the Evolution Manager console is not exposed or rebranded here.
- **Clause 1b** (usage notification, admin-visible, from settings page or docs) — **did apply
  and was unmet.** "Evolution API" appeared only in a JSDoc comment in
  `src/components/admin/whatsapp-connect-panel.tsx`. Non-compliance can trigger a demand for a
  commercial licence (`suporte@evofoundation.com.br`). This change closes it.

## Version context (no upgrade performed)

| Track | Version | Date | |
|---|---|---|---|
| Stable | 2.3.7 | 2025-12-05 | currently installed, both `/home/ninjaz/evolution-api` and `/home/resayili/evolution-otp` |
| Pre-release | 2.4.0-rc2 | 2026-05-17 | not adopted |

Staying on 2.3.7 by decision. 2.4.0 is still RC and makes activation against the Evolution
Foundation licensing server mandatory — a new hard external dependency sitting on the
order-notification path. Nothing in 2.4.0 fixes a bug this project has. Upstream repo also
moved from `EvolutionAPI/evolution-api` to `evolution-foundation/evolution-api`; the
attribution link uses the new org.

## Verification

- `npx tsc --noEmit` → exit 0.
- `git show --stat` → exactly 1 file, +19 lines, no collateral changes.
- Page is `requireAdmin()`-gated with `robots: { index: false }` — notice is admin-visible as
  the clause requires, and not exposed to the storefront.
- Not visually smoke-tested on dev yet — that happens after the PR merges and dev deploys.

## Follow-ups

- Human check on dev: notice renders under the WhatsApp panel on `/admin/settings`.
- Revisit 2.4.x only once it goes stable **and** the licensing-server terms are clear
  (offline/self-host path, free tier).
