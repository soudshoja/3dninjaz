<!-- GSD:project-start source:PROJECT.md -->
## Project

**Print Ninjaz**

Print Ninjaz is a B2C e-commerce store for 3D printed products, targeting customers in Malaysia. Customers browse pre-made 3D printed products uploaded by the admin, select size (Small/Medium/Large), create an account, and purchase via PayPal. The store follows a basic Shopify-style concept — simple product listings, cart, and checkout. AI-powered custom 3D generation (via Meshy API) is planned for a future milestone.

**Core Value:** Customers can easily browse and buy unique 3D printed products with a simple, clean shopping experience.

### Constraints

- **Tech stack**: Next.js (React) — chosen by team
- **Payment**: PayPal — skill file available for integration
- **Market**: Malaysia first — English language, local delivery
- **Scope**: Basic Shopify-style store — no complex features for v1
- **Auth**: Account required for purchases — no guest checkout
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | 15.x (App Router) | Full-stack React framework | Pre-decided. App Router is now stable and production-ready — server components reduce client JS bundle, API routes handle PayPal webhooks and order logic. Do NOT use Pages Router. |
| TypeScript | 5.x | Type safety across all layers | Non-negotiable for e-commerce. Catches schema mismatches between DB, API, and UI at compile time. |
| React | 19.x (ships with Next 15) | UI rendering | Bundled with Next.js 15. |
### Database
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PostgreSQL | 16.x (managed) | Primary data store | Relational model suits e-commerce: products, orders, users, order items. JSON columns available if needed later. ACID guarantees critical for orders. |
| Neon | Serverless | PostgreSQL host | Free tier: 0.5 GB storage, 100 CU-hours/month — more than enough for a Malaysian startup with low initial traffic. Serverless scales to zero, so you pay nothing when idle. Branch-per-PR for safe DB migrations. Cold start (1-3s) is acceptable given low traffic volumes. Alternative: Supabase (more features, slightly heavier). |
| Drizzle ORM | 0.41.x | Database access layer | Smaller bundle than Prisma (~90% smaller), no code generation step — schema changes reflect immediately. Type-safe SQL-adjacent API. Superior for Vercel/serverless edge deployments. Supports Neon's serverless HTTP driver natively. Use Prisma only if the team is SQL-phobic and prefers a higher abstraction layer. |
### Authentication
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Better Auth | latest (1.x) | Account auth (email + password) | The 2025 rising standard — framework-agnostic, Next.js-native integration, owns your data (self-hosted, no vendor lock-in), no per-MAU pricing unlike Clerk. Supports email/password, sessions, password reset, email verification out of the box. Integrates with Drizzle ORM directly. Clerk costs money at scale; Auth.js (NextAuth v5) has a rougher setup DX. Better Auth hits the right balance. |
- Clerk — free up to 10k MAU but costs scale. Overkill for a small Malaysian store where data ownership matters.
- Firebase Auth — vendor lock-in, extra SDK weight, poor TypeScript DX.
- Rolling custom JWT auth — session security is hard, use a library.
### Payments
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @paypal/react-paypal-js | latest | Frontend PayPal button | Official PayPal React SDK. Hooks-based, works cleanly in Next.js client components. Pre-decided; PayPal works in Malaysia. |
| @paypal/checkout-server-sdk | latest | Server-side order capture | Create and capture orders server-side (Next.js Route Handlers) to prevent client-side order tampering. Never trust client for payment capture. |
### Image Hosting
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Cloudinary | Free tier | Product image upload and delivery | Admin uploads product images; Cloudinary stores, transforms, and serves via CDN. Free tier: 10 GB storage, 20k monthly transformations — sufficient for early-stage store with tens of products. `next-cloudinary` package provides a drop-in `CldImage` component that wraps Next.js Image with Cloudinary transforms. Automatic WebP/AVIF conversion improves page speed. |
- AWS S3 — more setup, no built-in image CDN or transformation, overkill for this scale.
- UploadThing — good for user file uploads, but lacks Cloudinary's image transformation/CDN pipeline that matters for product image quality.
- Storing images in the DB or public folder — does not scale, no CDN.
### Admin Panel
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Custom admin routes in Next.js | — | Product and order management | The admin scope is narrow: upload products, manage orders. A full CMS (Payload, Sanity) adds significant complexity and a separate schema paradigm. Build a simple `/admin` protected route group with custom forms. Better Auth role checks (`role: "admin"`) gate the routes. Total admin UI: product form, product list, order list. This is ~1 week of work, not a CMS integration problem. |
- Payload CMS — powerful but adds a full framework-within-a-framework. Justified only when content editors (not developers) manage the store, or when 10+ content types exist. Print Ninjaz has one admin user and one content type (product).
- Sanity/Contentful — headless CMS adds API overhead and subscription cost for something a simple database form can handle.
### UI / Styling
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tailwind CSS | v4.x | Utility-first styling | Ships zero config with Next.js 15. v4 uses CSS-native variables — no `tailwind.config.ts` required for basic theming. Best for the ninja-themed brand colors (green/blue/black) via CSS variables. |
| shadcn/ui | latest | Component library | Copy-paste components (not an npm package dependency). Zero runtime overhead. Works perfectly with Tailwind v4 + Next.js App Router. Provides: Button, Dialog, Form, Table, Badge — everything needed for product cards, cart drawer, checkout. Full ownership of component code. |
| Lucide React | latest | Icons | Default icon set bundled with shadcn/ui. Tree-shakeable, consistent style. |
### State Management
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Zustand | 4.x | Cart state (client-side) | Cart is client-side UI state — items, quantities, size selection. Zustand is 1.2 KB, dead-simple API, SSR-friendly. No Redux boilerplate. Persist to localStorage for cart survival across page refreshes. |
| TanStack Query (React Query) | 5.x | Server state / data fetching | For admin-side data (product list, order list) that needs refetching, caching, and mutation states. Optional for v1 — Next.js Server Components handle most data fetching. Add when client-side data freshness becomes important. |
### Forms / Validation
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React Hook Form | 7.x | Form state management | Minimal re-renders, works with shadcn/ui Form primitives. |
| Zod | 3.x | Schema validation | Shared validation between client forms and server API routes. Define product schema once, use everywhere. Drizzle + Zod integration is first-class via `drizzle-zod`. |
### Email
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Resend | latest | Transactional email | Order confirmation emails to customers. Free tier: 3,000 emails/month. Works in Malaysia. Dead-simple API for Next.js Route Handlers. React Email for HTML email templates. |
- SendGrid — more complex, pricier free tier, heavier SDK.
- Nodemailer with SMTP — works, but Resend is simpler and has better deliverability.
## Deployment
| Technology | Purpose | Why |
|------------|---------|-----|
| Vercel | App hosting | First-class Next.js support (built by the same team). Zero config deployment. Free Hobby tier handles low-traffic launches. Automatic preview deployments per branch. Image Optimization built-in (Next.js `<Image>`). **Warning:** Vercel pricing scales aggressively at high bandwidth — monitor costs when traffic grows. For a Malaysian startup in v1, Hobby tier is fine. |
| Neon | Database hosting | Bundled in the DB choice above. Serverless PostgreSQL with Vercel integration (env vars auto-injected). |
| Cloudinary | Image CDN | Bundled in the image hosting choice above. |
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Auth | Better Auth | Clerk | Per-MAU pricing; data hosted on Clerk's servers |
| Auth | Better Auth | Auth.js (NextAuth v5) | Rougher setup DX; Better Auth has cleaner Drizzle integration |
| ORM | Drizzle | Prisma | Larger bundle, slower serverless cold starts, code generation step |
| Database host | Neon | Supabase | Supabase is excellent but heavier (adds realtime, storage, RPC) — overkill for simple e-commerce |
| Admin | Custom routes | Payload CMS | Payload adds framework complexity for a one-admin, one-content-type use case |
| Image hosting | Cloudinary | AWS S3 | No built-in CDN/transforms; S3 requires CloudFront setup |
| Deployment | Vercel | Railway | Vercel is better for v1 zero-config launch; Railway is cheaper long-term |
| UI | shadcn/ui | Chakra UI / MUI | Chakra/MUI add runtime JS; shadcn copies source, zero overhead |
| State | Zustand | Redux Toolkit | Redux overkill for cart state in a small store |
## Installation
# Scaffold
# Database
# Auth
# Payments
# Images
# UI
# Forms & validation
# Cart state
# Email
## Environment Variables Required
# Database
# Auth
# PayPal
# Cloudinary
# Email
## Confidence Assessment
| Area | Confidence | Notes |
|------|------------|-------|
| Next.js 15 + TypeScript | HIGH | Official docs confirm App Router is stable. Widely used in production. |
| Drizzle ORM | HIGH | Official docs + multiple 2025 community guides confirm v0.41.x |
| Neon PostgreSQL | HIGH | Free tier limits verified via official pricing page. Acquisition by Databricks in May 2025 reduced pricing. |
| Better Auth | MEDIUM | Rising library with active development. Less battle-tested than Auth.js at scale, but well-documented and growing fast. |
| PayPal integration | HIGH | Official `@paypal/react-paypal-js` SDK confirmed for Next.js 15. |
| Cloudinary | HIGH | Free tier limits (10GB, 20k transforms) verified via official docs. |
| Vercel deployment | HIGH | Official Next.js host. Hobby tier confirmed free. |
| Zustand for cart | HIGH | Widely used pattern, confirmed SSR-safe for Next.js. |
| shadcn/ui + Tailwind v4 | HIGH | Official shadcn docs confirm Next.js 15 support. Tailwind v4 works without config file. |
| Resend email | MEDIUM | Well-regarded but smaller. Free tier and Malaysia deliverability not officially confirmed — validate early. |
## Sources
- Next.js 15 App Router: https://nextjs.org/docs/app/guides/authentication
- Better Auth Next.js integration: https://better-auth.com/docs/integrations/next
- Drizzle ORM PostgreSQL: https://orm.drizzle.team/docs/get-started-postgresql
- Drizzle + Neon tutorial: https://orm.drizzle.team/docs/tutorials/drizzle-nextjs-neon
- Neon free tier (2025): https://neon.com/docs/introduction/plans
- Cloudinary free plan: https://cloudinary.com/documentation/developer_onboarding_faq_free_plan
- PayPal React SDK: https://www.npmjs.com/package/@paypal/react-paypal-js
- PayPal Next.js 15 integration guide: https://medium.com/@justinbartlettjob/simple-paypal-next-js-15-integration-7adc8929aa17
- shadcn/ui Next.js: https://ui.shadcn.com/docs/installation/next
- Vercel vs Railway comparison: https://docs.railway.com/platform/compare-to-vercel
- Zustand for Next.js cart: https://dev.to/themachinepulse/do-you-need-state-management-in-2025-react-context-vs-zustand-vs-jotai-vs-redux-1ho
- Drizzle vs Prisma 2026: https://makerkit.dev/blog/tutorials/drizzle-vs-prisma
- Auth comparison 2026: https://supastarter.dev/blog/better-auth-vs-nextauth-vs-clerk
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

## Pivots & Production Quirks (2026-04-19 → 2026-04-21)

### Stack pivot from initial plan
- **Project renamed**: Print Ninjaz → **3D Ninjaz** (domain `3dninjaz.com`, logo `/public/logo.png`)
- **Database**: Neon Postgres → **cPanel MariaDB 10.11** (self-hosted). DATABASE_URL in `.env.local`
- **Images**: Cloudinary → **local filesystem** `public/uploads/products/<uuid>/`
- **Email**: Resend → **nodemailer + cPanel SMTP** via `noreply@3dninjaz.com` (see `src/lib/mailer.ts`)
- **Brand palette unified**: blue `#2563EB`, green `#84CC16`, purple `#8B5CF6`, ink `#0B1020`, cream `#F7FAF4` — same across storefront + admin. See `.planning/phases/02-storefront-cart/DECISIONS.md` D-01
- **Cart vocabulary**: user-facing = "bag" (button/drawer/nav/route `/bag`). Internal code still `cart-store.ts`, `useCartStore`, `CartItem` — minimize diff. D-02 in same DECISIONS file

### MariaDB 10.11 gotchas (apply automatically)
- **No LATERAL joins** — Drizzle's `db.query.products.findMany({ with: { variants, category } })` compiles to LATERAL and fails with `ER_PARSE_ERROR`. Use **manual multi-query hydration** (`getProduct`/`getProducts` in `src/actions/products.ts` as reference) — fetch parent rows, then `.select().from(child).where(inArray(fk, parentIds))`, join in memory.
- **JSON columns stored as LONGTEXT** — mysql2 does NOT auto-parse. Every JSON read site must call `ensureImagesArray(raw)` (or equivalent parse helper). See `src/actions/products.ts`.
- **App-generated UUIDs** — use `crypto.randomUUID()` on INSERT. Do NOT rely on `$returningId()` or SQL `UUID()` for round-trips. Needed for image upload paths that must exist before the DB row.
- **Do NOT run `drizzle-kit push` against remote if latency is high** — it hung on schema-pull. Fall back to raw SQL DDL that matches Drizzle's schema byte-for-byte + verify with `SHOW CREATE TABLE`.

### Better Auth specifics
- Library version 1.6.2 API: `authClient.requestPasswordReset(...)` — NOT the older `forgetPassword` name
- Admin seed: two-step via `auth.api.signUpEmail` (uses Better Auth password pipeline) then direct Drizzle `update(user).set({ role: 'admin' })`. `auth.api.createUser` ignores `role` outside an authenticated admin session. Seed script `scripts/seed-admin.ts` is idempotent.
- Admin-auth check: **handler-level `requireAdmin()` as first `await` in every admin server action** (CVE-2025-29927 — middleware alone is bypassable). See `src/lib/auth-helpers.ts`.
- **`trustedOrigins` required** — Better Auth rejects cross-origin POSTs (e.g. admin forms from `https://3dninjaz.com`) unless the origin is listed in `trustedOrigins` in `src/lib/auth.ts`. Fixed in commit `d421bd9`. Add any new prod domain here before deploy.
- **`user.role` TypeScript typing** — Better Auth's generated `Session` type does not include `role` by default. Cast via `(session.user as { role: string }).role` or extend the type declaration in `src/types/auth.d.ts`.
- **Admin password rotation** — run `ADMIN_RESET_PASSWORD=1 npx tsx scripts/seed-admin.ts` to rotate admin password in-place without touching sessions or user id.

### Delyva shipping quirks
- **`instantQuote` service parsing** — some Delyva couriers return `companyCode` as a flat string rather than a nested object. Always defensively parse: `typeof service.companyCode === 'string' ? service.companyCode : service.companyCode?.code`. Fixed in `754e493`.
- **30kg parcel cap** — Delyva rejects shipments over 30kg per parcel. Weight sum = `product.weightKg × qty` per line, then split across parcels at 30kg each. Cap guard in `src/lib/delyva.ts`.
- **Webhook process survival** — wrap the Node process with `setsid` in `start.sh` so Delyva webhook HTTP responses closing the stream don't send SIGPIPE to the parent. Fixed in `61df023`.
- **Webhook idempotency** — `order_shipments.delyvaShipmentId` has a UNIQUE constraint. Duplicate webhook deliveries are caught by `ER_DUP_ENTRY` and silently no-op.

### Session 2026-04-21 new quirks
- **Delyva `itemType` shipping type distinction** — `itemType: PACKAGE` routes to Grab-only fulfillment; standard couriers (Pos Laju, GDEx, J&T, City-Link) require `itemType: PARCEL`. Auto-detected from product.isStandardParcel flag. See `src/lib/delyva.ts` instantQuote handler.
- **Next.js standalone build does not bundle Markdown** — files in `src/content/` are not tree-shaken into the standalone output. Email templates stored as DB rows + rendered via `renderTemplate()` instead (schema in Phase 12). See `src/lib/email-renderer.ts`.
- **Base UI Tabs component state quirk** — initial `value` prop on Tabs requires exact match to one of the tab `value` strings; SSR mismatch between server-rendered default and client hydration causes "Hydration mismatch" console error. Always derive `activeTab` state from query param or default explicitly on both sides.
- **Better Auth `Session.user.role` is untyped** — library v1.6.2 infers role from the database but doesn't include it in the TypeScript `User` type. Cast at access sites: `(session.user as { role: string }).role`. Type stub in `src/types/auth.d.ts`.

### Deploy topology (2026-04-24 — current)
- **Storefront:** `https://app.3dninjaz.com/` (Next.js 15 on Node 20.x, port `127.0.0.1:3000`)
- **Apex:** `https://3dninjaz.com/` — still serves a static coming-soon page, to be decommissioned on launch day
- **`NEXT_PUBLIC_BASE_PATH` is NOT set**; app serves at subdomain root
- **Server:** cPanel + CloudLinux + LiteSpeed 6.3.4 Enterprise
- **LSWS does NOT support Apache `mod_passenger`** — Node app must be reverse-proxied via Apache userdata
- **Apache userdata config:** `/etc/apache2/conf.d/userdata/{std,ssl}/2_4/ninjaz/app.3dninjaz.com/3dninjaz_app_proxy.conf` with `ProxyPass "/"` + `ProxyPassReverse "/"` + `ProxyPreserveHost On` inside a `<Location "/">` block. Forwards `/` → `http://127.0.0.1:3000/`. After editing, `/usr/local/lsws/bin/lswsctrl reload` (graceful SIGUSR1 — no downtime for other users).
- **App node binary:** `/home/ninjaz/nodevenv/apps/3dninjaz/20/bin/node` (CloudLinux nodevenv Node 20; verify actual app dir name via `ls /home/ninjaz/apps/`)
- **SSH is key-only for root** — user password auth is blocked. For unattended tasks use: root via key (full server), FTP via user/password (files only), cPanel UAPI via Basic auth at `https://152.53.86.223:2083/execute/<Module>/<fn>` (per-user scoped)
- **Node app persistence:** `@reboot` cron registered — survives server reboot. See `.planning/phases/04-brand-launch/DEPLOY-NOTES.md`
- **Never run `lswsctrl restart`** (hard restart) — other users affected. Graceful `reload` is fine.
- **Apache static error pages** — `public/errors/502.html`, `503.html`, `504.html` served via Apache `Alias /errors` + `ErrorDocument` directives. These bypass the Node proxy and show when Node is down.
- **Base UI `DropdownMenuLabel` quirk** — must be wrapped in `DropdownMenuGroup`; Base UI 1.3 asserts `MenuGroupRootContext` at render time. See `51a90c9`.
- **`isomorphic-dompurify` breaks prod** — uses ESM-only imports that fail `require()` in CommonJS prod bundles. Replaced with in-repo allowlist sanitizer in `src/lib/sanitize.ts`. Do not re-add `isomorphic-dompurify`.

### Launch preview
- `https://app.3dninjaz.com/` — Next.js storefront (live PayPal sandbox as of 2026-04-20)
- `https://3dninjaz.com/` — coming-soon static (apex, to be swapped at launch)
- Test buyer: `sb-shnvz50688339@personal.example.com` / `_s!Cw2Wp` (sandbox MYR 5000)

### Launch-day blockers (tracked in `.planning/GO-LIVE-READINESS.md`)
- Real WhatsApp MY number — edit at `/admin/settings` (placeholder `60000000000`)
- Social handles Instagram + TikTok — edit at `/admin/settings`
- `public/logo.png` 1.5 MB → WebP ~200 KB (LCP blocker)
- ~~`PAYPAL_ENV=live` in prod env~~ — DONE 2026-04-20
- Privacy policy + Terms of Service pages — not yet built
- Remove `<meta robots="noindex">` from coming-soon apex page (or swap domain on launch day)
- ~~Rebuild without `/v1` basePath before domain swap~~ — N/A (app already serves at subdomain root with no basePath)
