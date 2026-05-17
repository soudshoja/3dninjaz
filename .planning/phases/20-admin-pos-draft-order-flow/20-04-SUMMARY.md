---
phase: 20-admin-pos-draft-order-flow
plan: "04"
subsystem: admin-settings
tags: [store-settings, bank-details, draft-link, server-actions, cache]
dependency_graph:
  requires: [20-01, 20-02]
  provides: [store-settings-bank-reader, admin-bank-writer, admin-template-writer]
  affects: [20-08, 20-12]
tech_stack:
  added: []
  patterns:
    - invalidateStoreSettingsCache alias for writer side-effects
    - CVE-2025-29927 first-await requireAdmin in every admin server action
    - Normalise empty-string to null before DB write (D-16 guard)
key_files:
  created:
    - src/actions/admin-store-settings-bank.ts
  modified:
    - src/lib/store-settings.ts
decisions:
  - "invalidateStoreSettingsCache exported as alias for clearStoreSettingsCache — avoids callers importing a 'clear' function for mutation side-effects"
  - "saveDraftLinkTemplate also calls clearStoreSettingsCache (no functional difference from invalidateStoreSettingsCache; both nil the pointer)"
  - "getStoreSettingsCached() called before UPDATE to ensure the singleton row exists (lazy-seed before update pattern from existing settings action)"
metrics:
  duration_minutes: 8
  completed_date: "2026-05-17"
  tasks_completed: 3
  files_changed: 2
---

# Phase 20 Plan 04: Extend Store-Settings Reader + Admin Bank/Template Writer Summary

Extended `src/lib/store-settings.ts` with documented fields for the 4 new Phase 20 nullable columns and added `src/actions/admin-store-settings-bank.ts` with two CVE-2025-29927-hardened admin server actions.

## What Was Built

### Task 1 — Extend src/lib/store-settings.ts reader + types

The `StoreSettings` type is inferred from `typeof storeSettings.$inferSelect`. Since Plan 20-01 already added the 4 new columns to the Drizzle schema (`bankName`, `bankAccountNumber`, `bankAccountHolder`, `draftLinkTemplate`), the type automatically included them. Task 1 added:

- Explicit JSDoc block on `StoreSettings` naming all 4 new fields with their D-16/D-18 semantics — makes them visible in IDE hover and satisfies grep acceptance criteria
- `invalidateStoreSettingsCache` exported as an alias for `clearStoreSettingsCache` — allows the new writer module to import a semantically accurate name without touching the original name used by `admin-settings.ts`
- Existing 60s TTL + lazy-seed behaviour preserved verbatim

### Task 2 — Author src/actions/admin-store-settings-bank.ts

New file with two exported admin server actions:

**`saveStoreBankDetails(input)`**
- First await: `requireAdmin()` (CVE-2025-29927)
- Normalises empty strings to null (D-16 guard)
- Updates `store_settings` singleton row (`id='default'`) via Drizzle
- On success: calls `invalidateStoreSettingsCache()` + `revalidatePath('/admin/settings')` + `revalidatePath('/payment-links/[token]', 'page')`
- On Drizzle error: returns `{ok: false, error: 'Could not save bank details.'}`

**`saveDraftLinkTemplate(input)`**
- First await: `requireAdmin()` (CVE-2025-29927)
- Normalises empty string to null
- Updates `store_settings.draft_link_template` column
- Same cache invalidation + revalidatePath contract as above

### Task 3 — Commit

Atomic commit `f2446a2` on `dev` branch, exactly the 2 plan files.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

```
grep -nE "bankName|bankAccountNumber|bankAccountHolder|draftLinkTemplate" src/lib/store-settings.ts
→ 4 lines (10, 11, 12, 13)

grep -nE "invalidateStoreSettingsCache|clearStoreSettingsCache" src/lib/store-settings.ts
→ 3 lines (80, 85, 89)

grep -n '"use server"' src/actions/admin-store-settings-bank.ts
→ 1:  "use server";

grep -c "await requireAdmin" src/actions/admin-store-settings-bank.ts
→ 2

grep -n "export async function saveStoreBankDetails" src/actions/admin-store-settings-bank.ts
→ 53: export async function saveStoreBankDetails(

grep -n "export async function saveDraftLinkTemplate" src/actions/admin-store-settings-bank.ts
→ 98: export async function saveDraftLinkTemplate(

npx tsc --noEmit → exits 0
```

## Self-Check: PASSED

- `src/lib/store-settings.ts` — exists, modified
- `src/actions/admin-store-settings-bank.ts` — exists, created
- Commit `f2446a2` — verified in git log
- TypeScript clean — confirmed
