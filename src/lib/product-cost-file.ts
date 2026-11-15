// File -> grid for the bulk cost import. Kept free of DB / server-only imports
// so it can be unit tested on its own (product-cost-import.ts re-exports it).
//
// Hardening: an .xlsx is a ZIP, and ExcelJS inflates the whole thing in memory
// before any row cap could apply. So the ZIP container is validated by hand
// (central directory sizes / ratio / entry count) BEFORE ExcelJS sees the bytes,
// and worksheet dimensions are checked BEFORE any grid is built.

import { inflateRawSync } from "node:zlib";
import ExcelJS from "exceljs";
import { parse as parseCsv } from "csv-parse/sync";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_COLS = 64;
/** Template has up to 13 data columns (A-M, M = option key); only those are read. */
const READ_COLS = 13;
/** Header / note rows allowed on top of the data rows. */
const HEADER_ROWS = 12;

// ZIP limits. A real cost sheet is a handful of small XML parts.
export const ZIP_MAX_ENTRIES = 200;
export const ZIP_MAX_ENTRY_BYTES = 20 * 1024 * 1024;
export const ZIP_MAX_TOTAL_BYTES = 50 * 1024 * 1024;
export const ZIP_MAX_RATIO = 200;
/** Ratio is only judged on entries bigger than this (tiny parts compress oddly). */
const ZIP_RATIO_MIN_BYTES = 1024 * 1024;

export const UNSAFE_FILE_ERROR = "This file is not a valid or safe Excel file";

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const EOCD_MIN = 22;
const CEN_MIN = 46;
const LOC_SIG = 0x04034b50;
const LOC_MIN = 30;

/**
 * Parse the ZIP end-of-central-directory record and central directory by hand
 * and reject anything that could expand into a memory/CPU bomb. Declared sizes
 * can lie, and jszip only checks the real size AFTER it has inflated the whole
 * entry, so pass 2 inflates every entry here with a hard output cap equal to its
 * declared size: an entry that expands past what it declared is rejected before
 * ExcelJS ever sees the bytes.
 * Returns null when safe, otherwise a reason (for server logs only).
 */
export function validateZipContainer(bytes: Uint8Array): string | null {
  const len = bytes.length;
  if (len < EOCD_MIN) return "too short to be a zip";
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // EOCD sits at the end, followed by an optional comment of up to 65535 bytes.
  let eocd = -1;
  const lowest = Math.max(0, len - EOCD_MIN - 0xffff);
  for (let i = len - EOCD_MIN; i >= lowest; i--) {
    if (dv.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return "no end-of-central-directory record";

  const diskNo = dv.getUint16(eocd + 4, true);
  const cdDisk = dv.getUint16(eocd + 6, true);
  const entriesThisDisk = dv.getUint16(eocd + 8, true);
  const entries = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);

  if (diskNo !== 0 || cdDisk !== 0 || entriesThisDisk !== entries) return "multi-disk zip";
  // 0xFFFF / 0xFFFFFFFF mean ZIP64, which a <=5 MB cost sheet never needs.
  if (entries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    return "zip64 not accepted";
  }
  if (entries === 0) return "no entries";
  if (entries > ZIP_MAX_ENTRIES) return `too many entries (${entries})`;
  if (cdOffset + cdSize > eocd) return "central directory out of bounds";

  let pos = cdOffset;
  let total = 0;
  let seen = 0;
  const found: Array<{ method: number; comp: number; uncomp: number; localOffset: number }> = [];
  while (seen < entries) {
    if (pos + CEN_MIN > eocd) return "truncated central directory";
    if (dv.getUint32(pos, true) !== CEN_SIG) return "bad central directory entry";
    const comp = dv.getUint32(pos + 20, true);
    const uncomp = dv.getUint32(pos + 24, true);
    const method = dv.getUint16(pos + 10, true);
    const nameLen = dv.getUint16(pos + 28, true);
    const extraLen = dv.getUint16(pos + 30, true);
    const commentLen = dv.getUint16(pos + 32, true);
    const localOffset = dv.getUint32(pos + 42, true);

    if (comp === 0xffffffff || uncomp === 0xffffffff || localOffset === 0xffffffff) {
      return "zip64 entry not accepted";
    }
    if (localOffset >= cdOffset) return "entry data out of bounds";
    if (uncomp > ZIP_MAX_ENTRY_BYTES) return `entry too large (${uncomp} bytes)`;
    total += uncomp;
    if (total > ZIP_MAX_TOTAL_BYTES) return `total uncompressed size too large (${total})`;
    if (uncomp > ZIP_RATIO_MIN_BYTES && uncomp / Math.max(comp, 1) > ZIP_MAX_RATIO) {
      return `compression ratio too high (${uncomp}:${comp})`;
    }

    found.push({ method, comp, uncomp, localOffset });
    pos += CEN_MIN + nameLen + extraLen + commentLen;
    seen++;
  }
  if (pos > eocd) return "central directory overrun";

  // Pass 2: never trust the declared sizes. Bounded inflate of every entry.
  for (const e of found) {
    if (e.localOffset + LOC_MIN > cdOffset) return "local header out of bounds";
    if (dv.getUint32(e.localOffset, true) !== LOC_SIG) return "bad local header";
    const dataStart =
      e.localOffset +
      LOC_MIN +
      dv.getUint16(e.localOffset + 26, true) +
      dv.getUint16(e.localOffset + 28, true);
    if (dataStart + e.comp > cdOffset) return "entry data out of bounds";
    if (e.method === 0) {
      if (e.comp !== e.uncomp) return "stored entry size mismatch";
    } else if (e.method === 8) {
      let out: Buffer;
      try {
        out = inflateRawSync(bytes.subarray(dataStart, dataStart + e.comp), {
          maxOutputLength: Math.max(e.uncomp, 1),
        });
      } catch {
        return "entry does not inflate within its declared size";
      }
      if (out.length !== e.uncomp) return "entry size mismatch";
    } else {
      return "unsupported compression method";
    }
  }
  return null;
}

function cellPrimitive(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("result" in o) return cellPrimitive(o.result as ExcelJS.CellValue); // formula
    if (Array.isArray(o.richText)) {
      return (o.richText as Array<{ text: string }>).map((t) => t.text).join("");
    }
    if (typeof o.text === "string") return o.text; // hyperlink
  }
  return null;
}

const tooManyRows = `That file has more than ${MAX_IMPORT_ROWS} rows.`;
const tooManyCols = `That file has more than ${MAX_IMPORT_COLS} columns.`;

export async function fileToGrid(
  fileName: string,
  bytes: ArrayBuffer,
): Promise<{ ok: true; grid: unknown[][] } | { ok: false; error: string }> {
  if (bytes.byteLength === 0) return { ok: false, error: "That file is empty." };
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    return { ok: false, error: "That file is larger than 5 MB." };
  }
  const lower = fileName.toLowerCase();
  const maxGridRows = MAX_IMPORT_ROWS + HEADER_ROWS;
  try {
    let grid: unknown[][];
    if (lower.endsWith(".xlsx")) {
      const unsafe = validateZipContainer(new Uint8Array(bytes));
      if (unsafe) {
        console.warn("[product-cost-import] rejected xlsx container:", unsafe);
        return { ok: false, error: UNSAFE_FILE_ERROR };
      }
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(bytes);
      const ws =
        wb.worksheets.find((w) => /product\s*costs?/i.test(w.name)) ?? wb.worksheets[0];
      if (!ws) return { ok: false, error: "The workbook has no sheets." };

      // Dimension checks BEFORE any grid is built.
      if (ws.rowCount > maxGridRows || ws.actualRowCount > maxGridRows) {
        return { ok: false, error: tooManyRows };
      }
      if (ws.columnCount > MAX_IMPORT_COLS) {
        return { ok: false, error: tooManyCols };
      }
      // Bounded index loop (never includeEmpty over a sheet-declared dimension);
      // findRow does not create rows.
      grid = [];
      for (let r = 1; r <= ws.rowCount; r++) {
        const row = ws.findRow(r);
        const cells: unknown[] = [];
        if (row) for (let c = 1; c <= READ_COLS; c++) cells.push(cellPrimitive(row.getCell(c).value));
        grid.push(cells);
      }
    } else if (lower.endsWith(".csv")) {
      let text = Buffer.from(bytes).toString("utf8");
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      grid = parseCsv(text, {
        relax_column_count: true,
        skip_empty_lines: false,
        bom: true,
        // Stop reading one record past the cap (so overflow is detectable)
        // and refuse absurdly wide single records.
        to: maxGridRows + 1,
        max_record_size: 64 * 1024,
      }) as string[][];
      if (grid.some((row) => row.length > MAX_IMPORT_COLS)) {
        return { ok: false, error: tooManyCols };
      }
    } else {
      return { ok: false, error: "Upload an .xlsx or .csv file." };
    }
    if (grid.length > maxGridRows) {
      return { ok: false, error: tooManyRows };
    }
    return { ok: true, grid };
  } catch (err) {
    console.error("[product-cost-import] could not read file:", err);
    return {
      ok: false,
      error: lower.endsWith(".xlsx")
        ? UNSAFE_FILE_ERROR
        : "Could not read that file. Check it is a valid .xlsx or .csv.",
    };
  }
}
