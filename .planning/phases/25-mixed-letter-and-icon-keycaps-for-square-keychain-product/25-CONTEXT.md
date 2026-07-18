# Phase 25: Mixed Letter + Icon Keycaps (Square Keychain) - Context

**Gathered:** 2026-07-19
**Mode:** auto (decisions pre-locked through direct conversation with user — no interactive discuss-phase re-asking)
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the existing "keychain" configurable product (built in Phase 19, `productType='configurable'`) so that, **for the square shape only**, each keycap slot in the customer's sequence can be either a LETTER (today's behaviour, unchanged) or an ICON (new — picked from a 34-item catalog, fixed colours). Round keychains are untouched. This phase delivers: schema support for mixed slot sequences, the icon asset library, admin config UI, storefront rendering, order/production data handling, and pricing.

</domain>

<decisions>
## Implementation Decisions

### D-01 — Scope lock: square shape only
- This feature applies ONLY when `products.keychainShape = 'square'`.
- Round keychain product/config/production path is completely unmodified — do not touch round-shape code paths (`src/lib/keychain-fields.ts` round handling, round batching in `admin-production.ts`).

### D-02 — Shared slot cap (not additive)
- The existing "Your name" text field's `maxLength` (from `TextFieldConfig`, `src/lib/config-fields.ts`) becomes the **total shared slot cap** across letters + icons combined.
- Example: max=9 → customer can fill up to 9 slots in ANY mix of letters and icons (9 letters, 9 icons, 5+4, etc.). Do not implement separate per-type caps.

### D-03 — Letter slots: unchanged behaviour
- Letter slots keep today's exact behaviour: customer picks Base / Clicker / Letter colours (the 3 existing locked `colour` config fields from `src/lib/keychain-fields.ts`) and these apply per-letter as they do today.
- No change to letter print structure: BASE (1 colour, alone) + CLICKER+LETTER (2-colour, together).

### D-04 — Icon slots: fixed colours, no picker
- Icon slots do NOT show the Base/Clicker/Letter colour pickers. Colours are fully fixed per icon design (verified from actual mesh geometry, not guessed — see `<specifics>`).
- Customer's only choice for an icon slot is WHICH icon from the catalog.

### D-05 — New fieldType for mixed sequences
- Current `FieldType` union (`src/lib/config-fields.ts`): `"text" | "number" | "colour" | "select" | "textarea"`. Also mirrored as a DB `mysqlEnum` on `product_config_fields.fieldType` (`src/lib/db/schema.ts:284`) — **adding a new fieldType requires a DB migration** (raw SQL `ALTER TABLE ... MODIFY COLUMN fieldType ENUM(...)`, per the project's established MariaDB migration pattern — see CLAUDE.md MariaDB gotchas).
- Planner/researcher should decide the exact new fieldType name and whether it fully replaces the locked "Your name" text field on square-keychain products, or works alongside it. Claude's Discretion on the exact mechanism, but the config shape must express: shared max slot count, letter constraints (maxLength equivalent, allowedChars, uppercase, profanityCheck — same as `TextFieldConfig` today), and an icon library reference (list of allowed icon ids/labels/image URLs, analogous to how `ColourFieldConfig.allowedColorIds` references the colour library).

### D-06 — Value serialization for mixed sequences
- `ConfigurationData.values` is `Record<string, string>` (fieldId → string) — a single string per field. The new field type must serialize an ordered sequence of typed slots (letter vs icon) into this single string slot. Claude's Discretion on exact encoding (e.g. delimited tokens, JSON-in-string) as long as it round-trips losslessly and is parseable server-side for pricing/production.
- `computedSummary` (human-readable, e.g. today's `"ATHIYYA" (7 your name) · Magenta base · Periwinkle clicker · Candy letter`) needs a new format that can represent a mixed sequence, e.g. showing which slots are letters vs named icons. `keychain-parts.ts`'s regex parser (`PARTS_RE`, `NAME_RE`, `LETTER_COUNT_RE`) currently assumes a single quoted name string — this needs rework or a parallel/replacement parser for square-mixed keychains. Existing ROUND keychain orders and any historical SQUARE letter-only orders must continue to parse correctly (backwards compat — do not break `keychain-parts.test.ts` coverage for the existing format).

### D-07 — Icon asset pipeline
- Source: two Bambu Studio 3mf files at `D:\Downloads\M batch3 keycaps p2s.3mf` and `D:\Downloads\M batch3 keycaps a1.3mf` — same 34-design set, sliced twice for two printers (treat as ONE design set). Plain zip archives: `3D/3dmodel.model` (geometry), `Metadata/top_N.png` (512x512-ish top-down render per plate N, 1-34), `Metadata/model_settings.config` (part/colour/extruder metadata), `Metadata/plate_N.json` (per-plate object name/bbox).
- Extract all 34 `top_N.png` renders fresh from the source 3mf (a prior investigation's extraction went to a non-persistent temp dir — nothing persisted in the repo yet).
- Store per project's existing local-filesystem convention (`public/uploads/products/<uuid>/` pattern per CLAUDE.md pivots — planner should confirm exact path convention for a shared icon library vs per-product).
- Name each of the 34 icons per the catalog in `<specifics>` below.

### D-08 — All 34 icons included, including franchise-logo designs
- User was informed (twice) that 13 of the 34 designs are licensed franchise logos (10 Marvel + 3 Nintendo) carrying real trademark/DMCA/C&D risk on a live paid store, and explicitly confirmed: **include all 34, sold live to customers, user accepts the risk.**
- Do NOT re-flag, gate, filter, or exclude any icons on IP grounds during this phase — this decision is final and owned by the user.

### D-09 — Admin: icon library management
- Admin needs a way to manage/view the 34-icon library as selectable options for icon slots. Likely reuses the `select`-fieldType option-picker pattern (`SelectFieldConfig.options[].imageUrl` already supports per-option images) or a dedicated icon-picker dialog analogous to `ColourPickerDialog` (Phase 18, reused in Phase 19 D-08) — Claude's Discretion on exact component reuse vs new component, but prefer reusing the existing option/image patterns over inventing a new one.

### D-10 — Storefront rendering
- `src/components/store/configurable-product-view.tsx` and `src/components/store/keychain-preview.tsx` must render mixed sequences: each slot shows either a letter glyph (today's rendering, with its chosen colours) or the icon's image, in order.
- When a slot is icon-type, the Base/Clicker/Letter colour controls for that slot must not appear (D-04).

### D-11 — Production batching: icon slots need a 3rd part group
- Today (`src/actions/admin-production.ts`): letters batch into BASE (single colour, alone) and CLICKER+LETTER (two colours, together) groups, split by shape (`keychainShape`) and composite colour key.
- Icon slots print as: fixed WHITE base/shell + 1-2 accent-colour parts baked into the icon design (verified geometry — see `<specifics>`). This does NOT match the letter's Base/Clicker/Letter colour-driven grouping — icon slots need their own grouping key (by icon id, since colours are fixed per icon, not customer-chosen). Planner must design how mixed-sequence orders batch: likely each keychain order still produces one BASE batch entry per letter (unchanged) PLUS one icon-print entry per icon slot (new group, keyed by icon id not by colour).

### D-12 — Pricing/weight per slot type
- Existing tier pricing (`lookupTierPrice`, `products.priceTiers`/`maxUnitCount`/`unitField`) looks up price by the text field value's `.length` — i.e., today, slot count = letter count. With mixed sequences, slot count = letters + icons combined (per D-02), so tier lookup should key off total slot count, not literal string length of a "name" — needs adjustment if letters and icons no longer share a single literal string value the same way.
- Icon keycap mesh geometry differs in volume from a letter keycap (per `<specifics>`, icon base is a full 19.16x19.16x5.34mm shell vs letter's base+clicker+letter stack) — planner/researcher should determine if this needs a distinct per-unit weight for icon slots vs letter slots for shipping-weight purposes (see `src/lib/option-weight.ts` pattern), or if a flat approximation is acceptable for v1.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing keychain/configurable-product architecture (Phase 19 — the origin of this system)
- `.planning/phases/19-made-to-order-product-type/19-CONTEXT.md` — full architecture this phase extends: `productConfigFields` table, `FieldType` enum, `ConfigurationData` cart/order shape, tier pricing, admin configurator builder, PDP rendering branch. D-01 through D-17 all apply as prior art.
- `.planning/phases/19-made-to-order-product-type/19-SPEC.md` — original requirements for the configurable product type.
- `src/lib/config-fields.ts` — `FieldType` union, all Zod config schemas, `ensureConfigJson` dispatch, `ensureConfigurationData`, `lookupTierPrice`. Any new fieldType must be added here + to the DB enum.
- `src/lib/db/schema.ts:276-284` — `productConfigFields` table definition, `fieldType` DB-level `mysqlEnum` (migration required to widen).
- `src/lib/keychain-fields.ts` — seeds the 4 locked fields (text "Your name", colour Base/Clicker/Letter) for keychain products.
- `src/lib/keychain-parts.ts` + `src/lib/keychain-parts.test.ts` — regex parser from `computedSummary` string to `KeychainParts`; needs rework or a parallel path for mixed sequences. Test coverage must keep passing for existing (letter-only) format.
- `src/actions/admin-production.ts:310-560` — keychain batch production logic (BASE / CLICKER+LETTER grouping, shape-split per PRs #188/#189).
- `src/components/admin/keychain-batches.tsx` — admin production batch UI.
- `src/components/store/configurable-product-view.tsx` — PDP root for configurable products, field-type dispatch.
- `src/components/store/keychain-preview.tsx` — live preview component (currently a generic SVG name-strip per Phase 19 D-10).
- `src/components/admin/product-form.tsx`, `src/components/admin/tier-table-editor.tsx`, `src/components/admin/product-type-radio.tsx` — admin product config surfaces.

### Prior art for picker/library UI patterns
- Phase 18 (Colour Management) — `.planning/phases/18-colour-management/18-CONTEXT.md` — `ColourPickerDialog` component pattern (multi-select mode), reused in Phase 19 D-08. Consider reusing/adapting for the icon library picker.

### Project-wide conventions (CLAUDE.md — see root CLAUDE.md "Pivots & Production Quirks")
- MariaDB 10.11: no LATERAL joins (manual multi-query hydration), JSON columns are LONGTEXT (always parse via `ensure*` helpers), app-generated UUIDs via `crypto.randomUUID()`, raw SQL DDL migrations verified via `SHOW CREATE TABLE` (never `drizzle-kit push` against remote).
- Local image storage convention: `public/uploads/products/<uuid>/`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ensureConfigJson` fieldType-dispatch pattern (`src/lib/config-fields.ts`) — add new fieldType the same way `textarea` was added (quick task 260430-icx) as a precedent for how a new field type gets threaded through Zod schema, DB enum, and render dispatch.
- `ColourPickerDialog` (Phase 18) — multi-select picker dialog pattern; candidate to adapt for icon-library selection in the admin configurator.
- `SelectFieldConfig.options[].imageUrl` — existing per-option image support; the icon catalog's "customer picks which image" shape is structurally similar to a select field's options.
- Pattern B reactivity (refetch after shape-changing admin ops) already established for configurator field CRUD (Phase 19 D-16) — apply the same pattern to icon-library CRUD if a new admin surface is built.

### Established Patterns
- Every JSON column read site must go through an `ensure*` helper (MariaDB LONGTEXT gotcha) — any new persisted JSON (icon library list, mixed-sequence value encoding) needs its own `ensure*` helper following this convention.
- Tier pricing keys off a single field's value length (`lookupTierPrice`) — mixed slot counting breaks the "value literally is the name string" assumption; needs an explicit slot-count concept rather than relying on `.length` of a raw string.

### Integration Points
- New/changed fieldType flows through: DB migration (enum widen) → `config-fields.ts` (Zod schema + type) → admin configurator builder + new field modal → `configurable-product-view.tsx` render dispatch → `keychain-preview.tsx` visual preview → cart line `configurationData` → order capture → `keychain-parts.ts` (or its replacement) → `admin-production.ts` batching.

</code_context>

<specifics>
## Specific Ideas

### Icon design mesh facts (verified from actual mesh geometry — not guessed)
Every icon keycap object = fixed WHITE base/shell (19.16 x 19.16mm footprint, 5.34mm deep, sits at lowest Z — this is the full physical keycap body, extruder/AMS slot 11, hex `#FFFFFF`), plus 1-2 thin accent-colour parts stacked on top (0.4-0.6mm thick) forming the icon graphic. Black accent, where present, consistently uses extruder 1 (hex `#020202`). Accent colours vary per icon (e.g. green for alien's face, yellow+green for the xmas tree's star/foliage).

### Full 34-icon catalog (all approved for inclusion, including franchise logos — see D-08)
1. Alien (green face, black eyes)
2. Skull (white/black)
3. Game controller / gamepad
4. Ninja face
5. Wifi signal
6. Tennis ball
7. Spotted green ball (possible Yoshi egg — low-confidence ID, worth a visual double-check during asset extraction)
8. Baseball (white, red stitching)
9. Pixel-art red heart (8-bit style)
10. Christmas tree (green, gold star)
11. Snowflake
12. Wrapped gift/present (red bow, green wrap)
13. Santa hat
14. Reindeer face (Rudolph, red nose)
15. Snowman face (black top hat)
16. Bell (gold/yellow)
17. Christmas stocking (red/green)
18. Holly wreath (green, red bow)
19. Hazard/radioactive symbol (green/black trefoil)
20. Captain America shield
21. Spider-Man logo
22. Iron Man helmet
23. Avengers "A"
24. Black Panther (cat face)
25. Wonder Woman "WW"
26. Superman "S" shield
27. Batman logo (bat oval emblem)
28. Luigi "L" (green)
29. Mario "M" (red)
30. Super Mario power star
31. Golf ball (white, dimpled)
32. Candy cane
33. Thor's hammer (Mjolnir)
34. Hawkeye logo (purple/gray circular emblem — confirmed by direct visual check)

### Source files
- `D:\Downloads\M batch3 keycaps p2s.3mf` (sliced for Bambu P2S)
- `D:\Downloads\M batch3 keycaps a1.3mf` (sliced for Bambu A1)
- Same 34-design set in both — do not treat as 68 designs.

</specifics>

<deferred>
## Deferred Ideas

- Mixed letter+icon for ROUND keychains — explicitly out of scope per D-01. Round stays letter-only for now. Could be a future phase if the user wants parity later.

None else — discussion stayed within phase scope (this phase's scope was defined through direct conversation with the user prior to running `/gsd-discuss-phase`, not through the interactive gray-area flow).

</deferred>

---

*Phase: 25-mixed-letter-and-icon-keycaps-for-square-keychain-product*
*Context gathered: 2026-07-19*
