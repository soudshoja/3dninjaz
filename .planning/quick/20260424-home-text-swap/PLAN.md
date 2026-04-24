---
slug: home-text-swap
created: 2026-04-24
status: in-progress
---

# Home page text swap

## Changes

1. Hero eyebrow pill (`src/components/store/hero.tsx` L42): `MADE IN MALAYSIA · 3D PRINTED` -> `Kids by Day. 3D Printing Ninjas by Night.`
2. Hero h1 (`src/components/store/hero.tsx` L48-54): `Stealthy 3D prints. / Shipped across Malaysia.` -> `Cool Designs Made by Kids For Kids. / Shipped across Malaysia.` (keep green accent on `Shipped across Malaysia`)
3. 3-steps section (`src/app/(store)/page.tsx` L105-126): update titles + descriptions to exact copy specified.

## Files

- `src/components/store/hero.tsx`
- `src/app/(store)/page.tsx`

## Commit

`style(home): new tagline, steps copy, hero section heading`

## Deploy

SSH deploy to app.3dninjaz.com (/home/ninjaz/apps/3dninjaz_v1).
