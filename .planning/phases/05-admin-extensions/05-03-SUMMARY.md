---
phase: 05
plan: 03
status: complete
subsystem: coupons (admin CRUD + customer checkout apply)
tags: [coupons, admin, checkout, paypal, atomic-redemption]
dependency_graph:
  requires: [05-01]
  provides:
    - "/admin/coupons CRUD"
    - "/checkout coupon apply"
    - "PayPal flow accepts couponCode + redeems atomically post-capture"
    - "src/lib/pricing.ts pure helpers"
tech_stack:
  added: []
  patterns:
    - "Atomic counter via UPDATE ... WHERE usage_count < usage_cap (race-safe)"
    - "PayPal customId='COUPON:CODE' to thread coupon through approval → capture without DB schema change"
    - "Pricing math in a pure function with typed CouponValidationError"
key_files:
  created:
    - src/lib/pricing.ts
    - src/actions/admin-coupons.ts
    - src/actions/coupons.ts
    - src/app/(admin)/admin/coupons/page.tsx
    - src/app/(admin)/admin/coupons/new/page.tsx
    - src/app/(admin)/admin/coupons/[id]/edit/page.tsx
    - src/components/admin/coupon-form.tsx
    - src/components/admin/coupon-row-actions.tsx
    - src/components/store/coupon-apply.tsx
  modified:
    - src/actions/paypal.ts
    - src/components/checkout/paypal-button.tsx
    - src/components/checkout/checkout-summary.tsx
    - src/components/checkout/mobile-summary-sheet.tsx
    - src/components/checkout/paypal-provider.tsx
decisions:
  - "Q-05-01: Coupon input lives ABOVE PayPal buttons inside the order summary card; discount shows as separate line; inline error messaging."
  - "PayPal customId carries the coupon code through approval → capture so we avoid adding columns to the orders table; redemption row is the audit."
  - "Redemption failure post-capture is logged, NOT rolled back — customer has already paid; coupon audit failure is the lesser evil."
metrics:
  duration: ~30 min
  completed: 2026-04-19
---

# Phase 5 Plan 05-03: Coupons Summary

**One-liner:** Admin can create/edit/deactivate/delete promo codes via `/admin/coupons` and customers apply them at `/checkout` — discount math is server-side only, atomic redemption survives concurrent checkouts under usage_cap.

## Pricing math (`src/lib/pricing.ts`)

Pure-function `applyCouponToSubtotal(subtotal, snapshot, now?)` handles every gate (active, dates, cap, min-spend, percentage cap), throws `CouponValidationError` with a `userMessage` field. Discount is capped at the subtotal so the final total is never negative. All arithmetic uses `.toFixed(2)` for MYR rounding.

## Admin CRUD (ADM-08)

| Action | Behaviour |
|---|---|
| `listCoupons` | All coupons, newest first |
| `getCoupon(id)` | Row or null |
| `createCoupon(formData)` | Zod-validated, ER_DUP_ENTRY → "Code already exists" |
| `updateCoupon(id, formData)` | **Strips `code` from payload** (T-05-03-immutable-code) |
| `deactivateCoupon` / `reactivateCoupon` | Flip `active` |
| `deleteCoupon` | **Refuses if redemptions exist** (T-05-03-delete-audit) |

Every export starts with `await requireAdmin()` (T-05-03-EoP / CVE-2025-29927).

UI: `/admin/coupons` table inside `overflow-x-auto` card; new + edit pages with `<CouponForm>`; row actions inline (Edit / Deactivate / Delete with confirmation dialog).

## Customer apply (PROMO-01, PROMO-02)

`<CouponApply>` client component renders a single-row input + Apply button. On apply it server-calls `validateCoupon(code, subtotal)`:

- Requires a session (T-05-03-enumeration — anon cannot scrape codes).
- Re-fetches the coupon row by code, recomputes the discount via `applyCouponToSubtotal`.
- On success: green pill with `CODE -RM X.XX` and a Remove button.
- On failure: inline red error.

State is lifted via `onChange` so `<CheckoutSummary>` and `<MobileSummarySheet>` can both display the discount line and the dock total reflects the discounted total.

## PayPal integration

```ts
createPayPalOrder({ address, items, couponCode? })
  // server validateCoupon → discount → totalStr = subtotal - discount
  // PayPal breakdown.discount = MYR amount (when > 0)
  // purchaseUnit.customId = "COUPON:" + code
  → { ok: true, paypalOrderId, internalOrderId, discount?, couponCode? }

capturePayPalOrder({ paypalOrderId })
  // PayPal capture
  // purchaseUnit.customId → appliedCouponCode
  // mark order paid → redeemCoupon (atomic UPDATE + audit insert)
  → { ok: true, orderId, orderNumber, redirectTo }
```

`redeemCoupon` runs inside `db.transaction` with a conditional UPDATE:

```sql
UPDATE coupons SET usage_count = usage_count + 1
WHERE id = ? AND (usage_cap IS NULL OR usage_count < usage_cap)
```

If `affectedRows === 0`, two concurrent customers raced for the last redemption — we return ok:false and log without rolling back the order (the customer already paid).

## Threat mitigations engaged

| Threat | Where |
|---|---|
| T-05-03-EoP | `requireAdmin()` first await in every admin export |
| T-05-03-tampering | Discount recomputed server-side every time; client `discount` field never read |
| T-05-03-state | Atomic conditional UPDATE inside transaction |
| T-05-03-immutable-code | `updateCoupon` strips `code` from payload |
| T-05-03-delete-audit | `deleteCoupon` blocked if redemptions exist |
| T-05-03-enumeration | `validateCoupon` requires session |
| T-05-03-MYR-math | All arithmetic via `.toFixed(2)`; discount capped at subtotal |

## Coordination with Phase 6

Phase 6 06-03 added `<AddressPicker>` to the checkout flow (saved-addresses dropdown). Phase 5 added `<CouponApply>` to the same checkout flow. Both compose cleanly — addresses live above PayPal in the form section; coupons live inside the summary card. No conflicts.

## Mobile validation

- `<CouponApply>` input + Apply button stack vertically on `< sm`, side-by-side on `>= sm`. Both ≥ 48px tap targets.
- `<CheckoutSummary>` discount line wraps on narrow widths; the green chip remains readable.
- Mobile dock total reflects the discounted total.
- `/admin/coupons` table is `min-w-[820px]` inside `overflow-x-auto` — page never scrolls horizontally.

## Self-Check: PASSED

- ✅ All 9 created files exist (commit bce6705)
- ✅ src/lib/pricing.ts exports applyCouponToSubtotal + CouponValidationError
- ✅ src/actions/admin-coupons.ts exports list/get/create/update/deactivate/reactivate/delete
- ✅ src/actions/coupons.ts exports validateCoupon + redeemCoupon
- ✅ paypal.ts threads couponCode through createOrder + customId through capture
- ✅ tsc --noEmit clean
