/**
 * keychain-fields.ts
 *
 * Helper that inserts the 3 fixed (locked) colour config fields for a keychain
 * product:
 *   position 0 — colour "Base"    (locked: true)
 *   position 1 — colour "Clicker" (locked: true)
 *   position 2 — colour "Letter"  (locked: true)
 *
 * The admin text field (e.g. "Your name") is NOT seeded here — admin adds it
 * via "Add field" if personalisation is needed.
 *
 * Used by:
 *   - scripts/migrate-pancake-clicker-to-keychain.ts  (one-off migration)
 *   - Admin product-form save flow when productType='keychain' is created fresh
 *
 * Idempotency: callers are responsible for ensuring the product has no core
 * colour rows yet before calling this. The function does a clean insert — it
 * does NOT check for duplicates itself.
 *
 * Returns void. The caller no longer needs a unitField UUID from here.
 */

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { productConfigFields, colors } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const BASE_COLOUR_NAMES    = ["Red", "Black", "White", "Blue", "Green"];
const CLICKER_COLOUR_NAMES = ["Red", "Black", "White", "Blue", "Green"];
const LETTER_COLOUR_NAMES  = ["White", "Gold", "Black"];

export async function seedKeychainFields(
  productId: string,
  options?: { silent?: boolean },
): Promise<void> {
  const log = options?.silent
    ? () => {}
    : (msg: string) => console.log(`[keychain-fields] ${msg}`);

  // ── Resolve colour ids from the library ──────────────────────────────────
  const colourRows = await db
    .select({ id: colors.id, name: colors.name })
    .from(colors);

  const byName = new Map(colourRows.map((c) => [c.name, c.id]));

  function resolveIds(names: string[], fieldLabel: string): string[] {
    const ids = names.map((n) => byName.get(n)).filter(Boolean) as string[];
    const missing = names.filter((n) => !byName.has(n));
    if (missing.length > 0) {
      console.warn(
        `[keychain-fields] missing colours for "${fieldLabel}": ${missing.join(", ")} — run seed-colours.ts first`,
      );
    }
    return ids.length > 0 ? ids : ["placeholder-run-seed-colours-first"];
  }

  const baseIds    = resolveIds(BASE_COLOUR_NAMES,    "Base");
  const clickerIds = resolveIds(CLICKER_COLOUR_NAMES, "Clicker");
  const letterIds  = resolveIds(LETTER_COLOUR_NAMES,  "Letter");

  log(`resolved base(${baseIds.length}) clicker(${clickerIds.length}) letter(${letterIds.length}) colour ids`);

  // ── Insert 3 locked colour fields ─────────────────────────────────────────

  // Field 0 — colour: "Base" (locked)
  const baseFieldId = randomUUID();
  await db.insert(productConfigFields).values({
    id: baseFieldId,
    productId,
    position: 0,
    fieldType: "colour",
    label: "Base",
    helpText: "The outer shell of each keycap.",
    required: true,
    locked: true,
    configJson: JSON.stringify({ allowedColorIds: baseIds }),
  });
  log(`  colour field "${baseFieldId}" (Base, ${baseIds.length} colours, locked)`);

  // Field 1 — colour: "Clicker" (locked)
  const clickerFieldId = randomUUID();
  await db.insert(productConfigFields).values({
    id: clickerFieldId,
    productId,
    position: 1,
    fieldType: "colour",
    label: "Clicker",
    helpText: "The inset pressable face on each keycap.",
    required: true,
    locked: true,
    configJson: JSON.stringify({ allowedColorIds: clickerIds }),
  });
  log(`  colour field "${clickerFieldId}" (Clicker, ${clickerIds.length} colours, locked)`);

  // Field 2 — colour: "Letter" (locked)
  const letterFieldId = randomUUID();
  await db.insert(productConfigFields).values({
    id: letterFieldId,
    productId,
    position: 2,
    fieldType: "colour",
    label: "Letter",
    helpText: "High-contrast subset for letter legibility. Choose a colour that pops against your base.",
    required: true,
    locked: true,
    configJson: JSON.stringify({ allowedColorIds: letterIds }),
  });
  log(`  colour field "${letterFieldId}" (Letter, ${letterIds.length} colours, locked)`);

  log(`done — 3 locked colour fields inserted for product ${productId}`);
}
