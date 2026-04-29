/**
 * keychain-fields.ts
 *
 * Helper that inserts the 4 fixed config fields for a keychain product:
 *   position 0 — text  "Your name"       (maxLength:8, A-Z, uppercase, profanityCheck)
 *   position 1 — colour "Base colour"     (base palette)
 *   position 2 — colour "Clicker colour"  (clicker palette)
 *   position 3 — colour "Letter colour"   (letter palette)
 *
 * Used by:
 *   - scripts/migrate-pancake-clicker-to-keychain.ts  (one-off migration)
 *   - Admin product-form save flow when productType='keychain' is created
 *
 * Idempotency: callers are responsible for deleting existing rows before
 * calling this (or ensuring the product has no rows yet). The function does
 * a clean insert — it does NOT check for duplicates itself.
 *
 * Returns the UUID of the text field (used as unitField on the product row).
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
): Promise<string> {
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

  const baseIds    = resolveIds(BASE_COLOUR_NAMES,    "Base colour");
  const clickerIds = resolveIds(CLICKER_COLOUR_NAMES, "Clicker colour");
  const letterIds  = resolveIds(LETTER_COLOUR_NAMES,  "Letter colour");

  log(`resolved base(${baseIds.length}) clicker(${clickerIds.length}) letter(${letterIds.length}) colour ids`);

  // ── Insert 4 fields ───────────────────────────────────────────────────────

  // Field 0 — text: "Your name"
  const textFieldId = randomUUID();
  await db.insert(productConfigFields).values({
    id: textFieldId,
    productId,
    position: 0,
    fieldType: "text",
    label: "Your name",
    helpText: "Letters A–Z only (uppercase), max 8 characters.",
    required: true,
    configJson: JSON.stringify({
      maxLength: 8,
      allowedChars: "A-Z",
      uppercase: true,
      profanityCheck: true,
    }),
  });
  log(`  text field "${textFieldId}" (Your name)`);

  // Field 1 — colour: "Base colour"
  const baseFieldId = randomUUID();
  await db.insert(productConfigFields).values({
    id: baseFieldId,
    productId,
    position: 1,
    fieldType: "colour",
    label: "Base colour",
    helpText: "The outer shell of each keycap.",
    required: true,
    configJson: JSON.stringify({ allowedColorIds: baseIds }),
  });
  log(`  colour field "${baseFieldId}" (Base colour, ${baseIds.length} colours)`);

  // Field 2 — colour: "Clicker colour"
  const clickerFieldId = randomUUID();
  await db.insert(productConfigFields).values({
    id: clickerFieldId,
    productId,
    position: 2,
    fieldType: "colour",
    label: "Clicker colour",
    helpText: "The inset pressable face on each keycap.",
    required: true,
    configJson: JSON.stringify({ allowedColorIds: clickerIds }),
  });
  log(`  colour field "${clickerFieldId}" (Clicker colour, ${clickerIds.length} colours)`);

  // Field 3 — colour: "Letter colour"
  const letterFieldId = randomUUID();
  await db.insert(productConfigFields).values({
    id: letterFieldId,
    productId,
    position: 3,
    fieldType: "colour",
    label: "Letter colour",
    helpText: "High-contrast subset for letter legibility. Choose a colour that pops against your base.",
    required: true,
    configJson: JSON.stringify({ allowedColorIds: letterIds }),
  });
  log(`  colour field "${letterFieldId}" (Letter colour, ${letterIds.length} colours)`);

  log(`done — 4 fields inserted for product ${productId}. unitField = ${textFieldId}`);

  return textFieldId;
}
