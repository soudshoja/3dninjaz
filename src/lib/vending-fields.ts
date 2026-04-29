/**
 * vending-fields.ts
 *
 * Inserts the 2 fixed (locked) config fields for a vending-machine product:
 *   position 0 — colour "Primary"   (locked: true) — body / back panel / honeycomb screen
 *   position 1 — colour "Secondary" (locked: true) — frame / dispenser knob / tray / base
 *
 * Allowed-colour palette is seeded EMPTY on purpose — admin manually adds
 * each colour from the colour gallery via the configurator UI. The product
 * cannot be ordered until at least one colour is added per slot.
 *
 * Used by:
 *   - Admin product-form save flow when productType='vending' is created fresh
 *   - scripts/seed-vending-product.ts
 *
 * Idempotency: callers ensure the product has no core rows yet before calling.
 */

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { productConfigFields } from "@/lib/db/schema";

export async function seedVendingFields(
  productId: string,
  options?: { silent?: boolean },
): Promise<void> {
  const log = options?.silent
    ? () => {}
    : (msg: string) => console.log(`[vending-fields] ${msg}`);

  // Field 0 — colour: "Primary" (locked, EMPTY palette — admin curates)
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
    configJson: JSON.stringify({ allowedColorIds: [] }),
  });
  log(`  colour field "${primaryFieldId}" (Primary, EMPTY — admin curates, locked)`);

  // Field 1 — colour: "Secondary" (locked, EMPTY palette — admin curates)
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
    configJson: JSON.stringify({ allowedColorIds: [] }),
  });
  log(`  colour field "${secondaryFieldId}" (Secondary, EMPTY — admin curates, locked)`);

  log(`done — 2 locked fields inserted for product ${productId} (empty palettes — admin must add colours via configurator)`);
}
