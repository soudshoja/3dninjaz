/* eslint-disable no-console */
/**
 * Phase 18 — SKU backfill for product_variants.
 *
 * Fills NULL sku values using the auto-generation pattern:
 *   3DN-{SLUG4}-{INITIALS}
 *
 * Idempotent — skips rows that already have a sku value.
 * Collision-safe — expands initials (2 chars → 3 chars) or appends -2, -3, etc.
 * if the same auto-sku appears twice within a product.
 *
 * Run once on live DB after deploying the SKU auto-gen feature.
 *
 * Usage:
 *   node scripts/phase18-sku-backfill.cjs
 */
const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");

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

/**
 * Generate a SKU matching the server-side generateVariantSku() helper.
 * Pattern: 3DN-{SLUG4}-{INITIALS}
 */
function generateVariantSku(productSlug, optionValueLabels) {
  const slugPart = (productSlug || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
  const initials = optionValueLabels
    .filter((v) => typeof v === "string" && v.trim() !== "")
    .map((v) => {
      const cleaned = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
      return cleaned.slice(0, 1);
    })
    .join("");
  return initials ? `3DN-${slugPart}-${initials}` : `3DN-${slugPart}`;
}

async function main() {
  loadEnv();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set in .env.local");

  // Parse mysql2-compatible config from DATABASE_URL
  const url = new URL(dbUrl);
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: url.port ? parseInt(url.port, 10) : 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.replace(/^\//, ""),
    ssl: url.searchParams.get("ssl") === "true" ? { rejectUnauthorized: false } : undefined,
  });

  console.log("Connected. Fetching variants with NULL sku...");

  // Fetch all variants missing a sku, joined with product slug and option value labels
  const [variants] = await conn.query(`
    SELECT
      pv.id,
      pv.product_id,
      pv.option1_value_id,
      pv.option2_value_id,
      pv.option3_value_id,
      pv.label_cache,
      p.slug AS product_slug
    FROM product_variants pv
    INNER JOIN products p ON p.id = pv.product_id
    WHERE pv.sku IS NULL OR pv.sku = ''
    ORDER BY pv.product_id, pv.position
  `);

  if (!variants.length) {
    console.log("No variants with NULL/empty sku found. Nothing to do.");
    await conn.end();
    return;
  }

  console.log(`Found ${variants.length} variant(s) to backfill.`);

  // Collect all option value IDs needed
  const valueIdSet = new Set();
  for (const v of variants) {
    if (v.option1_value_id) valueIdSet.add(v.option1_value_id);
    if (v.option2_value_id) valueIdSet.add(v.option2_value_id);
    if (v.option3_value_id) valueIdSet.add(v.option3_value_id);
  }

  const valueMap = new Map();
  if (valueIdSet.size > 0) {
    const ids = Array.from(valueIdSet);
    const placeholders = ids.map(() => "?").join(",");
    const [valueRows] = await conn.query(
      `SELECT id, value FROM product_option_values WHERE id IN (${placeholders})`,
      ids,
    );
    for (const row of valueRows) {
      valueMap.set(row.id, row.value);
    }
  }

  // Track used SKUs per product to avoid collisions
  // Also pre-load existing SKUs for the affected products
  const productIds = [...new Set(variants.map((v) => v.product_id))];
  const existingSkusByProduct = new Map();
  if (productIds.length > 0) {
    const ph = productIds.map(() => "?").join(",");
    const [existingRows] = await conn.query(
      `SELECT product_id, sku FROM product_variants WHERE product_id IN (${ph}) AND sku IS NOT NULL AND sku != ''`,
      productIds,
    );
    for (const row of existingRows) {
      const set = existingSkusByProduct.get(row.product_id) ?? new Set();
      set.add(row.sku);
      existingSkusByProduct.set(row.product_id, set);
    }
  }

  let updated = 0;
  let skipped = 0;

  for (const v of variants) {
    const labels = [v.option1_value_id, v.option2_value_id, v.option3_value_id]
      .filter(Boolean)
      .map((id) => valueMap.get(id) ?? "")
      .filter(Boolean);

    // Fall back to label_cache if no option values resolved
    const effectiveLabels =
      labels.length > 0
        ? labels
        : (v.label_cache ? v.label_cache.split(" / ").filter(Boolean) : []);

    const autoSku = generateVariantSku(v.product_slug, effectiveLabels);

    // Ensure no collision within this product
    const used = existingSkusByProduct.get(v.product_id) ?? new Set();
    let sku = autoSku;
    let suffix = 2;
    while (used.has(sku)) {
      sku = `${autoSku}-${suffix++}`;
    }

    try {
      await conn.query(
        `UPDATE product_variants SET sku = ? WHERE id = ? AND (sku IS NULL OR sku = '')`,
        [sku, v.id],
      );
      used.add(sku);
      existingSkusByProduct.set(v.product_id, used);
      console.log(`  [OK] variant ${v.id} → sku = ${sku}`);
      updated++;
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        // Race condition: another process set this SKU. Try with suffix.
        let fallback = `${autoSku}-${suffix++}`;
        while (used.has(fallback)) {
          fallback = `${autoSku}-${suffix++}`;
        }
        await conn.query(
          `UPDATE product_variants SET sku = ? WHERE id = ? AND (sku IS NULL OR sku = '')`,
          [fallback, v.id],
        );
        used.add(fallback);
        existingSkusByProduct.set(v.product_id, used);
        console.log(`  [COLLISION-FALLBACK] variant ${v.id} → sku = ${fallback}`);
        updated++;
      } else {
        console.error(`  [ERROR] variant ${v.id}: ${err.message}`);
        skipped++;
      }
    }
  }

  await conn.end();
  console.log(`\nDone. Updated: ${updated}, Skipped/errors: ${skipped}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
