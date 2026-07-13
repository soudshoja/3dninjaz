# Phase 24: Singleton Dissolution Sweep - Pattern Map

**Mapped:** 2026-07-13
**Files analyzed:** 86 `@/lib/db` importers (src) + ~60 non-request scripts + 5 singleton/factory files
**Analogs found:** 86/86 src importers classified into 5 conversion categories (all have an in-repo "after" analog); ~49 `.cjs` scripts flagged as **no compile-safety analog** (bespoke)

> **Read this first (orientation for the planner).** This is not a "new files" phase — it is a mechanical **sweep** of existing files. Do NOT enumerate all 86 files as 86 plan actions. Every file falls into one of **5 conversion categories** below; each category has ONE mechanical before→after transform and 2-3 representative real examples. Turn the categories into **waves**, not the files. The Phase 23 modules that supply the "after" state (`getTenantContext()`, `getTenantDb()`, the guards) are already built and committed — this phase wires ~86 call sites onto them and **deletes the `db` export so every un-swept site is a compile error**.
>
> **The load-bearing safety invariant:** everything here must preserve `TENANT_MODE=single` (the deployed default) **byte-for-byte**. In single mode `getTenantContext()` / `getTenantDb()` return today's exact singleton pool (pool-manager.ts:54-57 short-circuits; registry.ts:50-62 synthesizes one tenant, Host ignored). So a correctly-swept file behaves identically today and only diverges once `TENANT_MODE=registry` is flipped on the ≥2-tenant dev fleet. The sweep is therefore verifiable by full regression against unchanged behavior (Success Criterion 4).

---

## The Enforcement Mechanism (verified against the live repo — READ BEFORE PLANNING)

The research (ARCHITECTURE.md:97, PITFALLS.md Pitfall 1) prescribes "delete the `db` export → compile error, PLUS an ESLint `no-restricted-imports` ban riding the CI verify job." **The live repo state differs from that assumption and the planner must account for it:**

| Mechanism | Repo reality (verified) | Consequence for the plan |
|-----------|--------------------------|--------------------------|
| **Compile error** (delete/rename `db` export) | `tsc --noEmit` runs on every push and is **branch-protection-required** (`.github/workflows/deploy.yml:90-91`, `verify` job) | **This is the PRIMARY, load-bearing gate.** Deleting `export const db` from `src/lib/db/index.ts:45` makes every un-swept `import { db }` a hard `tsc` failure. This catches all 86 src files AND the 11 `.ts` scripts that import `../src/lib/db`. |
| **ESLint `no-restricted-imports`** | **No ESLint config exists** and there is **no `lint` script** in `package.json`. CI calls `npm run lint --if-present` (`deploy.yml:93-94`) → currently a **no-op**. | The lint ban is **net-new setup work**, not "riding an existing job." Either (a) add a minimal `eslint.config.mjs` + `"lint"` script (then the `--if-present` line activates), or (b) drop the lint rule and rely on compile error + an `rg` grep-audit phase gate. **Recommend both compile-error AND grep-audit; treat eslint as optional hardening.** |
| **`rg` grep-audit gate** | Trivial to add as a plan verification step | `rg "from \"@/lib/db\"" src/ scripts/` must return only the resolver layer (`src/lib/tenant/*`, `src/lib/db/index.ts` internals) before the phase is verifiable — this is the PITFALLS.md Pitfall 1 / "Looks Done But Isn't" checklist item. |

**Also verified:** the `pool` export (`src/lib/db/index.ts:46`) has **zero external consumers** (grep for `{ pool }` from `@/lib/db` → 0 files). It can be removed/localized freely. The `TENANT_MODE` and `getPlatformDb` re-exports (index.ts:52-59) are consumed only by the resolver layer — keep them.

---

## File Classification (by conversion category, NOT per-file)

The 86 `@/lib/db` importers split into 5 categories. Counts are exact.

| # | Category | Count | "After" resolution source | Analog file | Match |
|---|----------|-------|---------------------------|-------------|-------|
| A | **Guarded server actions** (`src/actions/*.ts`, `"use server"`, first-await `requireAdmin()`/`requireUser()`) | ~51 | `const { db } = await requireAdmin()` / `requireUser()` | `src/actions/admin-coupons.ts`, `src/actions/addresses.ts` | exact |
| B | **Route handlers** (`src/app/api/**/route.ts`, webhooks, public + admin) | 8 | `const { db } = await getTenantContext()` (Host-resolved; single-mode = today) | `src/app/api/webhooks/delyva/route.ts` | role-match |
| C | **RSC pages** (`src/app/**/page.tsx` reading `db` directly) | 6 | `const { db } = await requireAdmin()` (admin pages) / `getTenantContext()` (store pages) | `src/app/(admin)/admin/orders/page.tsx` | exact |
| D | **Shared lib modules** (`src/lib/*.ts` importing `db` at module scope, called by A/B/C) | 17 | thread `db` as a parameter **OR** call `getTenantContext()` internally (decision below) | `src/lib/catalog.ts`, `src/lib/store-settings.ts` | role-match |
| E | **Singleton/factory files** (the sources being dissolved) | 4 | bespoke — see Shared Patterns | `src/lib/auth.ts`, `src/lib/auth-helpers.ts`, `src/lib/mailer.ts`, `src/lib/public-url.ts` | n/a |
| — | Resolver layer (KEEP importing `db` — sanctioned) | 2 | no change | `src/lib/tenant/pool-manager.ts`, `src/lib/tenant/registry.ts` | n/a |

**Plus a 6th category NOT in the 86-file grep** (different import path — see "No Compile-Safety Analog" section):

| # | Category | Count | Risk |
|---|----------|-------|------|
| F1 | **`.ts` scripts** importing `../src/lib/db` (compile-error-caught) | 11 | MEDIUM — `tsc` catches them, but each needs an explicit tenant target |
| F2 | **`.cjs`/`.js` scripts** using raw `mysql.createPool(DATABASE_URL)` (NOT compile-caught) | ~49 | **HIGHEST — silent cross-tenant. No compiler safety net.** |

---

## Pattern Assignments

### Category A — Guarded server actions (~51 files) — THE BULK

**Analog:** `src/actions/admin-coupons.ts` (requireAdmin), `src/actions/addresses.ts` (requireUser)

This is the mechanical majority of the sweep and the reason the guard-returns-`{db}` design was chosen: every one of these files already begins each export with `await requireAdmin()` / `await requireUser()`, so the tenant `db` comes back "for free" — the diff is deleting the module import and capturing the guard's return.

**Before** (`admin-coupons.ts:1-9, 42-47`):
```typescript
"use server";
import { db } from "@/lib/db";                    // ← DELETE this line
import { coupons, couponRedemptions } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";
// ...
export async function listCoupons(): Promise<CouponListRow[]> {
  await requireAdmin();                            // ← guard result discarded today
  const rows = await db.select().from(coupons)...  // ← module-singleton db
}
```

**After:**
```typescript
"use server";
// no `import { db }` — schema-only import remains
import { coupons, couponRedemptions } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";
// ...
export async function listCoupons(): Promise<CouponListRow[]> {
  const { db } = await requireAdmin();             // ← capture tenant db
  const rows = await db.select().from(coupons)...  // ← now tenant-scoped; single-mode identical
}
```

**requireUser variant** (`addresses.ts:23, 31-36`) is identical in shape — `addresses.ts` already does `const session = await requireUser()`; change to `const { session, db } = await requireUser()` and drop the `@/lib/db` import. Note `requireUser()` must keep returning the session object (it is used for `session.user.id` ownership predicates — `addresses.ts:35`), so the new return is `{ session, tenant, db }` (see Shared Patterns → Guards).

**Sub-case A2 — actions with NO guard (public / customer-optional paths).** A handful of `"use server"` files run without `requireAdmin`/`requireUser` because they serve anonymous or guest flows: `src/actions/cart.ts`, `src/actions/shipping-quote.ts`, `src/actions/coupons.ts` (apply), and the `getSessionUser`-only actions (`paypal.ts`, `orders.ts`, `whatsapp-order.ts`, `checkout-drafts.ts`, `admin-pos.ts`, `reviews.ts`, `wishlist.ts`, `shipping.ts` — 18 files import `getSessionUser`). These have no guard to hand back `db`, so they resolve directly:
```typescript
import { getTenantContext } from "@/lib/tenant/context";
export async function applyCoupon(...) {
  const { db } = await getTenantContext();   // Host-resolved; single-mode = singleton
  // ...
}
```
**Planner decision D-A2 (flag):** `getSessionUser()` (`auth-helpers.ts:23-26`) is called in 18 files and today returns only `session?.user`. Decide whether to (a) evolve it to `{ user, tenant, db }` symmetrically with the guards, or (b) leave it session-only and have those 18 call sites add a separate `getTenantContext()` for `db`. Option (a) is fewer call-site edits and keeps "resolve tenant before touching db" structural; option (b) is a smaller change to `getSessionUser` itself. Recommend (a).

---

### Category B — Route handlers (8 files)

**Analog:** `src/app/api/webhooks/delyva/route.ts`, `src/app/api/paypal/webhook/route.ts`

Route handlers have no guard convention and receive the request directly. They resolve via `getTenantContext()` (which reads `Host` from `headers()` — and in `TENANT_MODE=single` returns the synthesized single tenant regardless of Host, so behavior is unchanged today).

The 8 files split by trust level:
- **Webhooks** (2): `webhooks/delyva/route.ts`, `paypal/webhook/route.ts`
- **Public** (3): `events/track/route.ts`, `subscribe/route.ts`, `unsubscribe/route.ts`
- **Admin** (3): `admin/subscribers/export/route.ts`, `admin/orders/[id]/label/route.ts`, `admin/upload-font/route.ts` (these already call `requireAdmin()` → use Category A pattern: `const { db } = await requireAdmin()`)

**Before** (`webhooks/delyva/route.ts:4`):
```typescript
import { db } from "@/lib/db";
export async function POST(req: NextRequest) {
  // ... HMAC verify against raw body FIRST (unchanged) ...
  await db.update(orderShipments)...   // module singleton
}
```

**After:**
```typescript
import { getTenantContext } from "@/lib/tenant/context";
export async function POST(req: NextRequest) {
  // ... HMAC verify against raw body FIRST (unchanged — verify BEFORE resolving) ...
  const { db } = await getTenantContext();
  await db.update(orderShipments)...
}
```

**CRITICAL — webhook tenant identity (PITFALLS.md Pitfall 10, and the phase context call-out).** For THIS phase (compat mode, one tenant), Host resolution is correct and sufficient: Delyva/PayPal webhooks for Tenant #1 land on Tenant #1's own domain (registrations already flow through `publicUrl()`), so Host binds the right DB. **But the plan MUST record the known limitation:** the fully-general per-tenant model (Phase 25/29) resolves webhook tenant from the **registered path** (`/api/webhooks/delyva/[tenantId]` + per-tenant secret), NOT Host, because a shared gateway account can deliver to a non-tenant domain. Do NOT bake a "Host is always the tenant" assumption into the webhook that a later phase must unpick. Keep the idempotency guard (Delyva `SEEN_KEYS` in-process Set, lines 36-49; the DB-level UNIQUE `delyvaShipmentId`) evaluated **inside the resolved tenant db** — in single mode this is a no-op change, but it is the correct structure for registry mode.

---

### Category C — RSC pages (6 files)

**Analog:** `src/app/(admin)/admin/orders/page.tsx` (admin), `src/app/(store)/account/page.tsx` (store)

These `page.tsx` files read `db` directly (most other pages get data via server actions and are untouched). Admin pages already call `requireAdmin()` at the top (`admin/orders/page.tsx:2,40` — "belt-and-braces, CVE-2025-29927") → use the Category A capture. Store pages use `getSessionUser`/`getTenantContext`.

The 6 files:
- Admin: `admin/products/[id]/edit/page.tsx`, `admin/orders/[id]/page.tsx`, `admin/orders/page.tsx`, `admin/inventory/page.tsx` → `const { db } = await requireAdmin()`
- Store: `(store)/orders/[id]/page.tsx`, `(store)/account/page.tsx` → `const { db } = await getTenantContext()` (or via the evolved `getSessionUser`, per D-A2)

**Before** (`admin/orders/page.tsx:2-5`):
```typescript
import { requireAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";   // already dynamic — good; see note below
export default async function AdminOrdersPage(...) {
  await requireAdmin();
  const proofs = await db.select().from(paymentProofs)...
}
```
**After:** delete the `db` import; `const { db } = await requireAdmin();`.

**Note — DB-backed prerender.** Phase B / Phase 24 in the research also calls for DB-backed prerendered pages (shop, sitemap, layout `store_settings`, `/about`) to go `force-dynamic` (or per-tenant `unstable_cache` tags). `admin/orders/page.tsx:13` already declares `force-dynamic`. The planner should confirm which of the 6 (and their shared-lib dependencies in Category D) still statically prerender against a single DB and flag those for `force-dynamic` — but note the tenant-aware cache-tag helpers (`t:<tenantId>:` prefix) were the deliverable of **Phase 23** (Success Criterion 5), so this phase consumes them rather than building them.

---

### Category D — Shared lib modules (17 files) — HIGHEST DESIGN ATTENTION AFTER SCRIPTS

**Analog:** `src/lib/catalog.ts` (module-scope `db`, public catalog reads), `src/lib/store-settings.ts` (module-scope `db` + 60s in-memory cache)

These modules `import { db } from "@/lib/db"` at module scope (`catalog.ts:3`, `store-settings.ts:2`) and their exported functions call `db` directly **without receiving it as an argument**. They are called from Category A (actions), B (routes), C (pages) — and some from Category F (scripts). This is the category the compile error will surface most painfully, because deleting the `db` export breaks the module load, not just one function.

The 17: `catalog.ts`, `variants.ts`, `colours.ts`, `store-settings.ts`, `shipping-config.ts`, `configurable-product-data.ts`, `keychain-fields.ts`, `vending-fields.ts`, `delyva-filter.ts`, `order-dedupe.ts`, `checkout-drafts.ts`, `accounting.ts`, `email/templates.ts`, `email/order-confirmation.ts`, `pdf/render-invoice.tsx`, `whatsapp/settings.ts`, `meshy/pipeline.ts`.

**Planner decision D-D1 (flag — pick ONE convention, apply uniformly):**

| Option | Shape | Pro | Con |
|--------|-------|-----|-----|
| **(1) Thread `db` as a parameter** | `getProducts(db, opts)` — caller passes its resolved `db` | Module stays callable from ANY surface incl. scripts/crons (Category F); no hidden request dependency; explicit | Ripples the signature to every call site (larger mechanical diff) |
| **(2) Resolve internally** | function body calls `const { db } = await getTenantContext()` | Zero signature change; smallest diff at call sites | Makes the module **request-only** — it throws outside a request (no `headers()`), so any script/cron calling it breaks; couples lib to Next request scope |

**Recommendation:** Option **(1) param-threading for the truly-shared read helpers** (`catalog.ts`, `variants.ts`, `colours.ts`, `configurable-product-data.ts` — these are called by both RSC and scripts), because it preserves the non-request surfaces' ability to use them. Option **(2) internal `getTenantContext()`** is acceptable only for modules provably called **exclusively** from request context (verify with a callers grep before choosing it per-module). Document the choice in the plan; do not mix silently.

**Special sub-case D2 — `store-settings.ts` (the cache module).** Its `global.__storeSettingsCache` (lines 23-29) is a **process-global single-tenant cache** — exactly PITFALLS.md Pitfall 8. Under registry mode this bleeds Tenant A's settings onto Tenant B (first-request-wins). The cache key must become tenant-scoped (`Map<tenantId, {value, expiresAt}>`), and `clearStoreSettingsCache()` (line 80) must bust per-tenant. This is the same shape as the registry's own cache (`registry.ts:30-44`, which store-settings.ts is explicitly cited as the analog for) — mirror that. In single mode there is exactly one tenant id (`"single"`), so behavior is unchanged. **Every module-level `let cached`/`global.__*Cache` in the 17 is a Pitfall-8 candidate — audit each.**

---

### Category E — Singleton/factory files (4) — see Shared Patterns below

`src/lib/db/index.ts` (delete `db` export), `src/lib/auth.ts` (→ factory), `src/lib/mailer.ts` (→ per-tenant), `src/lib/public-url.ts` (→ tenant-aware), `src/lib/auth-helpers.ts` (guards return `{session,tenant,db}`). These are the *sources* of the singletons and are detailed as cross-cutting Shared Patterns.

---

## Shared Patterns

### Guards — the insertion point for tenant binding

**Source:** `src/lib/auth-helpers.ts` (current), `.planning/research/ARCHITECTURE.md:121-130` (target shape)
**Apply to:** every Category A file (~51) + admin Category C pages, transitively

The guards keep their names and first-`await` call sites (the whole design rests on this — call sites don't change, only the destructuring of the return value does). Tenant binding happens **inside**, **before** session lookup, so validating a session against the wrong tenant is structurally impossible (Success Criterion 2; PITFALLS.md Pitfall 5).

**Before** (`auth-helpers.ts:1-21`):
```typescript
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userWithRole = session?.user as unknown as { role: string } | undefined;
  if (!session || userWithRole?.role !== "admin") throw new Error("Forbidden");
  return session;                          // ← returns session only
}
```

**After** (target — ARCHITECTURE.md:122-130):
```typescript
import { getTenantContext } from "@/lib/tenant/context";
export async function requireAdmin() {
  const { tenant, db, auth } = await getTenantContext();   // tenant binding FIRST
  const session = await auth.api.getSession({ headers: await headers() });
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session || role !== "admin") throw new Error("Forbidden");
  return { session, tenant, db };                          // ← handlers get db for free
}
```

**Two hard constraints for the plan:**
1. `requireUser()` must keep its **deletedAt/banned hot-path + cold-path reload verbatim** (`auth-helpers.ts:45-73`), now running against the tenant `db` from context instead of the imported singleton. Preserve the `surface.deletedAt === undefined` cold-path SELECT exactly (it is defense-in-depth from Phase 6).
2. `getTenantContext()` currently returns only `{ tenant, db }` (`context.ts:42-58`, and its own comment at lines 16-18 explicitly says "Phase 24 adds `auth` to this same resolved shape — do not add it here"). **So this phase must extend `context.ts` / `resolveTenantContext()` to also return `auth` (the per-tenant Better Auth instance from the new auth-cache).** That is a prerequisite sub-task, not an afterthought.

### Auth factory + per-tenant instance cache

**Source:** `src/lib/auth.ts` (current singleton), ARCHITECTURE.md:145, component table
**Apply to:** `src/app/api/auth/[[...all]]/route.ts` (dispatch), the guards, `getTenantContext`

`src/lib/auth.ts:11-126` constructs `betterAuth(...)` **once at module scope**, bound to the singleton `db` (line 12 `drizzleAdapter(db, ...)`), with a **static** `trustedOrigins` array (lines 114-120) and `databaseHooks` (lines 40-94) that close over the singleton `db` (welcome email + guest-order phone linking, lines 64-77). Three distinct high-attention hazards:

1. **`db` closure in `databaseHooks`** (lines 64, 74): the `user.create.after` hook queries and updates `schema.orders` on the singleton `db`. In the factory these must close over the **tenant** `db` passed to `buildTenantAuth(tenant, db)`, or a new user on Tenant B links Tenant A's guest orders.
2. **`sendWelcomeEmail` / `sendResetPasswordEmail`** (line 46, and `emailAndPassword.sendResetPassword` line 26): must use the **per-tenant mailer** (next pattern), not the global transport.
3. **Static `trustedOrigins`** (lines 114-120, hardcoded `app.3dninjaz.com` / `3dninjaz.com`): this is the exact class that caused incident `d421bd9` (CLAUDE.md). Must derive from the tenant's registry domains. In single mode, synthesize today's array from env so behavior is unchanged.

**Target:** `buildTenantAuth(tenant, db)` returning `betterAuth({ database: drizzleAdapter(db), baseURL: "https://"+tenant.primaryDomain, trustedOrigins: <tenant domains>, databaseHooks: <closing over tenant db + tenant mailer>, ... })`, cached per tenant in a new `src/lib/tenant/auth-cache.ts` (busted with the registry). The catch-all route (`src/app/api/auth/[[...all]]/route.ts:1,9` — currently `toNextJsHandler(auth.handler)`) resolves tenant from Host → dispatches `getTenantAuth(tenant).handler`. **Shared `BETTER_AUTH_SECRET` is acceptable** (DB-backed random session tokens don't exist in another tenant's session table — ARCHITECTURE.md:145); do NOT rotate secrets (Pitfall 6, cutover session survival).

### Per-tenant mailer

**Source:** `src/lib/mailer.ts` (current singleton transport)
**Apply to:** `auth.ts` hooks, `email/order-confirmation.ts`, `email/templates.ts`, any `sendMail` caller

`mailer.ts:8-40` holds one `global.__mailTransport` built from `SMTP_*` env, and `MAIL_FROM` (line 42-43) is a module constant. Target: `getTenantMailer(tenant)` (per-tenant SMTP from tenant settings, platform SMTP + per-tenant from-address as fallback — ARCHITECTURE.md:150, cached in `src/lib/tenant/mailer-cache.ts`). In single mode, return today's transport + `MAIL_FROM` unchanged. Note `sendResetPasswordEmail` (lines 45-88) also renders a **DB-backed template** via `renderTemplate` (line 57) — that template read is itself a Category D `db` access and must resolve to the tenant db (a reset email must render the *tenant's* template, not Tenant #1's).

### Tenant-aware `publicUrl()`

**Source:** `src/lib/public-url.ts` (env-driven single origin)
**Apply to:** every outbound-URL builder — emails, PayPal `return_url`, WhatsApp links, invoice links, sitemap, Delyva webhook registration

`public-url.ts:9-19` reads `NEXT_PUBLIC_SITE_URL`/`NEXT_PUBLIC_BASE_URL`/`SITE.url`. Target: resolve from tenant context (`tenant.primaryDomain`), **fall back to env in single mode** (ARCHITECTURE.md:149). Success Criterion 5 is explicit: all outbound URLs derive from the **registry canonical domain**, NEVER echoed from the incoming Host header (Pitfall 4 — reset-link poisoning). This means `publicUrl()`/`publicOrigin()` gain a tenant argument (or read the request-cached context); the ~ dozen callers (emails, payment links, sitemap) each pass/inherit the tenant. Because the convention is already funneled through this one file, it is a single rewrite + a caller audit, not a scavenger hunt.

### Compile-error enforcement (the completeness guarantee)

**Source:** `src/lib/db/index.ts:45` (`export const db = ...`), ARCHITECTURE.md:97, PITFALLS.md Pitfall 1
**Apply to:** the whole sweep — this is what makes "did we miss a file?" a compiler question, not a code-review hope.

1. **Delete `export const db`** from `src/lib/db/index.ts` (line 45). Keep `pool` local (no external consumers). The resolver layer (`pool-manager.ts:8` imports `db as singletonDb`) is the ONE sanctioned reader — after the export is gone, pool-manager holds the singleton via the `buildPool()` logic moved/kept inside the db module and exported under a resolver-only name (e.g. `__singletonDb` or the pool-manager owns pool construction). Design so exactly one module can reach it.
2. **`rg` grep-audit phase gate:** `rg "from \"@/lib/db\"" src/ scripts/` returns only the resolver layer (Success Criterion 1). Add to the plan's verification.
3. **(Optional) ESLint `no-restricted-imports`:** requires creating `eslint.config.mjs` + a `"lint"` script (neither exists today). If added, ban `@/lib/db` value-import of `db` outside `src/lib/tenant/**` **and** the relative `../src/lib/db` form (the 11 `.ts` scripts use the relative path). Treat as hardening; the compile error is the real gate.

---

## No Compile-Safety Analog — Non-request surfaces (Category F) — HIGHEST SILENT-BUG RISK

**These are NOT in the 86-file `@/lib/db` grep** (they use different import paths) and are the single most dangerous part of the sweep because their failure mode is **silent** (PITFALLS.md Pitfall 10, and this project's own WhatsApp-silent-skip / Delyva-webhook history). The planner MUST give these bespoke handling — one plan action per surface class, not a mechanical batch.

| Sub | What | Count | Compiler catches it? | Required handling |
|-----|------|-------|----------------------|-------------------|
| **F1** | `.ts` scripts importing `../src/lib/db` (seed-admin.ts:27, meshy-sweep.ts:36, seed-colours.ts, seed-categories.ts, repair-*.ts, seed-*.ts, migrate-*.ts) | 11 | **YES** — deleting the `db` export breaks their `tsc`/tsx load | Give each an explicit tenant target: iterate the registry (`for (const tenant of activeTenants)`) or take a `--tenant=<slug>` arg → resolve `getTenantDb(tenant)`. **`scripts/meshy-sweep.ts` is a live 5-min cron** (header lines 20-22) — it must iterate the fleet, not silently process only the first/`DATABASE_URL` tenant. |
| **F2** | `.cjs`/`.js` scripts using raw `mysql.createPool/createConnection(process.env.DATABASE_URL)` — all `phaseNN-migrate.cjs`, `scripts/cron/reconcile-paypal.cjs` (nightly cron, lines 25 + inline env parser), `backup-orders-schema.cjs`, `register-delyva-webhooks.cjs`, ~49 total | ~49 | **NO — zero compiler safety.** They never import the singleton; they read `DATABASE_URL` directly and keep hitting whatever it points at | **Each is a silent cross-tenant landmine.** These are exactly the ARCHITECTURE.md "fleet migration tooling" (Phase 25) — for Phase 24, the minimum is: (a) `scripts/cron/reconcile-paypal.cjs` (nightly, touches money) must iterate registered tenants, not one DSN; (b) any cron/backfill run post-cutover must take `--tenant`/iterate; (c) leave one-shot historical `phaseNN-migrate.cjs` alone (they already ran once against the single DB) but forbid new single-DSN crons. **Flag the boundary with Phase 25** (fleet migration runner) — some of F2 legitimately belongs there; Phase 24 must at minimum not leave the *recurring* crons single-tenant. |
| **F3** | `scripts/log-alert.cjs` (log monitor) + the server-side crash watchdog (`/home/ninjaz/scripts`, per CLAUDE.md) | 2 | n/a — no DB access | **Stay process-level (platform concern)** — ARCHITECTURE.md:157. No change for tenant DB routing. Later (Phase 28) they gain per-tenant *health* checks, out of scope here. |

**Rule for the plan:** a `.cjs` cron that mentions no tenant id in any log line is the Pitfall-10 signature. Every non-request surface that survives into the multi-tenant world must either iterate the registry or take an explicit `--tenant`, and log the tenant id.

---

## Suggested Wave Structure (for the planner — categories, not files)

The dependency order is fixed by what supplies `db`/`auth` to what:

1. **Wave 1 — Singleton sources + context extension (Category E + context.ts):** extend `getTenantContext()`/`resolveTenantContext()` to return `auth`; build `auth-cache.ts` + `buildTenantAuth()`; `mailer-cache.ts` + `getTenantMailer()`; tenant-aware `publicUrl()`; evolve the guards (`requireAdmin`/`requireUser`/`getSessionUser`) to return `{session, tenant, db}`. **Nothing else can be swept until the guards hand back `db`.** Do NOT delete the `db` export yet.
2. **Wave 2 — Shared libs (Category D, 17):** pick and apply the param-thread-vs-internal-resolve convention (D-D1); fix the `store-settings.ts` / module-cache Pitfall-8 keys. These sit under Categories A/B/C, so they go before them.
3. **Wave 3 — Guarded actions + RSC pages (Categories A + C, ~57):** the mechanical bulk; `const { db } = await requireAdmin()/requireUser()/getTenantContext()`.
4. **Wave 4 — Route handlers (Category B, 8):** webhooks + public + admin routes; record the webhook-path limitation for Phase 25.
5. **Wave 5 — Delete the `db` export + non-request surfaces (Category F) + enforcement gate:** remove `export const db`; fix the 11 `.ts` scripts (compiler now forces them) and the recurring `.cjs` crons (F2 — no compiler help, manual); run the `rg` grep-audit; (optional) add eslint. `tsc --noEmit` green + grep-audit clean = phase-complete gate.
6. **Wave 6 — Money-path regression (Success Criterion 4):** full checkout / PayPal webhook / Delyva webhook / auth (register-login-reset) / admin CRUD / transactional email on dev in `TENANT_MODE=single`, proving behavior-identical; then the ≥2-tenant dev-fleet isolation check (Success Criterion 3: browse/CRUD on A shows only A; A's cookie rejected on B).

---

## Metadata

**Analog search scope:** `src/actions/**`, `src/app/**`, `src/lib/**`, `scripts/**`, `.github/workflows/deploy.yml`, `package.json`
**Files scanned (read in full or targeted):** `src/lib/db/index.ts`, `src/lib/auth.ts`, `src/lib/auth-helpers.ts`, `src/lib/public-url.ts`, `src/lib/mailer.ts`, `src/lib/tenant/{context,pool-manager,registry,platform-schema}.ts`, `src/lib/catalog.ts`, `src/lib/store-settings.ts`, `src/actions/admin-coupons.ts`, `src/actions/addresses.ts`, `src/app/api/webhooks/delyva/route.ts`, `src/app/api/paypal/webhook/route.ts`, `src/app/(admin)/admin/orders/page.tsx`, `scripts/meshy-sweep.ts`, `scripts/seed-admin.ts`, `scripts/cron/reconcile-paypal.cjs`, `scripts/log-alert.cjs`
**Grep audits run:** 86 `@/lib/db` importers (src); 116 occurrences repo-wide (matches ARCHITECTURE.md:16); 113 `requireAdmin` callers; 12 `requireUser` callers; 18 `getSessionUser` callers; 0 `{ pool }` external consumers; 11 `.ts` scripts on `../src/lib/db`; ~49 `.cjs` scripts on raw `mysql.createPool`; no ESLint config / no `lint` script confirmed
**Pattern extraction date:** 2026-07-13
```
