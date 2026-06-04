/* Verify reseeded email_templates rows contain the new design. */
const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");

const envPath = path.resolve(__dirname, "..", ".env.local");
const text = fs.readFileSync(envPath, "utf8");
let url = "";
for (const line of text.split(/\r?\n/)) {
  const t = line.trim();
  if (t.startsWith("DATABASE_URL")) {
    url = t.slice(t.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    break;
  }
}

(async () => {
  const c = await mysql.createConnection(url);
  const [rows] = await c.query(
    "SELECT `key`, CHAR_LENGTH(html) AS len, " +
      "(html LIKE '%C7E56B%') AS lime, (html LIKE '%3D NINJAZ%') AS pill " +
      "FROM email_templates ORDER BY `key`",
  );
  let allGood = true;
  for (const r of rows) {
    const ok = r.lime === 1 && r.pill === 1;
    if (!ok) allGood = false;
    console.log(
      `${ok ? "OK " : "BAD"}  ${r.key.padEnd(26)} len=${String(r.len).padStart(5)} lime=${r.lime} pill=${r.pill}`,
    );
  }
  console.log(`\nTotal rows: ${rows.length} | all new design: ${allGood}`);
  await c.end();
})().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
