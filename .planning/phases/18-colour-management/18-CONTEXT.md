# Phase 18: Colour Management - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a reusable, central colour library (admin-curated, seeded once from Bambu and Polymaker reference HTML files) that flows into the existing variant system as the consumption point. Admin picks a per-product subset; PDP renders swatches; /shop offers a sidebar chip filter by colour. No customer-facing codes; no cross-product bulk assignment; no per-colour pricing UI.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**8 requirements are locked.** See `18-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `18-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- New `colors` table (Drizzle schema + raw-SQL migration matching the live MariaDB 10.11 pattern).
- `tsx scripts/seed-colours.ts` parser for both HTML reference files (idempotent, brand-aware).
- `/admin/colours` CRUD page (list, create, edit, soft-archive, hard-delete with in-use guard).
- `color_id` FK column added to `product_option_values` (nullable; `NULL` = freeform/custom one-off).
- "Pick from library" picker modal in variant editor (search + brand badge + code/family display in admin only).
- Custom one-off hex entry preserved as fallback for non-library colours (existing freeform path stays).
- PDP swatch grid renders hex + name (always visible, never hover-only); `code` never customer-facing.
- /shop sidebar colour chip filter — multi-select, URL-synced, intersects with existing category filter.
- Cascade rename: editing a library colour's name or hex propagates to all `product_option_values` rows where `color_id` matches (transaction-safe).

**Out of scope (from SPEC.md):**
- Per-colour pricing UI (existing variant editor already supports per-row pricing).
- Bulk colour assignment across products (deferred per user — not important at this stage).
- Live re-import of HTML files post-seed (manual admin form for new colours).
- Colour family grouping for filter (Red/Blue/etc.) — exact-name match only.
- Customer-facing colour codes (admin-only).
- Multi-language colour names (English only).

**SPEC delta locked during this discussion:**
The SPEC.md `family` column (single varchar) becomes **two columns**: `family_type` (enum: PLA / PETG / TPU / CF / Other) + `family_subtype` (varchar — Matte / Silk / Translucent / Basic / etc.). See D-04 below. Update SPEC.md acceptance criterion #1 accordingly during planning.

</spec_lock>

<decisions>
## Implementation Decisions

### Schema

- **D-01:** Seed parser uses **Regex + `Function`-eval** to extract the `const data = {...}` block from each HTML file. Zero external deps; both files share the shape `<script>const data = { "<family-key>": { ..., colors: [{name, code, hex, oldHex?}] } }</script>`. Match `const data = (\{[\s\S]*?\});`, eval body via `new Function("return " + body)()`. Each file is bounded (~530 lines max), input is repo-controlled — eval risk is acceptable.
- **D-02:** Schema includes a **`previous_hex` varchar(7) NULL** column on `colors`. Polymaker's HTML carries `oldHex` on ~30 entries (old packaging vs current). Store both — current `hex` drives display; `previous_hex` is admin-visible reference for sourcing.
- **D-03:** Seed everything from both HTML files — no pre-filter. Admin soft-archives lines they don't sell. Total may exceed 100 (Polymaker Matte alone has 38).
- **D-04:** Family schema = **two columns** instead of SPEC's single `family`:
  - `family_type` ENUM('PLA','PETG','TPU','CF','Other') — broad filament type.
  - `family_subtype` VARCHAR(48) — fine-grained line name (e.g. 'Matte', 'Silk', 'Translucent', 'Basic', 'CF', 'Tough').
  Picker filters and sourcing decisions need both axes; coarse enum keeps queries fast and consistent.
- **D-14:** Slug derivation = lowercase-hyphen from name. **No dedicated slug column** — derive at runtime. Cross-brand collisions (e.g. both Bambu and Polymaker have a colour named "Black") handled by appending `-<brand>` suffix at insert time when slug exists. Helper utility: `slugifyColourName(name, brand)` lives in `src/lib/colours.ts`.

### Picker UX

- **D-05:** Picker modal = **shadcn Dialog** (existing admin pattern; matches dispute action bar / coupon edit / email-template editor). Centered modal, max-width ~720px. Desktop-primary; admin-only context.
- **D-06:** Search = **client-side filter on full library**. Picker fetches all `is_active = true` colours via single server action when opened (~100 rows = ~30 KB JSON). JS filter matches on `name + brand + family_subtype + code` (case-insensitive substring). Instant response. No virtualization at this scale.
- **D-07:** Picker row content (admin-only): hex chip (24px) + name + **brand badge** (Bambu/Polymaker/Other) + **family_type** chip + **family_subtype** chip + **code** (mono font, small). All four shown on every row.
- **D-08:** Confirm UX = **stage selections + single batch "Add N colours" button**. Modal holds multi-select state; footer shows count + button. One server action call on confirm. Uses Phase 17 Reactivity Contract Pattern B (`getVariantEditorData` refetch — shape-changing op).

### Cascade Rename Mechanic

- **D-09:** Confirm SPEC default — **denormalized cache + cascade UPDATE transaction** (NOT live-join). `product_option_values.value` and `swatch_hex` stay as snapshots. Keeps PDP, /shop, variant-selector hot paths untouched. MariaDB no-LATERAL safe.
- **D-10:** Cascade scope = **both `value` and `swatch_hex`**. Library rename ('Galaxy Black' → 'Cosmic Black') propagates new name AND any updated hex to every linked `product_option_values` row.
- **D-11:** Manual-edit conflict = **diff-aware cascade (manual wins)**. Cascade UPDATE skips rows where current `value` no longer matches the previous library snapshot — admin's manual rename on a product is preserved. Implementation: server action reads pre-rename `colors.name` first, then issues `UPDATE pov SET value = :new_name, swatch_hex = :new_hex WHERE color_id = :id AND value = :old_name`. Hex update path: same WHERE clause; if user manually rewrote name, hex change is also skipped (one transaction reads pre-state + writes; both fields cascade together or not at all per row).
- **D-12:** Transaction scope = **single transaction up to ~1000 rows**, return warning past that requiring admin confirmation. MariaDB on Print Ninjaz scale handles this comfortably; no chunking needed.

### /shop Filter

- **D-13:** Sidebar slot = **below categories, collapsible accordion**. Sidebar order: Category > Subcategory > **Colour**. Default open with first 12 chips visible; "Show all" expands. Mobile: scrolls past category strip into the accordion.
- **D-15:** Chip rendering = **hex circle (12px) + name pill**. Active state = pill background tinted with hex (alpha-mixed for WCAG contrast against white text — fallback to dark text on light hex).
- **D-16:** Available list = **computed on each /shop render via DISTINCT JOIN**. Query: `SELECT DISTINCT c.id, c.name, c.hex FROM colors c JOIN product_option_values pov ON pov.color_id = c.id JOIN product_variants pv ON pv.option1_value_id = pov.id OR ... OR pv.option6_value_id = pov.id JOIN products p ON pv.product_id = p.id WHERE c.is_active = 1 AND p.is_active = 1`. Manual hydration in `src/actions/products.ts` style to dodge LATERAL.

### Claude's Discretion

- Admin guide article placement and copy (a "Managing colours" entry in `src/content/admin-guide/products/` mirroring existing `variants-sizes.md`).
- Picker error-state copy (e.g. "No colours match 'galxy'").
- Custom one-off freeform value visibility in variant editor — keep current text+colour-picker inputs but label them "Custom (not in library)" to nudge admin toward the picker.
- Slug collision UX in /admin/colours form (inline error if slug already taken before suffix added).
- "Show all" expansion threshold (12 chips visible default — reasonable guess; can tune in research).

### Folded Todos

None — no pending todos surfaced for this phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### This phase

- `.planning/phases/18-colour-management/18-SPEC.md` — Locked requirements (8). Read FIRST before planning or implementing anything in this phase.

### Source data files

- `Colours/bambu-lab-colors.html` — Bambu Lab reference HTML (255 lines). Contains `<script>const data = {...}</script>` with PLA/PETG/Translucent groupings. Source of truth for Bambu colour seed.
- `Colours/polymaker-colors.html` — Polymaker reference HTML (530 lines). Same shape as Bambu file. Includes `oldHex` field on ~30 entries. Source of truth for Polymaker colour seed.

### Variant system foundations (must understand before extending)

- `src/lib/db/schema.ts` §`productOptions` (line 185) and §`productOptionValues` (line 207) — generic options/values model. `swatchHex` already exists at line 216. Phase 18 adds `color_id` FK to `productOptionValues`.
- `src/lib/db/schema.ts` §`productVariants` (line 226) — positional `option1_value_id`..`option6_value_id` columns. 6-axis cap is structural (not enforced in app).
- `src/components/admin/variant-editor.tsx` — admin variant editor. Picker modal integrates here. Existing freeform `name + swatchHex` path stays as fallback.
- `src/components/store/variant-selector.tsx` — PDP variant picker. Auto-detects Colour-style options when ≥1 value has `swatchHex` (line 188). Phase 18 must ensure name-always-visible (not hover-only).
- `src/lib/variants.ts` — `HydratedVariant` type, `composeVariantLabel`, `findVariantByOptions`. Used by PDP + admin.
- `src/actions/variants.ts` — server actions for option/value CRUD. `swatchHex` plumbing already present (lines 210, 248, 265, 283).
- `src/actions/products.ts` — **MariaDB manual hydration reference**. Phase 18 colour-related queries MUST follow this pattern (no `db.query.findMany({ with: ... })` — that compiles to LATERAL).
- `src/lib/catalog.ts` line 185 — `swatchHex` exposed in catalog data shape.
- `src/lib/validators.ts` lines 613, 621 — Zod schema for `swatchHex`.

### Reactivity contract (Phase 17)

- `.planning/phases/17-variant-enhancements-legacy-cleanup/17-CONTEXT.md` §"Admin editor reactivity contract (mandatory)" — Pattern A optimistic + rollback for field edits, Pattern B `getVariantEditorData` refetch for shape-changing ops. Picker confirm = Pattern B.
- `.planning/phases/17-variant-enhancements-legacy-cleanup/17-PLAN.md` AD-06 — full reactivity contract decision record. Every Phase 18 mutation must reference this.

### Admin route + action conventions

- `src/app/(admin)/admin/coupons/{page,new,[id]/edit}.tsx` — closest CRUD precedent. Mirror this directory shape for `/admin/colours/`.
- `src/actions/admin-coupons.ts` — server-action structure with `requireAdmin()` first await. Mirror for `src/actions/admin-colours.ts`.
- `src/lib/auth-helpers.ts` `requireAdmin()` — MUST be the first `await` in every admin server action (CVE-2025-29927 mitigation, CLAUDE.md).
- `src/components/admin/coupon-form.tsx` and `src/components/admin/csv-upload.tsx` — admin form component patterns (shadcn UI, react-hook-form + Zod).

### /shop filter pattern

- `src/app/(store)/shop/page.tsx` — current `?category=&subcategory=` URL pattern, server-side filter via `resolveProducts`. Phase 18 extends with `?colour=` (comma-separated slugs).
- `src/components/store/category-chips.tsx` — mobile-friendly category chip strip; reuse styling for colour chip strip if mobile-strip approach selected.

### Project-level

- `CLAUDE.md` §"MariaDB 10.11 gotchas" — no LATERAL joins; JSON columns parsed manually; app-generated UUIDs; raw-SQL DDL applicator; no `drizzle-kit push` against remote.
- `CLAUDE.md` §"Better Auth specifics" — admin auth check via `requireAdmin()` first await, `trustedOrigins` for cross-origin POSTs.
- `.planning/STATE.md` — current project state, post-launch readiness.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **shadcn Dialog primitive** (already installed) — picker modal foundation.
- **`requireAdmin()`** in `src/lib/auth-helpers.ts` — admin guard for all server actions.
- **`writeUpload`** image-pipeline (Phase 7) — NOT needed here (colours don't upload images).
- **react-hook-form + Zod + drizzle-zod** — admin form validation stack used by coupons/categories/etc. Mirror for `/admin/colours` create/edit form.
- **`crypto.randomUUID()`** — app-generated UUID pattern. Use for `colors.id`.
- **shadcn Table primitive** — used in coupons/categories list pages. Mirror for `/admin/colours` list with hex-swatch preview cell.
- **Phase 17 Bulk Toolbar** in `variant-editor.tsx` — possibly reusable when batch-adding colours via picker (per-row optimistic add vs single confirm).

### Established Patterns

- **Manual hydration over `db.query.findMany({ with: ... })`** — every `colors` join MUST be manual. See `getProduct` / `getProducts` in `src/actions/products.ts` for reference shape.
- **Reactivity Contract (AD-06)** — Pattern A (optimistic + rollback) for field edits in `/admin/colours` list; Pattern B (`getVariantEditorData` refetch) when picker confirm changes variant editor shape.
- **Raw-SQL DDL applicator** — Phase 18 schema migration MUST land via raw SQL matched byte-for-byte to Drizzle schema, applied with `dotenv -e .env.local -- node scripts/<migration>.cjs` style, not `drizzle-kit push`.
- **Admin guide articles** — Phase 17 added `src/content/admin-guide/products/variants-sizes.md`. Phase 18 adds `src/content/admin-guide/products/colours.md` (rendered via `src/lib/admin-guide-generated.ts`).
- **Server-action structure** — first `await requireAdmin()`, then Zod parse, then DB op, then `revalidatePath` / return shape. See `src/actions/admin-coupons.ts`.

### Integration Points

- `src/components/admin/variant-editor.tsx` — Picker modal mounted here. Triggered when option name is "Color"/"Colour" (case-insensitive). Existing freeform `name + swatchHex` inputs stay; gain a sibling "Pick from library" button. Confirm calls `attachLibraryColours(productId, optionId, colorIds[])` action which inserts `product_option_values` rows with `color_id` populated, then refetches via `getVariantEditorData`.
- `src/components/store/variant-selector.tsx` — Already detects Colour-style options at line 188. Phase 18 ensures `aria-label` includes name; visible name renders below swatch (always — refactor existing hover-only path).
- `src/app/(store)/shop/page.tsx` — Extend `SearchParams` type with `colour?: string`; pass to `resolveProducts`. Add Colour accordion to sidebar via new `<ColourFilterSection />`. Mobile: nest under existing chip strip or add a second strip.
- `src/lib/catalog.ts` — When loading `/shop` filtered list, JOIN `colors` to get `is_active = true` ∩ `p.is_active = true` colour list for the sidebar render data.
- `src/actions/variants.ts` — `renameOptionValue` already accepts `swatchHex`. Phase 18 adds `attachLibraryColours`, `cascadeRenameLibraryColour` (covers diff-aware UPDATE), `detachLibraryColour`. Existing freeform path untouched.

</code_context>

<specifics>
## Specific Ideas

- **Admin sees codes; customer never sees codes.** Bambu RFID and Polymaker SKU codes appear in `/admin/colours` table, picker rows, and CRUD forms. They are NEVER rendered on PDP, /shop, cart, or any customer-facing surface. Server-side responses to public storefront queries must omit `code`, `previous_hex`, `family_type`, `family_subtype`. Two query helpers: `getColourPublic(id)` (returns name/hex only) and `getColourAdmin(id)` (full row).
- **Multi-select picker confirm = single transaction**, mirroring Phase 17 bulk-edit pattern. Server action receives `colorIds[]`, opens transaction, inserts N `product_option_values` rows, returns updated variant editor payload via `getVariantEditorData`.
- **PDP swatch grid name visibility**: refactor variant-selector.tsx — when `swatchHex` set, render swatch + name `<span>` below it (currently name shows in different conditions per existing code). Same component, both options use same label slot, with hex circle replacing pill background for Colour-style options.
- **Slug suffix on cross-brand collision**: at insert time in seed script, check if base slug exists. If yes, append `-bambu` or `-polymaker`. Future manual additions go through same helper. Slug uniqueness enforced via UNIQUE index on derived slug expression — actually, since slug is derived not stored, enforce uniqueness at insert by querying first (small table).

</specifics>

<deferred>
## Deferred Ideas

- **Per-colour pricing UI** — variant editor already does it; defer if real demand emerges (Phase 19+).
- **Bulk colour assignment across products** — out of scope per user. Backlog candidate.
- **Live HTML re-import** — out of scope; admin uses manual form for new colours.
- **Colour family grouping in /shop filter** (Red/Blue/Green sets) — only exact-name match for now.
- **Multi-language colour names** — English only for Malaysia launch.
- **Customer hex-similarity filter** ("show me all greens") — exact-name only.
- **`/admin/colours` bulk import via CSV** — admin manual form is enough for ~50–100 row scale.
- **Phase 19: User & Role Management** — new phase already stubbed in roadmap (RBAC + per-feature toggle).

</deferred>

---

*Phase: 18-colour-management*
*Context gathered: 2026-04-26*
