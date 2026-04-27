---
title: Made-to-Order Products
category: Products
tags: [configurable, made-to-order, configurator, tier-pricing, keychain]
order: 9
---

# Made-to-Order Products

A **made-to-order** product is one the customer composes themselves before buying. Instead of picking a pre-built variant (Size: Medium / Colour: Red), the customer fills in a form — typing their name, picking colours, choosing options — and the system calculates a price from your tier table. The Custom Name Keychain is the canonical example: the customer types up to 8 letters and the price scales with how many letters they need.

Made-to-order products have no stock count, no variants, and no SKU. Every order is unique.

## When to use

| Stocked product | Made-to-Order product |
|---|---|
| Pre-built items on a shelf | Customer composes the order at purchase time |
| Has variants, stock counts, SKUs | No stock count, no variants |
| Examples: T-shirt, vending toy, figurine | Examples: Custom name keychain, engraved tag |
| Managed via the Variant editor | Managed via the Configurator builder |
| Price is per variant | Price is per tier (e.g. per letter count) |

Use **Stocked** when you print a finite set of combinations in advance. Use **Made-to-Order** when every unit is customised and you only print after the order arrives.

## Step 1 — Choose product type at creation

When you open `/admin/products/new`, the first card is **Product Type**. Select **Made-to-Order (Configurable)**. This choice is locked once the product has config fields attached — if you need to switch, create a new product instead.

After saving the basic info, the form shows a **Manage Configurator** button instead of a Variants link. Click it to build the form your customers will fill in.

## Step 2 — Upload display images

Upload photos from the **Images** card on the product edit page. There is no count limit — upload as many angles as you like (4–8 is recommended for best customer experience).

Each image has an optional **Caption** input (shown below the image on the product page). Captions help customers understand what they are looking at — for the keychain, you might add "Red base, white letters — JACOB" so they can visualise a real example.

Images are automatically compressed through the Sharp pipeline into WebP and AVIF at multiple widths (400 px, 480 px, 800 px, 960 px, 1440 px, 1600 px), so customers on mobile get fast-loading thumbnails and desktop customers get sharp hero images.

The first image you upload becomes the **primary display image** shown on the shop listing card and as the default PDP hero. On the PDP, customers can also switch to a **live preview** ("Yours" thumbnail) that shows a real-time SVG render of their name in their chosen colours.

## Step 3 — Build the configurator

Go to `/admin/products/[id]/configurator`. Click **Add field** to open the field builder. Four field types are available:

| Field type | Use it for | Key settings |
|---|---|---|
| **Text** | Names, words, short messages | Max length, allowed characters (e.g. A-Z), uppercase toggle, profanity filter |
| **Number** | Quantities, sizes given as numbers | Min, max, step |
| **Colour** | Filament colour picker | Allowed colour IDs from the library |
| **Select** | Dropdown choice from a fixed list | Options with optional price add-ons |

For the Custom Name Keychain, the configurator has three fields in order:
1. **Your name** — Text, max 8 characters, A–Z only, uppercase, profanity check on
2. **Base + chain colour** — Colour, limited to 5 colours (Red, Black, White, Blue, Green)
3. **Letter colour** — Colour, limited to 3 high-contrast colours (White, Gold, Black)

Drag fields to reorder them. The order you set here is the order the customer fills in.

Colour fields draw from the [Colour Library](/admin/guide/products/colours) seeded from your Bambu and Polymaker catalogues. When you add a colour field, you choose which library colours to expose — you can limit to a subset (e.g. only the filaments you currently stock) or allow the full library.

## Step 4 — Set pricing tiers

Still on the configurator page, scroll to **Pricing Tiers**. Set:

- **Max unit count** — the highest value you will price (e.g. 8 for an 8-letter keychain)
- **Unit field** — which text field drives the tier lookup (the field label, e.g. "name")
- **Price per tier** — enter the MYR price for each count from 1 to max

For the Custom Name Keychain the tiers are:
`1 letter → MYR 7 · 2 → MYR 9 · 3 → MYR 12 · 4 → MYR 15 · 5 → MYR 18 · 6 → MYR 22 · 7 → MYR 26 · 8 → MYR 30`

If you later reduce the max, the system prompts you to confirm — tiers beyond the new max are removed. If you cancel the prompt, the existing tiers are preserved.

The shop listing card shows **"From MYR 7.00"** (the tier-1 price) so customers see the entry price at a glance.

## Step 5 — Test the customer flow

Visit `/products/custom-name-keychain` (or your product's slug) to preview the PDP as a customer.

- Type letters in the name field → the price meter updates in real time and the hero image switches to the live SVG preview
- Click **Display** in the thumbstrip → reverts to the admin's product photo
- Click **Yours** → returns to the live preview
- Pick a different base colour → the SVG preview updates colour immediately
- Click **Add to bag** (enabled only when all required fields are filled and a valid price is resolved)

## Cart behaviour

The cart identifies configurable line items by a hash of their configuration (product ID + values). If the same customer adds the exact same configuration twice, the quantity bumps to 2 instead of creating a new line. Different configurations (different name, different colour) create separate lines.

Configuration details appear in the cart drawer and checkout summary.

## Order fulfillment

When an order comes in, open `/admin/orders/[id]`. Each line item that is a made-to-order product shows:

- The configuration summary (e.g. "JACOB (5 letters) · Red base+chain · White letters")
- An expandable **Configuration JSON** panel with the raw field values if you need to verify details

The invoice PDF shows a summary column for made-to-order items. The order confirmation email sent to the customer also lists their configuration so they can verify what they ordered.

## FAQ

**Can I flip a stocked product to made-to-order?**
Not while the product has variants attached. The type lock prevents accidental data loss. Create a new made-to-order product instead — you can deactivate the old stocked product and activate the new one at the same time.

**What happens if I delete a config field?**
The field disappears from the PDP form immediately. Existing orders are unaffected — each order stores a snapshot of the configuration values at purchase time. The order detail page renders from that snapshot, not from the live field definition.

**Can a colour field show all library colours?**
Yes — add every colour ID to the `allowedColorIds` list, or leave it empty (the field then falls back to showing all active library colours, depending on how the UI handles an empty list). A future "Use entire library" shortcut in the field builder UI is planned.

**How do I know what to print?**
Open the order detail in `/admin/orders/[id]`. Expand the **Configuration** panel under each made-to-order line item to see the raw values. The configuration summary (e.g. "JACOB · Red · White") is also printed on the invoice PDF for physical reference.

---

See also:
- [Photos and image pipeline](/admin/guide/products/photos)
- [Colour Library](/admin/guide/products/colours)
- [Options, values, and variants](/admin/guide/products/variants-sizes) — for comparison with the stocked product path
