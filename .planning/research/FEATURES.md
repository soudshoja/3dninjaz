# Feature Research

**Domain:** Admin-provisioned multi-tenant e-commerce platform (fleet-managed, database-per-tenant) + Reseller/wholesale plugin — v2.0 milestone for 3D Ninjaz
**Researched:** 2026-07-12
**Confidence:** HIGH on control-plane/provisioning patterns and the reseller catalog model (strong, consistent industry precedent: AWS/Azure SaaS guidance, Shopify Collective, Printify/Printful, Spree multi-tenant). MEDIUM on cPanel/LiteSpeed-specific domain+TLS automation details (verified against existing deploy topology notes, not yet spiked).

> Supersedes the 2026-04-12 FEATURES.md (v1 single-tenant store research). Existing single-tenant features are DONE and out of scope here — this covers only the multi-tenant pivot and the Reseller plugin.

---

## How Admin-Provisioned Fleets Work (Primer)

The standard architecture — consistent across AWS SaaS guidance, Azure SQL multitenant patterns, and commercial multi-tenant e-commerce (Spree Commerce Enterprise) — splits into two planes:

- **Control plane** — a small platform-level database + admin surface that is NOT any tenant's database. It holds the **tenant registry** (tenant id, name, status, domain(s), DB connection reference), provisioning state, and platform-level entitlements. Azure calls this the "catalog database"; AWS calls it the control plane. It is the only thing that knows all tenants exist.
- **Data plane** — the per-tenant databases plus the shared application process. Every request resolves `Host` header → tenant registry → tenant DB connection, then runs the existing app code unchanged against that tenant's DB.

An **admin-provisioned fleet** is exactly this architecture minus the self-serve parts: no signup flow, no billing engine, no plan/quota enforcement. Provisioning is a super-admin-triggered workflow instead of a public funnel. Spree's multi-tenant docs confirm this is a first-class mode ("invitation-only store provisioning" vs "self-service signup flows") — the control surface is the same; only the trigger differs. This is genuinely LESS work than SaaS tutorials suggest, because ~half of every multi-tenant tutorial (signup, billing, plans, quotas, trials) is out of scope by locked decision.

**Provisioning is a state machine, not a form.** Creating a tenant touches multiple systems (MariaDB, filesystem, web server vhost, TLS, DNS verification, app cache) and any step can fail. Industry-standard shape: `pending → provisioning → active → suspended → archived`, with each provisioning step idempotent and resumable so a half-created tenant can be retried rather than hand-cleaned.

---

## THE CATALOG QUESTION — RESOLVED

**Question:** For the Reseller plugin, is the product catalog a SHARED central catalog that reseller tenants read at request time (with per-tenant price overrides), or a SYNCED/COPIED catalog pushed into each reseller tenant's own DB?

### Recommendation (concrete, not hedged)

**Logically shared, physically copied.** Build a **one-way push sync**: the supplier's catalog (Tenant #1 — the live 3D Ninjaz store) is the source of truth; entitlements and wholesale price lists live in the control-plane DB; the sync engine **copies entitled products (same UUIDs) into each reseller tenant's own database** and keeps them updated. Reseller storefronts NEVER read another database at request time.

**Do NOT build request-time shared-catalog reads.** That option is rejected, not deferred.

### Why the copy model wins here (specific to this codebase, not generic)

1. **The tenant schema's FK graph forces local rows anyway.** `order_items`, `reviews`, `coupons` (product scoping), `product_config_fields`, `product_options`/`product_option_values` (with `colorId → colors` ON DELETE RESTRICT), `product_variants.option1..6ValueId`, accounting cost snapshots, Delyva weight lookups, slug-based routing, sitemap generation — every existing feature assumes product and variant rows exist in the local DB (`src/lib/db/schema.ts`). A "shared catalog" would require either (a) refactoring every read/write site into a dual-source data layer, or (b) creating local shadow rows for FK integrity — which IS the copy model plus a distributed read path on top. The copy model keeps 100% of existing storefront/admin/order code working unmodified.
2. **MariaDB has no good cross-database story.** No Postgres FDW. Same-server cross-schema `SELECT db2.products.*` is technically possible on one connection with grants, but: Drizzle clients are initialized per-database; the mandated manual multi-query hydration pattern (the no-LATERAL workaround in `src/actions/products.ts`) would need cross-schema rewrites; and it permanently hard-couples all tenant DBs to one MariaDB server — killing the ability to ever move a large tenant elsewhere. FEDERATED/Spider engines are operationally fragile and not worth introducing.
3. **Failure isolation — the whole point of the locked decision.** Request-time shared reads make the platform catalog DB a synchronous dependency of every reseller storefront page render: shared DB down = entire fleet down, shared DB slow = entire fleet slow. With copies, a sync outage means staleness only; every storefront keeps serving from its own DB. Database-per-tenant was locked for isolation — request-time shared reads would silently un-lock it.
4. **Staleness is acceptable and is the industry norm.** Shopify Collective imports supplier products into the retailer's store and "continuously syncs the cost price and inventory" — a copy + one-way sync, not a live read. Printify/Printful push products into the connected store and sync from there. Nobody in this exact business model (white-label resale of a supplier's catalog) does request-time federation. Minutes-level sync latency on price/stock is fine because **orders already snapshot prices** (`order_items.unit_cost` pattern) — an in-flight order is never corrupted by a mid-session price change.
5. **Write conflicts are solved by field ownership, not merge logic.** Synced rows carry a `source` marker; platform-owned fields (name, description, images, options/variants structure, tier tables, weights, wholesale cost) are overwritten on every sync; tenant-owned fields (retail `price`, `salePrice`/sale window, `isActive`, `isFeatured`, local category placement) are never touched by sync. No three-way merge, no conflict UI.
6. **The killer reuse:** write the wholesale price into the reseller tenant's `product_variants.cost_price`. From the reseller store's perspective, its cost IS the wholesale price. The existing admin margin readout, the `order_items.unit_cost` at-capture snapshot, and the entire accounting module then compute reseller profit **with zero schema or code changes inside the tenant app**. This single mapping is the strongest argument that the copy model fits the existing codebase like a glove.

### What "shared" still means (so the business requirement is met)

- **Single source of truth:** the supplier tenant's catalog (Tenant #1). The owner keeps managing products in the admin UI they already have — no second product-management UI is built. (Shopify Collective works exactly this way: the supplier's own store is the source.) The control-plane registry marks Tenant #1 with `role: supplier`. If a second supplier ever appears, promote to a dedicated catalog DB then — not now.
- **Entitlements + price lists live centrally:** control-plane tables ~`reseller_entitlements` (tenant × product/collection) and ~`wholesale_prices` (per variant, or margin-percent rule). Super-admin edits these in the platform panel; the sync engine materializes the result into tenant DBs.
- **One edit propagates:** supplier updates a product → sync engine pushes to every entitled reseller DB. `updatedAt` columns with `onUpdateNow()` already exist on products/variants/options — an incremental cursor-based sync is cheap. v1 cadence: interval cron (e.g. every 15 min) + a "Sync now" button per tenant in the super-admin panel.

### Sync mechanics (roadmap-ready sketch)

- **Same UUIDs across DBs.** IDs are app-generated (`crypto.randomUUID()`, per MariaDB conventions) — copy rows with identical PKs. Sync becomes idempotent upsert-by-PK; order forwarding maps reseller order items back to supplier products with no ID-translation table.
- **Copy order respects FKs:** `colors` → `products` → `product_options` → `product_option_values` → `product_variants` → `product_config_fields`. (`colors` first — `product_option_values.colorId` is ON DELETE RESTRICT.)
- **Full graph per product:** including `priceTiers`/`weightTiers` JSON, `productType` (configurable/keychain products must work on reseller stores), config fields with per-option price/SKU/imageUrl `configJson`, shipping dims/weights.
- **Tier-priced (configurable/keychain) products need a wholesale transform:** `priceTiers` is the retail ladder. v1 rule: sync supplier's `priceTiers` as the default retail ladder and apply the reseller margin rule to derive a wholesale ladder snapshot at order-forwarding time; per-tier tenant editing is v1.x.
- **Images:** files live at `public/uploads/products/<uuid>/` on the same box. Because the deploy is single-server, v1 can serve one shared uploads directory to all tenants (product UUIDs are identical, paths just work). Flag: this becomes a real file-copy step only if a tenant ever moves off-box.
- **Delete/discontinue = soft.** Supplier removing a product from an entitlement marks the tenant copy `isActive = false` + `source_discontinued` flag; never hard-delete (order history FKs). Existing admin already has the active/inactive concept.
- **Tenant-row provenance columns** (added to tenant schema, nullable, default local): ~`sourceType` ('local' | 'platform'), `sourceSyncedAt`. Local products created by a tenant for themselves coexist untouched — this also cleanly supports Tenant #1, whose products are all local.

### Honest tradeoff table (for the record)

| Dimension | A: Shared central catalog, request-time reads | B: One-way synced copy per tenant DB (RECOMMENDED) |
|---|---|---|
| Price/stock freshness | Real-time | Minutes-stale (cron interval); orders snapshot prices so no correctness issue |
| Isolation (locked decision) | Broken — shared DB is a sync dependency of every storefront | Preserved — sync outage = staleness, not downtime |
| Existing code impact | Every product read site + FK graph refactored (LATERAL-workaround hydration would need cross-schema variants) | Zero changes to storefront/admin read paths |
| MariaDB feasibility | Same-server cross-schema only; locks fleet to one DB server forever; no FDW equivalent | Plain per-DB connections; tenants relocatable |
| Write conflicts | None (single copy) | Solved by field-ownership policy (platform-owned vs tenant-owned columns) |
| New moving parts | Dual-source data layer inside request path (high blast radius) | Offline sync engine (failures visible in a sync-status dashboard, zero storefront blast radius) |
| Storage | One copy | N copies of entitled subset — trivial at this catalog size (tens of products) |
| Industry precedent for this business model | None found | Shopify Collective, Printify, Printful all copy + sync |

---

## Feature Landscape

### Table Stakes (a fleet-managed platform is broken without these)

#### A. Control plane & tenant provisioning

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Tenant registry (control-plane DB) | Standard pattern (Azure "catalog DB"); the one place that maps domain → tenant → DB connection | LOW | Small dedicated MariaDB schema: tenants(id, name, status, role, dbName/connRef, createdAt), tenant_domains(domain, verified, primary). Deliberately tiny. |
| Super-admin identity, separate from tenant auth | Better Auth lives per-tenant DB; the platform operator cannot authenticate against a tenant's user table | MEDIUM | Own auth in control-plane DB (can be a second Better Auth instance). Never reuse a tenant's session for platform actions. |
| Provisioning workflow (idempotent state machine) | Multi-system creation (DB, grants, migrations, seed, vhost, TLS) fails partway in real life | HIGH | `pending → provisioning → active`; each step recorded + retryable. cPanel UAPI (`Mysql::create_database`, user+grants) is already accessible per deploy notes. Seed = migrations + admin user (reuse idempotent `scripts/seed-admin.ts` pattern) + store_settings + email_templates defaults. |
| Custom-domain onboarding + TLS | Locked decision: custom domains, not subdomains | HIGH | Per-domain steps on the cPanel/LiteSpeed box: addon domain/vhost + Apache userdata proxy include (same pattern as existing `3dninjaz_app_proxy.conf`) + AutoSSL issuance + DNS instructions shown to super-admin (A record → 152.53.86.223). Domain verification check before activation. This is the operationally hardest provisioning step — spike it early. |
| Host-header tenant resolution middleware | The request path IS the product; every request must land in the right DB | MEDIUM | Host → registry lookup (cached in-process with TTL) → per-tenant Drizzle connection from a pooled cache. Unknown host → 404/parking page. Cache invalidation on domain changes. Watch aggregate MariaDB `max_connections` across N pools. |
| Suspend / unsuspend | Fleet management basics; the admin's kill switch | LOW | Status flip in registry; middleware serves a "store unavailable" page; tenant admin locked out; data + DB untouched. |
| Tenant #1 migration path (live store → first tenant) | Locked: real production data migrates in; a broken cutover kills the live business | HIGH | Not a feature but a phase: registry entry pointing at the EXISTING prod DB (`ninjaz_3dnp`) + domain mapping for 3dninjaz.com, with single-tenant fallback until verified. No data copy needed if the registry can point at the existing DB as-is — design the registry so this is true. Staged, reversible, tested on dev first (per dev-first rule). |
| Fleet schema-migration runner | THE recurring cost of DB-per-tenant: every future feature ships DDL × N databases | HIGH | Ordered raw-SQL migration files + `schema_version` table per tenant DB + runner that applies to all tenants with per-tenant status/stop-on-failure. Raw SQL is already the house rule (`drizzle-kit push` banned against remote). Without this, tenant #3 makes every future phase slower. |
| Per-tenant backups | Fleet operator responsibility; also the rollback story for fleet migrations | MEDIUM | mysqldump per tenant DB + uploads dir, cron on the box, retention window. Restore is per-tenant by construction (a headline benefit of DB-per-tenant — keep it real by testing restore once). |

#### B. Super-admin panel (the control surface)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Tenant list + detail dashboard | Can't manage a fleet you can't see | MEDIUM | Status, domains, DB health ping, order count / last activity (read via that tenant's connection), provisioning-step progress. |
| Create-tenant wizard | The provisioning trigger (replaces self-serve signup) | MEDIUM | Name, domain, initial admin email, role (standard/reseller), reseller entitlement selection. Drives the state machine above. |
| Per-tenant config editing | Branding/config per tenant without SSH | LOW | Mostly free: `store_settings`, `whatsapp_settings`, `email_templates`, `shipping_config` already exist per-DB — super-admin just needs a door into each tenant's existing admin. |
| Payment-gateway plugin config per tenant | Locked: plugin architecture for gateways (PayPal, Hesabe/KNET, MyFatoorah skills exist) | MEDIUM | v1 = architecture room only: gateway interface + per-tenant credential/config storage + PayPal as the one shipped implementation behind it. No marketplace UI. |
| Sync-status dashboard (reseller) | The copy model's one new failure mode is sync lag/failure — must be visible | LOW | Per tenant: last sync time, pending count, last error, "Sync now" button. |

#### C. Reseller plugin (first named plugin, v1)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Entitlements + wholesale price lists (control plane) | Defines who resells what at what cost — the heart of the pattern (Shopify Collective "price lists") | MEDIUM | Per-reseller product/collection grants; wholesale as per-variant price or margin-% rule off supplier retail. Super-admin assigns (push) — fits admin-provisioned model; reseller self-serve browsing is v1.x. |
| One-way catalog sync engine | The resolved catalog model (above) | HIGH | Cursor on `updatedAt`, upsert-by-same-UUID, FK-ordered graph copy, field-ownership rules, soft-discontinue. The single biggest new build in the plugin. |
| Wholesale → `cost_price` mapping | Reseller margin must be visible and accounted | LOW | Sync writes wholesale into reseller's `product_variants.cost_price`; existing margin readout + `order_items.unit_cost` snapshot + accounting module work unchanged. |
| Tenant retail-price control | The reseller's whole business is setting their own price | LOW | Already exists: `price`/`salePrice` in their own DB via their own admin. Sync initializes retail (default: supplier retail, or wholesale × default margin) then never overwrites it. |
| Order forwarding to supplier | Reseller doesn't print — Tenant #1 fulfills. Without this the model doesn't function | HIGH | On reseller order capture: create a fulfillment record for the supplier at wholesale prices (same product/variant UUIDs make mapping trivial); surfaces in Tenant #1's existing admin/production queue. Supplier-side final availability validation happens here (not at reseller checkout). |
| Availability propagation | Reseller selling what supplier can't print = refunds and trust damage | LOW | `inStock`/`stock`/`trackStock` are platform-owned synced fields; supplier OOS → all reseller copies flip on next sync. |
| White-label fulfillment surface | Locked promise: "resell under their own branding" | MEDIUM | Reseller customer must see only reseller branding: emails from reseller's store identity (per-tenant `email_templates` + mailer config already exist), tracking updates relayed to the reseller order. Delyva ships from supplier's account; plain-packaging is an ops policy, not code. |
| Settlement ledger (not payment splitting) | Money owed reseller → supplier must be tracked from day one | MEDIUM | Control-plane ledger row per forwarded order (wholesale total); monthly statement view. Actual money movement stays manual (bank transfer) in v1 — admin-provisioned trust model permits this. |

### Differentiators (valuable, not required for v1 credibility)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Impersonation ("log in as tenant admin") with audit log | Fleet support without password sharing; standard in mature multi-tenant panels | MEDIUM | Needs per-tenant session mint from platform identity + prominent banner + audit trail. Worth doing early — it removes the #1 support friction. |
| Cross-fleet analytics rollup | Spree-style "monitor tenant activity, revenue, KPIs across all stores" | MEDIUM | N-DB fan-out queries aggregated in the panel. Read-only, low risk. v1.x. |
| Tenant templates / cloning | Provision new reseller pre-loaded with settings + entitlement defaults in minutes | MEDIUM | Template = seed config + default entitlement set. Compounds value as fleet grows. |
| Reseller margin rules (auto-pricing) | "Wholesale = supplier retail − 30%" per reseller removes per-variant price admin | LOW | A rule column on the price list; Shopify Collective ships exactly this ("include a retailer margin that applies to all products in that price list"). Cheap — consider pulling into v1. |
| Tracking sync back to reseller order | Completes the white-label loop automatically (Collective does this) | MEDIUM | Supplier's Delyva webhook → forwarded-order link → update reseller order status + trigger reseller-branded notification. v1 can start manual; automate in v1.x. |
| Reseller catalog browse-and-import UI | Reseller admin pulls from entitled catalog instead of waiting for super-admin push | MEDIUM | The Shopify Collective retailer UX. Deferred: push-only assignment is fine for an admin-provisioned fleet at v1 scale. |
| Post-provision automated smoke check | Fleet confidence: storefront 200, DB migrated to head, TLS valid, mail sends | LOW | A checklist runner on the tenant detail page. Cheap insurance. |
| Plugin registry abstraction (beyond gateways) | Locked "architecture room": Reseller itself ships as the first plugin behind the interface | MEDIUM | Registry + per-tenant enablement flags + hook points (checkout, pricing, order-created). Keep to the minimum that lets Reseller and PayPal live behind it. |

### Anti-Features (explicitly do NOT build in v1)

| Feature | Why Requested / Tempting | Why Problematic | Alternative |
|---------|--------------------------|-----------------|-------------|
| Self-serve tenant signup + billing/plans/quotas | Every SaaS tutorial assumes it | Locked out of scope; huge surface (payments, trials, abuse) for zero v1 users | Super-admin create-tenant wizard; leave billing room in the plugin architecture |
| Request-time shared catalog reads | "Always fresh prices, one copy" | Rejected above: breaks DB-per-tenant isolation, MariaDB has no FDW, refactors every read site, couples fleet uptime to one DB | One-way synced copy (resolved recommendation) |
| Two-way catalog sync / reseller edits to synced content | Resellers will ask to tweak descriptions | Merge conflicts, brand drift on the supplier's products, sync ceases to be idempotent | Field-ownership: tenant owns price/sale/visibility/featured/category only; content overrides = v2 if demanded |
| Per-tenant feature gating | Classic SaaS plan tiering | Locked: every tenant runs the full feature set in v1; gating multiplies test matrix | Uniform feature set; plugin enable-flags exist only for actual plugins (Reseller) |
| Process-per-tenant / container-per-tenant | "Real isolation" | One cPanel box, one watchdog, one deploy pipeline; N Node processes = N ports, N crashes, N memory footprints | Single Next.js process + connection-per-tenant-DB (data isolation is at the DB layer, per locked decision) |
| Automated payment splitting / marketplace payouts | "Reseller money should flow automatically" | PayPal MY merchant limitations already bit once (card-form trap); escrow/split = compliance surface; fleet is trusted/admin-provisioned | Settlement ledger + monthly statement; manual bank transfer |
| Real-time cross-DB stock check at reseller checkout | "Never oversell" | Reintroduces the request-time coupling the copy model exists to avoid | Synced availability + supplier-side validation at order-forwarding time (minutes-stale is fine at this volume) |
| Cross-tenant customer SSO / shared customer accounts | "One login across the fleet" | Customers belong to a store, not the platform; shared identity leaks the platform behind the white-label | Per-tenant Better Auth (already the default with DB-per-tenant) |
| Theme-builder per tenant | "Each tenant wants a unique look" | A CMS-sized project; v1 tenants are the owner's own fleet | Existing `store_settings` branding (logo, palette, WhatsApp, socials) per tenant |
| Wildcard-subdomain shortcut | Cheaper TLS/DNS than custom domains | Locked decision is custom domains; subdomains would leak the platform brand under white-label resale | Per-domain AutoSSL on the box; document DNS runbook |

---

## Feature Dependencies

```
Tenant registry (control plane)
    └──requires──> nothing (build first)

Host-resolution middleware ──requires──> Tenant registry
Provisioning state machine ──requires──> Tenant registry
    └──requires──> Fleet migration runner (to bring new DB to schema head)
    └──requires──> Custom domain + TLS automation (activation step)

Tenant #1 migration ──requires──> Host-resolution middleware + registry
    (and BLOCKS everything reseller: supplier catalog must be a tenant first)

Super-admin panel ──requires──> Super-admin identity (control-plane auth)
Impersonation ──requires──> Super-admin panel + per-tenant Better Auth session mint

Reseller entitlements/price lists ──requires──> Tenant registry + Tenant #1 as supplier
Catalog sync engine ──requires──> Entitlements + provenance columns in tenant schema
    └──uses (existing, unchanged)──> products/product_options/product_option_values/
         product_variants/product_config_fields/colors + updatedAt onUpdateNow cursors
Wholesale→cost_price mapping ──uses (existing, unchanged)──> product_variants.cost_price,
         margin readout, order_items.unit_cost snapshot, accounting module
Order forwarding ──requires──> Catalog sync (same-UUID mapping) + supplier production queue (exists)
Settlement ledger ──requires──> Order forwarding
Tracking sync-back ──requires──> Order forwarding + existing Delyva webhook handler
Payment-plugin architecture ──requires──> per-tenant config storage; PayPal refactors behind it
Reseller plugin ──requires──> plugin enablement flags (minimal plugin registry)
```

### Dependency Notes (existing model — build on, don't reinvent)

- **`product_variants.cost_price` + cost breakdown + margin UI:** the reseller's wholesale cost slots into this exact field; margin/profit/accounting features light up for resellers with no tenant-app changes.
- **`order_items.unit_cost` at-capture snapshot:** already the pattern for price-at-time-of-order; order forwarding snapshots wholesale the same way.
- **Options/variants (Shopify-style positional `option1..6ValueId`), `colors` library (RESTRICT FK), configurable-product tier pricing (`priceTiers`/`weightTiers`/`product_config_fields.configJson`):** the sync graph must carry all of it, in FK order, colors first — but nothing about it changes.
- **`updatedAt ... onUpdateNow()` on catalog tables:** free incremental-sync cursor.
- **App-generated UUIDs (MariaDB convention):** what makes same-PK cross-DB copies safe and order-forwarding mapping trivial.
- **`store_settings` / `email_templates` / `whatsapp_settings` / `shipping_config` per DB:** per-tenant branding and config exist by construction — the super-admin panel only needs doors, not new models.
- **Idempotent `scripts/seed-admin.ts` two-step (signUpEmail → role update):** the template for tenant-admin seeding in provisioning.
- **Raw-SQL DDL house rule (no `drizzle-kit push` remote):** the fleet migration runner formalizes what is already practiced.
- **Existing Apache userdata proxy conf + AutoSSL + UAPI access:** the raw materials for domain/TLS provisioning automation.
- **Conflict to respect:** the manual multi-query hydration pattern (no LATERAL) assumes ONE database per request — another reason request-time shared catalog was rejected.

---

## MVP Definition

### Launch With (v1)

- [ ] Control-plane DB: tenant registry + domains + super-admin auth — foundation for everything
- [ ] Host-resolution middleware + per-tenant Drizzle connection cache — the multi-tenant request path
- [ ] Provisioning state machine (DB create, migrate, seed, domain+TLS, activate) — the admin-provisioned flow itself
- [ ] Fleet migration runner + per-tenant backups — makes tenant #2+ sustainable, and is the rollback story
- [ ] Super-admin panel: tenant list/detail, create wizard, suspend/unsuspend, sync-status — minimum control surface
- [ ] Tenant #1 migration (registry points at existing prod DB; staged, reversible) — locked scope
- [ ] Payment-gateway plugin interface with PayPal behind it + per-tenant gateway config — locked "architecture room"
- [ ] Reseller plugin: entitlements + wholesale price lists (control plane), one-way catalog sync engine, wholesale→cost_price mapping, retail-price init, availability propagation, order forwarding to supplier queue, settlement ledger — locked first plugin
- [ ] Reseller margin rules (auto wholesale %) — cheap (LOW) and removes the biggest price-admin chore; include despite being a differentiator

### Add After Validation (v1.x)

- [ ] Impersonation with audit log — trigger: first time super-admin needs to debug inside a tenant
- [ ] Tracking sync-back + automated reseller-branded shipping notifications — trigger: first real reseller order volume
- [ ] Cross-fleet analytics rollup — trigger: >3 active tenants
- [ ] Reseller browse-and-import UI — trigger: resellers ask to self-curate
- [ ] Post-provision smoke-check runner — trigger: first provisioning incident
- [ ] Tenant templates/cloning — trigger: provisioning cadence exceeds ~1/month

### Future Consideration (v2+)

- [ ] Self-serve signup + billing plans — only if the platform opens beyond the admin-managed fleet
- [ ] Reseller content overrides (descriptions/images) with field-level ownership UI — only on demand; complicates sync
- [ ] Dedicated platform catalog DB + multi-supplier support — only if a second supplier appears
- [ ] Automated payouts/splitting — only with volume + a gateway that supports it in MY/KW
- [ ] Plugin marketplace UI — locked deferred

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Tenant registry + host resolution | HIGH | MEDIUM | P1 |
| Provisioning state machine (incl. domain+TLS) | HIGH | HIGH | P1 |
| Fleet migration runner + backups | HIGH | MEDIUM | P1 |
| Super-admin panel (list/create/suspend) | HIGH | MEDIUM | P1 |
| Tenant #1 migration | HIGH | HIGH | P1 |
| Gateway plugin interface (PayPal behind it) | MEDIUM | MEDIUM | P1 |
| Reseller: entitlements + price lists | HIGH | MEDIUM | P1 |
| Reseller: catalog sync engine | HIGH | HIGH | P1 |
| Reseller: wholesale→cost_price + retail init | HIGH | LOW | P1 |
| Reseller: order forwarding + settlement ledger | HIGH | HIGH | P1 |
| Reseller: margin rules | MEDIUM | LOW | P1 |
| Impersonation + audit | MEDIUM | MEDIUM | P2 |
| Tracking sync-back automation | MEDIUM | MEDIUM | P2 |
| Fleet analytics rollup | MEDIUM | MEDIUM | P2 |
| Browse-and-import UI | MEDIUM | MEDIUM | P2 |
| Smoke checks, templates/cloning | MEDIUM | LOW–MEDIUM | P2 |
| Self-serve signup/billing, payouts, marketplace UI | LOW (v1) | HIGH | P3 |

---

## Competitor Feature Analysis

| Feature | Shopify Collective | Printify / Printful | Spree multi-tenant | Our Approach |
|---------|--------------------|---------------------|--------------------|--------------|
| Catalog sharing model | Import (copy) into retailer store + continuous one-way sync of cost price & inventory | Push (copy) product into connected store; platform stays source of truth | Offers both "centralized product catalog" and independent per-tenant catalogs | Copy + one-way sync (same UUIDs); supplier = Tenant #1; entitlements central |
| Wholesale pricing | Supplier price lists; optional blanket retailer-margin %; retailer sets resale price | Base cost fixed; seller sets retail markup (default margin setting per store) | N/A (framework-level) | Central price lists + margin-% rules → synced into tenant `cost_price`; tenant sets retail |
| Order flow | Auto-forwarded to supplier; supplier fulfills + ships; tracking syncs back; auto-payment via Shopify Payments | Auto order routing to print facility; ships white-label | Centralized or tenant-managed fulfillment | Forward to supplier production queue at wholesale; ledger settlement (manual transfer v1); tracking sync-back v1.x |
| Tenant provisioning | N/A (stores already exist) | N/A | Invitation-only or self-serve store provisioning; global settings + per-tenant overrides | Super-admin wizard + idempotent state machine; no self-serve (locked) |
| Domains / branding | Each store already owns its domain | Sells through the seller's existing store | Own domain or subdomain per tenant; white-label admin/emails | Custom domain per tenant + AutoSSL on cPanel box; branding via existing per-tenant store_settings |

---

## Sources

- [Azure SQL multitenant SaaS patterns (database-per-tenant + catalog DB)](https://learn.microsoft.com/en-us/azure/azure-sql/database/saas-tenancy-app-design-patterns?view=azuresql)
- [AWS SaaS multi-tenant architecture guide (control plane / data plane, onboarding, silo model)](https://hidekazu-konishi.com/entry/aws_saas_multi_tenant_architecture_guide.html)
- [AWS Prescriptive Guidance — single control plane across products](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/manage-tenants-across-multiple-saas-products-on-a-single-control-plane.html)
- [Northflank — multi-tenant SaaS deployment production guide (per-tenant DB tradeoffs)](https://northflank.com/blog/multi-tenant-saas-platform-deployment)
- [Spree Commerce — multi-tenant capabilities (super-admin surface, invitation-only provisioning, centralized vs independent catalogs)](https://spreecommerce.org/docs/use-case/multi-tenant/multi-tenant-capabilities)
- [Shopify Collective for retailers (import + continuous cost/inventory sync)](https://help.shopify.com/en/manual/online-sales-channels/shopify-collective/retailers)
- [Shopify Collective price lists (wholesale price lists + retailer margin %)](https://help.shopify.com/en/manual/online-sales-channels/shopify-collective/suppliers/price-lists)
- [Shopify Collective explained (order forwarding, tracking sync, margins 20–50%)](https://shopxcommerce.com/blogs/all/shopify-collective-explained-how-it-works-who-should-use-it)
- [Printify — retail price/markup editing per variant](https://help.printify.com/hc/en-us/articles/4483625628305-How-can-I-update-my-retail-prices)
- [Printify — default profit margin + pricing tool](https://help.printify.com/hc/en-us/articles/39375429289617-How-to-set-smart-retail-prices-with-the-Pricing-tool)
- Repo evidence: `src/lib/db/schema.ts` (products, product_variants.cost_price, product_options/values, product_config_fields, colors, order_items, reviews, coupons, store_settings), `src/actions/products.ts` (manual hydration pattern), `scripts/seed-admin.ts`, `.planning/PROJECT.md` (locked milestone scope), CLAUDE.md deploy topology + MariaDB conventions

---
*Feature research for: 3D Ninjaz v2.0 multi-tenant platform + Reseller plugin*
*Researched: 2026-07-12*
