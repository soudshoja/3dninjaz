# Phase 25 Gap-Closure 04: Revert icon Base-colour matching + swap 2 icon assets

**Date:** 2026-07-20

## Decision reversal (explicit user request)

After live testing, the user decided icon keycaps should go back to **fully
fixed colours** — undoing the "icon shell follows customer's Base colour"
behaviour added in #194 and refined in #196. This restores the original D-04
decision: icon slots never use any customer colour choice, letter slots are
unaffected (still follow Base/Clicker/Letter as normal).

### Reverted
- `src/components/store/keychain-preview.tsx` — icon slot shell restored to
  a fixed `#FFFFFF` (`ICON_SHELL_WHITE` constant reinstated), letter slots
  unchanged (still `baseHex`).
- `src/actions/admin-production.ts` — icon production batches restored to
  keying by icon id only (dropped the `${iconId}::${base}` composite key and
  the `baseColour` field from `KeychainIconBatch`).
- `src/components/admin/keychain-batches.tsx` — `IconBatchCard` restored to
  plain "icon · fixed colour" label (dropped the colour-swatch display).

### NOT reverted (independent, still correct)
- PR #195's fit-parity fix (icon frame matches letter clicker-face size
  exactly) — unrelated to colour, stays.
- PR #196's transparency strip on 32/34 icons — unrelated to colour, stays
  (icons still render as their own artwork with a clean background instead
  of a baked-in opaque render; they just now sit on a fixed white CSS shell
  again instead of a colour-matched one).

## Icon asset swap (2 of 34)

A new externally-generated icon batch was reviewed
(`D:\Downloads\all-extracted-individual-icons`, 34 icons, SVG + PNG variants
pre-sized to our exact 42.66×42.66 clicker-face dimension). Quality was
mixed — roughly a third of the batch (alien, skull, pixel-heart, most
franchise-logo icons) looked distorted or lost real detail compared to our
current set, and baseball still had the same missing-white-ball problem.

**Cherry-picked 2 genuine improvements only:**
- `snowman.webp` — the new source has an intact white body (ours had faded
  during the #196 chroma-key strip since snowman's body is the same tone as
  the shell it sat on).
- `santa-hat.webp` — the new source has crisp white fur trim (ours was
  faded for the same reason).

Both converted to our convention: trimmed to content, resized to fit a 44px
box, centred on a 50×50 transparent canvas (matching the sizing of the
other 32 icons), verified visually before committing.

**All other 32 icons unchanged** — the rest of the new batch was rejected as
lower quality than what's already live.

## Verification
- `npx tsc --noEmit` clean
- `npx vitest run src/lib/keychain-parts.test.ts` — 13/13 passing
- No `baseColour` references remain anywhere in `src/`
- Visually verified `snowman.webp` and `santa-hat.webp` before committing
