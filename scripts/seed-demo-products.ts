/**
 * Seed 6 demo 3D-printed products so the /shop grid has something to render
 * during Phase 2 development + screenshots.
 *
 * Idempotent: checks for existing slugs and skips duplicates.
 *
 * Run with: npx tsx --env-file=.env.local scripts/seed-demo-products.ts
 *
 * Uses /logo.png as a placeholder image since no real product photos exist yet;
 * admin can upload real photos via /admin/products later.
 */

import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { products, productVariants, categories } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

type DemoVariant = {
  size: "S" | "M" | "L";
  price: string;
  widthCm: string;
  heightCm: string;
  depthCm: string;
};

type DemoProduct = {
  slug: string;
  name: string;
  description: string;
  materialType: string;
  estimatedProductionDays: number;
  isFeatured: boolean;
  categoryName: string;
  variants: DemoVariant[];
};

const DEMO_CATEGORIES = ["Keychains", "Phone Stands", "Desk Toys", "Planters"];

const DEMO_PRODUCTS: DemoProduct[] = [
  {
    slug: "shuriken-keychain",
    name: "Shuriken Keychain",
    description:
      "A pocket-sized ninja star keychain, hand-finished in Kuala Lumpur. Solid, lightweight, and hangs beautifully off a carabiner or zipper pull.",
    materialType: "PLA",
    estimatedProductionDays: 3,
    isFeatured: true,
    categoryName: "Keychains",
    variants: [
      { size: "S", price: "18.00", widthCm: "3.0", heightCm: "3.0", depthCm: "0.4" },
      { size: "M", price: "24.00", widthCm: "4.5", heightCm: "4.5", depthCm: "0.5" },
      { size: "L", price: "32.00", widthCm: "6.0", heightCm: "6.0", depthCm: "0.6" },
    ],
  },
  {
    slug: "dragon-phone-stand",
    name: "Dragon Phone Stand",
    description:
      "A coiled dragon cradles your phone while you sip your teh tarik. Fits all modern smartphones, tablets scale up to the L size.",
    materialType: "PLA+",
    estimatedProductionDays: 5,
    isFeatured: true,
    categoryName: "Phone Stands",
    variants: [
      { size: "S", price: "38.00", widthCm: "8.0", heightCm: "6.0", depthCm: "8.0" },
      { size: "M", price: "45.00", widthCm: "10.0", heightCm: "7.0", depthCm: "9.0" },
      { size: "L", price: "55.00", widthCm: "12.5", heightCm: "9.0", depthCm: "11.0" },
    ],
  },
  {
    slug: "ninja-planter-pot",
    name: "Ninja Planter Pot",
    description:
      "A stealthy succulent home. Drainage hole on the base, water-resistant finish, and a matte ink texture that pairs with every leaf in your rotation.",
    materialType: "PETG",
    estimatedProductionDays: 7,
    isFeatured: true,
    categoryName: "Planters",
    variants: [
      { size: "S", price: "28.00", widthCm: "8.0", heightCm: "7.0", depthCm: "8.0" },
      { size: "M", price: "38.00", widthCm: "11.0", heightCm: "10.0", depthCm: "11.0" },
      { size: "L", price: "52.00", widthCm: "14.0", heightCm: "13.0", depthCm: "14.0" },
    ],
  },
  {
    slug: "kunai-letter-opener",
    name: "Kunai Letter Opener",
    description:
      "Open your bills like a shinobi. Matte blade, reinforced handle, perfectly balanced. (For desk use — not for combat, sadly.)",
    materialType: "PLA",
    estimatedProductionDays: 4,
    isFeatured: false,
    categoryName: "Desk Toys",
    variants: [
      { size: "S", price: "22.00", widthCm: "12.0", heightCm: "2.0", depthCm: "0.8" },
      { size: "M", price: "30.00", widthCm: "16.0", heightCm: "2.5", depthCm: "1.0" },
      { size: "L", price: "42.00", widthCm: "20.0", heightCm: "3.0", depthCm: "1.2" },
    ],
  },
  {
    slug: "chibi-ninja-figurine",
    name: "Chibi Ninja Figurine",
    description:
      "A stocky little shinobi to guard your monitor. Three poses across sizes — each bigger ninja holds a bigger weapon. Collect all three.",
    materialType: "PLA",
    estimatedProductionDays: 6,
    isFeatured: true,
    categoryName: "Desk Toys",
    variants: [
      { size: "S", price: "35.00", widthCm: "4.0", heightCm: "6.0", depthCm: "4.0" },
      { size: "M", price: "48.00", widthCm: "6.0", heightCm: "9.0", depthCm: "6.0" },
      { size: "L", price: "68.00", widthCm: "8.0", heightCm: "12.0", depthCm: "8.0" },
    ],
  },
  {
    slug: "stealth-cable-dragon",
    name: "Stealth Cable Dragon",
    description:
      "A cable-wrangling dragon that clamps onto your desk edge. Keeps your USB-C, Lightning, and HDMI from sliding into the abyss.",
    materialType: "PLA+",
    estimatedProductionDays: 4,
    isFeatured: false,
    categoryName: "Desk Toys",
    variants: [
      { size: "S", price: "20.00", widthCm: "5.0", heightCm: "4.0", depthCm: "3.0" },
      { size: "M", price: "28.00", widthCm: "7.0", heightCm: "5.5", depthCm: "4.0" },
      { size: "L", price: "38.00", widthCm: "9.0", heightCm: "7.0", depthCm: "5.0" },
    ],
  },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-");
}

async function ensureCategory(name: string): Promise<string> {
  const slug = slugify(name);
  const existing = await db
    .select()
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);
  if (existing.length > 0) return existing[0].id;

  const id = randomUUID();
  await db.insert(categories).values({ id, name, slug });
  console.log(`[seed-demo] created category "${name}"`);
  return id;
}

async function seed() {
  const categoryIdByName = new Map<string, string>();
  for (const name of DEMO_CATEGORIES) {
    categoryIdByName.set(name, await ensureCategory(name));
  }

  for (const dp of DEMO_PRODUCTS) {
    const existing = await db
      .select()
      .from(products)
      .where(eq(products.slug, dp.slug))
      .limit(1);
    if (existing.length > 0) {
      console.log(`[seed-demo] product "${dp.slug}" already exists, skipping.`);
      continue;
    }

    const id = randomUUID();
    const categoryId = categoryIdByName.get(dp.categoryName) ?? null;

    await db.insert(products).values({
      id,
      name: dp.name,
      slug: dp.slug,
      description: dp.description,
      images: ["/logo.png"], // placeholder; admin can replace via /admin/products
      materialType: dp.materialType,
      estimatedProductionDays: dp.estimatedProductionDays,
      isActive: true,
      isFeatured: dp.isFeatured,
      categoryId,
    });

    await db.insert(productVariants).values(
      dp.variants.map((v) => ({
        productId: id,
        size: v.size,
        price: v.price,
        widthCm: v.widthCm,
        heightCm: v.heightCm,
        depthCm: v.depthCm,
      }))
    );
    console.log(`[seed-demo] created product "${dp.name}" (${dp.variants.length} variants)`);
  }
}

seed()
  .then(() => {
    console.log("[seed-demo] done");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[seed-demo] failed:", err);
    process.exit(1);
  });
