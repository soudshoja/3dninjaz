---
title: Store settings — where to configure everything
category: Operations
tags: [settings, configuration, store]
order: 2
---

# Store settings — where to configure everything

The Settings page (`/admin/settings`) is the central place to configure your store's identity, contact information, tax, shipping threshold, and cost defaults.

## Sections on the Settings page

### Business info

- **Business name** — shown in emails, footer, and page titles
- This is required and cannot be left blank

### Social & Contact

- **Contact email** — where customer queries go (shown on the Contact page)
- **Contact phone** — optional phone number shown as a `tel:` link
- **WhatsApp number** — digits only (e.g., `60167203048`), used to build `wa.me/` links
- **WhatsApp display** — the formatted version shown to customers (e.g., `+60 16 720 3048`)
- **Social platform URLs** — one field per platform; leave blank to hide that platform's icon

### Announcement banner

- **Banner text** — a short message shown at the top of every storefront page (e.g., "Free shipping over MYR 200!")
- **Show banner** checkbox — enable/disable the banner without deleting the text

### Free-shipping threshold

- Orders above this MYR amount get free shipping
- Leave blank to disable free shipping

### SST settings

- **Apply SST** toggle — off by default
- **SST rate (%)** — set when you register for SST (Malaysia's Sales and Services Tax)
- Only enable this if your accountant says you need to collect SST

### Cost defaults

Used as fallback rates for the profit calculator on all products:
- Filament cost per kg (MYR)
- Electricity cost per kWh (MYR)
- Printer power draw (kWh/hr)
- Labor rate per hour (MYR)
- Overhead % (covers packaging, consumables, etc.)

Individual product variants can override these per-size.

## Saving changes

Click **Save settings** at the bottom. Changes propagate to the storefront within approximately 60 seconds (the settings are cached).

**Admin page:** `/admin/settings`
