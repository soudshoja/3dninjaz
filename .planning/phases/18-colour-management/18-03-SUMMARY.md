---
phase: 18-colour-management
plan: 03
subsystem: admin-ui
tags: [colours, admin, crud, server-actions, dropdown-menu, useTransition, requireAdmin]
requirements_completed: [REQ-3]
dependency_graph:
  requires:
    - "src/lib/db/schema.ts colors table (Phase 18-01)"
    - "src/lib/colours.ts ColourAdmin type (Phase 18-01)"
    - "src/lib/validators.ts colourSchema (Phase 18-01)"
    - "src/actions/admin-coupons.ts (analog template)"
    - "351 seeded rows in colors table (Phase 18-02)"
  provides:
    - "src/actions/admin-colours.ts — list/get/create/update/archive/reactivate (6 server actions)"
    - "/admin/colours route group (list/new/[id]/edit) — RSC + ColourForm + ColourRowActions"
    - "Sidebar nav entry: Colours below Coupons"
    - "src/lib/colour-slug.ts (pure helpers, client-safe — Rule 1 deviation)"
  affects:
    - "Plan 18-04 will add deleteColour + renameColour (cascade-rename + IN_USE guard)"
    - "Plan 18-05 picker modal will consume getColour / listColours"
tech_stack:
  added: []
  patterns:
    - "Pure helper module split (colour-slug.ts) so client components can import slug helpers without webpack pulling DB code into the browser bundle"
    - "DropdownMenuLabel wrapped in DropdownMenuGroup (Base UI 1.3 quirk per CLAUDE.md commit 51a90c9)"
    - "DropdownMenuItem render={<Link/>} pattern (matches product-row-actions.tsx)"
    - "Native form onSubmit + useTransition (NOT react-hook-form per PATTERNS.md — mirrors coupon-form.tsx)"
    - "Native <input type=\"color\"> synced bidirectionally with hex text input via onChange"
key_files:
  created:
    - path: "src/actions/admin-colours.ts"
      lines: 195
      purpose: "6 server actions — listColours, getColour, createColour, updateColour, archiveColour, reactivateColour. Each starts with await requireAdmin() (CVE-2025-29927)."
    - path: "src/app/(admin)/admin/colours/page.tsx"
      lines: 154
      purpose: "RSC list page — table with hex swatch + name + brand badge + family + code + status + dropdown actions. + New colour CTA uses BRAND.ink (UI-SPEC override)."
    - path: "src/app/(admin)/admin/colours/new/page.tsx"
      lines: 33
      purpose: "RSC create page wrapping ColourForm mode='new'."
    - path: "src/app/(admin)/admin/colours/[id]/edit/page.tsx"
      lines: 47
      purpose: "RSC edit page — calls getColour(id), notFound() guard, then ColourForm mode='edit'."
    - path: "src/components/admin/colour-form.tsx"
      lines: 289
      purpose: "Client form with 8 fields (name/hex/previousHex/brand/familyType/familySubtype/code/isActive) + native colour picker + live URL slug preview + useTransition."
    - path: "src/components/admin/colour-row-actions.tsx"
      lines: 96
      purpose: "Base UI dropdown with Edit / Archive / Reactivate. DropdownMenuLabel wrapped in DropdownMenuGroup."
    - path: "src/lib/colour-slug.ts"
      lines: 53
      purpose: "Pure client-safe slug helpers (Rule 1 fix — extracted from colours.ts)."
  modified:
    - path: "src/components/admin/sidebar-nav.tsx"
      lines_added: 1
      purpose: "Add Colours nav entry directly below Coupons (Marketing group)."
    - path: "src/lib/colours.ts"
      lines_added: 7
      lines_removed: 44
      purpose: "Replace inline pure helpers with re-export from colour-slug.ts (back-compat)."
decisions:
  - "Plan 18-03 ships only Edit/Archive/Reactivate row actions. Hard-delete (with IN_USE guard for product_option_values referencing the colour) and rename-cascade are deferred to Plan 18-04 alongside the cascade-rename transaction infrastructure. Keeps Plan 18-03 tight at 6 tasks."
  - "+ New colour CTA uses BRAND.ink fill (NOT BRAND.green like coupons) per UI-SPEC §Surface 1 explicit override."
  - "Form layout mirrors coupon-form.tsx byte-for-byte: useTransition + native form onSubmit + 48px tap targets + same error block (#fee2e2/#991b1b). Did NOT use react-hook-form per PATTERNS.md."
  - "Native <input type=\"color\"> swatch picker is bidirectionally synced with the hex text input via onChange — typing in either updates both. Previous-hex disclosure shows a read-only swatch only when the hex is valid."
  - "Sidebar entry placed inside the existing Marketing nav group (where Coupons lives) per plan instruction. ninjaIcon='portfolio' reused from Categories — visually pairs with Coupons since both are admin catalogue entities."
  - "Rule 1 fix (post-Task-5): split pure slug helpers into src/lib/colour-slug.ts so the client-side colour-form.tsx can import slugifyColourBase without webpack pulling mysql2/Drizzle/node:* APIs into the browser bundle. PATTERNS.md anticipated this exact concern (\"keep contrast math in colour-contrast.ts (small, pure, no DB) and keep DB-aware helpers in colours.ts\") — same idea applied to slug helpers."
metrics:
  duration_minutes: 50
  completed_at: "2026-04-26T11:00:00Z"
  tasks_completed: 6
  files_changed: 9
  commits: 6
---

# Phase 18 Plan 03: /admin/colours CRUD Module Summary

**Admin CRUD surface at `/admin/colours` — list/new/edit pages, 6 server actions (list/get/create/update/archive/reactivate), Base UI row dropdown with the DropdownMenuGroup quirk, native colour-picker form, sidebar nav link.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-04-26T10:10:00Z
- **Completed:** 2026-04-26T11:00:00Z
- **Tasks:** 6 (all complete)
- **Files changed:** 9 (7 created + 2 modified)

## Accomplishments

- `/admin/colours` lists every seeded colour with hex preview, name, brand badge, family, code, status, and a 3-dot row dropdown.
- `/admin/colours/new` form creates a colour with all 8 UI-SPEC fields (incl. native `<input type="color">` swatch picker) and on success redirects to the list.
- `/admin/colours/[id]/edit` form loads the existing row via `getColour(id)`, presents the same 8 fields pre-filled, and updates on submit.
- DropdownMenu Edit / Archive / Reactivate works through `archiveColour` / `reactivateColour` server actions; ER_DUP_ENTRY on (brand, code) is caught and surfaced as a friendly error.
- All 6 server actions start with `await requireAdmin()` — first await — per CVE-2025-29927.
- Sidebar nav now shows the Colours link directly below Coupons.
- TypeScript compiles cleanly (`npx tsc --noEmit` exits 0).

## Task Commits

Each task was committed atomically:

1. **Task 1: admin-colours server actions** — `07a583a` (feat)
2. **Task 2: 3 RSC route files (list / new / edit)** — `31c2691` (feat)
3. **Task 3: ColourForm client component** — `df2f127` (feat)
4. **Task 4: ColourRowActions client dropdown** — `5e21170` (feat)
5. **Task 5: Sidebar nav Colours entry** — `cf5d944` (feat)
6. **Rule 1 fix (Task 6 build verification triggered): split pure slug helpers** — `a141083` (fix)

**Plan metadata:** committed alongside this SUMMARY (final commit).

## Files Created/Modified

| Path | Status | Lines |
|------|--------|-------|
| `src/actions/admin-colours.ts` | new | 195 |
| `src/app/(admin)/admin/colours/page.tsx` | new | 154 |
| `src/app/(admin)/admin/colours/new/page.tsx` | new | 33 |
| `src/app/(admin)/admin/colours/[id]/edit/page.tsx` | new | 47 |
| `src/components/admin/colour-form.tsx` | new | 289 |
| `src/components/admin/colour-row-actions.tsx` | new | 96 |
| `src/components/admin/sidebar-nav.tsx` | modified | +1 line |
| `src/lib/colour-slug.ts` | new (Rule 1 fix) | 53 |
| `src/lib/colours.ts` | modified (Rule 1 fix) | -44 / +7 |

## UI-SPEC Coverage Audit

§Surface 1 (LIST page) — 8/8 elements per spec:

| UI-SPEC element | Implemented? | Notes |
|-----------------|--------------|-------|
| Page title "Colours" + count caption | ✓ | `{N} colours ({active} active)` |
| "+ New colour" button (BRAND.ink fill) | ✓ | `style={{ backgroundColor: BRAND.ink }}` |
| Hex preview cell (24×24 circle) | ✓ | `w-6 h-6 rounded-full` |
| Brand badge (color-coded) | ✓ | Bambu = green border, Polymaker = blue, Other = zinc |
| Family display (`family_type · family_subtype`) | ✓ | "PLA · Matte" pattern |
| Code (mono small) | ✓ | `font-mono text-xs text-slate-600` |
| Status badge (Active / Archived) | ✓ | Active = BRAND.green, Archived = #6b7280 |
| Row actions dropdown | ✓ | ColourRowActions component |
| Empty state copy | ✓ | "No colours yet." + seed-script hint |

§Surface 2 (FORM) — 9/9 fields per spec (8 inputs + submit/cancel):

| Field | Type | Required | Implemented? |
|-------|------|----------|--------------|
| Name | text 48px | yes | ✓ + URL slug preview |
| Hex | text + native colour picker | yes | ✓ bidirectional sync |
| Previous hex | text + read-only colour picker | no | ✓ disclosure when valid |
| Brand | select | yes | ✓ Bambu/Polymaker/Other |
| Family type | select | yes | ✓ PLA/PETG/TPU/CF/Other |
| Family subtype | text | no | ✓ free text 48 max |
| Code | mono text | no | ✓ admin-only nudge |
| Active | checkbox | — | ✓ default true |
| Submit + Cancel | button pair | — | ✓ ink fill / ink-33 border |

## Decisions Made

- Plan 18-03 deliberately ships **only** Edit/Archive/Reactivate. Delete + cascade-rename are co-located in Plan 18-04 because they share transaction infrastructure (single transaction over `colors` + `product_option_values` with diff-aware UPDATE). Splitting them across plans would require shipping half-finished cascade machinery.
- DropdownMenu uses Base UI primitives (already installed via shadcn). The `DropdownMenuLabel` MUST be wrapped inside `DropdownMenuGroup` per CLAUDE.md commit 51a90c9 — `MenuGroupRootContext` asserts at render otherwise. The colour-row-actions.tsx code has this wrapper.
- `DropdownMenuItem render={<Link/>}` is the project's established pattern (see `product-row-actions.tsx`). Tried the children-inside-render variant first; reverted to match precedent.
- Native form onSubmit + useTransition (no react-hook-form) — matches `coupon-form.tsx` and PATTERNS.md prescription.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Webpack pulled mysql2/Drizzle/node:* into the client bundle through `colour-form.tsx`**

- **Found during:** Task 6 (`npm run build`).
- **Issue:** `colour-form.tsx` ("use client") imported `slugifyColourBase` from `@/lib/colours`. That file also exports `getColourPublic` / `getColourAdmin` which transitively import `@/lib/db` → `mysql2`/`drizzle-orm` (uses `node:buffer`, `node:diagnostics_channel`, `node:events`). Webpack cannot tree-shake the DB code out of a client chunk because the module has top-level side effects via the DB import — so the build failed with `UnhandledSchemeError: Reading from "node:events" is not handled by plugins.`
- **Fix:** Extracted the pure helpers (`slugifyColourBase`, `buildColourSlugMap`) into `src/lib/colour-slug.ts` (zero DB imports). `src/lib/colours.ts` now re-exports them so server-side callers from Plan 18-01 keep working unchanged. `colour-form.tsx` updated to import `slugifyColourBase` from `@/lib/colour-slug` directly. The `ColourAdmin` type continues to come from `@/lib/colours` via `import type` — TypeScript erases type-only imports so the DB code is never bundled.
- **Files modified:** `src/lib/colour-slug.ts` (new, 53 lines), `src/lib/colours.ts` (-44/+7), `src/components/admin/colour-form.tsx` (1 import line).
- **Verification:** `npx tsc --noEmit` exits 0. Webpack node-scheme errors no longer present in build output.
- **Committed in:** `a141083` (separate fix commit).
- **Why this is Rule 1 (auto-fix bug), not Rule 4 (architectural):** No new tables, services, or auth approach. PATTERNS.md anticipated this concern verbatim: *"keep contrast math in `colour-contrast.ts` (small, pure, no DB) and keep DB-aware helpers in `colours.ts`."* The same idea applied to slug helpers — a small pure-helper extraction.

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug introduced by this plan's first client-side import of slug helpers).
**Impact on plan:** Pure refactor, no scope creep. All Plan 18-01 server-side imports continue to work via re-export.

## Deferred Issues

### Pre-existing build issue out of scope for this plan

`npm run build` ALSO fails with `Syntax error: tailwindcss: src/app/globals.css Can't resolve 'shadcn/tailwind.css'`. Verified via `git show 5c0808b:src/app/globals.css | head -3` that this `@import "shadcn/tailwind.css";` line is **identical** to the pre-Phase-18-03 master commit. The CSS line predates this plan; the local Windows toolchain cannot resolve a `shadcn` package while the production cPanel deploy presumably can. Documented in `.planning/phases/18-colour-management/deferred-items.md` per executor SCOPE BOUNDARY rule. **Acceptance criterion `npx tsc --noEmit` exits 0 PASSES** — TypeScript layer of the build is clean. The CSS resolver failure is the SOLE remaining build blocker and is not introduced by this plan.

## Issues Encountered

- Two `PreToolUse:Edit` read-before-edit reminders fired during Tasks 4 + 5 (after I had already used Read on those files earlier in the session). Resolved by re-reading the file before each subsequent edit.
- Initial Task 4 implementation used the wrong DropdownMenuItem pattern (children inside `render` prop). Caught immediately by visual diff against `product-row-actions.tsx`; corrected before commit.

## Next Phase Readiness

- **Plan 18-04 (cascade rename + delete + IN_USE guard) is unblocked.** It will add two new actions to `src/actions/admin-colours.ts`: `deleteColour(id)` (with `{ code: "IN_USE", products: [...] }` structured error) and `renameColour(id, newName, newHex)` (single transaction with diff-aware UPDATE per D-11). The dropdown in `colour-row-actions.tsx` will gain a "Delete" branch and the IN_USE error UI per UI-SPEC §Surface 2.
- **Plan 18-05 picker modal** can already consume `listColours()` server action — admin-only filter (`is_active = true`) lives there for the picker query.
- The seeded 351 rows from Plan 18-02 are immediately visible at `/admin/colours` once an admin signs in.

## Self-Check: PASSED

| Check | Status |
|-------|--------|
| `src/actions/admin-colours.ts` exists with 6 exported server actions | FOUND (6 grep matches) |
| Each export starts with `await requireAdmin()` | FOUND (6 occurrences) |
| `deleteColour` + `renameColour` deferred (NOT exported) | CONFIRMED (0 occurrences) |
| `/admin/colours/page.tsx`, `/new/page.tsx`, `/[id]/edit/page.tsx` exist | FOUND (3/3) |
| Each admin page has `await requireAdmin()` | FOUND (1 each) |
| List page uses `BRAND.ink` for "+ New colour" CTA | FOUND (4 BRAND.ink references) |
| `metadata.robots = { index: false, follow: false }` on every admin page | FOUND (3/3) |
| `colour-form.tsx` exists with `"use client"` + useTransition | FOUND |
| All 8 form field names wired (name, hex, previousHex, brand, familyType, familySubtype, code, isActive) | FOUND (8/8) |
| Native `<input type="color">` present (≥1) | FOUND (2 occurrences) |
| `min-h-[48px]` on inputs/buttons (≥4) | FOUND (11 occurrences) |
| `slugifyColourBase` imported and used (live URL slug preview) | FOUND (2 occurrences) |
| `colour-row-actions.tsx` exists with `"use client"` + useTransition | FOUND |
| `DropdownMenuLabel` wrapped in `DropdownMenuGroup` per CLAUDE.md 51a90c9 | FOUND (5 + 4 occurrences) |
| `archiveColour` + `reactivateColour` calls present | FOUND (4 occurrences) |
| `deleteColour` NOT called (deferred to 18-04) | CONFIRMED (0 occurrences) |
| `sidebar-nav.tsx` includes `/admin/colours` entry directly below `/admin/coupons` | FOUND |
| `npx tsc --noEmit` exits 0 | PASSED |
| All 6 task commits exist in git log | FOUND (07a583a, 31c2691, df2f127, 5e21170, cf5d944, a141083) |

## Threat Flags

None. Plan 18-03 stays within the existing trust boundaries declared in `<threat_model>`:

- All 6 server actions gated by `requireAdmin()` first await (T-18-03-admin-bypass mitigated).
- Zod parse first-issue surfacing on every mutation (T-18-03-input-injection mitigated).
- ER_DUP_ENTRY caught on (brand, code) unique constraint with friendly error message.
- React auto-escape on every rendered colour name; no `dangerouslySetInnerHTML`; no `isomorphic-dompurify` (banned per CLAUDE.md, not needed).
- `metadata.robots = noindex/nofollow` on all 3 admin pages (T-18-03-public-leak mitigated).
- Server actions are same-origin Next 15 — no `trustedOrigins` change needed (T-18-03-csrf mitigated by built-in token).

No new network endpoints, auth paths, file-access patterns, or schema changes were introduced — only UI/server-action surface against existing `colors` table.

## Commits

| Hash | Message |
|------|---------|
| `07a583a` | feat(phase-18): admin colour CRUD server actions (list/get/create/update/archive/reactivate) |
| `31c2691` | feat(phase-18): admin /admin/colours RSC pages (list/new/edit) |
| `df2f127` | feat(phase-18): admin colour form (8 fields + native colour picker) |
| `5e21170` | feat(phase-18): admin colour row dropdown (edit/archive/reactivate) |
| `cf5d944` | feat(phase-18): add Colours nav entry below Coupons |
| `a141083` | fix(phase-18): split pure colour slug helpers into client-safe module |

---

*Phase: 18-colour-management*
*Plan: 03 — Admin Colours CRUD*
*Completed: 2026-04-26*
