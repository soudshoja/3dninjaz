/* eslint-disable no-console */
/**
 * Phase 16 backfill — seed product_options / product_option_values for all
 * existing products that have the legacy size S/M/L variants.
 *
 * For each product:
 *   1. Insert a "Size" option at position=1 (idempotent via SELECT-first).
 *   2. Insert three option_values: Small(pos=1), Medium(pos=2), Large(pos=3).
 *   3. For each product_variant where option1_value_id IS NULL:
 *      - Map size: S→Small, M→Medium, L→Large
 *      - UPDATE option1_value_id + label_cache
 *
 * Idempotent: re-running produces zero updates when already complete.
 * Reports: products processed, variants updated, errors.
 */
const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const SIZE_TO_LABEL = { S: "Small", M: "Medium", L: "Large" };

async function run() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const conn = await mysql.createConnection(url);
  console.log("Connected");

  let productsProcessed = 0;
  let variantsUpdated = 0;
  let errors = 0;

  try {
    // Fetch all products
    const [productRows] = await conn.query("SELECT id FROM products");
    console.log(`Found ${productRows.length} products`);

    for (const product of productRows) {
      const productId = product.id;
      try {
        // 1. Ensure "Size" option exists for this product
        const [existingOptions] = await conn.query(
          "SELECT id FROM product_options WHERE product_id = ? AND name = 'Size' LIMIT 1",
          [productId],
        );

        let optionId;
        if (existingOptions.length > 0) {
          optionId = existingOptions[0].id;
        } else {
          optionId = randomUUID();
          await conn.query(
            "INSERT INTO product_options (id, product_id, name, position) VALUES (?, ?, 'Size', 1)",
            [optionId, productId],
          );
        }

        // 2. Ensure S/M/L option values exist
        const valueMap = {}; // label → id
        const valueDefs = [
          { value: "Small", position: 1, size: "S" },
          { value: "Medium", position: 2, size: "M" },
          { value: "Large", position: 3, size: "L" },
        ];
        for (const def of valueDefs) {
          const [existing] = await conn.query(
            "SELECT id FROM product_option_values WHERE option_id = ? AND value = ? LIMIT 1",
            [optionId, def.value],
          );
          if (existing.length > 0) {
            valueMap[def.size] = existing[0].id;
          } else {
            const valueId = randomUUID();
            await conn.query(
              "INSERT INTO product_option_values (id, option_id, value, position) VALUES (?, ?, ?, ?)",
              [valueId, optionId, def.value, def.position],
            );
            valueMap[def.size] = valueId;
          }
        }

        // 3. Update variants that have no option1_value_id yet
        const [variants] = await conn.query(
          "SELECT id, size FROM product_variants WHERE product_id = ? AND option1_value_id IS NULL",
          [productId],
        );

        for (const variant of variants) {
          const sizeKey = variant.size; // "S", "M", or "L"
          const valueId = valueMap[sizeKey];
          const label = SIZE_TO_LABEL[sizeKey] || sizeKey;
          if (!valueId) {
            console.warn(
              `  WARNING: no value mapping for size=${sizeKey} on variant ${variant.id}`,
            );
            errors++;
            continue;
          }
          await conn.query(
            "UPDATE product_variants SET option1_value_id = ?, label_cache = ? WHERE id = ?",
            [valueId, label, variant.id],
          );
          variantsUpdated++;
        }

        productsProcessed++;
      } catch (err) {
        console.error(`  ERROR on product ${productId}:`, err.message);
        errors++;
      }
    }

    // Final verification
    const [[{ nullCount }]] = await conn.query(
      "SELECT COUNT(*) AS nullCount FROM product_variants WHERE option1_value_id IS NULL",
    );

    console.log("\n--- Backfill Summary ---");
    console.log(`Products processed : ${productsProcessed}`);
    console.log(`Variants updated   : ${variantsUpdated}`);
    console.log(`Errors             : ${errors}`);
    console.log(`NULL option1 rows  : ${nullCount}`);

    if (nullCount > 0) {
      console.warn(
        `WARNING: ${nullCount} variant(s) still have option1_value_id IS NULL — check errors above`,
      );
    } else {
      console.log("OK: all variants have option1_value_id set");
    }
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
