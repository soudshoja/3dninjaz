---
phase: 260610-kh3
verified: 2026-06-10T10:00:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "On a configurable product, flag option B 'Your name' as customer-types-text (max 12) in the admin config-field modal. On the PDP, select option A (non-flagged) — confirm no text input appears and Add-to-Bag is not gated by it. Select option B — confirm the required text input appears, Add-to-Bag shows 'Fill in all fields first' until text is entered."
    expected: "Option A: click-only, unaffected. Option B: required input visible, CTA blocked until text filled, char counter at 12, input border turns red when blank after interaction."
    why_human: "UI rendering and CTA state requires browser interaction to confirm."
  - test: "With option B selected and text typed (e.g. 'SARA'), add to bag. Confirm the bag line, admin order detail, production board chip, and invoice all show 'Your name: \"SARA\"'."
    expected: "computedSummary reads 'Your name: \"SARA\"' across all order surfaces."
    why_human: "End-to-end flow through bag -> checkout -> admin UI requires manual walkthrough."
  - test: "Place a WhatsApp order for a product with a customInput option. Confirm the persisted order_items row has the sanitized typed text in computedSummary, not the raw client value."
    expected: "WhatsApp order path stores server-sanitized text; smuggled __custom keys on non-flagged options are stripped."
    why_human: "WhatsApp order flow requires a real request; can't verify DB row content programmatically without a live session."
---

# Phase 260610-kh3: Per-option customer text in Select fields — Verification Report

**Phase Goal:** Select field per-OPTION customer text input — admin flags an option "customer types text" (+ maxLength, default 30); PDP shows required text input for that option; typed text flows into computedSummary/order snapshot; server-authoritative validation on ALL THREE order-creation paths (paypal.ts checkout, admin-pos.ts POS, whatsapp-order.ts); same Select field type, configJson only, no migration; backward compatible.
**Verified:** 2026-06-10T10:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin can flag an individual Select option as 'customer types text' and set a max length (default 30) | VERIFIED | `config-field-modal.tsx` lines 694–721: per-option sub-row with `Switch` ("Customer types text") bound to `opt.customInput`, conditional numeric `Input` ("Max length") bound to `opt.customMaxLength`. Toggle OFF clears `customMaxLength` via `updateOption`. Local `SelectOption` type extended with both fields. |
| 2 | On the PDP, selecting a customInput option reveals a required text input; Add-to-bag stays blocked until it is filled | VERIFIED | `configurator-form.tsx`: `selectedOpt?.customInput` gates the `<input>` render (line 419); `handleOptionChange` clears stale `__custom` key; `customTextError` named boolean (line 377) drives error microcopy independent of `showRequiredError`. `configurable-product-view.tsx` line 296: `canAdd = ... && customInputsSatisfied`; line 425: `!requiredFilled \|\| !customInputsSatisfied` maps to "Fill in all fields first". |
| 3 | The customer's typed text appears in the order's computedSummary | VERIFIED | `buildSummary` (configurable-product-view.tsx lines 103–112): for `opt.customInput` options, emits `` `${f.label}: "${typed}"` ``. Server-side `buildConfigSummaryServer` (custom-text.ts lines 136–158) rebuilds the summary after sanitization on all three action paths, replacing client-supplied summary for select parts. |
| 4 | Options WITHOUT the flag behave exactly as today (no input, no validation change) | VERIFIED | `configurator-form.tsx`: custom input only rendered when `selectedOpt?.customInput` is true. `customInputsSatisfied` memo (configurable-product-view.tsx lines 280–287): non-flagged options always return `true`. `SelectFieldConfigSchema` uses `.optional()` on both new fields — legacy options parse with both fields as `undefined`, zero behavior change. `resolveOptionWeightKg` (option-weight.ts lines 40–48) only accesses `configValues[fieldId]` by explicit registered field IDs, never iterates all keys. |
| 5 | Server re-reads configJson at checkout AND POS AND WhatsApp orders, enforces required-when-flagged + maxLength, and trims/sanitizes — client text is never trusted | VERIFIED | All three imports confirmed: paypal.ts line 23, admin-pos.ts line 27, whatsapp-order.ts line 17 all import `sanitizeCustomText`, `customKey`, `buildConfigSummaryServer`. Each fetches `product_config_fields` from DB, parses via `ensureConfigJson("select", ...)`, loops over select fields, calls `sanitizeCustomText(raw, opt.customMaxLength ?? 30)`, rejects if sanitized result is empty, deletes smuggled `__custom` on non-flagged options (T-kh3-03), and rebuilds `computedSummary` via `buildConfigSummaryServer`. Auth guard is first await on all three (`getSessionUser` paypal.ts/whatsapp-order.ts line 88/51; `requireAdmin` admin-pos.ts line 255+). Validation runs after auth, before DB insert. |
| 6 | Pricing, SKU, and weight resolution are unchanged (still per-option value lookups) | VERIFIED | `configurator-form.tsx` `handleOptionChange` writes `{ ...allValues, [field.id]: v }` — option value preserved. `handleCustomTextChange` only writes `{ ...allValues, [customKey(field.id)]: typed }` — never overwrites `values[fieldId]`. `resolveOptionWeightKg` iterates only registered fieldIds from DB-fetched map, reads `configValues[fieldId]` — `__custom` key is invisible. Server actions explicitly note "Pricing/SKU/weight resolution is NOT touched (D-4)" and only mutate `__custom` keys and `computedSummary`. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/config-fields.ts` | `customInput?`/`customMaxLength?` on SelectFieldConfig type + SelectFieldConfigSchema | VERIFIED | Type lines 71–76 carry both fields with JSDoc. Schema lines 156–158 carry `z.boolean().optional()` + `z.number().int().min(1).max(200).optional()`. Zod will round-trip both on every `ensureConfigJson("select", ...)` call — no silent stripping. |
| `src/lib/custom-text.ts` | `sanitizeCustomText()`, `CUSTOM_TEXT_SUFFIX`, `customKey`, `isCustomKey`, `buildConfigSummaryServer` | VERIFIED | All five exports present. NBSP defence aligned with project memory. `sanitizeCustomText` order: coerce → unicode-space replace → control-char strip → whitespace collapse → trim → slice. `buildConfigSummaryServer` takes `selectFields`, `values`, `nonSelectParts`, joins with ` · `. |
| `src/components/admin/config-field-modal.tsx` | Per-option 'Customer types text' toggle + max-length input | VERIFIED | Lines 694–721: sub-row below each option row, `Switch` + conditional `Input`, correct `updateOption` wiring, toggle-off clears `customMaxLength`. Local `SelectOption` type extended (lines 306, 308). |
| `src/components/store/configurator-form.tsx` | Custom text input revealed when selected option has `customInput`; `customTextError` named boolean | VERIFIED | Lines 374–398: `customValue` from `allValues[customKey(field.id)]`, named `customTextError` (line 377), `handleOptionChange` clears `__custom` key on option change, `handleCustomTextChange` writes only to `customKey`. Input rendered at line 419 gated by `selectedOpt?.customInput`. |
| `src/components/store/configurable-product-view.tsx` | `buildSummary` emits typed text; `customInputsSatisfied` blocks Add-to-bag | VERIFIED | `buildSummary` lines 103–112: customInput branch emits `` `${f.label}: "${typed}"` ``. `customInputsSatisfied` memo lines 277–288. `canAdd` line 296 ANDs both. `ctaLabel` line 425 ORs both conditions. |
| `src/actions/paypal.ts` | Server re-validation with `sanitizeCustomText` | VERIFIED | Lines 306–393: DB re-read, `ensureConfigJson`, sanitize loop, empty-reject, `__custom` strip, `buildConfigSummaryServer` rebuild. Import line 23. |
| `src/actions/whatsapp-order.ts` | Server re-validation with `sanitizeCustomText` | VERIFIED | Lines 234–309: identical pattern to paypal.ts. Import line 17. Auth guard at line 51 (first await). |

Note: `admin-pos.ts` is not listed in plan `artifacts` but was verified: lines 727–797 implement identical server re-validation pattern. Import line 27. `requireAdmin()` is first await (line 255 and others).

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `configurator-form.tsx` | `values[fieldId + "__custom"]` | `onChange` writes typed text under derived custom key | VERIFIED | `handleCustomTextChange` (line 393): `onValuesChange({ ...allValues, [customKey(field.id)]: typed })`. `handleOptionChange` (line 382) deletes stale key on option switch. |
| `configurable-product-view.tsx` | `computedSummary` | `buildSummary` appends option label + typed text | VERIFIED | Lines 103–112 in `buildSummary`. Line 356 computes `summary = buildSummary(fields, values, currentPrice)` passed into `configData`. |
| `paypal.ts` | `product_config_fields.configJson` | server re-reads select config + enforces required/maxLength | VERIFIED | Lines 311–341: DB select on `productConfigFields`, `ensureConfigJson("select", row.configJson)`. Pattern confirms `ensureConfigJson` call exists. |
| `whatsapp-order.ts` | `product_config_fields.configJson` | server re-reads select config + enforces required/maxLength | VERIFIED | Lines 237–266: identical DB select + `ensureConfigJson` pattern. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `configurable-product-view.tsx` | `customInputsSatisfied` | `values[customKey(f.id)]` populated by customer input via `configurator-form.tsx` | Yes — flows from customer keystroke through `handleCustomTextChange` → parent `onValuesChange` → `values` state → memo | FLOWING |
| `paypal.ts` snapshot | `computedSummary` | `buildConfigSummaryServer(selectFields, values, existingParts)` after DB re-read | Yes — DB-fetched `configFieldRows`, server-sanitized `values`, real `buildConfigSummaryServer` call | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED for the order-creation paths (requires live DB session and authenticated request). Schema and helper exports are runnable in isolation — covered by the 21/21 vitest suite already confirmed by the orchestrator.

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| KH3-01 | Per-option customInput flag in configJson | SATISFIED | Type + schema in config-fields.ts; admin modal toggle |
| KH3-02 | PDP required text input gated by flag | SATISFIED | configurator-form.tsx + configurable-product-view.tsx |
| KH3-03 | Typed text in computedSummary / order surfaces | SATISFIED | buildSummary + buildConfigSummaryServer on all three paths |
| KH3-04 | Server-authoritative validation on all three order paths | SATISFIED | paypal.ts, admin-pos.ts, whatsapp-order.ts — all re-read DB and sanitize |

### Anti-Patterns Found

No blockers or stub patterns detected in any of the 7 modified files. No `TODO`/`FIXME`/placeholder comments in the new code paths. `buildConfigSummaryServer` returns a real rebuilt string from DB-fetched fields — not hardcoded. Server actions return real rejection errors on empty required text, not no-ops.

### Human Verification Required

The automated checks confirm all wiring is complete and substantive. Three end-to-end flows require a browser session to confirm rendering and order persistence:

**1. Admin toggle + PDP rendering**

**Test:** On a configurable product with a Select field, open the admin config-field modal. Flag one option "Your name" with customInput=true and maxLength=12. Save. On the PDP, select a non-flagged option — confirm no text input appears. Select "Your name" — confirm a text input appears with a 12-char counter, red border when blank (after touching), brand-blue border when filled, and "Fill in all fields first" on the CTA until text is entered.
**Expected:** Non-flagged options unchanged. Flagged option reveals input, gates CTA.
**Why human:** UI conditional rendering and CTA state requires browser interaction.

**2. computedSummary propagation to all order surfaces**

**Test:** With text "SARA" typed, add to bag. Complete a PayPal sandbox checkout. In the admin order detail, production board, and invoice PDF, confirm the line shows 'Your name: "SARA"'.
**Expected:** computedSummary string 'Your name: "SARA"' appears consistently across bag line, admin order detail, production chip, and invoice.
**Why human:** Multi-step flow through cart -> checkout -> DB row -> order surfaces requires live session.

**3. WhatsApp order path**

**Test:** Submit a WhatsApp order for a product with a customInput Select option. Inspect the resulting order_items row in the DB. Confirm `computedSummary` contains the sanitized typed text (not a raw unsanitized client value), and that no `__custom` key appears in the `values` object of non-flagged options.
**Expected:** DB row reflects server-rebuilt summary; smuggled custom text on non-flagged options is absent.
**Why human:** WhatsApp order flow requires a real authenticated request and DB row inspection.

### Gaps Summary

No gaps. All six must-have truths are verified at the code level. The feature is fully wired: schema flags persist via Zod round-trip, admin modal saves them, PDP reads them to gate the input and CTA, `buildSummary` emits them to `computedSummary`, and all three server action paths re-read the DB, sanitize, reject empty required text, strip smuggled keys on non-flagged options, and rebuild the summary server-side. Price/weight/SKU resolution is byte-for-byte unchanged. No DB migration needed or added. The three items in human verification are end-to-end smoke tests — the underlying code is complete.

---

_Verified: 2026-06-10T10:00:00Z_
_Verifier: Claude (gsd-verifier)_
