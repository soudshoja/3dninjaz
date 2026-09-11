/**
 * One-time backfill: rewrite every product slug to a clean, title-derived form.
 *
 * Historically createProduct set slug = `<title>-<timestamp36>` to guarantee the
 * UNIQUE constraint. New logic (src/actions/products.ts → uniqueProductSlug) drops
 * the timestamp and only appends -2, -3, … on a genuine title clash. This script
 * brings existing rows in line.
 *
 * Collision handling: products are processed oldest-first (stable order); the first
 * holder of a title keeps the bare slug, later clashes get -2, -3, …
 *
 * Orders snapshot their own product_slug column at purchase time, so rewriting
 * product slugs here does NOT affect historical orders.
 *
 * Run ONCE then delete this file.
 * Run: npx tsx --env-file=.env.local scripts/backfill-product-slugs.ts
 *
 * Dry run (print only, no writes): add --dry
 */

import "dotenv/config";
import { asc, eq } from "drizzle-orm";
import { db, pool } from "../src/lib/db";
import { products } from "../src/lib/db/schema";

const DRY = process.argv.includes("--dry");

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function run() {
  const rows = await db
    .select({ id: products.id, name: products.name, slug: products.slug })
    .from(products)
    .orderBy(asc(products.createdAt));

  console.log(`[backfill] ${rows.length} products${DRY ? " (DRY RUN)" : ""}`);

  const taken = new Set<string>();
  let changed = 0;

  for (const row of rows) {
    const base = (slugify(row.name) || "product").slice(0, 200).replace(/-$/, "");
    let candidate = base;
    let n = 1;
    while (taken.has(candidate)) {
      n += 1;
      candidate = `${base}-${n}`;
    }
    taken.add(candidate);

    if (candidate === row.slug) continue;

    console.log(`[backfill] ${row.slug}  →  ${candidate}`);
    changed += 1;
    if (!DRY) {
      await db.update(products).set({ slug: candidate }).where(eq(products.id, row.id));
    }
  }

  console.log(`[backfill] done — ${changed} slug(s) ${DRY ? "would change" : "updated"}`);
}

run()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill] failed:", err);
    pool.end().finally(() => process.exit(1));
  });
