---
phase: 05
plan: 02
status: complete
subsystem: admin-users + analytics dashboard + events ingest
tags: [admin, users, analytics, recharts, events, requireAdmin]
dependency_graph:
  requires: [05-01]
  provides:
    - "/admin/users moderation surface"
    - "/admin analytics dashboard (revenue + chart + top 5 + funnel)"
    - "POST /api/events/track public ingest"
    - "AddToBagButton client-side analytics ping"
    - "src/actions/admin-reviews.ts foundation (used by sidebar badge; full UI in 05-07)"
  affects:
    - "Sidebar nav grew from 4 to 11 items"
    - "Admin layout prop-drills pendingReviewCount"
tech_stack:
  added: []  # all deps installed in 05-01
  patterns:
    - "requireAdmin() FIRST await in every server action (CVE-2025-29927 / T-05-02-EoP)"
    - "Manual hydration (no LATERAL) — admin-users joins user → orders count via inArray"
    - "sha256 IP hash for analytics (PDPA / T-05-02-PDPA)"
    - "In-memory rate limiter (100/min) for /api/events/track (T-05-02-DoS)"
key_files:
  created:
    - src/actions/admin-users.ts
    - src/actions/admin-analytics.ts
    - src/actions/admin-reviews.ts
    - src/app/(admin)/admin/users/page.tsx
    - src/app/(admin)/admin/users/user-row-actions.tsx
    - src/app/api/events/track/route.ts
    - src/components/admin/analytics-range-tabs.tsx
    - src/components/admin/analytics-revenue-chart.tsx
    - src/components/admin/analytics-funnel.tsx
    - src/components/admin/analytics-top-products.tsx
    - src/lib/analytics.ts
  modified:
    - src/app/(admin)/admin/page.tsx
    - src/app/(admin)/layout.tsx
    - src/components/admin/sidebar-nav.tsx
    - src/components/store/add-to-bag-button.tsx
decisions:
  - "Q-05-02 daily buckets for all 7d/30d/90d ranges (90 x-axis points fits Recharts cleanly)"
  - "Q-05-03 client onClick → /api/events/track endpoint (no external SaaS for v1)"
  - "Q-05-07 Better Auth banned=true; in-flight sessions die at NEXT request (acceptable; full session-kill comes via Better Auth admin plugin server-side delete in a follow-up)"
  - "Funnel uses session.userId DISTINCT count for visits; until events table is populated, checkout_started falls back to total orders count"
metrics:
  duration: ~30 min
  completed: 2026-04-19
---

# Phase 5 Plan 05-02: Admin Users + Analytics Dashboard Summary

**One-liner:** Admin can suspend/unsuspend customer accounts via `/admin/users` and watch live revenue + funnel + top-product analytics on `/admin` (replacing the Phase 1 stat-card placeholder), with client onClick instrumentation feeding a privacy-preserving `events` table via `/api/events/track`.

## What shipped

### `/admin/users` (ADM-07)

- **Server action** `listAdminUsers()` returns every non-admin user with name, email, registered date, order count, ban status. Two-query manual hydration (MariaDB 10.11 — no LATERAL): users + grouped order counts joined in memory.
- **Server action** `suspendUser(formData)` — Zod-validates payload, refuses self-suspend, refuses admin-on-admin, sets Better Auth `banned=true` + optional `banReason`. `requireAdmin()` is the first await in every export (CVE-2025-29927).
- **Server action** `unsuspendUser(userId)` — clears `banned/banReason/banExpires`.
- **Page** `/admin/users` — server component, force-dynamic, table inside `overflow-x-auto` card (D-04 mobile pattern from `/admin/orders`).
- **Client** `<UserRowActions>` — Suspend opens a 48px+ tap-target dialog with reason textarea (max 500 chars); Unsuspend is a one-click action. Uses `useTransition` + `router.refresh()`.

### `/admin` analytics dashboard (ADM-10, REPORT-01)

- **`getAnalytics(range)`** in `src/actions/admin-analytics.ts`:
  - Revenue total + paid order count via `SUM(totalAmount)` filtered by `status IN (paid|processing|shipped|delivered)`.
  - Daily-bucket revenue via `DATE(createdAt)` group, missing days zero-filled in memory so the chart shows a continuous line.
  - Top 5 products via order_items innerJoin orders, `SUM(lineTotal) DESC LIMIT 5`.
  - Funnel: visits = `COUNT(DISTINCT session.userId)` in range; addToBag/checkoutStarted from `events` table; paid = revenue order count.
- **`<AnalyticsRangeTabs>`** — client tabs (7/30/90d) update `?range=` via `useRouter().push` inside `useTransition`. 48px+ tap targets.
- **`<AnalyticsRevenueChart>`** — Recharts `<LineChart>` inside `<ResponsiveContainer>`, brand-green stroke, formatted RM ticks, custom tooltip.
- **`<AnalyticsTopProducts>`** — pure-server horizontal bar list, no Recharts dep needed.
- **`<AnalyticsFunnel>`** — pure CSS funnel, four colored bars with conversion %, instrumentation-pending hint when addToBag = 0.

### `POST /api/events/track`

- Public endpoint (no auth) with strict Zod input: `{event: page_view|add_to_bag|checkout_started, sessionId?, path?}`.
- **Rate limit** 100 req/min per IP-hash via in-memory Map. Returns 429 on overflow.
- **PDPA**: IP is `sha256(salt + ip)` hashed before insert; raw IP never reaches the DB.
- **Failure mode**: insert errors are logged but the response is still 200 — analytics ingest must never break the user's flow.
- **Wired**: `<AddToBagButton>` POSTs `{event:"add_to_bag", path}` on click (`keepalive: true` so it survives navigation).

### Sidebar + mobile nav

- `SidebarNav` grew from 4 to 11 items (Phase 5 admin extensions).
- `pendingReviewCount` is fetched server-side in `(admin)/layout.tsx` and prop-drilled to `SidebarNav` for the red badge (Plan 05-07 will surface the queue itself).
- Mobile chip strip scrolls horizontally per the existing `admin-order-filter` pattern (D-04 acceptable for ≤768px).

## Threat mitigations engaged

| Threat | Mitigation in code |
|---|---|
| T-05-02-EoP | `requireAdmin()` is the first await in every export; suspend refuses self-targeting + admin-on-admin |
| T-05-02-PDPA | sha256 IP hash with `EVENTS_IP_SALT` env var fallback |
| T-05-02-DoS | 100 req/min per ipHash on `/api/events/track` (in-memory) |
| T-05-02-tampering | Revenue derived from DB aggregates only; client never supplies a number |
| T-05-02-session-kill | Accepted per Q-05-07 — `banned=true` invalidates next request |

## Mobile validation notes

- `/admin/users` table uses `min-w-[760px] w-full` inside `overflow-x-auto` so the row data is always readable; the surrounding page never scrolls horizontally.
- `/admin` dashboard cards stack from `lg:grid-cols-3` → `sm:grid-cols-2` → 1 col on small phones.
- Recharts `<ResponsiveContainer>` resizes the chart to its parent's `w-full` width at all breakpoints.
- Range tabs are `min-h-[48px]` (D-04).

## Deviations from plan

- Plan 05-02 referenced `npx shadcn@latest add chart`. We used **Recharts directly** (no shadcn Chart wrapper) — the wrapper adds CSS variable plumbing we don't need for v1. Saves a dep + ~3KB JS. Brand colors come from `BRAND` const in `src/lib/brand.ts`.
- The `events` table was added to schema in Plan 05-01 (declared up-front so 05-02 doesn't have to ALTER again), so the funnel can read from `events` immediately — no "instrumentation pending" caveat in code, only in UI hint when addToBag=0.

## Self-Check: PASSED

- ✅ All 11 created files exist (verified via `git status` after commit 0dbb84f)
- ✅ src/actions/admin-users.ts exports listAdminUsers, suspendUser, unsuspendUser
- ✅ src/actions/admin-analytics.ts exports getAnalytics, getAnalyticsForRangeParam
- ✅ /api/events/track responds with rate-limit + sha256 IP hash
- ✅ tsc --noEmit clean
- ✅ Sidebar contains Users, Coupons, Reviews (badge), etc.
