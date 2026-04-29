/**
 * vending-fields.ts
 *
 * Inserts the 2 fixed (locked) config fields for a vending-machine product:
 *   position 0 — colour "Primary"   (locked: true) — body / back panel / honeycomb screen
 *   position 1 — colour "Secondary" (locked: true) — frame / dispenser knob / tray / base
 *
 * Allowed-colour palette is seeded with EVERY currently-seeded colour. Admin
 * prunes per slot via the configurator UI ("colour gallery").
 *
 * Used by:
 *   - Admin product-form save flow when productType='vending' is created fresh
 *   - scripts/seed-vending-product.ts
 *
 * Idempotency: callers ensure the product has no core rows yet before calling.
 */

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { productConfigFields, colors } from "@/lib/db/schema";

export async function seedVendingFields(
  productId: string,
  options?: { silent?: boolean },
): Promise<void> {
  const log = options?.silent
    ? () => {}
    : (msg: string) => console.log(`[vending-fields] ${msg}`);

  const colourRows = await db
    .select({ id: colors.id, name: colors.name })
    .from(colors);

  const allColourIds = colourRows.map((c) => c.id);

  if (allColourIds.length === 0) {
    console.warn(
      "[vending-fields] no colours in library — run scripts/seed-colours.ts first",
    );
  }

  const safeIds = allColourIds.length > 0 ? allColourIds : ["placeholder-run-seed-colours-first"];

  // Field 0 — colour: "Primary" (locked)
  const primaryFieldId = randomUUID();
  await db.insert(productConfigFields).values({
    id: primaryFieldId,
    productId,
    position: 0,
    fieldType: "colour",
    label: "Primary",
    helpText: "Body, back panel, and honeycomb screen.",
    required: true,
    locked: true,
    configJson: JSON.stringify({ allowedColorIds: safeIds }),
  });
  log(`  colour field "${primaryFieldId}" (Primary, ${safeIds.length} colours, locked)`);

  // Field 1 — colour: "Secondary" (locked)
  const secondaryFieldId = randomUUID();
  await db.insert(productConfigFields).values({
    id: secondaryFieldId,
    productId,
    position: 1,
    fieldType: "colour",
    label: "Secondary",
    helpText: "Frame, dispenser knob, tray, and base.",
    required: true,
    locked: true,
    configJson: JSON.stringify({ allowedColorIds: safeIds }),
  });
  log(`  colour field "${secondaryFieldId}" (Secondary, ${safeIds.length} colours, locked)`);

  log(`done — 2 locked fields inserted for product ${productId}`);
}
