/**
 * One-time repair: the initial seed-keychain-product.ts run inserted the product
 * row but failed to insert config fields (product_config_fields table didn't exist yet).
 * This script completes the seed for the existing product.
 *
 * Run ONCE then delete this file.
 * Run: npx tsx --env-file=.env.local scripts/repair-keychain-seed.ts
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/lib/db";
import { products, productConfigFields, colors } from "../src/lib/db/schema";

const SLUG = "custom-name-keychain";
const BASE_ALLOWED_COLOUR_NAMES = ["Red", "Black", "White", "Blue", "Green"];
const LETTER_ALLOWED_COLOUR_NAMES = ["White", "Gold", "Black"];

async function run() {
  const existing = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, SLUG))
    .limit(1);

  if (existing.length === 0) {
    console.log("[repair] product not found — run seed-keychain-product.ts first");
    process.exit(1);
  }

  const productId = existing[0].id;
  console.log("[repair] found product:", productId);

  const existingFields = await db
    .select({ id: productConfigFields.id })
    .from(productConfigFields)
    .where(eq(productConfigFields.productId, productId));

  if (existingFields.length >= 3) {
    console.log("[repair] already has", existingFields.length, "fields — no-op");
    process.exit(0);
  }

  if (existingFields.length > 0) {
    console.log("[repair] deleting", existingFields.length, "partial fields before re-insert");
    // Delete any partial fields
    for (const f of existingFields) {
      await db.delete(productConfigFields).where(eq(productConfigFields.id, f.id));
    }
  }

  const colourRows = await db.select({ id: colors.id, name: colors.name }).from(colors);
  const byName = new Map(colourRows.map((c) => [c.name, c.id]));
  const baseAllowedColorIds = BASE_ALLOWED_COLOUR_NAMES.map((n) => byName.get(n)).filter(Boolean) as string[];
  const letterAllowedColorIds = LETTER_ALLOWED_COLOUR_NAMES.map((n) => byName.get(n)).filter(Boolean) as string[];

  const textFieldId = randomUUID();
  await db.insert(productConfigFields).values({
    id: textFieldId,
    productId,
    position: 0,
    fieldType: "text",
    label: "Your name",
    helpText: "Letters A–Z only (uppercase), max 8 characters.",
    required: true,
    configJson: JSON.stringify({ maxLength: 8, allowedChars: "A-Z", uppercase: true, profanityCheck: true }),
  });
  console.log("[repair] → text field created");

  const baseFieldId = randomUUID();
  await db.insert(productConfigFields).values({
    id: baseFieldId,
    productId,
    position: 1,
    fieldType: "colour",
    label: "Base + chain colour",
    helpText: "The base plate and chain ring print as the same colour.",
    required: true,
    configJson: JSON.stringify({ allowedColorIds: baseAllowedColorIds.length > 0 ? baseAllowedColorIds : [] }),
  });
  console.log("[repair] → base colour field created");

  const letterFieldId = randomUUID();
  await db.insert(productConfigFields).values({
    id: letterFieldId,
    productId,
    position: 2,
    fieldType: "colour",
    label: "Letter colour",
    helpText: "High-contrast subset for letter legibility.",
    required: true,
    configJson: JSON.stringify({ allowedColorIds: letterAllowedColorIds.length > 0 ? letterAllowedColorIds : [] }),
  });
  console.log("[repair] → letter colour field created");

  console.log("[repair] done — 3 config fields added to", productId);
  process.exit(0);
}

run().catch(async (err) => {
  console.error("[repair] failed:", err);
  await pool.end();
  process.exit(1);
});
