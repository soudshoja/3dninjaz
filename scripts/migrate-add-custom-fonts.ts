/**
 * Add custom_fonts table for admin-uploaded brand fonts (.woff2/.woff).
 *
 * Idempotent: uses CREATE TABLE IF NOT EXISTS — safe to re-run.
 * Run: npx dotenv -e .env.local -- npx tsx scripts/migrate-add-custom-fonts.ts
 */
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const conn = await mysql.createConnection(url);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS \`custom_fonts\` (
      \`id\`           VARCHAR(36)  NOT NULL,
      \`display_name\` VARCHAR(64)  NOT NULL,
      \`family_slug\`  VARCHAR(32)  NOT NULL,
      \`file_url\`     VARCHAR(255) NOT NULL,
      \`mime_type\`    VARCHAR(64)  NOT NULL,
      \`is_active\`    TINYINT(1)   NOT NULL DEFAULT 1,
      \`uploaded_at\`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`custom_fonts_family_slug_unique\` (\`family_slug\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  console.info("[migrate-add-custom-fonts] custom_fonts table ready (created or already existed)");

  // Verify
  const [rows] = await conn.query(
    "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'custom_fonts'",
  );
  const cnt = (rows as { cnt: number }[])[0]?.cnt ?? 0;
  if (cnt > 0) {
    console.info("[migrate-add-custom-fonts] VERIFIED — table exists in DB");
  } else {
    console.error("[migrate-add-custom-fonts] ERROR — table not found after creation");
    process.exit(1);
  }

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
