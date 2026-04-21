# Phase 11 — Site Settings + Social + Contact Fields

**Status:** COMPLETE  
**Completed:** 2026-04-20  
**Session:** 2026-04-20

## Goal

Extend `/admin/settings` with per-platform social URL inputs (WhatsApp, Instagram, Facebook, Twitter/X, TikTok, YouTube) and dedicated contact fields; wire PayPal live switch.

## What Shipped

| Commit | Description |
|--------|-------------|
| `a9d36eb` | Admin settings — social + contact fields with per-platform URLs |
| `fe2569f` | Docs — PayPal live switch marked complete (`PAYPAL_ENV=live` on server) |

## Key Decisions

- Social URLs stored in `store_settings` table (Phase 5 schema) — no new tables needed.
- Contact fields: `contact_email`, `contact_phone`, `whatsapp_number`, `whatsapp_message_template`.
- Social fields: `social_instagram`, `social_facebook`, `social_twitter`, `social_tiktok`, `social_youtube`.
- Footer component reads settings from `getStoreSettingsCached()` — conditional render hides social icons when URL is empty.

## Launch Blockers Resolved

- `PAYPAL_ENV=live` confirmed set on cPanel server — PayPal sandbox replaced with live credentials.
- WhatsApp number now editable at `/admin/settings` without code change.
- Instagram + TikTok URLs now editable — admin must fill these before launch.

## Remaining Admin Action

Admin must open `/admin/settings` and fill: Instagram URL, TikTok URL, Facebook URL (if applicable). Placeholder `#` links hide the icons when empty — no broken links.
