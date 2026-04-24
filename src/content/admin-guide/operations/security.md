---
title: Security and access
category: Operations
tags: [security, admin, password, access]
order: 5
---

# Security and access

## Admin login

The admin panel is at `/admin`. Only accounts with the **admin** role can access it. If you try to open any admin page while logged out, you'll be redirected to the login page.

There is one admin account. Do not share the password.

## Rotating the admin password

If you need to change the admin password (recommended after any security concern):

1. Contact your developer.
2. Ask them to run the admin password reset script.
3. You'll receive the new password via a secure channel.

The reset does not affect any customer sessions or orders.

## What "admin protected" means

Every admin action — saving a product, approving an order, exporting subscribers — is verified on the server before anything happens. This means that even if someone somehow loads an admin page, they cannot make changes without a valid admin session. This protection is separate from the login page redirect and acts as a second line of defence.

## Approved origins (cross-origin security)

The store only accepts admin form submissions from its own domain (`app.3dninjaz.com`). If the store is ever moved to a new domain, the developer must update the approved origins list before switching. Failing to do this will cause all admin forms to silently reject submissions after the domain change.

## Sessions

Admin sessions are stored securely server-side. Sessions expire after a period of inactivity. If you're unexpectedly logged out, just log back in — this is normal behaviour.

## What to do if the admin account is compromised

1. Contact your developer immediately.
2. They will rotate the password and invalidate all active sessions.
3. Review recent orders and product changes for anything unexpected.

**Admin page:** `/admin/settings`
