import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import ExcelJS from "exceljs";
import {
  fileToGrid,
  validateZipContainer,
  MAX_IMPORT_COLS,
  MAX_IMPORT_ROWS,
  UNSAFE_FILE_ERROR,
} from "./product-cost-file";

function toArrayBuffer(b: Uint8Array | Buffer): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

async function workbookBytes(fill: (ws: ExcelJS.Worksheet) => void): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Product costs");
  fill(ws);
  return toArrayBuffer(Buffer.from(await wb.xlsx.writeBuffer()));
}

/** Hand-build a ZIP whose central directory declares the given sizes. */
function craftZip(
  entries: Array<{ name: string; comp: number; uncomp: number }>,
): ArrayBuffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    parts.push(local);
    const cen = Buffer.alloc(46 + name.length);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt32LE(e.comp, 20);
    cen.writeUInt32LE(e.uncomp, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    name.copy(cen, 46);
    central.push(cen);
    offset += local.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return toArrayBuffer(Buffer.concat([...parts, cd, eocd]));
}

/** One-entry ZIP with REAL deflated data but a central directory that lies about the size. */
function liarZip(realBytes: number, declaredUncomp: number): ArrayBuffer {
  const data = deflateRawSync(Buffer.alloc(realBytes));
  const name = Buffer.from("xl/worksheets/sheet1.xml");
  const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(name.length, 26);
  name.copy(local, 30);
  const cen = Buffer.alloc(46 + name.length);
  cen.writeUInt32LE(0x02014b50, 0);
  cen.writeUInt16LE(8, 10);
  cen.writeUInt32LE(data.length, 20);
  cen.writeUInt32LE(declaredUncomp, 24);
  cen.writeUInt16LE(name.length, 28);
  cen.writeUInt32LE(0, 42);
  name.copy(cen, 46);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cen.length, 12);
  eocd.writeUInt32LE(local.length + data.length, 16);
  return toArrayBuffer(Buffer.concat([local, data, cen, eocd]));
}

describe("fileToGrid limits", () => {
  it("rejects an entry that inflates past the size its header declares (lying header)", async () => {
    // 30 MB of zeros compresses to ~30 KB; header claims 1 KB, so declared-size checks pass.
    const bytes = liarZip(30 * 1024 * 1024, 1024);
    expect(validateZipContainer(new Uint8Array(bytes))).toMatch(/declared size/);
    expect(await fileToGrid("liar.xlsx", bytes)).toEqual({ ok: false, error: UNSAFE_FILE_ERROR });
  });

  it("accepts an entry whose declared size is honest", () => {
    const bytes = liarZip(2048, 2048);
    expect(validateZipContainer(new Uint8Array(bytes))).toBeNull();
  });

  it("accepts a normal 80-row template", async () => {
    const bytes = await workbookBytes((ws) => {
      ws.addRow(["title"]);
      ws.addRow(["note"]);
      ws.addRow(["note"]);
      ws.addRow(["Product ID (do not edit)", "Product name", "Type", "Category", "Sell price (RM)", "Tiers", "Cost (RM)", "Extra"]);
      for (let i = 0; i < 80; i++) ws.addRow([`id-${i}`, `Product ${i}`, "simple", "Cat", 10, "", 3.5, ""]);
    });
    expect(validateZipContainer(new Uint8Array(bytes))).toBeNull();
    const res = await fileToGrid("template.xlsx", bytes);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.grid.length).toBe(84);
      expect(res.grid[4][0]).toBe("id-0");
      expect(res.grid[83][6]).toBe(3.5);
    }
  });

  it("rejects a zip declaring an oversized uncompressed entry", async () => {
    const bytes = craftZip([{ name: "xl/worksheets/sheet1.xml", comp: 1000, uncomp: 100 * 1024 * 1024 }]);
    expect(validateZipContainer(new Uint8Array(bytes))).toMatch(/too large/);
    const res = await fileToGrid("bomb.xlsx", bytes);
    expect(res).toEqual({ ok: false, error: UNSAFE_FILE_ERROR });
  });

  it("rejects an absurd compression ratio, too many entries and oversized totals", () => {
    expect(
      validateZipContainer(
        new Uint8Array(craftZip([{ name: "a.xml", comp: 5000, uncomp: 15 * 1024 * 1024 }])),
      ),
    ).toMatch(/ratio/);
    const many = Array.from({ length: 201 }, (_, i) => ({ name: `f${i}`, comp: 10, uncomp: 10 }));
    expect(validateZipContainer(new Uint8Array(craftZip(many)))).toMatch(/too many entries/);
    const big = Array.from({ length: 4 }, (_, i) => ({
      name: `f${i}`,
      comp: 15 * 1024 * 1024,
      uncomp: 15 * 1024 * 1024,
    }));
    expect(validateZipContainer(new Uint8Array(craftZip(big)))).toMatch(/total/);
  });

  it("rejects a non-zip buffer", async () => {
    const junk = toArrayBuffer(Buffer.from("this is definitely not a spreadsheet".repeat(10)));
    expect(validateZipContainer(new Uint8Array(junk))).not.toBeNull();
    expect(await fileToGrid("fake.xlsx", junk)).toEqual({ ok: false, error: UNSAFE_FILE_ERROR });
  });

  it("rejects a sheet claiming 1,000,000 rows without building a grid", async () => {
    const bytes = await workbookBytes((ws) => {
      ws.addRow(["a"]);
      ws.getCell(1_000_000, 1).value = "far away";
    });
    const res = await fileToGrid("huge.xlsx", bytes);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain(`more than ${MAX_IMPORT_ROWS} rows`);
  });

  it("rejects a sheet that is too wide", async () => {
    const bytes = await workbookBytes((ws) => {
      ws.getCell(1, MAX_IMPORT_COLS + 50).value = "wide";
    });
    const res = await fileToGrid("wide.xlsx", bytes);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("columns");
  });

  it("applies the same caps to CSV", async () => {
    const enc = (s: string) => toArrayBuffer(Buffer.from(s));
    const ok = await fileToGrid("c.csv", enc("id,name,cost\n1,a,2\n2,b,3\n"));
    expect(ok.ok).toBe(true);
    const longCsv = await fileToGrid("c.csv", enc("x\n".repeat(MAX_IMPORT_ROWS + 500)));
    expect(longCsv.ok).toBe(false);
    if (!longCsv.ok) expect(longCsv.error).toContain("rows");
    const wide = await fileToGrid("c.csv", enc(",".repeat(MAX_IMPORT_COLS + 10) + "\n"));
    expect(wide.ok).toBe(false);
    if (!wide.ok) expect(wide.error).toContain("columns");
  });
});
