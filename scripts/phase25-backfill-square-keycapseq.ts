/**
 * Phase 25 (25-09) — Dev-first, idempotent backfill: convert EXISTING live
 * square keychain products so their locked position-0 `text` "Your name" field
 * becomes a `keycapseq` "Your keycaps" field (mixed letters + icons).
 *
 * WHY: `seedKeychainFields(shape)` (Plan 25-03) only seeds `keycapseq` for
 * NEWLY created/edited square keychains. Products that already exist keep their
 * old locked text field and never surface the icon feature. This backfill swaps
 * that one field in place so the existing live square keychain gains icons
 * without a manual rebuild (RESEARCH Open Q4).
 *
 * SCOPE / SAFETY (D-01, T-25-09-01/02/03):
 *   - ONLY products where productType='keychain' AND keychainShape='square'.
 *     The shape filter guarantees ROUND keychains are never touched (D-01).
 *   - Converts the position-0 field ONLY when it is currently fieldType='text'
 *     AND locked=1 (the seeded "Your name" field). Already-`keycapseq` fields
 *     are skipped — this is the idempotency guard (re-run reports 0 conversions).
 *   - Converts IN PLACE by field id (UPDATE ... WHERE id=?), preserving the id
 *     so `products.unitField` and any references stay valid (no delete+insert).
 *   - Does NOT touch positions 1-3 (colour Base/Clicker/Letter).
 *   - Does NOT touch products.priceTiers / weight_tiers / maxUnitCount /
 *     unitField (tiers + weight preserved).
 *   - Does NOT touch existing ORDERS — they snapshot their own
 *     configurationData and are unaffected (D-06 backwards compat).
 *
 * NEW configJson (keycapseq shape — matches keychain-fields.ts seeding), with
 * old text-field constraints carried over where they map:
 *   { maxSlots: <old maxLength>, allowedChars: <old allowedChars, default "A-Z">,
 *     uppercase: <old uppercase, default true>, profanityCheck: <old profanityCheck, default true>,
 *     allowedIconIds: [] }
 * (Admin picks allowed icons afterward via the Plan 25-05/07 editor.)
 * `required` and `locked` are kept as-is.
 *
 * DEV ONLY (ninjaz_3dn). Prod (ninjaz_3dnp) migration + backfill are a SEPARATE
 * later gated deploy — explicitly out of scope for this phase.
 *
 * Run (dev, via 3307 SSH tunnel — see reference_local_dev_db_tunnel):
 *   ssh -N -L 3307:127.0.0.1:3306 root@152.53.86.223   # background
 *   DATABASE_URL="mysql://ninjaz_3dn:<pw>@127.0.0.1:3307/ninjaz_3dn" \
 *     npx tsx scripts/phase25-backfill-square-keycapseq.ts
 */
import "dotenv/config";
import mysql from "mysql2/promise";

type ConfigFieldRow = {
  id: string;
  productId: string;
  position: number;
  fieldType: string;
  label: string;
  helpText: string | null;
  locked: number | boolean;
  required: number | boolean;
  configJson: string | null;
};

/** Fail-soft parse of the old text field's configJson (LONGTEXT → string). */
function parseOldTextConfig(raw: string | null): {
  maxLength?: unknown;
  allowedChars?: unknown;
  uppercase?: unknown;
  profanityCheck?: unknown;
} {
  if (!raw || raw.trim() === "") return {};
  try {
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");

  const dbName = new URL(url).pathname.replace(/^\//, "");
  // Guard: this phase is DEV-ONLY. Refuse to run against the prod DB name.
  if (dbName === "ninjaz_3dnp") {
    throw new Error(
      "[phase25-backfill] refusing to run against PROD ninjaz_3dnp — dev-first only (D-01/T-25-09-03)",
    );
  }
  console.info(`[phase25-backfill] target DB: ${dbName}`);

  const conn = await mysql.createConnection(url);

  // 1. Select existing SQUARE keychain products (round untouched via this filter).
  const [prodRows] = await conn.query(
    "SELECT id, name FROM products WHERE productType = 'keychain' AND keychainShape = 'square'",
  );
  const products = prodRows as { id: string; name: string }[];
  console.info(
    `[phase25-backfill] found ${products.length} square keychain product(s)`,
  );

  let converted = 0;
  let alreadyKeycapseq = 0;
  let skippedNonText = 0;

  for (const p of products) {
    // 2. Load this product's config fields; identify position-0.
    const [fieldRows] = await conn.query(
      "SELECT id, productId, position, fieldType, label, helpText, locked, required, configJson " +
        "FROM product_config_fields WHERE productId = ? ORDER BY position",
      [p.id],
    );
    const fields = fieldRows as ConfigFieldRow[];
    const pos0 = fields.find((f) => Number(f.position) === 0);

    if (!pos0) {
      console.warn(
        `[phase25-backfill]   product ${p.id} (${p.name}) has NO position-0 field — skipping`,
      );
      continue;
    }

    // Idempotency guard: already converted → no-op.
    if (pos0.fieldType === "keycapseq") {
      alreadyKeycapseq += 1;
      console.info(
        `[phase25-backfill]   product ${p.id} (${p.name}) pos-0 already keycapseq — no-op`,
      );
      continue;
    }

    // Apply ONLY to the seeded locked text field.
    const isLocked = pos0.locked === 1 || pos0.locked === true;
    if (pos0.fieldType !== "text" || !isLocked) {
      skippedNonText += 1;
      console.warn(
        `[phase25-backfill]   product ${p.id} (${p.name}) pos-0 is fieldType='${pos0.fieldType}' locked=${pos0.locked} — not a seeded locked text field, skipping`,
      );
      continue;
    }

    // 3. Build the keycapseq configJson carrying over old constraints.
    const old = parseOldTextConfig(pos0.configJson);
    const maxSlots =
      typeof old.maxLength === "number" && Number.isFinite(old.maxLength)
        ? old.maxLength
        : 8;
    const allowedChars =
      typeof old.allowedChars === "string" && old.allowedChars.length > 0
        ? old.allowedChars
        : "A-Z";
    const uppercase =
      typeof old.uppercase === "boolean" ? old.uppercase : true;
    const profanityCheck =
      typeof old.profanityCheck === "boolean" ? old.profanityCheck : true;

    const newConfig = JSON.stringify({
      maxSlots,
      allowedChars,
      uppercase,
      profanityCheck,
      allowedIconIds: [], // admin picks allowed icons afterward (Plan 25-05/07)
    });

    // Convert IN PLACE by id — preserve the field id (unitField stays valid).
    // Keep `required`/`locked`/`position`/`productId` as-is. Update helpText so
    // it no longer says "Letters only" (the field now accepts icons too).
    await conn.query(
      "UPDATE product_config_fields " +
        "SET fieldType = 'keycapseq', label = 'Your keycaps', helpText = ?, configJson = ? " +
        "WHERE id = ?",
      ["Letters and icons (uppercase).", newConfig, pos0.id],
    );
    converted += 1;
    console.info(
      `[phase25-backfill]   CONVERTED product ${p.id} (${p.name}) field ${pos0.id}: text→keycapseq (maxSlots=${maxSlots}, allowedChars=${allowedChars})`,
    );
  }

  // 5. Final counts.
  console.info(
    `[phase25-backfill] DONE — converted=${converted}, alreadyKeycapseq=${alreadyKeycapseq}, skippedNonTextLocked=${skippedNonText}, roundTouched=0 (shape filter excludes round)`,
  );

  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
