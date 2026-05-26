---
phase: quick-260526-iw4
plan: "01"
subsystem: pos
tags: [pos, customer-records, user-attribution, phone-search]
dependency_graph:
  requires: []
  provides: [POS customer user rows, POS order attribution to customer, phone-based customer search]
  affects: [admin-pos.ts, /admin/users, /admin/orders, getPosCustomerSearch]
tech_stack:
  added: []
  patterns: [find-or-create inside transaction, ER_DUP_ENTRY race, manual multi-query hydration (no LATERAL)]
key_files:
  created: []
  modified:
    - src/actions/admin-pos.ts
decisions:
  - "resolvePosCustomerId runs inside the existing db.transaction so it rolls back atomically with the order"
  - "Phone match goes via orders.shippingPhone (user table has no phone column) — locked decision"
  - "No account row created for POS customers — they can log in after a password reset"
  - "Admin-exclusion guard (ne user.id adminUserId) applied on all find paths, including ER_DUP_ENTRY re-select"
  - "getPosCustomerSearch phone query always runs unconditionally (not gated on name/email result count)"
metrics:
  duration: "~25 min"
  completed: "2026-05-26"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 1
---

# Phase quick-260526-iw4 Plan 01: POS Creates and Links Customer Records Summary

**One-liner:** POS orders now find-or-create a real customer `user` row and attribute `orders.userId` (and coupon redemption) to that customer — not the admin — with phone-based search for walk-ins who skipped email entry.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add resolvePosCustomerId + fix createPosOrder attribution | b726840 | src/actions/admin-pos.ts |
| 2 | Widen getPosCustomerSearch to match on phone | 9edffc6 | src/actions/admin-pos.ts |

## What Was Built

### Task 1: resolvePosCustomerId

New module-scoped helper added to `src/actions/admin-pos.ts`. Runs as the first statement inside the `db.transaction` callback in `createPosOrder`.

Resolution ladder:
1. **find-by-email** (when `customerEmail` is not a sentinel): `SELECT user.id WHERE email = trimmedEmail AND user.id != adminUserId LIMIT 1`. Admin-exclusion guard ensures that even if the operator types the admin's own email, the admin row is skipped and a new customer row is created.
2. **find-by-phone-via-orders** (only when email is a sentinel): `SELECT orders.userId WHERE shippingPhone = phone ORDER BY createdAt DESC LIMIT 1`; skips `adminUserId` to ignore legacy admin-attributed rows.
3. **create-new**: `INSERT user { id: randomUUID(), name, email, emailVerified: false, role: "customer", createdAt, updatedAt }`. No `account` row.
4. **ER_DUP_ENTRY race**: re-SELECT with same admin guard. If re-select returns nothing (collision against admin's own email row) → throws a clear human-readable error.

`createPosOrder` changes:
- `userId: session.user.id` → `userId: customerUserId`
- `redeemCoupon(..., session.user.id, ...)` → `redeemCoupon(..., customerUserId, ...)`
- Stale TODO comment removed from `getPosCustomerSearch` doc block.

### Task 2: getPosCustomerSearch phone matching

Restructured `getPosCustomerSearch`:
- Old early-exit guard `if (userRows.length === 0) return []` that ran before any phone query is **removed**.
- Phone-candidate query (`orders.shippingPhone LIKE %query%`) now always runs unconditionally.
- Union of name/email user-ids and phone-derived user-ids built in memory; deduped.
- Full user rows fetched for phone-only candidates with `ne(user.role, "admin")` filter.
- Final `return []` only fires after both candidate sources are consulted and the union is empty.
- Result cap: 15; name/email matches first for deterministic order.
- `PosCustomerResult` shape unchanged — no client-side changes needed.

## Verify Scenarios

**(a) New email creates 1 user row and attributes order to it (not admin)**
- `resolvePosCustomerId` step 1 does a guarded find-by-email; no existing row → step 3 inserts with `randomUUID()`. `orders.userId = customerUserId`. Admin id never appears on the order. SATISFIED.

**(b) Same email on second order reuses existing user row (no duplicate)**
- step 1 finds the previously-created row by email (with admin guard). Returns its id. No INSERT. Both orders share one `userId`. SATISFIED.

**(c) No-email order whose phone matches a prior order's shippingPhone reuses that userId**
- Sentinel email computed → step 1 skipped. Step 2 queries `orders.shippingPhone = phone ORDER BY createdAt DESC LIMIT 1`. Returns prior customer's userId. SATISFIED.

**(d) Admin's own user id never appears as orders.userId; admin never in customer list**
- Step 1 guard: `ne(user.id, adminUserId)` excludes the admin row from find-by-email. Step 2 guard: `phoneOrder.userId !== adminUserId` skips legacy admin-attributed orders. `getPosCustomerSearch` filters `ne(user.role, "admin")` on both name/email and phone-only candidate fetches. SATISFIED.

**(e) Customer email typed as admin's own email → order NOT attributed to admin**
- Step 1: `and(eq(user.email, adminEmail), ne(user.id, adminUserId))` returns 0 rows (admin row excluded). Falls to step 3: creates a new customer row with that email. If the admin already owns that unique email, the INSERT hits ER_DUP_ENTRY; re-select also returns 0 rows (same admin guard) → throws descriptive error rather than silently attributing to admin. SATISFIED.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `src/actions/admin-pos.ts` modified (confirmed by commits b726840, 9edffc6)
- [x] `resolvePosCustomerId` exists and is called as first statement inside `db.transaction`
- [x] `orders.userId: customerUserId` present
- [x] `redeemCoupon(..., customerUserId, ...)` present
- [x] `ne(user.id, adminUserId)` guard on find-by-email
- [x] ER_DUP_ENTRY re-select path with same admin guard
- [x] Stale TODO removed
- [x] Early-exit guard before phone query removed
- [x] Phone-candidate query runs unconditionally
- [x] Union + admin filter + empty-union early-return correct
- [x] `npx tsc --noEmit` clean after each task (both passed with no output)

## Self-Check: PASSED
