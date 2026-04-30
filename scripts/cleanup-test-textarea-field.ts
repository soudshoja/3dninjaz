/**
 * One-shot cleanup — delete the leftover "test" textarea config field from the
 * simple product.
 *
 * Idempotent: logs 0 deleted rows if the field is already gone.
 *
 * Run:
 *   npx dotenv -e .env.local -- npx tsx scripts/cleanup-test-textarea-field.ts
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { and, eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const PRODUCT_ID = "941c95c3-a04a-4c08-b6b1-31f4589d1f0e";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing from environment");

  const pool = mysql.createPool({ uri: url, connectionLimit: 1 });
  const db = drizzle(pool, { schema, mode: "default" });

  const result = await db
    .delete(schema.productConfigFields)
    .where(
      and(
        eq(schema.productConfigFields.productId, PRODUCT_ID),
        eq(schema.productConfigFields.fieldType, "textarea"),
        eq(schema.productConfigFields.label, "test"),
      ),
    );

  // mysql2 OkPacket exposes affectedRows
  const affected = (result as unknown as { affectedRows?: number }).affectedRows ?? 0;

  if (affected > 0) {
    console.log(
      `[cleanup-test-textarea-field] Deleted ${affected} row(s) — done.`,
    );
  } else {
    console.log(
      "[cleanup-test-textarea-field] No matching row found — already clean (no-op).",
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error("[cleanup-test-textarea-field] Fatal:", err);
  process.exit(1);
});
