/**
 * Phase 16-07 — Parts-based sample product seed.
 *
 * Creates "Ninja Robot Model Kit" with a single "Part" option and 5 values:
 *   Head (RM 25.00), Torso (RM 35.00), Left Arm (RM 20.00),
 *   Right Arm (RM 20.00), Legs (RM 30.00)
 *
 * Idempotent: if the slug already exists the script exits without changes.
 *
 * Usage:
 *   node scripts/phase16-seed-parts.cjs
 *
 * After running, note the product ID and visit /admin/products/<id>/variants
 * to assign variant images if desired.
 */

"use strict";

const mysql = require("mysql2/promise");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) throw new Error(".env.local not found");
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

function parseDbUrl(url) {
  const m = url.match(/mysql:\/\/([^:]+):([^@]*)@([^:/]+):?(\d*)\/(.+)/);
  if (!m) throw new Error("Cannot parse DATABASE_URL: " + url);
  return {
    host: m[3],
    port: m[4] ? parseInt(m[4]) : 3306,
    user: m[1],
    password: decodeURIComponent(m[2]),
    database: m[5].split("?")[0],
    ssl: { rejectUnauthorized: false },
  };
}

const SLUG = "ninja-robot-model-kit";
const PARTS = [
  { name: "Head",       price: "25.00", position: 1 },
  { name: "Torso",      price: "35.00", position: 2 },
  { name: "Left Arm",   price: "20.00", position: 3 },
  { name: "Right Arm",  price: "20.00", position: 4 },
  { name: "Legs",       price: "30.00", position: 5 },
];

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  const conn = await mysql.createConnection(parseDbUrl(dbUrl));
  console.log("Connected to DB.");

  try {
    // Idempotency check
    const [existing] = await conn.execute(
      "SELECT id FROM products WHERE slug = ?",
      [SLUG]
    );
    if (existing.length > 0) {
      console.log(`Product "${SLUG}" already exists (id: ${existing[0].id}). Nothing to do.`);
      return;
    }

    // Insert product
    const productId = crypto.randomUUID();
    await conn.execute(
      `INSERT INTO products (id, name, slug, description, images, is_active, is_featured, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 0, NOW(), NOW())`,
      [
        productId,
        "Ninja Robot Model Kit",
        SLUG,
        "Build your own ninja robot, piece by piece. Each component is precision-printed and ready to assemble. Order individual parts or collect them all for the full set.",
        JSON.stringify([]),
      ]
    );
    console.log(`✓ Inserted product: ${productId}`);

    // Insert option "Part"
    const optionId = crypto.randomUUID();
    await conn.execute(
      `INSERT INTO product_options (id, product_id, name, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [optionId, productId, "Part", 1]
    );
    console.log(`✓ Inserted option "Part": ${optionId}`);

    // Insert option values + variants
    for (const part of PARTS) {
      const valueId = crypto.randomUUID();
      await conn.execute(
        `INSERT INTO product_option_values (id, option_id, value, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [valueId, optionId, part.name, part.position]
      );

      const variantId = crypto.randomUUID();
      await conn.execute(
        `INSERT INTO product_variants
           (id, product_id, price, in_stock, track_stock, stock, position,
            option1_value_id, label_cache, created_at, updated_at)
         VALUES (?, ?, ?, 1, 0, 0, ?, ?, ?, NOW(), NOW())`,
        [variantId, productId, part.price, part.position, valueId, part.name]
      );
      console.log(`  ✓ ${part.name}: variant ${variantId}, value ${valueId}, price RM ${part.price}`);
    }

    console.log(`\n✅ "Ninja Robot Model Kit" seeded successfully.`);
    console.log(`   Product ID: ${productId}`);
    console.log(`   Visit: /admin/products/${productId}/variants`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err.message || err);
  process.exit(1);
});
