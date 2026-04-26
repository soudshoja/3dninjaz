---
phase: 18-colour-management
plan_scope: [18-03, 18-04]
wave: 2
verified: 2026-04-26T12:00:00Z
status: human_needed
score: 14/14 must-haves verified
requirements_verified: [REQ-3, REQ-4]
note: "Wave 2 only — Wave 3 (picker) and Wave 4 (storefront/shop filter) are downstream and NOT verified here."
human_verification:
  - test: "Cascade rename fires correctly on a product that has pov rows with color_id set"
    expected: "After renaming a library colour's name, the linked product_option_values.value columns update; a manually-renamed pov row is NOT clobbered"
    why_human: "No products with color_id currently set (picker lands in Wave 3/Plan 18-05) — cascade path cannot be exercised by grep alone"
  - test: "Hard-delete an unused seeded colour"
    expected: "Row removed from DB; list refreshes; no DB error"
    why_human: "Requires live DB state; can't be verified from source code"
  - test: "Hard-delete an in-use colour (requires manual pov row with color_id set)"
    expected: "Modal shows IN_USE error mode with product list; Archive instead closes modal and badges the row Archived"
    why_human: "Requires live DB state with a colour attached to a product (only possible after Wave 3 picker or manual SQL insert)"
  - test: "1000-row guardrail on renameColour"
    expected: "If a library colour has >1000 linked pov rows where value still matches, the action returns the guardrail error before starting the transaction"
    why_human: "Requires production-scale seed data exceeding 1000 rows on a single colour — not present on dev"
  - test: "Edit page stale copy"
    expected: "The paragraph 'Cascade rename across linked product variants ships in Plan 18-04' on the edit page is stale and should be removed now that 18-04 is complete"
    why_human: "Cosmetic copy issue — harmless but worth cleaning up; found during code inspection"
---

# Phase 18 Wave 2 Verification Report

**Plans verified:** 18-03 + 18-04
**Wave:** 2 — Admin Colour CRUD (REQ-3) + In-use deletion guard + cascade rename (REQ-4)
**Verified:** 2026-04-26
**Status:** HUMAN_NEEDED (all automated checks passed; human tests required for live DB flows)
**Downstream note:** Wave 3 (picker modal — Plan 18-05) and Wave 4 (PDP swatch grid + /shop filter — Plans 18-06/07) are NOT in scope here and are not verified.

---

## Goal Achievement

This is an intermediate wave check, not a full phase verification. The wave goal is: admin can manage the colour library (CRUD, soft-archive, hard-delete with guard, cascade rename).

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `/admin/colours` lists every colour with hex swatch, name, brand badge, family, code, status, row actions | VERIFIED | `page.tsx` renders table with all 7 columns; hex 24px circle, brand badge color-coded, family combines familyType + familySubtype, code font-mono, status badge Active/Archived |
| 2 | `/admin/colours/new` route exists and renders ColourForm mode='new' | VERIFIED | `src/app/(admin)/admin/colours/new/page.tsx` exists; mounts `<ColourForm mode="new" />` |
| 3 | `/admin/colours/[id]/edit` route exists and renders ColourForm mode='edit' | VERIFIED | `src/app/(admin)/admin/colours/[id]/edit/page.tsx` exists; calls `getColour(id)`, `notFound()` guard, mounts `<ColourForm mode="edit" initial={colour} />` |
| 4 | ColourForm has all 8 required fields including native colour picker bidirectionally synced | VERIFIED | All 8 field names present: `name`, `hex`, `previousHex`, `brand`, `familyType`, `familySubtype`, `code`, `isActive`; two `<input type="color">` elements (primary synced, previous hex read-only preview) |
| 5 | DropdownMenuLabel is wrapped in DropdownMenuGroup per CLAUDE.md Base UI 1.3 quirk | VERIFIED | `colour-row-actions.tsx` line 125-127: `<DropdownMenuGroup><DropdownMenuLabel>{row.name}</DropdownMenuLabel></DropdownMenuGroup>` |
| 6 | Sidebar has "Colours" entry directly below "Coupons" | VERIFIED | `sidebar-nav.tsx` lines 75-76: Coupons line 75, Colours line 76, same array |
| 7 | Every admin server action starts with `await requireAdmin()` as the first await | VERIFIED | 9 occurrences in `admin-colours.ts`; all 9 exported functions (listColours, getColour, createColour, updateColour, archiveColour, reactivateColour, getProductsUsingColour, deleteColour, renameColour); all 3 RSC pages have 1 each |
| 8 | `deleteColour(id)` returns `{ok:false, code:"IN_USE", products:[...]}` when colour is in use | VERIFIED | Lines 284-291 of `admin-colours.ts`; structured error with `code: "IN_USE"` returned when `using.length > 0`; race condition also returns IN_USE at line 302-311 |
| 9 | `getProductsUsingColour` uses manual multi-query hydration — no LATERAL | VERIFIED | Lines 230-268: 3 sequential queries (pov → option → product) using `inArray`; zero occurrences of `findMany.*with:` in file |
| 10 | `colour-row-actions.tsx` has Delete item in dropdown with IN_USE error modal and Archive-instead CTA | VERIFIED | Trash2 icon + "Delete…" item present; `showDeleteConfirm` state gate; IN_USE modal with `#FEE2E2` product list panel, `ExternalLink` lucide icon, "Archive instead" button wired to `archiveColour` |
| 11 | `renameColour` exists and uses `db.transaction` | VERIFIED | Lines 336-453; wraps 3-step sequence in `await db.transaction(async (tx) => {...})` |
| 12 | CASCADE scope: transaction updates both `value` AND `swatch_hex` on product_option_values (D-10) | VERIFIED | Lines 386-393: `tx.update(productOptionValues).set({ value: newName, swatchHex: newHex })` |
| 13 | Diff-aware WHERE clause: `color_id = :id AND value = :pre.name` (D-11) | VERIFIED | Pre-count at lines 361-373; UPDATE WHERE at lines 387-393; both use `and(eq(productOptionValues.colorId, id), eq(productOptionValues.value, pre.name))` |
| 14 | 1000-row guard present before transaction starts (D-12) | VERIFIED | `const linkedCount = Number(countRow?.c ?? 0); if (linkedCount > 1000) return {ok:false, error:...}` at lines 367-374 |

**Score:** 14/14 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/actions/admin-colours.ts` | 9 server actions with requireAdmin | VERIFIED | 454 lines; 9 exports; all start with `await requireAdmin()` |
| `src/app/(admin)/admin/colours/page.tsx` | RSC list page | VERIFIED | 154 lines; `await requireAdmin()` + `await listColours()` |
| `src/app/(admin)/admin/colours/new/page.tsx` | RSC new page | VERIFIED | 41 lines; `await requireAdmin()` |
| `src/app/(admin)/admin/colours/[id]/edit/page.tsx` | RSC edit page with notFound guard | VERIFIED | 47 lines; `await requireAdmin()` + `notFound()` guard |
| `src/components/admin/colour-form.tsx` | 8-field client form with cascade routing | VERIFIED | 323 lines; all 8 fields; `renameColour` called first on edit when name/hex change |
| `src/components/admin/colour-row-actions.tsx` | Dropdown with Delete + IN_USE modal | VERIFIED | 284 lines; complete Delete flow with two-state modal |
| `src/components/admin/sidebar-nav.tsx` (modified) | Colours entry below Coupons | VERIFIED | Line 76, immediately after line 75 Coupons |
| `src/lib/colour-slug.ts` | Pure client-safe slug helpers | VERIFIED | 53 lines; zero DB imports; rule-1 fix from Plan 18-03 |
| `src/lib/colours.ts` (modified) | Re-exports slug helpers; ColourPublic + ColourAdmin types | VERIFIED | Correct public/admin split; DB helpers present |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `colour-form.tsx` | `admin-colours.ts createColour/updateColour/renameColour` | import + startTransition call | WIRED | All 3 actions imported and called in correct conditional sequence |
| `page.tsx` (list) | `admin-colours.ts listColours` | `await listColours()` RSC call | WIRED | Line 16 of page.tsx |
| `colour-row-actions.tsx` | `admin-colours.ts archiveColour/reactivateColour/deleteColour` | import + startTransition | WIRED | All 3 actions imported and wired to handler functions |
| `sidebar-nav.tsx` | `/admin/colours` route | `<Link href>` via nav array entry | WIRED | Line 76 confirms href |
| `deleteColour` | `product_option_values` via `getProductsUsingColour` | 3-query manual hydration | WIRED | pov → options → products chain present |
| `renameColour` | `product_option_values + product_variants.labelCache` | `db.transaction` with diff-aware UPDATE + 6-slot labelCache null | WIRED | Complete cascade sequence inside transaction at lines 377-431 |

---

## Data-Flow Trace (Level 4)

Wave 2 does not add any components that render dynamic data to customers. The admin pages render RSC data (colour library rows) fetched server-side. No client-side data disconnection risk on these server components.

The `renameColour` cascade UPDATE writes to `product_option_values.value` and `swatch_hex`, and nulls `labelCache` on `product_variants` — this is the correct data flow to keep the denormalized snapshot in sync per D-09/D-10. The diff-aware WHERE clause (`value = pre.name`) is the key safety gate per D-11.

---

## Reactivity Contract (Phase 17 AD-06)

All mutations in Wave 2 happen on `/admin/colours` (server-rendered RSC list page), NOT inside `variant-editor.tsx`. Phase 17 Pattern A/B do not apply directly.

Revalidation coverage per action:

| Action | revalidatePath calls | /shop covered | /admin/colours covered |
|--------|---------------------|---------------|------------------------|
| createColour | /admin/colours, /shop | YES | YES |
| updateColour | /admin/colours, /admin/colours/[id]/edit, /shop | YES | YES |
| archiveColour | /admin/colours, /shop | YES | YES |
| reactivateColour | /admin/colours, /shop | YES | YES |
| deleteColour | /admin/colours, /shop | YES | YES |
| renameColour | /admin/colours, /admin/colours/[id]/edit, /shop, / | YES | YES |

All mutations revalidate `/shop` (so colour chips update when a colour is renamed/archived). `renameColour` additionally revalidates `/` (product listing surfaces).

---

## Requirements Coverage

| Requirement | Plans | Status | Evidence |
|-------------|-------|--------|----------|
| REQ-3: Admin colour CRUD at /admin/colours | 18-03 | SATISFIED | List/new/edit routes exist; all CRUD actions gated by requireAdmin |
| REQ-4: In-use deletion guard + soft-archive + diff-aware cascade rename | 18-04 | SATISFIED (code) / HUMAN for live flows | deleteColour returns IN_USE structured error; archiveColour always succeeds; renameColour uses diff-aware transaction per D-11; live DB verification is human-needed |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/app/(admin)/admin/colours/[id]/edit/page.tsx` | 42-44 | Stale comment: "Cascade rename across linked product variants ships in Plan 18-04" | INFO | Plan 18-04 is now complete; copy is stale but harmless — admin-only page, no customer impact |

No stubs, no hardcoded empty data, no TODO/FIXME markers in production code paths. No `return null` / `return []` placeholders. No `console.log`-only handlers. `findMany.*with:` zero occurrences in `admin-colours.ts` (LATERAL-safe).

---

## Behavioral Spot-Checks

Wave 2 spot-checks are limited to TypeScript compilation and import structure (live DB not available in this context).

| Behavior | Check | Result |
|----------|-------|--------|
| TypeScript compiles (18-03 self-check) | `npx tsc --noEmit` exits 0 per 18-03-SUMMARY | PASS (executor confirmed) |
| TypeScript compiles (18-04 self-check) | `npx tsc --noEmit` exits 0 per 18-04-SUMMARY | PASS (executor confirmed) |
| All 9 requireAdmin() calls present | grep count = 9 | PASS |
| No LATERAL-producing findMany({ with: }) in admin-colours.ts | grep count = 0 | PASS |
| `db.transaction` present in renameColour | grep confirmed | PASS |
| Diff-aware WHERE present in count + UPDATE | 2 occurrences confirmed | PASS |
| 1000-row guard present | `linkedCount > 1000` confirmed | PASS |
| labelCache: null across 6 option slots | 6 occurrences confirmed | PASS |
| `npm run build` | SKIPPED — pre-existing `globals.css:3 shadcn/tailwind.css` issue documented in `.planning/phases/18-colour-management/deferred-items.md`; predates Phase 18 | SKIP (documented) |

---

## Human Verification Required

### 1. Cascade rename — live DB exercise

**Test:** On a dev/staging DB, manually insert a `product_option_values` row with `color_id` pointing to a seeded colour. Then navigate to `/admin/colours`, edit that colour's name, and save.
**Expected:** The linked `pov.value` and `pov.swatch_hex` columns update to the new name/hex. A second pov row manually renamed (value differs from library name) is NOT changed.
**Why human:** No products have `color_id` set yet (picker lands in Wave 3/Plan 18-05). The diff-aware WHERE logic cannot be exercised from source alone.

### 2. Hard-delete unused colour

**Test:** Login as admin → `/admin/colours` → find any seeded colour with no `product_option_values` referencing it → click 3-dot → Delete… → confirm.
**Expected:** Row disappears from list; DB row removed; no error.
**Why human:** Requires live DB state.

### 3. Hard-delete in-use colour

**Test:** Pre-condition: ensure a `product_option_values` row references a library colour (`color_id` set). Attempt to delete that colour.
**Expected:** Modal swaps to IN_USE error mode with product name + Open link + "Archive instead" CTA. Clicking Archive instead soft-archives the colour and refreshes the list.
**Why human:** Requires live DB state with a colour attached to a product (only possible post-Wave-3 picker or manual SQL).

### 4. 1000-row guardrail

**Test:** Simulate or artificially create a scenario where a single library colour has >1000 `product_option_values` rows where `value` still matches the library name. Trigger a rename.
**Expected:** Action returns the guardrail error message before any transaction starts. No DB rows modified.
**Why human:** Requires production-scale seed data exceeding 1000 matched rows on a single colour.

### 5. Stale copy cleanup (cosmetic)

**Test:** Review `src/app/(admin)/admin/colours/[id]/edit/page.tsx` lines 42-44.
**Expected:** The paragraph "Cascade rename across linked product variants ships in Plan 18-04" should be removed or updated since 18-04 is now complete.
**Why human:** Cosmetic fix — harmless, no functional impact, but the copy will confuse anyone reading the admin UI.

---

## Gaps Summary

No functional gaps found. All 14 Wave 2 must-haves are verified in code. The 5 human verification items are observational/live-DB flows that are structurally correct in the implementation but cannot be exercised without a running DB or post-Wave-3 picker data. The stale copy on the edit page is cosmetic.

Wave 2 is complete and Wave 3 (Plan 18-05 picker modal) is unblocked.

---

_Verified: 2026-04-26_
_Scope: Wave 2 only (Plans 18-03 + 18-04). Wave 3 + Wave 4 are downstream and not verified here._
_Verifier: Claude (gsd-verifier)_
