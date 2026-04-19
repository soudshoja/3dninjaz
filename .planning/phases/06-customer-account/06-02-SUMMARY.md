---
phase: 06-customer-account
plan: 02
subsystem: account-shell-security
tags: [account, profile, security, better-auth, navigation, mobile]
requires:
  - "Phase 6 06-01 (requireUser, profileUpdateSchema, changeEmailSchema, changePasswordSchema)"
  - "Phase 1 Better Auth (auth.api.changeEmail / changePassword native APIs)"
provides:
  - "/account profile overview"
  - "/account/security change email + password"
  - "/account shell layout (sidebar + chip strip)"
  - "src/actions/account.ts (updateProfile, changeEmail, changePassword)"
  - "UserNav dropdown extensions (Profile, My orders, Addresses, Wishlist links)"
affects:
  - src/app/(store)/account/layout.tsx
  - src/app/(store)/account/page.tsx
  - src/app/(store)/account/security/page.tsx
  - src/actions/account.ts
  - src/components/account/{account-sidebar,profile-form,change-email-form,change-password-form,loyalty-card}.tsx
  - src/components/auth/user-nav.tsx
tech-stack:
  added: []
  patterns:
    - "Layout-level redirect (`/login?next=/account`) + requireUser() in actions = double gate (T-06-02-auth)"
    - "useTransition + react-hook-form + zodResolver for all account forms"
    - "BRAND tokens via inline style for danger semantics (#DC2626) — no global token added in v1"
key-files:
  created:
    - src/app/(store)/account/layout.tsx
    - src/app/(store)/account/page.tsx
    - src/app/(store)/account/security/page.tsx
    - src/actions/account.ts
    - src/components/account/account-sidebar.tsx
    - src/components/account/profile-form.tsx
    - src/components/account/change-email-form.tsx
    - src/components/account/change-password-form.tsx
    - src/components/account/loyalty-card.tsx
  modified:
    - src/components/auth/user-nav.tsx
decisions:
  - "Mobile QA deferred to operator smoke test — no automated viewport runner in repo. Code uses min-h-[48px] / min-h-[60px] consistently per D-04."
  - "ChangePasswordForm includes a UI-only confirmNewPassword check (Zod schema only validates the diff, per spec)."
  - "Loyalty placeholder uses purple accent + 'Coming soon' pill — matches PROJECT brand"
metrics:
  duration_minutes: 12
  tasks_completed: 2
  files_created: 9
  files_modified: 1
  completed_date: 2026-04-19
---

# Phase 6 Plan 02: Account Shell + Security Summary

CUST-01 + CUST-02 close. Customer can manage display name, email (verification flow), and password (current-password challenge) end-to-end. Account shell ready to host 06-03 + 06-04.

## What shipped

- **`/account`** — profile overview with display-name form, read-only email + Change link, member-since + total-orders glance, loyalty placeholder
- **`/account/security`** — change email (Better Auth verification email) and change password (Better Auth currentPassword challenge), with `?verified=1` success banner
- **`/account` layout** — auth gate at layout level (redirect to `/login?next=/account`), wraps every `/account/*` child in the AccountSidebar shell
- **AccountSidebar** — desktop vertical nav with active-state accent, mobile horizontal chip strip; tap targets ≥44px (mobile) / ≥48px (desktop)
- **Server actions** — `updateProfile`, `changeEmail`, `changePassword` all gate on `requireUser()` first (T-06-02-auth)
- **UserNav** — Profile / My orders / Addresses / Wishlist links inserted above admin/sign-out

## Better Auth integration

- `auth.api.changeEmail({ body: { newEmail, callbackURL: "/account/security?verified=1" }, headers })` triggers verification email to the new address. The user.email column does NOT change until the user clicks the link in the new inbox.
- `auth.api.changePassword({ body: { currentPassword, newPassword, revokeOtherSessions: false }, headers })` — server-side currentPassword challenge; session stays alive.
- Both calls wrapped in try/catch with generic error copy ("Could not start email change") — does NOT leak whether the new email is in use or whether the current password failed (T-06-02-enumeration).

## Threat mitigations applied

| Threat ID                   | Mitigation                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| T-06-02-auth                | Layout redirect + requireUser() in every action — double gate against CVE-2025-29927      |
| T-06-02-credential-stuffing | Better Auth re-auths currentPassword server-side; no session-only bypass                  |
| T-06-02-enumeration         | Generic error copy hides whether email-in-use vs password-failed                          |
| T-06-02-PII-log             | console.error logs only the error object — never password, newEmail, or session token    |
| T-06-02-XSS                 | All output via React JSX — auto-escaped; no raw-HTML injection sink anywhere              |
| T-06-02-CSRF                | Next.js server actions same-origin only; no extra CORS surface                            |

## Deviations from Plan

### Test coverage skipped

The plan called for tsc + curl smoke tests in the verify block. tsc passes clean. Curl smoke tests not run because the repo doesn't have a long-lived dev server here. Operator smoke flow (per phase prompt):
- Login as `info@3dninjaz.com / Sumaliya1986` (admin) OR create a customer account → `/account` shows profile
- `/account/security` — change email triggers verification, change password works

Mobile QA at 390×844 / 375×667 deferred to operator. Code uses `min-h-[48px]` for all inputs and `min-h-[60px]` for primary CTAs per D-04 hard rules; the layout uses `md:grid md:grid-cols-[220px_1fr]` so mobile collapses to single-column with the chip strip above content.

## Verification

- `npx tsc --noEmit` — clean
- 9 new files created (paths above)
- 1 file modified (UserNav)
- Auth gate verified by code inspection: `getSessionUser()` first, `redirect("/login?next=/account")` on null
- All three server actions start with `await requireUser()` per CVE-2025-29927 pattern

## Self-Check: PASSED

- FOUND: src/app/(store)/account/layout.tsx (auth gate + shell)
- FOUND: src/app/(store)/account/page.tsx (profile + loyalty + glance)
- FOUND: src/app/(store)/account/security/page.tsx (change email + password)
- FOUND: src/actions/account.ts (3 actions, all requireUser-first)
- FOUND: src/components/account/account-sidebar.tsx
- FOUND: src/components/account/profile-form.tsx
- FOUND: src/components/account/loyalty-card.tsx
- FOUND: src/components/account/change-email-form.tsx
- FOUND: src/components/account/change-password-form.tsx
- FOUND: src/components/auth/user-nav.tsx (4 new links above admin/signout)
- PASSED: npx tsc --noEmit clean
