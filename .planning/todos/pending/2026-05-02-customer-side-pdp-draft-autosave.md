---
created: 2026-05-02T23:03:38.611Z
title: Customer-side PDP draft autosave
area: ui
files:
  - src/components/store/configurator-form.tsx
  - src/components/store/variant-selector.tsx
  - src/hooks/use-product-draft.ts
---

## Problem

When a customer is filling in a configurable PDP — typing a custom name, picking colours, choosing variant options — that in-progress state lives in component-local React `useState` only. If they refresh the tab, lose connection, or close and reopen the browser, all their input is wiped. They have to start over.

Cart persistence already exists via Zustand `persist` middleware (key `print-ninjaz-cart-v2`), but that only kicks in AFTER they hit "Add to Bag". Pre-cart configuration is ephemeral.

Admin already has a similar autosave for product editing (`use-product-draft.ts` + commit `e9edd4b`, 1000ms debounce → localStorage). Customer side has nothing equivalent.

Verified 2026-05-02: no `localStorage`, `sessionStorage`, or server draft endpoint covers in-progress PDP customer input.

## Solution

Build a customer-scoped variant of the admin pattern:

1. New hook `src/hooks/use-pdp-draft.ts` (mirroring `use-product-draft.ts`)
   - Signature: `usePdpDraft(productId, key)` returns `[draft, setDraft]` with 1000ms debounce
   - localStorage key: `pdp-draft:<productId>:<key>` (separate from cart store)
   - 24h TTL — older drafts are silently discarded on read

2. Wire into `src/components/store/configurator-form.tsx` — persist `values: Record<string, string>` (text/number/colour/select inputs)
3. Wire into `src/components/store/variant-selector.tsx` — persist `selected: SelectedValues`
4. Optional: small "Resume your draft?" banner on PDP mount if a stored draft exists from < 24h ago and is non-empty

Footprint: ~100 lines total. Distinct from admin draft — different localStorage namespace, different scope, different lifecycle.

Out of scope: server-side draft persistence (cross-device resume). localStorage-only is enough for v1 — covers refresh, disconnect, browser crash.
