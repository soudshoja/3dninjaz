# Phase 20: Admin POS + Draft Order Flow - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-17
**Phase:** 20-admin-pos-draft-order-flow
**Areas discussed:** POS builder UX, order_items accommodation, Slip upload + review surface, Customer draft page payment-method UX

---

## POS builder UX

### Picker style

| Option | Description | Selected |
|--------|-------------|----------|
| Single global combobox with type-ahead + result-type icons | One search box; results show name + type icon; "Add free-text line" button below | ✓ |
| Tabbed picker: Stocked \| Configurable \| Clicker \| Free-text | Four tabs each with its own list/search | |
| Type-first dropdown then product search | Pick type, then search within type | |

**User's choice:** Single global combobox.
**Notes:** "1 can add multiple items as well" — confirms multi-line builder is required (already in SPEC, but emphasized).

### Configurator placement

| Option | Description | Selected |
|--------|-------------|----------|
| Inline expansion in the line row | Picking configurable product expands the line row with all fields | ✓ |
| Side drawer / modal | Per-line modal with configurator fields | |
| Reuse customer-side ConfiguratorForm as-is | Mount the existing /shop component inside POS line | |

**User's choice:** Inline expansion.
**Notes:** None.

### Admin price override

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — each line has an editable unitPrice that defaults to the computed/list price | Override per-line for offline-agreed pricing; snapshot on order_items | ✓ |
| No — lock to computed price; use a coupon for discounts | Forces consistent pricing logic | |

**User's choice:** Editable unitPrice override.
**Notes:** "1 but coupon should be there too as we might add order and we have a copuon and we apply it on client behalf" — admin can ALSO apply existing customer-facing coupons on the customer's behalf at POS submit. Both paths active (D-03 + D-04).

---

## order_items accommodation

### Manual line FK

| Option | Description | Selected |
|--------|-------------|----------|
| Sentinel literal: productId='manual' + variantId='manual' | No schema change; queries filter via WHERE productId != 'manual' | ✓ |
| Make columns nullable | Migration touches hot orders_items table; all read sites must handle NULL | |
| Synthetic UUID per manual line: productId='m-'+randomUUID() | Random ID per line; loses 'all manual' shortcut | |

**User's choice:** Sentinel literal 'manual'.
**Notes:** "but if we do this shouldnd end up showing in front end as a product or in our products or anywhere just a record to be able to our wrok" — strict invariant captured in D-07/D-08: sentinel exists ONLY in `order_items.productId`. NO `products.id='manual'` row will ever exist. All read sites that would link to `/products/<id>` or fetch from `products` MUST check `isManualLine(item)` first. Render manual lines via `item.productName` / `item.unitPrice` directly.

### Discriminator

| Option | Description | Selected |
|--------|-------------|----------|
| Sentinel-string check only: productId === 'manual' | If using sentinel productId, no new column needed; isManualLine() helper | ✓ |
| Add order_items.item_type ENUM('product','manual') | Explicit discriminator column | |
| Read from orders.sourceType (web \| manual) | Can't disambiguate per-line in mixed orders | |

**User's choice:** Sentinel-string check only.
**Notes:** None.

---

## Slip upload + review surface

### Upload pipeline

| Option | Description | Selected |
|--------|-------------|----------|
| New writePaymentProof helper — single resolution + EXIF strip + 256px thumb | New module src/lib/payment-proof-storage.ts; tailored to receipts | ✓ |
| Reuse writeUpload (AVIF/WebP/JPEG at 480/960/1440) | Zero new code but produces 9 files per slip | |
| Reuse writeUpload PLUS PDF fast-path | Hybrid — two code paths | |

**User's choice:** New writePaymentProof helper.
**Notes:** None.

### Review UI

| Option | Description | Selected |
|--------|-------------|----------|
| Inline section on /admin/orders/[id] with thumbnail + click-for-lightbox + Confirm/Reject buttons | No new route; minimal new surface | ✓ |
| Dedicated /admin/payment-reviews queue page | Standalone surface like /admin/disputes | |

**User's choice:** Inline section on /admin/orders/[id].
**Notes:** None.

### Viewer details

| Option | Description | Selected |
|--------|-------------|----------|
| Image + metadata sidebar: upload time, file size, uploader (customer/admin), amount expected | Admin sees amount alongside slip for fast verification | ✓ |
| Image only — metadata stays on the parent order page | Cleaner lightbox but one extra click per review | |

**User's choice:** Image + metadata sidebar with expected amount prominent.
**Notes:** None.

---

## Customer draft page payment-method UX

### Method UX

| Option | Description | Selected |
|--------|-------------|----------|
| Two large cards side-by-side; click-to-expand chosen card inline | Single page; cards stack on mobile; 60px tap target | ✓ |
| Stepper: Step 1 pick method, Step 2 pay | Two screens with more room | |
| Accordion (one open at a time) | Compact vertical list | |

**User's choice:** Two large cards, click-to-expand.
**Notes:** None.

### Post-upload

| Option | Description | Selected |
|--------|-------------|----------|
| Same page swaps to 'Your payment is being reviewed' state | No redirect; URL stays valid for re-open after rejection | ✓ |
| Redirect to /payment-links/[token]/pending dedicated page | Cleaner URL semantics but more routes | |

**User's choice:** Same-page state swap.
**Notes:** None.

### Bank empty state

| Option | Description | Selected |
|--------|-------------|----------|
| Hide Bank Transfer card entirely — PayPal only | SPEC requirement 10; customer sees only PayPal | ✓ |
| Show Bank Transfer card but disable it | Customer sees disabled option; may confuse | |

**User's choice:** Hide entirely.
**Notes:** None.

---

## Claude's Discretion

- Exact filename for the slip upload module (`payment-proof-storage.ts` vs `slip-upload.ts`).
- Internal layout of the metadata sidebar in the lightbox (vertical stack vs grid).
- Class names for the POS row-expansion animation.
- Choice between Sharp `.rotate().withMetadata({ exif: {} })` vs `.toBuffer({ resolveWithObject: true })` + metadata strip for EXIF stripping.

## Deferred Ideas

- Admin-side notification fan-out on slip upload (email/WhatsApp to admin when customer uploads proof)
- Auto-OCR / auto-verification of slip content
- Cash on Delivery (COD) as a third payment method
- Storefront cart → bank-transfer payment
- POS hardware integration (barcode scanner, receipt printer, cash drawer)
- Staff role separation (cashier vs admin)
- Customer-initiated decline / change-request UI on draft page
- Customer-side draft autosave
- PayPal Reporting reconciliation extension for bank-transfer orders
- Refund flow for bank-transfer orders
- Audit log table for admin price overrides + coupon applications
- Mobile-PWA optimization for POS on a phone
