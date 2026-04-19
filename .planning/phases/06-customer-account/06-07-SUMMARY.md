---
phase: 06-customer-account
plan: 07
subsystem: account-closure
tags: [account, pdpa, closure, better-auth, transactions]
requires:
  - "Phase 6 06-01 (user.deletedAt column, accountCloseSchema, requireUser hardened with cold-path reload)"
  - "Phase 6 06-02 (account layout shell)"
provides:
  - "/account/close — danger zone PDPA copy + form"
  - "src/actions/account-close.ts (closeMyAccount)"
  - "Closure banner on homepage (?closed=1)"
affects:
  - src/app/(store)/account/close/page.tsx
  - src/actions/account-close.ts
  - src/components/account/close-account-form.tsx
  - src/app/(store)/page.tsx
tech-stack:
  added: []
  patterns:
    - "Atomic closure: db.transaction wraps user anonymize + addresses delete + wishlists delete + session delete"
    - "Belt-and-braces session kill: hard-delete from session table inside transaction + best-effort Better Auth banUser outside"
    - "Anonymized email format `deleted-<userId>@3dninjaz.local` keeps the UNIQUE email constraint satisfied while freeing the original email for re-registration (Q-06-07)"
    - "Defense-in-depth via requireUser() cold-path reload (added in 06-01) — even if the session cookie outlives the closure transaction, the next request can't pass the auth gate"
key-files:
  created:
    - src/app/(store)/account/close/page.tsx
    - src/actions/account-close.ts
    - src/components/account/close-account-form.tsx
  modified:
    - src/app/(store)/page.tsx (closure banner when ?closed=1)
decisions:
  - "Better Auth banUser API typing: cast through `unknown` because @better-auth/admin plugin types may not surface banUser uniformly across versions. Best-effort try/catch keeps the closure transaction authoritative."
  - "Closure banner uses purple BRAND tint (no new red semantic added at homepage level — danger semantics stay on /account/close)."
  - "Re-registration with original email is allowed (Q-06-07 resolution from phase prompt). New account is logically disjoint from the closed-and-anonymized row; orders remain anchored to the old user row by FK."
metrics:
  duration_minutes: 8
  tasks_completed: 2
  files_created: 3
  files_modified: 1
  completed_date: 2026-04-19
---

# Phase 6 Plan 07: Account Closure Summary

CUST-08 closes. Customer can self-service close their account; PDPA copy explains every consequence; orders/order_requests/reviews preserved per D-06 7y retention; addresses/wishlists/sessions hard-deleted; original email freed for re-registration.

## What shipped

- **`/account/close`** — Danger Zone page with PDPA bullet list (anonymized name/email/image, deleted addresses/wishlist, sessions invalidated, 7-year order retention, re-registration allowed) + DPO contact link + CloseAccountForm
- **`CloseAccountForm`** — typed-literal "DELETE" gate disables submit until exact match; on success the server action redirects to `/?closed=1`
- **`closeMyAccount` server action** — atomic anonymize via db.transaction:
  - user row: `email = deleted-<id>@3dninjaz.local`, `emailVerified = false`, `name = "Former customer"`, `image = null`, `banned = true`, `banReason`, `deletedAt = now()`
  - DELETE from addresses WHERE userId = ?
  - DELETE from wishlists WHERE userId = ?
  - DELETE from session WHERE userId = ?
  - Best-effort `auth.api.banUser({...})` outside the transaction
  - `redirect("/?closed=1")`
- **Homepage banner** — when `?closed=1`, render a slim purple-tinted strip above the hero acknowledging the closure

## Threat mitigations applied

| Threat ID                | Mitigation                                                                |
| ------------------------ | ------------------------------------------------------------------------- |
| T-06-07-auth             | requireUser() FIRST await on closeMyAccount                               |
| T-06-07-consent          | accountCloseSchema.literal("DELETE") + client button disabled until match |
| T-06-07-atomicity        | db.transaction wraps user update + 3 deletes — atomic                     |
| T-06-07-lag              | requireUser() (06-01) cold-reload catches stale-session-after-closure     |
| T-06-07-PDPA-over-delete | Orders / order_requests / reviews NOT touched (NO-cascade FKs)            |
| T-06-07-PDPA-under-delete | Email anonymized; name → "Former customer"; image nulled                  |
| T-06-07-XSS              | Banner copy is a static string; React auto-escapes                        |
| T-06-07-PII-log          | console.error logs only error object — no email / name / userId body     |

## Re-registration flow (Q-06-07 resolution)

After closure:
1. user.email = `deleted-<userId>@3dninjaz.local` — UNIQUE constraint still satisfied
2. The original email is FREE
3. A signup with the original email creates a brand-new user row
4. Old orders / reviews / order_requests still point at the OLD anonymized row by FK — no cross-account leakage
5. The new account starts fresh with zero history

## Verification

- `npx tsc --noEmit` — clean (no Phase 6 errors; Phase 5 admin-shipping was resolved by Phase 5's parallel commit during this plan's execution)
- 3 new files; 1 modified
- Closure transaction order verified by code review: anonymize → delete addresses → delete wishlists → delete sessions
- Better Auth banUser is best-effort via try/catch + dynamic typing cast (no hard dependency on plugin's surface API shape)

## Self-Check: PASSED

- FOUND: src/app/(store)/account/close/page.tsx (Danger zone copy + DPO link + form)
- FOUND: src/actions/account-close.ts (atomic closeMyAccount with db.transaction + best-effort banUser)
- FOUND: src/components/account/close-account-form.tsx (DELETE-literal gate)
- FOUND: src/app/(store)/page.tsx (?closed=1 banner)
- PASSED: npx tsc --noEmit clean
