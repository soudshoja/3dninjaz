# Phase 25 GAP-01: Icon Crop + Typing-Affordance UX Fixes

> Two human-UAT bugs on the live mixed letter+icon square-keychain feature: (1) icons rendered near-invisible because every asset was a 512×512 canvas with only ~38×38px of visible content, and (2) there was no visible "place to type" — the letter input was an `opacity-0` overlay on a dashed add-button. Both fixed as a pure asset + front-end presentational change; the `KeycapSlot[]` data model, serialization, and server re-derive logic were untouched.

Branch: `fix/phase-25-icon-crop-and-typing-ux` (committed locally only — not pushed, no PR).

---

## Bug 1 — Icons cropped wrong (near-invisible at display size)

### Root cause
Every extracted `public/icons/keycaps/<id>.webp` was the raw `Metadata/top_N.png` render: a 512×512 canvas whose visible icon content only occupied a centred ~38×38px region. Verified with `sharp().trim()`:

| Icon | Before (full → trimmed content) | % of canvas (linear) |
|------|--------------------------------|----------------------|
| alien | 512×512 → 39×38 | ~7.4% |
| skull | 512×512 → 38×38 | ~7.4% |
| mario | 512×512 → 38×38 | ~7.4% |
| batman | 512×512 → 38×38 | ~7.4% |
| wifi | 512×512 → 38×39 | ~7.4% |

At the 40–56px display sizes used across the app, `object-fit: contain` shrank that already-tiny content to a handful of pixels.

### Fix
- **`scripts/extract-keycap-icons.ts`** — added `cropIconToWebp(src, out)` and applied it in the webp conversion step (the only step changed; unzip/`_staging`/contact-sheet workflow left intact). Logic: `sharp().trim({ threshold: 10 })` to the real content bbox, then `.extend()` a transparent margin of ~16% of the content's longest side per side, producing a centred **square** frame where content fills ≈76% linearly (`1 / 1.32`), comfortably inside the 70–80% target.
- **`scripts/regen-keycap-icons.ts`** (new one-off) — re-extracts all 34 `top_N.png` fresh from `D:\Downloads\M batch3 keycaps p2s.3mf` (confirmed present), applies the identical trim+pad, and overwrites each committed `public/icons/keycaps/<id>.webp` in place. The already-approved plate→id mapping was reused verbatim (sorted `top_N` ascending = `KEYCAP_ICONS` catalog order); **no human re-verification**, since only the crop was wrong, not the mapping.

### Verification (after regen)
`sharp().trim()` re-run on samples:

| Icon | After (full → trimmed content) | % of canvas (linear) |
|------|--------------------------------|----------------------|
| alien | 51×51 → 39×38 | ~76% |
| skull | 50×50 → 38×38 | ~76% |
| mario | 50×50 → 38×38 | ~76% |
| batman | 50×50 → 38×38 | ~76% |
| wifi | 51×51 → 38×39 | ~76% |

Content now fills ~76% linearly (up from ~7%). All 34 icons regenerated and committed.

### Why no component changes were needed
All four consumers reference `imageUrl` from the shared catalog and render via `<img>` with `object-fit: contain`, so fixing the source asset fixes every surface. Confirmed by reading each:
- `src/components/store/keycap-icon-picker.tsx` — `<img … objectFit: "contain">`
- `src/components/admin/icon-picker-dialog.tsx` — `<img src={icon.imageUrl}>`
- `src/components/store/keychain-preview.tsx` — `<img src={iconUrl} … objectFit: "contain">`
- `src/components/store/configurator-form.tsx` (icon slot tile) — `<img … objectFit: "contain">`

No code change to any of them for Bug 1.

---

## Bug 2 — "Nowhere to type" (invisible letter-input affordance)

### Root cause
The letter entry point was an `opacity-0` `<input>` absolutely positioned over a dashed **"+ Letter"** button. Functionally it worked (focus once, then keep typing → each keystroke appends a letter tile), but visually it read as an *add button*, not a text field — no caret, no box, no "type here" cue. Icons were behind a separate **"+ Icon"** dialog trigger.

### Fix (in `src/components/store/configurator-form.tsx`, `KeycapSeqField`)
Per the user's clarified direction — a visible text field on top, icon options laid out visibly below, no `+` buttons/dialog on the customer builder:

1. **Visible text input (top):** a real bordered/filled input (min-height 56px, blue focus ring + `caretColor`, placeholder `Type your name…` → `Keep typing…` once letters exist → `Maximum keycaps reached` at cap). It wires to the **unchanged** `handleLetterInput` / `handleLetterKeyDown` — same uppercase / `allowedChars` / `maxSlots` filtering and Backspace-removes-last/editing mechanics. The field stays empty by design (letters live as tiles in the rail); only the *look* of the trigger changed.
2. **Always-visible inline icon grid (below):** the icon options render directly inline (wrapping `auto-fill minmax(48px, 1fr)` grid of ~48px thumbnails, purple-accented card) — no dialog. Tapping a thumbnail appends via the **unchanged** `addIcon`, plus a brief ~450ms green ring + check as the dialog-free confirmation. Hidden entirely when `allowedIconIds` is empty (letter-only graceful degrade).
3. **Built-sequence rail** now renders only once ≥1 slot exists (dashed empty tile removed — the input's placeholder is the empty affordance). Icon tiles in the rail became display-only + removable (change an icon by removing + re-tapping from the grid), so the `KeycapIconPicker` dialog + `replaceIcon` path were dropped and the unused import removed.
4. **Copy** refreshed to match the visible-input framing (`Type letters above and tap icons — up to N keycaps, mixed in any order.`).

Kept consistent with `25-UI-SPEC.md`: blue = letter accent, purple = icon accent, green = selected/confirm, 56px letter tiles / 48px icon-grid cells, existing counter + "Maximum reached" rose chip preserved. The **admin** allow-list picker (`icon-picker-dialog.tsx`) is a separate admin-only surface and was intentionally left as a dialog.

---

## Constraints honoured
- Did **not** touch `keychain-parts.ts`, `config-fields.ts`, DB schema, or any server capture logic (`paypal.ts` / `admin-pos.ts` / `whatsapp-order.ts`). Pure asset + presentational change.
- Did **not** touch round-keychain code paths.
- `npx tsc --noEmit` — clean (exit 0) after both changes.
- Each logical change committed separately.
- Not pushed; no PR opened.

## Commits (local, this branch)
- `347bd7f` — `fix(25-GAP-01): trim+pad keycap icon crop so icons read at display size` (pipeline script + one-off regen script + 34 regenerated assets)
- `a0a3329` — `fix(25-GAP-01): make keycap letter input visible + inline icon grid` (configurator-form UX rework)

## Verification performed
- Bug 1: before/after `sharp().trim()` dimension probe on alien/skull/mario/batman/wifi (table above); all 34 regenerated with content ~76% of frame.
- Bug 2: `npx tsc --noEmit` clean; confirmed removed copy ("+ Letter"/"+ Icon"/"Start your keychain") is not referenced by any test or other component.

## Notes / follow-ups for reviewer
- Visual/interaction confirmation (typing + tapping icons on the live PDP) is worth a human spot-check in the browser — this summary verifies asset dimensions and typecheck, not a rendered screenshot.
- `scripts/regen-keycap-icons.ts` is a documented one-off kept in the tree; safe to delete if you prefer not to retain it.
