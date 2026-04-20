/* eslint-disable no-console */
/**
 * Phase 7 (07-08) — one-shot image backfill.
 *
 * Walks public/uploads/products/<bucket>/ for legacy file-shape uploads
 * (e.g. <uuid>.jpg directly inside the bucket) and converts each into the
 * new directory shape:
 *
 *   <bucket>/<uuid>/orig.<ext>
 *   <bucket>/<uuid>/{400,800,1600}w.{webp,avif,jpg}
 *   <bucket>/<uuid>/manifest.json
 *
 * After conversion, updates products.images JSON in MariaDB to drop the
 * trailing extension (so URLs become base URLs). Idempotent: dirs that
 * already have manifest.json are skipped.
 *
 * Q-07-06 default: backfill via this script (admin runs it once).
 */
"use strict";
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const mysql = require("mysql2/promise");

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fsSync.existsSync(envPath)) return;
  const text = fsSync.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const WIDTHS = [400, 800, 1600];

async function processOne(bucketDir, fileName) {
  const ext = fileName.match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase() ?? "jpg";
  const id = fileName.replace(/\.[a-z0-9]+$/i, "");
  const baseDir = path.join(bucketDir, id);
  const filePath = path.join(bucketDir, fileName);

  // Skip if already converted.
  try {
    await fs.stat(path.join(baseDir, "manifest.json"));
    return { status: "skip", id };
  } catch {
    // no manifest -> proceed
  }

  await fs.mkdir(baseDir, { recursive: true });
  const buf = await fs.readFile(filePath);
  // Move source -> orig.<ext>
  await fs.writeFile(path.join(baseDir, `orig.${ext}`), buf);

  const meta = await sharp(buf).metadata();
  const w = meta.width || 0;
  const variants = [];
  for (const targetW of WIDTHS) {
    if (targetW > w + 1) continue;
    const pipe = () =>
      sharp(buf)
        .rotate()
        .resize({ width: targetW, withoutEnlargement: true });
    await pipe()
      .webp({ quality: 78 })
      .toFile(path.join(baseDir, `${targetW}w.webp`));
    await pipe()
      .avif({ quality: 60 })
      .toFile(path.join(baseDir, `${targetW}w.avif`));
    await pipe()
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(baseDir, `${targetW}w.jpg`));
    variants.push({
      width: targetW,
      webp: `${targetW}w.webp`,
      avif: `${targetW}w.avif`,
      jpg: `${targetW}w.jpg`,
    });
  }
  if (variants.length === 0) {
    const targetW = w || 400;
    const pipe = () =>
      sharp(buf)
        .rotate()
        .resize({ width: targetW, withoutEnlargement: true });
    await pipe()
      .webp({ quality: 78 })
      .toFile(path.join(baseDir, `${targetW}w.webp`));
    await pipe()
      .avif({ quality: 60 })
      .toFile(path.join(baseDir, `${targetW}w.avif`));
    await pipe()
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(baseDir, `${targetW}w.jpg`));
    variants.push({
      width: targetW,
      webp: `${targetW}w.webp`,
      avif: `${targetW}w.avif`,
      jpg: `${targetW}w.jpg`,
    });
  }
  const manifest = {
    widths: variants.map((v) => v.width),
    variants,
    original: `orig.${ext}`,
    sourceWidth: w,
    sourceHeight: meta.height || 0,
  };
  await fs.writeFile(
    path.join(baseDir, "manifest.json"),
    JSON.stringify(manifest),
  );
  // Remove the original loose file now that orig.<ext> is the canonical copy.
  try {
    await fs.unlink(filePath);
  } catch {
    // ignore
  }
  return { status: "ok", id };
}

async function main() {
  loadEnv();
  const root = path.join(process.cwd(), "public", "uploads", "products");
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  const buckets = await fs.readdir(root).catch(() => []);
  for (const b of buckets) {
    const bdir = path.join(root, b);
    const stat = await fs.stat(bdir).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;
    const entries = await fs.readdir(bdir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (!/\.(jpe?g|png|webp|gif)$/i.test(e.name)) continue;
      try {
        const r = await processOne(bdir, e.name);
        if (r.status === "ok") processed++;
        else skipped++;
      } catch (err) {
        failed++;
        console.error("backfill failed", e.name, err);
      }
    }
  }

  // Update products.images JSON: drop the .ext when it matches the converted
  // file shape.
  const url = process.env.DATABASE_URL;
  if (url) {
    const conn = await mysql.createConnection(url);
    const [rows] = await conn.execute("SELECT id, images FROM products");
    let mutatedCount = 0;
    for (const r of rows) {
      let imgs;
      if (typeof r.images === "string") {
        try {
          imgs = JSON.parse(r.images);
        } catch {
          imgs = [];
        }
      } else if (Array.isArray(r.images)) {
        imgs = r.images;
      } else {
        imgs = [];
      }
      let mutated = false;
      const next = imgs.map((u) => {
        const m = String(u).match(
          /^(\/uploads\/products\/[^/]+\/)([^/]+)\.(jpe?g|png|webp|gif)$/i,
        );
        if (m) {
          mutated = true;
          return `${m[1]}${m[2]}`;
        }
        return u;
      });
      if (mutated) {
        await conn.execute(
          "UPDATE products SET images = ? WHERE id = ?",
          [JSON.stringify(next), r.id],
        );
        mutatedCount++;
      }
    }
    await conn.end();
    console.log(
      `backfill done: ${processed} processed, ${skipped} skipped, ${failed} failed, ${mutatedCount} product rows updated`,
    );
  } else {
    console.log(
      `backfill done: ${processed} processed, ${skipped} skipped, ${failed} failed (DB update skipped — no DATABASE_URL)`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
