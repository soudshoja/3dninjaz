/**
 * Integration smoke-test for the unified product image pipeline.
 *
 * Verifies three code paths:
 *   1. Admin-form path — pre-generated UUID, images go straight to /<productId>/
 *   2. Seed-script path  — server-generated UUID, no pre-generation
 *   3. Direct persistProductImage call (migration / bulk-import style)
 *
 * Each path checks:
 *   - Returned URL matches /uploads/products/<productId>/<uuid> — never /new/
 *   - manifest.json was written
 *   - resolveProductImage returns valid PictureData with WebP + AVIF sources
 *   - No /new/ directory is created on disk
 *
 * Run:
 *   dotenv -e .env.local -- npx tsx scripts/verify-image-pipeline.ts
 *
 * Exits 0 on all-pass, 1 on any failure.
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { persistProductImage, resolveProductImage, repairImageDir } from "../src/lib/product-images";
import { compressUploadedImage } from "../src/lib/image-pipeline";

// ── Config ──────────────────────────────────────────────────────────────────

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./public/uploads";
const PUBLIC_PREFIX = process.env.UPLOADS_PUBLIC_PREFIX ?? "/uploads";

// Minimal 10×10 PNG (valid image, passes Sharp sniffing and metadata decode)
const TINY_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d494844520000000a0000000a0802000000025058ea0000000970485973000003e8000003e801b57b526b0000001449444154789c63489976020f6218959e862558004e74afc9552966c70000000049454e44ae426082",
  "hex",
);

// ── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  PASS  ${msg}`);
    passed++;
  } else {
    console.error(`  FAIL  ${msg}`);
    failed++;
  }
}

async function cleanup(productId: string) {
  const dir = path.join(process.cwd(), UPLOADS_DIR, "products", productId);
  await fs.rm(dir, { recursive: true, force: true });
}

async function newDirEntryCount(): Promise<number> {
  const newDir = path.join(process.cwd(), UPLOADS_DIR, "products", "new");
  try {
    const stat = await fs.stat(newDir);
    if (!stat.isDirectory()) return 0;
    const entries = await fs.readdir(newDir);
    return entries.length;
  } catch {
    return 0;
  }
}

// ── Test 1: Admin-form path (pre-generated UUID) ─────────────────────────────

async function testAdminFormPath() {
  console.log("\nTest 1: Admin-form path (pre-generated UUID)");
  const productId = randomUUID(); // simulates what product-form.tsx generates client-side

  // Snapshot /new/ count before — we assert it doesn't grow during this test.
  const newCountBefore = await newDirEntryCount();

  try {
    const result = await persistProductImage({
      productId,
      source: TINY_PNG,
      originalFilename: "test.png",
      mimeType: "image/png",
    });

    assert(
      result.url.startsWith(`${PUBLIC_PREFIX}/products/${productId}/`),
      `URL starts with /uploads/products/${productId}/`,
    );
    assert(
      !result.url.includes("/new/"),
      "URL does not contain /new/",
    );

    // Manifest on disk
    const baseDir = path.join(
      process.cwd(), UPLOADS_DIR, "products", productId, result.imageUuid,
    );
    const manifestExists = await fs.access(path.join(baseDir, "manifest.json")).then(() => true).catch(() => false);
    assert(manifestExists, "manifest.json written to disk");

    // resolveProductImage
    const pic = await resolveProductImage(result.url);
    assert(pic !== null, "resolveProductImage returns non-null");
    assert(
      (pic?.sources.length ?? 0) >= 2,
      "PictureData has at least 2 sources (avif + webp)",
    );
    assert(
      pic?.sources.some((s) => s.type === "image/avif") ?? false,
      "PictureData includes AVIF source",
    );
    assert(
      pic?.sources.some((s) => s.type === "image/webp") ?? false,
      "PictureData includes WebP source",
    );

    // /new/ count must not have grown — no uploads to the temp bucket.
    const newCountAfter = await newDirEntryCount();
    assert(
      newCountAfter === newCountBefore,
      `/new/ directory not written to (before=${newCountBefore}, after=${newCountAfter})`,
    );

  } finally {
    await cleanup(productId);
  }
}

// ── Test 2: Seed-script path (server-generated UUID, no pre-generation) ─────

async function testSeedScriptPath() {
  console.log("\nTest 2: Seed-script path (server-generated UUID)");
  // Seed scripts call persistProductImage directly with a UUID they generate
  const productId = randomUUID();

  try {
    const result = await persistProductImage({
      productId,
      source: TINY_PNG,
      originalFilename: "seed-image.png",
      mimeType: "image/png",
    });

    assert(
      result.url.startsWith(`${PUBLIC_PREFIX}/products/${productId}/`),
      "Seed URL uses correct product bucket",
    );
    assert(!result.url.includes("/new/"), "Seed URL does not contain /new/");

    const pic = await resolveProductImage(result.url);
    assert(pic !== null, "resolveProductImage resolves seed image");
    assert(
      (pic?.sources.length ?? 0) >= 1,
      "Seed image resolves to at least 1 source",
    );

  } finally {
    await cleanup(productId);
  }
}

// ── Test 3: Direct persistProductImage (migration/bulk-import style) ─────────

async function testDirectPersistPath() {
  console.log("\nTest 3: Direct persistProductImage (migration / bulk-import style)");
  const productId = randomUUID();

  try {
    // Simulate writing multiple images for the same product
    const results = await Promise.all([
      persistProductImage({ productId, source: TINY_PNG, originalFilename: "a.png", mimeType: "image/png" }),
      persistProductImage({ productId, source: TINY_PNG, originalFilename: "b.png", mimeType: "image/png" }),
    ]);

    assert(results.length === 2, "Two images persisted");
    assert(
      results[0].imageUuid !== results[1].imageUuid,
      "Each image gets a unique UUID",
    );
    assert(
      results.every((r) => r.url.startsWith(`${PUBLIC_PREFIX}/products/${productId}/`)),
      "Both URLs use the correct product bucket",
    );

    for (const r of results) {
      const pic = await resolveProductImage(r.url);
      assert(pic !== null, `Image ${r.imageUuid} resolves correctly`);
    }

  } finally {
    await cleanup(productId);
  }
}

// ── Test 4: repairImageDir re-generates a broken manifest ───────────────────

async function testRepairImageDir() {
  console.log("\nTest 4: repairImageDir regenerates missing manifest");
  const productId = randomUUID();
  const imageUuid = randomUUID();
  const baseDir = path.join(process.cwd(), UPLOADS_DIR, "products", productId, imageUuid);

  try {
    // Write image files but omit manifest (simulates mid-encode crash)
    await fs.mkdir(baseDir, { recursive: true });
    await compressUploadedImage(TINY_PNG, baseDir, { skipBackup: false });
    const manifestPath = path.join(baseDir, "manifest.json");
    await fs.unlink(manifestPath); // delete manifest to simulate crash

    const beforeRepair = await fs.access(manifestPath).then(() => true).catch(() => false);
    assert(!beforeRepair, "manifest.json absent before repair");

    const repairResult = await repairImageDir(productId, imageUuid);
    assert(repairResult.repaired, `repairImageDir reports repaired=true (reason: ${repairResult.reason})`);

    const afterRepair = await fs.access(manifestPath).then(() => true).catch(() => false);
    assert(afterRepair, "manifest.json present after repair");

    // Verify the repaired manifest is valid
    const url = `${PUBLIC_PREFIX}/products/${productId}/${imageUuid}`;
    const pic = await resolveProductImage(url);
    assert(pic !== null, "Repaired image resolves correctly via resolveProductImage");

  } finally {
    await cleanup(productId);
  }
}

// ── Test 5: "new" bucket is rejected by persistProductImage ──────────────────

async function testNewBucketRejected() {
  console.log("\nTest 5: persistProductImage rejects productId='new'");
  let threw = false;
  try {
    await persistProductImage({
      productId: "new",
      source: TINY_PNG,
      originalFilename: "x.png",
      mimeType: "image/png",
    });
  } catch {
    threw = true;
  }
  assert(threw, "persistProductImage throws when productId='new'");
}

// ── Test 6: resolveProductImage returns null for stale /new/ URL ─────────────

async function testStaleNewUrlReturnsNull() {
  console.log("\nTest 6: resolveProductImage returns null for stale /new/ URL");
  const staleUrl = "/uploads/products/new/00000000-0000-0000-0000-000000000000";
  const result = await resolveProductImage(staleUrl);
  assert(result === null, "resolveProductImage returns null for stale /new/ URL");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== verify-image-pipeline ===");
  console.log(`UPLOADS_DIR=${UPLOADS_DIR}  PUBLIC_PREFIX=${PUBLIC_PREFIX}\n`);

  await testAdminFormPath();
  await testSeedScriptPath();
  await testDirectPersistPath();
  await testRepairImageDir();
  await testNewBucketRejected();
  await testStaleNewUrlReturnsNull();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
