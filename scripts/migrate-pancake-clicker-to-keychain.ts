/**
 * migrate-pancake-clicker-to-keychain.ts
 *
 * Idempotent migration that rewires the existing Pancake Clicker product
 * (slug: pancake-clicker-mogqlfp6) to productType='keychain' with the 3 locked
 * core colour fields (Base, Clicker, Letter).
 *
 * Updated behaviour (post-locked-fields spec):
 *   - Does NOT delete and re-insert all fields — that would wipe admin-added extras.
 *   - For each existing field labelled "Base colour" / "Clicker colour" / "Letter colour":
 *       rename to "Base" / "Clicker" / "Letter" and set locked=1.
 *   - Leaves any other fields (e.g. "Your name" text field) untouched.
 *   - If a core colour field is missing by label, creates all 3 via seedKeychainFields().
 *   - Sets priceTiers + maxUnitCount only if currently null.
 *   - Sets unitField to the existing text field UUID if one is found, else NULL.
 *
 * Safe to run multiple times.
 *
 * Prerequisites:
 *   - Colours seeded: dotenv -e .env.local -- npx tsx scripts/seed-colours.ts
 *   - Product exists:  slug = pancake-clicker-mogqlfp6
 *   - product_config_fields table has the locked column:
 *       ALTER TABLE product_config_fields ADD COLUMN locked TINYINT(1) NOT NULL DEFAULT 0;
 *   - MariaDB ALTER permission on the `products` table (to add 'keychain' to enum)
 *
 * Run:
 *   dotenv -e .env.local -- npx tsx scripts/migrate-pancake-clicker-to-keychain.ts
 */

import "dotenv/config";
import { eq, and } from "drizzle-orm";
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

// Old label → new label mapping for the 3 core colour fields
const CORE_RENAMES: Record<string, string> = {
  "Base colour": "Base",
  "Clicker colour": "Clicker",
  "Letter colour": "Letter",
};

async function run() {
  console.log(`[migrate-clicker] starting migration for slug='${SLUG}'`);

  // ── Step 1: Find product ──────────────────────────────────────────────────
  const [product] = await db
    .select({
      id: products.id,
      name: products.name,
      productType: products.productType,
      maxUnitCount: products.maxUnitCount,
      priceTiersRaw: products.priceTiers,
      unitField: products.unitField,
    })
    .from(products)
    .where(eq(products.slug, SLUG))
    .limit(1);

  if (!product) {
    console.error(`[migrate-clicker] ERROR: product with slug '${SLUG}' not found.`);
    console.error("[migrate-clicker] Check the slug in the DB and re-run.");
    process.exit(1);
  }

  console.log(`[migrate-clicker] found product: id=${product.id} name="${product.name}" currentType=${product.productType}`);

  // ── Step 2: ALTER enum check ──────────────────────────────────────────────
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

    // Also check product_config_fields has the locked column
    const [pfRows] = await conn.query("SHOW CREATE TABLE `product_config_fields`") as [Array<Record<string, string>>, unknown];
    const pfSql: string = pfRows[0]?.["Create Table"] ?? "";
    if (!pfSql.includes("`locked`")) {
      console.error("[migrate-clicker] STOP: product_config_fields.locked column not found.");
      console.error("[migrate-clicker] Run this SQL on the database first, then re-run:");
      console.error("");
      console.error("  ALTER TABLE product_config_fields ADD COLUMN locked TINYINT(1) NOT NULL DEFAULT 0;");
      console.error("");
      process.exit(1);
    }

    console.log("[migrate-clicker] enum + locked column verified — proceeding");
  } finally {
    conn.release();
  }

  // ── Step 3: Fetch all existing config fields ──────────────────────────────
  const existingFields = await db
    .select()
    .from(productConfigFields)
    .where(eq(productConfigFields.productId, product.id));

  console.log(`[migrate-clicker] found ${existingFields.length} existing config field(s)`);

  // ── Step 4: Rename core colour fields in place (don't delete extras) ──────
  const oldLabels = Object.keys(CORE_RENAMES);
  const coreFieldsFound = existingFields.filter((f) => oldLabels.includes(f.label));
  const hasCoreFields = coreFieldsFound.length === 3;

  if (hasCoreFields) {
    console.log("[migrate-clicker] renaming 3 core colour fields to locked labels...");
    for (const field of coreFieldsFound) {
      const newLabel = CORE_RENAMES[field.label]!;
      await db
        .update(productConfigFields)
        .set({ label: newLabel, locked: true })
        .where(
          and(
            eq(productConfigFields.id, field.id),
            eq(productConfigFields.productId, product.id),
          ),
        );
      console.log(`  "${field.label}" → "${newLabel}" (locked=1)`);
    }
  } else {
    // Core fields missing by old label — check if already renamed
    const alreadyRenamed = existingFields.filter((f) =>
      ["Base", "Clicker", "Letter"].includes(f.label)
    );
    if (alreadyRenamed.length === 3) {
      console.log("[migrate-clicker] core fields already renamed — ensuring locked=1...");
      for (const field of alreadyRenamed) {
        if (!field.locked) {
          await db
            .update(productConfigFields)
            .set({ locked: true })
            .where(eq(productConfigFields.id, field.id));
          console.log(`  locked "${field.label}"`);
        } else {
          console.log(`  "${field.label}" already locked — skip`);
        }
      }
    } else {
      // None of the 3 core fields exist — seed fresh (no existing fields to preserve)
      console.log("[migrate-clicker] core colour fields not found — seeding fresh...");
      await seedKeychainFields(product.id);
    }
  }

  // ── Step 5: Find text field for unitField (if any) ────────────────────────
  const allFields = await db
    .select()
    .from(productConfigFields)
    .where(eq(productConfigFields.productId, product.id));

  const textField = allFields.find((f) => f.fieldType === "text") ?? null;
  const unitFieldId = textField?.id ?? null;

  if (textField) {
    console.log(`[migrate-clicker] found text field "${textField.label}" (id=${textField.id}) → unitField`);
  } else {
    console.log("[migrate-clicker] no text field found — unitField will be NULL");
  }

  // ── Step 6: Update product row ────────────────────────────────────────────
  // Only set priceTiers + maxUnitCount if currently null (don't clobber admin edits)
  const needsTiers =
    product.priceTiersRaw === null ||
    product.priceTiersRaw === "" ||
    product.priceTiersRaw === "null";
  const needsMaxUnit = product.maxUnitCount === null;

  console.log("[migrate-clicker] updating product row...");
  await db
    .update(products)
    .set({
      productType: "keychain",
      ...(needsTiers ? { priceTiers: JSON.stringify(PRICE_TIERS) } : {}),
      ...(needsMaxUnit ? { maxUnitCount: MAX_UNIT_COUNT } : {}),
      unitField: unitFieldId,
    })
    .where(eq(products.id, product.id));

  console.log("[migrate-clicker] product row updated:");
  console.log(`  productType   = keychain`);
  if (needsTiers) console.log(`  priceTiers    = ${JSON.stringify(PRICE_TIERS)}`);
  else console.log(`  priceTiers    = (kept existing)`);
  if (needsMaxUnit) console.log(`  maxUnitCount  = ${MAX_UNIT_COUNT}`);
  else console.log(`  maxUnitCount  = (kept existing)`);
  console.log(`  unitField     = ${unitFieldId ?? "NULL"}`);

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
