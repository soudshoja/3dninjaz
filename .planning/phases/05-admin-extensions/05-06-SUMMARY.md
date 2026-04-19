---
phase: 05
plan: 06
status: complete
subsystem: email templates editor
tags: [admin, email, dompurify, iframe-sandbox, db-backed]
dependency_graph:
  requires: [05-01]
  provides:
    - "/admin/email-templates list + edit pages"
    - "renderTemplate(key, vars) DB-backed renderer"
    - "DOMPurify sanitiser used at save AND render"
    - "Existing email senders refactored to renderTemplate (signatures preserved)"
key_files:
  created:
    - src/lib/email/sanitize.ts
    - src/lib/email/templates.ts
    - src/actions/admin-email-templates.ts
    - src/app/(admin)/admin/email-templates/page.tsx
    - src/app/(admin)/admin/email-templates/[key]/edit/page.tsx
    - src/components/admin/email-template-form.tsx
    - src/components/admin/email-template-preview.tsx
  modified:
    - src/lib/email/order-confirmation.ts
    - src/lib/mailer.ts
decisions:
  - "Q-05-08: DOMPurify with strict allowlist (basic email-safe tags + attrs); FORBID_ATTR explicit on event handlers; ALLOW_DATA_ATTR=false."
  - "items_table is the only HTML_VARS member — caller pre-builds the markup, sanitiser strips scripts but preserves table structure."
  - "Preview iframe uses srcDoc + sandbox='' (no allow-scripts) so even if a malicious admin pasted markup that bypassed DOMPurify, the preview would not execute it."
  - "Legacy hardcoded templates (renderOrderConfirmationHtml, etc.) are kept as runtime fallback if DB render fails — defense-in-depth during rollout. Once verified in production we can drop them."
metrics:
  duration: ~25 min
  completed: 2026-04-19
---

# Phase 5 Plan 05-06: Admin Email Templates Editor Summary

**One-liner:** Admin can edit the HTML body and subject of `order_confirmation` and `password_reset` transactional emails via `/admin/email-templates`, with a sandboxed live preview iframe and DOMPurify sanitisation applied at both save and render time.

## Architecture

```
Admin → /admin/email-templates/[key]/edit
  └─> EmailTemplateForm
      ├─ subject input + html textarea + variable chips (insert at cursor)
      └─ EmailTemplatePreview (iframe srcDoc, sandbox="")
                              ↓
                              client-side substitute SAMPLE_VARS into html

Save → updateEmailTemplate(formData)
  ├─ Zod parse (key enum, subject 1..200, html 10..100KB)
  ├─ sanitiseEmailHtml(html)  ← DOMPurify strict allowlist
  └─ db.update emailTemplates SET subject, html=safeHtml, variables=...

Send → renderTemplate(key, vars)
  ├─ getOrSeed(key) ← lazy seed via seedEmailTemplates()
  ├─ sanitiseEmailHtml(stored)  ← defense-in-depth
  ├─ substitute {{var}}: HTML_VARS.has(name) ? sanitiseEmailHtml : escapeHtml
  └─ return { subject, html, text: htmlToText(html) }
```

## Sanitiser policy

| Allowed tags | a, b, br, div, em, h1-h4, hr, i, img, li, ol, p, span, strong, table, tbody, td, tfoot, th, thead, tr, u, ul |
| Allowed attrs | href, src, alt, title, target, rel, style, width, height, align, cellpadding, cellspacing, border, bgcolor, colspan, rowspan |
| Forbidden attrs | onerror, onload, onclick, onmouseover, onfocus, onblur, onsubmit, onmouseout, onkeydown, onkeyup, onkeypress |
| Data attrs | DISABLED |

`escapeHtml` handles `&`, `<`, `>`, `"`, `'`. Used for every variable value except those in `HTML_VARS = new Set(["items_table"])`.

## Refactor — existing senders

Both `sendOrderConfirmationEmail(orderId)` and `sendResetPasswordEmail({to, name, url})` now render via `renderTemplate(...)`. Function signatures are unchanged — every existing caller (`paypal.ts capturePayPalOrder`, `auth.ts forgotPassword hook`, `orders.ts resendOrderConfirmationEmail`) continues to work.

Each sender wraps the renderTemplate call in a try/catch; on render failure it falls back to the legacy hardcoded body + a console.warn. This keeps password-reset and order-confirmation flows resilient during the rollout window.

## Threat mitigations engaged

| Threat | Mitigation |
|---|---|
| T-05-06-EoP | `requireAdmin()` first await in every admin action |
| T-05-06-HTML | DOMPurify on save **and** render; iframe sandbox='' (no JS) |
| T-05-06-XSS-variable | Default HTML-escape; only explicit HTML_VARS bypass escape |
| T-05-06-DoS | 100KB HTML cap in Zod (from 05-01 validators) |
| T-05-06-clickjacking | srcDoc iframe; sandbox='' blocks navigation + scripts |
| T-05-06-CSRF | Server actions inherit Next.js CSRF (no concern) |
| T-05-06-stale-template | No cache; reads DB per email send (templates table is 2 rows, fast) |

## Mobile validation

- `<EmailTemplateForm>` uses `lg:grid-cols-[1fr_minmax(0,1fr)]` — form left, preview right on desktop; stacked on mobile (form first, preview below).
- Variable chips are `min-h-[40px]` and wrap on narrow widths.
- Save button is `min-h-[48px]`.
- Preview iframe height is fixed at 600px so admin can scroll within it on mobile.

## Self-Check: PASSED

- ✅ All 7 created files exist (commit a4ac7b4)
- ✅ /admin/email-templates lazy-seeds 2 rows on first visit
- ✅ /admin/email-templates/[key]/edit shows form + preview iframe with sandbox=''
- ✅ DOMPurify sanitises on save (verified by Zod path through updateEmailTemplate)
- ✅ Existing email senders preserved signatures + fall back to legacy on DB error
- ✅ tsc --noEmit clean
