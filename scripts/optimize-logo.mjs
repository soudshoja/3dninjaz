#!/usr/bin/env node
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const src = path.join(projectRoot, 'public', 'logo.png');

try {
  console.log('Optimizing logo...');

  // Main optimized PNG (same path, lossily compressed)
  console.log('Creating optimized PNG...');
  await sharp(src)
    .png({ compressionLevel: 9, palette: true })
    .toFile(path.join(projectRoot, 'public', 'logo-optimized.png'));

  // Medium WebP (main logo)
  console.log('Creating main WebP...');
  await sharp(src)
    .resize(800, null, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(path.join(projectRoot, 'public', 'logo.webp'));

  // Small WebP (nav/header)
  console.log('Creating small WebP...');
  await sharp(src)
    .resize(400, null, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path.join(projectRoot, 'public', 'logo-sm.webp'));

  // Extra small WebP (mobile nav)
  console.log('Creating extra small WebP...');
  await sharp(src)
    .resize(200, null, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(path.join(projectRoot, 'public', 'logo-xs.webp'));

  console.log('✓ Logo optimization complete!');
  console.log('Check public/ for logo.webp, logo-sm.webp, logo-xs.webp, logo-optimized.png');
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
