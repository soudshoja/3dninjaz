---
created: 2026-05-02T23:03:38.611Z
title: Publish-time guard for empty colour palettes
area: ui
files:
  - src/lib/config-fields.ts:110-114
  - src/actions/products.ts
---

## Problem

Commit `41ecc00` removed `.min(1)` from `ColourFieldConfigSchema.allowedColorIds` so admin can save in-progress products with empty palettes (the new "Secondary" colour field starts empty by design). This unblocks the admin UX, but a side effect: an admin can technically PUBLISH a product whose colour fields have zero allowed colours, leaving customers with empty/broken pickers on the PDP.

The cross-axis colour autofill prompt now fires correctly across every admin surface (verified 2026-05-02 — `/configurator` via configurator-builder.tsx, `/variants` via variant-editor.tsx, `/edit` + `/new` via inline-fields-editor.tsx). So accidentally-empty palettes are rare but possible.

## Solution

Re-add the non-empty constraint conditionally — only when product transitions to published state OR enforce at customer-facing render time. Two approaches:

1. **Conditional Zod refinement** in `updateProduct` action: if `status === 'published'` AND any colour field has `allowedColorIds.length === 0`, reject with a clear error.
2. **Render-time fallback** on PDP: if a published product reaches the customer with an empty colour field, show a graceful "Coming soon — colours being curated" placeholder rather than a broken empty picker.

Approach 1 is preferred (fail loud at publish, prevent broken state from reaching customers). Option 2 is a belt-and-braces fallback.

Related commits: `41ecc00`, `9ddef01`, `77f4e21`, `a59f7e1`.
