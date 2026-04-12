# Research Summary: Print Ninjaz

## Executive Summary

Print Ninjaz is a B2C e-commerce store for 3D printed goods targeting the Malaysian market. Research confirms a monolithic Next.js 15 App Router application is the right approach — no microservices, no headless CMS, no separate backend.

**Recommended Stack:** Next.js 15 + Drizzle ORM + Neon PostgreSQL + Better Auth + PayPal + Cloudinary + Zustand + shadcn/ui + Tailwind v4

All infrastructure fits within free tiers for low-traffic launch.

## Critical Decisions (Lock Early)

1. **Per-variant pricing from day one** — ProductVariant table with separate price per S/M/L. Single price field forces post-launch schema migration.
2. **Server-side PayPal capture** — Never trust client-sent prices. Re-fetch from DB, capture on server, verify `status: "COMPLETED"`.
3. **Handler-level auth checks** — Middleware-only admin protection is bypassable (CVE-2025-29927). Every admin route needs its own role check.

## Stack Highlights

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 15 App Router | Full-stack, SSR, Server Components |
| ORM | Drizzle 0.41.x | Smaller bundle than Prisma, no codegen |
| Database | Neon PostgreSQL | Free tier sufficient, serverless |
| Auth | Better Auth 1.x | Self-hosted, free, Drizzle integration |
| Payments | PayPal REST SDK | Pre-decided, skill available |
| Images | Cloudinary | Free tier (10GB), auto WebP/CDN |
| Cart State | Zustand + localStorage | Client-only, SSR-safe, 1.2KB |
| UI | shadcn/ui + Tailwind v4 | Accessible components, themeable |
| Email | Resend | 3,000/month free (verify MY deliverability) |
| Deploy | Vercel | Zero-config, free Hobby tier |

## Feature Landscape

**Table Stakes (must ship):**
- Product catalog with browsing and detail pages
- Size selection (S/M/L) with per-size pricing
- Account creation and login
- Cart with add/remove/quantity
- PayPal checkout with MYR currency
- Order confirmation email
- Admin product CRUD with image upload
- Admin order management

**Low-Cost Trust Builders (include in v1):**
- WhatsApp contact link (Malaysian SME expectation)
- Lead time notice ("ships in 3-7 days")
- Size guide with real dimensions
- Material callout on product pages
- About/Contact page

**Deferred:**
- AI custom 3D generation (Meshy API) — milestone 2
- FPX / local payments — after 20-30 orders baseline
- 3D model viewer — not needed for basic store
- Guest checkout, reviews, inventory tracking

## Architecture

- Monolith with route groups: `(store)`, `(auth)`, `(admin)`
- Server Components for all read-heavy pages
- Zustand cart is client-only; writes to DB only at checkout
- Middleware guards routing; handler-level checks guard data
- Price snapshot on OrderItem — never join back for order history
- Images stored in Cloudinary, DB stores URLs only

## Top Pitfalls

| # | Pitfall | Severity | Prevention |
|---|---------|----------|------------|
| 1 | Middleware-only admin auth | CRITICAL | Handler-level role checks + Next.js 15.2.3+ |
| 2 | Client-sent price trust | CRITICAL | Server re-fetches price by variantId |
| 3 | PayPal webhook race condition | CRITICAL | Unique constraint on paypal_order_id |
| 4 | Single price for all sizes | CRITICAL | ProductVariant rows from day one |
| 5 | Cart hydration mismatch | MODERATE | Zustand persist + useEffect guard |
| 6 | USD default in PayPal | MODERATE | Explicit currency_code: "MYR" |
| 7 | No confirmation email | MODERATE | Resend in same phase as checkout |
| 8 | SST compliance | MODERATE | Tax field in schema; accountant before launch |

## Suggested Build Order (6 phases)

1. **Foundation** — DB schema, auth, project scaffold
2. **Product Catalog + Admin** — admin uploads, storefront displays
3. **Cart** — Zustand client-side cart
4. **Checkout + PayPal** — server-side capture, email confirmation
5. **Order Management** — admin + customer order views
6. **Trust Content + Launch** — branding, compliance, go-live

## Malaysia-Specific Notes

- PayPal works but FPX/Touch 'n Go/GrabPay are preferred locally
- PDPA 2010 requires privacy policy + registration consent checkbox
- SST expanded July 2025 — include tax field, consult accountant
- WhatsApp contact is a cultural expectation for Malaysian SME stores
- MYR currency must be explicitly set in PayPal (defaults to USD)

## Open Questions

- Resend email deliverability to Malaysian addresses — needs smoke test
- PayPal Sandbox for MYR currency — verify before building checkout
- Vercel Hobby bandwidth limits — monitor after launch
- SST compliance threshold — accountant confirmation needed

---
*Research completed: 2026-04-12*
