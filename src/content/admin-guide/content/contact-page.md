---
title: Contact page and social links
category: Content
tags: [contact, social, settings]
order: 2
---

# Contact page and social links

The Contact page lives at `/contact` on the storefront. It shows your contact details and social links.

## Updating contact details

Contact details are pulled from **Settings**. To update them:

1. Go to **Settings** in the sidebar.
2. In the **Social & Contact** section, update:
   - **Contact email**
   - **Contact phone** (optional)
   - **WhatsApp number** (digits only) and **display format**
3. Click **Save settings**.

Changes appear on the storefront within about 60 seconds (the data is cached for performance).

## Social links

Social icons on the Contact page (and in the storefront footer) come from the social URLs you set in Settings. Supported platforms:

- Twitter / X
- WhatsApp
- Instagram
- Facebook
- TikTok
- Review link (Google Reviews, Trustpilot, etc.)

Leave any URL blank to hide that platform's icon. You don't need to have all of them — only fill in the ones you actually use.

## WhatsApp link format

The WhatsApp number field expects **digits only** in E.164 format (no `+`, no spaces):
- Correct: `60167203048`
- Wrong: `+60167203048` or `016-720 3048`

The system builds the `wa.me/` deep-link automatically from this number.

**Admin page:** `/admin/settings`

**Storefront page:** `/contact`
