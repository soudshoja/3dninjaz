# Phase 18: Colour Management - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-26
**Phase:** 18-colour-management
**Areas discussed:** HTML seed parser strategy, Picker modal UX, Cascade rename vs live join, /shop filter pattern

---

## HTML Seed Parser Strategy

### Q1: Parser approach

| Option | Description | Selected |
|--------|-------------|----------|
| Regex + Function-eval | Read file, regex-match `const data = (...)`, `new Function("return " + body)()`. Zero deps. | ✓ |
| Cheerio + script extraction + Function-eval | Use cheerio to find `<script>` tag, get inner text, then Function-eval. | |
| External JS parser (acorn) | Use acorn to parse JS object literal AST. Heaviest. | |

**User's choice:** Regex + Function-eval (Recommended).
**Notes:** Inputs are repo-controlled, eval risk acceptable.

### Q2: oldHex handling (Polymaker has both `hex` + `oldHex` on ~30 entries)

| Option | Description | Selected |
|--------|-------------|----------|
| Use current `hex` only, ignore `oldHex` | Simpler schema. | |
| Store both `hex` + `previous_hex` columns | Library tracks the change; admin sees both; PDP shows current. | ✓ |
| Store as separate library entry per packaging | Two rows per renamed colour. Rejected upfront. | |

**User's choice:** Store both `hex` + `previous_hex` columns.
**Notes:** SPEC schema gains `previous_hex varchar(7) NULL`.

### Q3: Family schema

| Option | Description | Selected |
|--------|-------------|----------|
| Free-form string from section's `title` field | Human-readable family names. | |
| Enum (PLA/PETG/TPU/CF/Other) | Coarser, loses subtype nuance. | |
| Two columns: `family_type` + `family_subtype` | Most expressive. | ✓ |

**User's choice:** Two columns.
**Notes:** SPEC delta — original SPEC.md said single `family` varchar(32). Update during planning.

### Q4: Seed scope

| Option | Description | Selected |
|--------|-------------|----------|
| Seed everything from both files | No pre-filter; ~100+ rows. | ✓ |
| Seed only PLA Basic + PETG Basic from each brand | Conservative ~30-40 rows. | |
| Configurable in seed script (`--include=` flag) | Flag-driven. | |

**User's choice:** Seed everything from both files.

---

## Picker Modal UX

### Q1: Modal type

| Option | Description | Selected |
|--------|-------------|----------|
| shadcn Dialog | Existing admin pattern. Centered modal max-width ~720px. | ✓ |
| vaul Drawer (bottom sheet) | Mobile-first. Wastes desktop vertical space. | |
| Inline side panel | Slides in from right; tight on smaller laptops. | |

**User's choice:** shadcn Dialog.

### Q2: Search

| Option | Description | Selected |
|--------|-------------|----------|
| Client-side filter on full library | Fetch all `is_active=true` once; JS filter. Instant. | ✓ |
| Server-side with debounce | Each keystroke hits server; latency. | |

**User's choice:** Client-side filter on full library.

### Q3: Row content (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Hex chip + name (baseline) | Always shown. | ✓ |
| Brand badge (Bambu/Polymaker/Other) | Coloured chip. | ✓ |
| Family type + subtype | Dual chip. | ✓ |
| Code | Mono font, small. | ✓ |

**User's choice:** All four.

### Q4: Confirm UX

| Option | Description | Selected |
|--------|-------------|----------|
| Stage → "Add N colours" button at bottom | Single batch action. Pattern B refetch. | ✓ |
| Live add on each tick | N round-trips, partial-state risk. | |

**User's choice:** Stage + single batch action.

---

## Cascade Rename vs Live Join

### Q1: Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Keep SPEC default — denormalized + cascade UPDATE | Hot paths untouched. | ✓ |
| Switch to live-join | Single source of truth, but full query refactor. | |

**User's choice:** Keep SPEC default.

### Q2: Field scope on cascade

| Option | Description | Selected |
|--------|-------------|----------|
| Both `value` and `swatch_hex` | Library is authoritative. | ✓ |
| Only `swatch_hex` (preserve product-level name) | Defeats library-as-truth model. | |

**User's choice:** Both value and swatch_hex.

### Q3: Manual edit conflict

| Option | Description | Selected |
|--------|-------------|----------|
| Library wins; overwrite manual edit | Simpler. | |
| Manual wins; skip rows where `value` doesn't match expected library snapshot | Diff-aware cascade. | ✓ |
| Block library rename when any product has manual override | Most defensive, most friction. | |

**User's choice:** Manual wins; diff-aware cascade.
**Notes:** Implementation reads pre-rename `colors.name` then issues `UPDATE pov SET ... WHERE color_id = :id AND value = :old_name`.

### Q4: Transaction scope

| Option | Description | Selected |
|--------|-------------|----------|
| Single transaction up to ~1000 rows; warn past that | Adequate for current scale. | ✓ |
| Always single transaction, no limit | Risky long-term. | |
| Chunked updates + reconcile | Industrial-grade overkill. | |

**User's choice:** Single transaction up to ~1000; warn past that.

---

## /shop Filter Pattern

### Q1: Sidebar slot

| Option | Description | Selected |
|--------|-------------|----------|
| Below categories, collapsible accordion | First 12 chips visible, "Show all". | ✓ |
| Floating filter card above products | Always visible, eats vertical space. | |
| Own dropdown in mobile chip strip + sidebar section | Most discoverable on mobile. | |

**User's choice:** Below categories, collapsible accordion.

### Q2: URL slug source

| Option | Description | Selected |
|--------|-------------|----------|
| Derive lowercase-hyphen from name | No dedicated column; cross-brand collisions handled by `-<brand>` suffix. | ✓ |
| Dedicated `slug` column on `colors` (UNIQUE) | Schema cost, no collision risk. | |

**User's choice:** Derive lowercase-hyphen from name.

### Q3: Chip rendering

| Option | Description | Selected |
|--------|-------------|----------|
| Hex circle (12px) + name pill | Visual + textual. WCAG-safe active state. | ✓ |
| Hex circle only, name on hover/tap | Cleaner, worse a11y. | |
| Name pill only (no swatch) | Loses the visual hook. | |

**User's choice:** Hex circle + name pill.

### Q4: Available list calculation

| Option | Description | Selected |
|--------|-------------|----------|
| Compute on each /shop render via DISTINCT JOIN | Manual hydration per no-LATERAL rule. | ✓ |
| Materialized view refreshed on change | Faster reads, more code. Overkill. | |
| Static list of all `is_active=true` colours | Empty results when clicked. Worse UX. | |

**User's choice:** Compute on each /shop render via DISTINCT JOIN.

---

## Claude's Discretion

- Admin guide article copy and placement (`src/content/admin-guide/products/colours.md`)
- Picker error-state copy
- Custom one-off freeform value visibility label in editor
- Slug collision UX in /admin/colours form
- "Show all" expansion threshold (default 12 chips)

## Deferred Ideas

- Per-colour pricing UI
- Bulk colour assignment across products
- Live HTML re-import
- Colour family grouping in /shop filter (Red/Blue/Green sets)
- Multi-language colour names
- Customer hex-similarity filter
- /admin/colours bulk import via CSV
- Phase 19: User & Role Management (already stubbed in roadmap)
