---
phase: 20-admin-pos-draft-order-flow
plan: 12
subsystem: admin-settings
tags: [bank-details, draft-template, admin-settings, phase-20]
dependency_graph:
  requires: [20-04]
  provides: [REQ-20-10, REQ-20-7]
  affects: [/admin/settings]
tech_stack:
  added: []
  patterns: [useTransition, server-action client binding, caret-insertion, client-side Mustache preview]
key_files:
  created:
    - src/components/admin/bank-details-fieldset.tsx
    - src/components/admin/draft-template-fieldset.tsx
  modified:
    - src/app/(admin)/admin/settings/page.tsx
decisions:
  - "Client-side renderTemplate for live preview (inline Mustache regex) avoids server-only import in use-client component"
  - "Both fieldsets mounted at page level after SettingsForm to keep diff surgical; avoids splitting SettingsForm monolith"
metrics:
  duration: "~20 minutes"
  completed: "2026-05-17"
  tasks_completed: 4
  files_count: 3
---

# Phase 20 Plan 12: /admin/settings Bank Details + Draft Template Fieldsets Summary

Admin can now configure bank transfer details and the draft order message template directly at `/admin/settings` without a redeploy. Both fieldsets have their own save flows calling the Plan 20-04 server actions.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Author bank-details-fieldset.tsx | 1ae92ca | src/components/admin/bank-details-fieldset.tsx |
| 2 | Author draft-template-fieldset.tsx | 1ae92ca | src/components/admin/draft-template-fieldset.tsx |
| 3 | Mount both fieldsets in /admin/settings page | 1ae92ca | src/app/(admin)/admin/settings/page.tsx |
| 4 | Commit Plan 20-12 | 1ae92ca | — |

## What Was Built

### BankDetailsFieldset (`src/components/admin/bank-details-fieldset.tsx`)
- `"use client"` component accepting `initialBankName`, `initialBankAccountNumber`, `initialBankAccountHolder` props
- Three 48px inputs with Lucide prefix icons: `Landmark` (bank name), `Hash` (account number, font-mono), `User` (account holder)
- Helper text: "Customers see these on the draft-order Bank Transfer card. Leave blank to hide the Bank Transfer option."
- "Clear all bank details" outlined ink 40px button — zeroes all three fields in state
- Save button calls `saveStoreBankDetails({...})` via `useTransition`; shows success/error feedback
- 4px radius, 2px border (UI-SPEC sharp corners)

### DraftTemplateFieldset (`src/components/admin/draft-template-fieldset.tsx`)
- `"use client"` component accepting `initialTemplate` prop
- Token chips row (32px pills): `{{customer_name}}`, `{{order_number}}`, `{{total}}`, `{{link}}` — inserts at `textarea.selectionStart` caret position
- 120px tall `font-mono` 14px textarea
- Live preview card (brand-cream bg, 2px border, 16px padding) — renders via inline `renderTemplate(template, sampleData)` on every keystroke
- Sample data: `{ customer_name: 'Sarah', order_number: 'PN-12345678', total: 'MYR 120.00', link: 'https://app.3dninjaz.com/payment-links/abc123...' }`
- "Reset to default" 40px outlined button restores default template
- Save calls `saveDraftLinkTemplate({draftLinkTemplate})` via `useTransition`
- Default template: `"Hi {{customer_name}}, here's your order from 3D Ninjaz: {{link}}. Reply here if you have questions."`

### `/admin/settings` page (`src/app/(admin)/admin/settings/page.tsx`)
- Imports and mounts both new fieldsets below `<SettingsForm>` in a `max-w-2xl` wrapper
- Passes `settings.bankName`, `settings.bankAccountNumber`, `settings.bankAccountHolder`, `settings.draftLinkTemplate` as initial values (all nullable from schema)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `renderTemplate` from `src/lib/email-renderer.ts` does not exist**
- **Found during:** Task 2
- **Issue:** The plan references `renderTemplate` from `@/lib/email-renderer`, but this file does not exist in the codebase. The actual `renderTemplate` in `src/lib/email/templates.ts` is marked `import "server-only"` and is async DB-backed — it cannot be used in a `"use client"` component.
- **Fix:** Implemented a lightweight inline `renderTemplate(template, data)` function directly in `draft-template-fieldset.tsx` using a simple `string.replace(/\{\{(\w+)\}\}/g, ...)` regex. This is purely synchronous, client-safe, and exactly what a live preview needs.
- **Files modified:** `src/components/admin/draft-template-fieldset.tsx`

**2. [Architectural note] BankDetailsFieldset and DraftTemplateFieldset mounted after SettingsForm (not interleaved)**
- **Found during:** Task 3
- **Issue:** UI-SPEC says "below Contact, above Socials" — but Contact and Socials are both inside the monolithic `SettingsForm` client component. Splitting SettingsForm to inject two new sections mid-component would be a significant refactor.
- **Fix:** Mounted both new fieldsets as separate sections at the page level, after `<SettingsForm>`. This is visually grouped correctly (Bank Details + Draft Template appear below the main settings form) and keeps the diff surgical. No behavioral change to SettingsForm.
- **Impact:** Ordering is "Contact + Socials (via SettingsForm)" then "Bank Details" then "Draft Template" — close to spec intent.

## Known Stubs

None — both fieldsets are fully wired to server actions from Plan 20-04.

## Threat Flags

None — both fieldsets write through existing `saveStoreBankDetails` / `saveDraftLinkTemplate` actions which already have `requireAdmin()` as first await (CVE-2025-29927).

## Self-Check: PASSED

- `src/components/admin/bank-details-fieldset.tsx` — EXISTS
- `src/components/admin/draft-template-fieldset.tsx` — EXISTS
- `src/app/(admin)/admin/settings/page.tsx` — MODIFIED
- Commit `1ae92ca` — EXISTS (`git log --oneline -1` confirms `feat(20-12): ...`)
- `npx tsc --noEmit` — EXIT 0 (no errors)
