---
phase: 06-customer-account
plan: 03
subsystem: addresses-checkout
tags: [account, addresses, checkout, paypal, mariadb, transactions]
requires:
  - "Phase 6 06-01 (addresses table, addressBookSchema, requireUser)"
  - "Phase 6 06-02 (account layout shell)"
  - "Phase 3 03-02 (existing AddressForm + orderAddressSchema)"
provides:
  - "/account/addresses (list, new, edit) — full CRUD"
  - "src/actions/addresses.ts (listMyAddresses, getMyAddress, createAddress, updateAddress, deleteAddress, setDefaultAddress)"
  - "AddressPicker component for /checkout"
  - "AddressForm extended with savedAddresses prop (zero-regression to Phase 3)"
affects:
  - src/app/(store)/account/addresses/page.tsx
  - src/app/(store)/account/addresses/new/page.tsx
  - src/app/(store)/account/addresses/[id]/edit/page.tsx
  - src/app/(store)/checkout/page.tsx
  - src/actions/addresses.ts
  - src/components/account/{address-card,address-form}.tsx
  - src/components/checkout/{address-picker,address-form,paypal-provider}.tsx
tech-stack:
  added: []
  patterns:
    - "Ownership predicate (`eq(addresses.userId, session.user.id)`) baked into every WHERE clause — no separate ownership SELECT (T-06-03-IDOR closed without TOCTOU window)"
    - "db.transaction wraps default-flip + insert/update so the 'one default per user' invariant cannot be broken (MariaDB has no clean partial unique index)"
    - "Address-cap enforced via count() before insert (10 max per user, 06-CONTEXT Assumption 8)"
    - "Field-name adapter (fullName -> recipientName, line1 -> addressLine1) in AddressForm for orderAddressSchema compatibility"
    - "Mode-switching (saved | new) in AddressForm: hidden form via Tailwind `hidden` class when picker drives the address; useEffect bypasses form-state when mode='saved'"
key-files:
  created:
    - src/actions/addresses.ts
    - src/app/(store)/account/addresses/page.tsx
    - src/app/(store)/account/addresses/new/page.tsx
    - src/app/(store)/account/addresses/[id]/edit/page.tsx
    - src/components/account/address-card.tsx
    - src/components/account/address-form.tsx
    - src/components/checkout/address-picker.tsx
  modified:
    - src/components/checkout/address-form.tsx (savedAddresses prop, picker integration, adapter, mode switch)
    - src/components/checkout/paypal-provider.tsx (forwards savedAddresses)
    - src/app/(store)/checkout/page.tsx (fetches savedAddresses server-side)
decisions:
  - "Used `z.input + z.output + z.output` triple-generic on react-hook-form to avoid the same Resolver type mismatch Phase 3 03-02 hit"
  - "AddressCard delete uses native window.confirm() — matches the existing admin-side delete pattern; no shadcn AlertDialog dep added in v1"
  - "Mode-switch in checkout AddressForm uses `display: none` (className `hidden`) on the form fields, so the form keeps its react-hook-form state instead of remounting (avoids losing typed values when toggling between picked addresses and 'use new')"
metrics:
  duration_minutes: 18
  tasks_completed: 2
  files_created: 7
  files_modified: 3
  completed_date: 2026-04-19
---

# Phase 6 Plan 03: Saved Addresses + Checkout Integration Summary

CUST-03 closes. Customer manages a personal shipping address book; checkout offers a one-click pick of saved addresses without breaking the original Phase 3 zero-saved flow.

## What shipped

- **`/account/addresses` (list)** — empty state CTA + grid of AddressCards. Default badge (purple) + Edit / Set as default / Delete row.
- **`/account/addresses/new`** — full create form with addressBookSchema validation
- **`/account/addresses/[id]/edit`** — ownership-gated edit form; notFound() for both missing AND not-yours ids (enumeration block)
- **`src/actions/addresses.ts`** — 6 server actions, every export starts with `await requireUser()`, every WHERE clause carries the ownership predicate
- **AddressPicker** — radio list + "Use a new address" option; auto-selects the default; tap targets ≥48px
- **AddressForm extension** — `savedAddresses?: SavedAddress[]` prop; when present + non-empty, renders picker above + adapts saved entries to orderAddressSchema shape (fullName -> recipientName, line1 -> addressLine1, etc); when empty, picker returns null and the form behaves exactly as in Phase 3 03-02 (zero regression)

## Mode-switch flow

When user selects a saved address from the picker:
1. Picker calls `onSelect(savedAddress)` 
2. AddressForm sets `mode = "saved"`, captures the adapted address in `pickedAddress` state
3. The inline form fields are visually hidden (`className="hidden"`)
4. The useEffect that emits to `onValidChange` bypasses form state and emits `pickedAddress` directly
5. PayPal button receives a valid address and enables

When user picks "Use a new address":
1. Picker calls `onUseNew()`
2. AddressForm sets `mode = "new"`, clears `pickedAddress`
3. Form fields become visible; `formState.isValid` drives `onValidChange`
4. PayPal button waits for the form to be valid

## Threat mitigations applied

| Threat ID                | Mitigation                                                                |
| ------------------------ | ------------------------------------------------------------------------- |
| T-06-03-auth             | requireUser() FIRST await on all 6 server actions                         |
| T-06-03-IDOR             | Ownership predicate in every WHERE clause; no separate ownership SELECT   |
| T-06-03-enumeration      | getMyAddress returns null for both missing AND not-yours; page notFound() |
| T-06-03-integrity        | db.transaction wraps default-flip + insert/update                         |
| T-06-03-cap              | count() before insert; reject 11th with friendly error                    |
| T-06-03-stale-form       | Mode switch resets mode + pickedAddress; useEffect picks the right source |
| T-06-03-regression       | Zero saved -> picker returns null -> existing form unchanged              |
| T-06-03-XSS              | All address output via React JSX — auto-escaped                           |

## MariaDB observations

- `db.transaction` with two updates inside (clear default + set default) works exactly as expected on MariaDB 10.11 via mysql2.
- `count()` returns a string (not a number) on mysql2 — already handled with `Number(c)` cast.
- No LATERAL join issues here because all queries are simple SELECTs scoped by userId; no relational hydration needed.

## Deviations from Plan

None. Schema, validators, and helpers from 06-01 + 06-02 fit cleanly. The plan's z.input/z.output triple-generic Resolver pattern was needed (same Phase 3 03-02 issue) — Rule 3 fix, no architectural change.

## Verification

- `npx tsc --noEmit` — clean
- 7 new files; 3 modified
- Addresses route tree: `/account/addresses`, `/account/addresses/new`, `/account/addresses/[id]/edit` — all auth-gated by the parent `/account` layout
- Checkout flow: zero-saved -> existing form unchanged; ≥1 saved -> picker renders, default auto-selected, "Use new" reveals form

## Self-Check: PASSED

- FOUND: src/actions/addresses.ts (listMyAddresses, getMyAddress, createAddress, updateAddress, deleteAddress, setDefaultAddress + SavedAddress type)
- FOUND: src/app/(store)/account/addresses/page.tsx (list + empty state)
- FOUND: src/app/(store)/account/addresses/new/page.tsx
- FOUND: src/app/(store)/account/addresses/[id]/edit/page.tsx (ownership-gated via getMyAddress + notFound)
- FOUND: src/components/account/address-card.tsx
- FOUND: src/components/account/address-form.tsx
- FOUND: src/components/checkout/address-picker.tsx
- FOUND: src/components/checkout/address-form.tsx (modified for picker)
- FOUND: src/components/checkout/paypal-provider.tsx (forwards savedAddresses)
- FOUND: src/app/(store)/checkout/page.tsx (fetches savedAddresses)
- PASSED: npx tsc --noEmit clean
