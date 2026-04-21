---
title: Nightly reconciliation
category: Payments
tags: [reconciliation, paypal, drift]
order: 2
---

# Nightly reconciliation

Every night at 3:00 AM (Malaysian time), the store automatically compares its local order records against PayPal's transaction report. This process is called **reconciliation**.

## What reconciliation checks

It compares:
- Which orders the store recorded as paid
- Which transactions PayPal actually processed

If the numbers don't match — for example, a payment was captured in PayPal but the order status wasn't updated, or vice versa — this is called **drift**.

## Where to see reconciliation results

Go to **Reconciliation** in the sidebar (under Finance). The page shows a list of nightly runs, each with:
- Run date
- Status: `ok` (no drift), `drift` (mismatch found), or `error` (run failed)
- Number of PayPal transactions
- Number of local transactions
- Drift count

Click any run date to see the full detail — which specific orders drifted and by how much.

## What to do if there's drift

A drift count > 0 means the store's records don't fully match PayPal's. Common causes:
- A payment captured in PayPal but the order webhook failed to update
- A refund issued directly from PayPal Business (not through the admin panel)
- A chargeback initiated by a customer

**What to do:**
1. Open the drift detail from the Reconciliation page.
2. Match each drifted transaction to its order in the **Orders** page.
3. Manually update the order status if needed.
4. If you see an unexpected charge or refund in PayPal that you don't recognise, contact PayPal.

## Sidebar badge

If the latest reconciliation run found drift, a red badge appears on the Reconciliation link in the sidebar. It clears once you've reviewed the run.

## Manual run

The cron runs automatically. If you need to run it manually (for example, after updating server settings), ask your server administrator to run: `node scripts/cron/reconcile-paypal.cjs`

**Admin page:** `/admin/recon`
