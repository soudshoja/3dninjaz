---
phase: 01-foundation
plan: 03
status: complete
subsystem: admin
tags: [admin, server-actions, drizzle, zod, auth-guard, mariadb]
requires:
  - Plan 01-01 (Drizzle MySQL schema, Better Auth)
  - Plan 01-02 (admin seed script, admin user exists)
provides:
  - src/lib/auth-helpers.ts: requireAdmin() and getSessionUser()
  - src/lib/validators.ts: categorySchema, productSchema, productVariantSchema
  - src/actions/categories.ts: createCategory, getCategories, getCategoriesWithCounts, deleteCategory
  - src/actions/products.ts: createProduct, updateProduct, deleteProduct, toggleProductActive, toggleProductFeatured, getProduct, getProducts
  - (admin) layout with sidebar + session role guard + AdminUserBadge
  - /admin dashboard with product/category stats
  - /admin/products list page with actions dropdown
  - /admin/categories inline-create + list page
affects:
  - Plan 01-04 depends on these server actions and route structure
tech-stack:
  patterns:
    - Handler-level admin session check on every mutation action (CVE-2025-29927 mitigation)
    - App-generated UUIDs (randomUUID) instead of MySQL default UUID()
    - Manual relation hydration (extra SELECTs) instead of Drizzle relational queries — MariaDB 10.11 lacks LATERAL join support
    - Server actions use revalidatePath for cache invalidation after mutations
key-files:
  created:
    - src/lib/auth-helpers.ts
    - src/lib/validators.ts
    - src/actions/categories.ts
    - src/actions/products.ts
    - src/app/(admin)/layout.tsx
    - src/app/(admin)/admin/page.tsx
    - src/app/(admin)/admin/products/page.tsx
    - src/app/(admin)/admin/products/product-row-actions.tsx
    - src/app/(admin)/admin/categories/page.tsx
    - src/app/(admin)/admin/categories/category-form.tsx
    - src/app/(admin)/admin/categories/category-row-actions.tsx
    - src/components/admin/sidebar-nav.tsx
    - src/components/admin/admin-user-badge.tsx
decisions:
  - App-generated UUIDs for products so image upload paths (public/uploads/products/<id>) can be constructed before the row is inserted (needed for Plan 01-04)
  - Manual multi-query relation hydration replaces Drizzle's `with: {}` — MariaDB 10.11 does not support LATERAL joins (ER_PARSE_ERROR at runtime)
  - deleteCategory nulls categoryId on products referencing it before deleting — FK is nullable so this preserves data
  - productSchema validates image URLs against /^\/uploads\/products\// rather than z.string().url() since uploads are local paths, not URLs
metrics:
  tasks_completed: 2
  commits: 1
---

# Phase 01 Plan 03: Admin Panel (Layout, Server Actions, Product List, Categories) Summary

One-liner: Admin panel with sidebar layout and server-side role guard, all product/category CRUD server actions protected by handler-level `requireAdmin()`, dashboard with live counts, product list with delete/toggle actions, and inline-create category management — MariaDB 10.11 quirks accommodated by manual relation hydration.

## What Was Built

### Shared libs
- `src/lib/auth-helpers.ts` — `requireAdmin()` throws `Error("Forbidden")` if no session or role !== "admin". Used at the top of every mutation action to satisfy T-03-01 (CVE-2025-29927 mitigation: middleware alone is bypassable; the handler must verify).
- `src/lib/validators.ts` — Zod schemas:
  - `categorySchema` (name 1–50 chars)
  - `productVariantSchema` (size enum S/M/L, price regex `/^\d+(\.\d{1,2})?$/`, optional decimal dimensions)
  - `productSchema` (max 5 images per D-03, at least 1 variant per D-13, images must match `/^\/uploads\/products\//`, categoryId is UUID or null)

### Server actions
- `src/actions/categories.ts`
  - `createCategory(FormData)` — validates, slugifies name server-side, catches unique violation
  - `getCategories()` — plain SELECT ordered by name
  - `getCategoriesWithCounts()` — LEFT JOIN products + GROUP BY for product counts
  - `deleteCategory(id)` — nulls referencing products, then deletes
- `src/actions/products.ts`
  - `createProduct(data)` — generates UUID in app code, inserts product + variants in two queries
  - `updateProduct(id, data)` — updates base row, replaces variant set (DELETE WHERE productId + INSERT)
  - `deleteProduct(id)` — cascades to variants via FK
  - `toggleProductActive(id, bool)`, `toggleProductFeatured(id, bool)` — minimal UPDATE
  - `getProduct(id)` / `getProducts()` — manual variant + category hydration
- Every mutation calls `requireAdmin()` first.
- Every mutation calls `revalidatePath('/admin/products')` / `/admin` after success.

### Admin route group
- `src/app/(admin)/layout.tsx` — server component, fetches session via `auth.api.getSession`, redirects to `/login` if missing or not admin. Renders sidebar (hidden on mobile, mobile header instead).
- `src/components/admin/sidebar-nav.tsx` — client component with `usePathname()` for active-link state, 3 items (Dashboard/Products/Categories) with Lucide icons.
- `src/components/admin/admin-user-badge.tsx` — client card showing admin name/email + Sign Out button.
- `/admin` dashboard (`src/app/(admin)/admin/page.tsx`) — three stat cards (Total Products, Active Products, Total Categories) built from `count()` Drizzle aggregates.
- `/admin/products` (`src/app/(admin)/admin/products/page.tsx`) — shadcn Table with thumbnail (Next Image from first image URL or Package icon fallback), product name, category name or "Uncategorized", formatted MYR price range from variants, Active/Inactive Badge, featured Star, actions dropdown.
- `product-row-actions.tsx` — client component with DropdownMenu: Edit link, toggle active, toggle featured, delete (with shadcn Dialog confirmation). All use `useTransition` + `router.refresh()` for optimistic updates.
- `/admin/categories` (`src/app/(admin)/admin/categories/page.tsx`) — inline create form + Table (name, slug, product count, delete button).
- `category-form.tsx` — client form calling `createCategory(FormData)`.
- `category-row-actions.tsx` — delete button + confirmation Dialog that warns when products will become Uncategorized.

## Verification Performed

- `npx tsc --noEmit` — clean.
- Smoke tests via curl against the live dev server on :3002:
  - GET `/admin` (no session) → **307** redirect to `/login` ✓ (T-03-01: layout guard confirmed)
  - POST `/api/auth/sign-in/email` with admin creds → **200** with `role: "admin"` ✓
  - GET `/admin` (authenticated admin) → **200**
  - GET `/admin/products` → **200** (after fixing the LATERAL issue — see Deviations)
  - GET `/admin/categories` → **200**, renders the direct-INSERT seeded category

## Deviations from Plan

- **[Rule 1 - Bug] MariaDB 10.11 ER_PARSE_ERROR on Drizzle relational queries.** The plan used `db.query.products.findMany({ with: { variants, category } })` which Drizzle compiles to `LEFT JOIN LATERAL (...)`. MariaDB did not support LATERAL before 10.12. Rewrote `getProduct` and `getProducts` to manually hydrate relations via additional SELECT + `inArray` batched lookups. No N+1 concern — product catalog is small.
- **[Rule 2 - Correctness] App-generated UUID in `createProduct`.** The plan suggested using MySQL's `UUID()` default with a follow-up read. Using `randomUUID()` in Node returns the id immediately without a round-trip and is required for Plan 01-04 which must build `public/uploads/products/<id>/` paths before insert.
- **[Rule 2 - Correctness] `deleteCategory` nulls referencing products first.** The FK `products.category_id -> categories.id` is nullable and has no ON DELETE action; a naive delete would fail if any product still referenced the row. Set `categoryId = NULL` on dependents, then DELETE — matching the confirmation dialog copy that says products will become Uncategorized.

## Self-Check: PASSED

- FOUND: `src/lib/auth-helpers.ts` (requireAdmin)
- FOUND: `src/lib/validators.ts` (productSchema, categorySchema)
- FOUND: `src/actions/categories.ts`
- FOUND: `src/actions/products.ts`
- FOUND: `src/app/(admin)/layout.tsx` (session + role check)
- FOUND: `src/app/(admin)/admin/page.tsx` (count stats)
- FOUND: `src/app/(admin)/admin/products/page.tsx`
- FOUND: `src/app/(admin)/admin/products/product-row-actions.tsx`
- FOUND: `src/app/(admin)/admin/categories/page.tsx`
- FOUND: `src/app/(admin)/admin/categories/category-form.tsx`
- FOUND: `src/app/(admin)/admin/categories/category-row-actions.tsx`
- FOUND: `src/components/admin/sidebar-nav.tsx`
- FOUND: `src/components/admin/admin-user-badge.tsx`
- FOUND commit: feat(01-03) admin layout + server actions + product list + categories
- HTTP smoke tests all pass
