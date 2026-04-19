# Phase 6 — Deferred Items

Out-of-scope issues discovered during Phase 6 execution. Per the executor
scope-boundary rule, these are NOT fixed in Phase 6 because they are caused
by the parallel Phase 5 work, not by anything this phase introduced.

## Phase 5 admin-shipping enum mismatch

**Discovered:** Wave 3 plan 06-06 execution
**Files:** `src/actions/admin-shipping.ts:53`

`src/actions/admin-shipping.ts` calls a function (likely `inArray` against
a MALAYSIAN_STATES enum column) using a `string` argument, but the column
type is the literal-union enum from validators.ts. tsc fails:

```
src/actions/admin-shipping.ts(53,18): error TS2345: Argument of type
  'string' is not assignable to parameter of type
  '"Johor" | "Kedah" | "Kelantan" | "Melaka" | ... | "Putrajaya"'.
```

**Why deferred:** Phase 5 (admin-shipping) is the OWNER. Phase 6 doesn't
touch admin-shipping.ts and didn't introduce this regression. Fix is
likely the same `[...MALAYSIAN_STATES]` spread pattern used in
src/actions/reviews.ts (Phase 6 06-05).

## Phase 5 coupon integration in CheckoutIsland (resolved by Phase 5 commit during Phase 6 execution)

**Discovered:** Wave 3 plan 06-05 execution
**Files:** `src/components/checkout/paypal-provider.tsx`

Phase 5's coupon work modified `src/components/checkout/checkout-summary.tsx`
to require `appliedCoupon` + `onCouponChange` props, and `MobileSummarySheet`
likewise. But the call sites inside `CheckoutIsland` still call the old
2-arg signatures.

**tsc errors:**
```
src/components/checkout/paypal-provider.tsx(125,14): error TS2739:
  Type '{ items: CartItem[]; subtotal: number; }' is missing the following
  properties from type '{ items: CartItem[]; subtotal: number; appliedCoupon:
  AppliedCoupon | null; onCouponChange: ... }': appliedCoupon, onCouponChange

src/components/checkout/paypal-provider.tsx(129,10): error TS2739:
  Type '{ subtotalMyr: number; address: ... }' is missing the following
  properties from type '{ items: CartItem[]; subtotalMyr: number; ... }':
  appliedCoupon, onCouponChange
```

**Why deferred:** Phase 5 is the OWNER of the coupon flow and the
checkout-summary integration. Phase 6 06-03 made one structural edit to
paypal-provider.tsx (forwarding `savedAddresses` to AddressForm) but that
edit is unrelated to the coupon prop signatures.

**Suggested fix (Phase 5 territory):** Phase 5's 05-03 (coupon checkout
integration) plan should either:
1. Default `appliedCoupon`/`onCouponChange` props in CheckoutSummary +
   MobileSummarySheet so existing call sites continue to compile, OR
2. Update CheckoutIsland (paypal-provider.tsx) to host the
   AppliedCoupon useState and forward both props down.

**Phase 6 verification status:** All Phase 6 source files compile cleanly
in isolation. The two remaining tsc errors live exclusively in
`src/components/checkout/paypal-provider.tsx` lines 125 and 129 — both call
sites Phase 5 should have updated when it shipped CouponApply.
