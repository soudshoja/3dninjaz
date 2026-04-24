---
title: What's new — April 2026
category: Guide
tags: [changelog, new, updates, april-2026]
order: 2
---

# What's new — April 2026

A summary of everything added or improved in April 2026. No action is required unless noted.

---

## Products & Variants — complete redesign

The old fixed Small / Medium / Large size fields have been replaced by a fully flexible **options and variants** system.

**What this means for you:**
- Each product can now have up to 6 option types: Size, Color, Part, Material, Finish, Style
- Each option has its own ordered list of values (e.g. S / M / L, Red / Blue, Head / Arm)
- Click **Generate Variant Matrix** to auto-create all combinations
- Every variant has its own price, sale price (with schedule), stock, SKU, image, and shipping weight
- Existing products were migrated — your old sizes are now variants

**New variant features:**
- **Sale price scheduling** — set a start and end date for a discount; it activates and expires automatically
- **Pre-order toggle** — keeps an out-of-stock variant purchasable with a "Pre-order" badge on the product page
- **Per-variant weight** — overrides the product-level weight for Delyva courier quotes
- **Hover preview** — hovering a variant pill on the product page previews that variant's image
- **Single default variant** — one variant per product is marked as default and shown pre-selected

Manage variants at: `/admin/products/<id>/variants`

See: [Options, values, and variants](/admin/guide/products/variants-sizes)

---

## Shipping — courier whitelist and PARCEL fix

- **Courier whitelist** — only 12 approved couriers (Ninja Van, J&T, SPX, City-Link, Pos Laju, SF International, and variants) appear at checkout. Unknown couriers are filtered out automatically.
- **PARCEL type enforced** — previous "PACKAGE" type routed to Grab-only and returned zero standard couriers. The store now always uses PARCEL; any legacy PACKAGE setting is corrected automatically.
- **30 kg cap** — orders exceeding 30 kg show a clear error at checkout rather than a silent failure.
- **Duplicate webhook handling** — Delyva occasionally resends status webhooks; duplicates are silently ignored.

See: [How shipping works — Delyva auto-rates](/admin/guide/shipping/delyva-overview)

---

## Checkout — address validation improvements

Customers must now fill in all required address fields (name, phone, street, city, state, 5-digit postcode) before the courier list loads. Each missing field is highlighted individually. The **Pay Now** button is disabled with a clear reason message until both address and courier are selected.

This reduces failed orders caused by incomplete addresses.

---

## Email subscribers

- Footer newsletter signup form live on the storefront
- Public unsubscribe link in every newsletter email (`/unsubscribed` confirmation page)
- Admin subscriber list with filter tabs (Active / Unsubscribed / Bounced / All)
- CSV export from any filter view
- Manual unsubscribe override from the admin panel

Manage at: `/admin/subscribers`

See: [Email subscribers — exporting and managing](/admin/guide/customers/subscribers)

---

## Brand colours updated

The store's colour palette was updated for consistency across all pages:

| Colour | Hex |
|--------|-----|
| Blue | `#1151bf` |
| Green | `#50c878` |
| Purple | `#743089` |
| Ink (dark) | `#0B1020` |
| Cream (background) | `#F7FAF4` |

These colours are applied automatically — no action needed.

---

## Security

- All admin actions are protected by a server-side `requireAdmin()` check as the very first step. This means even if someone bypasses the login page, they cannot perform admin actions.
- Cross-origin form submissions are blocked unless the origin is on the approved list. If you ever move the store to a new domain, let your developer know so the domain is added before switching over.
- To rotate the admin password: ask your developer to run the password reset script (`ADMIN_RESET_PASSWORD=1 npx tsx scripts/seed-admin.ts`).

See: [Security and access](/admin/guide/operations/security)
