---
phase: 01-foundation
plan: 02
status: complete
subsystem: auth-ui
tags: [auth, nextjs, better-auth, forms, admin-seed]
requires:
  - Plan 01-01 (Drizzle client, Better Auth server/client, mailer, auth API route)
provides:
  - Four auth pages: /login, /register, /forgot-password, /reset-password
  - LoginForm, RegisterForm, ForgotPasswordForm, ResetPasswordForm client components
  - UserNav client component (Sign In / Register links or authenticated dropdown)
  - (store) layout with branded header + UserNav + footer
  - (store) homepage placeholder "3D Ninjaz Coming Soon"
  - scripts/seed-admin.ts CLI for creating the first admin user
  - npm scripts seed:admin and db:push
affects:
  - Downstream admin plans depend on a seeded admin account
  - Role-based redirect from /login sets expectation admin lands on /admin
tech-stack:
  added:
    - tsx (dev)
    - dotenv-cli (dev)
  patterns:
    - Suspense boundary wrapping useSearchParams in reset-password form (Next 15 requirement)
    - Fire-and-forget signOut then router.push to avoid stale session read
    - Generic forgot-password response to prevent email enumeration
key-files:
  created:
    - src/app/(auth)/layout.tsx
    - src/app/(auth)/login/page.tsx
    - src/app/(auth)/register/page.tsx
    - src/app/(auth)/forgot-password/page.tsx
    - src/app/(auth)/reset-password/page.tsx
    - src/app/(store)/layout.tsx
    - src/app/(store)/page.tsx
    - src/components/auth/login-form.tsx
    - src/components/auth/register-form.tsx
    - src/components/auth/forgot-password-form.tsx
    - src/components/auth/reset-password-form.tsx
    - src/components/auth/user-nav.tsx
    - scripts/seed-admin.ts
  modified:
    - package.json
    - package-lock.json
  deleted:
    - src/app/page.tsx (replaced by (store)/page.tsx route-group homepage)
decisions:
  - Use Better Auth 1.6 `requestPasswordReset` (plan referenced deprecated `forgetPassword` — current API is `requestPasswordReset`)
  - Promote seeded admin via direct Drizzle update AFTER signUpEmail, since `admin` plugin still creates the user with the configured defaultRole
  - Replace the default Next scaffold homepage with a `(store)` route-group homepage so the store navigation chrome applies to `/`
  - Use authClient.getSession() after signIn.email() to read the `role` claim (signIn result shape doesn't expose role directly)
  - Accidental `nul` file at repo root (stray from shell redirect) was deleted — it was blocking Turbopack from compiling globals.css (Rule 3: unblocking fix)
metrics:
  tasks_completed: 2
  commits: 1
---

# Phase 01 Plan 02: Auth UI + Admin Seed Summary

One-liner: Four auth pages (login, register, forgot-password, reset-password) with shadcn/ui forms, PDPA consent timestamp on signup, role-based login redirect, forgot-password protected against email enumeration, admin seed CLI script, and (store) route-group layout with a UserNav dropdown — all smoke-tested against the live cPanel MySQL instance.

## What Was Built

### Auth pages (`src/app/(auth)/`)
- `layout.tsx` — centered card design per D-06, 3D Ninjaz logo above the card, green-surface background, footer.
- `login/page.tsx` — renders `LoginForm`.
- `register/page.tsx` — renders `RegisterForm`.
- `forgot-password/page.tsx` — renders `ForgotPasswordForm`.
- `reset-password/page.tsx` — renders `ResetPasswordForm`.

### Auth form components (`src/components/auth/`)
- `login-form.tsx` — email + password fields, orange CTA submit, role-based redirect (`role === 'admin'` → `/admin`; else `/`). Loading state on button.
- `register-form.tsx` — name, email, password (min 8), confirm password, **required** PDPA consent checkbox (not pre-checked per D-09). `pdpaConsentAt` sent as `new Date().toISOString()` so it is a server-verifiable timestamp, not a client boolean (T-02-03).
- `forgot-password-form.tsx` — generic success message regardless of outcome (T-02-02). Calls `authClient.requestPasswordReset({ email, redirectTo: '/reset-password' })`.
- `reset-password-form.tsx` — reads `token` from `useSearchParams` wrapped in Suspense (required for Next 15 static rendering). New password + confirm password fields; calls `authClient.resetPassword({ newPassword, token })`.
- `user-nav.tsx` — uses `authClient.useSession()`. Shows skeleton while pending; Sign In + Register buttons when logged out; Avatar-triggered dropdown with user info, conditional "Admin Panel" link (role === 'admin'), and Sign Out (calls `authClient.signOut()` then `router.push('/')`).

### Store shell (`src/app/(store)/`)
- `layout.tsx` — header with 3D Ninjaz logo + heading font, Shop link, UserNav; mx-auto main container; footer.
- `page.tsx` — homepage placeholder, Russo One "3D Ninjaz" heading, tagline.

### Admin seed
- `scripts/seed-admin.ts` — reads ADMIN_EMAIL/ADMIN_PASSWORD from env (fallback: `admin@3dninjaz.com` / `changeme123`). Checks whether the user exists; if yes, promotes to admin role (idempotent). If no, calls `auth.api.signUpEmail` then promotes via Drizzle `update(user).set({ role: 'admin' })`.
- `package.json` → `"seed:admin": "tsx --env-file=.env.local scripts/seed-admin.ts"` and `"db:push": "dotenv -e .env.local -- drizzle-kit push"`.

## Verification Performed

- `npx tsc --noEmit` — clean (one Better-Auth-API typo was corrected: plan used `forgetPassword`, actual API is `requestPasswordReset`).
- `npm run seed:admin` — created `admin@3dninjaz.com` with role `admin`. SQL verification:
  ```
  [{ id: 'O0fbUUok3JsvysjP7EQjAOqYefbkXo47', email: 'admin@3dninjaz.com', role: 'admin', email_verified: 0 }]
  ```
- Dev server on port 3002 (3000/3001 were occupied):
  - GET `/` → 200
  - GET `/login` → 200
  - GET `/register` → 200
  - GET `/forgot-password` → 200
  - GET `/reset-password` → 200
  - GET `/api/auth/ok` → 200
- POST `/api/auth/sign-in/email` with admin creds returned `role: 'admin'` + session token.
- GET `/api/auth/get-session` with cookie returned the full session including role.

## Deviations from Plan

- **[Rule 1 - Bug] Better Auth API method name was `requestPasswordReset`, not `forgetPassword`.** The plan used the old name (Better Auth < 1.5). Updated `forgot-password-form.tsx` accordingly.
- **[Rule 3 - Blocking] Removed stray `nul` file at repo root.** Turbopack panicked reading `C:\...\printninjaz\nul` while compiling `globals.css`. The file was 95 bytes of leftover SSH host key text from a prior shell redirect (`> nul` on Unix creates a regular file called `nul` on mixed-shell systems). Deleted it and Turbopack compiled cleanly.
- **[Rule 2 - Correctness] Seed script uses `signUpEmail` then Drizzle promotion** instead of `auth.api.createUser({ body: { role: 'admin' } })` because Better Auth's `createUser` endpoint ignores the `role` field when called outside an authenticated admin session. Two-step approach survives plugin defaults and matches Better Auth's password hashing pipeline.
- **[Rule 2 - Correctness] Deleted scaffold `src/app/page.tsx`** to avoid a route collision with the new `(store)/page.tsx`. The `(store)` route group doesn't affect URLs, so both resolved to `/` and Next would have picked one non-deterministically.

## Self-Check: PASSED

- FOUND: `src/app/(auth)/layout.tsx`
- FOUND: `src/app/(auth)/login/page.tsx`
- FOUND: `src/app/(auth)/register/page.tsx` (PDPA checkbox + pdpaConsentAt ISO timestamp)
- FOUND: `src/app/(auth)/forgot-password/page.tsx`
- FOUND: `src/app/(auth)/reset-password/page.tsx`
- FOUND: `src/components/auth/login-form.tsx` (signIn.email + role-based redirect)
- FOUND: `src/components/auth/register-form.tsx`
- FOUND: `src/components/auth/forgot-password-form.tsx` (requestPasswordReset + generic message)
- FOUND: `src/components/auth/reset-password-form.tsx` (useSearchParams + resetPassword)
- FOUND: `src/components/auth/user-nav.tsx` (useSession + signOut + Admin Panel link)
- FOUND: `src/app/(store)/layout.tsx`
- FOUND: `src/app/(store)/page.tsx`
- FOUND: `scripts/seed-admin.ts`
- FOUND: `package.json` `seed:admin` script
- FOUND commit: feat(01-02) auth UI pages + admin seed script + store shell
- MySQL verification: admin user exists with role=admin
- HTTP smoke test: all four auth pages + /api/auth/ok return 200
- API smoke test: admin sign-in returns role=admin; get-session returns populated user
