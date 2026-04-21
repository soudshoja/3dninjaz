---
title: Customer accounts
category: Customers
tags: [customers, accounts, users]
order: 1
---

# Customer accounts

Customers must create an account to place an order. This lets them:
- Track their orders
- Save delivery addresses
- Submit cancel/return requests

## Viewing customers

Go to **Customers** in the sidebar to see all registered accounts. The table shows:
- Name and email
- Account creation date
- Role (customer or admin)

## Customer actions

From the Customers list, you can:
- View a customer's profile
- Change their role (e.g., promote to admin)
- Delete an account

**Caution:** Deleting a customer account is permanent. Their orders will remain in the database, but the account itself (and the ability to log in) will be removed.

## Password resets

Customers can reset their own password using the "Forgot password" link on the login page. A reset email is sent to their registered email address.

If a customer says they didn't receive the reset email, check:
1. Is the email in their spam folder?
2. Is the email correct? (Typos are common — ask them to spell it out)
3. Is the SMTP server working? Ask your server administrator to check the email logs.

## Account security

Accounts are protected by email + password login. There's no social login (Google, Facebook) in this version.

Customers can change their own password from their Account → Security page.

## Admin accounts

Admin accounts have full access to the `/admin` panel. Only grant admin access to people you trust completely.

To create an admin account: ask your server administrator to run the admin seed script (`npm run seed:admin`) or promote an existing account from the Customers page.

**Admin page:** `/admin/users`
