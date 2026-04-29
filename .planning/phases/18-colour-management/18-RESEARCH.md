# Phase 18: Colour Management — Research

**Researched:** 2026-04-26
**Domain:** Reusable colour library + admin CRUD + picker integration into existing variant system
**Confidence:** HIGH (all decisions locked in CONTEXT.md; pattern lifted from Phase 5 coupons + Phase 16/17 variants)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Schema**
- **D-01:** Seed parser uses **Regex + `Function`-eval** to extract `const data = {...}` block from each HTML file. Zero deps; both files share the shape `<script>const data = { ... }</script>`. Match `const data = (\{[\s\S]*?\});`, eval body via `new Function("return " + body)()`. Bounded input, repo-controlled — eval risk acceptable.
- **D-02:** Schema includes a `previous_hex` varchar(7) NULL on `colors`. Polymaker carries `oldHex` on ~30 entries.
- **D-03:** Seed everything from both HTML files — no pre-filter. Admin soft-archives lines they don't sell.
- **D-04:** Family schema = TWO columns instead of SPEC's single `family`:
  - `family_type` ENUM('PLA','PETG','TPU','CF','Other') — broad filament type.
  - `family_subtype` VARCHAR(48) — fine-grained line name (e.g. 'Matte', 'Silk', 'Translucent', 'Basic', 'CF', 'Tough').
  **(SPEC delta — update SPEC.md acceptance #1.)**
- **D-14:** Slug = lowercase-hyphen from name. **No dedicated slug column** — derive at runtime. Cross-brand collision → append `-<brand>` suffix at insert time. Helper `slugifyColourName(name, brand)` lives in `src/lib/colours.ts`.

**Picker UX**
- **D-05:** Picker modal = shadcn Dialog. Centered, max-width ~720px. Desktop-primary; admin-only.
- **D-06:** Search = client-side filter on full library. Single fetch on open (~100 rows ≈ 30 KB JSON). Case-insensitive substring match on `name + brand + family_subtype + code`. No virtualization.
- **D-07:** Picker row content (admin-only): hex chip (24px) + name + brand badge (Bambu/Polymaker/Other) + family_type chip + family_subtype chip + code (mono).
- **D-08:** Confirm = stage selections + single batch "Add N colours" button. One server action call; Pattern B refetch.

**Cascade Rename**
- **D-09:** Denormalized cache + cascade UPDATE transaction (NOT live-join). `pov.value` and `pov.swatch_hex` stay as snapshots.
- **D-10:** Cascade scope = both `value` and `swatch_hex`.
- **D-11:** Diff-aware (manual wins). UPDATE skips rows where current `value` no longer matches the previous library snapshot. Single transaction reads pre-state + writes; both fields cascade together or not at all per row.
- **D-12:** Single transaction up to ~1000 rows; warning past that.

**/shop Filter**
- **D-13:** Sidebar slot = below categories, collapsible accordion. Default open with first 12 chips visible; "Show all" expands.
- **D-15:** Chip = hex circle (12px) + name pill. Active state = pill background tinted with hex (alpha-mixed for WCAG contrast against text).
- **D-16:** Available list = computed on each /shop render via DISTINCT JOIN. Manual hydration in `src/actions/products.ts` style to dodge LATERAL.

### Claude's Discretion

- Admin guide article placement and copy (a "Managing colours" entry in `src/content/admin-guide/products/` mirroring existing `variants-sizes.md`).
- Picker error-state copy (e.g. "No colours match 'galxy'").
- Custom one-off freeform value visibility in variant editor — keep current text+colour-picker inputs but label them "Custom (not in library)" to nudge admin toward the picker.
- Slug collision UX in /admin/colours form (inline error if slug already taken before suffix added).
- "Show all" expansion threshold (12 chips visible default — reasonable; can tune in research).

### Deferred Ideas (OUT OF SCOPE)

- Per-colour pricing UI (variant editor already does it).
- Bulk colour assignment across products.
- Live HTML re-import post-seed (admin uses manual form).
- Colour family grouping in /shop filter (Red/Blue/Green sets) — exact-name only.
- Multi-language colour names (English only).
- Customer hex-similarity filter ("show me all greens").
- `/admin/colours` bulk import via CSV.
- Phase 19: User & Role Management (separate phase).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (paraphrased from 18-SPEC.md) | Research Support |
|----|-------------------------------------------|------------------|
| REQ-1 | New `colors` table with documented columns + UNIQUE(brand, code) | Wave 1 schema + raw-SQL DDL section |
| REQ-2 | `tsx scripts/seed-colours.ts` parses both HTML files idempotently | Wave 1 parser section + acceptance signals |
| REQ-3 | `/admin/colours` CRUD (list, create, edit, archive, delete) | Wave 2 admin route mirror of coupons |
| REQ-4 | In-use deletion guard returns `{code:"IN_USE", products:[...]}` | Wave 2 server-action shape |
| REQ-5 | Per-product picker modal in variant editor; `color_id` FK on `pov` | Wave 3 picker integration + reactivity Pattern B |
| REQ-6 | Colour counts as 1 of 6 axes (no special case) | Existing 6-cap in `addProductOption` already enforces |
| REQ-7 | PDP swatch grid renders hex + name always; no `code` customer-facing | Wave 4 variant-selector refactor + public/admin query split |
| REQ-8 | /shop sidebar colour multi-select chip filter, URL-synced | Wave 4 shop filter extension + DISTINCT-JOIN query |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **MariaDB 10.11**: NO LATERAL joins. `db.query.X.findMany({ with: {...} })` compiles to LATERAL and fails with `ER_PARSE_ERROR`. Use manual multi-query hydration per `src/actions/products.ts:328-426`.
- **Drizzle migrations**: `drizzle-kit push` against the cPanel remote hangs. Use raw-SQL DDL applicators (`scripts/phaseXX-migrate.cjs`) byte-aligned to Drizzle schema. Verify with `SHOW CREATE TABLE`. All Phase 5/6/7/16/17 migrations follow this pattern.
- **Charset**: every new table must be `ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci` (FK constraints require identical charset to `products`/`product_options`).
- **App-generated UUIDs**: `crypto.randomUUID()` on INSERT for `colors.id`. Don't use SQL `UUID()`.
- **JSON columns**: stored as LONGTEXT; mysql2 does not auto-parse. (Phase 18 has zero JSON columns, but do not "fix" any other code that uses `ensureImagesArray`.)
- **Admin auth**: `requireAdmin()` is the FIRST `await` in every admin server action (CVE-2025-29927). `(session.user as { role: string }).role`.
- **`isomorphic-dompurify` is BANNED** — already replaced. Phase 18 has no email/HTML output, so this is a non-issue.
- **Deploy**: app at `https://app.3dninjaz.com/` (subdomain root, no basePath).
- **No `router.refresh()` in mutation paths** (AD-06). Pattern A optimistic OR Pattern B refetch.
- **`trustedOrigins`**: no new origin needed for Phase 18.

## Summary

Phase 18 is a layered extension. The foundation (variant system, swatch_hex column, Pattern B refetch contract) already exists from Phase 16/17 — Phase 18 adds:
1. A new `colors` library table + raw-SQL migration (mirror Phase 17 migrate).
2. A one-shot HTML seed script (regex + `Function`-eval per D-01).
3. An admin CRUD module at `/admin/colours` (clone the coupons admin tree).
4. A "Pick from library" Dialog inside the existing variant editor (additive, gated on option name match).
5. A diff-aware cascade-update mechanic for library renames.
6. A `/shop` sidebar colour chip filter (extends the existing `?category=&subcategory=` URL grammar).
7. A PDP swatch refactor so the colour name is always visible.

Nothing new is being invented architecturally — every pattern has a working precedent in the codebase. The only real engineering risk is the cascade-rename diff-aware UPDATE (must be a single transaction, must skip manually-edited rows) and the seed parser (must handle Polymaker's `dual` and `gradient` sections that have a different shape). Both are addressed below.

**Primary recommendation:** Execute as 4 sequential waves, dependency-chained:
- **Wave 1** = schema migration + seed script (foundation).
- **Wave 2** = `/admin/colours` CRUD + cascade rename mechanics (admin-facing).
- **Wave 3** = variant-editor picker integration (admin colour selection).
- **Wave 4** = PDP swatch name + /shop chip filter + admin guide article (customer-facing + docs).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `colors` table CRUD | API / Backend (server actions) | Database | All mutations gated by `requireAdmin()`; no client-side mutation paths. |
| HTML seed parser | Backend (one-shot Node script) | — | Runs offline against repo files. Never touched at request time. |
| Admin colour list / form | Frontend Server (RSC) + Backend (server actions) | — | Coupons precedent: server component reads, client form posts to server action. |
| Picker modal | Browser (client component, shadcn Dialog) | API (single `attachLibraryColours` call on confirm) | All search/filter is client-side per D-06. |
| Cascade rename UPDATE | Database (in transaction) | API (orchestrator) | MariaDB transaction wraps SELECT-then-UPDATE; app reads pre-state to enforce diff-aware. |
| PDP swatch render | Browser (client) | Frontend Server (passes hydrated data) | Variant-selector is already a client component; just changes its render. |
| /shop colour filter | Frontend Server (RSC) + Database (DISTINCT JOIN) | Browser (chip toggle posts URL) | Existing `?category=` pattern is also URL-synced + server-side filtered. |
| Public-vs-admin colour exposure | API / Backend (split helpers) | — | `getColourPublic` strips `code/previous_hex/family_*`; `getColourAdmin` returns full row. |

## Standard Stack

### Core (already installed — do NOT add new deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Drizzle ORM | 0.41.x | Schema definition + queries | Existing project ORM; `mysqlTable` + manual hydration pattern |
| mysql2 | latest | MariaDB driver | Existing; supports `db.transaction()` |
| Better Auth (`requireAdmin`) | 1.6.2 | Admin gate | Existing; first `await` in every server action |
| shadcn Dialog | (copied components) | Picker modal | Already used in variant-editor delete dialogs (`src/components/admin/variant-editor.tsx:639+`) |
| react-hook-form-style native form | — | Form on /admin/colours | Coupons form uses bare `<form onSubmit>`+ `useTransition` (no react-hook-form). Mirror exactly. |
| Zod (`drizzle-zod`) | existing | Validation schemas in `src/lib/validators.ts` | Already in project. Add `colourSchema`. |

### Verified versions (none added — all reused)
No new packages. `npm view` not run because no install is required.

### Alternatives Considered (and rejected)

| Instead of | Could Use | Why we don't |
|------------|-----------|--------------|
| Regex + Function-eval HTML parser (D-01) | `cheerio` / `jsdom` | New dep. Files are repo-controlled. Eval risk = zero. |
| shadcn Dialog (D-05) | Base UI Modal | Project uses shadcn Dialog already; consistent. |
| Live JOIN per render | Denormalized cache + cascade (D-09) | Live JOIN = LATERAL on Drizzle relational queries; manual JOIN doable but dirties hot paths. |
| Client-side URL state library | Plain `?colour=a,b` query string | Existing /shop already uses plain query. Don't bring in `nuqs`. |

## HTML Parser — Detailed Plan

### Regex Strategy (locked D-01)

Both HTML files share the structure:

```html
<script>
const data = {
  "<section-key>": {
    label: "...",
    title: "...",
    note: "...",
    translucent: true,                  // optional
    isDual: true,                       // Polymaker only
    isGradient: true,                   // Polymaker only
    banner: "<strong>...</strong>",     // contains nested HTML — DO NOT match end ; here
    bannerType: "focus",
    colors: [
      { name: "Translucent Clear", code: "32101", hex: "#F5F5F5" },
      { name: "Matte Muted White", code: "CA04028", hex: "#BBADA4", oldHex: "#AFA198" },
      { name: "Translucent Natural", code: "CA02037", hex: "#E8E6D0", td: "21" },
      { name: "Silk Aubergine", code: "CA03022", hex1: "#C4CF4C", hex2: "#AA538E", group: "Dual Silk", desc: "Lime + Magenta" },   // Polymaker dual
      { name: "Matte Pastel Rainbow", code: "CA04055", group: "Gradient Matte" },                                                  // Polymaker gradient (no hex)
    ]
  },
  ...
};
const order = [...];
```

The regex `/const\s+data\s*=\s*(\{[\s\S]*?\});\s*\n\s*const\s+order\s*=/` anchors on the unique `const order =` immediately following — that disambiguates against any `;` inside the banner string. Confirmed by inspection of both files (`Colours/bambu-lab-colors.html:210`, `Colours/polymaker-colors.html:455`).

**Acceptance edge cases the regex+eval MUST survive:**
1. Bambu `petg-translucent` banner contains `<strong>Bambu's true CLEAR filament.</strong> Per Bambu's docs: PETG Translucent is more see-through with a crystal-clear finish (vs PLA Translucent which is frosted). For genuine clear/transparent prints use <strong>Translucent Clear (32101)</strong>.` — has periods, parens, single quotes inside double quotes. `Function`-eval handles this natively as JS string.
2. Polymaker `dual` section uses `hex1`/`hex2` instead of `hex`. Seed script must skip rows missing `hex` (or store the first hex as `hex` and the second as `previous_hex`? — **decision needed at plan time**; recommended fallback: skip dual + gradient sections entirely; admin can add manually if needed. Out-of-scope safety per D-03 ambiguity).
3. Polymaker `gradient` rows have NO `hex` field at all. Same skip recommendation.
4. Polymaker `matte` row `Matte Rose (legacy)` has `code: "—"` (em-dash). Treat as `null` code. Use `(brand, name)` as natural key when code is null/em-dash.
5. Polymaker has `td:`, `group:`, `desc:`, `note:`, `oldHex:` fields. Only `name`, `code`, `hex`, `oldHex` are persisted (D-02). `td`/`group`/`desc`/`note` are dropped silently.

### Suggested `seed-colours.ts` shape

```ts
// scripts/seed-colours.ts (run via: npx tsx scripts/seed-colours.ts)
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { colors } from "../src/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";

type ParsedColour = {
  name: string;
  code: string | null;
  hex: string;
  oldHex: string | null;
  familyType: "PLA" | "PETG" | "TPU" | "CF" | "Other";
  familySubtype: string;
  brand: "Bambu" | "Polymaker";
};

// Section-key → (familyType, familySubtype) lookup tables.
// HARD-CODED per file because section keys are stable and small.
const BAMBU_FAMILY: Record<string, { type: ParsedColour["familyType"]; sub: string }> = {
  "petg-translucent": { type: "PETG", sub: "Translucent" },
  "pla-translucent":  { type: "PLA",  sub: "Translucent" },
  "pla-basic":        { type: "PLA",  sub: "Basic" },
  "pla-matte":        { type: "PLA",  sub: "Matte" },
  "petg-hf":          { type: "PETG", sub: "HF" },
  "petg-basic":       { type: "PETG", sub: "Basic" },
  "petg-cf":          { type: "PETG", sub: "CF" },
};

const POLYMAKER_FAMILY: Record<string, { type: ParsedColour["familyType"]; sub: string }> = {
  "translucent":      { type: "PLA",  sub: "Translucent" },
  "matte":            { type: "PLA",  sub: "Matte" },
  "basic":            { type: "PLA",  sub: "Basic" },
  "polylite-pla":     { type: "PLA",  sub: "PolyLite" },
  "polymax-pla":      { type: "PLA",  sub: "PolyMax (Tough)" },
  "polylite-pla-pro": { type: "PLA",  sub: "PolyLite Pro" },
  "polysonic":        { type: "PLA",  sub: "PolySonic (HighSpeed)" },
  "silk":             { type: "PLA",  sub: "Silk" },
  "satin":            { type: "PLA",  sub: "Satin" },
  "marble":           { type: "PLA",  sub: "Marble" },
  "effects":          { type: "PLA",  sub: "Effects" },
  // skip "dual" + "gradient" — multi-hex shape not supported by single hex column
  "specialty":        { type: "Other", sub: "Specialty" },  // contains LW-PLA, PolyWood, PLA-CF mix
};

function parseHtmlFile(filePath: string, brand: "Bambu" | "Polymaker"): ParsedColour[] {
  const text = fs.readFileSync(filePath, "utf8");
  const m = text.match(/const\s+data\s*=\s*(\{[\s\S]*?\});\s*\n\s*const\s+order\s*=/);
  if (!m) throw new Error(`Could not match data block in ${filePath}`);
  const data = new Function("return " + m[1])();
  const familyMap = brand === "Bambu" ? BAMBU_FAMILY : POLYMAKER_FAMILY;

  const out: ParsedColour[] = [];
  for (const [key, section] of Object.entries(data)) {
    const fam = familyMap[key];
    if (!fam) {
      console.log(`[skip] section "${key}" — no family mapping (likely dual/gradient)`);
      continue;
    }
    const colours = (section as { colors: Array<{ name: string; code: string; hex?: string; hex1?: string; hex2?: string; oldHex?: string }> }).colors ?? [];
    for (const c of colours) {
      if (!c.hex) {
        // Skip dual (hex1/hex2) and gradient (no hex) rows.
        console.log(`[skip] ${brand}/${c.name} — no .hex (probably dual or gradient)`);
        continue;
      }
      const code = (c.code && c.code !== "—") ? c.code.trim() : null;
      out.push({
        name: c.name.trim(),
        code,
        hex: c.hex.toUpperCase(),
        oldHex: c.oldHex ? c.oldHex.toUpperCase() : null,
        familyType: fam.type,
        familySubtype: fam.sub,
        brand,
      });
    }
  }
  return out;
}

// Idempotent upsert per (brand, code) when code present, else (brand, name)
async function upsertColour(c: ParsedColour, slugify: (name: string, brand: string) => string): Promise<"insert" | "update" | "noop"> {
  const where = c.code
    ? and(eq(colors.brand, c.brand), eq(colors.code, c.code))
    : and(eq(colors.brand, c.brand), eq(colors.name, c.name), isNull(colors.code));
  const [existing] = await db.select().from(colors).where(where).limit(1);
  if (existing) {
    if (
      existing.name === c.name &&
      existing.hex === c.hex &&
      (existing.previousHex ?? null) === c.oldHex &&
      existing.familyType === c.familyType &&
      existing.familySubtype === c.familySubtype
    ) {
      return "noop";
    }
    await db.update(colors).set({
      name: c.name,
      hex: c.hex,
      previousHex: c.oldHex,
      familyType: c.familyType,
      familySubtype: c.familySubtype,
    }).where(eq(colors.id, existing.id));
    return "update";
  }
  await db.insert(colors).values({
    id: randomUUID(),
    name: c.name,
    hex: c.hex,
    previousHex: c.oldHex,
    brand: c.brand,
    code: c.code,
    familyType: c.familyType,
    familySubtype: c.familySubtype,
    isActive: true,
  });
  return "insert";
}
```

The seed script logs counts of `inserts/updates/skips/noops` at the end. **Acceptance signal: re-run = 0 inserts, 0 updates.**

### `slugifyColourName(name, brand)` helper (D-14)

```ts
// src/lib/colours.ts
export function slugifyColourBase(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function slugifyColourName(name: string, brand: string): Promise<string> {
  // Caller responsible for collision check via DB query if globally unique slug needed.
  // Default: return base; suffix only when collision detected during insert.
  return slugifyColourBase(name);
}

export async function ensureUniqueColourSlug(
  desiredBase: string,
  brand: string,
  excludeColourId?: string,
): Promise<string> {
  // Cheap because library is ≤ ~150 rows.
  const candidates = await db.select({ name: colors.name, brand: colors.brand, id: colors.id }).from(colors);
  const existingSlugs = new Set(
    candidates
      .filter((c) => c.id !== excludeColourId)
      .map((c) => slugifyColourBase(c.name)),
  );
  if (!existingSlugs.has(desiredBase)) return desiredBase;
  const suffixed = `${desiredBase}-${brand.toLowerCase()}`;
  if (!existingSlugs.has(suffixed)) return suffixed;
  // Fallback: numeric tail (rare — both Bambu and Polymaker have "Black"; -bambu/-polymaker resolves)
  let i = 2;
  while (existingSlugs.has(`${suffixed}-${i}`)) i++;
  return `${suffixed}-${i}`;
}
```

Note: per D-14 there's NO slug column. Slug is derived at runtime in two places:
1. `/shop` URL chip filter — slug computed when rendering chip; matched against `?colour=` query string slug list.
2. Picker → no slug needed at all (uses colour `id`).

So the `ensureUniqueColourSlug` helper actually serves a different purpose: **deciding when to append `-<brand>` for the customer URL slug**. Computed once when the colour is rendered into a chip and cached in memory.

A simpler runtime-only approach (recommended for the plan):

```ts
// Build slug map from a colour list, attaching -<brand> suffix only on collision.
export function buildColourSlugMap(colourList: { id: string; name: string; brand: string }[]): Map<string, string> {
  const baseToIds = new Map<string, string[]>();
  for (const c of colourList) {
    const base = slugifyColourBase(c.name);
    baseToIds.set(base, [...(baseToIds.get(base) ?? []), c.id]);
  }
  const idToSlug = new Map<string, string>();
  for (const c of colourList) {
    const base = slugifyColourBase(c.name);
    const ids = baseToIds.get(base)!;
    if (ids.length === 1) {
      idToSlug.set(c.id, base);
    } else {
      idToSlug.set(c.id, `${base}-${c.brand.toLowerCase()}`);
    }
  }
  return idToSlug;
}
```

This is the helper /shop renders chips with. Confidence: HIGH — no DB writes, pure function.

## Schema Migration — Detailed Plan

### Drizzle Schema (append to `src/lib/db/schema.ts`)

```ts
// ============================================================================
// Phase 18 — colors library + product_option_values.color_id FK
// ============================================================================

export const colors = mysqlTable(
  "colors",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    name: varchar("name", { length: 64 }).notNull(),
    hex: varchar("hex", { length: 7 }).notNull(),
    previousHex: varchar("previous_hex", { length: 7 }),
    brand: mysqlEnum("brand", ["Bambu", "Polymaker", "Other"]).notNull(),
    code: varchar("code", { length: 32 }),
    familyType: mysqlEnum("family_type", ["PLA", "PETG", "TPU", "CF", "Other"]).notNull(),
    familySubtype: varchar("family_subtype", { length: 48 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    // SPEC #1: UNIQUE(brand, code) when code is non-null. MariaDB allows multiple
    // NULLs in a unique index, so this works as-is.
    brandCodeUnique: unique("uq_colors_brand_code").on(t.brand, t.code),
    brandIdx: index("idx_colors_brand").on(t.brand),
    activeIdx: index("idx_colors_active").on(t.isActive),
  }),
);

// Add color_id to existing productOptionValues (table already declared at line 207).
// You CANNOT redeclare the table — add via in-place edit to the existing object:
//
//     export const productOptionValues = mysqlTable("product_option_values", {
//       ...existing columns...
//       colorId: varchar("color_id", { length: 36 }),  // ← NEW (nullable, no .notNull())
//                  .references(() => colors.id, { onDelete: "restrict" }),
//     }, ...);
```

### Raw-SQL DDL (`scripts/phase18-migrate.cjs`)

Byte-aligned to Drizzle. Mirror Phase 16/17 migrate shape exactly.

```js
// scripts/phase18-migrate.cjs
const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");

function loadEnv() { /* same as phase17-migrate.cjs */ }
async function columnExists(conn, dbName, tableName, columnName) { /* same */ }
async function addColumnIfMissing(conn, dbName, tableName, columnName, ddl) { /* same */ }
async function fkExists(conn, dbName, tableName, fkName) {
  const [rows] = await conn.query(
    `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND CONSTRAINT_NAME=?`,
    [dbName, tableName, fkName]);
  return rows.length > 0;
}

async function run() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const conn = await mysql.createConnection(url);
  const dbName = process.env.DB_NAME || new URL(url).pathname.replace(/^\//, "");
  console.log(`Connected to ${dbName}`);

  try {
    // 1. colors table — full DDL byte-aligned to Drizzle
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`colors\` (
        \`id\`              VARCHAR(36) NOT NULL,
        \`name\`            VARCHAR(64) NOT NULL,
        \`hex\`             VARCHAR(7)  NOT NULL,
        \`previous_hex\`    VARCHAR(7)  NULL,
        \`brand\`           ENUM('Bambu','Polymaker','Other') NOT NULL,
        \`code\`            VARCHAR(32) NULL,
        \`family_type\`     ENUM('PLA','PETG','TPU','CF','Other') NOT NULL,
        \`family_subtype\`  VARCHAR(48) NOT NULL,
        \`is_active\`       TINYINT(1) NOT NULL DEFAULT 1,
        \`created_at\`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_colors_brand_code\` (\`brand\`, \`code\`),
        KEY \`idx_colors_brand\`  (\`brand\`),
        KEY \`idx_colors_active\` (\`is_active\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci
    `);
    console.log("colors -> ensured");

    // 2. product_option_values.color_id (nullable FK, ON DELETE RESTRICT)
    await addColumnIfMissing(
      conn, dbName, "product_option_values", "color_id",
      "`color_id` VARCHAR(36) NULL AFTER `swatch_hex`",
    );

    // 3. FK constraint (separate ALTER, idempotent via fkExists)
    const fkName = "product_option_values_color_id_fk";
    if (!(await fkExists(conn, dbName, "product_option_values", fkName))) {
      await conn.query(`
        ALTER TABLE \`product_option_values\`
          ADD CONSTRAINT \`${fkName}\`
          FOREIGN KEY (\`color_id\`) REFERENCES \`colors\`(\`id\`) ON DELETE RESTRICT
      `);
      console.log(`product_option_values.${fkName} -> added`);
    } else {
      console.log(`product_option_values.${fkName} -> exists, skipping`);
    }

    // 4. Optional helpful index
    const [idxRows] = await conn.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND INDEX_NAME=?`,
      [dbName, "product_option_values", "idx_pov_color"]);
    if (idxRows.length === 0) {
      await conn.query(
        "ALTER TABLE `product_option_values` ADD KEY `idx_pov_color` (`color_id`)");
    }

    // Smoke check
    const [sct] = await conn.query("SHOW CREATE TABLE `colors`");
    console.log(sct[0]["Create Table"]);
    console.log("OK: Phase 18 schema applied");
  } finally {
    await conn.end();
  }
}
run().catch((e) => { console.error(e); process.exit(1); });
```

### Migration sequencing (Wave 1 ordering)

1. Apply DDL: `node scripts/phase18-migrate.cjs`.
2. Verify with `mysql ... -e "SHOW CREATE TABLE colors"` — bytes must match the Drizzle definition.
3. Run seed: `npx tsx scripts/seed-colours.ts` — should print N inserts, 0 updates, 0 noops.
4. Re-run seed: should print 0 inserts, 0 updates, all noops.
5. Only after Wave 1 verified, ship Wave 2 admin UI (depends on table existing).

### Rollback strategy

If Wave 1 fails mid-deploy:
1. `ALTER TABLE product_option_values DROP FOREIGN KEY product_option_values_color_id_fk`.
2. `ALTER TABLE product_option_values DROP COLUMN color_id`.
3. `DROP TABLE colors`.

If Wave 2+ fails after seed lands but before admin UI works: leave schema in place (idempotent), revert app code, no DB rollback needed.

## Cascade Rename (D-09 / D-10 / D-11)

### The exact mechanic

```ts
// src/actions/admin-colours.ts (new)
export async function renameColour(
  id: string,
  input: { name?: string; hex?: string },
): Promise<MutateResult> {
  await requireAdmin();

  const [pre] = await db.select().from(colors).where(eq(colors.id, id)).limit(1);
  if (!pre) return { ok: false, error: "Colour not found" };

  const newName = input.name?.trim() ?? pre.name;
  const newHex = input.hex?.trim().toUpperCase() ?? pre.hex;

  // Skip work if neither field changed
  const nameChanged = newName !== pre.name;
  const hexChanged = newHex !== pre.hex;
  if (!nameChanged && !hexChanged) return { ok: true };

  // Pre-count rows that will cascade (D-12 1000-row guardrail)
  const [{ c: linkedCount }] = await db
    .select({ c: count() })
    .from(productOptionValues)
    .where(and(
      eq(productOptionValues.colorId, id),
      eq(productOptionValues.value, pre.name),     // diff-aware: skip manually-renamed rows
    ));
  if (Number(linkedCount) > 1000) {
    return { ok: false, error: "Affects more than 1000 variant rows; please confirm via the staged-rename flow." };
  }

  await db.transaction(async (tx) => {
    // 1. Update the library row
    await tx.update(colors).set({
      name: newName,
      hex: newHex,
    }).where(eq(colors.id, id));

    // 2. Diff-aware cascade — single UPDATE, manual-edit wins
    //    WHERE color_id = :id AND value = :prev_name  (D-11)
    await tx.update(productOptionValues).set({
      value: newName,
      swatchHex: newHex,
    }).where(and(
      eq(productOptionValues.colorId, id),
      eq(productOptionValues.value, pre.name),
    ));

    // 3. Invalidate variant label_cache for affected rows
    //    (variants pull label from option-value text; cascade only matters for label re-render)
    //    Mirror renameOptionValue at src/actions/variants.ts:288 — null label_cache where
    //    any option*_value_id references one of these affected pov ids.
    const affectedPovs = await tx.select({ id: productOptionValues.id })
      .from(productOptionValues)
      .where(eq(productOptionValues.colorId, id));
    if (affectedPovs.length > 0) {
      const povIds = affectedPovs.map((r) => r.id);
      // Six parallel queries → null label_cache (mirror existing renameOptionValue pattern)
      await Promise.all([1, 2, 3, 4, 5, 6].map((slot) =>
        tx.update(productVariants).set({ labelCache: null }).where(
          inArray(
            (productVariants as any)[`option${slot}ValueId`],
            povIds,
          ),
        ),
      ));
    }
  });

  // Revalidate every PDP that may now show this colour (broad invalidation OK at this scale)
  revalidatePath("/admin/colours");
  revalidatePath("/shop");
  revalidatePath("/");
  // Per-product revalidation handled lazily by Next ISR on next request.

  return { ok: true };
}
```

**Why diff-aware works (D-11 detail):**
- Pre-rename: library has `name="Galaxy Black"`, all linked `pov.value` rows are `"Galaxy Black"` (snapshot at attach time).
- Admin manually renames one product's pov to `"Black Hole"` — that row diverges.
- Library renames `"Galaxy Black"` → `"Cosmic Black"`.
- Cascade UPDATE has clause `WHERE color_id = :id AND value = "Galaxy Black"` — the manually-renamed `"Black Hole"` row is skipped.
- Net effect: manual edits preserved; un-edited rows propagate.

**Drizzle transaction confirmation:** `src/actions/variants.ts:800-811` (`setDefaultVariant`) and `src/actions/variants.ts:894-914` (`bulkUpdateVariants`) both use `db.transaction(async (tx) => {...})` against mysql2. Confirmed working pattern.

**MariaDB caveat:** transactions on InnoDB tables only. Both `colors` and `product_option_values` are InnoDB (per migration script `ENGINE=InnoDB`). No issue.

**No LATERAL** — the cascade is a plain UPDATE, no joins. The `label_cache` invalidation is six independent UPDATEs against indexed columns — no LATERAL.

## Picker Modal Integration (Wave 3)

### Where in `variant-editor.tsx` it mounts

The picker is a NEW Dialog, sibling to the existing delete dialogs at `src/components/admin/variant-editor.tsx:639-676`. It appears as a button inside the per-option block (line 462-478, the "Add value" row), gated on:

```ts
function isColourOption(opt: HydratedOption): boolean {
  const n = opt.name.trim().toLowerCase();
  return n === "color" || n === "colour";
}
```

Rendering layer (additive, inside the existing per-option `.map`):

```tsx
{/* Existing add-value input */}
<div className="flex gap-2">
  <Input ... />
  <Button onClick={() => handleAddValue(opt.id)}>+ Add</Button>
  {/* Phase 18 — picker trigger, only visible on Colour-named options */}
  {isColourOption(opt) && (
    <Button
      variant="outline"
      onClick={() => setPickerOptionId(opt.id)}
      className="gap-1"
    >
      <Palette className="h-3 w-3" /> Pick from library
    </Button>
  )}
</div>
```

Picker Dialog (new component `src/components/admin/colour-picker-dialog.tsx`):

```tsx
type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  optionId: string;          // target option to attach colours to
  productId: string;
  alreadyAttachedColourIds: Set<string>;  // pov.color_id values already on this option
  onConfirmed: () => Promise<void>;       // calls editor's refresh() (Pattern B)
};
```

The dialog:
1. On open: fires `getActiveColoursForPicker()` once (returns admin shape — full row).
2. Renders a search input + a scrollable list (max-height ~50vh).
3. Each row: hex chip (24px) + name + brand badge + family_type + family_subtype + code (mono).
4. Each row has a checkbox; staged selections held in local state.
5. Footer: `[Cancel]  [Add N colours]` button (disabled when N=0).
6. On confirm: fires `attachLibraryColours(optionId, selectedColourIds[])` → resolves → calls `onConfirmed()` (which is the editor's `refresh()` Pattern B refetch).

Already-attached colours (where `pov.color_id` IN selection): render with checkbox checked AND disabled, label "Already added" — admin can't attach the same library colour twice to one option (database UNIQUE constraint on `(option_id, value)` would fire ER_DUP_ENTRY anyway; this is preventive UX).

### Server actions added to `src/actions/variants.ts` (or new `src/actions/admin-colours.ts`)

```ts
// Public-vs-admin split per "specifics" section in CONTEXT.md
export async function getActiveColoursForPicker(): Promise<ColourAdminRow[]> {
  await requireAdmin();
  const rows = await db.select().from(colors).where(eq(colors.isActive, true)).orderBy(asc(colors.name));
  return rows.map((r) => ({
    id: r.id, name: r.name, hex: r.hex, previousHex: r.previousHex ?? null,
    brand: r.brand, code: r.code ?? null,
    familyType: r.familyType, familySubtype: r.familySubtype,
  }));
}

export async function attachLibraryColours(
  optionId: string,
  colourIds: string[],
): Promise<ActionResult<{ added: number; skipped: number }>> {
  await requireAdmin();
  if (colourIds.length === 0) return { error: "No colours selected" };

  // 1. Validate option exists + is "Colour"
  const [opt] = await db.select().from(productOptions).where(eq(productOptions.id, optionId)).limit(1);
  if (!opt) return { error: "Option not found" };

  // 2. Fetch the library rows (active only)
  const libRows = await db.select().from(colors)
    .where(and(inArray(colors.id, colourIds), eq(colors.isActive, true)));
  if (libRows.length === 0) return { error: "Selected colours are no longer active" };

  // 3. Fetch existing pov values on this option (case-insensitive de-dupe)
  const existing = await db.select().from(productOptionValues).where(eq(productOptionValues.optionId, optionId));
  const existingByLower = new Set(existing.map((p) => p.value.toLowerCase()));

  // 4. Insert each library colour as a pov row, snapshotting name+hex
  let added = 0, skipped = 0;
  const startPosition = existing.length;
  await db.transaction(async (tx) => {
    let i = 0;
    for (const c of libRows) {
      if (existingByLower.has(c.name.toLowerCase())) { skipped++; continue; }
      await tx.insert(productOptionValues).values({
        id: randomUUID(),
        optionId,
        value: c.name,                      // SNAPSHOT — cascades on rename
        position: startPosition + i,
        swatchHex: c.hex,                   // SNAPSHOT — cascades on rename
        colorId: c.id,                      // FK link
      });
      added++;
      i++;
    }
  });

  // Pattern B refetch — caller (editor) gets fresh shape via getVariantEditorData
  // Revalidate paths
  await revalidateProductSurfacesByOptionId(optionId);
  return { success: true, data: { added, skipped } };
}
```

The "Custom (not in library)" relabeling (Claude's discretion) is a tiny copy-only change inside variant-editor.tsx — change the existing add-value input's placeholder from `"Add ${opt.name} value..."` to `"Add custom (not in library)..."` ONLY when `isColourOption(opt)`.

## /shop Filter Extension (Wave 4)

### URL grammar
- Existing: `?category=<cat-slug>&subcategory=<sub-slug>` — both optional.
- New: `?colour=<colour-slug-1>,<colour-slug-2>,...` — comma-separated, optional, intersects with category.

Examples:
- `/shop?colour=galaxy-black` → all products with ≥1 active variant in "Galaxy Black".
- `/shop?category=keychains&colour=galaxy-black,jade-white` → keychains AND (Galaxy Black OR Jade White).

### Implementation in `src/app/(store)/shop/page.tsx`

Extend `SearchParams` type:
```ts
type SearchParams = Promise<{ category?: string; subcategory?: string; colour?: string }>;
```

Parse:
```ts
const { category, subcategory, colour } = await searchParams;
const colourSlugs = colour ? colour.split(",").filter(Boolean) : [];
```

Pass to `resolveProducts(category, subcategory, colourSlugs)`. Inside `resolveProducts`, after the existing category/subcategory filter applies, intersect with colour-matched product IDs.

### New `src/lib/catalog.ts` helper — colour intersection

The set of products that contain ≥1 active variant whose option-value-row references one of the selected colour names. **NO LATERAL** — manual hydration.

```ts
// src/lib/catalog.ts (new helper)
export async function getProductIdsByColourSlugs(slugs: string[]): Promise<Set<string>> {
  if (slugs.length === 0) return new Set();   // empty filter = no filter (caller bypasses)

  // 1. Fetch all active colours (small table)
  const colourRows = await db
    .select({ id: colors.id, name: colors.name, brand: colors.brand })
    .from(colors)
    .where(eq(colors.isActive, true));

  // 2. Compute slug map (with collision suffix per buildColourSlugMap)
  const slugMap = buildColourSlugMap(colourRows);
  // Reverse: slug → colour.id
  const slugToColourId = new Map<string, string>();
  for (const c of colourRows) {
    const s = slugMap.get(c.id);
    if (s && slugs.includes(s)) slugToColourId.set(s, c.id);
  }
  if (slugToColourId.size === 0) return new Set();
  const colourIds = Array.from(slugToColourId.values());

  // 3. Find pov rows whose color_id matches
  const povRows = await db
    .select({ id: productOptionValues.id })
    .from(productOptionValues)
    .where(inArray(productOptionValues.colorId, colourIds));
  if (povRows.length === 0) return new Set();
  const povIds = povRows.map((r) => r.id);

  // 4. Find variants that reference any of these pov ids in any of 6 slots
  //    (six parallel queries — manual hydration, NO LATERAL, NO OR-on-six-cols-in-one)
  const slotCols = [
    productVariants.option1ValueId, productVariants.option2ValueId,
    productVariants.option3ValueId, productVariants.option4ValueId,
    productVariants.option5ValueId, productVariants.option6ValueId,
  ];
  const variantHits = await Promise.all(
    slotCols.map((col) => db
      .select({ productId: productVariants.productId })
      .from(productVariants)
      .where(and(inArray(col, povIds), eq(productVariants.inStock, true)))
    ),
  );
  const productIdSet = new Set<string>();
  for (const hits of variantHits) for (const h of hits) productIdSet.add(h.productId);
  return productIdSet;
}
```

Then in `resolveProducts`:
```ts
async function resolveProducts(category, subcategory, colourSlugs: string[]): Promise<...> {
  const baseResult = /* existing category/subcategory branches */;
  if (baseResult === "not_found") return baseResult;
  if (colourSlugs.length === 0) return baseResult;

  const allowedIds = await getProductIdsByColourSlugs(colourSlugs);
  const filtered = baseResult.products.filter((p) => allowedIds.has(p.id));
  return { ...baseResult, products: filtered };
}
```

### /shop available-list query (D-16, sidebar render)

Returns name+hex+slug ONLY (no codes, no `family_*`, no `previous_hex`).

```ts
// src/lib/catalog.ts (new helper)
export type ShopColourChip = { slug: string; name: string; hex: string };

export async function getActiveProductColourChips(): Promise<ShopColourChip[]> {
  // 1. All active colours (small table)
  const allColours = await db
    .select({ id: colors.id, name: colors.name, hex: colors.hex, brand: colors.brand })
    .from(colors)
    .where(eq(colors.isActive, true));
  if (allColours.length === 0) return [];

  // 2. All pov rows with color_id (manual hydration, no LATERAL)
  const povRows = await db
    .select({ id: productOptionValues.id, colorId: productOptionValues.colorId })
    .from(productOptionValues)
    .where(isNotNull(productOptionValues.colorId));
  if (povRows.length === 0) return [];
  const povIds = povRows.map((r) => r.id);
  const colourIdByPov = new Map(povRows.map((r) => [r.id, r.colorId!]));

  // 3. variants that USE these pov ids in any slot, AND product is active
  const slotCols = [
    productVariants.option1ValueId, productVariants.option2ValueId,
    productVariants.option3ValueId, productVariants.option4ValueId,
    productVariants.option5ValueId, productVariants.option6ValueId,
  ];
  const liveVariantSets = await Promise.all(
    slotCols.map((col) => db
      .select({ povId: col, productId: productVariants.productId })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(and(inArray(col, povIds), eq(products.isActive, true), eq(productVariants.inStock, true)))
    ),
  );
  const usedColourIds = new Set<string>();
  for (const set of liveVariantSets) {
    for (const row of set) {
      const cid = colourIdByPov.get(row.povId as string);
      if (cid) usedColourIds.add(cid);
    }
  }

  // 4. Project to chip shape with slugs (collision-aware)
  const usedColours = allColours.filter((c) => usedColourIds.has(c.id));
  const slugMap = buildColourSlugMap(usedColours);
  return usedColours
    .map((c) => ({ slug: slugMap.get(c.id)!, name: c.name, hex: c.hex }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
```

INNER JOIN here is fine — Drizzle compiles `innerJoin()` to `INNER JOIN`, NOT to LATERAL. LATERAL only appears in `db.query.X.findMany({ with: {...} })` (the relational query builder). The select-builder `.innerJoin()` is a normal SQL join.

### Sidebar component (D-13, D-15)

Add `<ShopColourFilter chips={chips} active={colourSlugs} />` below the existing `<ShopSidebar>` in `src/app/(store)/shop/page.tsx:135`. Mobile: render the same filter as a second strip below the category strip (mirror `category-chips.tsx`).

```tsx
function ShopColourFilter({ chips, active, currentCategory, currentSubcategory }) {
  // Default: 12 chips visible, "Show all" expands.
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? chips : chips.slice(0, 12);

  // URL builder
  const buildHref = (slug: string) => {
    const next = new Set(active);
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    const params = new URLSearchParams();
    if (currentCategory) params.set("category", currentCategory);
    if (currentSubcategory) params.set("subcategory", currentSubcategory);
    if (next.size > 0) params.set("colour", Array.from(next).join(","));
    return `/shop?${params.toString()}`;
  };

  // Render: title "COLOUR" + accordion chevron + visible chips wrapped...
}
```

The chip is a `<Link>` to the toggled URL — matches the existing `<Link>`-based filter pattern in `src/app/(store)/shop/page.tsx:117`.

## Admin Route Structure (Wave 2 — clone coupons exactly)

| New File | Cloned From | Notes |
|----------|-------------|-------|
| `src/app/(admin)/admin/colours/page.tsx` | `src/app/(admin)/admin/coupons/page.tsx` | List + "+ New colour" button. Table cols: hex preview, name, brand badge, family, code, status, actions. |
| `src/app/(admin)/admin/colours/new/page.tsx` | `src/app/(admin)/admin/coupons/new/page.tsx` | Mounts `<ColourForm mode="new" />`. |
| `src/app/(admin)/admin/colours/[id]/edit/page.tsx` | `src/app/(admin)/admin/coupons/[id]/edit/page.tsx` | Mounts `<ColourForm mode="edit" initial={...} />`. |
| `src/components/admin/colour-form.tsx` | `src/components/admin/coupon-form.tsx` | Native form + `useTransition`; native `<input type="color">` for hex; brand `<select>`; family_type `<select>`; family_subtype text input; code text input. |
| `src/components/admin/colour-row-actions.tsx` | `src/components/admin/coupon-row-actions.tsx` | Edit / Archive (toggle is_active) / Delete (with in-use guard error toast). |
| `src/actions/admin-colours.ts` | `src/actions/admin-coupons.ts` | `listColours`, `getColour`, `createColour`, `updateColour`, `archiveColour`, `reactivateColour`, `deleteColour`, `renameColour` (cascade), `getColourPublic`, `getColourAdmin`, `getActiveColoursForPicker`, `attachLibraryColours`, `getProductsUsingColour`. |
| `src/components/admin/colour-picker-dialog.tsx` | (new) | shadcn Dialog content component used by variant-editor.tsx. |

### Admin guide article — Wave 4

| New File | Pattern Source |
|----------|----------------|
| `src/content/admin-guide/products/colours.md` | `src/content/admin-guide/products/variants-sizes.md` |

Headers should match the existing front-matter shape. The build script `scripts/build-admin-guide.mjs` scans `src/content/admin-guide/` recursively and codegens `src/lib/admin-guide-generated.ts` at `npm run build` AND `npm run dev` time. **No additional wiring needed.** The next `npm run build` automatically picks up the new `colours.md`.

Frontmatter shape (mirror existing):
```yaml
---
title: "Managing colours"
category: "Products"
tags: [colours, library, variants]
order: 50
---
```

## In-Use Deletion Guard (REQ-4 detail)

```ts
// src/actions/admin-colours.ts
export async function deleteColour(id: string): Promise<MutateResult> {
  await requireAdmin();
  // Find any pov rows referencing this colour
  const usingRows = await db
    .select({
      povId: productOptionValues.id,
      optionId: productOptionValues.optionId,
    })
    .from(productOptionValues)
    .where(eq(productOptionValues.colorId, id));

  if (usingRows.length > 0) {
    // Hop: pov → option → product (manual hydration)
    const optionIds = Array.from(new Set(usingRows.map((r) => r.optionId)));
    const optionRows = await db
      .select({ id: productOptions.id, productId: productOptions.productId })
      .from(productOptions)
      .where(inArray(productOptions.id, optionIds));
    const productIds = Array.from(new Set(optionRows.map((r) => r.productId)));
    const productRows = await db
      .select({ id: products.id, name: products.name, slug: products.slug })
      .from(products)
      .where(inArray(products.id, productIds));
    return {
      ok: false,
      error: "IN_USE",
      products: productRows.map((p) => ({ id: p.id, name: p.name, slug: p.slug })),
    };
  }

  await db.delete(colors).where(eq(colors.id, id));
  revalidatePath("/admin/colours");
  return { ok: true };
}
```

The `MutateResult` discriminated-union should be extended to allow the `products` payload on the error branch. Plan should declare the new type explicitly.

The DB-level `ON DELETE RESTRICT` is a defense-in-depth (catches direct DB writes); the application-level guard returns the friendly `{code:"IN_USE", products:[...]}` shape required by REQ-4. Both must be present.

## PDP Variant-Selector Refactor (REQ-7 detail)

Currently in `src/components/store/variant-selector.tsx:181-199`, a label like `COLOUR : Galaxy Black` is rendered ONCE at the top of the option block (line 192-199), and the swatch grid below shows hex circles WITHOUT names (lines 201-267). The colour name only appears in the title row above the entire grid.

**Required change (REQ-7):** Render the colour name UNDER each swatch chip, always visible. The existing `aria-label` and `title` already include `val.value` so accessibility is fine — the visual change is a `<span>` below the swatch button.

Recommended diff sketch:

```tsx
// At src/components/store/variant-selector.tsx ~ line 213, replace the swatch <button> wrapper
return (
  <div key={val.id} className="flex flex-col items-center gap-1">
    <button
      key={val.id}
      type="button"
      onClick={...}
      // existing handlers + style
    >
      <span className="rounded-full block" style={{...}}>
        {!available && <span ... />}
      </span>
    </button>
    {/* Phase 18 — always-visible name (REQ-7) */}
    <span className="text-[11px] leading-tight text-center max-w-[60px] truncate text-[var(--color-brand-ink)]">
      {val.value}
    </span>
  </div>
);
```

Important:
- Wrapper changes from `<button>` (with `<span>` swatch inside) to `<div>` containing `<button>` + caption `<span>`.
- The button MUST keep its current size (40x40 via `width: 40, height: 40, minWidth: 48, minHeight: 48`) because mobile tap targets per Phase 2 D-04 require min 48px.
- Pill-button rendering for non-Color options (lines 270-322) is untouched.
- The `code` field is NEVER passed into the variant-selector — it stays in the `colors.code` column server-side and never enters the storefront query path.

**Customer-facing query exclusion:** the existing `hydrateProductVariants` returns `swatchHex` on each value but no `code`, no `previous_hex`, no `family_*`. Adding `color_id` to the fetched `productOptionValues` does NOT leak admin data — only the FK is fetched. The variant-selector reads `swatchHex` (already snapshotted into `pov`) and `value` (the snapshotted name), never reaches into the `colors` table at render time. **Confirmed safe.**

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema migration | `drizzle-kit push` | Raw-SQL applicator (`scripts/phase18-migrate.cjs`) | `drizzle-kit push` hangs on the cPanel remote (Phase 6 06-01 precedent + CLAUDE.md). |
| Modal primitive | Custom `<div>` overlay | shadcn `<Dialog>` (already in repo) | Same primitive as existing delete dialogs in variant-editor. |
| Admin guard | Per-action ad-hoc role check | `requireAdmin()` helper | CVE-2025-29927 + project convention. |
| Form state | react-hook-form / formik | Native `<form onSubmit>` + `useTransition` | Coupons form pattern. Don't add a new dep. |
| HTML sanitizer | `isomorphic-dompurify` | N/A — Phase 18 outputs no HTML | Already banned in prod. Phase 18 has no HTML email/template surface. |
| Search filter on 100 rows | Server endpoint per keystroke | Single fetch + client-side `.includes()` filter | D-06 — full library is ~30 KB JSON. |
| Slug uniqueness DB column | New `slug` column with UNIQUE | Runtime collision-aware suffix in `buildColourSlugMap` | D-14 — derived; never stored. |
| LATERAL JOIN to fetch products by colour | Drizzle `db.query.X.findMany({ with })` | Manual 4-query hydration in `getProductIdsByColourSlugs` | MariaDB 10.11 + `src/actions/products.ts` precedent. |

## Common Pitfalls

### P-1: Regex matches the wrong `;`
**What goes wrong:** Naive regex `/const data = (\{[\s\S]*?\});/` could match a `;` inside the banner `<strong>...</strong>` string in Bambu's `petg-translucent` section.
**How to avoid:** Anchor on `;\s*\n\s*const\s+order\s*=` — `const order =` only appears once after `data` in both files, so the lookahead is unambiguous.
**Warning sign:** Parse fails with truncated JS or `SyntaxError: Unexpected token` from `Function`-eval.

### P-2: `Function`-eval execution context
**What goes wrong:** `new Function("return " + body)()` runs in global scope. If the parsed object has a property named `globalThis` or invokes a global, behavior is unpredictable.
**How to avoid:** Both source files contain ONLY object literals — no method calls, no template literals, no IIFEs. Verified by reading both files. If a future seed source contains anything else, fall back to `JSON.parse(jsoned)` after a manual JS-to-JSON pre-pass.
**Warning sign:** Any unexpected runtime side effect at parse time. Currently zero risk.

### P-3: Dual / gradient shape mismatch
**What goes wrong:** Polymaker's `dual` and `gradient` sections have `hex1`/`hex2` (no `hex`) or no hex at all. Naive parser inserts rows with `hex = undefined`.
**How to avoid:** Skip-on-missing-hex (`if (!c.hex) continue`). Documented in seed script. Admin can manually add dual colours later if needed.
**Warning sign:** Migration failure on `hex NOT NULL` constraint. This must NOT happen at seed time.

### P-4: Polymaker `code: "—"` (em-dash placeholder)
**What goes wrong:** Polymaker `Matte Rose (legacy)` has `code: "—"` (literal em-dash). Inserting that as a code violates UNIQUE(brand, code) if any other Polymaker row also has `"—"`.
**How to avoid:** Treat `"—"` (and any non-alphanumeric-only string) as `null` code. Use natural key `(brand, name)` with `IS NULL` check on code instead.
**Warning sign:** ER_DUP_ENTRY at seed time on the second em-dash row.

### P-5: Manual rename gets clobbered by cascade
**What goes wrong:** Admin renames a product's pov from "Galaxy Black" → "Black Hole" manually. Then admin renames the library colour "Galaxy Black" → "Cosmic Black". Without diff-aware filter, the manual edit reverts.
**How to avoid:** D-11 already locked — `WHERE color_id = :id AND value = :previous_name`. Documented above.
**Warning sign:** Manual product-level renames silently disappear after a library rename.

### P-6: pov UNIQUE(option_id, value) collision when attaching from picker
**What goes wrong:** Admin picks "Black" from library, but the option already has a freeform pov with value "black" (case-insensitive collision). DB UNIQUE(option_id, value) is case-insensitive on latin1_swedish_ci → ER_DUP_ENTRY.
**How to avoid:** `attachLibraryColours` pre-filter via case-insensitive Set lookup; skip duplicates and report `skipped` count to UI.
**Warning sign:** Picker confirm fails with a SQL error rather than a friendly toast.

### P-7: 6-axis cap interaction with picker
**What goes wrong:** Admin attempts to attach library colours to a Colour option that doesn't exist yet on a product. Picker tries to write pov rows directly without a parent option.
**How to avoid:** Picker only renders inside an existing option block (admin must add the "Colour" option first). The 6-axis cap is enforced by `addProductOption` (line 82-84 of `src/actions/variants.ts`); attaching to an EXISTING option doesn't bump axis count, so no special-casing needed.
**Warning sign:** Picker shows a "Pick from library" button when 0 options exist — should never happen.

### P-8: PDP swatch caption breaks layout on mobile
**What goes wrong:** Long colour name ("Translucent Light Blue") wraps awkwardly under a 32px swatch.
**How to avoid:** Set `max-w-[60px]` on the caption span; allow `truncate`. Full name still in `aria-label`/`title`. Confirmed acceptable per "name visible always" — caption truncates with ellipsis if needed.
**Warning sign:** Visual review shows multi-line caption pushing chips around.

### P-9: /shop chip filter URL grows past browser cap
**What goes wrong:** Admin lists 100 colours; customer ticks them all → URL gets a 5KB query string.
**How to avoid:** N/A in practice (customer rarely toggles >5 chips). Browsers tolerate >2KB URLs. Document as acceptable.
**Warning sign:** None — not a real concern at this scale.

### P-10: Cascade rename N+1 invalidation
**What goes wrong:** After cascade UPDATE, every PDP that uses this colour stays cached. Customer sees stale name.
**How to avoid:** Broad `revalidatePath("/shop")` + `revalidatePath("/")` + per-product revalidation through normal Next ISR after cache TTL. For higher fidelity, query affected product slugs and call `revalidatePath` per slug — recommended for plan.
**Warning sign:** Admin renames a colour, refreshes a customer PDP, still sees old name → didn't revalidate that slug.

## Code Examples

### Existing pattern: shadcn Dialog inside variant-editor

```tsx
// src/components/admin/variant-editor.tsx:639-656 (delete option dialog — shape Phase 18 reuses)
<Dialog open={!!deleteOptionDialog} onOpenChange={() => setDeleteOptionDialog(null)}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Delete option &quot;{deleteOptionDialog?.name}&quot;?</DialogTitle>
    </DialogHeader>
    <p className="text-sm text-[var(--color-brand-text-muted)]">
      ...
    </p>
    <DialogFooter>
      <Button variant="ghost" onClick={() => setDeleteOptionDialog(null)}>Cancel</Button>
      <Button variant="destructive" onClick={handleDeleteOptionConfirm} disabled={isPending}>
        Delete Option
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Existing pattern: server action with `requireAdmin` first

```ts
// src/actions/admin-coupons.ts:102-136 (createCoupon — shape Phase 18 mirrors)
export async function createCoupon(formData: FormData): Promise<MutateResult> {
  await requireAdmin();
  const parsed = parseCouponForm(formData);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;
  const id = randomUUID();
  try {
    await db.insert(coupons).values({ id, code: data.code, ... });
  } catch (err: unknown) {
    const raw = String((err as Error)?.message ?? "");
    if (raw.includes("ER_DUP_ENTRY")) return { ok: false, error: "Code already exists" };
    return { ok: false, error: "Unable to create coupon" };
  }
  revalidatePath("/admin/coupons");
  return { ok: true, id };
}
```

### Existing pattern: Pattern B refetch from variant-editor

```ts
// src/components/admin/variant-editor.tsx:108-118 (refresh function Phase 18 calls on picker confirm)
const refresh = useCallback(async () => {
  const result = await getVariantEditorData(productId);
  if ("data" in result && result.data) {
    setOptions(result.data.options);
    setVariants(result.data.variants);
  } else if ("error" in result) {
    showToast("Failed to refresh editor data", "error");
  }
}, [productId, showToast]);
```

### Existing pattern: db.transaction with mysql2

```ts
// src/actions/variants.ts:800-811 (setDefaultVariant — proves db.transaction works)
await db.transaction(async (tx) => {
  await tx.update(productVariants)
    .set({ isDefault: false })
    .where(eq(productVariants.productId, v.productId));
  await tx.update(productVariants)
    .set({ isDefault: true })
    .where(eq(productVariants.id, variantId));
});
```

## Wave Plan (file lists per wave)

### Wave 1 — Schema + Seed (foundation)
**depends_on:** [] (independent)
**Plans address:** REQ-1, REQ-2

New files:
- `src/lib/db/schema.ts` — append `colors` table; add `colorId` to `productOptionValues` (in-place edit).
- `src/lib/colours.ts` — `slugifyColourBase`, `buildColourSlugMap`, family enum constants.
- `src/lib/validators.ts` — append `colourSchema` (Zod for create/edit form).
- `scripts/phase18-migrate.cjs` — raw-SQL DDL applicator.
- `scripts/seed-colours.ts` — HTML parser + idempotent upsert.

Verification:
- `node scripts/phase18-migrate.cjs` → "OK: Phase 18 schema applied"
- `mysql ... -e "SHOW CREATE TABLE colors"` byte-aligned to Drizzle
- `npx tsx scripts/seed-colours.ts` → first run prints N inserts
- Re-run prints 0 inserts/0 updates/all noops

### Wave 2 — Admin /admin/colours CRUD + Cascade
**depends_on:** [Wave 1]
**Plans address:** REQ-3, REQ-4

New files:
- `src/app/(admin)/admin/colours/page.tsx`
- `src/app/(admin)/admin/colours/new/page.tsx`
- `src/app/(admin)/admin/colours/[id]/edit/page.tsx`
- `src/components/admin/colour-form.tsx`
- `src/components/admin/colour-row-actions.tsx`
- `src/actions/admin-colours.ts` — list/get/create/update/archive/reactivate/delete + `renameColour` cascade + `getProductsUsingColour`
- Sidebar nav entry in `src/components/admin/sidebar-nav.tsx` — add Colours link below Coupons.

Verification:
- Admin navigates to `/admin/colours`, list renders with seeded rows.
- Create a colour → row appears in list.
- Edit (rename) a colour that has 0 products → no cascade firing, succeeds.
- Edit (rename) a colour that has N products → cascade UPDATEs N pov rows; manually-edited rows preserved.
- Soft-archive → row hidden from picker (Wave 3 verification) but products still render.
- Hard-delete in-use colour → returns `{code:"IN_USE", products:[...]}`, does NOT delete.
- Hard-delete unused colour → succeeds.

### Wave 3 — Picker integration + custom-hex relabel
**depends_on:** [Wave 2]
**Plans address:** REQ-5, REQ-6

New files:
- `src/components/admin/colour-picker-dialog.tsx`
- `src/actions/admin-colours.ts` — append `getActiveColoursForPicker`, `attachLibraryColours`

Modified files:
- `src/components/admin/variant-editor.tsx` — add `isColourOption` helper, picker trigger button, picker open/close state, picker mount.
- `src/components/admin/variant-editor.tsx` — relabel custom freeform input to "Custom (not in library)" when option is Colour.

Verification:
- Add option "Colour" on a product → "Pick from library" button appears.
- Click button → modal opens with search, brand badges, family, codes.
- Search "Galaxy" → list filters client-side instantly.
- Tick 3 colours, click "Add 3 colours" → modal closes, editor refetches, 3 pov rows appear with `value` + `swatchHex` set.
- Generate matrix → cartesian includes those 3 colours.
- Custom freeform input still works → creates pov with `color_id = NULL`.
- Add 7th option → existing 6-axis cap rejects with friendly error.

### Wave 4 — PDP swatch + /shop chip + admin guide
**depends_on:** [Wave 3]
**Plans address:** REQ-7, REQ-8

New files:
- `src/components/store/shop-colour-filter.tsx` (sidebar accordion + mobile strip)
- `src/content/admin-guide/products/colours.md`

Modified files:
- `src/components/store/variant-selector.tsx` — caption span under each swatch (REQ-7); pill rendering untouched.
- `src/app/(store)/shop/page.tsx` — extend `SearchParams`, parse colour slugs, pass to `resolveProducts`, render colour filter component, mobile colour strip.
- `src/lib/catalog.ts` — add `getProductIdsByColourSlugs` + `getActiveProductColourChips`.

Verification:
- PDP loads on a colour-bearing product: each swatch has a colour name caption visible always.
- Tap a swatch → price/stock/image updates per existing Phase 17 reactivity.
- Inspect rendered HTML — `code` is NOT present anywhere on PDP.
- /shop sidebar shows "Colour" accordion with chips for all in-use colours.
- Click chip → URL becomes `?colour=galaxy-black`, products filtered.
- Click second chip → URL becomes `?colour=galaxy-black,jade-white`, both colours intersect with category filter.
- Build pipeline: `npm run build` regenerates `src/lib/admin-guide-generated.ts` and the new colours.md article appears in `/admin/guide`.

## Runtime State Inventory

This is a phase that ADDS state — not a rename or refactor. The standard inventory is mostly N/A, but documenting honestly:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | NONE existed before — Wave 1 seeds ~145 rows in new `colors` table. | Seed script (idempotent). |
| Live service config | None — no external service holds colour state. | None. |
| OS-registered state | None. | None. |
| Secrets/env vars | None — phase reads no new env vars. | None. |
| Build artifacts | `src/lib/admin-guide-generated.ts` regenerated by `scripts/build-admin-guide.mjs` on every build/dev run. New `colours.md` is automatically picked up. | None — automatic. |

**Nothing else found:** Verified by inspecting `/admin/sidebar-nav.tsx`, `package.json`, deploy scripts, and crontab references. No background jobs, no webhooks, no cached external state touch the colour library.

## Common Pitfalls (additional)

### P-11: Better Auth Session.user.role TypeScript untyped
**What goes wrong:** `session.user.role` doesn't type-check — Better Auth v1.6.2 doesn't include role in the `User` type.
**How to avoid:** Already handled — `(session.user as { role: string }).role`. The `requireAdmin` helper at `src/lib/auth-helpers.ts:14-21` does this casting internally. Phase 18 server actions just call `await requireAdmin()`; no direct role access required.

### P-12: New admin route triggering trustedOrigins block
**What goes wrong:** Better Auth might block POSTs to /admin/colours from a different origin.
**How to avoid:** No new origin introduced — `/admin/colours` lives on the same `app.3dninjaz.com` origin as the rest of admin. No `src/lib/auth.ts` `trustedOrigins` change needed.

### P-13: drizzle-kit pull/push tempting after schema edit
**What goes wrong:** After editing `src/lib/db/schema.ts`, Drizzle dev tools (and contributor instinct) suggest `drizzle-kit push`.
**How to avoid:** Document loudly in the migration plan — schema edits in `schema.ts` do NOT trigger DB writes; the raw-SQL applicator is the only path.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| MariaDB 10.11 | Schema migration | ✓ | 10.11 (cPanel) | None — required |
| mysql2 driver | DB queries | ✓ | bundled with project | — |
| Drizzle ORM | Schema + queries | ✓ | 0.41.x | — |
| Node 20.x | All scripts | ✓ | cPanel nodevenv | — |
| `tsx` | Run seed-colours.ts | ✓ | already used by `scripts/seed-admin.ts` | — |
| Better Auth 1.6.2 | requireAdmin | ✓ | installed | — |
| shadcn Dialog | Picker modal | ✓ | already in `src/components/ui/dialog.tsx` | — |

No missing dependencies. No external services required.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Admin types name+hex per product | Pick from central library + cascade rename | This phase | Reduces typos, enables global rename. |
| Hex circles only on PDP, name in title | Hex circle + name caption per swatch | This phase (REQ-7) | Customer can read every colour name; better UX especially for similar shades. |
| /shop filtered by category only | /shop filtered by category + colour | This phase (REQ-8) | Customer can find products by colour. |

Nothing deprecated.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Polymaker `dual` and `gradient` sections SHOULD be skipped at seed time. | HTML Parser | Admin loses ~30 colours from initial seed; can add manually. Acceptable per D-03 ("admin soft-archives lines they don't sell"). |
| A2 | `code: "—"` should be treated as null code. | HTML Parser P-4 | If treated as a real code, second em-dash row violates UNIQUE(brand, code). |
| A3 | UNIQUE(brand, code) accepts multiple NULLs (so multiple no-code rows can coexist). | Schema | Verified for MariaDB InnoDB UNIQUE indexes — multiple NULLs allowed. |
| A4 | The 1000-row warning threshold (D-12) is hit rarely enough that no chunked-rename UX is needed. | Cascade Rename | If a popular colour is on 1000+ pov rows, admin must split rename across multiple steps. Unlikely at this catalog scale. |
| A5 | Polymaker `specialty` section maps to family_type "Other" because it mixes LW-PLA, PolyWood, PLA-CF. | Seed mapping | If a planner wants finer granularity, split into multiple sub-mappings — minor refinement, not blocking. |
| A6 | `db.transaction()` over mysql2 supports nested-await statements. | Cascade implementation | Verified by `setDefaultVariant` and `bulkUpdateVariants` working in production. |
| A7 | The `revalidatePath("/shop") + revalidatePath("/")` broad invalidation after cascade is acceptable. | Cascade Rename P-10 | If perf becomes an issue, narrow to per-product revalidation by querying affected product slugs. |
| A8 | Caption-span change in variant-selector won't break the existing `min-h-[48px]` pill rendering. | PDP Refactor | Visual smoke test recommended on mobile before merging Wave 4. |

## Open Questions

1. **Should the PDP swatch caption show colour `name` or `value`?**
   - What we know: `pov.value` is the snapshotted name; `colors.name` is the live library name. After cascade, both are equal. Before cascade (or for freeform), only `pov.value` exists.
   - What's unclear: Nothing — `pov.value` is correct and existing variant-selector already reads it (`val.value`).
   - Recommendation: Use `val.value` (existing field). No code change beyond positioning the existing reference.

2. **Should the admin `/admin/colours` list paginate?**
   - What we know: ~145 rows after seed.
   - What's unclear: If admin adds dozens more manually, the page might grow. shadcn Table without pagination handles 200+ rows fine.
   - Recommendation: No pagination in v1. Add simple search input (filter by name) using client-side `.includes()` for parity with picker (D-06). Defer pagination to a follow-up if catalog exceeds 500 colours.

3. **What slug do we generate for "Black" when only Bambu has it (no collision)?**
   - What we know: D-14 says "append `-<brand>` suffix on collision".
   - What's unclear: If only Bambu has "Black", slug is just "black". When Polymaker later adds "Black", do we retroactively rename Bambu's slug to "black-bambu"?
   - Recommendation: Slug is derived live (D-14: "no dedicated slug column"). Each /shop render computes the slug map afresh — automatic retroactive disambiguation. Customer URLs from before the second-brand addition would 404; acceptable since chip filter is short-lived nav state, not a shareable URL of high SEO importance.

## Sources

### Primary (HIGH confidence — codebase grep + read)
- `src/lib/db/schema.ts:185-224` — productOptions + productOptionValues definitions (locked)
- `src/components/admin/variant-editor.tsx` (full read) — picker mount target + reactivity contract
- `src/components/store/variant-selector.tsx` (full read) — PDP swatch refactor target
- `src/actions/variants.ts` (full read) — server-action structure + db.transaction usage
- `src/actions/admin-coupons.ts` (full read) — admin server-action template
- `src/actions/products.ts:328-426` — manual hydration reference for MariaDB
- `src/lib/catalog.ts:255-439` — /shop filter helpers
- `src/app/(store)/shop/page.tsx` (full read) — filter URL grammar + SearchParams shape
- `src/app/(admin)/admin/coupons/{page,new,[id]/edit}/page.tsx` — admin route template
- `src/components/admin/coupon-form.tsx` — form pattern template
- `src/lib/auth-helpers.ts` — requireAdmin contract
- `src/lib/variants.ts` — HydratedOption / HydratedVariant types
- `scripts/phase16-migrate.cjs`, `scripts/phase17-migrate.cjs` — raw-SQL applicator template
- `scripts/build-admin-guide.mjs` — admin guide build pipeline
- `Colours/bambu-lab-colors.html` (full read) — seed source
- `Colours/polymaker-colors.html` (full read) — seed source
- `.planning/phases/18-colour-management/18-SPEC.md` — locked requirements
- `.planning/phases/18-colour-management/18-CONTEXT.md` — locked decisions
- `.claude/skills/variant-product/SKILL.md` — variant system reference
- `CLAUDE.md` — project gotchas

### Secondary (MEDIUM)
- N/A — no external sources consulted; all knowledge derived from in-repo files.

### Tertiary (LOW)
- N/A.

## Metadata

**Confidence breakdown:**
- Schema design: HIGH — mirrors Phase 16/17 migrate exactly, all DDL byte-aligned to Drizzle.
- HTML parser: HIGH — both source files inspected end-to-end; edge cases catalogued.
- Cascade rename: HIGH — db.transaction proven on mysql2; diff-aware logic locked in D-11.
- Picker integration: HIGH — Pattern B refetch contract already in variant-editor.
- /shop filter: HIGH — manual-hydration pattern proven in `getActiveProductsByCategorySlug`.
- PDP refactor: HIGH — minimal change to existing variant-selector; aria-label already correct.
- Admin guide: HIGH — auto-pickup confirmed by reading scripts/build-admin-guide.mjs.
- Slug collision: MEDIUM — derived-slug strategy works but cross-brand collision retroactivity is a UX trade-off (Open Question 3).

**Research date:** 2026-04-26
**Valid until:** 30 days (no fast-moving externals)
