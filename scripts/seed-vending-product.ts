/**
 * Seed the Vending Machine product (productType='vending').
 *
 * Creates:
 *   - 1 product (productType='vending', maxUnitCount=1, priceTiers={1:25}, unitField=null)
 *   - 2 locked colour fields: Primary (pos 0), Secondary (pos 1)
 *
 * Idempotent: checks for slug 'vending-machine' before inserting.
 *
 * Prereq: scripts/seed-colours.ts must have run.
 *
 * Run: dotenv -e .env.local -- npx tsx scripts/seed-vending-product.ts
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/lib/db";
import { products } from "../src/lib/db/schema";
import { seedVendingFields } from "../src/lib/vending-fields";

const SLUG = "vending-machine";
const PRODUCT_NAME = "Vending Machine";
const FLAT_PRICE = 25;

async function run() {
  const existing = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, SLUG))
    .limit(1);

  if (existing.length > 0) {
    console.log(
      `[seed-vending] product '${SLUG}' already exists (id=${existing[0].id}); skipping.`,
    );
    process.exit(0);
  }

  const productId = randomUUID();

  await db.insert(products).values({
    id: productId,
    slug: SLUG,
    name: PRODUCT_NAME,
    description:
      "3D-printed mini vending machine. Pick your two colours — primary for the body and back panel, secondary for the frame, dispenser knob, and tray. Made to order — ships in 5–7 working days.",
    images: [],
    thumbnailIndex: 0,
    materialType: "PLA",
    estimatedProductionDays: 7,
    isActive: true,
    isFeatured: true,
    productType: "vending",
    maxUnitCount: 1,
    priceTiers: JSON.stringify({ 1: FLAT_PRICE }),
    unitField: null,
  });

  console.log(`[seed-vending] created product ${productId} at MYR ${FLAT_PRICE} (admin can edit price)`);

  await seedVendingFields(productId);

  console.log(`[seed-vending] done — product '${SLUG}' created with 2 locked colour fields.`);
  console.log(
    `[seed-vending] Next: upload primary image at /admin/products/${productId}/edit and prune allowed colours via /admin/products/${productId}/configurator`,
  );
  process.exit(0);
}

run().catch(async (err) => {
  console.error("[seed-vending] failed:", err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
