---
phase: 05
plan: 04
status: complete
subsystem: inventory + store-settings + shipping
tags: [inventory, settings, shipping, cache, paypal-integration]
dependency_graph:
  requires: [05-01]
  provides:
    - "/admin/inventory variant toggle queue"
    - "/admin/settings DB-backed business config (replaces business-info.ts)"
    - "/admin/shipping per-state flat rates + free-ship threshold"
    - "Storefront sold-out treatment (card overlay + sold-out chip)"
    - "src/actions/admin-shipping.ts getShippingRate (customer-safe)"
    - "src/lib/store-settings.ts cached singleton accessor"
tech_stack:
  added: []
  patterns:
    - "Module-global cache (60s TTL) for singleton settings"
    - "Server-side re-check of inStock at order create (defense vs stale bag)"
    - "Lazy seed on first read (store_settings + shipping_rates)"
key_files:
  created:
    - src/actions/admin-inventory.ts
    - src/actions/admin-settings.ts
    - src/actions/admin-shipping.ts
    - src/lib/store-settings.ts
    - src/app/(admin)/admin/inventory/page.tsx
    - src/app/(admin)/admin/settings/page.tsx
    - src/app/(admin)/admin/shipping/page.tsx
    - src/components/admin/variant-stock-toggle.tsx
    - src/components/admin/settings-form.tsx
    - src/components/admin/shipping-rates-form.tsx
    - src/components/store/sold-out-badge.tsx
  modified:
    - src/actions/paypal.ts
    - src/components/admin/sidebar-nav.tsx
    - src/app/(admin)/layout.tsx
    - src/components/store/product-card.tsx
    - src/components/store/product-detail.tsx
    - src/components/store/size-selector.tsx
decisions:
  - "Inventory toggle UI lives at /admin/inventory rather than inline on /admin/products to avoid risky product-form refactor; product-form unchanged (back-compat)."
  - "VariantStockToggle uses optimistic UI with rollback (immediate switch, server confirms) — preserves admin productivity."
  - "Q-05-06 — low-stock threshold is a free-text int field per variant; no email alerts in v1, the operator reads /admin/inventory rows."
  - "business-info.ts kept as-is (deprecated note already on file). Storefront pages still import BUSINESS const; future Phase 6+ will migrate readers to getStoreSettingsCached(). Phase 5 only persists the settings + offers a cached accessor."
  - "Shipping rates table seeded with 16 MY states at 0.00 by Plan 05-01 migration script; admin can edit. Free-ship threshold lives on store_settings (single source of truth)."
metrics:
  duration: ~40 min
  completed: 2026-04-19
---

# Phase 5 Plan 05-04: Inventory + Store Settings + Shipping Rates Summary

**One-liner:** Admin can flip variant inventory at `/admin/inventory`, edit business settings + SST + free-ship threshold at `/admin/settings`, and configure 16 per-state flat shipping rates at `/admin/shipping` — all DB-backed with a 60s in-memory cache, and storefront PDPs/cards/checkout wire through automatically.

## Inventory (ADM-15, INV-01, INV-02)

- `toggleVariantStock(variantId, inStock)` — flips `product_variants.in_stock`, revalidates `/admin/products`, `/shop`, and `/products/[slug]`.
- `setLowStockThreshold(variantId, n|null)` — admin alert field; not a quantity counter.
- `<VariantStockToggle>` — optimistic switch + rollback on server error; threshold input on blur.
- `/admin/inventory` page — flat list of every variant, joined to product, sorted by name+size.
- **Storefront wiring**:
  - `<SoldOutBadge>` — absolute overlay component reused on cards.
  - `<ProductCard>` — when `variants.every(!inStock)`, overlay shows.
  - `<SizeSelector>` — sold-out chips greyed (`#f1f5f9` bg, `#94a3b8` text), `disabled` + `aria-disabled`, label flips to "Sold out".
  - `paypal.ts` `createPayPalOrder` — refuses orders with sold-out variants (T-05-04-tampering: cart could be stale).

## Store settings (ADM-09, SETTINGS-01)

- `src/lib/store-settings.ts` — `getStoreSettingsCached()` reads singleton row (id='default'), lazy-seeds on first call, caches in module-global for 60s.
- `src/actions/admin-settings.ts`:
  - `getStoreSettings()` — admin wrapper around the cached accessor.
  - `updateStoreSettings(formData)` — Zod-validated, writes, invalidates cache, revalidates `/`, `/about`, `/contact`, `/privacy`, `/terms` layouts.
  - `invalidateSettingsCache()` — manual cache bust hook.
- `<SettingsForm>` — fields for businessName, contactEmail, whatsappNumber/Display (digits-only regex), instagramUrl/tiktokUrl (URL or `#`), bannerText/Enabled, freeShipThreshold (decimal), sstEnabled (default false per Phase 4 D-03), sstRate (default 6.00).
- Submit shows green confirm pill on success; tap targets ≥ 48px.

## Shipping rates (ADM-13, SHIP-01)

- `src/actions/admin-shipping.ts`:
  - `listShippingRates()` — lazy-seeds 16 MY state rows at 0.00 if table empty, returns sorted by `MALAYSIAN_STATES` tuple order.
  - `updateShippingRates(entries)` — Zod-validates each, runs all UPDATEs in a single transaction; revalidates `/admin/shipping` + `/checkout`.
  - `getShippingRate(state, subtotal)` — **customer-safe**, no requireAdmin; returns `{ cost: 0, freeShipApplied: true }` when subtotal ≥ threshold, otherwise the per-state flat rate. Defensive 0.00 fallback if state not found.
- `<ShippingRatesForm>` — 16 state inputs in 2-col grid + free-ship threshold field. Submits rates first, then threshold (via `updateStoreSettings`); error path is granular.
- **Checkout wiring**: `paypal.ts` `createPayPalOrder` calls `getShippingRate(addr.data.state, subtotal)`, passes the shipping breakdown to PayPal, includes shipping in `orders.shippingCost` and the totalAmount sent to PayPal. Replaces the v1 hard-coded `"0.00"`.

## Sidebar + mobile nav

Inventory chip added to both `<SidebarNav>` (desktop, with Boxes icon) and the mobile chip strip in `(admin)/layout.tsx`. Nav now has 12 entries; mobile strip scrolls horizontally per existing pattern.

## Threat mitigations engaged

| Threat | Mitigation |
|---|---|
| T-05-04-EoP | `requireAdmin()` first await in every admin action |
| T-05-04-tampering | `getShippingRate` computes server-side; sold-out variant rejected at order create |
| T-05-04-injection | Zod regex on whatsapp digits, URL fields, decimal amounts |
| T-05-04-cache-staleness | 60s TTL accepted; invalidates on every write |
| T-05-04-multi-instance | Accepted for v1 single-instance deploy; future Redis swap if scaled |
| T-05-04-inventory-tamper | `paypal.ts` server-side `inStock=false` rejection |

## Mobile validation notes

- `/admin/inventory` table inside `min-w-[820px] overflow-x-auto` card → page never scrolls horizontally.
- `<VariantStockToggle>` stacks switch above threshold input on `<sm`, side-by-side on `>=sm`.
- `<SettingsForm>` fields are full-width; `<ShippingRatesForm>` 16 rate inputs collapse from 2-col to 1-col on `<sm`.
- Save button is `sticky bottom-4` on the shipping form so 16-row saves are reachable without scrolling to the page bottom.

## Coordination with Phase 6

Phase 6 06-03 added `<AddressPicker>` for saved addresses; Phase 5 added shipping cost lookup. Both compose: AddressPicker writes the state into the form, then on submit the server action calls `getShippingRate(state, subtotal)`. No conflicts.

## Self-Check: PASSED

- ✅ All 11 created files exist (commit 8d67cfe)
- ✅ /admin/inventory, /admin/settings, /admin/shipping pages render
- ✅ Storefront ProductCard + SizeSelector honour inStock=false
- ✅ paypal.ts uses getShippingRate (no more hardcoded "0.00")
- ✅ Sidebar + mobile chip strip include Inventory + Settings + Shipping
- ✅ tsc --noEmit clean
