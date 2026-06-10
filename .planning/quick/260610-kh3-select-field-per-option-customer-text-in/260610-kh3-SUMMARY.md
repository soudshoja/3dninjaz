---
phase: 260610-kh3
plan: "01"
subsystem: configurator
tags: [select-field, custom-text, personalization, server-validation, security]
dependency_graph:
  requires: []
  provides: [per-option-custom-text, server-sanitization]
  affects: [paypal.ts, admin-pos.ts, whatsapp-order.ts, configurator-form, config-field-modal]
tech_stack:
  added: [src/lib/custom-text.ts]
  patterns: [NBSP-defence, server-re-validation, customKey-pattern]
key_files:
  created:
    - src/lib/custom-text.ts
    - src/lib/__tests__/custom-text.test.ts
  modified:
    - src/lib/config-fields.ts
    - src/components/admin/config-field-modal.tsx
    - src/components/store/configurator-form.tsx
    - src/components/store/configurable-product-view.tsx
    - src/actions/paypal.ts
    - src/actions/admin-pos.ts
    - src/actions/whatsapp-order.ts
decisions:
  - "D-1: customInput/customMaxLength stored as per-option flags in configJson (no DB migration)"
  - "D-2: typed text stored under values[fieldId + '__custom']; values[fieldId] stays the option value so price/SKU/weight lookups are untouched"
  - "D-3: server re-validation on all three order paths using shared sanitizeCustomText + buildConfigSummaryServer"
  - "D-4: pricing/SKU/weight resolution byte-for-byte unchanged"
  - "D-5: branch feat/select-custom-text off origin/dev"
metrics:
  duration: ~40min
  completed: "2026-06-10"
  tasks: 3
  files: 7
---

# Phase 260610-kh3 Plan 01: Per-option customer text in Select fields

## One-liner

Per-option "customer types text" flag on Select config fields — admin toggle + PDP required input + server-authoritative sanitization on all three order paths (PayPal, POS, WhatsApp).

## What Was Built

### Task 1: Schema flags + sanitizer helper (TDD)

- Extended `SelectFieldConfig` type and `SelectFieldConfigSchema` with `customInput?: boolean` and `customMaxLength?: number` (Zod: `int().min(1).max(200).optional()`). Backward compatible — existing options without the flags parse as `undefined`.
- Created `src/lib/custom-text.ts`: plain module (no "use server") importable by both client and server. Exports `CUSTOM_TEXT_SUFFIX = "__custom"`, `customKey(fieldId)`, `isCustomKey(key)`, `sanitizeCustomText(raw, maxLength)` (NBSP-defence aligned with project memory), and `buildConfigSummaryServer(selectFields, values, nonSelectParts)`.
- 21 vitest tests covering all behaviors: trim, NBSP normalization, control-char stripping, whitespace collapse, maxLength slice, backward compatibility, schema round-trip.

### Task 2: Admin toggle + PDP input + summary wiring

- `config-field-modal.tsx`: Extended local `SelectOption` type. Added per-option sub-row beneath each option grid row (grid layout untouched): a `Switch` ("Customer types text") + conditional `Input` ("Max length", 1–200, default 30). Toggle OFF clears `customMaxLength`.
- `configurator-form.tsx`: `SelectField` now accepts `allValues` + `onValuesChange` (instead of per-field `value` + `onChange`). When `selectedOpt?.customInput` is true, reveals a required text `<input>` with brand styling, char counter, and `aria-required`. Named `customTextError` boolean (option chosen but text blank) drives the microcopy — independent of `showRequiredError` (option not chosen). Option changes clear stale `__custom` key.
- `configurable-product-view.tsx`: Imported `customKey` + `CUSTOM_TEXT_SUFFIX`. `buildSummary` emits `` `Label: "TEXT"` `` for customInput options. New `customInputsSatisfied` memo gates `canAdd`. `ctaLabel` wired: `!requiredFilled || !customInputsSatisfied` both map to "Fill in all fields first".

### Task 3: Server-authoritative validation

All three order paths now re-read `product_config_fields` for configurable products and enforce:
- **Required**: `sanitizeCustomText` result must be non-empty for `customInput` options.
- **MaxLength**: enforced at `opt.customMaxLength ?? 30`.
- **Stripping**: `__custom` keys for non-flagged options are deleted before snapshot (T-kh3-03).
- **Summary rebuild**: `buildConfigSummaryServer` replaces client `computedSummary` for select parts; non-select parts preserved from existing summary.

Auth guard ordering preserved on all three paths (`requireAdmin` / `getSessionUser` first await; validation runs after auth, before DB insert).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all wiring is complete. The feature requires a configurable product with a Select field that has `customInput: true` set via the admin modal; no stubs or placeholders in the rendering path.

## Threat Flags

No new threat surface introduced beyond what is in the plan's threat model. All four threats (T-kh3-01 through T-kh3-03, T-kh3-05) mitigated in this plan.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `src/lib/custom-text.ts` exists | FOUND |
| `src/lib/__tests__/custom-text.test.ts` exists | FOUND |
| commit f638fe2 (schema + sanitizer) | FOUND |
| commit f6a9279 (admin + PDP + summary) | FOUND |
| commit 12ffec6 (server validation) | FOUND |
| vitest 21/21 | PASSED |
| tsc --noEmit | CLEAN |
