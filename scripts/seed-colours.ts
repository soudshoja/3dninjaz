/**
 * Phase 18 (18-02) — Seed `colors` library from the two reference HTML files.
 *
 * Idempotent: re-running with no source changes prints `0 inserts, 0 updates`.
 *
 * Parser strategy (D-01):
 *   - Read each HTML file as text.
 *   - Match `const data = {...}` block via regex anchored on the trailing
 *     `const order =` declaration (disambiguates any `;` inside banner HTML).
 *   - Eval the body via `new Function("return " + body)()` — repo-controlled
 *     input, both files contain only object literals (no IIFEs, no methods).
 *
 * Skip rules (RESEARCH §P-3 / P-4):
 *   - Polymaker `dual` and `gradient` sections are skipped at the section
 *     level (no family mapping → multi-hex shape unsupported by single hex
 *     column).
 *   - Any colour row missing `.hex` is skipped (catches stragglers — e.g. a
 *     gradient-shaped row inside a non-gradient section if the source HTML
 *     ever drifts).
 *   - Em-dash code (`"—"`) is normalised to NULL (P-4) so the
 *     `(brand, code)` UNIQUE index in MariaDB allows multiple legacy rows
 *     to coexist (NULL ≠ NULL in MySQL UNIQUE semantics).
 *
 * Natural key for upsert:
 *   - When `code` is non-null: `(brand, code)`.
 *   - When `code` is null:     `(brand, name)` + `code IS NULL`.
 *
 * Run: npx tsx --env-file=.env.local scripts/seed-colours.ts
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, pool } from "../src/lib/db";
import { colors } from "../src/lib/db/schema";

type Brand = "Bambu" | "Polymaker";
type FamilyType = "PLA" | "PETG" | "TPU" | "CF" | "Other";

type ParsedColour = {
  name: string;
  code: string | null;
  hex: string;
  oldHex: string | null;
  familyType: FamilyType;
  familySubtype: string;
  brand: Brand;
};

// Section-key → (familyType, familySubtype) lookup tables. Hard-coded
// because section keys in source HTML are stable and small.
const BAMBU_FAMILY: Record<string, { type: FamilyType; sub: string }> = {
  "petg-translucent": { type: "PETG", sub: "Translucent" },
  "pla-translucent": { type: "PLA", sub: "Translucent" },
  "pla-basic": { type: "PLA", sub: "Basic" },
  "pla-matte": { type: "PLA", sub: "Matte" },
  "petg-hf": { type: "PETG", sub: "HF" },
  "petg-basic": { type: "PETG", sub: "Basic" },
  "petg-cf": { type: "PETG", sub: "CF" },
};

const POLYMAKER_FAMILY: Record<string, { type: FamilyType; sub: string }> = {
  translucent: { type: "PLA", sub: "Translucent" },
  matte: { type: "PLA", sub: "Matte" },
  basic: { type: "PLA", sub: "Basic" },
  "polylite-pla": { type: "PLA", sub: "PolyLite" },
  "polymax-pla": { type: "PLA", sub: "PolyMax (Tough)" },
  "polylite-pla-pro": { type: "PLA", sub: "PolyLite Pro" },
  polysonic: { type: "PLA", sub: "PolySonic (HighSpeed)" },
  silk: { type: "PLA", sub: "Silk" },
  satin: { type: "PLA", sub: "Satin" },
  marble: { type: "PLA", sub: "Marble" },
  effects: { type: "PLA", sub: "Effects" },
  specialty: { type: "Other", sub: "Specialty" },
  // SKIP at section level: "dual" + "gradient" — multi-hex shape unsupported.
};

type RawColourRow = {
  name: string;
  code?: string;
  hex?: string;
  hex1?: string;
  hex2?: string;
  oldHex?: string;
  // Other source-only fields (note, td, group, desc) are dropped silently.
};

type RawSection = {
  colors?: RawColourRow[];
};

function parseHtmlFile(
  filePath: string,
  brand: Brand,
  skipLog: { dual: number; gradient: number; noHex: number; otherSections: string[] },
): ParsedColour[] {
  const text = fs.readFileSync(filePath, "utf8");
  // Anchor on `const order =` to disambiguate any `;` inside banner strings (P-1).
  const m = text.match(/const\s+data\s*=\s*(\{[\s\S]*?\});\s*\n\s*const\s+order\s*=/);
  if (!m) {
    throw new Error(`[seed-colours] could not match data block in ${filePath}`);
  }
  // Function-eval (D-01) — input is repo-controlled, object-literal only.
  const data = new Function("return " + m[1])() as Record<string, RawSection>;
  const familyMap = brand === "Bambu" ? BAMBU_FAMILY : POLYMAKER_FAMILY;

  const out: ParsedColour[] = [];
  for (const [sectionKey, sectionVal] of Object.entries(data)) {
    const fam = familyMap[sectionKey];
    if (!fam) {
      // Track skipped sections by name so we can report which were dual/gradient.
      if (sectionKey === "dual") {
        skipLog.dual += (sectionVal.colors ?? []).length;
        console.log(
          `[seed-colours] skip section "${sectionKey}" (dual — multi-hex; ${(sectionVal.colors ?? []).length} rows)`,
        );
      } else if (sectionKey === "gradient") {
        skipLog.gradient += (sectionVal.colors ?? []).length;
        console.log(
          `[seed-colours] skip section "${sectionKey}" (gradient — no single hex; ${(sectionVal.colors ?? []).length} rows)`,
        );
      } else {
        skipLog.otherSections.push(`${brand}/${sectionKey}`);
        console.log(
          `[seed-colours] skip section "${sectionKey}" (no family mapping in ${brand} table)`,
        );
      }
      continue;
    }
    const rows = sectionVal.colors ?? [];
    for (const c of rows) {
      if (!c.hex) {
        // Catches dual (hex1/hex2) and gradient stragglers if a row leaks
        // into a mapped section (defensive — current sources don't do this).
        skipLog.noHex += 1;
        console.log(
          `[seed-colours] skip ${brand}/${c.name} (no .hex — dual or gradient straggler)`,
        );
        continue;
      }
      // Validate hex shape — guard against malformed source.
      const hexUpper = c.hex.toUpperCase();
      if (!/^#[0-9A-F]{6}$/.test(hexUpper)) {
        console.warn(
          `[seed-colours] WARN: malformed hex "${c.hex}" on ${brand}/${c.name} — skipping`,
        );
        skipLog.noHex += 1;
        continue;
      }
      const rawCode = c.code?.trim();
      // Em-dash placeholder => null code (P-4). Multiple null codes coexist
      // under UNIQUE(brand, code) because MySQL treats NULL as never equal.
      const code = rawCode && rawCode !== "—" ? rawCode : null;
      out.push({
        name: c.name.trim(),
        code,
        hex: hexUpper,
        oldHex: c.oldHex ? c.oldHex.toUpperCase() : null,
        familyType: fam.type,
        familySubtype: fam.sub,
        brand,
      });
    }
  }
  return out;
}

type UpsertResult = "insert" | "update" | "noop";

async function upsertColour(c: ParsedColour): Promise<UpsertResult> {
  // Natural key: (brand, code) when code present, else (brand, name) + code IS NULL.
  const where = c.code
    ? and(eq(colors.brand, c.brand), eq(colors.code, c.code))
    : and(
        eq(colors.brand, c.brand),
        eq(colors.name, c.name),
        isNull(colors.code),
      );

  const [existing] = await db.select().from(colors).where(where!).limit(1);

  if (existing) {
    const same =
      existing.name === c.name &&
      existing.hex === c.hex &&
      (existing.previousHex ?? null) === c.oldHex &&
      existing.familyType === c.familyType &&
      existing.familySubtype === c.familySubtype;
    if (same) return "noop";
    await db
      .update(colors)
      .set({
        name: c.name,
        hex: c.hex,
        previousHex: c.oldHex,
        familyType: c.familyType,
        familySubtype: c.familySubtype,
      })
      .where(eq(colors.id, existing.id));
    return "update";
  }

  await db.insert(colors).values({
    id: randomUUID(),
    name: c.name,
    hex: c.hex,
    previousHex: c.oldHex,
    brand: c.brand,
    code: c.code,
    familyType: c.familyType,
    familySubtype: c.familySubtype,
    isActive: true,
  });
  return "insert";
}

async function run() {
  const root = path.resolve(__dirname, "..");
  const bambuPath = path.join(root, "Colours", "bambu-lab-colors.html");
  const polyPath = path.join(root, "Colours", "polymaker-colors.html");

  if (!fs.existsSync(bambuPath)) throw new Error(`Missing ${bambuPath}`);
  if (!fs.existsSync(polyPath)) throw new Error(`Missing ${polyPath}`);

  const skipLog = {
    dual: 0,
    gradient: 0,
    noHex: 0,
    otherSections: [] as string[],
  };

  const parsed: ParsedColour[] = [
    ...parseHtmlFile(bambuPath, "Bambu", skipLog),
    ...parseHtmlFile(polyPath, "Polymaker", skipLog),
  ];

  console.log(`[seed-colours] parsed ${parsed.length} rows`);

  const counts = { insert: 0, update: 0, noop: 0 };
  const perBrand = new Map<Brand, { insert: number; update: number; noop: number }>([
    ["Bambu", { insert: 0, update: 0, noop: 0 }],
    ["Polymaker", { insert: 0, update: 0, noop: 0 }],
  ]);

  for (const c of parsed) {
    const result = await upsertColour(c);
    counts[result] += 1;
    perBrand.get(c.brand)![result] += 1;
  }

  console.log(
    `[seed-colours] DONE: ${counts.insert} inserts, ${counts.update} updates, ${counts.noop} noops`,
  );
  for (const [brand, b] of perBrand) {
    console.log(
      `[seed-colours]   ${brand}: ${b.insert} inserts, ${b.update} updates, ${b.noop} noops`,
    );
  }
  console.log(
    `[seed-colours]   skipped: ${skipLog.dual} dual, ${skipLog.gradient} gradient, ${skipLog.noHex} no-hex stragglers`,
  );
  if (skipLog.otherSections.length > 0) {
    console.log(
      `[seed-colours]   unmapped sections: ${skipLog.otherSections.join(", ")}`,
    );
  }
}

run()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[seed-colours] failed:", err);
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
