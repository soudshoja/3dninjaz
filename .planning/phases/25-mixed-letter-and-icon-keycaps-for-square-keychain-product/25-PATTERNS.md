# Phase 25: Mixed Letter + Icon Keycaps (Square Keychain) - Pattern Map

**Mapped:** 2026-07-19
**Files analyzed:** 20 (6 new, 14 modified)
**Analogs found:** 19 / 20 (1 partial — static catalog module has no exact analog)

> Every seam this phase touches already exists in the repo. The single most
> recent and most relevant precedent for the whole shape of this work is the
> `textarea` fieldType addition (quick task 260430-icx), which threaded a new
> fieldType through `config-fields.ts` → DB enum → `validators.ts` →
> `configurator.ts` (`pickSchemaByFieldType`) → `config-field-modal.tsx` →
> `configurator-form.tsx`. Follow that six-point path for `keycapseq`.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/config-fields.ts` (M) | model/utility | transform | its own `TextFieldConfig`/`ColourFieldConfig` + `ensureImagesV2` | exact (self) |
| `src/lib/db/schema.ts` (M) | model/migration | CRUD | `productConfigFields.fieldType` enum (L284) + `baseDone` col (L648) | exact (self) |
| `src/lib/validators.ts` (M) | config/validation | transform | `fields[].fieldType` enum (L183) + `productType` enum (L156) | exact (self) |
| `src/lib/keychain-fields.ts` (M) | service | CRUD (seed) | `seedKeychainFields` (whole file) | exact (self) |
| `src/lib/keychain-parts.ts` (M) | utility | transform | `parseKeychainParts` (whole file) | exact (self) |
| `src/lib/keycap-icons.ts` (N) | model/data | file-I/O (static) | `public/icons/ninja/` asset convention; `ColourFieldConfig.allowedColorIds` | partial |
| `src/lib/option-weight.ts` (M, optional D-12) | utility | transform | `resolveTierWeightKg` (L68-81) | exact (self) |
| `src/actions/configurator.ts` (M) | controller (server action) | request-response | `pickSchemaByFieldType` (L54-67) | exact (self) |
| `src/actions/admin-production.ts` (M) | controller (server action) | batch/CRUD | `getKeychainBatches` base/clicker grouping (L414-598) | exact (self) |
| `src/actions/paypal.ts` (M) | controller (server action) | request-response | select re-derive (L336-398) | exact (self) |
| `src/actions/admin-pos.ts` + `whatsapp-order.ts` (M) | controller | request-response | same re-derive pattern as paypal.ts | role-match |
| `src/components/store/configurator-form.tsx` (M) | component | request-response | fieldType dispatch (L528-567) + `ColourField`/`SelectField` | exact (self) |
| `src/components/store/keychain-preview.tsx` (M) | component | request-response | `KeychainPreview` cube renderer (whole file) | exact (self) |
| `src/components/store/keycap-icon-picker.tsx` (N) | component | request-response | `ColourPickerDialog` grid + selected ring | role-match |
| `src/components/store/configurable-product-view.tsx` (M) | component | transform | price/summary wiring (L82-101, L226-269, L317-325) | exact (self) |
| `src/components/admin/config-field-modal.tsx` (M) | component | request-response | `ColourConfigForm` (L209-310) + `FIELD_TYPES` (L76-83) | exact (self) |
| `src/components/admin/icon-picker-dialog.tsx` (N) | component | request-response | `colour-picker-dialog.tsx` (whole file) | exact (adapt) |
| `src/components/admin/keychain-batches.tsx` (M) | component | request-response | `Seg`/`TickBox`/`BoxPill`/`ProgressBar` (L54-369) | exact (self) |
| `scripts/phase25-fieldtype-migrate.ts` (N) | migration | file-I/O (DDL) | `scripts/migrate-add-keychain-shape.ts` (whole file) | exact (adapt) |
| `scripts/extract-keycap-icons.ts` (N) | build script | file-I/O | migrate-script scaffold + `sharp` pipeline | role-match |
| `src/lib/keychain-parts.test.ts` (M) | test | — | existing 6 cases (whole file) | exact (self) |

(N) = new, (M) = modified.

---

## Pattern Assignments

### `src/lib/config-fields.ts` (model/utility, transform)

**Analog:** self — mirror `TextFieldConfig` (letters constraints) + `ColourFieldConfig` (library reference) + `ensureImagesV2` (fail-soft parse).

**FieldType union** (L25) — add `keycapseq`:
```typescript
export type FieldType = "text" | "number" | "colour" | "select" | "textarea";
// →  ... | "textarea" | "keycapseq";
```

**Config type + Zod schema** — model after `TextFieldConfig` (L28-38, L136-142) and `ColourFieldConfig` (L48-51, L150-155). The letter constraints copy `TextFieldConfig`'s four keys; `allowedIconIds` copies `ColourFieldConfig.allowedColorIds` (empty array allowed at save-time, non-empty enforced at PDP render — see the ColourFieldConfigSchema docstring L151-154):
```typescript
export type KeycapSeqConfig = {
  maxSlots: number;          // D-02 shared cap (replaces TextFieldConfig.maxLength)
  allowedChars: string;      // "A-Z"
  uppercase: boolean;
  profanityCheck: boolean;
  allowedIconIds: string[];  // references keycap-icons.ts, mirrors allowedColorIds
};
export const KeycapSeqConfigSchema: z.ZodType<KeycapSeqConfig> = z.object({
  maxSlots: z.number().int().min(1).max(200),
  allowedChars: z.string().min(1),
  uppercase: z.boolean(),
  profanityCheck: z.boolean(),
  allowedIconIds: z.array(z.string().min(1)),
});
```

**Register in dispatch map** (L188-194) — add `keycapseq: KeycapSeqConfigSchema` to `schemaByFieldType`. Also add `TextareaFieldConfig`-style entry to `AnyFieldConfig` union (L104-109).

**`ensureKeycapSequence` helper** — copy the fail-soft shape of `ensureImagesV2` (L267-301) / `ensureTiers` (L229-251): accept string-or-parsed, `JSON.parse` in try/catch, return `[]` on any failure, never throw. This is the D-06 sequence decoder. The `KeycapSlot` union:
```typescript
export type KeycapSlot =
  | { t: "L"; ch: string }   // letter (colours from the 3 global colour fields, D-03)
  | { t: "I"; id: string };  // icon (fixed colours per icon, D-04)
```

**Slot-count pricing** — `lookupTierPrice` (L372-379) keys off `unitFieldValue.length`. For a `keycapseq` value that `.length` is meaningless (it's a JSON blob). Either add a sibling `lookupTierPriceBySlots(tiers, slotCount)` or have callers compute `tiers[String(slots.length)]` directly (RESEARCH Pattern 9).

---

### `src/lib/db/schema.ts` (model/migration, CRUD)

**Analog:** self.

**Widen fieldType enum** (L284) — append `'keycapseq'` at END of the array (keeps it metadata-only in MariaDB; see migration script). The Drizzle definition must match the ALTER byte-for-byte:
```typescript
fieldType: mysqlEnum("fieldType", ["text","number","colour","select","textarea","keycapseq"]).notNull(),
```

**New `iconDone` column** (D-11) — copy the `baseDone`/`clickerLetterDone` boolean columns on `order_items` (L648-649):
```typescript
baseDone: boolean("base_done").notNull().default(false),
clickerLetterDone: boolean("clicker_letter_done").notNull().default(false),
// add: iconDone: boolean("icon_done").notNull().default(false),
```
Both the enum widen AND the `icon_done` column need a raw-SQL migration (see `scripts/phase25-fieldtype-migrate.ts`).

---

### `src/lib/validators.ts` (config/validation, transform)

**Analog:** self. Two enums list the fieldTypes and must gain `'keycapseq'`:
- `fields[].fieldType` (L183): `z.enum(["text","number","colour","select","textarea"])`
- (the `productType` enum at L156 is unaffected — keychain stays a productType)

---

### `src/lib/keychain-fields.ts` (service, CRUD-seed)

**Analog:** self — `seedKeychainFields` (whole file, L32-134).

**Pattern:** the function inserts 4 locked fields via `randomUUID()` + `db.insert(productConfigFields)` (L67-131). For square keychains, position-0 becomes a `keycapseq` field instead of `text` (RESEARCH Open Q3: REPLACE). Branch on `keychainShape` — round keeps today's `text` field (D-01 untouched). Preserve the `locked: true`, `required: true`, and `configJson: JSON.stringify({...})` shape exactly. The text field seed at L67-85 is the template:
```typescript
await db.insert(productConfigFields).values({
  id: randomUUID(), productId, position: 0,
  fieldType: "keycapseq", label: "Your keycaps", // UI-SPEC copy
  required: true, locked: true,
  configJson: JSON.stringify({
    maxSlots: 8, allowedChars: "A-Z", uppercase: true,
    profanityCheck: true, allowedIconIds: [], // admin picks later
  }),
});
```
Colour fields (positions 1-3, L88-131) stay unchanged (D-03).

---

### `src/lib/keychain-parts.ts` (utility, transform) — BACKWARDS COMPAT CRITICAL

**Analog:** self — `parseKeychainParts` (whole file).

**Pattern:** the legacy regex parser (`PARTS_RE` L32-33, `NAME_RE` L34, `LETTER_COUNT_RE` L35) reads letters/colours out of `computedSummary`. **Do NOT edit these three regexes** (D-06 backwards-compat; the 6 `keychain-parts.test.ts` cases must stay green). Instead add a NEW structured export, e.g. `parseKeycapSequence(configurationData)`, that reads `ensureKeycapSequence(cfg.values[seqFieldId])` — structured-first. `getKeychainBatches` calls the structured path when a sequence is present, else falls through to `parseKeychainParts` (legacy). Define the three explicit counts (Pitfall 1): `slotCount = slots.length`, `letterCount = slots.filter(s=>s.t==="L").length`, `iconCount = icons`.

---

### `src/lib/keycap-icons.ts` (model/data, static) — NEW, no exact analog

**Closest precedent:** the `public/icons/ninja/` asset convention (WebP files served by path) + the `ColourFieldConfig.allowedColorIds` "reference-a-library-by-id" concept. There is NO existing static catalog module — this is the one file with only a partial analog (planner: use RESEARCH Pattern 6).

**Shape:**
```typescript
export type KeycapIcon = { id: string; label: string; imageUrl: string; accentColors?: string[] };
export const KEYCAP_ICONS: KeycapIcon[] = [
  { id: "alien", label: "Alien", imageUrl: "/icons/keycaps/alien.webp" },
  // …34 entries from 25-CONTEXT.md <specifics> catalog
];
```
Assets live at `public/icons/keycaps/<id>.webp` (mirrors `public/icons/ninja/<group>/<name>.webp`). Served as plain `<img src>` — NOT lucide glyphs (UI-SPEC S2/S3).

---

### `src/lib/option-weight.ts` (utility, transform) — optional per D-12

**Analog:** self — `resolveTierWeightKg` (L68-81) keys weight off `configValues[unitFieldId].length`. Same `.length` problem as pricing. If per-slot-type weight is pursued (RESEARCH Open Q1 recommends flat-for-v1), branch on slot count instead of string length. Note the T-17-09 discipline in the docstring (L64-67): server re-reads weight, never trusts client grams.

---

### `src/actions/configurator.ts` (controller/server-action, request-response)

**Analog:** self — `pickSchemaByFieldType` (L54-67).

**Pattern:** add a `case "keycapseq": return KeycapSeqConfigSchema;` to the switch (mirrors the `textarea` case L64-65). `requireAdmin()` is already the first await in `addConfigField`/`updateConfigField` (CVE-2025-29927 — see `updateProductType` L117). The `hydrateConfigField` helper (L83-97) already dispatches via `ensureConfigJson`, so no change there. Locked-field guards at L314 / L354 already protect the seeded square field.

---

### `src/actions/admin-production.ts` (controller/server-action, batch) — the one genuinely new mechanism

**Analog:** self — `getKeychainBatches` (L414-598), specifically the base-grouping (L496-510) and clicker/letter-grouping (L516-538).

**Pattern for the NEW icon group (D-11):** icons group by `iconId` only (no shape — icons are square-only per D-01/A2). Mirror the `baseMap` grouping (L496-510) but key on `s.id`:
```typescript
const iconMap = new Map<string, KeychainUnit[]>();
for (const u of units) for (const s of u.slots) {
  if (s.t !== "I") continue;
  const list = iconMap.get(s.id) ?? []; list.push(u); iconMap.set(s.id, list);
}
```
Add types mirroring `KeychainBaseBatch` (L374-382): `KeychainIconBatch { iconId; iconLabel; totalQty; items; doneCount; allDone }`, add `iconCount`/`slots` to `KeychainUnit` (L350-371), add `icons` to the `KeychainBatches` return (L402-406). **Change `KeychainUnit.letters` to mean letter-slot count** (Pitfall 1) — the `boxesOf = letters × qty` math in keychain-batches.tsx stays correct once `letters` = letter count.

**New action `markKeychainIconPrinted`** — copy `markKeychainPartPrinted` (L565-598) exactly (UUID validation `UUID_RE` L557, dedupe+cap-500, `requireAdmin` first, `revalidatePath("/admin/production")`), setting `iconDone`. Assembly guard (`setKeychainAssembled` L607-642) gains a third condition: `iconDone` must also be true for mixed units.

Note: the whole file already uses MariaDB-safe manual `inArray` hydration (L437-462, step 3a) — no LATERAL. Follow that for any new product/icon lookup.

---

### `src/actions/paypal.ts` (+ `admin-pos.ts`, `whatsapp-order.ts`) (controller, request-response)

**Analog:** self — the select re-derive block (L336-398).

**Pattern:** the server already re-reads config JSON and rebuilds summary server-side (never trusts client) for `select` fields: `ensureConfigJson("select", row.configJson)` (L336), then re-reads `line.configurationData.values` (L350) and rebuilds `computedSummary` via `buildConfigSummaryServer` (L389). Add a parallel `keycapseq` branch:
```typescript
const cfg = ensureConfigJson("keycapseq", row.configJson) as KeycapSeqConfig;
const slots = ensureKeycapSequence(line.configurationData.values[row.id])
  .filter(s => s.t === "L" || cfg.allowedIconIds.includes(s.id)); // reject forged icon ids (V5)
const serverPrice = tiers[String(slots.length)] ?? null; // authoritative
```
The `computedPrice` is trusted from the snapshot today (comment L287, L402-417) — for `keycapseq` re-derive it from validated slot count (Pattern 9, Security V5 Tampering). Apply the same re-derive in `admin-pos.ts` and `whatsapp-order.ts` (RESEARCH names all three paths).

---

### `src/components/store/configurator-form.tsx` (component, request-response)

**Analog:** self — the fieldType dispatch (L528-567) and the accent-dot label (L508-521).

**Pattern:** add a `field.fieldType === "keycapseq"` branch after the `select` branch (L557-567) rendering a new `KeycapSeqField` (the S1 slot-rail builder). The accent-dot color logic (L512) currently switches colour(purple)/else(blue) — extend so letter slots read blue and icon slots read purple (UI-SPEC color contract). `onChange({ ...values, [field.id]: v })` (L502) stays the value-write mechanism — `v` becomes `JSON.stringify(slots)`.

---

### `src/components/store/keychain-preview.tsx` (component, request-response) — PIXEL-PARITY REQUIRED

**Analog:** self — `KeychainPreview` (whole file).

**Pattern:** today it maps a plain `text` string to `chars` (L54) and renders N cubes (L103-203). Extend to accept a `KeycapSlot[]` render model. For letter slots: keep the exact 3-layer cube (base shell L108-123, inset clicker L160-171, glyph L174-200) — **byte-for-byte identical when all-letters** (UI-SPEC S3 parity guarantee). For icon slots: reuse the identical shell/border/shadow (L108-123) but replace the glyph with `<img src={icon.imageUrl} alt="" style={{objectFit:"contain"}}>` on a fixed white shell. The `clamp()` sizing (L73/L76), first-cube ring tab (L126-157), and `role="img"`+`aria-label` (L90-91) stay. Both call sites (hero + mobile sticky strip in configurable-product-view.tsx L405 and L558) consume the same model.

---

### `src/components/store/keycap-icon-picker.tsx` (component, request-response) — NEW (S2)

**Analog:** `ColourPickerDialog` (`colour-picker-dialog.tsx`) — the grid/selected-ring/checkmark treatment (L385-497) and the `select-multiple` return-ids pattern (L204-215). For the customer-facing picker, adapt to a popover/sheet (UI-SPEC S2) rendering `allowedIconIds` as a `minmax(64px,1fr)` grid of WebP thumbnails + 12px labels. Tap fills the slot and closes. Selected icon shows green ring + `Check` (L487-493). If `allowedIconIds` empty → hide `+ Icon` entirely (graceful degrade, D-09/UI-SPEC).

---

### `src/components/store/configurable-product-view.tsx` (component, transform)

**Analog:** self — price memo (L226-256), `outOfTable` (L264-269), maxLength precedence (L317-325), summary builder (L82-108).

**Pattern:** three edits for `keycapseq`:
1. **Price** (L249): `lookupTierPrice(priceTiers, unitFieldValue)` → for keycapseq, `priceTiers[String(slots.length)]` where `slots = ensureKeycapSequence(unitFieldValue)`.
2. **Over-cap** (L264-269): `unitFieldValue.length > maxUnitCount` → `slots.length > maxUnitCount`.
3. **maxLength source of truth** (L318-325): keep `maxUnitCount` authoritative over config (RESEARCH Open Q2), fall back to `config.maxSlots`.
4. **Summary** (`buildSummary` L82-108): add a `keycapseq` branch emitting the mixed format `"SOUD" + [Alien] + [Skull] (6 keycaps: 4 letters, 2 icons) · …colours` (RESEARCH Pattern 4). The textarea-skip guard (L92) is the precedent for per-type branching here.

---

### `src/components/admin/config-field-modal.tsx` (component, request-response)

**Analog:** self — `ColourConfigForm` (L209-310), the `FIELD_TYPES` array (L76-83), the `getConfig`/`validateConfig`/state-init wiring (L829-882).

**Pattern:** add a `KeycapSeqConfigForm` modeled on `ColourConfigForm` (L209-310) — it opens the new `IconPickerDialog` (like `ColourConfigForm` opens `ColourPickerDialog` L292-307), stages `allowedIconIds`, and renders selected thumbnails (like the colour swatch strip L267-289). Also add the letter constraints inputs from `TextConfigForm` (maxSlots/allowedChars/uppercase/profanity, L112-151). Thread it through the five wiring points: `FIELD_TYPES` (L76-83, add `{value:"keycapseq",label:"Keycaps",...}`), `schemaByFieldType`/import (L29-42), the `useState` init (L829-854 pattern), `getConfig` (L856-863), `validateConfig` (L865-882), and the render dispatch (L1104-1133). Note: this field is `locked` on square keychains — but the admin still edits `allowedIconIds` via the locked-field inline drawer (`ConfigFieldFormBody` is shared by modal + locked drawer per L796-798).

---

### `src/components/admin/icon-picker-dialog.tsx` (component, request-response) — NEW (S4)

**Analog:** `colour-picker-dialog.tsx` (whole file) — adapt near-verbatim. Reuse: shadcn `Dialog` `max-w-[720px]` (L242), single fetch on open (here: import static `KEYCAP_ICONS` instead of `getActiveColoursForPicker` L144), client-side name filter (L165-179), `Set<string>` staged selection + `toggle` (L124/L195-202), native-checkbox brand-accent (L418-433), pluralised footer counter + disabled-when-zero CTA (L501-536), `select-multiple` return-ids on confirm (L209-215). Swap the colour swatch (L434-443) for a WebP thumbnail. No `myColoursPrompt` branch needed.

---

### `src/components/admin/keychain-batches.tsx` (component, request-response)

**Analog:** self — `Seg` (L347-369), `TickBox` (L71-85), `BoxPill` (L87-96), `ProgressBar` (L58-68), and the batch-card body (L123-226).

**Pattern:** add a fourth `Seg` labelled "Icons" with `accent={PURPLE}` (the three existing Segs at L530-552 use BLUE/PURPLE/GREEN — note PURPLE is already used for clicker; UI-SPEC S5 assigns purple to the Icons stripe, so confirm the accent constants). Render icon batch cards mirroring the base-batch card (L123-226): left accent stripe (L157), image + label (from `KEYCAP_ICONS`), `BoxPill` count (L185), per-unit `TickBox` (L212) wired to `markKeychainIconPrinted`, `ProgressBar` (L190). **No colour chips** on icon cards (colours fixed). The assembly-ready `FilterChip` logic (L609-611) gains the icon-parts condition.

---

### `scripts/phase25-fieldtype-migrate.ts` (migration, DDL) — NEW

**Analog:** `scripts/migrate-add-keychain-shape.ts` (whole file, L1-52) — adapt near-verbatim.

**Pattern:** same idempotency scaffold — read `DATABASE_URL`, `mysql.createConnection`, derive `dbName` from URL, `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS` guard (L22-32), ALTER only when needed, verify + log (L39-43). Two DDLs here (both idempotent-guarded):
```sql
ALTER TABLE product_config_fields
  MODIFY COLUMN fieldType ENUM('text','number','colour','select','textarea','keycapseq') NOT NULL;
ALTER TABLE order_items ADD COLUMN icon_done TINYINT(1) NOT NULL DEFAULT 0;
```
Guard the enum change by checking `'keycapseq'` is not already in `COLUMN_TYPE` (RESEARCH Pattern 2). Run dev-first (`ninjaz_3dn` via 3307 tunnel), then prod (`ninjaz_3dnp`). NEVER `drizzle-kit push` (hangs on remote). Verify with `SHOW CREATE TABLE`.

---

### `scripts/extract-keycap-icons.ts` (build script, file-I/O) — NEW, one-off dev machine

**Analog:** migrate-script scaffold (`import "dotenv/config"`, `main().catch(process.exit)`) + `sharp` (already a dep, used by Phase 7 image pipeline; `public/icons/ninja/*.webp` are the output convention).

**Pattern:** Node has NO built-in ZIP reader — shell out to the installed Info-ZIP `unzip` (Git Bash 6.00). Extract `Metadata/top_N.png` (512×512 RGBA, N=1..34) — NOT `plate_N.png` (includes bed + wipe tower). Then `sharp(top_N.png).webp({quality:82}).toFile("public/icons/keycaps/<id>.webp")`. **Human-verify plate→catalog mapping** (Pitfall 3 / A1): `model_settings.config` object names are part-codes, not labels — lay out all 34 and match against the 25-CONTEXT catalog before committing ids; re-confirm #7 "Yoshi egg". Do NOT add an npm zip dependency (RESEARCH anti-pattern).

---

### `src/lib/keychain-parts.test.ts` (test)

**Analog:** self — the 6 existing cases (L20-75) with the `makeCfg(summary)` helper (L12-18).

**Pattern:** keep all 6 legacy cases green (D-06). ADD new cases for the mixed format using the structured `values[seqFieldId]` path (not summary regex). The `makeCfg` helper already emits valid `ConfigurationData` JSON — extend it to also set `values` for the structured parser.

---

## Shared Patterns

### Admin auth guard (CVE-2025-29927)
**Source:** `src/actions/admin-production.ts` L328/L415/L570 (`await requireAdmin()` as FIRST await), `src/actions/configurator.ts` L117.
**Apply to:** every new/changed admin server action — `markKeychainIconPrinted`, the `keycapseq` config CRUD path, any icon-library action. `requireAdmin()` must be the first `await` in the function body, before any input validation.

### MariaDB LONGTEXT fail-soft parse
**Source:** `src/lib/config-fields.ts` — `ensureImagesV2` (L267-301), `ensureTiers` (L229-251), `ensureConfigurationData` (L321-336).
**Apply to:** `ensureKeycapSequence` (new) and every read site of the sequence JSON. Accept string-or-parsed, `JSON.parse` in try/catch, return safe empty (`[]`) on any failure, NEVER throw. Every JSON column read must go through an `ensure*` helper (CLAUDE.md MariaDB gotcha).

### MariaDB manual hydration (no LATERAL)
**Source:** `src/actions/admin-production.ts` L437-462 (sequential `.select().from().where(inArray(...))` + in-memory join, guarded against empty `IN ()`).
**Apply to:** any new product/icon lookup in production batching. Never `db.query.*.findMany({ with })`.

### Server-side re-derive (never trust client)
**Source:** `src/actions/paypal.ts` L336-398 (select re-price/re-summary at capture).
**Apply to:** `keycapseq` price + summary + weight on all three order paths (`paypal.ts`, `admin-pos.ts`, `whatsapp-order.ts`). Filter icon ids to `allowedIconIds`, cap at `maxSlots`, re-price from validated slot count.

### Raw-SQL idempotent migration (dev-first)
**Source:** `scripts/migrate-add-keychain-shape.ts` (whole file).
**Apply to:** the fieldType enum widen + `icon_done` column. INFORMATION_SCHEMA guard, ALTER, verify, log. Apply to `ninjaz_3dn` (dev) first, then `ninjaz_3dnp` (prod). Gate any code that WRITES `keycapseq` behind the migration (Pitfall 4).

### Brand colour + Claymorphism reuse
**Source:** `src/lib/brand.ts` (`BRAND.green/blue/purple/ink/cream`); inline-style cubes in `keychain-preview.tsx`; shadcn Dialog in `config-field-modal.tsx`/`colour-picker-dialog.tsx`.
**Apply to:** storefront surfaces (S1-S3) use inline-style Claymorphism; admin surfaces (S4-S5) use shadcn Dialog. Letter=blue accent, icon=purple accent, selected=green ring (UI-SPEC color contract).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/lib/keycap-icons.ts` | model/data | file-I/O (static) | No static catalog-of-assets module exists in the repo. Closest concepts are the `public/icons/ninja/` path convention and `ColourFieldConfig.allowedColorIds` (library-by-id reference), but neither is a drop-in analog. Planner: follow RESEARCH Pattern 6 (static `KeycapIcon[]` module, no DB table). |

All other 19 files have exact or role-match analogs (most are self-extensions of existing files).

## Metadata

**Analog search scope:** `src/lib/`, `src/actions/`, `src/components/store/`, `src/components/admin/`, `scripts/`, `public/icons/`, `src/lib/db/`
**Files scanned:** 15 read in full or targeted + 4 grep sweeps
**Pattern extraction date:** 2026-07-19
