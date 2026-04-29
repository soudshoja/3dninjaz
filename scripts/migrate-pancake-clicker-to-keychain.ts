/**
 * migrate-pancake-clicker-to-keychain.ts
 *
 * One-off idempotent migration that rewires the existing Pancake Clicker
 * product (slug: pancake-clicker-mogqlfp6) to productType='keychain' with
 * the 4-field fixed schema (text + base colour + clicker colour + letter colour).
 *
 * Safe to run multiple times — checks each step before acting.
 *
 * Prerequisites:
 *   - Colours seeded: dotenv -e .env.local -- npx tsx scripts/seed-colours.ts
 *   - Product exists:  slug = pancake-clicker-mogqlfp6
 *   - MariaDB ALTER permission on the `products` table (to add 'keychain' to enum)
 *
 * Run:
 *   dotenv -e .env.local -- npx tsx scripts/migrate-pancake-clicker-to-keychain.ts
 */

import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/lib/db";
import { products, productConfigFields } from "../src/lib/db/schema";
import { seedKeychainFields } from "../src/lib/keychain-fields";

const SLUG = "pancake-clicker-mogqlfp6";

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

const MAX_UNIT_COUNT = 8;

async function run() {
  console.log(`[migrate-clicker] starting migration for slug='${SLUG}'`);

  // ── Step 1: Find product ──────────────────────────────────────────────────
  const [product] = await db
    .select({ id: products.id, name: products.name, productType: products.productType })
    .from(products)
    .where(eq(products.slug, SLUG))
    .limit(1);

  if (!product) {
    console.error(`[migrate-clicker] ERROR: product with slug '${SLUG}' not found.`);
    console.error("[migrate-clicker] Check the slug in the DB and re-run.");
    process.exit(1);
  }

  console.log(`[migrate-clicker] found product: id=${product.id} name="${product.name}" currentType=${product.productType}`);

  // ── Step 2: ALTER enum if 'keychain' not present ──────────────────────────
  // We query SHOW CREATE TABLE to detect whether 'keychain' is already in
  // the enum. If not, we ALTER. The actual ALTER must be run manually by
  // the user — this script prints it clearly and exits if not yet applied.
  //
  // NOTE: Drizzle does not expose raw DDL introspection through its query
  // builder. We use the underlying mysql2 pool connection directly.

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query("SHOW CREATE TABLE `products`") as [Array<Record<string, string>>, unknown];
    const createSql: string = rows[0]?.["Create Table"] ?? "";
    const hasKeychain = createSql.includes("'keychain'");

    if (!hasKeychain) {
      console.error("[migrate-clicker] STOP: the products.productType enum does not yet include 'keychain'.");
      console.error("[migrate-clicker] Run this SQL on the database first, then re-run this script:");
      console.error("");
      console.error("  ALTER TABLE `products` MODIFY COLUMN `productType` ENUM('stocked','configurable','keychain') NOT NULL DEFAULT 'stocked';");
      console.error("");
      process.exit(1);
    }

    console.log("[migrate-clicker] enum already contains 'keychain' — skipping ALTER");
  } finally {
    conn.release();
  }

  // ── Step 3: Delete existing config fields (clean slate) ──────────────────
  const existingFields = await db
    .select({ id: productConfigFields.id })
    .from(productConfigFields)
    .where(eq(productConfigFields.productId, product.id));

  if (existingFields.length > 0) {
    console.log(`[migrate-clicker] deleting ${existingFields.length} existing config field(s) for clean slate...`);
    await db
      .delete(productConfigFields)
      .where(eq(productConfigFields.productId, product.id));
    console.log("[migrate-clicker] existing fields deleted");
  } else {
    console.log("[migrate-clicker] no existing config fields — nothing to delete");
  }

  // ── Step 4: Insert 4 fixed keychain fields ────────────────────────────────
  console.log("[migrate-clicker] inserting 4 keychain fields...");
  const textFieldId = await seedKeychainFields(product.id);
  console.log(`[migrate-clicker] unitField UUID = ${textFieldId}`);

  // ── Step 5: Update product row ────────────────────────────────────────────
  console.log("[migrate-clicker] updating product row...");
  await db
    .update(products)
    .set({
      productType: "keychain",
      maxUnitCount: MAX_UNIT_COUNT,
      priceTiers: JSON.stringify(PRICE_TIERS),
      unitField: textFieldId,  // UUID of the text field — NOT the label
    })
    .where(eq(products.id, product.id));

  console.log("[migrate-clicker] product row updated:");
  console.log(`  productType   = keychain`);
  console.log(`  maxUnitCount  = ${MAX_UNIT_COUNT}`);
  console.log(`  priceTiers    = ${JSON.stringify(PRICE_TIERS)}`);
  console.log(`  unitField     = ${textFieldId}`);

  console.log("");
  console.log(`[migrate-clicker] migration complete for '${SLUG}' (id=${product.id})`);
  console.log(`[migrate-clicker] Next step: visit /admin/products/${product.id}/edit to verify.`);

  await pool.end();
  process.exit(0);
}

run().catch(async (err) => {
  console.error("[migrate-clicker] failed:", err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
