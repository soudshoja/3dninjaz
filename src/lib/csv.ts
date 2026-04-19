import "server-only";
import { parse } from "csv-parse/sync";
import { readFile, stat } from "node:fs/promises";

// ============================================================================
// Plan 05-05 — server-side CSV parser + row normaliser.
//
// Hard limits (T-05-05-injection):
//   - 5 MB max file size
//   - 1000 rows max
//   - strict column count (rejects ragged CSVs)
//
// Image policy (Q-05-05 / T-05-05-SSRF):
//   - External http://… or https://… image URLs are REJECTED
//   - Only /uploads/products/… paths are accepted (admin must upload via
//     existing image-uploader BEFORE running CSV import)
// ============================================================================

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 1000;

export type CsvRow = Record<string, string>;

export type NormalizedCsvRow = {
  row: Record<string, string>;
  images: string[];
  errors: string[];
};

export async function parseCsvStream(filePath: string): Promise<CsvRow[]> {
  const fileStat = await stat(filePath);
  if (fileStat.size > MAX_BYTES) {
    throw new Error(`CSV too large: ${fileStat.size} bytes (max ${MAX_BYTES})`);
  }
  const buf = await readFile(filePath);
  const rows = parse(buf, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: false,
  }) as CsvRow[];
  if (rows.length > MAX_ROWS) {
    throw new Error(`Too many rows: ${rows.length} (max ${MAX_ROWS})`);
  }
  return rows;
}

/**
 * Normalise a raw CSV row:
 *   - lowercases + spaces → underscores in keys
 *   - extracts image_url_1..N into a separate `images` array
 *   - rejects external URLs (T-05-05-SSRF)
 *
 * Returns errors so the caller can surface them inline in the preview.
 */
export function normalizeCsvRow(raw: CsvRow): NormalizedCsvRow {
  const row: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    row[k.toLowerCase().replace(/\s+/g, "_")] = String(v ?? "").trim();
  }

  const errors: string[] = [];
  const imageKeys = Object.keys(row).filter((k) => /^image_url_\d+$/.test(k));
  const images: string[] = [];
  for (const k of imageKeys) {
    const v = row[k];
    if (!v) continue;
    if (v.startsWith("http://") || v.startsWith("https://")) {
      errors.push(
        `${k}: external URLs are not allowed — upload images via the product form first, then reference /uploads/products/... paths`,
      );
      continue;
    }
    if (!v.startsWith("/uploads/products/")) {
      errors.push(`${k}: must be a /uploads/products/... path`);
      continue;
    }
    images.push(v);
  }

  return { row, images, errors };
}

export function slugifyForImport(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 220);
}
