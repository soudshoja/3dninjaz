# Phase 25 Gap-Closure 03: Strip baked-in shell white from icon assets

**Date:** 2026-07-19

## Root cause

The Bambu Studio `top_N.png` source render is a flattened 2D image of the
**whole physical keycap** — the white plastic shell (rendered with 3D shading,
~RGB 200-230 desaturated) plus the colour graphic on top — not a
transparent-background icon cutout. Only pixels outside the keycap's
rounded-square silhouette were ever transparent (confirmed via direct pixel
sampling: corner alpha=0, but interior "background" pixels at e.g. (10,10) and
(25,25) were fully opaque RGB ~205-228).

This meant the "icon shell follows customer's Base colour" fix (#194) had
**no visible effect** — the CSS `background: baseHex` sits behind an opaque
image that already fully covers the frame with its own baked-in white shell
render.

## Fix

`scripts/strip-icon-shell-white.ts` — chroma-keys near-white/desaturated
pixels to transparent (soft-feathered ramp between RGB 150 and 235, not a
hard cutoff, to avoid jagged edges), leaving only the icon's actual
coloured/dark graphic opaque. Applied to all 34 icons, output verified
visually one-by-one (montage + individual zoomed renders) before committing.

## Manual review results

32 of 34 icons stripped cleanly — shell fades to transparent, icon graphic
(including legitimately-white content like Luigi's "L", Mario's "M", Thor's
hammer, Black Panther, skull's eye sockets, candy-cane's stripes, snowflake's
line art, snowman's hat/scarf) stays crisp and fully opaque.

**2 exceptions reverted to the original (pre-strip, fully-opaque-shell)
version** — these are monochrome white-ball designs where the icon's entire
graphic content is itself the same near-white tone as the shell, so a
colour-threshold approach cannot distinguish "shell" from "icon":

- `baseball.webp` — white ball body is indistinguishable from shell white;
  stripping left only the red stitching floating with no visible ball.
- `golf-ball.webp` — white ball body faded to near-invisible, leaving just
  the black dimple dots.

For these two, the Base-colour-matching feature (#194) will continue to show
no visible effect — the shell stays whatever the original render's white/light
tone is. This is a known, accepted limitation given the current asset
pipeline (flattened 2D renders, no access to isolated per-part 3D geometry
for these two designs specifically).

## Verification

- `npx tsc --noEmit` clean (asset-only change, no code touched)
- All 34 icons visually reviewed at full resolution (not just thumbnail
  montage scale, which was misleading for several — Luigi/Mario/Thor's
  hammer/Black Panther/ninja-face all looked broken in a small montage but
  were confirmed fine at full size)
- No component code changes needed — all consumers (customer/admin icon
  pickers, live preview, slot-rail tiles) just render whatever's in these
  webp files via `<img>`, so fixing the source assets fixes every surface

## Files changed

- `scripts/strip-icon-shell-white.ts` (new)
- 32 of 34 files under `public/icons/keycaps/*.webp` (baseball.webp and
  golf-ball.webp intentionally left unchanged)
