---
phase: 01-foundation
plan: 01
status: complete
subsystem: foundation
tags: [nextjs, mysql, drizzle, better-auth, nodemailer, shadcn]
requires:
  - Next.js 15 project scaffold with TypeScript and App Router
  - cPanel MySQL database (ninjaz_3dn) with remote access for dev IP
  - cPanel SMTP mailbox (noreply@3dninjaz.com)
provides:
  - Drizzle MySQL client singleton (src/lib/db/index.ts)
  - Drizzle MySQL schema with 7 tables (src/lib/db/schema.ts)
  - Better Auth server + client configured for MySQL (src/lib/auth.ts, src/lib/auth-client.ts)
  - Nodemailer transport singleton backed by cPanel SMTP (src/lib/mailer.ts)
  - Better Auth catch-all API route (src/app/api/auth/[...all]/route.ts)
  - drizzle-kit config targeting MySQL (drizzle.config.ts)
  - Template A color tokens and typography (globals.css, layout.tsx)
  - public/uploads/products/ directory tracked via .gitkeep
affects:
  - All downstream plans depend on this scaffold
tech-stack:
  added:
    - mysql2
    - nodemailer
    - "@types/nodemailer"
    - drizzle-zod
    - "@hookform/resolvers"
    - lucide-react
  removed:
    - "@neondatabase/serverless"
    - next-cloudinary
    - resend
  patterns:
    - mysql2 Pool reused via globalThis singleton across hot-reloads
    - Nodemailer transport cached via globalThis singleton
    - Better Auth drizzleAdapter with provider 'mysql'
key-files:
  created:
    - src/lib/mailer.ts
    - public/uploads/products/.gitkeep
  modified:
    - package.json
    - package-lock.json
    - drizzle.config.ts
    - src/lib/db/index.ts
    - src/lib/db/schema.ts
    - src/lib/auth.ts
    - src/app/globals.css
    - .gitignore
decisions:
  - Use mysql2 with connection pool (connectionLimit 10) instead of single connection — cPanel accepts up to 25 concurrent connections per user
  - Store product images as JSON array (MySQL has no native array type) typed as string[] via Drizzle $type
  - Product/category IDs use varchar(36) with DEFAULT (UUID()) — Better Auth tables use varchar(36) without default (Better Auth generates IDs)
  - Mailer gracefully warns on missing SMTP env vars instead of throwing so the app still boots in environments without SMTP
metrics:
  tasks_completed: 2
  duration_minutes: ~30 (mostly prior work + MySQL pivot)
  commits: 3 (prior scaffold + prior Drizzle setup + this MySQL pivot)
---

# Phase 01 Plan 01: Next.js 15 + MySQL + Better Auth + Nodemailer Scaffold Summary

One-liner: Next.js 15 + TypeScript scaffold wired to cPanel MySQL via Drizzle (mysql2 pool), Better Auth configured with the MySQL Drizzle adapter and admin plugin, nodemailer transport backed by cPanel SMTP, schema pushed to the live database, and uploads directory prepared for local-disk product images.

## What Was Built

1. **Next.js 15 app shell** (prior commit): App Router, TypeScript, Tailwind v4, shadcn/ui initialized with all Phase-1 components (button, card, input, label, table, badge, dialog, dropdown-menu, tabs, form, textarea, select, switch, separator, avatar, skeleton, sonner).
2. **Template A typography**: Russo One (`--font-heading`) + Chakra Petch (`--font-body`) loaded via `next/font/google` in `src/app/layout.tsx`.
3. **Template A color tokens** added to `src/app/globals.css` (`--color-brand-primary: #1B6B2F`, `--color-brand-cta: #F97316`, etc.) alongside shadcn default tokens.
4. **Drizzle MySQL schema** (`src/lib/db/schema.ts`) — 7 tables:
   - `user` (id varchar(36), email, role default 'customer', pdpaConsentAt, admin-plugin fields banned/banReason/banExpires)
   - `session`, `account`, `verification` (Better Auth)
   - `categories` (UUID default, unique name + slug)
   - `products` (UUID default, images JSON array, isActive, isFeatured, materialType, estimatedProductionDays, categoryId FK, createdAt/updatedAt with `.onUpdateNow()`)
   - `product_variants` (size mysqlEnum S/M/L, price decimal(10,2), dimensions decimal(6,1), FK to products ON DELETE CASCADE)
   - Drizzle `relations()` wired for user↔sessions/accounts, categories↔products, products↔variants.
5. **Drizzle client** (`src/lib/db/index.ts`) — mysql2 pool with `globalThis.__mysqlPool` singleton to survive hot-reloads.
6. **Better Auth server config** (`src/lib/auth.ts`) — `drizzleAdapter(db, { provider: 'mysql', schema })`, email/password enabled, `sendResetPassword` wired to `sendResetPasswordEmail`, `pdpaConsentAt` as additional field, `admin({ defaultRole: 'customer' })`.
7. **Better Auth client** (`src/lib/auth-client.ts`) — `createAuthClient` with `adminClient()` plugin.
8. **Nodemailer transport** (`src/lib/mailer.ts`) — `getMailer()` singleton, `MAIL_FROM` constant, `sendResetPasswordEmail` and generic `sendMail` helpers. Gracefully warns when SMTP env vars are missing.
9. **Auth API route** (`src/app/api/auth/[...all]/route.ts`) — `toNextJsHandler(auth)` re-exports GET/POST.
10. **drizzle.config.ts** — `dialect: 'mysql'`, schema path `src/lib/db/schema.ts`, reads `DATABASE_URL` from env.
11. **Uploads directory** — `public/uploads/products/.gitkeep` committed; `.gitignore` excludes files but keeps the directory tracked.

## Verification Performed

- `npm install` — Phase 1 deps installed, forbidden deps removed (`@neondatabase/serverless`, `next-cloudinary`, `resend`).
- Deps check: `next, drizzle-orm, mysql2, better-auth, react-hook-form, zod, drizzle-kit, nodemailer, lucide-react, @types/nodemailer, @hookform/resolvers, drizzle-zod` all present.
- MySQL reachability test against the cPanel MariaDB 10.11.14 instance — connected successfully via mysql2 using `DATABASE_URL`.
- `drizzle-kit push` applied schema to remote MySQL — "Changes applied" with no errors.
- `SHOW TABLES` returned all 7 expected tables (`account`, `categories`, `product_variants`, `products`, `session`, `user`, `verification`).
- `npx tsc --noEmit` — passed with no errors (typecheck clean).

## Deviations from Plan

- **[Rule 3 - Tooling] Used `dotenv-cli` to load `.env.local` into `drizzle-kit push`.** The Windows `npx` invocation does not support `--env-file=.env.local` flags for `drizzle-kit`. Wrapping the command with `npx --yes dotenv-cli -e .env.local --` injects `DATABASE_URL` cleanly. No persistent dependency added.
- **[Rule 2 - Correctness] Added `.gitkeep` to `public/uploads/products/`** after observing the directory existed but was not tracked. The plan's `.gitignore` rule relies on the placeholder file existing to version-control the folder structure.

## Self-Check: PASSED

- FOUND: `src/lib/db/schema.ts` (7 tables)
- FOUND: `src/lib/db/index.ts` (mysql2 pool + Drizzle)
- FOUND: `src/lib/auth.ts` (provider: 'mysql')
- FOUND: `src/lib/auth-client.ts`
- FOUND: `src/lib/mailer.ts`
- FOUND: `src/app/api/auth/[...all]/route.ts`
- FOUND: `drizzle.config.ts` (dialect: 'mysql')
- FOUND: `public/uploads/products/.gitkeep`
- FOUND commit: d0fca56 (feat(01-01): pivot to cPanel MySQL + nodemailer + local uploads)
- FOUND commit: 9fa3669 (feat(01-01): add Drizzle schema, Better Auth config, and auth API route)
- FOUND commit: 8bc244f (feat(01-01): scaffold Next.js 15 with Phase 1 dependencies and shadcn/ui)
- MySQL tables verified live: user, session, account, verification, categories, products, product_variants
