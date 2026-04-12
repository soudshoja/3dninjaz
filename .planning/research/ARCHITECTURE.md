# Architecture Patterns

**Domain:** Next.js B2C E-Commerce (3D Printed Products)
**Project:** Print Ninjaz
**Researched:** 2026-04-12
**Overall Confidence:** HIGH — well-established patterns with strong community consensus

---

## Recommended Architecture

Print Ninjaz maps cleanly to a monolithic Next.js App Router application with a PostgreSQL database via Prisma ORM. No microservices, no separate backend — everything lives in one Next.js project. This is the standard approach for a small-to-medium Shopify-style store.

```
Browser
  |
Next.js App (App Router)
  |── app/                        ← Routes (pages + API)
  |    |── (store)/               ← Public storefront routes (route group)
  |    |── (auth)/                ← Login/register routes (route group)
  |    |── (admin)/               ← Protected admin routes (route group)
  |    └── api/                   ← Route handlers (server-side API)
  |         |── auth/             ← Auth endpoints (NextAuth)
  |         |── paypal/           ← PayPal webhook + order capture
  |         └── admin/            ← Admin-only API endpoints
  |── lib/                        ← Shared server utilities
  |    |── db.ts                  ← Prisma client singleton
  |    |── auth.ts                ← NextAuth config
  |    └── paypal.ts              ← PayPal SDK wrapper
  |── components/                 ← React components
  |    |── ui/                    ← Headless/atomic components (buttons, inputs)
  |    |── store/                 ← Storefront-specific components
  |    └── admin/                 ← Admin-specific components
  └── store/                      ← Client-side state (Zustand)
       └── cart.ts                ← Cart state + persistence

Database (PostgreSQL via Prisma)
  |── User
  |── Product
  |── ProductVariant (size S/M/L with price)
  |── Order
  |── OrderItem
  └── Session (managed by NextAuth)

External Services
  |── PayPal API                  ← Payment processing
  └── File Storage                ← Product image hosting (Cloudinary or Supabase Storage)
```

---

## Component Boundaries

| Component | Responsibility | Server or Client | Communicates With |
|-----------|---------------|-----------------|-------------------|
| Storefront pages (`(store)/`) | Browse products, view product detail, trigger cart | Server Components (default) | Database via Server Actions, Cart store |
| Auth pages (`(auth)/`) | Login, register, session management | Server + Client mix | NextAuth, Database |
| Admin pages (`(admin)/`) | CRUD products, view orders, upload images | Server + Client mix | Database via Server Actions, File Storage |
| Cart UI | Display cart, update quantities, remove items | Client Component (interactive) | Zustand cart store only |
| Checkout page | Review order, trigger PayPal payment | Client Component | PayPal SDK (client), `/api/paypal/` (server) |
| PayPal route handlers (`/api/paypal/`) | Create PayPal order, capture payment, persist order | Server only (Route Handler) | PayPal API, Database |
| Admin route handlers (`/api/admin/`) | Image upload, any admin webhook | Server only | File Storage, Database |
| Prisma / `lib/db.ts` | All database reads and writes | Server only | PostgreSQL |
| NextAuth / `lib/auth.ts` | Session, JWT, role claim (admin vs customer) | Server only | Database (User table) |
| Zustand cart store | Cart item state, persist to localStorage | Client only | No backend — local only |

**Key boundary rule:** The Zustand cart store never touches the database directly. Cart is local-only until checkout is initiated, at which point a Server Action or Route Handler receives the cart payload and creates the Order record.

---

## Data Flow

### 1. Product Browse Flow (read-heavy, fully server-rendered)

```
User visits /products
  → Next.js Server Component
  → Prisma query → PostgreSQL (products + variants)
  → HTML streamed to browser (no client JS for data fetching)
```

No client-side fetch needed. Server Components handle this directly. This is the performance win of App Router.

### 2. Add to Cart Flow (client-side only)

```
User clicks "Add to Cart" (size selected)
  → Client Component onClick
  → Zustand cart.addItem({ productId, variantId, size, price, qty })
  → localStorage persisted automatically (zustand/middleware persist)
  → Cart icon count updates reactively
```

No server call at this step. Cart lives entirely in the browser.

### 3. Checkout + Payment Flow (client → server handoff)

```
User clicks "Checkout"
  → Client reads Zustand cart state
  → POST to /api/paypal/create-order (Route Handler)
      → Validates cart contents against DB (price integrity check)
      → Calls PayPal API: create order → returns PayPal order ID
  → Client receives PayPal order ID
  → PayPal SDK renders payment buttons (client-side)
  → User approves payment in PayPal UI
  → POST to /api/paypal/capture-order
      → Calls PayPal API: capture payment
      → On success: write Order + OrderItems to DB
      → Clear Zustand cart
  → Redirect to /orders/[orderId]/confirmation
```

**Critical:** Always re-validate prices server-side in `/api/paypal/create-order`. Never trust cart prices from the client.

### 4. Admin Product Management Flow

```
Admin navigates to /admin/products/new
  → Middleware checks session role === 'admin', else redirect
  → Admin fills form: name, description, price per size, images
  → Image upload: POST to /api/admin/upload
      → Streams file to Cloudinary/Supabase Storage
      → Returns public image URL
  → Form submit: Server Action createProduct(formData)
      → Prisma: INSERT Product + ProductVariants
  → Redirect to /admin/products
```

### 5. Authentication Flow

```
User registers / logs in at /auth/login
  → NextAuth handles credential verification
  → Session JWT includes: userId, email, role ('customer' | 'admin')
  → Session stored as HTTP-only cookie
  → Middleware reads cookie to protect (admin) route group
```

---

## Database Schema (Core Entities)

```
User
  id, email, passwordHash, name, role ('customer'|'admin'), createdAt

Product
  id, name, description, imageUrls (array), isActive, createdAt, updatedAt

ProductVariant
  id, productId (FK), size ('S'|'M'|'L'), price (Decimal), stock (nullable)

Order
  id, userId (FK), status ('pending'|'paid'|'fulfilled'|'cancelled'),
  paypalOrderId, total, createdAt, updatedAt

OrderItem
  id, orderId (FK), productId (FK), variantId (FK),
  size, quantity, unitPrice (snapshot at purchase time)
```

**Note:** `unitPrice` on OrderItem is a price snapshot — critical for historical accuracy. Never join back to ProductVariant price for order history.

---

## Suggested Build Order (Dependencies)

Dependencies flow upward — build foundations before features that require them.

```
1. DATABASE SCHEMA + PRISMA SETUP
   └─ All features depend on this. Nothing else can start without it.

2. AUTH (NextAuth + User model)
   └─ Required by: Admin panel (role check), Checkout (userId on Order)

3. PRODUCT CATALOG (read-only)
   └─ Required by: Cart, Checkout, Admin panel
   └─ Builds on: Database schema
   └─ Delivers: Product list + detail pages (Server Components, fast)

4. ADMIN PRODUCT MANAGEMENT
   └─ Required by: Having any products to sell
   └─ Builds on: Auth (admin role), Product schema, File storage
   └─ Delivers: Admin can upload products

5. CART (client-side Zustand)
   └─ Required by: Checkout
   └─ Builds on: Product catalog (knows product/variant IDs)
   └─ No server dependency — pure client state

6. CHECKOUT + PAYPAL
   └─ Required by: Revenue
   └─ Builds on: Auth (userId), Cart (items), PayPal API credentials
   └─ Delivers: End-to-end purchase flow

7. ORDER HISTORY + ADMIN ORDER MANAGEMENT
   └─ Required by: Customer service, fulfilment
   └─ Builds on: Checkout (Order records exist)
   └─ Delivers: Customer /account/orders + Admin /admin/orders
```

In phase terms: **Foundation → Auth → Catalog → Admin → Cart → Checkout → Orders**

---

## Route Group Structure (App Router)

```
app/
  (store)/
    page.tsx                 ← Homepage / hero
    products/
      page.tsx               ← Product listing
      [slug]/
        page.tsx             ← Product detail + size selector
    cart/
      page.tsx               ← Cart review
    checkout/
      page.tsx               ← Checkout + PayPal buttons
  (auth)/
    login/page.tsx
    register/page.tsx
  (admin)/
    layout.tsx               ← Admin auth guard (middleware or layout check)
    admin/
      products/
        page.tsx             ← Product list
        new/page.tsx         ← Create product form
        [id]/edit/page.tsx   ← Edit product form
      orders/
        page.tsx             ← Order list
        [id]/page.tsx        ← Order detail
  account/
    orders/page.tsx          ← Customer order history
    orders/[id]/page.tsx     ← Order confirmation + detail
  api/
    auth/[...nextauth]/route.ts
    paypal/
      create-order/route.ts
      capture-order/route.ts
    admin/
      upload/route.ts
```

Route groups (`(store)`, `(auth)`, `(admin)`) share layouts without affecting URL paths.

---

## Patterns to Follow

### Server Components as Default

Fetch data in Server Components using Prisma directly — no useEffect, no fetch() on the client for initial page data. Push `'use client'` boundaries as far down the tree as possible (e.g., only the "Add to Cart" button is a Client Component, not the entire product page).

### Server Actions for Mutations

Use Server Actions for form submissions (create product, update order status). They colocate with the Server Component and are easier to test than Route Handlers for simple CRUD. Use Route Handlers for external webhooks (PayPal callbacks) and file uploads.

### Middleware for Auth Guards

Use Next.js middleware (`middleware.ts`) to protect the `/admin` route group. Check the NextAuth JWT token for `role === 'admin'` — redirect unauthorized users to login. This prevents any admin page from rendering without a valid admin session.

### Price Integrity on Checkout

Always re-fetch ProductVariant prices server-side when creating a PayPal order. The client sends `variantId` + `quantity`, but the server looks up the current price. This prevents price manipulation and ensures PayPal is charged the correct amount.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Cart State in Database Before Checkout
**What:** Persisting cart to DB on every add/remove
**Why bad:** Unnecessary writes, complex sync, slower UX
**Instead:** Keep cart in Zustand + localStorage. Only write to DB when order is placed.

### Anti-Pattern 2: Trusting Client-Sent Prices
**What:** Using the price the browser sends to create a PayPal order
**Why bad:** Any user can manipulate the price in DevTools
**Instead:** Server looks up price from DB using the variant ID the client provides.

### Anti-Pattern 3: Putting All Logic in Pages
**What:** Writing Prisma queries directly inside page components
**Why bad:** Hard to reuse, test, or move to an API route
**Instead:** Extract data access into `lib/` service functions or Server Actions.

### Anti-Pattern 4: Single User Role Without Middleware Guard
**What:** Checking `session.user.role` only inside the page component
**Why bad:** The page renders before the check — flash of admin UI, potential data exposure
**Instead:** Middleware intercepts the request before any rendering occurs.

### Anti-Pattern 5: Uploading Images to the Next.js Server
**What:** Storing uploaded product images in `public/uploads/` on the app server
**Why bad:** Files are lost on redeploy (Vercel serverless has no persistent disk), doesn't scale
**Instead:** Upload to Cloudinary or Supabase Storage. Store the returned URL in the database.

---

## Scalability Notes

| Concern | At Launch (Malaysia only) | Future Growth |
|---------|--------------------------|--------------|
| Database | Single Postgres instance (Neon/Supabase free tier) | Add read replicas if query load grows |
| Images | Cloudinary free tier | Already CDN-backed, no change needed |
| Auth | NextAuth JWT sessions | Stateless — scales naturally |
| Cart | Zustand localStorage | Stateless — scales naturally |
| Payment | PayPal standard | Add payment methods later (Stripe for international) |
| Caching | Next.js default (no extra config) | Add `unstable_cache` for product pages if traffic spikes |

---

## Sources

- [Next.js App Router Project Structure (Official)](https://nextjs.org/docs/app/getting-started/project-structure)
- [Building APIs with Next.js (Official)](https://nextjs.org/blog/building-apis-with-nextjs)
- [Next.js E-commerce Architecture 2026 — ElevaSEO](https://www.elevaseo.com/en/blog/headless/nextjs-ecommerce-guide)
- [Next.js App Router Patterns 2026 — DEV Community](https://dev.to/teguh_coding/nextjs-app-router-the-patterns-that-actually-matter-in-2026-146)
- [Prisma + Next.js Official Guide](https://www.prisma.io/docs/guides/frameworks/nextjs)
- [Next.js + Prisma + Postgres (Vercel KB)](https://vercel.com/kb/guide/nextjs-prisma-postgres)
- [PayPal Express Checkout with Next.js — Medium](https://ofarukcaki.medium.com/paypal-express-checkout-with-react-next-js-fcc4be9d0d2)
- [Building a Next.js shopping cart — LogRocket](https://blog.logrocket.com/building-a-next-js-shopping-cart-app/)
- [Full-Stack E-commerce with Next.js + Prisma (open source reference)](https://github.com/sesto-dev/next-prisma-tailwind-ecommerce)
- [Next.js E-commerce Admin Dashboard (DEV Community)](https://dev.to/rajaabbas2002/i-built-a-full-stack-e-commerce-app-with-admin-dashboard-using-nextjs-1j3l)
