# Phase 1: Foundation - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the project scaffold (Next.js 15 + Drizzle + Neon + Better Auth), the complete database schema with per-variant pricing, user authentication with admin/customer roles, and admin product CRUD with Cloudinary image upload. After this phase, admin can manage products and users can create accounts.

</domain>

<decisions>
## Implementation Decisions

### Admin Panel Design
- **D-01:** Admin product management uses Claude's discretion for layout (table+form vs card grid — Claude picks best for small catalog)
- **D-02:** Image upload uses drag & drop zone with fallback file picker button (both methods available)
- **D-03:** Maximum 5 images per product
- **D-04:** Before building anything, generate 3 design template options using /ui-ux-pro-max for: store theme, admin dashboard layout, AND homepage layout. User picks from all three before coding begins.

### Auth Flow & Roles
- **D-05:** First admin account created via seed command (CLI: `npm run seed:admin` or similar)
- **D-06:** Login/register pages use clean centered card design with logo (Shopify-style)
- **D-07:** Single login page for both admin and customer — system redirects based on role after login
- **D-08:** Two roles: `admin` and `customer`. Admin assigned via seed, all registrations default to `customer`
- **D-09:** PDPA consent checkbox on registration form (required, stores consent timestamp)

### Product Data Model
- **D-10:** Products have simple categories (one category per product, e.g., Figurines, Phone Cases, Decor). Admin manages categories.
- **D-11:** Product fields: name, description, images (max 5), per-size pricing (S/M/L each with own price), material type, estimated production days, physical dimensions per size (for size guide), active/inactive toggle, featured flag, category
- **D-12:** Products have a `featured` boolean flag — admin can mark products to show prominently on homepage
- **D-13:** Per-variant pricing via ProductVariant table: each size (S/M/L) is a separate row with its own price and dimensions

### Claude's Discretion
- Admin panel layout style (table+form vs card grid) — Claude picks based on what works best for a small product catalog
- Specific form field ordering and grouping in product creation form
- Category management UI (inline creation vs separate page)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stack & Architecture
- `.planning/research/STACK.md` — Full technology stack with versions, rationale, and install commands
- `.planning/research/ARCHITECTURE.md` — Component boundaries, data flow, build order
- `.planning/research/PITFALLS.md` — 14 domain-specific pitfalls with prevention strategies

### Project Context
- `.planning/PROJECT.md` — Project vision, constraints, key decisions
- `.planning/REQUIREMENTS.md` — All v1 requirements with traceability
- `.planning/research/SUMMARY.md` — Research synthesis with critical decisions to lock early

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None yet — this phase establishes the foundational patterns

### Integration Points
- Neon PostgreSQL connection via Drizzle ORM
- Better Auth integration with Drizzle adapter
- Cloudinary SDK for image uploads
- Next.js 15 App Router route groups: `(store)`, `(auth)`, `(admin)`

</code_context>

<specifics>
## Specific Ideas

- **3 design templates required:** Before any coding begins, use `/ui-ux-pro-max` to generate 3 complete template options covering store theme (colors, typography, overall feel), admin dashboard layout, and customer-facing homepage layout. User selects preferred template before implementation starts.
- **Print Ninjaz branding:** Ninja-themed, green/blue/black color scheme, logo at `logo.jpeg` in project root
- **Shopify-style simplicity:** Admin and auth flows should feel clean and simple like Shopify — not complex enterprise UI
- **Malaysia context:** English language, MYR currency references where applicable

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-04-12*
