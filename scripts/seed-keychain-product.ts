/**
 * Phase 19 (19-11) — Seed the Custom Name Keychain product.
 *
 * Creates:
 *   - 1 product (productType='configurable', maxUnitCount=8, priceTiers)
 *   - 3 config fields: text "Your name" + colour "Base + chain colour" + colour "Letter colour"
 *
 * Idempotent (D-15): checks for slug 'custom-name-keychain' before inserting.
 * Second run prints "already exists" and exits 0.
 *
 * Prerequisites:
 *   - Colours seeded: npx tsx scripts/seed-colours.ts
 *     (needs Red, Black, White, Blue, Green, Gold in the colours table)
 *
 * Image note: the primary image URL points to /uploads/products/seed-keychain/primary
 * which does not yet have a manifest (no real image file). Admin should upload a
 * primary image from /admin/products/[id]/edit after running this seed.
 *
 * Run: dotenv -e .env.local -- npx tsx scripts/seed-keychain-product.ts
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/lib/db";
import { products, productConfigFields, colors } from "../src/lib/db/schema";

// ─── Constants ───────────────────────────────────────────────────────────────

const SLUG = "custom-name-keychain";
const PRODUCT_NAME = "Custom Name Keychain";
const MAX_UNIT_COUNT = 8;
const PRICE_TIERS: Record<number, number> = {
  1: 7,
  2: 9,
  3: 12,
  4: 15,
  5: 18,
  6: 22,
  7: 26,
  8: 30,
};
const UNIT_FIELD = "name";

const BASE_ALLOWED_COLOUR_NAMES = ["Red", "Black", "White", "Blue", "Green"];
const LETTER_ALLOWED_COLOUR_NAMES = ["White", "Gold", "Black"];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  // ── Idempotency check ──────────────────────────────────────────────────────
  const existing = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, SLUG))
    .limit(1);

  if (existing.length > 0) {
    console.log(
      `[seed-keychain] product '${SLUG}' already exists (id=${existing[0].id}); skipping.`,
    );
    process.exit(0);
  }

  // ── Resolve colour ids from Phase 18 library ───────────────────────────────
  const colourRows = await db
    .select({ id: colors.id, name: colors.name })
    .from(colors);

  const byName = new Map(colourRows.map((c) => [c.name, c.id]));

  const baseAllowedColorIds = BASE_ALLOWED_COLOUR_NAMES.map((n) =>
    byName.get(n),
  ).filter(Boolean) as string[];

  const letterAllowedColorIds = LETTER_ALLOWED_COLOUR_NAMES.map((n) =>
    byName.get(n),
  ).filter(Boolean) as string[];

  const missingBase = BASE_ALLOWED_COLOUR_NAMES.filter((n) => !byName.has(n));
  const missingLetter = LETTER_ALLOWED_COLOUR_NAMES.filter(
    (n) => !byName.has(n),
  );

  if (missingBase.length > 0 || missingLetter.length > 0) {
    console.warn(
      `[seed-keychain] missing colours in library: ${[...missingBase, ...missingLetter].join(", ")}`,
    );
    console.warn(
      "[seed-keychain] run: dotenv -e .env.local -- npx tsx scripts/seed-colours.ts first",
    );
    console.warn(
      "[seed-keychain] proceeding with available colours — some config fields may have reduced options.",
    );
  }

  // ── Insert product ─────────────────────────────────────────────────────────
  const productId = randomUUID();

  await db.insert(products).values({
    id: productId,
    slug: SLUG,
    name: PRODUCT_NAME,
    description:
      "3D-printed personalised keychain. Type your name (max 8 letters, A–Z uppercase), choose your base+chain colour and letter colour. Made to order — ships in 5–7 working days. Each keychain is uniquely yours.",
    // Primary image URL — admin must upload a real image after seeding.
    // The URL format matches the Phase 7 pipeline: /uploads/products/<bucket>/<id>
    // Until an image is uploaded, the PDP will show a placeholder.
    images: [],
    thumbnailIndex: 0,
    materialType: "PLA",
    isActive: true,
    isFeatured: false,
    // Phase 19 (19-01) — made-to-order discriminator
    productType: "configurable",
    maxUnitCount: MAX_UNIT_COUNT,
    priceTiers: JSON.stringify(PRICE_TIERS),
    unitField: UNIT_FIELD,
  });

  console.log(`[seed-keychain] created product ${productId}`);

  // ── Insert config fields ───────────────────────────────────────────────────

  // Field 1 — Text: "Your name"
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

  console.log(`[seed-keychain]   → text field "${textFieldId}" (Your name)`);

  // Field 2 — Colour: "Base + chain colour"
  const baseFieldId = randomUUID();
  await db.insert(productConfigFields).values({
    id: baseFieldId,
    productId,
    position: 1,
    fieldType: "colour",
    label: "Base + chain colour",
    helpText:
      "The base plate and the chain ring print as the same colour — pick one.",
    required: true,
    configJson: JSON.stringify({
      allowedColorIds:
        baseAllowedColorIds.length > 0
          ? baseAllowedColorIds
          : ["placeholder-run-seed-colours-first"],
    }),
  });

  console.log(
    `[seed-keychain]   → colour field "${baseFieldId}" (Base + chain colour, ${baseAllowedColorIds.length} colours)`,
  );

  // Field 3 — Colour: "Letter colour"
  const letterFieldId = randomUUID();
  await db.insert(productConfigFields).values({
    id: letterFieldId,
    productId,
    position: 2,
    fieldType: "colour",
    label: "Letter colour",
    helpText:
      "High-contrast subset for letter legibility. Choose a colour that pops against your base.",
    required: true,
    configJson: JSON.stringify({
      allowedColorIds:
        letterAllowedColorIds.length > 0
          ? letterAllowedColorIds
          : ["placeholder-run-seed-colours-first"],
    }),
  });

  console.log(
    `[seed-keychain]   → colour field "${letterFieldId}" (Letter colour, ${letterAllowedColorIds.length} colours)`,
  );

  console.log(
    `[seed-keychain] done — product '${SLUG}' created with 3 config fields.`,
  );
  console.log(
    `[seed-keychain] Next step: upload a primary image at /admin/products/${productId}/edit`,
  );
  process.exit(0);
}

run().catch(async (err) => {
  console.error("[seed-keychain] failed:", err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
