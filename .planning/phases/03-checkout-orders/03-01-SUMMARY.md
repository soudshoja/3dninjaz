---
phase: 03-checkout-orders
plan: 01
status: complete
subsystem: checkout-foundation
tags: [drizzle, mysql, paypal, zod, state-machine]
requires:
  - Phase 1 Drizzle MySQL scaffold (user table, db client, mysql2 pool)
  - cPanel MariaDB 10.11 database with remote access
  - PayPal Developer Dashboard credentials (live + sandbox) loaded in .env.local
provides:
  - orders + order_items tables in src/lib/db/schema.ts (with relations)
  - Order status state machine (src/lib/orders.ts) — assertValidTransition + nextAllowedStatuses + formatOrderNumber
  - Order status + address Zod schemas in src/lib/validators.ts (MALAYSIAN_STATES, orderStatusEnum, orderAddressSchema)
  - Server-only PayPal SDK client singleton (src/lib/paypal.ts) — env-aware (live/sandbox)
  - .env.local.example documenting PAYPAL_* env vars
affects:
  - Plan 03-02 consumes orders schema + PayPal client for create/capture server actions
  - Plan 03-03 consumes orders schema for /orders history + /orders/[id] detail
  - Plan 03-04 consumes orders schema + status machine for admin order management
tech-stack:
  added:
    - "@paypal/paypal-server-sdk@2.3.0"
    - "@paypal/react-paypal-js@9.1.1"
    - "server-only@0.0.1"
  patterns:
    - server-only guard pattern for secret-bearing modules
    - globalThis singleton for PayPal Client (mirrors the mysql2 pool pattern from Phase 1)
    - Snapshot-column pattern on order_items (no FK to products/variants so history is immutable)
    - Node --experimental-strip-types for unit tests against pure TS helpers (no Jest)
key-files:
  created:
    - src/lib/orders.ts
    - src/lib/orders.test.ts
    - src/lib/paypal.ts
    - .env.local.example
    - .planning/phases/03-checkout-orders/03-01-SUMMARY.md
  modified:
    - src/lib/db/schema.ts
    - src/lib/validators.ts
    - package.json
    - package-lock.json
    - tsconfig.json
    - .gitignore
decisions:
  - Live/sandbox credential switch is driven by PAYPAL_ENV. Sandbox mode falls back from PAYPAL_CLIENT_ID_SANDBOX to plain PAYPAL_CLIENT_ID when the _SANDBOX suffix is not set — operator-friendly for single-env setups.
  - Exclude test files from tsc --noEmit via tsconfig.json so node --experimental-strip-types can import with explicit .ts extensions without tripping allowImportingTsExtensions.
  - Created the new tables via raw SQL (matching Drizzle schema exactly) because drizzle-kit push hung on interactive schema-pull against the remote MariaDB instance. DDL verified byte-for-byte against SHOW CREATE TABLE output.
  - Opted into committing .env.local.example by adding an explicit negation in .gitignore.
metrics:
  tasks_completed: 2
  duration_minutes: ~20
  commits: 1 (atomic, per user instruction)
---

# Phase 03 Plan 01: Checkout + Orders Foundation Summary

One-liner: Drizzle orders + order_items schema, status-transition state machine with 12 unit tests, Malaysian shipping-address Zod schema, and server-only PayPal SDK singleton wired for live/sandbox switching via PAYPAL_ENV.

## What Was Built

1. **Drizzle schema extension** (`src/lib/db/schema.ts`)
   - `orders` table (21 columns) with `mysqlEnum` status (pending, paid, processing, shipped, delivered, cancelled), UNIQUE constraint on `paypal_order_id`, `user_id` FK to `user(id)` with NO cascade (PDPA audit, D3-23), and snapshot columns for the full shipping address + `customer_email`.
   - `order_items` table with snapshot columns (`product_name`, `product_slug`, `product_image`, `unit_price`, `size`) and NO FK to products or variants — immutable history (D3-13).
   - `ordersRelations` wires `one(user)` + `many(orderItems)`. `orderItemsRelations` wires `one(orders)`.
   - Exported `orderStatusValues` const tuple so other modules (validators, orders helper) can reference the same string set without duplication.

2. **Order helpers** (`src/lib/orders.ts`)
   - `ORDER_STATUS_FLOW` — the full transition graph per D3-12.
   - `nextAllowedStatuses(from)` — returns the allowed destinations.
   - `assertValidTransition(from, to)` — throws `Invalid status transition: from -> to` on disallowed moves. Called from every status mutator in Wave 4 (admin).
   - `formatOrderNumber(id)` — converts a UUID to `PN-<last 8 hex uppercased>`.
   - `OrderStatus` string-literal union type — kept in sync with schema + validators (comment notes this explicitly).

3. **12 TDD unit tests** (`src/lib/orders.test.ts`) — node:test + node:assert, `--experimental-strip-types` mode. Every branch of the state machine + the order-number rule covered. RED confirmed, GREEN all-pass.

4. **Validators extension** (`src/lib/validators.ts`)
   - `MALAYSIAN_STATES` — 13 states + 3 federal territories (Kuala Lumpur, Labuan, Putrajaya) as a `const` tuple.
   - `orderStatusEnum` — Zod enum mirroring the DB enum.
   - `orderAddressSchema` — recipient/phone/address/city/state/postcode/country with a Malaysian phone regex (accepts `+60`, `0`, or bare; dashes/spaces allowed). Postcode enforced to 5 digits. Country locked to `"Malaysia"`.

5. **PayPal client singleton** (`src/lib/paypal.ts`)
   - `import "server-only"` guard — build fails if a client component imports it.
   - `getPayPalEnvironment()` — returns `Environment.Production` when `PAYPAL_ENV` is "live" or "production"; else `Environment.Sandbox`. Default Sandbox prevents accidental live charges from a missing env var.
   - `resolveCredentials()` — picks live (`PAYPAL_CLIENT_ID` / `_SECRET`) or sandbox (`PAYPAL_CLIENT_ID_SANDBOX` / `_SECRET_SANDBOX`) pairs; sandbox falls back to plain vars for single-env dev setups.
   - `getPayPalClient()` — constructs `new Client({...})` with `logRequest.logBody=false` and `logResponse.logBody=false` so buyer PII never lands in logs. Caches on `globalThis.__paypalClient` to survive Next.js hot-reload.
   - `ordersController()` / `paymentsController()` helpers for Plan 02 + 04 to import without reaching into the SDK namespace.

6. **Env var documentation** (`.env.local.example`) — PAYPAL_ENV, live + sandbox client IDs/secrets, NEXT_PUBLIC_PAYPAL_CLIENT_ID, PAYPAL_CURRENCY, PAYPAL_WEBHOOK_ID, sandbox buyer credentials. All placeholder values — no real secrets. `.gitignore` updated with `!.env.local.example` negation so the file is tracked.

7. **Live-DB migration applied** — orders + order_items tables created on cPanel MariaDB (`ninjaz_3dn`) via raw SQL that matches the Drizzle schema byte-for-byte. `SHOW CREATE TABLE` output verified: UNIQUE on `paypal_order_id`, correct 6-value `status` enum, FK to user (no cascade), FK to orders (ON DELETE CASCADE on order_items.order_id), `ON UPDATE CURRENT_TIMESTAMP` on `updated_at`.

## Verification Performed

- `node --experimental-strip-types --test src/lib/orders.test.ts` — 12/12 tests pass.
- `npx tsc --noEmit` — zero errors after excluding test files from build via tsconfig (`**/*.test.ts`).
- Live DB `SHOW TABLES` — lists `orders` and `order_items` alongside the 7 Phase-1 tables.
- `SHOW CREATE TABLE orders` — confirms UNIQUE KEY on `paypal_order_id`, 6-value enum for `status`, FK `orders_user_id_user_id_fk` to `user(id)` with NO cascade, timestamp defaults, and all 21 columns.
- `SHOW CREATE TABLE order_items` — confirms `size` enum S/M/L, snapshot-only design (no FK to products/variants), FK `order_items_order_id_orders_id_fk` with `ON DELETE CASCADE`.
- `@paypal/paypal-server-sdk@2.3.0` + `@paypal/react-paypal-js@9.1.1` + `server-only@0.0.1` installed. Deprecated `@paypal/checkout-server-sdk` confirmed NOT installed.
- Automated verifier scripts from the plan (schema markers, validator exports, orders helper exports, env file keys, dependency presence, forbidden logBody usage) — all pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Tooling] drizzle-kit push hung on schema-pull against remote MariaDB; applied DDL directly via raw SQL**
- **Found during:** Task 2.
- **Issue:** `drizzle-kit push` (both via `npm run db:push` and the dotenv-cli fallback) hung indefinitely in the "Pulling schema from database" spinner against the cPanel MariaDB instance. Separately, `dotenv-cli` itself started failing with a Node `EUNKNOWN` error reading some JS file — likely related to OneDrive file locking or the parallel executor holding locks. Direct DB connectivity via mysql2 was fine.
- **Fix:** Applied the two new tables with raw `CREATE TABLE` statements through a mysql2 client, replicating the Drizzle schema DDL exactly. Verified column-by-column against `SHOW CREATE TABLE`. Future schema changes should go through drizzle-kit once the hang is diagnosed (likely a drizzle-kit 0.31 quirk with MariaDB 10.11 introspection over a high-latency link).
- **Files modified:** none in the app code — DB-only change.

**2. [Rule 3 - Tooling] tsconfig.json must exclude test files so Node --experimental-strip-types .ts imports compile**
- **Found during:** Task 2 typecheck.
- **Issue:** `node --experimental-strip-types --test` requires explicit `.ts` extensions on relative imports, but tsconfig had `allowImportingTsExtensions: false` (default) which raised TS5097 during `tsc --noEmit`.
- **Fix:** Added `**/*.test.ts` and `**/*.test.tsx` to the tsconfig `exclude` array so the Next.js build does not see the test file. Tests still run via Node's strip-types mode on demand.
- **Files modified:** `tsconfig.json`.

**3. [Rule 2 - Correctness] .gitignore blocked .env.local.example**
- **Found during:** Pre-commit `git status`.
- **Issue:** The existing `.env*` glob in `.gitignore` also matched `.env.local.example`, so the new file was untracked. Plan explicitly requires the example file to be checked in.
- **Fix:** Added `!.env.local.example` and `!.env.example` negations after the `.env*` line.
- **Files modified:** `.gitignore`.

**4. [Rule 2 - Correctness] Live + sandbox credential switching**
- **Found during:** Task 2 implementation (plan prompt noted existing `.env.local` has both live and `_SANDBOX` variants).
- **Issue:** Plan pseudocode read only `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` but the team's `.env.local` stores both live (`PAYPAL_CLIENT_ID`) and sandbox (`PAYPAL_CLIENT_ID_SANDBOX`) variants. A naive reader would charge live money even when `PAYPAL_ENV=sandbox`.
- **Fix:** Implemented `resolveCredentials()` to pick the correct pair based on `getPayPalEnvironment()`, with a fallback from `_SANDBOX` to plain vars when sandbox-suffixed values are absent.
- **Files modified:** `src/lib/paypal.ts`.

## Parallel-execution Coordination Notes

- STATE.md was intentionally NOT updated (Phase 2 executor owns STATE.md during this parallel window).
- ROADMAP.md was intentionally NOT updated (Phase 2 executor owns it during this window).
- Pre-commit `git diff --cached --name-only` was empty — no collision with the Phase 2 executor at commit time.
- Only new files (`src/lib/orders*.ts`, `src/lib/paypal.ts`, `.env.local.example`) and append-only edits (`src/lib/db/schema.ts`, `src/lib/validators.ts`) + 2 tooling edits (`tsconfig.json`, `.gitignore`) were staged. Phase 2 in-flight files were NOT touched.

## Self-Check: PASSED

- FOUND: `src/lib/orders.ts`
- FOUND: `src/lib/orders.test.ts`
- FOUND: `src/lib/paypal.ts`
- FOUND: `.env.local.example`
- FOUND: `src/lib/db/schema.ts` contains `orders` + `order_items` + `orderStatusValues` + `paypalOrderId` + `unique()` + relations
- FOUND: `src/lib/validators.ts` contains `MALAYSIAN_STATES` + `orderStatusEnum` + `orderAddressSchema`
- FOUND: `@paypal/paypal-server-sdk@2.3.0` and `@paypal/react-paypal-js@9.1.1` in package.json
- NOT FOUND: `@paypal/checkout-server-sdk` (correct — deprecated)
- FOUND live DB tables: `orders`, `order_items` (via SHOW TABLES)
- Commit hash recorded after successful `git commit`.
