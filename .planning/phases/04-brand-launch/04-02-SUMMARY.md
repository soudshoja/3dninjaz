---
phase: 04-brand-launch
plan: 02
subsystem: brand-launch/content
status: complete
wave: 1
tags:
  - content
  - pdpa
  - whatsapp
  - static-pages
  - a11y
requirements:
  - BRAND-02
  - BRAND-03
  - BRAND-04
decisions:
  - D-01
  - D-02
  - D-03
  - D-04
  - D-05
  - D-06
dependency_graph:
  requires:
    - src/app/(store)/layout.tsx  # Phase 2 — inherited nav + footer
    - src/lib/brand.ts             # Phase 2 — palette constants
    - src/components/brand/shuriken.tsx
    - src/components/brand/wave.tsx
    - src/components/auth/register-form.tsx  # Phase 1 — already links /privacy
  provides:
    - BUSINESS constant + whatsappLink helper + isWhatsAppPlaceholder guard
    - WhatsAppCta component (primary / ghost / inline variants)
    - /about public route
    - /contact public route
    - /privacy public route (PDPA 2010 compliant)
    - /terms public route
  affects:
    - /register → /privacy consent link now resolves to real content (no 404)
tech_stack:
  added: []          # no new runtime deps
  patterns:
    - single-source-of-truth module for business info
    - server-component static content pages under (store) route group
    - wa.me deep-link with URL-encoded pre-filled message
    - placeholder-aware CTA badge (UI flags when number is still 60000000000)
key_files:
  created:
    - src/lib/business-info.ts                  # 77 lines
    - src/components/store/whatsapp-cta.tsx     # 130 lines
    - src/app/(store)/about/page.tsx            # 167 lines
    - src/app/(store)/contact/page.tsx          # 106 lines
    - src/app/(store)/privacy/page.tsx          # 342 lines
    - src/app/(store)/terms/page.tsx            # 189 lines
    - .planning/phases/04-brand-launch/deferred-items.md
  modified: []       # none — strictly additive; parallel executors untouched
metrics:
  duration: ~25 min
  files_created: 7
  files_modified: 0
  tasks_completed: 3   # Task 1, Task 2, Task 3 (from plan's 4; checkpoint:decision skipped because DECISIONS.md already supplied all answers)
  commit: e39c805
  completed_at: 2026-04-16
---

# Phase 4 Plan 02: Brand trust pages + WhatsApp CTA Summary

Shipped four static content pages (`/about`, `/contact`, `/privacy`, `/terms`), a reusable PDPA-compliant business-info module, and a WhatsApp CTA component that closes the Phase 1 registration consent loop — turning 3D Ninjaz from a generic Next.js shell into a launch-ready Malaysian B2C store.

## Objective — status

BRAND-02 (About + Contact), BRAND-03 (WhatsApp), BRAND-04 (PDPA-compliant privacy notice) all met. `/register` PDPA checkbox now links to live `/privacy` content (404 loop closed).

## What changed

### New source of truth — `src/lib/business-info.ts`
- `BUSINESS` constant with legal/trading name, city, country, contact email, DPO email, WhatsApp number, socials, retention periods, and business hours.
- `whatsappLink(message?)` — returns `https://wa.me/<number>?text=<urlencoded>`.
- `isWhatsAppPlaceholder()` — UI guard for the placeholder `60000000000`.
- All D-02, D-04, D-06 values hard-coded; D-01 + D-05 use placeholders with TODO comments.

### Reusable WhatsApp CTA — `src/components/store/whatsapp-cta.tsx`
- Three variants:
  - `primary`: chunky green pill, 48px min-height, shadow + lift hover (matches demo-v2 CTA).
  - `ghost`: ink outline pill, 48px min-height.
  - `inline`: underlined blue text link for paragraphs.
- `target="_blank"` + `rel="noopener noreferrer"` on all variants (T-04-02-08).
- URL-encodes caller-supplied messages via `encodeURIComponent` (T-04-02-02).
- Renders a "Pending" badge (primary/ghost) or "(pending)" hint (inline) while `isWhatsAppPlaceholder()` returns true, so QA and customers see the placeholder state instead of a silent dead link.
- Server-safe — no `"use client"`, no state, no effects.

### /about — three sections
1. Hero — ninja-themed intro, Made-in-Malaysia pill, animated shuriken accents, matches coming-soon tone.
2. "What we print" — purple section explaining S/M/L sizing + made-to-order.
3. "Printed in KL" — CTA pill linking to `/shop`.

### /contact
- Primary WhatsApp CTA centered, 48px+ tap target.
- Email, business hours, location as a cream card grid.
- Tip box reminding customers to have their order number ready.
- No form in v1 (scope).

### /privacy — 11 PDPA 2010 sections
All required elements present as distinct `<h2>` headings (verified: `grep -o '<h2' | wc -l` = 11):
1. Who we are
2. What data we collect (account / order / payment / technical)
3. Why we collect it (purpose limitation; explicit "do not sell" clause)
4. Who we share it with (PayPal, cPanel SMTP, cPanel host, couriers; analytics=none-yet)
5. Retention (D-06: 7y orders / 3y accounts post-last-login / marketing-until-unsubscribe)
6. Rights under PDPA 2010 (access / correction / withdrawal / deletion / portability / complaint)
7. How to exercise rights — 21 business-day response commitment
8. Cookies — essential only, no tracking
9. Security — hashed passwords, HTTPS, PayPal PCI, staff access control
10. Changes to this policy
11. Consent record — ties to Phase 1's `pdpaConsentAt` timestamp

100% hard-coded JSX; only dynamic values are `BUSINESS.*` constants + `LAST_UPDATED` at build. No admin-editable / user-editable content (T-04-02-01 mitigation).

### /terms — 11 plain-English clauses
Last-updated date, "Who we are", accounts, ordering + MYR pricing (no SST claim — D-03), delivery, cancellations + 14-day defect returns, prices, IP + acceptable use, liability, governing law = Malaysia, changes, contact (email + inline WhatsApp CTA).

## Smoke tests (dev server on :3178)

| Check | Result |
|---|---|
| `GET /about` | 200 |
| `GET /contact` | 200 |
| `GET /privacy` | 200 |
| `GET /terms` | 200 |
| `GET /register` | 200 (still links `href="/privacy"` — consent loop closed) |
| `/privacy` h2 count | 11 (all PDPA sections present) |
| `/privacy` h1 count | 1 (semantic heading hierarchy, no skipped levels) |
| `/privacy` contains "PDPA" | yes (2 occurrences) |
| `/privacy` contains "21 business days" | yes |
| `/privacy` contains "7 years" + "3 years" (retention) | yes |
| `/privacy` DPO email = info@3dninjaz.com | yes |
| `/contact` WhatsApp href | `https://wa.me/60000000000?text=Hi%203D%20Ninjaz%2C%20I%20have%20a%20question.` |
| `/contact` rel="noopener noreferrer" | yes (2 occurrences — primary CTA + footer mirror) |
| `/contact` Pending badge rendered | yes (placeholder detection working) |
| `/terms` contains "Last updated" | yes |
| `/terms` contains "MYR" | yes |
| `/terms` contains "SST" / "tax registration" | **no (D-03 satisfied)** |
| `/about`, `/contact`, `/privacy`, `/terms` SST mentions | **0 each (D-03 satisfied)** |
| nav + footer inherited from store layout | yes (all four routes) |

## Type-check & build

- `npx tsc --noEmit` → **exit 0** (clean across whole repo including my files).
- `npm run build` (turbopack) → compile succeeds (`✓ Compiled successfully in 2.9s`), then fails at type-linting on `src/app/layout.tsx:94` — **this is Plan 04-01 in-flight code, NOT Plan 04-02 scope**. Logged as DEF-04-02-01 in `.planning/phases/04-brand-launch/deferred-items.md` with a suggested fix for the 04-01 owner.

## Deviations from plan

### 1. [Rule 4 — Procedural] Skipped `checkpoint:decision` task

The plan opens with a `checkpoint:decision` task asking the user for Q4-01 / Q4-02 / Q4-04 / Q4-05 / Q4-06 answers. **The executor prompt already supplied all answers** (referencing DECISIONS.md D-01 through D-07), so pausing for another checkpoint would be redundant. Applied the DECISIONS.md values directly:

| Question | Plan default | DECISIONS.md value (used) |
|---|---|---|
| Q4-01 WhatsApp | `60000000000` placeholder | `60000000000` placeholder (D-01) — same |
| Q4-02 Trading name | "3D Ninjaz" | **"3D Ninjaz"** no suffix (D-02) |
| Q4-04 DPO email | `hello@3dninjaz.com` | **`info@3dninjaz.com`** (D-04) — overrides plan default |
| Q4-05 Socials | empty placeholders | `#` placeholders (D-05) |
| Q4-06 Retention | 7y / 3y | 7y / 3y (D-06) — same |

One material override: `dpoEmail` is `info@3dninjaz.com` per D-04 (the plan's default was `hello@3dninjaz.com`). All UX copy uses the D-04 address.

### 2. [Rule 4 — Procedural] Skipped `checkpoint:human-verify` task

The prompt explicitly instructs to run smoke tests and produce a `status: complete` summary ("After writing: 04-02-SUMMARY.md with `status: complete`, files changed, smoke tests..."), overriding the plan's final human-verify checkpoint. The automated smoke tests above (all routes 200, markers present, accessibility markers in place, no D-03 violations) stand in as the verification gate. Visual / Lighthouse verification is deferred to Plan 04-03 (responsive polish sweep) which performs the viewport + Lighthouse audits across every route.

### 3. [Rule 2 — Critical functionality] Added `isWhatsAppPlaceholder()` + UI badge

Plan's Task 1 specified `whatsappLink()` only. I added `isWhatsAppPlaceholder()` and wired a "Pending" badge in the CTA so:
- QA can immediately see at a glance that the link is a placeholder.
- Customers don't click a dead link thinking it's the real WhatsApp destination.
- Plan 04-04 launch checklist has a visible UI signal to verify before flipping live (no need to grep the source).

This directly supports T-04-02-03 (placeholder number = launch blocker) by making the placeholder state visible, not hidden.

### 4. [Out of scope — logged to deferred-items] Build fails on `src/app/layout.tsx`

Turbopack type-linting fails on a predicate in `src/app/layout.tsx:94` created by the parallel Plan 04-01 executor. Fixing it would stomp on their in-flight work. Workaround: verified Plan 04-02 with `npx tsc --noEmit` (exit 0). See `.planning/phases/04-brand-launch/deferred-items.md` DEF-04-02-01 for the suggested fix.

## Threat-model coverage

| Threat | Disposition | Mitigation in shipped code |
|---|---|---|
| T-04-02-01 — PII leakage via CMS/markdown | mitigate | All four pages render only hard-coded JSX + `BUSINESS.*` constants + `LAST_UPDATED`. No markdown, no user input. |
| T-04-02-02 — Injection in wa.me message | mitigate | `whatsappLink()` calls `encodeURIComponent`. Today's callers pass hard-coded strings only. |
| T-04-02-03 — Placeholder number goes live | mitigate | `isWhatsAppPlaceholder()` + "Pending" badge in primary/ghost variants + inline `(pending)` hint — visible signal for QA. TODO comment on `whatsappNumber` line references Q4-01 / D-01. |
| T-04-02-04 — Public WhatsApp number disclosure | accept | Same number surfaces on About + Contact + Terms so customers can cross-reference (anti-spoofing). Privacy policy notes WhatsApp is voluntary + subject to their own policy. |
| T-04-02-05 — Consent repudiation | mitigate | Privacy policy §11 explicitly documents the `pdpaConsentAt` timestamp captured at registration. |
| T-04-02-06 — PDPA completeness | mitigate | All 11 required sections present as distinct `<h2>` (verified: grep count = 11). |
| T-04-02-07 — Static-route tampering | accept | Repo-only surface; unchanged. |
| T-04-02-08 — Tabnabbing via target=_blank | mitigate | All three variants emit `rel="noopener noreferrer"` (verified in rendered HTML). |

## Known stubs

- `BUSINESS.whatsappNumber = "60000000000"` — D-01 pending user input. Surfaced via UI badge + TODO comment. Plan 04-04 launch checklist MUST replace before flipping live.
- `BUSINESS.socials.instagram = "#"` + `BUSINESS.socials.tiktok = "#"` — D-05 pending user input. Soft warning per DECISIONS.md (launch can proceed with socials hidden). Not yet rendered anywhere in Plan 04-02 files; Plan 04-03 footer update is the likely next consumer.

Both stubs are intentional and documented in the DECISIONS.md register; neither prevents the Plan 04-02 goal ("live trust-content pages with closed PDPA consent loop") from being achieved.

## Threat Flags

None. No new network endpoints, auth paths, file-access patterns, or schema changes at trust boundaries.

## Self-Check

**Files:**
- `src/lib/business-info.ts` — FOUND
- `src/components/store/whatsapp-cta.tsx` — FOUND
- `src/app/(store)/about/page.tsx` — FOUND
- `src/app/(store)/contact/page.tsx` — FOUND
- `src/app/(store)/privacy/page.tsx` — FOUND
- `src/app/(store)/terms/page.tsx` — FOUND
- `.planning/phases/04-brand-launch/deferred-items.md` — FOUND

**Commits:**
- `e39c805` — FOUND (via `git log --oneline -3`)

## Self-Check: PASSED

## Coordination with parallel executors

- Plan 04-01 (brand metadata): no file overlap. While 04-02 was being written, 04-01 landed commits `26db83b` (SITE metadata module + JsonLd) and `17389cf` (favicon set). Their `src/app/layout.tsx` edit has a turbopack type error (logged) but does not touch any 04-02 file.
- Phase 3 Wave 1 (checkout/orders): no file overlap. Phase 3 owns `src/lib/db/*`, `src/lib/paypal*`, `src/lib/validators.ts`, `src/lib/orders.ts` — all untouched here.
- Working-tree state at plan start was preserved: no unintended deletions (`git diff --diff-filter=D HEAD~1 HEAD` empty), no files staged that aren't mine.
