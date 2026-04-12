# Print Ninjaz

## What This Is

Print Ninjaz is a B2C e-commerce store for 3D printed products, targeting customers in Malaysia. Customers browse pre-made 3D printed products uploaded by the admin, select size (Small/Medium/Large), create an account, and purchase via PayPal. The store follows a basic Shopify-style concept — simple product listings, cart, and checkout. AI-powered custom 3D generation (via Meshy API) is planned for a future milestone.

## Core Value

Customers can easily browse and buy unique 3D printed products with a simple, clean shopping experience.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Admin can upload and manage products (name, description, images, price, sizes)
- [ ] Customers can browse product catalog
- [ ] Customers can view individual product details
- [ ] Customers can create an account and log in
- [ ] Customers can add products to cart with size selection (S/M/L)
- [ ] Customers can checkout and pay via PayPal
- [ ] Customers receive order confirmation
- [ ] Admin can view and manage orders
- [ ] Store uses Print Ninjaz branding (ninja theme, green/blue/black colors)

### Out of Scope

- AI-powered custom 3D generation (Meshy API) — deferred to milestone 2
- 3D model viewer on product pages — not needed for basic store
- Delivery/shipping integration — to be decided later
- Multi-language (Malay/Chinese) — English first for v1
- Inventory tracking — manual management for v1
- Customer reviews/ratings — not needed for launch

## Context

- **Target market:** Malaysia, local delivery
- **Brand:** Print Ninjaz — ninja-themed with 3D printer imagery, green/blue/black color scheme
- **Logo:** Available at `logo.jpeg` in project root
- **Tech stack:** Next.js (React) for frontend and API routes
- **Payment:** PayPal (skill file available)
- **3D printing backend:** Meshy API skill installed for future AI generation features
- **Products:** Admin uploads pre-designed 3D printed items with photos
- **Pricing:** Simple size-based tiers (Small/Medium/Large) per product

## Constraints

- **Tech stack**: Next.js (React) — chosen by team
- **Payment**: PayPal — skill file available for integration
- **Market**: Malaysia first — English language, local delivery
- **Scope**: Basic Shopify-style store — no complex features for v1
- **Auth**: Account required for purchases — no guest checkout

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js over Laravel | Modern React framework, good for interactive stores | — Pending |
| Store-first, AI later | Ship a working product before adding complex AI features | — Pending |
| Account required | Track orders, enable future features like order history | — Pending |
| PayPal for payments | Skill already available, works in Malaysia | — Pending |
| Simple size tiers (S/M/L) | Keep pricing and options simple for v1 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-12 after initialization*
