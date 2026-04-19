# Phase 2: Storefront + Cart - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase builds the complete pre-purchase customer experience on top of the Phase 1 foundation. It delivers: a homepage with featured products, a product catalog (grid with optional category filter), a product detail page (gallery + size selector + size guide + material + lead time), the client-side cart (Zustand + localStorage), a cart drawer accessible from the store nav, and a dedicated cart page. After this phase, a customer can browse the whole store, inspect products, pick a size, and assemble a cart — everything except payment, which Phase 3 delivers.

No new database tables are introduced — all reads come from the existing `products`, `product_variants`, and `categories` tables created in Phase 1 (`src/lib/db/schema.ts`). No server writes occur in this phase beyond read-only Drizzle queries: the cart is client-side only.

</domain>

<decisions>
## Implementation Decisions

### Design & Brand (VISUAL CONTRACT)
- **D2-01:** Visual language follows `src/app/demo/page.tsx` / `src/app/demo-v2/page.tsx` — cream background (`#F7FAF4`), ink text (`#0B1020`), three-color accent palette: blue `#2563EB`, green `#84CC16`, purple `#8B5CF6`. The Phase 1 UI-SPEC "Template A" green/orange palette is SUPERSEDED for customer-facing pages by this demo palette — the ink/cream + 3-color demo look IS the store design.
- **D2-02:** Typography continues Phase 1: Russo One for headings (via `--font-heading` CSS variable already registered in `src/app/layout.tsx`), Chakra Petch for body (via `--font-body`). Do not introduce new fonts.
- **D2-03:** Buttons are chunky pill shapes with drop-shadows (`rounded-full`, `shadow-[0_6px_0_rgba(0,0,0,0.35)]`), wave SVG dividers between sections (reuse `Wave` component pattern from demo), shuriken SVG accents (reuse `Shuriken` component pattern from demo).
- **D2-04:** Tap targets: 48px minimum for secondary controls, 60px for primary CTAs (Add to bag, Checkout). Exceeds Phase 4 RESP-01 minimum of 44px.
- **D2-05:** Microcopy — use "Add to bag" (not "Add to cart") everywhere in product UI. The cart surface itself is called "cart" in URLs (`/cart`) and navigation labels ("Cart"), matching requirement language in REQUIREMENTS.md, but button CTAs say "Add to bag". "Your bag" is acceptable as a drawer heading.

### Catalog / Grid
- **D2-06:** Catalog grid is responsive: 2 columns mobile (<640px), 3 columns tablet (640–1023px), 4 columns desktop (≥1024px). Consistent across homepage-featured, `/shop`, and category pages.
- **D2-07:** Product card shows: first image (square, 1:1), product name (Russo One), price range derived from variants (format `RM 18 - RM 45` if variants differ, single price if all equal). Hover: card lifts (`-translate-y-2` or `hover:shadow-xl`). Entire card is a link to `/products/[slug]`.
- **D2-08:** The catalog surfaces only products with `isActive = true`. Inactive products are never visible in customer-facing routes, regardless of URL access (direct slug hit returns 404).
- **D2-09:** Category filter on `/shop` is a query param (`?category=slug`). A horizontal scroll of pill-shaped category chips at the top lets users switch. "All" chip resets the filter. If zero active categories exist, chip bar is hidden.

### Product Detail
- **D2-10:** Image gallery shows the first image large; remaining images appear as a thumbnail strip below. Clicking a thumbnail swaps the main image. Uses a simple client component (no lightbox/zoom in v1).
- **D2-11:** Size selector is three large pill chips labeled S / M / L. Each chip displays the variant's price beneath the letter. Selecting a chip updates the displayed "current price" above Add to bag. Only sizes that have a variant row are shown; if a product has only M (rare), only M is rendered.
- **D2-12:** Size guide is a table showing each available variant's dimensions (widthCm × heightCm × depthCm). If a variant has no dimensions, show an em-dash for that row. This satisfies PROD-04.
- **D2-13:** Material info section shows `materialType` (falls back to "PLA" if null) with a short fixed "How it's made" paragraph that is the same across all products (satisfies PROD-05). Copy lives in the product detail component, not the DB.
- **D2-14:** Lead time notice shows `estimatedProductionDays` (falls back to "3-7" if null) with copy "Ships in {N} business days from Kuala Lumpur" (satisfies PROD-06).
- **D2-15:** Add to bag button is disabled until a size is selected. The button reads "Add to bag" (not "Add to cart") and shows the currently selected price on a badge to the right.

### Cart (Client-Side Only)
- **D2-16:** Cart state is managed by Zustand with localStorage persistence (via `zustand/middleware` `persist`). Persistence key: `print-ninjaz-cart-v1`. Versioning allows future migrations.
- **D2-17:** A cart line item is keyed by `productId + size` (so adding two different sizes of the same product creates two lines). Incrementing a line only occurs when the same productId+size pair is added again.
- **D2-18:** Line item shape (stored in localStorage — snapshot pricing at time of add):
  ```ts
  { productId: string; productSlug: string; name: string; image: string; size: "S"|"M"|"L"; variantId: string; unitPrice: string; quantity: number; }
  ```
  `unitPrice` is a string (Drizzle decimal comes back as string) stored at add time. Subtotal is computed via `parseFloat` and redisplayed as `RM {n.toFixed(2)}`.
- **D2-19:** Cart surfaces in three places:
  1. **Header icon** — pill button in nav showing item count badge.
  2. **Cart drawer** — right-side drawer on desktop, bottom sheet on mobile. Opens from header icon on any page. Contains line items, subtotal, "View cart" link, "Checkout" primary CTA (checkout target is a Phase 3 stub — link to `/checkout` which may 404 in Phase 2).
  3. **Full cart page** `/cart` — same line items, larger layout, edit quantity and remove controls. Proceed-to-checkout CTA links to `/checkout`.
- **D2-20:** Quantity controls on each line: `−` and `+` buttons + numeric value. Min 1 (decreasing from 1 triggers remove). Max 10 per line (soft cap to avoid fat-finger input; no server-side inventory yet).
- **D2-21:** Subtotal is the sum of `unitPrice * quantity` across all lines, displayed as `RM {x.xx}`. Taxes and shipping are Phase 3 concerns — no placeholders rendered in Phase 2.
- **D2-22:** The cart is accessible to all users (no auth check in Phase 2). Phase 3 will gate checkout behind auth.

### Drawer Library
- **D2-23:** Use `vaul` for the cart drawer (works well with shadcn and provides bottom-sheet-on-mobile / right-drawer-on-desktop behavior in one library). Install as a new dependency. Wrap it in a shadcn-style `src/components/ui/drawer.tsx` component matching the shadcn Drawer contract so the rest of the code consumes familiar primitives.

### Claude's Discretion
- Exact section arrangement and spacing on `/shop` and product detail
- Skeleton vs spinner loading strategy per page (prefer shadcn Skeleton for grids, plain text for small dynamic bits)
- Whether to display an optional "Featured" rail on `/shop` top (OK to include if trivially obtained from the product query)
- Specific wording of empty states ("Your bag is empty" etc.) within the warm-playful brand tone

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack & Patterns
- `CLAUDE.md` — technology stack, conventions (Next.js 15 App Router, Drizzle mysql2, shadcn/ui, Zustand, Tailwind v4)
- `.planning/phases/01-foundation/01-UI-SPEC.md` — shadcn component list, spacing scale, breakpoints, accessibility rules (still authoritative for primitives; color palette overridden by D2-01)

### Phase 1 Outputs (dependency surface)
- `src/lib/db/schema.ts` — products, productVariants, categories tables
- `src/lib/db/index.ts` — Drizzle client (`db`) and relations query API (`db.query.products.findMany({ with: { variants, category } })`)
- `src/lib/auth.ts` — server-side session helper (`auth.api.getSession({ headers: await headers() })`) — only consumed if a page needs session awareness (not strictly required for Phase 2)
- `src/app/(store)/layout.tsx` — existing store nav and footer (Phase 1 Plan 02 created a placeholder; Phase 2 will enhance it)
- `src/app/demo/page.tsx` + `src/app/demo-v2/page.tsx` — visual contract (palette, wave dividers, shuriken accents, pill buttons, section rhythm)

### Project Context
- `.planning/PROJECT.md` — vision, Malaysia market, core value
- `.planning/REQUIREMENTS.md` — PROD-01…06, CART-01…05 detail
- `.planning/ROADMAP.md` — Phase 2 success criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 1)
- `src/components/ui/{button,card,badge,dialog,dropdown-menu,input,label,select,separator,skeleton,table,tabs,switch,textarea,avatar,sonner}.tsx` — shadcn primitives already installed
- `src/lib/db/index.ts` — Drizzle client singleton
- `src/lib/db/schema.ts` — tables with `relations()` set up: products → variants (many), products → category (one)
- Font variables `--font-heading` (Russo One) and `--font-body` (Chakra Petch) already registered in `src/app/layout.tsx`
- `public/logo.png` — brand logo (used prominently in demo routes)
- `public/uploads/products/<id>/<uuid>.(jpg|png|webp)` — admin-uploaded images, served from `/uploads/...`
- Animation keyframes in `globals.css`: `animate-spin-slow`, `animate-marquee`, stagger helpers

### Established Patterns (continue in Phase 2)
- Server components fetch via Drizzle (`db.query.products.findMany({ with: { variants, category } })`)
- Route groups: `(store)` for customer-facing, `(auth)` for login, `(admin)` for admin
- Interactive UI lives in client components named `*-form.tsx` or `*-actions.tsx`; page files stay server components
- Images served from `/uploads/...` via Next.js static handler — relative paths, no `remotePatterns` config needed
- Env-driven config — no Cloudinary; no Resend; cPanel MySQL + local filesystem

### New Patterns Phase 2 Establishes
- Zustand store pattern: `src/stores/cart-store.ts` exporting a typed `useCartStore` hook with persist middleware
- shadcn-style Drawer primitive at `src/components/ui/drawer.tsx` wrapping vaul
- Shared brand tokens as a module: `src/lib/brand.ts` exporting the BRAND constants (`blue`, `green`, `purple`, `ink`, `cream`) so product pages don't duplicate inline color maps like the demo does
- Shared decorative components: `src/components/brand/shuriken.tsx`, `src/components/brand/wave.tsx` extracted from the demo and reused across store pages

### Integration Points
- Drizzle reads on products/productVariants/categories (read-only in this phase)
- Zustand client store reading product data from props (no direct DB access from the cart)
- Next.js Image component against relative `/uploads/...` paths
- shadcn + vaul for the drawer; vaul must be installed (`npm install vaul`)

</code_context>

<specifics>
## Specific Ideas

- Extract demo's `Shuriken`, `Wave`, `Logo` components to `src/components/brand/` so they can be used by the real nav, hero, product grid section dividers, etc.
- Extract demo's `BRAND` color object to `src/lib/brand.ts` as a TypeScript module with typed exports.
- The homepage (`src/app/(store)/page.tsx`) gets upgraded from the Phase 1 placeholder into a real homepage: hero strip, category chips, featured product rail (top 4 `isFeatured=true` products ordered by `createdAt desc`), how-it-works 3-step section, CTA strip, footer. Use the demo as the structural template but bind real data.
- Product card component is the same on homepage, `/shop`, and category-filtered views — build it once (`src/components/store/product-card.tsx`) and reuse.
- The cart drawer and cart page both use the same `useCartStore` hook — they are two views on one client state.
- Cart page `/cart` is a route, NOT a route group. Place it at `src/app/(store)/cart/page.tsx` so it inherits the store layout.
- Because productVariants.price is a Drizzle `decimal` and returns as a string, wrap a helper `formatMYR(price: string | number)` in `src/lib/format.ts` to standardise `RM 18.00` output across cart, cards, and PDP.

</specifics>

<deferred>
## Deferred Ideas

- Product reviews / ratings — Phase 2 scope explicitly excludes; REQUIREMENTS marks as v2
- Wishlist / favorites — v2
- Search bar — not in PROD-01…06; deferred
- Product tags / multi-category — not in Phase 1 schema
- Infinite scroll / pagination — launch catalog is small enough for a single grid; add if catalog grows
- Cart syncing to server / per-user persistence — pure client cart in Phase 2 per D2-16; server-side carts are a Phase 3+ concern
- Shipping cost calculation, taxes, promo codes — Phase 3+
- 3D model viewer — explicitly out of scope per PROJECT.md

</deferred>

<open_questions>
## Resolved Open Questions

**Q: Does the Phase 1 UI-SPEC "Template A" palette (green/orange) apply to customer pages?**
A: No. The user's phase brief explicitly sets the demo palette (blue/green/purple + ink/cream) as the visual contract for Phase 2 customer surfaces. Template A remains the reference for admin internals. See D2-01.

**Q: Does the cart require the user to be signed in?**
A: No — Phase 2 cart is open to all. Auth gate is at checkout in Phase 3. See D2-22.

**Q: What "how it's made" copy goes on product pages?**
A: A shared, fixed paragraph (same on every product) written into the component — no DB field. Exact wording is Claude's discretion but should match the warm, ninja-themed tone (e.g., "Each piece is printed to order on our KL printers using food-safe PLA…"). See D2-13.

**Q: What happens when the admin deletes a product the user already has in their cart?**
A: Phase 2 does not attempt cart reconciliation — the stale line item will 404 at checkout time. This is acceptable; Phase 3 can add a pre-checkout validation step if needed.

**Q: Is there a "Remove" button in the drawer or only on the full cart page?**
A: Both surfaces expose increment, decrement (which removes at 0), and an explicit X/trash icon to remove. See D2-19, D2-20.

**Q: Does the size selector need to handle the case where a product has no variants?**
A: Phase 1 productSchema requires min 1 variant, so every active product must have at least one. If somehow encountered, the product detail page should render a read-only "currently unavailable" state and disable Add to bag. Edge case only.

</open_questions>

---

*Phase: 02-storefront-cart*
*Context gathered: 2026-04-16*
