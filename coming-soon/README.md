# 3D Ninjaz — Coming Soon

Static landing page for 3dninjaz.com. Pure HTML + CSS + vanilla JS. No build step.

## Files
- `index.html` — single-page markup
- `styles.css` — all styles (brand tokens, responsive, reduced-motion)
- `script.js` — countdown + Formspree submit + toast
- `logo.png` — hero/favicon asset

## Before deploying — REQUIRED steps

1. **Create a Formspree form** at https://formspree.io (free tier is fine).
2. Open `index.html`, find the token `REPLACE_WITH_FORMSPREE_ID` (inside the `<form action="...">`), and replace it with your Formspree form ID (e.g. `mzzvwpqr`).
3. (Optional) Swap the Instagram and TikTok `href="#"` placeholders in the footer with the real social URLs once they exist.

## Deploy to cPanel (SSH/SFTP)

The production host is `152.53.86.223` with SSH user `ninjaz`. The web root is `/home/ninjaz/public_html/`.

> SSH password is provided separately. Enter it when prompted — do NOT store it in scripts, CI configs, or this repo.

### Upload via `scp` (recommended)

```bash
# From the project root (upload the contents of coming-soon/ into public_html/)
scp -r ./coming-soon/* ninjaz@152.53.86.223:/home/ninjaz/public_html/
```

### Or upload via `rsync`

```bash
rsync -avz --delete ./coming-soon/ ninjaz@152.53.86.223:/home/ninjaz/public_html/
```

### Or connect interactively

```bash
ssh ninjaz@152.53.86.223
# then cd /home/ninjaz/public_html/ and confirm index.html is present
```

cPanel serves `index.html` automatically as the default document. Visit https://3dninjaz.com to verify.

## Local preview

Open `index.html` directly in a browser (double-click), or serve with Python:

```bash
python -m http.server 8090 --directory ./coming-soon
# then open http://localhost:8090
```

## Notes

- `meta robots noindex` is set — remove it at launch so the site can be indexed.
  Search for the `<!-- LAUNCH DAY:` comment in `index.html` on launch day.
  Once the Next.js app takes over the domain root (see
  `.planning/phases/04-brand-launch/DEPLOY-NOTES.md`), this file is archived.
  See `.planning/phases/04-brand-launch/LAUNCH-CHECKLIST.md` for the full
  checklist.
- The page uses Google Fonts (`Russo One`, `Chakra Petch`). No other external requests.
- Countdown target: **2026-06-01 00:00 Malaysia Time (MYT / UTC+8)**. Update in `script.js` (`TARGET_MS`) if the launch date changes.
- `prefers-reduced-motion` disables shuriken spin and icon pulse animations.
