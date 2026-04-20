---
phase: 07-manual-orders-ops-images
plan: 08
title: Sharp image pipeline + responsive <picture> + cache headers + backfill
status: complete
duration_min: 18
completed_at: 2026-04-20
requirements: [IMG-01, IMG-02, IMG-03]
key_files_created:
  - src/lib/image-pipeline.ts
  - src/lib/image-manifest.ts
  - src/components/storefront/responsive-product-image.tsx
  - scripts/phase7-image-backfill.cjs
key_files_modified:
  - src/lib/storage.ts
  - src/components/store/product-card.tsx
  - src/components/store/product-gallery.tsx
  - src/components/store/product-detail.tsx
  - src/app/(store)/products/[slug]/page.tsx
  - next.config.ts
key_decisions:
  - "ProductGallery is 'use client' — adapted by passing pre-resolved PictureData[] from server (PDP page calls pickImage in parallel)."
  - "ProductCard converted to async server component to use ResponsiveProductImage."
  - "writeUpload return shape is now a base URL (directory) — pickImage(baseUrl) reads manifest.json."
  - "Backfill script only runs against legacy file-shape uploads in public/uploads/products/<bucket>/."
  - "Skipped Vitest tests (deferred per 07-03 SUMMARY)."
---

# Phase 07 Plan 08: Image pipeline Summary

Every uploaded image now becomes WebP+AVIF+JPEG at 400/800/1600 widths
behind long-cache headers; storefront emits `<picture>` with srcset.
Existing legacy uploads are migrated by the one-shot backfill script.

## What was built

**Pipeline (`src/lib/image-pipeline.ts`)**
- `compressUploadedImage(buf, baseDir)` writes orig.<ext> + 9 variants
  (3 widths × {webp, avif, jpg}) + manifest.json.
- Quality: WebP 78, AVIF 60, JPEG 82 mozjpeg.
- Downscale-only (skipUpscale).
- Hard guardrails (T-07-08-image-DoS): 10MB pre-compress cap, 100M-pixel
  area cap, animated GIF >5s rejected.
- Mime sniff via magic bytes (T-07-08-mime-spoof — ignores multipart
  Content-Type header).

**Manifest reader (`src/lib/image-manifest.ts`)**
- `pickImage(baseUrl)` returns PictureData. New shape (directory) reads
  manifest.json + emits 3 sources (avif/webp/jpeg) with srcset enumerating
  all widths present. Legacy shape (file URL) returns empty sources +
  fallbackSrc = baseUrl.

**Storage (`src/lib/storage.ts`)**
- writeUpload now delegates to compressUploadedImage. Returns base URL
  (directory, no extension). Pre-compress cap raised to 10MB.
- deleteUpload handles both legacy file + new directory shape via
  fs.stat dispatch + fs.rm({ recursive: true }).

**Storefront wiring**
- `ResponsiveProductImage` (async server component) — `<picture>` shell.
  Used by ProductCard.
- ProductCard: switched from next/Image -> ResponsiveProductImage.
  Component is now async (allowed by RSC).
- ProductGallery (client) accepts pre-resolved `pictures: PictureData[]`
  prop and renders `<picture>` inline with avif/webp/jpeg sources;
  thumbnail strip too. Falls back to plain <img> for legacy URLs.
- ProductDetail forwards pictures prop.
- /products/[slug] page calls Promise.all(images.map(pickImage)) in
  parallel with the existing isWishlisted + listProductReviews.

**Cache headers (`next.config.ts`)**
- async headers() emits `Cache-Control: public, max-age=31536000, immutable`
  for `/uploads/:path*\\.(webp|avif|jpg|jpeg|png|gif)`. Variants are
  content-addressed (UUID dirs) so immutability is safe.

**Backfill (`scripts/phase7-image-backfill.cjs`)**
- Walks public/uploads/products/<bucket>/, converts legacy <uuid>.<ext>
  to <uuid>/{orig,400w,800w,1600w}, writes manifest.json, removes the
  loose source file.
- Then UPDATE products.images JSON to drop the .ext suffix on each URL.
- Idempotent — skips dirs that already have manifest.json.

## Verification

- `node -c scripts/phase7-image-backfill.cjs` syntax OK.
- `npx tsc --noEmit` exits 0.
- sharp 0.34.5 importable (verified in 07-01).
- Live LCP / Lighthouse measurement deferred to wave-end deploy.

## Deferred Issues

- **Sharp install on cPanel CloudLinux Node 20** — sharp is a native
  module. Plan calls for a fallback-and-document path if install fails
  on the alt-nodejs20 platform. Will verify during deploy + document
  outcome.
- **Vitest tests for image-pipeline.ts** — Plan called for 8 unit tests;
  deferred per 07-03 deferred-items.

## Deviations from Plan

**1. [Rule 1 - Bug] ProductGallery already client component — adapted shape**
- **Found during:** Task 2
- **Issue:** Plan implies ResponsiveProductImage drops into all consumer
  sites. ProductGallery is "use client" and async server components
  cannot nest inside.
- **Fix:** Pass pre-resolved `pictures: PictureData[]` from PDP page;
  client gallery renders `<picture>` inline. Documented in plan
  decisions.
- **Commit:** 0d90820

**2. [Rule 2 - Critical] ProductCard converted to async server component**
- **Found during:** Task 2
- **Issue:** Default-export func ProductCard was sync; needed await
  pickImage from ResponsiveProductImage.
- **Fix:** Converted to `export async function`. RSC supports async
  default exports. Callers don't need changes (Next 15 handles async
  RSC fine).
- **Commit:** 0d90820

## Self-Check: PASSED

- src/lib/image-pipeline.ts + image-manifest.ts: FOUND
- ResponsiveProductImage component: FOUND
- next.config.ts headers() block: VERIFIED
- scripts/phase7-image-backfill.cjs: FOUND
- Commit 0d90820: FOUND
