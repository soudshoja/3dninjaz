# Phase 1: Foundation - Research

**Researched:** 2026-04-12
**Domain:** Next.js 15 full-stack scaffold, Better Auth, Drizzle ORM, Neon PostgreSQL, Cloudinary, Admin CRUD
**Confidence:** HIGH

## Summary

Phase 1 establishes the entire project scaffold and delivers two functional verticals: user authentication (register, login, logout, password reset with PDPA consent) and admin product management (CRUD with Cloudinary image upload and per-variant pricing). This is a greenfield build -- no existing code, no existing database.

The stack is fully locked: Next.js 15 App Router + TypeScript + Drizzle ORM + Neon PostgreSQL + Better Auth + Cloudinary + shadcn/ui + Tailwind v4. Better Auth v1.6.x provides a dedicated admin plugin with role-based access and a Drizzle adapter with schema generation CLI. The admin plugin handles roles natively (no custom RBAC needed). PDPA consent is stored as a custom `additionalFields` timestamp on the user table.

**Primary recommendation:** Build in strict dependency order -- database schema first, then auth, then admin CRUD. Use Better Auth's admin plugin for roles instead of hand-rolling role checks. Use `npx auth generate` to create Better Auth's required tables, then extend the schema with product/category/variant tables.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Admin product management layout at Claude's discretion (table+form vs card grid)
- D-02: Image upload uses drag & drop zone with fallback file picker button
- D-03: Maximum 5 images per product
- D-04: Before building anything, generate 3 design template options (COMPLETED -- Template A: Bold Ninja selected)
- D-05: First admin account created via seed command (`npm run seed:admin` or similar)
- D-06: Login/register pages use clean centered card design with logo (Shopify-style)
- D-07: Single login page for both admin and customer -- system redirects based on role after login
- D-08: Two roles: `admin` and `customer`. Admin assigned via seed, all registrations default to `customer`
- D-09: PDPA consent checkbox on registration form (required, stores consent timestamp)
- D-10: Products have simple categories (one category per product). Admin manages categories.
- D-11: Product fields: name, description, images (max 5), per-size pricing (S/M/L), material type, estimated production days, physical dimensions per size, active/inactive toggle, featured flag, category
- D-12: Products have a `featured` boolean flag
- D-13: Per-variant pricing via ProductVariant table: each size (S/M/L) is a separate row with own price and dimensions

### Claude's Discretion
- Admin panel layout style (table+form vs card grid)
- Specific form field ordering and grouping in product creation form
- Category management UI (inline creation vs separate page)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can create account with email and password | Better Auth emailAndPassword plugin, `authClient.signUp.email()` client method |
| AUTH-02 | User can log in and stay logged in across browser sessions | Better Auth session cookies (HTTP-only, persistent), `auth.api.getSession()` server-side |
| AUTH-03 | User can log out from any page | `authClient.signOut()` client method, nav component with session check |
| AUTH-04 | User can reset password via email link | Better Auth `sendResetPassword` callback + Resend email service |
| AUTH-05 | User gives PDPA consent checkbox during registration | `additionalFields` on user: `pdpaConsentAt` timestamp, required checkbox in registration form |
| ADM-01 | Admin can create products with name, description, multiple images, and per-size pricing | Product + ProductVariant Drizzle schema, server action, CldUploadWidget for images |
| ADM-02 | Admin can edit existing products | Server action to update product + variants, pre-populated form |
| ADM-03 | Admin can delete products | Server action with admin role check, cascade delete variants |
| ADM-04 | Admin can toggle products active/inactive | `isActive` boolean field, toggle server action |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- GSD workflow enforcement: Do not make direct repo edits outside a GSD workflow unless user explicitly asks
- No project skills found -- this phase establishes foundational patterns
- Template A (Bold Ninja) selected as design template: Russo One headings, Chakra Petch body, orange CTAs, green primary, sidebar admin, 8px rounded corners

## Standard Stack

### Core (Phase 1 Specific)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.2.3 | Full-stack framework | Latest stable, App Router, patches CVE-2025-29927 [VERIFIED: npm registry] |
| TypeScript | 5.x | Type safety | Ships with Next.js [VERIFIED: npm registry] |
| Drizzle ORM | 0.45.2 | Database access | Type-safe, no codegen, Neon HTTP driver native support [VERIFIED: npm registry] |
| drizzle-kit | 0.31.10 | Schema migrations | Generate + migrate CLI [VERIFIED: npm registry] |
| drizzle-zod | 0.8.3 | Schema-to-Zod validation | Shared validation between DB schema and forms [VERIFIED: npm registry] |
| @neondatabase/serverless | latest | Neon PostgreSQL driver | Serverless HTTP driver for Vercel [CITED: orm.drizzle.team/docs/tutorials/drizzle-nextjs-neon] |
| better-auth | 1.6.2 | Authentication | Email/password, sessions, password reset, admin plugin, Drizzle adapter [VERIFIED: npm registry] |
| next-cloudinary | 6.17.5 | Image upload/display | CldUploadWidget for admin uploads, CldImage for display [VERIFIED: npm registry] |
| react-hook-form | 7.72.1 | Form state | Works with shadcn/ui Form primitives [VERIFIED: npm registry] |
| zod | 4.3.6 | Schema validation | Shared client/server validation [VERIFIED: npm registry] |
| shadcn/ui | latest | UI components | Copy-paste components, zero runtime [CITED: ui.shadcn.com/docs/installation/next] |
| Tailwind CSS | v4.x | Styling | Ships zero-config with Next.js 15+, CSS-native variables [ASSUMED] |
| lucide-react | latest | Icons | Default shadcn/ui icon set [ASSUMED] |
| resend | latest | Transactional email | Password reset emails (Phase 1), order emails (Phase 3) [ASSUMED] |

**NOTE on Next.js version:** npm shows Next.js 16.2.3 as latest. The stack research specified 15.x. Next.js 16 is backwards-compatible with App Router patterns. Use `next@15` explicitly if the team prefers stability, or `next@latest` (16.2.3) for the newest features. **Recommendation:** Use Next.js 15.x (latest 15.x release) for stability since all research and tutorials reference Next.js 15 patterns. [ASSUMED -- user should confirm preference]

**NOTE on Zod version:** npm shows Zod 4.3.6 as latest. Zod 4 is a major version bump from 3.x referenced in stack research. Zod 4 has breaking API changes. **Recommendation:** Use `zod@3` (latest 3.x) for compatibility with drizzle-zod and react-hook-form resolvers, which may not yet support Zod 4. [ASSUMED -- needs verification]

**Installation:**
```bash
# Scaffold
npx create-next-app@15 printninjaz --typescript --tailwind --app --src-dir

# Database
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit

# Auth
npm install better-auth

# Images
npm install next-cloudinary

# UI
npx shadcn@latest init
npm install lucide-react

# Forms & validation
npm install react-hook-form zod@3 @hookform/resolvers drizzle-zod

# Email (for password reset)
npm install resend
```

## Architecture Patterns

### Project Structure
```
src/
  app/
    (store)/
      page.tsx                  # Homepage (placeholder for Phase 1)
      layout.tsx                # Store layout with nav
    (auth)/
      login/page.tsx            # Single login page (admin + customer)
      register/page.tsx         # Registration with PDPA consent
      forgot-password/page.tsx  # Request password reset
      reset-password/page.tsx   # Reset password with token
    (admin)/
      layout.tsx                # Admin layout with sidebar + auth guard
      admin/
        page.tsx                # Admin dashboard
        products/
          page.tsx              # Product list (table)
          new/page.tsx          # Create product form
          [id]/edit/page.tsx    # Edit product form
        categories/
          page.tsx              # Category management
    api/
      auth/[...all]/route.ts    # Better Auth catch-all handler
      admin/
        seed/route.ts           # Seed admin endpoint (or CLI script)
  lib/
    auth.ts                     # Better Auth server config
    auth-client.ts              # Better Auth client config
    db/
      index.ts                  # Drizzle client singleton
      schema.ts                 # All Drizzle table definitions
      migrations/               # Generated migration files
  components/
    ui/                         # shadcn/ui components
    admin/                      # Admin-specific components
    auth/                       # Auth form components
  actions/
    products.ts                 # Product CRUD server actions
    categories.ts               # Category CRUD server actions
```

### Pattern 1: Better Auth Setup with Drizzle Adapter
**What:** Configure Better Auth with Drizzle adapter and admin plugin
**When:** Phase 1 setup, before any auth UI
**Example:**
```typescript
// src/lib/auth.ts
// Source: https://better-auth.com/docs/adapters/drizzle + https://better-auth.com/docs/plugins/admin
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: schema,
  }),
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url, token }, request) => {
      // Use Resend to send password reset email
      // IMPORTANT: void the await to prevent timing attacks
      void fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "noreply@printninjaz.com",
          to: user.email,
          subject: "Reset your password",
          html: `<p>Click <a href="${url}">here</a> to reset your password.</p>`,
        }),
      });
    },
  },
  user: {
    additionalFields: {
      pdpaConsentAt: {
        type: "date",
        required: false,
        input: true, // Allow setting during signup
      },
    },
  },
  plugins: [
    admin({
      defaultRole: "customer", // D-08: all registrations default to customer
    }),
  ],
});
```

### Pattern 2: Better Auth Client
**What:** Client-side auth hooks
**Example:**
```typescript
// src/lib/auth-client.ts
// Source: https://better-auth.com/docs/integrations/next
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [adminClient()],
});

// Usage in components:
// const { data: session } = authClient.useSession();
// authClient.signUp.email({ email, password, name, pdpaConsentAt: new Date() });
// authClient.signIn.email({ email, password });
// authClient.signOut();
// authClient.forgetPassword({ email });
// authClient.resetPassword({ token, newPassword });
```

### Pattern 3: Better Auth API Route Handler
**What:** Catch-all route for Better Auth
**Example:**
```typescript
// src/app/api/auth/[...all]/route.ts
// Source: https://better-auth.com/docs/integrations/next
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

### Pattern 4: Handler-Level Admin Auth Check (CRITICAL SECURITY)
**What:** Every admin server action verifies role at the handler level, not just middleware
**Why:** CVE-2025-29927 proved middleware is bypassable. Handler-level checks are the real security boundary.
**Example:**
```typescript
// src/actions/products.ts
"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { products, productVariants } from "@/lib/db/schema";

async function requireAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session || session.user.role !== "admin") {
    throw new Error("Forbidden");
  }
  return session;
}

export async function createProduct(formData: FormData) {
  await requireAdmin(); // ALWAYS check at handler level
  // ... product creation logic
}
```

### Pattern 5: Drizzle + Neon Database Client
**What:** Database client singleton
**Example:**
```typescript
// src/lib/db/index.ts
// Source: https://orm.drizzle.team/docs/tutorials/drizzle-nextjs-neon
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export const db = drizzle(process.env.DATABASE_URL!, { schema });
```

### Pattern 6: Database Schema (Product + Variants + Categories)
**What:** Core schema for Phase 1
**Example:**
```typescript
// src/lib/db/schema.ts (application tables -- Better Auth tables generated separately)
import { pgTable, text, boolean, integer, decimal, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull(),
  images: text("images").array().notNull().default([]),  // Cloudinary URLs, max 5
  materialType: text("material_type"),
  estimatedProductionDays: integer("estimated_production_days"),
  isActive: boolean("is_active").notNull().default(true),
  isFeatured: boolean("is_featured").notNull().default(false),
  categoryId: uuid("category_id").references(() => categories.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const productVariants = pgTable("product_variants", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  size: text("size", { enum: ["S", "M", "L"] }).notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),  // MYR
  widthCm: decimal("width_cm", { precision: 6, scale: 1 }),
  heightCm: decimal("height_cm", { precision: 6, scale: 1 }),
  depthCm: decimal("depth_cm", { precision: 6, scale: 1 }),
});

// Relations
export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  variants: many(productVariants),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));
```

### Pattern 7: Cloudinary Upload Widget
**What:** Admin image upload with drag & drop
**Example:**
```typescript
// Source: https://next.cloudinary.dev/clduploadwidget/basic-usage
"use client";
import { CldUploadWidget } from "next-cloudinary";

function ImageUploader({ onUpload, maxImages = 5, currentCount = 0 }) {
  return (
    <CldUploadWidget
      uploadPreset={process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET}
      options={{
        maxFiles: maxImages - currentCount,
        sources: ["local", "url"],  // drag & drop + file picker
        resourceType: "image",
        maxFileSize: 5000000, // 5MB
        clientAllowedFormats: ["jpg", "jpeg", "png", "webp"],
      }}
      onSuccess={(result) => {
        if (typeof result.info === "object") {
          onUpload(result.info.secure_url);
        }
      }}
    >
      {({ open }) => (
        <button type="button" onClick={() => open()}>
          Upload Images
        </button>
      )}
    </CldUploadWidget>
  );
}
```

### Pattern 8: Admin Seed Script
**What:** CLI command to create first admin user
**Example:**
```typescript
// scripts/seed-admin.ts
import { auth } from "@/lib/auth";

async function seedAdmin() {
  const admin = await auth.api.createUser({
    body: {
      email: process.env.ADMIN_EMAIL || "admin@printninjaz.com",
      password: process.env.ADMIN_PASSWORD || "changeme123",
      name: "Print Ninjaz Admin",
      role: "admin",
    },
  });
  console.log("Admin created:", admin.user.email);
}

seedAdmin().catch(console.error);
```

Run via: `npx tsx scripts/seed-admin.ts` (add as `"seed:admin"` in package.json scripts).

### Anti-Patterns to Avoid
- **Middleware-only admin protection:** Always check role at handler level (Pitfall 1 -- CVE-2025-29927)
- **Single price field for products:** Use ProductVariant table from day one (Pitfall 6)
- **Storing images in public/ folder:** Use Cloudinary -- Vercel has no persistent disk (Pitfall 5)
- **Trusting file extension for uploads:** Cloudinary handles validation, but also enforce `clientAllowedFormats`
- **Using `isAdmin` prop from client:** Always derive role server-side via `auth.api.getSession()`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session management | Custom JWT/cookie logic | Better Auth sessions | Session security is hard, timing attacks, cookie flags |
| Password hashing | bcrypt wrapper | Better Auth built-in | Handles salt, rounds, and timing-safe comparison |
| Password reset flow | Custom token generation + email | Better Auth `sendResetPassword` | Token expiry, single-use tokens, race conditions |
| Role-based access | Custom middleware RBAC | Better Auth admin plugin | Roles stored in user table, `userHasPermission` API |
| Image upload/CDN | Custom S3 + CloudFront | Cloudinary via next-cloudinary | Transforms, CDN, WebP auto-conversion, upload widget |
| Form validation | Custom validators | Zod + drizzle-zod | Define schema once, validate everywhere |
| Database migrations | Raw SQL files | drizzle-kit generate + migrate | Type-safe, diffable, reversible |
| UI components | Custom buttons/inputs/tables | shadcn/ui | Accessible, tested, Tailwind-native |

## Common Pitfalls

### Pitfall 1: Better Auth Schema Generation Order
**What goes wrong:** Developer writes custom Drizzle schema first, then runs `npx auth generate` which creates conflicting table definitions.
**Why it happens:** Better Auth generates its own user/session/account/verification tables. If you already defined a `users` table, there is a naming collision.
**How to avoid:** Run `npx auth generate` FIRST to get Better Auth's required tables, THEN add your application tables (products, categories, variants) alongside them. Use the `usePlural` option if you want plural table names.
**Warning signs:** Drizzle migration errors about duplicate table names.

### Pitfall 2: Middleware-Only Admin Protection (CVE-2025-29927)
**What goes wrong:** Admin routes protected only by Next.js middleware. Attacker bypasses middleware via crafted headers.
**Why it happens:** CVE-2025-29927 (CVSS 9.1). Middleware is a routing layer, not a security boundary.
**How to avoid:** Check `session.user.role === "admin"` inside every admin Server Action and API route handler. Use the `requireAdmin()` pattern shown above.
**Warning signs:** If removing middleware allows admin pages to load, protection is insufficient. [CITED: projectdiscovery.io/blog/nextjs-middleware-authorization-bypass]

### Pitfall 3: Unprotected Image Upload
**What goes wrong:** The Cloudinary upload preset is unsigned and the widget is client-side. Anyone who discovers the upload preset can upload arbitrary files to your Cloudinary account.
**Why it happens:** CldUploadWidget uses unsigned upload presets by default for simplicity.
**How to avoid:** Use a signed upload preset. Create an API route that signs the upload request. Alternatively, use an unsigned preset but restrict allowed file types and max file size in Cloudinary dashboard settings.
**Warning signs:** Check Cloudinary dashboard for unexpected uploads. [CITED: next.cloudinary.dev/clduploadwidget/configuration]

### Pitfall 4: PDPA Consent Not Stored as Timestamp
**What goes wrong:** PDPA consent is stored as a boolean (`true`). Under PDPA 2010, you must prove WHEN consent was given.
**Why it happens:** Developers model consent as a checkbox boolean.
**How to avoid:** Store `pdpaConsentAt` as a `timestamp` (not boolean). Set it to `new Date()` when the user checks the box during registration. Never pre-check the checkbox.
**Warning signs:** If you cannot answer "when did user X consent?", the implementation is wrong.

### Pitfall 5: Better Auth + Drizzle Table Name Mapping
**What goes wrong:** Better Auth expects table names like `user`, `session`, `account`. Drizzle schema might use plural names (`users`, `sessions`).
**Why it happens:** Default naming conventions differ between the two libraries.
**How to avoid:** Either use singular table names in your schema, OR pass `usePlural: true` to the drizzle adapter, OR manually map names via the `schema` option.
**Warning signs:** Auth operations fail with "relation does not exist" errors. [CITED: better-auth.com/docs/adapters/drizzle]

### Pitfall 6: Zod 4 Compatibility
**What goes wrong:** Installing `zod@latest` gets Zod 4.x which has breaking changes. `drizzle-zod` and `@hookform/resolvers` may not support Zod 4 yet.
**Why it happens:** Zod 4 was recently released with API changes.
**How to avoid:** Pin to `zod@3` explicitly. Test drizzle-zod and hookform resolvers compatibility before upgrading.
**Warning signs:** TypeScript errors in form validation or schema generation. [ASSUMED -- needs verification at install time]

## Code Examples

### Complete Registration Form with PDPA Consent
```typescript
// Source: Better Auth docs + project decisions D-06, D-09
"use client";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function onSubmit(formData: FormData) {
    const pdpaConsent = formData.get("pdpaConsent") === "on";
    if (!pdpaConsent) {
      setError("You must agree to the privacy policy to create an account.");
      return;
    }

    const { error } = await authClient.signUp.email({
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      name: formData.get("name") as string,
      pdpaConsentAt: new Date().toISOString(),
    });

    if (error) {
      setError(error.message);
    } else {
      router.push("/"); // or /admin if admin role
    }
  }

  return (
    <form action={onSubmit}>
      {/* ... email, password, name fields ... */}
      <label>
        <input type="checkbox" name="pdpaConsent" required />
        I agree to the Privacy Policy and consent to data processing under PDPA 2010
      </label>
      {error && <p className="text-red-500">{error}</p>}
      <button type="submit">Create Account</button>
    </form>
  );
}
```

### Post-Login Role-Based Redirect
```typescript
// Source: D-07 -- single login page, redirect based on role
"use client";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();

  async function onSubmit(formData: FormData) {
    const { data, error } = await authClient.signIn.email({
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    });

    if (error) {
      // show error
      return;
    }

    // Redirect based on role
    if (data?.user?.role === "admin") {
      router.push("/admin");
    } else {
      router.push("/");
    }
  }

  return <form action={onSubmit}>{/* ... */}</form>;
}
```

### drizzle.config.ts
```typescript
// Source: https://orm.drizzle.team/docs/tutorials/drizzle-nextjs-neon
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| NextAuth (Auth.js v5) | Better Auth 1.x | 2025 | Better Drizzle integration, simpler DX, self-hosted |
| Prisma ORM | Drizzle ORM | 2024-2025 | No codegen, smaller bundle, Neon native driver |
| tailwind.config.ts | Tailwind v4 CSS variables | 2025 | Zero config, CSS-native theming |
| Pages Router | App Router (stable) | 2024+ | Server Components, streaming, server actions |
| Middleware-only auth | Handler-level auth checks | 2025 (CVE-2025-29927) | Middleware is optimistic only, real checks at handler |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Next.js 15.x should be used over 16.x for stability | Standard Stack | Low -- 16.x would also work, just less tested with Better Auth docs |
| A2 | Zod 3.x needed for drizzle-zod/hookform compatibility (Zod 4 may break) | Standard Stack / Pitfall 6 | Medium -- if Zod 4 is compatible, we miss new features; if not and we install 4, forms break |
| A3 | Better Auth admin plugin `defaultRole` accepts custom role names like "customer" | Pattern 1 | Medium -- if only "user"/"admin" are accepted, need to use "user" instead of "customer" |
| A4 | `additionalFields` with `type: "date"` works for pdpaConsentAt timestamp | Pattern 1 | Medium -- may need `type: "string"` and manual date conversion |
| A5 | Resend free tier works for Malaysian email addresses | Standard Stack | Low -- only affects password reset; can swap email provider |
| A6 | Tailwind v4 ships zero-config with create-next-app@15 | Standard Stack | Low -- may need minor config adjustment |

## Open Questions

1. **Next.js 15 vs 16?**
   - What we know: npm latest is 16.2.3, but all stack research references 15.x
   - What's unclear: Whether Better Auth + Drizzle tutorials are tested against Next.js 16
   - Recommendation: Use `create-next-app@15` explicitly for maximum compatibility

2. **Zod 3 vs 4?**
   - What we know: Zod 4.3.6 is latest, but drizzle-zod 0.8.3 was likely built for Zod 3
   - What's unclear: Whether drizzle-zod supports Zod 4
   - Recommendation: Pin `zod@3` and verify compatibility before any upgrade

3. **Better Auth "customer" role name?**
   - What we know: Admin plugin defaults to "user" and "admin" roles
   - What's unclear: Whether custom role names like "customer" work with `defaultRole`
   - Recommendation: Test during setup. If "customer" does not work, use "user" as the default role and treat it as "customer" semantically

4. **Cloudinary upload preset security**
   - What we know: CldUploadWidget can use unsigned or signed presets
   - What's unclear: Whether unsigned preset with restricted file types is sufficient security for admin-only uploads
   - Recommendation: Use signed uploads for production; unsigned acceptable for dev

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Everything | Needs check | -- | Required, no fallback |
| npm | Package management | Needs check | -- | Required, no fallback |
| PostgreSQL (Neon) | Database | Cloud service | -- | Requires Neon account setup |
| Cloudinary | Image uploads | Cloud service | -- | Requires Cloudinary account setup |
| Resend | Password reset emails | Cloud service | -- | Requires Resend account + domain verification |

**Missing dependencies with no fallback:**
- Neon PostgreSQL account with connection string (DATABASE_URL)
- Cloudinary account with cloud name and upload preset
- Resend API key (for password reset functionality)

**Missing dependencies with fallback:**
- Resend can be deferred -- password reset can use console.log during development

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | YES | Better Auth email/password with admin plugin |
| V3 Session Management | YES | Better Auth HTTP-only session cookies |
| V4 Access Control | YES | Handler-level `requireAdmin()` checks on every admin action |
| V5 Input Validation | YES | Zod schemas for all form inputs + server actions |
| V6 Cryptography | NO | Better Auth handles password hashing internally |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Middleware bypass (CVE-2025-29927) | Elevation of Privilege | Handler-level auth checks on all admin actions |
| Unprotected upload endpoint | Tampering | Signed Cloudinary upload preset + admin session check |
| PDPA consent forgery | Repudiation | Server-side timestamp, never trust client boolean |
| Role escalation via direct API | Elevation of Privilege | Admin role only assignable via seed script, not registration |
| Price manipulation | Tampering | Server-side price lookup from DB (relevant for later phases) |

## Sources

### Primary (HIGH confidence)
- [Better Auth Drizzle Adapter](https://better-auth.com/docs/adapters/drizzle) -- schema generation, adapter config
- [Better Auth Next.js Integration](https://better-auth.com/docs/integrations/next) -- route handler, client, session
- [Better Auth Admin Plugin](https://better-auth.com/docs/plugins/admin) -- roles, createUser, permissions
- [Better Auth Email/Password](https://better-auth.com/docs/authentication/email-password) -- sendResetPassword
- [Drizzle + Neon Tutorial](https://orm.drizzle.team/docs/tutorials/drizzle-nextjs-neon) -- db client, config, migrations
- [next-cloudinary CldUploadWidget](https://next.cloudinary.dev/clduploadwidget/basic-usage) -- upload widget usage
- npm registry -- all package versions verified 2026-04-12

### Secondary (MEDIUM confidence)
- [Medium: Next.js + Drizzle + Neon + Better Auth](https://medium.com/@abgkcode/building-a-full-stack-application-with-next-js-drizzle-orm-neon-postgresql-and-better-auth-6d7541fba48a) -- full-stack integration pattern
- [DEV.to: Forgot/Reset Password with Better Auth + Resend](https://dev.to/daanish2003/forgot-and-reset-password-using-betterauth-nextjs-and-resend-ilj) -- password reset flow
- [CVE-2025-29927 Analysis](https://projectdiscovery.io/blog/nextjs-middleware-authorization-bypass) -- middleware bypass details

### Tertiary (LOW confidence)
- Better Auth `additionalFields` with `type: "date"` -- limited docs, may need runtime testing
- Zod 4 compatibility with drizzle-zod -- no official statement found

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all versions verified via npm registry, official docs consulted
- Architecture: HIGH -- patterns from official Better Auth + Drizzle docs, well-established Next.js App Router patterns
- Pitfalls: HIGH -- CVE-2025-29927 documented, per-variant pricing locked in decisions, upload security from Cloudinary docs
- Better Auth additionalFields: MEDIUM -- limited docs on custom date fields

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (30 days -- stable stack, Better Auth may release minor updates)
