---
title: Colour Management
section: products
order: 4
---

# Colour Management

The Colour Library is the central catalogue every product variant pulls from when you offer different colour options. It lives at `/admin/colours` and ships pre-seeded with ~351 colours imported from the Bambu and Polymaker reference sheets — so most of the time you are picking, not creating.

## What the Colour Library is

A single source of truth for every filament colour you stock. Each row stores a name, a hex value, a brand (Bambu / Polymaker / Other), a family (PLA, PETG, etc.), an optional sourcing code, and an optional `previous_hex` for tracking shade revisions. The library was seeded once from the manufacturer HTML files; from here on, you grow it manually.

## Adding a colour to a product

When you add a variant axis named **Color** (or **Colour**) on a product, the variant editor surfaces a **Pick from library** button. Click it to open the picker modal. Tick the colours you want, then **Add N colours** — variants regenerate automatically with the standard size matrix.

If a colour you want is not in the library yet, the existing **Custom (not in library)** path still works for one-off freeform values. Use it sparingly — anything you stock more than once should live in the library.

## Search and filter in the picker

Type into the search box to match across name, brand, family, and code. The **Brand** and **Family** dropdowns intersect with the search — pick "Bambu" + "PLA" + type "black" and you will see exactly Bambu PLA blacks. Colours already attached to the product show greyed out with an **Already attached** label, so you cannot add the same one twice.

## Editing a library colour

Open `/admin/colours/[id]/edit`. When you change a colour's name or hex, the system runs a **cascade rename** — every linked product variant updates in the same transaction. If anyone manually retyped a value on a specific product (so it diverged from the library), that manual edit is **preserved**. Cascade rename is diff-aware: it only touches variants that still match the old value.

For safety, edits that would cascade to more than 1000 variants pop a confirmation gate first.

## Archiving vs deleting

**Archive** is a soft hide — the colour disappears from the picker, but existing product variants keep working. Use this when a colour is being phased out but old products still ship.

**Delete** is hard, and is **blocked** if any product is using the colour. The block dialog lists the affected products with links and offers an **Archive instead** recovery action. You almost always want Archive.

## What customers see on the PDP

Customers see a 32px coloured swatch with the colour name caption **always visible** — no hover required. The selected swatch thickens its caption; out-of-stock swatches show a line-through. Internal sourcing codes (Bambu RFID, Polymaker SKU) are admin-only and never appear in customer HTML.

## /shop colour filter

The shop sidebar shows a **Colour** accordion listing every colour used by at least one active product. Customers can multi-select via chip clicks; the URL syncs as `?colour=galaxy-black,jade-white`, and the filter intersects with the existing category filter.

## Adding new colours manually

On `/admin/colours`, click **+ New colour**. Provide a name and hex (the native colour picker is wired in), pick the brand and family, and optionally fill in a sourcing code or `previous_hex`. The slug is derived automatically from the name. If a Bambu and a Polymaker colour share the same name, the slugs auto-suffix with `-bambu` / `-polymaker` so they never collide.

## Tips and gotchas

- **Codes are for sourcing only.** Bambu RFID and Polymaker SKU live on the admin row so you can restock — customers never see them.
- **Cascade rename respects manual edits.** If a product has a hand-typed value that no longer matches the library, the cascade leaves it alone. Reconcile manually if you want them back in sync.
- **The 1000-row gate is a safety net.** If you ever see it, double-check you renamed the right colour before confirming.
- **The library is seeded once.** There is no live re-import from Bambu or Polymaker by design — new colours are added manually so you stay in control of the catalogue.
- **Archive when in doubt.** Deletion is destructive and blocked anyway; Archive is reversible from the same admin page.
