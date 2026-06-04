---
title: Fix maxLength mismatch between TierTable and configurator
quick_id: 260604-qsc
slug: fix-maxlength-mismatch-between-tiertable
status: planned
created: 2026-06-04
files_modified:
  - src/components/store/configurable-product-view.tsx
  - src/components/store/configurator-form.tsx
---

## Description

The keychain product configurator has two disconnected sources of truth for the
maximum character/cube count. The live preview renders fewer cubes than the tier
table allows, and the "Your name" text input rejects valid characters before the
tier table limit is reached. This fix makes `maxUnitCount` (the admin-controlled
DB field) the single authority, removing the stale `config.maxLength` fallback
from both the preview and the input.

## Root Cause

`product.maxUnitCount = 10` (DB, set via TierTableEditor "Max unit count"
spinner) is the intended source of truth. However two render-time reads ignore
it and fall through to `textFields[0].config.maxLength = 8` (stale JSON stored
in the config field record), causing both the preview and the input cap to
honour the wrong value.

**Location 1 — `configurable-product-view.tsx` lines 284-286:**

```ts
// BEFORE — config.maxLength wins when non-null
const maxLength = textFields.length > 0
  ? ((textFields[0].config as { maxLength?: number }).maxLength ?? maxUnitCount ?? 8)
  : (maxUnitCount ?? 8);
```

`config.maxLength = 8` is non-null so it wins; `maxUnitCount = 10` is never
reached. The `maxLength` value forwarded to `<KeychainPreview>` and
`<ConfiguratorForm>` is therefore 8, not 10.

**Location 2 — `configurator-form.tsx` line 71 (inside `TextField`):**

```ts
// BEFORE — reads cfg.maxLength directly; never receives maxUnitCount
const maxLen = cfg.maxLength ?? 20;
```

`ConfiguratorForm` and `TextField` do not accept a `textMaxLength` prop at all,
so the text input is always capped by `cfg.maxLength` regardless of what the
parent view computes.

## Tasks

### Task 1 — Invert maxLength priority in `configurable-product-view.tsx`

**File:** `src/components/store/configurable-product-view.tsx`
**Lines:** 284-286

Replace the current three-line derivation with:

```ts
// AFTER — maxUnitCount always wins; config.maxLength is last-resort fallback
const maxLength = maxUnitCount ??
  (textFields.length > 0
    ? ((textFields[0].config as { maxLength?: number }).maxLength ?? 8)
    : 8);
```

No other changes in this file at this step. The `<ConfiguratorForm>` call-site
at line 601 receives `textMaxLength={maxLength}` in Task 3 once the prop exists.

---

### Task 2 — Thread `textMaxLength` through `ConfiguratorForm` and `TextField`

**File:** `src/components/store/configurator-form.tsx`

Five focused edits in order:

**2a — Add prop to `Props` type (line 43, after `basePrice?`):**

```ts
/**
 * Override for text-field character cap. When provided, takes precedence over
 * the per-field config.maxLength. Driven by product.maxUnitCount so the tier
 * table and the input limit stay in sync.
 */
textMaxLength?: number;
```

**2b — Add `textMaxLength` to the `TextField` component (lines 57-68):**

Add `textMaxLength` to both the destructure list and the inline type object:

```ts
function TextField({
  field,
  value,
  onChange,
  onTouch,
  touched,
  textMaxLength,          // add
}: {
  field: PublicConfigField;
  value: string;
  onChange: (v: string) => void;
  onTouch: () => void;
  touched: React.MutableRefObject<boolean>;
  textMaxLength?: number; // add
}) {
```

**2c — Update `maxLen` derivation in `TextField` (line 71):**

```ts
// BEFORE
const maxLen = cfg.maxLength ?? 20;

// AFTER
const maxLen = textMaxLength ?? cfg.maxLength ?? 20;
```

**2d — Pass `textMaxLength` when rendering `<TextField>` (lines 423-429):**

```tsx
<TextField
  field={field}
  value={value}
  onChange={handleFieldChange}
  onTouch={onTouch}
  touched={touchedRef}
  textMaxLength={textMaxLength}   // add
/>
```

**2e — Destructure `textMaxLength` in `ConfiguratorForm` signature (line 373):**

```ts
// BEFORE
export function ConfiguratorForm({ fields, values, onChange, onTouch, basePrice }: Props) {

// AFTER
export function ConfiguratorForm({ fields, values, onChange, onTouch, basePrice, textMaxLength }: Props) {
```

---

### Task 3 — Pass `textMaxLength` from the `<ConfiguratorForm>` call-site

**File:** `src/components/store/configurable-product-view.tsx`
**Line:** 601

Add `textMaxLength={maxLength}` to the existing `<ConfiguratorForm>` JSX:

```tsx
// BEFORE
<ConfiguratorForm
  fields={fields}
  values={values}
  onChange={handleValuesChange}
  onTouch={handleTouch}
  basePrice={basePriceBeforeOverride ?? undefined}
/>

// AFTER
<ConfiguratorForm
  fields={fields}
  values={values}
  onChange={handleValuesChange}
  onTouch={handleTouch}
  basePrice={basePriceBeforeOverride ?? undefined}
  textMaxLength={maxLength}
/>
```

`maxLength` is the variable derived in Task 1.

---

### Task 4 — Update stale comment in `keychain-preview.tsx` (cosmetic only)

**File:** `src/components/store/keychain-preview.tsx`
**Line:** 15

```ts
// BEFORE
 *   - Fluid cube sizing via clamp() so 8 cubes always fit on any screen

// AFTER
 *   - Fluid cube sizing via clamp() so all cubes fit on any screen (count driven by maxLength prop)
```

No logic changes. The `clamp()` formula at line 57 already uses the `maxLength`
prop dynamically and is correct for any value.

---

## Verification

After all four tasks:

1. `npx tsc --noEmit` passes with zero new errors.
2. Load a keychain PDP in the browser with `product.maxUnitCount = 10`.
3. Type into "Your name" — input accepts up to 10 characters and shows
   "Maximum reached" at 10, not 8.
4. The preview strip and main `<KeychainPreview>` render up to 10 cubes.
5. Customers who previously entered 9-10 characters and had their text silently
   truncated now see the full text rendered correctly.

## What NOT to change

- `keychain-preview.tsx` clamp formula — already dynamic; only the line-15
  comment is touched.
- Tier table, DB schema, or any server action.
- Any existing `config.maxLength` values in the DB — `maxUnitCount` is the
  single authoritative field going forward; `config.maxLength` is retained only
  as a silent last-resort fallback.
