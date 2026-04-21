---
title: Customising automated emails
category: Operations
tags: [email, templates, automated]
order: 1
---

# Customising automated emails

The store sends transactional emails automatically for key events: order confirmation, shipping updates, refunds, password resets, and more.

All templates are editable from the admin panel.

## Getting to the templates

1. Go to **Email templates** in the sidebar (under Marketing).
2. You'll see a table with all 12 templates, their current subject line, and when they were last updated.
3. Click **Edit** on any template to open the editor.

## The editor

The template editor has three parts:
1. **Subject** — the email subject line. Supports `{{variables}}`.
2. **Body** — the full HTML email. Supports `{{variables}}`. The preview panel on the right shows how it looks.
3. **Save** button — always click Save before leaving.

## Previewing before sending

The preview panel shows the rendered email with placeholder values for variables. Check:
- Does it look right on mobile? (Most people read email on their phone)
- Is the subject line short enough to display fully? (40–60 characters recommended)
- Are all `{{variable}}` placeholders resolving correctly?

## Making safe edits

You can safely edit:
- The subject line
- The greeting ("Hi {{name}},")
- The main body text
- The closing and sign-off
- Brand colours (if you know basic HTML)

Be careful when editing:
- Links — make sure `href` values point to the right pages
- Variables — don't remove `{{` `}}` from variable names or they won't substitute

## Resetting to defaults

If you make changes and something breaks, you can reset a template to its default. Ask your developer to delete the template from the database (the table is `email_templates`). On the next page load, the admin panel will re-seed the default.

**Admin page:** `/admin/email-templates`
