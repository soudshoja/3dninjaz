/**
 * Phase 8 (08-01) — seed starter categories + subcategories appropriate
 * for a 3D-printing catalogue.
 *
 * Idempotent:
 *   - Category slug pre-checked; existing names are left alone.
 *   - Subcategory is (category_id, slug) scoped; duplicates are skipped.
 *   - Position is set to the array index so the admin's initial menu
 *     ordering matches this file until they reorder.
 *
 * Run with: npx tsx --env-file=.env.local scripts/seed-categories.ts
 */

import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../src/lib/db";
import { categories, subcategories } from "../src/lib/db/schema";

type SeedSubcategory = { name: string; slug: string };
type SeedCategory = {
  name: string;
  slug: string;
  subcategories: SeedSubcategory[];
};

const SEED: SeedCategory[] = [
  {
    name: "Home & Decor",
    slug: "home-and-decor",
    subcategories: [
      { name: "Planters", slug: "planters" },
      { name: "Wall Art", slug: "wall-art" },
      { name: "Lamps", slug: "lamps" },
    ],
  },
  {
    name: "Toys & Games",
    slug: "toys-and-games",
    subcategories: [
      { name: "Action Figures", slug: "action-figures" },
      { name: "Puzzles", slug: "puzzles" },
      { name: "Dice & Gaming", slug: "dice-and-gaming" },
    ],
  },
  {
    name: "Tech Accessories",
    slug: "tech-accessories",
    subcategories: [
      { name: "Phone Stands", slug: "phone-stands" },
      { name: "Cable Organizers", slug: "cable-organizers" },
      { name: "Desk Gadgets", slug: "desk-gadgets" },
    ],
  },
  {
    name: "Miniatures",
    slug: "miniatures",
    subcategories: [
      { name: "Tabletop", slug: "tabletop" },
      { name: "Display", slug: "display" },
      { name: "Collectibles", slug: "collectibles" },
    ],
  },
];

async function ensureCategory(
  name: string,
  slug: string,
  position: number,
): Promise<string> {
  const [existing] = await db
    .select()
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);
  if (existing) {
    console.log(`[seed-cat] category "${name}" exists`);
    return existing.id;
  }
  const id = randomUUID();
  await db.insert(categories).values({ id, name, slug, position });
  console.log(`[seed-cat] created category "${name}" (${id})`);
  return id;
}

async function ensureSubcategory(
  categoryId: string,
  name: string,
  slug: string,
  position: number,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(subcategories)
    .where(
      and(
        eq(subcategories.categoryId, categoryId),
        eq(subcategories.slug, slug),
      ),
    )
    .limit(1);
  if (existing) {
    console.log(`[seed-cat]   subcategory "${name}" exists`);
    return;
  }
  const id = randomUUID();
  await db
    .insert(subcategories)
    .values({ id, categoryId, name, slug, position });
  console.log(`[seed-cat]   created subcategory "${name}"`);
}

async function run() {
  for (let i = 0; i < SEED.length; i += 1) {
    const c = SEED[i];
    const catId = await ensureCategory(c.name, c.slug, i);
    for (let j = 0; j < c.subcategories.length; j += 1) {
      const s = c.subcategories[j];
      await ensureSubcategory(catId, s.name, s.slug, j);
    }
  }
  console.log("[seed-cat] done");
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed-cat] failed:", err);
    process.exit(1);
  });
