# Phase 25: Mixed Letter + Icon Keycaps (Square Keychain) - Research

**Researched:** 2026-07-19
**Domain:** Next.js 15 / Drizzle / MariaDB configurable-product extension + 3mf asset pipeline
**Confidence:** HIGH (all findings verified against live repo code + actual 3mf archive contents)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (copied verbatim from 25-CONTEXT.md `<decisions>`)

- **D-01 — Scope lock: square shape only.** Feature applies ONLY when `products.keychainShape = 'square'`. Round keychain product/config/production path is completely unmodified — do not touch round-shape code paths (`src/lib/keychain-fields.ts` round handling, round batching in `admin-production.ts`).
- **D-02 — Shared slot cap (not additive).** The existing "Your name" text field's `maxLength` becomes the **total shared slot cap** across letters + icons combined. max=9 → up to 9 slots in ANY mix. No separate per-type caps.
- **D-03 — Letter slots: unchanged behaviour.** Letter slots keep today's exact behaviour: customer picks Base / Clicker / Letter colours (the 3 existing locked `colour` config fields) applied per-letter as today. No change to letter print structure: BASE (1 colour, alone) + CLICKER+LETTER (2-colour, together).
- **D-04 — Icon slots: fixed colours, no picker.** Icon slots do NOT show Base/Clicker/Letter pickers. Colours fully fixed per icon design. Customer's only choice for an icon slot is WHICH icon.
- **D-05 — New fieldType for mixed sequences.** Adding a new fieldType requires a DB migration (raw SQL `ALTER TABLE ... MODIFY COLUMN fieldType ENUM(...)`). Claude's Discretion on exact mechanism, but the config shape must express: shared max slot count, letter constraints (maxLength-equiv, allowedChars, uppercase, profanityCheck), and an icon library reference (allowed icon ids/labels/image URLs).
- **D-06 — Value serialization for mixed sequences.** `ConfigurationData.values` is `Record<string, string>`. New field type must serialize an ordered sequence of typed slots into a single string slot. Claude's Discretion on encoding, must round-trip losslessly and be parseable server-side. `computedSummary` needs a mixed format. `keychain-parts.ts` regex parser needs rework or a parallel path. Existing ROUND + historical SQUARE letter-only orders must continue to parse (backwards compat — do not break `keychain-parts.test.ts`).
- **D-07 — Icon asset pipeline.** Source: two Bambu 3mf files (`D:\Downloads\M batch3 keycaps p2s.3mf` and `...a1.3mf`) — same 34-design set, ONE design set. Plain zip archives. Extract all 34 top-down renders fresh. Store per local-filesystem convention. Name each per the catalog.
- **D-08 — All 34 icons included, including 13 franchise logos.** User accepts trademark/DMCA risk. Do NOT re-flag, gate, filter, or exclude any icons on IP grounds. Decision final, owned by user.
- **D-09 — Admin: icon library management.** Admin needs to manage/view the 34-icon library. Likely reuses `select`-fieldType option-picker (`SelectFieldConfig.options[].imageUrl`) or a dedicated icon-picker dialog analogous to `ColourPickerDialog`. Prefer reusing existing option/image patterns.
- **D-10 — Storefront rendering.** `configurable-product-view.tsx` + `keychain-preview.tsx` must render mixed sequences: each slot shows a letter glyph (chosen colours) OR the icon image, in order. Icon slots hide the Base/Clicker/Letter controls (D-04).
- **D-11 — Production batching: icon slots need a 3rd part group.** Icon slots = fixed WHITE base/shell + 1-2 accent-colour parts baked in. Does NOT match letter's colour-driven grouping. Icon slots need their own grouping key by icon id. Mixed order → BASE batch per letter (unchanged) PLUS one icon-print entry per icon slot (new group, keyed by icon id).
- **D-12 — Pricing/weight per slot type.** Tier pricing currently keys off text value `.length`. With mixed sequences slot count = letters + icons combined; tier lookup keys off total slot count, not string length. Icon keycap volume differs from letter keycap; determine if a distinct per-slot weight is needed or a flat approximation is acceptable for v1.

### Claude's Discretion (decisions this research resolves with a concrete recommendation)
- **D-05** exact new fieldType name + replace-vs-coexist mechanism → **resolved below** (new `keycapseq` type; replaces the locked text field on square keychains only).
- **D-06** exact sequence encoding + summary format → **resolved below** (JSON-array-in-string).
- **D-07** extraction tooling (Node has no built-in unzip) → **resolved below** (use `top_N.png`, extract via installed `unzip` in a one-time tsx/bash script — no npm dependency).
- **D-09** component reuse vs new → **resolved below** (static catalog module + icon-picker dialog adapted from `ColourPickerDialog`).
- **D-11** icon group key → **resolved below** (group by icon id, read from structured sequence not summary regex).
- **D-12** weight approach → **flagged as Open Question** with a recommendation.

### Deferred Ideas (OUT OF SCOPE)
- Mixed letter+icon for ROUND keychains — explicitly out of scope (D-01). Round stays letter-only. Possible future phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

No formal REQ-IDs are mapped to Phase 25 (`phase_req_ids` is null). The phase's requirements are the locked decisions D-01…D-12 above. The table maps each decision to the research finding that enables it.

| Decision | Behaviour | Research Support |
|----------|-----------|------------------|
| D-05 | New fieldType for mixed sequences | `ensureConfigJson`/`pickSchemaByFieldType`/`schemaByFieldType`/DB `mysqlEnum` extension pattern (textarea precedent, quick task 260430-icx) — §Architecture Pattern 1 |
| D-05 (DB) | Widen fieldType ENUM | Raw-SQL `ALTER TABLE ... MODIFY COLUMN` via tsx over SSH tunnel + `SHOW CREATE TABLE` verify — §Architecture Pattern 2 |
| D-06 | Sequence value encoding | JSON-array-in-string + `ensureKeycapSequence` helper — §Architecture Pattern 3 |
| D-06 | Summary + parser rework | Mixed summary format + structured-read (not regex) for icon batching; keep `PARTS_RE` for legacy — §Architecture Pattern 4 |
| D-07 | Icon extraction | `top_N.png` (512×512, transparent, 34 confirmed) via installed `unzip` — §Architecture Pattern 5 |
| D-09 | Admin icon library | Static `keycap-icons.ts` catalog + `ColourPickerDialog`-style icon dialog — §Architecture Pattern 6 |
| D-10 | Storefront mixed render | `configurator-form.tsx` fieldType dispatch + `keychain-preview.tsx` per-slot render — §Architecture Pattern 7 |
| D-11 | Icon production batch | New `KeychainIconBatch` keyed by icon id, read from structured values — §Architecture Pattern 8 |
| D-12 | Pricing by slot count | Slot-count tier lookup replacing `.length` — §Architecture Pattern 9 |
</phase_requirements>

## Summary

Phase 25 extends the Phase 19 configurable-product system with a new "mixed keycap sequence" field type for square keychains, where each slot in the customer's sequence is either a LETTER (today's behaviour, with globally-chosen Base/Clicker/Letter colours) or an ICON (new — one of 34 fixed-colour designs). Every piece of infrastructure this touches already exists in the repo and follows a well-worn extension pattern: the `textarea` fieldType was added in exactly this shape (quick task 260430-icx) by threading a new type through `config-fields.ts` (Zod schema + type + dispatch map), the DB `mysqlEnum`, the admin field CRUD (`configurator.ts` / `config-field-modal.tsx`), the PDP render dispatch (`configurator-form.tsx`), and the order-capture summary rebuild (`paypal.ts` / `admin-pos.ts` / `whatsapp-order.ts`). The main *new* work is: the icon asset pipeline, the sequence encoding, the storefront mixed-slot renderer, and a third production batch group keyed by icon id.

The 3mf source files were inspected directly. Both `M batch3 keycaps p2s.3mf` and `...a1.3mf` are ordinary ZIP archives containing 34 build plates each. The cleanest icon-render source is `Metadata/top_N.png` (N=1…34): 512×512, transparent alpha, isolated top-down orthographic view — exactly as D-07 described. (`Metadata/plate_N.png` also exists but includes the build-plate bed and wipe tower, so it is NOT the right source.) `Metadata/model_settings.config` confirms D-07's fixed-colour geometry: each object has named colour parts (`"black (83)"`, `"green (11)"`, …) mapped to Bambu AMS extruder slots (extruder 11 dominates for the white base, extruder 1 for black accents, with 2/3/5/6/7/8/9/10 for other accent colours). No npm dependency is needed to extract — the dev machine's Git Bash has Info-ZIP `unzip` 6.00, and `sharp` (already a dependency) does the top_N.png → compressed WebP conversion.

**Primary recommendation:** Add one new fieldType `keycapseq` that REPLACES the locked position-0 "Your name" text field on square-keychain products only (the 3 colour fields and round-keychain path stay untouched). Encode the ordered mixed sequence as a JSON array in the single `values[fieldId]` string, parsed by a new `ensureKeycapSequence` helper. Ship the 34 icons as a static catalog module (`src/lib/keycap-icons.ts`) with images at `public/icons/keycaps/<id>.webp`. Add a third production batch group (`KeychainIconBatch`) keyed by icon id that reads the *structured* sequence, not the summary regex — keeping the legacy `PARTS_RE` path intact for existing letter-only orders.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| New fieldType type + Zod schema + dispatch | Shared lib (`config-fields.ts`) | — | Single source of truth read by both server actions and client components (per Phase 19) |
| Widen `fieldType` ENUM | Database (MariaDB DDL) | Migration script (tsx) | Schema change; must be raw SQL over SSH tunnel, not drizzle-kit push |
| Sequence encoding/decoding | Shared lib (`config-fields.ts` / new helper) | — | Must be callable from client (price/preview) AND server (capture/production) |
| Icon catalog (34 fixed designs) | Shared lib (static module) | Filesystem (`public/icons/keycaps/`) | Fixed data set; static module is lighter than a DB table and matches `public/icons/ninja/` convention |
| Icon asset extraction | Build-time script (one-off, dev machine) | — | Runs once on Windows dev box; output committed to repo |
| Admin field config + icon selection | Admin server actions (`configurator.ts`) + admin client (`config-field-modal.tsx`) | — | Admin-guarded CRUD; `requireAdmin()` first await |
| Storefront mixed-slot input | Client (`configurator-form.tsx`) | — | Interactive per-slot letter/icon picker; client UI state |
| Live preview | Client (`keychain-preview.tsx`) | — | Pure render of current sequence + colours |
| Price computation (slot-count tiers) | Client (display) + Server (authoritative re-derive) | Shared lib | Client shows price; server re-derives at capture (never trust client) |
| Production batching (icon group) | Server action (`admin-production.ts`) | — | Reads structured sequence; admin-guarded |
| Shipping weight per slot type | Shared lib (`option-weight.ts` pattern) | Server | Server re-reads weight; client value never trusted (T-17-09) |

## Standard Stack

No new runtime libraries are needed. Everything required is already installed.

### Core (already present — verified via package.json)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 15.5.15 | App Router framework | Project-locked |
| drizzle-orm | 0.45.2 | DB access (manual hydration, no LATERAL) | Project-locked |
| mysql2 | 3.11.0 | MariaDB driver (LONGTEXT → string) | Project-locked |
| zod | 3.25.76 | Config schema validation (`schemaByFieldType`) | Project-locked; every fieldType has a Zod schema |
| sharp | 0.34.5 | PNG → WebP/AVIF compression | Already used by Phase 7 image pipeline; use for icon assets |
| vitest | 4.1.5 | Unit tests (`keychain-parts.test.ts`) | Project-locked; extend for sequence parser |

### Supporting (build-time only, NOT an npm dependency)
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| Info-ZIP `unzip` | 6.00 (Git Bash, dev machine) | Extract PNGs from the 3mf ZIP archives | One-time asset extraction script |
| `tsx` | 4.21.0 (devDependency) | Run the extraction/migration scripts | Extraction + ENUM migration + optional catalog codegen |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `unzip` shell-out | `adm-zip` / `unzipper` npm dep | Adds a dependency for a one-time dev-machine task. `unzip` is already present in Git Bash. Node has **no** built-in ZIP reader (only `zlib` for raw deflate, which cannot parse the ZIP central directory). Do NOT add an npm dep for this. |
| Static icon catalog module | New `keycap_icons` DB table + admin CRUD | The 34-icon set is fixed and ships with the code. A static module is simpler, needs no migration, and versions with the repo. A DB table is justified only if the admin must add/remove icons at runtime — not required by D-09 (which asks to "manage/view", satisfiable read-only). |
| `top_N.png` render source | `plate_N.png` | `plate_N.png` includes the build-plate bed + wipe tower (confirmed in `plate_1.json` `bbox_objects` → contains `"wipe_tower"`). `top_N.png` is the isolated top-down object render — the correct source. |
| New `keycapseq` fieldType | Overload `select` with mixed slots | `select` is a single-choice-per-field type; it cannot express an ordered variable-length sequence of mixed-typed slots under one shared cap. A dedicated type is cleaner and mirrors the existing per-type dispatch. |

**Installation:** None. `npm install` unchanged.

**Version verification:** `sharp` and `vitest` versions confirmed present in `package.json` (read 2026-07-19). No registry lookups needed — no new packages.

## Architecture Patterns

### System Data-Flow Diagram

```
                          ADMIN                                     CUSTOMER (PDP, square keychain)
                            │                                                  │
        create/edit keychain product                          types "SOUD", taps [+ icon] → picks Alien, Skull
                            │                                                  │
              seedKeychainSquareFields()                          configurator-form.tsx (keycapseq dispatch)
        position 0: keycapseq (NEW) ── replaces text             builds KeycapSlot[] = [{t:L,ch:S}...{t:I,id:alien}]
        position 1-3: colour Base/Clicker/Letter (unchanged)               │
                            │                                    values[seqFieldId] = JSON.stringify(slots)
              config-field-modal.tsx                                        │
          admin picks allowed icons  ◄─── keycap-icons.ts (static 34)   price = tiers[String(slots.length)]
                            │                                    keychain-preview.tsx renders per-slot
              configurator.ts (addConfigField)                     letter → glyph+colours | icon → <img>
          pickSchemaByFieldType("keycapseq")                                │
          validates KeycapSeqConfigSchema                          add-to-bag → ConfigurationData snapshot
                            │                                        { values, computedPrice, computedSummary }
          INSERT product_config_fields                                     │
          fieldType ENUM includes 'keycapseq' ◄── DB migration    ────────►│
                            │                                    ┌──────────┴───────────┐
                            ▼                              checkout (paypal.ts)   POS / WhatsApp
              DB: product_config_fields                    server re-derives:      (same rebuild)
              configJson = KeycapSeqConfig (LONGTEXT)      - ensureKeycapSequence(values[id])
                                                           - re-price by slot count
                                                           - buildConfigSummaryServer (mixed)
                                                           - re-derive weight per slot type
                                                                     │
                                                           order_items.configuration_data (LONGTEXT)
                                                                     │
                                            ┌────────────────────────┴─────────────────────────┐
                                            ▼                                                    ▼
                              admin-production.ts getKeychainBatches()              order/invoice/email render
                              ensureKeycapSequence(item.configurationData)          ensureOrderItemConfigData()
                                            │                                        renders computedSummary (string)
                        ┌───────────────────┼────────────────────┐
                        ▼                    ▼                    ▼
                 BASE batch          CLICKER+LETTER        ICON batch (NEW)
                 key: shape|base     key: shape|clk|ltr    key: iconId
                 count = #letters    count = #letters      count = #icon slots
                 (unchanged)         (unchanged)           white shell + baked accents
```

### Recommended File Structure (new + touched)
```
src/lib/
├── config-fields.ts            # + KeycapSeqConfig type/schema, + ensureKeycapSequence, + FieldType union
├── keycap-icons.ts             # NEW — static 34-icon catalog {id,label,imageUrl,accentColors?}
├── keychain-fields.ts          # + seedKeychainSquareFields (keycapseq at pos 0) OR branch on shape
├── keychain-parts.ts           # + parseKeycapSequence path; keep PARTS_RE for legacy letter-only
├── config-summary.ts / custom-text.ts  # + mixed-sequence summary builder (server + client shared)
└── db/schema.ts                # fieldType mysqlEnum += 'keycapseq'

src/actions/
├── configurator.ts             # pickSchemaByFieldType += keycapseq case
├── admin-production.ts         # + KeychainIconBatch type + icon grouping in getKeychainBatches
├── paypal.ts / admin-pos.ts / whatsapp-order.ts  # server re-derive for keycapseq lines

src/components/store/
├── configurator-form.tsx       # + KeycapSeqField (letter/icon slot builder)
└── keychain-preview.tsx        # + per-slot render (letter glyph OR icon image)

src/components/admin/
├── config-field-modal.tsx      # + keycapseq config UI (icon multi-select)
└── keychain-batches.tsx        # + Icon batch view (4th segment or under square board)

scripts/
├── extract-keycap-icons.ts     # NEW one-off — unzip top_N.png → sharp → public/icons/keycaps/<id>.webp
└── phase25-fieldtype-migrate.ts # NEW — ALTER TABLE MODIFY COLUMN fieldType ENUM(...)

public/icons/keycaps/           # NEW — 34 committed WebP icon renders (shared, versioned)
```

### Pattern 1: Add a new fieldType (the textarea precedent) — HIGH confidence
Every fieldType is threaded through the same six points. Follow the `textarea` addition (quick task 260430-icx) exactly:
1. `src/lib/config-fields.ts` — add to `FieldType` union (line 25), add `KeycapSeqConfig` type + `KeycapSeqConfigSchema` Zod schema, register in `schemaByFieldType` map (line 188).
2. `src/lib/db/schema.ts:284` — add `'keycapseq'` to the `mysqlEnum` array (requires DB migration, Pattern 2).
3. `src/lib/validators.ts:183` — add `'keycapseq'` to the field enum used by product save validation.
4. `src/actions/configurator.ts` — `pickSchemaByFieldType` gains a `keycapseq` case (mirrors line 218/298).
5. `src/components/store/configurator-form.tsx` — add a `field.fieldType === "keycapseq"` render branch (after line 557).
6. `src/components/admin/config-field-modal.tsx` — add the admin config editor for the new type.

```typescript
// Source: src/lib/config-fields.ts (existing pattern, verified 2026-07-19)
export type FieldType = "text" | "number" | "colour" | "select" | "textarea" | "keycapseq";

export type KeycapSeqConfig = {
  maxSlots: number;          // D-02 shared cap (replaces TextFieldConfig.maxLength)
  allowedChars: string;      // letters: "A-Z"
  uppercase: boolean;
  profanityCheck: boolean;
  allowedIconIds: string[];  // D-05/D-09 — references keycap-icons.ts catalog, analogous to ColourFieldConfig.allowedColorIds
};

export const KeycapSeqConfigSchema: z.ZodType<KeycapSeqConfig> = z.object({
  maxSlots: z.number().int().min(1).max(200),
  allowedChars: z.string().min(1),
  uppercase: z.boolean(),
  profanityCheck: z.boolean(),
  allowedIconIds: z.array(z.string().min(1)), // empty allowed at save-time; PDP validates non-empty at render
});
// register: schemaByFieldType.keycapseq = KeycapSeqConfigSchema
```

### Pattern 2: Widen the ENUM safely on MariaDB — HIGH confidence
The project NEVER runs `drizzle-kit push` against the remote (it hangs — CLAUDE.md + STATE.md Phase 6 06-01 precedent). Ship a raw-SQL tsx migration, idempotent, verified with `SHOW CREATE TABLE`.

```sql
-- scripts/phase25-fieldtype-migrate.ts issues this via mysql2 over the SSH tunnel
ALTER TABLE product_config_fields
  MODIFY COLUMN fieldType
  ENUM('text','number','colour','select','textarea','keycapseq') NOT NULL;
```
- `MODIFY COLUMN` to add an ENUM value at the END of the list is metadata-only in MariaDB 10.11 (no table rebuild, no row rewrite) — safe on the live table.
- Idempotency: the script should first `SHOW COLUMNS FROM product_config_fields LIKE 'fieldType'` and skip if `'keycapseq'` is already in the type string.
- Apply to BOTH dev (`ninjaz_3dn`) and later prod (`ninjaz_3dnp`) per the dev-first rule. Local dev requires the 3307 SSH tunnel (reference_local_dev_db_tunnel).
- Verify with `SHOW CREATE TABLE product_config_fields` after apply.

### Pattern 3: Sequence encoding — JSON-array-in-string (RECOMMENDED for D-06) — HIGH confidence
`ConfigurationData.values` is `Record<string, string>`. Store the ordered sequence as a JSON array in the one string slot. This round-trips losslessly, is trivially parsed server-side, and — critically — avoids delimiter-collision bugs that a `L:S|I:alien` token string would hit if an icon id ever contained the delimiter. It matches the project's universal "JSON-in-LONGTEXT parsed via an `ensure*` helper" convention.

```typescript
// Source: recommended new code in src/lib/config-fields.ts
export type KeycapSlot =
  | { t: "L"; ch: string }   // letter slot (colours come from the 3 global colour fields, D-03)
  | { t: "I"; id: string };  // icon slot (fixed colours per icon, D-04)

// values[seqFieldId] = JSON.stringify(KeycapSlot[])
// e.g. '[{"t":"L","ch":"S"},{"t":"L","ch":"O"},{"t":"I","id":"alien"},{"t":"I","id":"skull"}]'

/** Fail-soft parse (mirrors ensureImagesV2 / ensureConfigurationData). Never throws. */
export function ensureKeycapSequence(raw: unknown): KeycapSlot[] {
  if (raw == null) return [];
  let arr: unknown = raw;
  if (typeof raw === "string") {
    if (raw.trim() === "") return [];
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const out: KeycapSlot[] = [];
  for (const s of arr) {
    if (s && typeof s === "object") {
      const o = s as Record<string, unknown>;
      if (o.t === "L" && typeof o.ch === "string" && o.ch.length === 1) out.push({ t: "L", ch: o.ch });
      else if (o.t === "I" && typeof o.id === "string" && o.id) out.push({ t: "I", id: o.id });
    }
  }
  return out;
}
```
Note: letters carry NO per-slot colour (D-03 — the 3 global colour fields apply to all letters), so a letter slot only needs its char. This keeps the encoding minimal.

### Pattern 4: computedSummary + parser (backwards compat is mandatory) — HIGH confidence
Two truths must coexist:
- **Human-readable summary** (`computedSummary`) is rendered as a plain string on order detail / invoice / email — it does NOT need to be machine-parseable for icons.
- **Machine-readable source for production** is the structured `configurationData.values[seqFieldId]` (Pattern 3), NOT the summary regex.

Recommended mixed summary format (letter runs shown quoted, icons named in brackets, plus a slot breakdown so admin sees counts):
```
"SOUD" + [Alien] + [Skull] (6 keycaps: 4 letters, 2 icons) · Magenta base · Periwinkle clicker · Candy letter
```
Backwards-compat rules for `keychain-parts.ts`:
- Keep `PARTS_RE` / `NAME_RE` / `LETTER_COUNT_RE` untouched for the legacy letter-only format → existing ROUND orders and historical SQUARE letter-only orders keep parsing. `keychain-parts.test.ts` must stay green (all 6 cases).
- Add a **structured-first** path in `getKeychainBatches`: if a line's `configurationData.values[seqFieldId]` parses to a non-empty `KeycapSlot[]`, use it (letters + icons); otherwise fall through to `parseKeychainParts(summary)` (legacy). This makes the icon batching read the sequence directly and never depends on parsing icons out of the summary string.

### Pattern 5: Icon extraction pipeline — VERIFIED against the actual 3mf
Confirmed facts (inspected `M batch3 keycaps p2s.3mf` + `...a1.3mf` on 2026-07-19):
- Both files are ZIP archives; both contain 34 × `Metadata/top_N.png` (N=1…34) and 34 × `Metadata/plate_N.json`. Same 34-design set — do NOT treat as 68.
- `top_N.png` = **512×512, transparent alpha (RGBA), isolated top-down orthographic render** (~2.2 KB each). This is the icon source. [VERIFIED via sharp metadata]
- `plate_N.png` (512×512, ~10 KB) includes the build-plate bed + wipe tower (`plate_1.json` `bbox_objects` contains `"wipe_tower"`) — NOT the icon source.
- `Metadata/model_settings.config` confirms D-07's colour geometry: per-object named colour parts (`"black (83)"`, `"green (11)"`, `"yellow (12)"`, …) each tagged with an AMS `extruder` slot. Extruder usage histogram across the file: slot 1 (black) and slot 11 (white base) dominate, with 2/3/5/6/7/8/9/10 for accent colours — matching "white base + 1-2 baked accent colours per icon."

```bash
# scripts/extract-keycap-icons.ts (or a bash step) — one-time, dev machine.
# Node has NO built-in ZIP reader; use the installed unzip (Info-ZIP 6.00 in Git Bash).
unzip -o "D:/Downloads/M batch3 keycaps p2s.3mf" "Metadata/top_*.png" -d /tmp/keycaps
# then, per icon (sharp is already a dependency):
#   sharp(top_N.png).webp({ quality: 82 }).toFile(public/icons/keycaps/<catalog-id>.webp)
```
Map plate index N → catalog id using the D-08/`<specifics>` catalog order. IMPORTANT: verify the plate→design mapping visually during extraction — the CONTEXT catalog is ordered 1…34 but the plate numbering in the 3mf must be confirmed to match (plate_1 object name in `model_settings.config` was `M batch3 keycaps_B_A_A_B_B_B_B`, a part-code, not a human name — so a human/visual check of each `top_N.png` against the catalog labels is required). Also re-confirm the low-confidence IDs flagged in CONTEXT: #7 "Spotted green ball (possible Yoshi egg)".

### Pattern 6: Admin icon library — static catalog + adapted picker — MEDIUM confidence
- Ship `src/lib/keycap-icons.ts`: `export const KEYCAP_ICONS: KeycapIcon[]` where `KeycapIcon = { id: string; label: string; imageUrl: string; accentColors?: string[] }` — 34 entries, ids like `alien`, `skull`, `captain-america`. `imageUrl` = `/icons/keycaps/<id>.webp`.
- Admin selection UI reuses the **multi-select dialog** pattern from `ColourPickerDialog` (Phase 18, reused Phase 19 D-08). The icon field's `allowedIconIds` mirrors `ColourFieldConfig.allowedColorIds` exactly — a multi-select of catalog ids with image thumbnails. `SelectFieldConfig.options[].imageUrl` proves per-option images already render in this codebase.
- Because the catalog is static, the admin "management" surface (D-09) can be a read-only gallery + the per-field allow-list picker. No new DB table, no CRUD migration.

### Pattern 7: Storefront mixed-slot rendering (D-10) — MEDIUM confidence
- `configurator-form.tsx`: add a `KeycapSeqField` component rendered from the `keycapseq` dispatch branch. It presents an ordered list of slots; each slot is a letter (typed char) or an icon (chosen from the allowed catalog). A single shared counter enforces `maxSlots` (D-02). Icon slots do not surface any colour control (D-04 — the 3 colour fields render separately and apply to letters only).
- `keychain-preview.tsx`: today it renders `chars.length` cubes from a plain string. Extend it to accept the `KeycapSlot[]` (or a render-model derived from it) and, per slot, render either the existing letter-glyph cube (with `baseHex/clickerHex/letterHex`) or an icon cube showing `<img src={icon.imageUrl}>` on the fixed white shell. Keep the square path pixel-identical when the sequence is all-letters so nothing regresses. The colour resolution in `configurable-product-view.tsx` (`resolveHex(0/1/2)`) stays for letters.

### Pattern 8: Production batching — third group keyed by icon id (D-11) — HIGH confidence
`getKeychainBatches` (`admin-production.ts:414`) currently produces `bases` + `clickerLetters` + `assembly`. Extend:
- Derive `KeycapSlot[]` per line via `ensureKeycapSequence(values[seqFieldId])` (structured-first, Pattern 4).
- **Letters** feed the existing BASE (`shape|base`) and CLICKER+LETTER (`shape|clicker|letter`) groups — but the per-unit letter count must become **the number of `t:"L"` slots**, not `name.length` / not total slots. Update `KeychainUnit.letters` to mean letter-slot count. (`keychain-batches.tsx` `boxesOf` = `letters × qty` stays correct once `letters` = letter-slot count.)
- **Icons** feed a NEW `KeychainIconBatch { iconId; iconLabel; totalQty; items; doneCount; allDone }` grouped by `iconId` only (colours are fixed per icon; icons are square-only per D-01, so no shape in the key). Add a matching `iconDone` boolean column to `order_items` for tick state (mirrors `baseDone`/`clickerLetterDone`), plus a `markKeychainIconPrinted` action.
- Assembly readiness gains a third condition: a mixed unit is assemblable when all its letter parts AND all its icon parts are printed.
- Admin UI (`keychain-batches.tsx`): add an "Icons" segment (4th `Seg`) or an Icon batch section within the Square board. Icons render as image + label + count; no colour chips.

### Pattern 9: Pricing by slot count (D-12) — HIGH confidence
`lookupTierPrice(tiers, value)` keys off `value.length`. For a `keycapseq` line the value is a JSON blob — `.length` is meaningless. Compute the tier key from the sequence:
```typescript
const slots = ensureKeycapSequence(values[seqFieldId]);
const price = tiers[String(slots.length)] ?? null; // slot count = letters + icons (D-02)
```
Do this in BOTH places:
- Client (`configurable-product-view.tsx`): the `unitFieldValue.length` logic (lines 226/264-269) must switch to slot count for the keycapseq field, including the `outOfTable` (over-cap) check → compare `slots.length > maxUnitCount`.
- Server (`paypal.ts` ~line 350-390, `admin-pos.ts`, `whatsapp-order.ts`): re-derive price from slot count at capture — never trust `computedPrice` blindly for the keycapseq type (same discipline as the `select` per-option re-price the code already does).

### Anti-Patterns to Avoid
- **Parsing icons out of `computedSummary` with a regex.** The summary is lossy/human-facing. Read icons from the structured `values` (Pattern 4). Regex-parsing icon ids out of bracketed labels will break the moment a label changes.
- **`drizzle-kit push` for the ENUM change.** Hangs on remote MariaDB. Raw SQL only (Pattern 2).
- **Adding an npm zip library.** Extraction is a one-time dev-machine task; `unzip` is already installed.
- **Touching round-keychain code paths.** D-01 forbids it. Branch on `keychainShape === 'square'` for every new behaviour.
- **`db.query.*.findMany({ with })`** anywhere new — MariaDB has no LATERAL. Manual `inArray` hydration (the codebase already does this everywhere, e.g. `getKeychainBatches` step 3a).
- **Trusting client `computedPrice`/`computedSummary`.** Re-derive server-side on all three order paths.
- **Per-letter colour in the encoding.** D-03: letters share the 3 global colour fields. Don't add per-slot colour to letter tokens.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ZIP extraction from 3mf | Custom deflate/central-directory reader on `zlib` | Installed `unzip` (Git Bash) | Node's `zlib` only does raw deflate, not the ZIP container. A hand-rolled ZIP parser is a classic footgun. |
| PNG → web image | Manual canvas/encoder | `sharp` (already a dep) | Phase 7 already standardised on sharp for compression/format. |
| LONGTEXT JSON parsing | Ad-hoc `JSON.parse` at each read site | `ensure*` helpers (`ensureKeycapSequence` new) | MariaDB returns JSON columns as strings; every read must go through a fail-soft helper (CLAUDE.md gotcha). |
| fieldType config validation | Manual object checks | Zod `schemaByFieldType` dispatch | Existing pattern; `pickSchemaByFieldType` already routes validation. |
| Icon multi-select UI | New picker from scratch | Adapt `ColourPickerDialog` | Phase 18/19 already solved multi-select-with-thumbnails. |
| ENUM migration idempotency | Blind `ALTER` | `SHOW COLUMNS` guard + `SHOW CREATE TABLE` verify | Project's established raw-SQL migration discipline. |

**Key insight:** Almost nothing here is genuinely new infrastructure — the phase is a disciplined *extension* along seams the codebase already exposes (fieldType dispatch, ensure-helpers, manual hydration, dev-first raw-SQL migration, sharp image pipeline). The one truly new mechanism is the icon batch group, and even that mirrors the existing base/clicker grouping shape.

## Common Pitfalls

### Pitfall 1: `letters` count silently wrong after mixed sequences land
**What goes wrong:** `KeychainUnit.letters` currently means "characters in the name". Production box counts (`letters × qty`) and the summary's `(N your name)` token both rely on it. If a mixed sequence sets `letters = total slots`, the BASE/CLICKER batches over-count (icons aren't letters), and if it stays `name.length` the letter batches under-count when letters are interleaved.
**Why it happens:** Two different counts (total slots for pricing, letter-slot count for letter batches) get conflated.
**How to avoid:** Define precisely: `slotCount` (pricing, D-12) = `slots.length`; `letterCount` (BASE/CLICKER batches) = `slots.filter(s=>s.t==="L").length`; `iconCount` (icon batch) = icons. Keep all three explicit.
**Warning signs:** Production board shows too many/few base boxes for a mixed order; tier price mismatches between PDP and captured order.

### Pitfall 2: Legacy order parsing breaks
**What goes wrong:** Reworking `keychain-parts.ts` for mixed sequences accidentally changes the legacy regex, breaking existing round + historical square letter-only orders on the production board and re-order views.
**Why it happens:** Editing `PARTS_RE`/`NAME_RE` in place instead of adding a parallel structured path.
**How to avoid:** Add the structured `keycapseq` path as a NEW branch; leave `PARTS_RE` and the 6 `keychain-parts.test.ts` cases untouched and green. Add new tests for the mixed format.
**Warning signs:** `npx vitest src/lib/keychain-parts.test.ts` fails; existing orders show "(no name)".

### Pitfall 3: Plate→design index mismatch in extraction
**What goes wrong:** `top_5.png` is assumed to be catalog item #5 but the 3mf plate order does not match the CONTEXT catalog order, so icons are mislabeled (customer picks "Skull", gets "Alien").
**Why it happens:** `model_settings.config` object names are part-codes (`M batch3 keycaps_B_A_A_B_B_B_B`), not human labels — there is no reliable programmatic name→plate map.
**How to avoid:** Extract all 34 `top_N.png`, lay them out, and human-verify each against the catalog labels before committing the id mapping. Re-confirm the flagged low-confidence IDs (#7 Yoshi egg).
**Warning signs:** Preview image doesn't match the chosen label.

### Pitfall 4: ENUM migration applied to dev but not prod (or vice-versa)
**What goes wrong:** Code referencing `'keycapseq'` deploys to an environment whose DB ENUM doesn't include it → `ER_DATA_TOO_LONG`/`WARN_DATA_TRUNCATED` on insert, or the value is silently coerced to `''`.
**Why it happens:** Dev DB (`ninjaz_3dn`) and prod DB (`ninjaz_3dnp`) migrate separately; dev-first means prod lags.
**How to avoid:** Gate any code that writes `keycapseq` behind the migration; apply to dev first (with the feature), verify, then apply to prod as part of the prod promotion. Idempotent script + `SHOW CREATE TABLE` check both DBs.
**Warning signs:** Product save fails only in one environment.

### Pitfall 5: Icon slots leak colour controls or wrong weight
**What goes wrong:** Icon slots show Base/Clicker/Letter pickers (violates D-04) or are priced/weighed as letter keycaps.
**Why it happens:** The colour fields render globally; the preview/summary/weight code paths assume every slot is a letter.
**How to avoid:** Colour fields still render (they apply to letters), but the preview/summary must render icon slots without colour; weight/pricing must branch per slot type.
**Warning signs:** An all-icon keychain still asks for a "Letter colour"; shipping quote identical for icon-heavy vs letter-heavy orders when it shouldn't be.

## Code Examples

### Reading the sequence server-side at capture (re-derive, don't trust client)
```typescript
// Source: pattern derived from src/actions/paypal.ts:333-398 (select re-price) — verified 2026-07-19
const cfg = ensureConfigJson("keycapseq", row.configJson) as KeycapSeqConfig;
const slots = ensureKeycapSequence(line.configurationData.values[row.id]);
// validate icon ids against the allow-list (reject unknown — see Security Domain)
const cleanSlots = slots.filter(s => s.t === "L" || cfg.allowedIconIds.includes(s.id));
const slotCount = cleanSlots.length;
const serverPrice = tiers[String(slotCount)] ?? null; // authoritative
```

### Icon production grouping
```typescript
// Source: mirrors src/actions/admin-production.ts:496-511 base grouping — verified 2026-07-19
const iconMap = new Map<string, KeychainUnit[]>();
for (const u of units) {
  for (const s of u.slots) {
    if (s.t !== "I") continue;
    const list = iconMap.get(s.id) ?? [];
    list.push(u);
    iconMap.set(s.id, list);
  }
}
// each entry → KeychainIconBatch keyed by icon id (label from KEYCAP_ICONS)
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `top_N.png` plate index maps 1:1 to the CONTEXT catalog order 1…34 | Pattern 5 / Pitfall 3 | Mislabeled icons shipped to customers — MUST human-verify during extraction, do not assume |
| A2 | Icons are square-only (no round icon keycaps), so icon batch key needs no shape | Pattern 8 | If round icons ever exist, key would need shape — but D-01 scopes to square, so safe for this phase |
| A3 | Letters share the 3 global colour fields (no per-letter colour) so letter tokens need only a char | Pattern 3 | If per-letter colour is wanted, encoding must expand — but D-03 explicitly says letters keep today's global-colour behaviour |
| A4 | Static icon catalog (no DB table) satisfies D-09 "manage/view" | Pattern 6 | If admin must add/remove icons at runtime, a DB table is needed — D-09 does not require runtime CRUD |
| A5 | `MODIFY COLUMN` appending an ENUM value is metadata-only (no rebuild) on the live table | Pattern 2 | If MariaDB rebuilds the table it could be slow/lock — mitigated by appending at END of ENUM list; verify on dev first |
| A6 | A flat per-slot weight approximation is acceptable for v1 (icon vs letter volume difference) | Open Question 1 | Under/over-charging shipping — flagged for user decision |

## Open Questions

1. **Icon vs letter shipping weight (D-12).**
   - What we know: `option-weight.ts` (`resolveOptionWeightKg`, `resolveTierWeightKg`) already resolves per-line weight server-side; icon keycap = full 19.16×19.16×5.34mm white shell + accents vs the letter base+clicker+letter stack.
   - What's unclear: whether the physical weight difference is material enough to justify per-slot-type weight, or whether the existing tier/product weight (approximated by slot count) is close enough for v1.
   - Recommendation: For v1, treat every slot (letter or icon) as one keycap of the same nominal weight and let the existing slot-count → tier/product weight ladder handle it (A6). Revisit with a real scale measurement post-launch if shipping quotes look off. Confirm with user.

2. **Where does the `maxSlots` cap live for the migrated square product?**
   - What we know: today the square keychain's cap comes from the tier table `maxUnitCount` (which `configurable-product-view.tsx` treats as authoritative over `config.maxLength`).
   - What's unclear: whether the new `keycapseq` field should read `maxSlots` from its own config, from the tier table's `maxUnitCount`, or keep both in sync.
   - Recommendation: Keep the tier table `maxUnitCount` as the single source of truth for the cap (as today), and mirror it into `KeycapSeqConfig.maxSlots` only as a fallback — matches the existing precedence in `configurable-product-view.tsx:323`.

3. **Does the new field replace or coexist with the locked "Your name" text field on square products?**
   - What we know: D-05 leaves this to Claude's discretion; the 3 colour fields must stay.
   - Recommendation: REPLACE the position-0 text field with the `keycapseq` field on square keychains (via a `seedKeychainSquareFields` variant or a branch in `seedKeychainFields` on `keychainShape`). Round keychains keep the plain text field untouched (D-01). This keeps ONE field owning the shared cap and avoids a dead text input. Existing square products need a one-time data migration (convert the locked text field → keycapseq) OR the change applies only to newly-created/edited square keychains — confirm the rollout scope with the user (see Open Question 4).

4. **Rollout to existing square keychain products.**
   - What we know: there is at least one live square keychain product plus DEVTEST orders on dev.
   - What's unclear: whether existing square products should be auto-migrated to the new field type, or whether only new/edited products get it.
   - Recommendation: Provide a small idempotent backfill (swap the locked text field for a keycapseq field, preserving colour fields + tiers) run dev-first, so the existing live square keychain gains icons without a manual rebuild. Existing *orders* are unaffected (they snapshot their own configurationData). Confirm with user before touching the live product row.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `unzip` (Info-ZIP) | Icon extraction from 3mf (D-07) | ✓ | 6.00 (Git Bash) | PowerShell `Expand-Archive` after copy to `.zip` (also present) |
| `sharp` | top_N.png → WebP (D-07) | ✓ | 0.34.5 | — |
| `tsx` | migration + extraction scripts | ✓ | 4.21.0 | `node` + ts build |
| Source 3mf files | Icon renders | ✓ | — | `D:\Downloads\M batch3 keycaps p2s.3mf` (3.27 MB) + `...a1.3mf` (3.27 MB) both present, 34 top_N.png each |
| MariaDB (dev `ninjaz_3dn`) | ENUM migration | ✓ (via 3307 SSH tunnel) | 10.11 | — |
| `powershell` | zip fallback | ✓ | — | — |
| `7z` | zip (alt) | ✗ | — | `unzip` covers it |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** `7z` absent — irrelevant, `unzip` is present.

## Security Domain

Light — this phase adds one customer-facing input (icon selection) and one admin surface. No auth/session/crypto changes.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Zod `KeycapSeqConfigSchema` + `ensureKeycapSequence` fail-soft parse; **server-side reject unknown icon ids** against `cfg.allowedIconIds` at capture (mirrors the existing select-option re-validation in `paypal.ts`) |
| V4 Access Control | yes | Every new admin action (`markKeychainIconPrinted`, icon-config CRUD) starts with `await requireAdmin()` first await (CVE-2025-29927) |
| V1/V2/V3/V6 | no | No auth/session/crypto surface touched |

| Threat Pattern | STRIDE | Mitigation |
|----------------|--------|-----------|
| Client sends forged icon id / oversized sequence | Tampering | Server re-derives from `ensureKeycapSequence`, filters to `allowedIconIds`, caps at `maxSlots`; never trusts client `computedPrice`/`computedSummary` |
| Client inflates slot count to get a cheaper/incorrect tier | Tampering | Server re-derives price by validated slot count (Pattern 9) on all three order paths |
| Stored letter text injection into summary/email | XSS | Existing sanitisation on order-render surfaces (`sanitize.ts`/allowlist) unchanged; letters are `[A-Z]` filtered by `allowedChars` |

## Sources

### Primary (HIGH confidence — live repo + actual artifacts, verified 2026-07-19)
- `src/lib/config-fields.ts` — FieldType union, `schemaByFieldType`, `ensureConfigJson`, `ensureConfigurationData`, `lookupTierPrice`, `ConfigurationData` shape
- `src/lib/db/schema.ts:276-296` — `productConfigFields` table + `fieldType` mysqlEnum
- `src/lib/keychain-fields.ts` — 4 locked-field seeding
- `src/lib/keychain-parts.ts` + `.test.ts` — legacy summary parser (must stay green)
- `src/actions/admin-production.ts:309-643` — keychain batch grouping (base/clicker/assembly, shape split)
- `src/components/store/configurable-product-view.tsx` — PDP price/summary/preview wiring
- `src/components/store/keychain-preview.tsx` — cube-row renderer
- `src/components/store/configurator-form.tsx:505-565` — fieldType render dispatch
- `src/components/admin/keychain-batches.tsx` — production console UI
- `src/actions/configurator.ts` — `pickSchemaByFieldType`, field CRUD, locked-field guards
- `src/actions/paypal.ts:313-417` — server-side config-line re-derive at capture
- `src/lib/option-weight.ts` — per-line weight resolution pattern
- `src/lib/validators.ts:156-195` — product/field enums, `keychainShape`
- 3mf archives `M batch3 keycaps p2s.3mf` + `...a1.3mf` — inspected via `unzip -l`, sharp metadata, and `model_settings.config` / `plate_1.json` extraction (34 `top_N.png` @ 512×512 RGBA each; per-part colour+extruder metadata)
- CLAUDE.md + `.planning/STATE.md` — MariaDB gotchas, dev-first rule, DB names, migration precedent

### Secondary (MEDIUM confidence)
- 25-CONTEXT.md `<specifics>` — 34-icon catalog + mesh geometry facts (icon labels self-reported, flagged for visual verification during extraction)

### Tertiary (LOW confidence)
- None. No web sources needed — this is an internal extension with no external API surface.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all tools verified present in package.json + shell
- Architecture (fieldType extension, migration, encoding, batching): HIGH — every seam verified against live code and the textarea precedent
- Icon pipeline: HIGH for extraction mechanics (archive inspected directly); MEDIUM for plate→label mapping (requires human visual verification)
- Pitfalls: HIGH — derived from actual code paths and the project's own documented gotchas

**Research date:** 2026-07-19
**Valid until:** 2026-08-18 (stable internal codebase; re-verify if the config-fields dispatch or keychain production code is refactored before planning)
