# Phase 20: Admin POS + Draft Order Flow — UI Design Contract

**Gathered:** 2026-05-17
**Style:** Sharp Playful (3D Ninjaz house style — bright + flat + sharp corners + generous tap targets)
**Source:** ui-ux-pro-max skill (claymorphism base) + brand tokens (CLAUDE.md) + Phase 2 D-04 mobile-first + memory `reference_willow_design`

---

## Locked design system

### Palette (reuse existing tokens — no new colours)

| Role | Token | Hex | Use |
|------|-------|-----|-----|
| Surface | `--color-brand-cream` | `#F7FAF4` | Page background (admin + customer) |
| Ink | `--color-brand-ink` | `#0B1020` | Primary text, default button label |
| Primary CTA | `--color-brand-blue` | `#0080ff` | Submit, Send, Pay |
| Primary hover | `--color-brand-blue-dark` | `#0061C2` | Hover/active CTA |
| Success | `--color-brand-green` | `#03C03C` | Confirm Payment, paid state, success toast |
| Success-dark | `--color-brand-green-dark` | `#018A29` | Confirm hover/active |
| Accent | `--color-brand-purple` | `#8A00C2` | Bank Transfer card brand, payment-method tags |
| Accent-dark | `--color-brand-purple-dark` | `#62008C` | Purple hover |
| Slate-tier | `slate-100/200/600/700` (Tailwind) | — | Borders, secondary text, helper text |
| Danger | `red-600 / red-50` | — | Reject button, error toast, slip-rejected banner |
| Warning | `amber-500 / amber-50` | — | Awaiting-review pill, pending badge |

Rule: never introduce a non-brand hue for a new feature. Status pills mix brand + slate/red/amber only.

### Typography (reuse existing fonts)

- Heading: `var(--font-heading)` (Chakra Petch) — page H1 32px / section H2 22px / card H3 18px. All `font-weight: 600`.
- Body: `var(--font-body)` — body 16px (admin) / 16px (customer; never <16 mobile), label 14px, helper 12px.
- Numerals (totals, amount in lightbox): same body font, `font-feature-settings: 'tnum'` for tabular alignment.

### Shape + spacing

- **Radius:** 4px on every interactive control (button, input, card, modal, dropdown). No `rounded-lg`/`xl`. Sharp-edged is the brand signal.
- **Borders:** 2px solid for cards/inputs/dialogs. Border colour `slate-200` default → brand colour on focus/active.
- **Shadow:** flat. One soft shadow only on the floating elements (`shadow-md` on lightbox modal + sticky toolbars). Cards = no shadow, just 2px border.
- **Spacing scale:** 8 / 12 / 16 / 24 / 32 / 48px. Section gap 32px. Card inner padding 16px (mobile) / 24px (desktop).
- **Density:** 48px row height (lists, line items), 60px primary buttons (`min-h-[60px]`), 48px secondary buttons, 44px chip filters.

### State language

- **Hover (desktop):** colour-shift only — never scale/translate (memory `feedback_zindex_click_intercept` + skill rule). 150ms ease-out.
- **Focus:** 2px purple outline + 2px offset (Phase 18 pattern preserved).
- **Loading:** button → disabled + Lucide `Loader2` spinning at left of label, label "Working…". Sections → skeleton blocks at exact card height (no layout shift).
- **Empty:** card with Lucide outline icon at 32px + one-line guidance + secondary CTA.
- **Error inline:** red-600 text under the offending field, no toast unless top-level.
- **Success toast:** green-600 background, cream text, top-right, 4s auto-dismiss, Lucide `CheckCircle2`.

### Icons

- Lucide React only. 16px (inline), 20px (button), 24px (page header), 32px (empty state).
- No emoji. No mixing icon sets.

### Z-index scale (memory `feedback_zindex_click_intercept`)

`10` sticky toolbars · `20` row-expansion overlay · `30` dropdown · `40` modal · `50` lightbox · `60` toast.

---

## Surface 1 — `/admin/pos`

### Layout

- **Page H1:** "Point of Sale" + sub-line "Build an offline order for a customer".
- **Two-column at ≥1024px:** left = order builder (60%), right = totals card (sticky, 40%). Stack vertically below 1024px.
- **Sticky bottom action bar (mobile only ≤768px):** "Save & continue" 60px green button, full-width minus 16px gutter.

### Product picker (global combobox)

- **Component:** single `Command` (shadcn) input. Placeholder: "Search any product, or add a custom line…".
- **Result row:** 64px tall. Layout: 40×40 product thumbnail (or coloured square fallback) · product name (16px ink) + variant count subtitle (12px slate-600) · type icon at right (16px Lucide).
  - Type icons: stocked = `Package`, configurable = `Settings2`, keyboard clicker = `Keyboard`, free-text = `Pencil`.
- **"Add custom (free-text) line"** button: sits BELOW the search box as a full-width outlined 48px button with `Pencil` icon. Brand purple border, ink label.
- **No results:** "Nothing matched. Add a custom line instead." with the same Add button inline.

### Line row (collapsed)

- 56px tall on desktop, 72px on mobile (two-line layout fits configurator caption).
- Layout (desktop): drag-handle 24px · thumbnail 40px · name + variant label · quantity stepper (–/N/+ chunky 40px wide buttons, sharp) · unitPrice input (96px wide, prefix "RM") · line-total (right-aligned 18px bold) · trash button.
- Editable unitPrice override: input pre-fills computed price, slight purple background tint (`bg-purple-50`) when admin has changed it from the computed value → makes overrides visible.

### Line row (expanded for configurable / clicker)

- Smooth height transition (200ms). Border on the row turns brand blue 2px.
- Inline form mirrors `ConfiguratorForm` from Phase 19 (text / colour swatch / number / select fields) inside a 16px-padded inner card with `bg-slate-50`.
- Colour fields reuse `ColourPickerDialog` (Phase 18) opened from a 32px swatch button.
- Reactivity: Pattern B refetch (Phase 17 AD-06) on save — no router.refresh.

### Coupon strip

- Single-row card between line list and totals: input (160px) + Apply button (purple 48px) + on success an inline pill with `-RM 5.00 (NINJA10)` + small `X` to remove.
- Validation errors render below the input in red-600.

### Customer + shipping form

- Two-column grid on desktop (name / phone, line1 / line2, city / state, postcode / country), stacks single-column on mobile.
- Inputs 48px min-height. Phone field has Lucide `Phone` prefix icon at left.
- State = native select (Malaysian states list already in `validators.ts`).

### Totals card (sticky right)

- Card with 2px border, 24px padding, 16px row gap.
- Row pattern: label left, MYR right, both tabular-numerals. Bold weight only on **Total**.
- "Shipping" row has an inline edit icon (Lucide `Pencil`) — clicking turns the amount into an input. Same pattern for any future override.
- Primary CTA at bottom: green 60px **"Create order"** full-width.

### Send-draft modal (post-submit)

- Centred modal at z-40, max-width 480px, sharp 4px corners, 2px ink border.
- Header: H3 "Send order to customer?" in Chakra Petch.
- Body: order number `PN-XXXXXXXX` + total in big-bold + 12px helper.
- Footer: two stacked-on-mobile buttons — primary green 60px **"Yes — generate draft link"** (auto-focused), secondary outlined ink 48px **"No — keep as pending"**.
- After "Yes": modal swaps to a success body — copy-block showing the URL (Lucide `Link` icon + monospace text + 32px copy button), plus two helper buttons:
  - WhatsApp 48px green-tinted `MessageCircle` icon "Open WhatsApp"
  - Email 48px outlined `Mail` icon "Open email draft"
  - Both open in new tab via `wa.me/<phone>?text=…` and `mailto:` respectively.
- Close = "Done" 48px ink button → routes admin to `/admin/orders/[id]`.

### Empty / loading / error states

- Picker loading: skeleton list of 4 × 64px gray bars while products fetch.
- Empty order (no lines yet): card placeholder "No items yet. Search a product above or add a custom line." with `ShoppingBag` 32px slate icon.
- Submit error: red-50 banner above totals card with red-600 message + retry button.

---

## Surface 2 — `/payment-links/[token]` (extended public draft page)

### Layout

- Single-column, max-width 640px on desktop, full-width on mobile.
- Existing brand-cream background, ink text.
- Header: small "3D Ninjaz" logo (32×32) + "Order #PN-XXXXXXXX" + status pill.

### Order summary card

- 2px slate-200 border, 16px padding.
- Items list (reusing existing line render): product name, variant/config caption, qty × price.
- Bank-transfer flow MUST show item rows server-side from real `order_items` (D-02 in CONTEXT).
- Totals block at bottom (subtotal / shipping / discount / **Total**), tabular numerals.

### Method picker (two cards)

- Side-by-side cards on ≥768px, stacked on <768px.
- Each card 60px min-height when collapsed: brand icon (24px) + method name + 1-line tagline + right-side chevron.
  - PayPal card: blue brand colour border + `Wallet` Lucide icon.
  - Bank Transfer card: purple brand border + `Landmark` Lucide icon.
- Click-to-expand: clicked card's body slides open (250ms); the other card stays visible but collapses any expanded body.
- **Active card** signal: 2px brand border (blue or purple), check-mark badge in top-right corner.

### PayPal expanded body

- Mounts existing `PaymentLinkIsland` (unchanged).
- Single 60px Smart Button, full-width on mobile.

### Bank Transfer expanded body

- Bank details list, each row is a copy-to-clipboard chip:
  - **Bank name** chip
  - **Account number** chip (monospace, larger 18px text)
  - **Account holder** chip
  - **Amount due** chip (BIG: 24px Chakra Petch bold, green-700 text, MYR prefix)
- Copy button on each row: 40px Lucide `Copy` icon button; on click → swap to `Check` icon (green) for 1.5s.
- Below details: instruction text 14px slate-700 "Transfer the exact amount to the account above. Snap a clear photo of the receipt and upload it here."
- **Slip upload zone:**
  - Drop-zone card with dashed 2px purple border, 24px padding, 160px min-height.
  - Lucide `UploadCloud` 32px icon centre, "Tap to upload or drop a file" label.
  - Subtext: "JPG / PNG / WebP / HEIC / PDF · max 10 MB".
  - On select: thumbnail (image) or PDF placeholder card replaces the drop-zone, filename + size shown beneath.
  - Replace button (small outlined) below thumbnail.
- **Process button:** green 60px full-width **"Submit proof of payment"** — disabled until file picked + size/type valid; spinner during upload (XHR progress UI from memory `project_image_upload_pipeline`).

### Bank-empty-state (D-16)

- Bank Transfer card NOT rendered. Only the PayPal card shows. No "disabled" treatment.

### Post-upload "being reviewed" state

- Replace entire method-picker zone with a success card:
  - Top: green 56px `CheckCircle2` icon + "Proof received".
  - Sub: "Admin will confirm within 24 hours. We'll update you on WhatsApp."
  - Below: re-display the order summary + bank details (read-only chips) + uploaded thumbnail (small 96px) so customer can re-verify.
  - Bottom: outlined WhatsApp deeplink button "Message us if you have questions" (uses store_settings WhatsApp number).

### Rejected state (after admin rejects)

- Banner above method picker: red-50 background, red-700 text, `AlertCircle` icon, body = admin_note text + "Please upload a new payment proof."
- Bank Transfer card auto-expands, slip upload zone reset, ready for re-upload.

### Loading / error

- Upload progress: percentage bar (purple) along the bottom 4px edge of the drop-zone during XHR.
- Failed upload: red-50 banner inline above the upload zone with retry CTA.
- Token-expired / used: existing 3D Ninjaz heading "This payment link has expired" page (unchanged).

---

## Surface 3 — `/admin/orders/[id]` (extended)

### New "Payment Proof" section

- Position: between existing "Customer & shipping" card and "Order timeline" card.
- Card has 2px slate-200 border, 16px padding, H3 "Payment proof" in Chakra Petch.
- **Only renders when at least one `payment_proofs` row exists for the order** (server-side check).

### Latest proof block (prominent)

- Layout: 256×256 thumbnail (left, 12px radius even though we use 4px elsewhere — fits the thumbnail "photo" feel; rest of UI stays 4px) · metadata column (right).
  - Thumbnail clickable → opens lightbox.
  - For PDF: render `FileText` 48px icon centred on a cream 256×256 card with the filename below.
- Metadata column (vertical stack, 8px gap):
  - **Status pill** at top (amber for pending, green for approved, red for rejected).
  - Uploader row: `User` icon + "Customer" or `Shield` icon + "Admin: <name>".
  - Upload time: `Clock` icon + relative time + absolute on hover.
  - File size: `HardDrive` icon + "2.4 MB" + MIME type.
  - **Expected amount** in BIG: 28px Chakra Petch bold, green-700 text, MYR prefix — visually the loudest element in the block so admin's eye lands on it instantly when comparing to the slip.

### Action buttons (sticky bottom of card)

- Two buttons side-by-side, both 60px:
  - **Confirm Payment** green primary, `CheckCircle2` icon at left.
  - **Reject** red outlined (text red-700, border red-300, hover red-50 fill), `XCircle` icon at left.
- Both buttons only render when latest proof status is `pending`.
- On confirm: optimistic green flash + status pill swaps to `approved` + section collapses to a thin summary row.

### Reject modal

- Centred z-40 modal, max-width 480px.
- Header H3 "Reject this payment proof".
- Body: 80px-tall textarea required, placeholder "Tell the customer what went wrong. e.g. 'Slip shows RM 90 but order is RM 120 — please re-upload the correct receipt.'" — minLength 8, server validates non-empty.
- Footer: outlined "Cancel" 48px + red 48px "Confirm rejection". Confirm disabled while textarea empty.

### History (collapsed list)

- Below the prominent block, a `Disclosure` (Base UI) that opens to show older proofs as compact rows:
  - 56px row · 40×40 thumb · status pill · uploaded-by · timestamp · `ChevronRight` to open lightbox.

### Lightbox (z-50)

- Full-screen modal, semi-opaque ink/95 backdrop.
- ≥768px two-pane layout:
  - **Left 75%:** image fills, contain (preserve aspect), 24px padding from viewport edges.
  - **Right 25%:** metadata sidebar with cream background, 24px padding, vertical scroll if overflowing.
  - Sidebar content: file name (16px), upload time, uploaded by, MIME type, file size, then **EXPECTED AMOUNT** as 40px Chakra Petch bold green-700 (`MYR 120.00`), then sub-label "Order total — confirm slip matches".
- <768px: single-pane image full-bleed, metadata as a sticky bottom sheet (40% viewport height, drag-to-collapse via Vaul).
- Close affordances: top-right `X` 48px button, `Esc` key, backdrop click.
- Keyboard: `←/→` navigates between proofs in the order's history (when ≥2 exist).

### Download Invoice button

- Sits in the top-right of the order detail page header (existing layout): outlined ink 48px button with `FileDown` icon + label "Download Invoice (PDF)".
- Opens `/orders/[id]/invoice.pdf` in a new tab (`target="_blank" rel="noopener"`).

---

## Surface 4 — `/admin/orders` (extended)

### Status filter chip row

- Existing filter chip row gains a new chip:
  - Label: **"Awaiting payment review"**
  - Colour: amber-50 background, amber-700 text, amber-300 border.
  - Right-side count badge: `inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-xs font-bold` showing the count of orders in `awaiting_payment_review` status.
  - Active state (filter applied): amber-500 background, white text, no border colour change.

### Row enhancements (when filter applied)

- Each row in this filter gets a 24×24 thumbnail of the latest pending slip at the left edge (replaces the standard order icon). Click thumbnail = open lightbox in place; click row body = navigate to `/admin/orders/[id]`.

### Sidebar nav badge

- Existing sidebar item "Orders" picks up a small pill badge to the right of the label:
  - `inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-white text-xs font-bold` — count of pending `awaiting_payment_review`.
  - Reuses Phase 7 07-06 badge-switch driver (`item.badge` key).

---

## Surface 5 — `/admin/settings` (extended)

### Bank Details fieldset

- Position: below existing "Contact" fieldset, above "Socials".
- Fieldset H2 "Bank details" + helper "Customers see these on the draft-order Bank Transfer card. Leave blank to hide the Bank Transfer option."
- Three stacked inputs at 48px:
  - **Bank name** (`Landmark` Lucide prefix icon)
  - **Account number** (`Hash` prefix icon, monospace input font)
  - **Account holder** (`User` prefix icon)
- "Clear all bank details" outlined ink 40px button below the three inputs — explicit zeroing-out is one click.

### Draft Link Template fieldset

- Position: below Bank Details.
- Fieldset H2 "Draft order message template" + helper "Used when sending a draft order via WhatsApp or email. Mustache-style placeholders supported."
- Token chips row (read-only pills, 32px): `{{customer_name}}` `{{order_number}}` `{{total}}` `{{link}}` — clicking a chip inserts the token at the current cursor position in the textarea.
- 120px tall textarea, monospace `font-mono` 14px.
- Live preview card below the textarea: renders the template with sample data, brand-cream background, 4px border, 16px padding. Updates on each keystroke.
- "Reset to default" outlined 40px button at the bottom.

---

## Cross-surface conventions

### Buttons (locked palette)

| Intent | Style | Min height | Example |
|--------|-------|-----------|---------|
| Primary CTA | bg `brand-blue` text white | 60px (mobile primary), 48px (desktop) | Submit order, Pay now |
| Confirm/Success | bg `brand-green` text white | 60px / 48px | Confirm Payment, Send to customer |
| Destructive | text red-700, border red-300, hover bg red-50 | 48px | Reject, Delete |
| Secondary | text ink, border slate-300, hover bg slate-50 | 48px | Cancel, No keep as pending |
| Tertiary/Icon | no border, text ink, hover bg slate-100 | 40px | Copy chip, history toggle |

### Pills + chips

- 28px tall · 12px horizontal pad · 4px radius · 12px text · font-weight 600.
- Colour pairs: amber-50/700 (pending), green-50/700 (paid/approved), red-50/700 (rejected), blue-50/700 (info), purple-50/700 (draft sent), slate-50/700 (default).

### Forms

- Always paired `<label>` (visible) + input. Placeholder never replaces label (UX rule §3).
- 48px input height. Border slate-300 → blue-500 on focus. Error border red-500 + helper text red-600 below.
- Required asterisk in red-600 inside the label, not on the input.

### Skeletons (loading)

- Match exact layout dimensions. Use `bg-slate-100` + 200ms shimmer (linear-gradient sweep). No spinning circles inside cards — reserve spinner for buttons only.

### Toasts

- Top-right, max-width 360px, slide-in 200ms, 4s dismiss, swipe-to-dismiss on mobile.

### Mobile breakpoints

- 375px (iPhone SE) · 390px (iPhone 12+) · 768px (iPad portrait) · 1024px (laptop) · 1440px (desktop). Test all five for POS + draft page.

### Animation budget

- 150-200ms colour/opacity transitions everywhere.
- 250ms row-expansion / card-expansion height transitions.
- `prefers-reduced-motion`: drop the height/slide transitions; keep colour transitions.

### Accessibility

- Every interactive element keyboard reachable.
- Lightbox traps focus while open; returns focus to the thumbnail on close.
- `aria-label` on every icon-only button.
- Status pill colour is paired with text — never colour alone.
- Form errors `aria-describedby` linked to the error text.

---

## Anti-patterns (do NOT do)

- No emoji icons. Lucide only.
- No rounded-lg / rounded-xl / rounded-full anywhere except (a) the slip thumbnail (12px) for the photo feel and (b) badge counters (`rounded-full`).
- No `scale-` hover effects on interactive cards (memory `feedback_zindex_click_intercept`).
- No new colours outside the locked palette + slate/red/amber tiers.
- No layout shift on hover (border colour change OK; padding/size changes NOT OK).
- No customer autosave anywhere (memory `feedback_no_customer_autosave`).
- No coupon UI on the draft page — coupons applied admin-side at POS submit only.

---

*Phase: 20-admin-pos-draft-order-flow*
*UI spec gathered: 2026-05-17*
*Style locked: Sharp Playful (3D Ninjaz house)*
*Next step: re-run `/gsd-plan-phase 20` — plan-phase will detect UI-SPEC and continue to planner.*
