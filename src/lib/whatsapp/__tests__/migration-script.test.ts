import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Static checks on the migration script. It is NEVER executed here.
const src = fs.readFileSync(
  path.resolve(__dirname, "../../../../scripts/whatsapp-outbox-migrate.cjs"),
  "utf8",
);

describe("whatsapp-outbox-migrate.cjs", () => {
  it("hardcodes utf8mb4 and does not inherit a sibling table's charset", () => {
    expect(src).toContain("DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    expect(src).not.toMatch(/SHOW CREATE TABLE `whatsapp_notifications`/);
    expect(src).not.toMatch(/DEFAULT CHARSET=\$\{/);
  });

  it("keeps the VARCHAR(190) unique idempotency key and the schema-authority guards", () => {
    expect(src).toMatch(/`idempotency_key`\s+VARCHAR\(190\)\s+NOT NULL/);
    expect(src).toContain("UNIQUE KEY `uq_outbox_idem` (`idempotency_key`)");
    expect(src).toContain("SELECT DATABASE()");
    expect(src).toContain("--expect-db=");
  });
});
