---
phase: 03-checkout-orders
plan: 04
status: complete
subsystem: admin-order-management
tags: [admin, orders, state-machine, drizzle, mariadb, cve-2025-29927]
requires:
  - Phase 1 admin scaffold — `(admin)/layout.tsx`, `src/lib/auth-helpers.ts` (`requireAdmin`), admin sidebar-nav
  - Plan 03-01 — `orders` + `order_items` schema, `assertValidTransition`, `nextAllowedStatuses`, `formatOrderNumber`, `orderStatusValues`
  - `src/lib/brand.ts` (5-color palette), `src/lib/format.ts` (`formatMYR`)
provides:
  - Admin-only server actions at `src/actions/admin-orders.ts` — `listAdminOrders`, `getAdminOrder`, `updateOrderStatus`, `updateOrderNotes`
  - `/admin/orders` list with status filter and horizontally-scrollable table
  - `/admin/orders/[id]` detail with customer/address/timeline/items/status form/notes form
  - `AdminOrderStatusBadge`, `AdminOrderTimeline`, `AdminOrderRow`, `AdminOrderFilter`, `AdminOrderStatusForm`, `AdminOrderNotesForm`
  - Mobile nav strip in `(admin)/layout.tsx` so Dashboard/Products/Categories/Orders are reachable below 768px
affects:
  - Closes ADM-05 (admin order list) and ADM-06 (admin status transitions)
  - `revalidatePath("/orders/[id]")` from `updateOrderStatus` triggers customer-side re-render when Plan 03-03's `/orders` route is live
tech-stack:
  added: []
  patterns:
    - "Handler-level requireAdmin() FIRST in every admin server action (CVE-2025-29927 mitigation, T-03-30)"
    - "Server-side state-machine re-validation via assertValidTransition — client-forged transitions rejected"
    - "Duplicated admin-side components (no shared /components/orders/*) to avoid collisions with parallel plan 03-03"
    - "Manual .select/.leftJoin/IN-query hydration (MariaDB 10.11 rejects db.query.with LATERAL joins)"
    - "Table scrolls horizontally INSIDE its card; page never scrolls sideways (D3-20)"
key-files:
  created:
    - src/actions/admin-orders.ts
    - src/app/(admin)/admin/orders/page.tsx
    - src/app/(admin)/admin/orders/[id]/page.tsx
    - src/components/admin/admin-order-filter.tsx
    - src/components/admin/admin-order-notes-form.tsx
    - src/components/admin/admin-order-row.tsx
    - src/components/admin/admin-order-status-badge.tsx
    - src/components/admin/admin-order-status-form.tsx
    - src/components/admin/admin-order-timeline.tsx
    - .planning/phases/03-checkout-orders/03-04-SUMMARY.md
  modified:
    - src/app/(admin)/layout.tsx
    - src/components/admin/sidebar-nav.tsx
decisions:
  - Duplicated admin-side badge + timeline inside `src/components/admin/` rather than importing from a shared `src/components/orders/*` because the parallel plan 03-03 owns that directory and it did not exist at commit time. Admin owns its UI; coupling to customer components later is optional, not required.
  - Rewrote the plan's `db.query.orders.findMany({ with: { user, items } })` pseudocode to explicit `.select().leftJoin().where()` + follow-up `IN(...)` SELECT because Phase 1 already documented MariaDB 10.11 cannot execute LATERAL joins. This mirrors `src/actions/products.ts` and `src/actions/categories.ts`.
  - Added a mobile horizontal nav strip to `(admin)/layout.tsx` — the sidebar is hidden below 768px and admin routes were otherwise unreachable on a phone. Rule 2 deviation (missing critical functionality) also satisfies the plan verifier that greps the layout for `/admin/orders`.
  - Kept `force-dynamic` on both admin pages to make sure admins always see the latest status (no stale 304 after a status write).
metrics:
  tasks_completed: 2
  duration_minutes: ~25
  commits: 2
  completed_at: 2026-04-16
---

# Phase 03 Plan 04: Admin Order Management Summary

One-liner: Admin `/admin/orders` list with status filter and `/admin/orders/[id]` detail page, driving state-machine-gated status transitions + 2000-char internal notes through `requireAdmin()`-protected server actions.

## What Was Built

### Server actions (`src/actions/admin-orders.ts`)

Four exports, every one calling `await requireAdmin()` as the first executable statement per T-03-30 (CVE-2025-29927 mitigation — middleware bypass exists):

1. **`listAdminOrders(filter = "all")`** — returns every order newest-first with `{ user, itemCount }` hydrated. Filter accepts any of the six status values or `"all"`; unknown values fall back to `"all"`. Two SELECTs: orders LEFT JOIN user (filtered), then order_items `WHERE orderId IN (...)` summed client-side for itemCount.
2. **`getAdminOrder(orderId)`** — returns a single order with joined user + all line items, or `null` if not found. Fields are explicitly projected into a strongly-typed `AdminOrderDetail` shape so callers never lean on inferred Drizzle types.
3. **`updateOrderStatus(orderId, newStatus)`** — re-reads the current status from the DB, runs `assertValidTransition(current, newStatus)` from `src/lib/orders.ts`, writes only if valid. Returns `{ ok: true }` or `{ ok: false, error }` — never throws across the server-action boundary. Revalidates `/admin/orders`, `/admin/orders/[id]`, `/orders/[id]`, and `/orders` so both admin and customer surfaces refresh.
4. **`updateOrderNotes(orderId, notes)`** — caps length at 2000 chars server-side (T-03-33). Empty string writes `NULL`. Only `/admin/orders/[id]` is revalidated since notes are admin-only.

### Admin UI (server + client components)

- **`src/app/(admin)/admin/orders/page.tsx`** — server component, `force-dynamic`. Calls `requireAdmin()` at the top (belt-and-braces even though the admin layout already redirects). Parses `?status=` against a whitelist. Renders title + count, filter-chip row, table inside an `overflow-x-auto` card so the page body never scrolls horizontally (D3-20). Empty state shown when the filter yields zero rows.
- **`src/app/(admin)/admin/orders/[id]/page.tsx`** — server component, `force-dynamic`. Calls `requireAdmin()` then `getAdminOrder(id)`, falls through to `notFound()` if missing. Six white cards: Customer (with deleted-user fallback messaging for PDPA, D3-23), Ship to, Progress, Items + totals, Update status (with PayPal IDs rendered as monospace), Internal notes form. Layout is single-column below 768px, two-column above.
- **`src/components/admin/admin-order-filter.tsx`** (client) — reads `?status=` via `useSearchParams`, renders one chip per status as a `<Link>`. Chips are `min-h-[40px]`, horizontally scrollable, and use `aria-current="page"` on the selected chip.
- **`src/components/admin/admin-order-row.tsx`** — presentational `<tr>`. Order number via `formatOrderNumber`, customer falls back from `user.email` to the `customerEmail` snapshot (D3-23 PDPA audit).
- **`src/components/admin/admin-order-status-form.tsx`** (client) — `<select>` populated from `nextAllowedStatuses(current)`. Terminal statuses (delivered, cancelled) render a "no further changes allowed" message instead of a disabled form. All tap targets ≥ 48px. Uses `useTransition` so the button stays disabled while the action runs and the message is announced via `aria-live="polite"`.
- **`src/components/admin/admin-order-notes-form.tsx`** (client) — textarea with `maxLength={2000}` (mirrors server cap), live character count, `useTransition` submit. Value is read-write only inside the `<textarea>` — never rendered as HTML anywhere (T-03-33).
- **`src/components/admin/admin-order-status-badge.tsx`** — color-coded pill using the unified 5-token palette: pending→purple, paid/processing→blue, shipped/delivered→green, cancelled→ink. Includes `aria-label` for assistive tech.
- **`src/components/admin/admin-order-timeline.tsx`** — four-stage progress strip (ordered → processing → shipped → delivered) with filled/hollow dots. Cancelled renders a dedicated "This order is cancelled." badge instead of the progress strip.

### Admin chrome touch-ups

- Added `Orders` item to `src/components/admin/sidebar-nav.tsx` with the `Receipt` lucide icon (same pattern as Products/Categories). Active-state treatment is inherited.
- Added a mobile horizontal nav strip inside `(admin)/layout.tsx` mobile header (below 768px the sidebar is hidden). Four chips — Dashboard, Products, Categories, Orders — each `min-h-[40px]`. This also satisfies the plan verifier that greps the layout file for `/admin/orders`.

## Verification Performed

- `npx tsc --noEmit` — zero errors after both Task 1 and Task 2 writes.
- Task 1 verifier (inline node script from PLAN) — passes: every exported action includes `"use server"` at file head and `requireAdmin()` FIRST; `assertValidTransition` + `revalidatePath` present; 2000-char notes cap present.
- Task 2 verifier — passes: all six UI files exist; list page includes `requireAdmin()`, `listAdminOrders`, `AdminOrderFilter`, `AdminOrderRow`, `force-dynamic`, `overflow-x-auto`; detail page includes `requireAdmin()`, `getAdminOrder`, `notFound()`, `AdminOrderStatusForm`, `AdminOrderNotesForm`, and a `Timeline` component reference; status form includes `updateOrderStatus`, `nextAllowedStatuses`, `min-h-[48px]`, `useTransition`; notes form includes `updateOrderNotes`, `maxLength={2000}`, `useTransition`; filter includes `useSearchParams`, `usePathname`, `whitespace-nowrap`, `aria-current`; admin layout contains `/admin/orders`.
- Git log — two atomic commits in order, no intermixed files belonging to other executors.
- Post-commit deletion check — `git diff --diff-filter=D HEAD~2 HEAD` returns empty: no files deleted.
- Smoke test `curl -sI http://localhost:3001/admin/orders` and :3000 — **skipped** because the local dev server was not running during this parallel execution window (manual browser smoke documented as required post-merge).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan pseudocode used `db.query.orders.findMany({ with: { user, items } })` which MariaDB 10.11 rejects**
- **Found during:** Task 1 (while drafting reads).
- **Issue:** Drizzle's relational `with:` clause emits LATERAL joins. Phase 1 summary + `src/lib/catalog.ts` comment document that MariaDB 10.11 does not support LATERAL, and the existing actions in `src/actions/products.ts` already use manual hydration. Following the plan's pseudocode verbatim would ship a runtime error on the first admin request.
- **Fix:** Rewrote `listAdminOrders` and `getAdminOrder` as `.select(...).leftJoin(user, eq(orders.userId, user.id))` with an explicit column map, then a follow-up `IN(...)` SELECT on `order_items` to compute `itemCount`. Mirrors the patterns in `src/actions/products.ts`. Strongly-typed return shapes (`AdminOrderListRow`, `AdminOrderDetail`) keep call sites stable.
- **Files modified:** `src/actions/admin-orders.ts`.
- **Commit:** `4eb79bd`.

**2. [Rule 3 - Blocking] Plan detail page imported `OrderTimeline` from `@/components/orders/order-timeline` which does not exist**
- **Found during:** Task 2 (building detail page).
- **Issue:** `src/components/orders/` is owned by the parallel plan 03-03 and does not exist at commit time. The plan's `<OrderTimeline status={row.status} />` reference would have produced a module-not-found error. Importing from the not-yet-committed path would also create a tight coupling that block-releases 03-04 whenever 03-03 reshapes its component API.
- **Fix:** Created `src/components/admin/admin-order-timeline.tsx` (inlined four-stage progress strip with a dedicated cancelled-terminal variant). Admin owns its own UI — as explicitly permitted by the orchestrator's dependency-override note ("duplicate approach to avoid blocking on 03-03").
- **Files modified:** `src/components/admin/admin-order-timeline.tsx`, `src/app/(admin)/admin/orders/[id]/page.tsx`.
- **Commit:** `6df968d`.

**3. [Rule 2 - Missing critical functionality] Admin mobile layout had no nav strip — routes unreachable below 768px**
- **Found during:** Task 2 (reviewing `(admin)/layout.tsx` to satisfy the plan verifier).
- **Issue:** The mobile header (md:hidden) only rendered a logo link to `/admin` — no path to `/admin/products`, `/admin/categories`, or the new `/admin/orders`. A phone admin could not navigate at all. Plan D3-20 also mandates mobile-responsive admin surfaces. This gap pre-existed Plan 03-04 but became visible because the plan's verifier insists the layout file itself references `/admin/orders`.
- **Fix:** Added a horizontal four-chip nav strip (Dashboard, Products, Categories, Orders) inside the existing mobile header. All chips are ≥ 40px tall, horizontally scrollable on narrow phones, and visually consistent with the filter chips on `/admin/orders`.
- **Files modified:** `src/app/(admin)/layout.tsx`.
- **Commit:** `6df968d`.

**4. [Rule 2 - Missing critical functionality] Plan's status-badge import pointed at a non-existent shared component**
- **Found during:** Task 2 (building list row and detail header).
- **Issue:** The plan pseudocode imports `OrderStatusBadge` from `@/components/orders/order-status-badge` — same territorial conflict as the timeline. Duplicating is the orchestrator-approved path.
- **Fix:** Created `src/components/admin/admin-order-status-badge.tsx` using the unified 5-token palette (D3-02). Pending → purple, paid/processing → blue, shipped/delivered → green, cancelled → ink. Includes `aria-label`.
- **Files modified:** `src/components/admin/admin-order-status-badge.tsx` (new), `admin-order-row.tsx`, `admin/orders/[id]/page.tsx`.
- **Commit:** `6df968d`.

### None: rule 4 / architectural changes

None required. All deviations were automatic bug/missing-feature fixes in plan-level detail, not architectural.

## Authentication gates

None encountered — all work was static code + local DB reads. No external service call during execution.

## Mobile verification

- **Status:** NOT executed in-session because the Windows OneDrive dev-server environment was not running during this parallel window.
- **What to verify post-merge (manual, D3-20 MANDATORY):**
  1. `npm run dev` and sign in as admin (`admin@3dninjaz.com`).
  2. At 390×844 (iPhone 13) and 375×667 (iPhone SE) — `/admin/orders` shows no page-level horizontal scroll; only the table inside the card scrolls horizontally; filter chips scroll horizontally.
  3. Tap an order → detail renders single-column on mobile, two-column ≥ 768px.
  4. Status `<select>` and "Update status" button are both ≥ 48px tall.
  5. Notes textarea is usable and shows the live character count.
  6. Bare-url hit from a non-admin (customer role) to `/admin/orders` → redirected to `/login` by the admin layout; direct call to any `admin-orders.ts` action throws `Forbidden` from `requireAdmin()`.
  7. Dev-tools tamper an invalid transition (e.g. submit `cancelled` when current is `delivered`) → the server returns `"Invalid status transition: delivered -> cancelled"` and the row is NOT mutated.

## Parallel-execution coordination notes

- **03-03 parallel executor** slipped their commit `1fb020e` (feat(03-03): order-confirmation email + customer order actions) between my two commits. No file overlap: they wrote `(store)/orders/*` and customer email helpers; I wrote `(admin)/admin/orders/*` and admin-orders action.
- **04-03 parallel executor** touched `src/components/store/site-nav.tsx` and `site-footer.tsx`. No overlap with this plan.
- **Deploy executor** is mutating `next.config.ts` and production env. No overlap — I never staged `next.config.ts`.
- Per orchestrator instructions, I did **NOT** update `.planning/STATE.md` or `.planning/ROADMAP.md`. Only wrote `03-04-SUMMARY.md`.
- Pre-commit `git diff --cached --name-only` for both commits listed ONLY my plan's files. No accidental staging of another executor's in-flight work.

## Commits

- `4eb79bd` — `feat(03-04): admin-only order actions with requireAdmin + state-machine gate`
- `6df968d` — `feat(03-04): admin orders list + detail + status transitions`

## Self-Check: PASSED

- FOUND: `src/actions/admin-orders.ts`
- FOUND: `src/app/(admin)/admin/orders/page.tsx`
- FOUND: `src/app/(admin)/admin/orders/[id]/page.tsx`
- FOUND: `src/components/admin/admin-order-filter.tsx`
- FOUND: `src/components/admin/admin-order-notes-form.tsx`
- FOUND: `src/components/admin/admin-order-row.tsx`
- FOUND: `src/components/admin/admin-order-status-badge.tsx`
- FOUND: `src/components/admin/admin-order-status-form.tsx`
- FOUND: `src/components/admin/admin-order-timeline.tsx`
- FOUND commit `4eb79bd` in git log
- FOUND commit `6df968d` in git log
- Typecheck clean (`npx tsc --noEmit`).
- Task 1 and Task 2 automated verifiers both report OK.
- `requireAdmin()` is the first `await` in every exported function of `src/actions/admin-orders.ts`.
- Admin layout contains `/admin/orders`.

## Known Stubs

None. Every field on the detail page binds to a real DB column; every form writes back through a real server action; no "coming soon" placeholders or hardcoded empty arrays.

## Threat Flags

None new. This plan strictly tightens trust boundaries (`requireAdmin()` + state-machine re-validation + notes length cap) on top of the Phase 3 Plan 01 schema. No new endpoints, no new auth paths, no new file-upload or external-service surface.
