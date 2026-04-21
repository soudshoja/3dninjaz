---
title: Launch Checklist — your first sale, step by step
category: Guide
tags: [launch, setup, checklist, first-sale]
order: 1
---

# Launch Checklist

Follow these steps in order. Each step shows what to do and how to check it worked. Tick them off as you go — your progress saves in the browser.

---

## Step 1 — Set your store identity (5 minutes)

1. Go to **Settings** in the sidebar (under Operations).
2. Enter your **Business name** (e.g., "3D Ninjaz").
3. Enter your **Contact email** — this is where customer queries go.
4. Enter your **WhatsApp number** (digits only, no spaces or + sign — e.g., `60167203048`). Also fill in the display version (e.g., `+60 16 720 3048`).
5. Fill in your social URLs for Instagram, TikTok, Facebook, and WhatsApp. Leave any blank to hide that icon from the storefront footer.
6. Click **Save settings**.

**Check it worked:** Open the storefront in a new tab. Scroll to the footer — your social icons should appear. If a URL was left blank, that icon won't show.

---

## Step 2 — Set your cost defaults (5 minutes)

1. Still on **Settings**, scroll down to the **Cost Defaults** section.
2. Enter your **Filament cost per kg** in MYR (check your supplier receipt — PLA is typically MYR 60–100/kg).
3. Enter your **Electricity cost per kWh** (TNB residential: MYR 0.29–0.57/kWh depending on your tier).
4. Enter your **Printer power draw** in kWh per hour (leave 0.150 if unsure — that's a typical 150W printer).
5. Enter your **Labor rate per hour** in MYR (covers packing, post-processing, and quality checks).
6. Leave **Overhead %** at 0 for now — you can add this later once you know your packaging costs.
7. Click **Save settings**.

**Why this matters:** These defaults are used to auto-calculate your profit margin on each product variant. You can always override them per variant later.

---

## Step 3 — Set up shipping rates (10 minutes)

There are two shipping options. Set up at least the flat-rate option first.

### Flat rates (simple)

1. Go to **Shipping (flat-rate)** in the sidebar.
2. Set a rate for each Malaysian state you ship to. Enter `0` for states you don't serve.
3. Set a **free-shipping threshold** — we recommend MYR 200. Orders above this get free shipping automatically.
4. Click **Save**.

### Delyva live courier (optional but recommended)

1. Go to **Delyva courier** in the sidebar.
2. Enter your **origin address** (your workshop or home address — this must be accurate for quotes to work).
3. Enter your **Delyva API token** and **Company ID** (from your Delyva dashboard at delyva.com).
4. Click **Save**, then click **Test Connection** — you should see a green "Connected" status.

**Check it worked:** Open the storefront, add a product to your bag, go to checkout, and enter a Malaysian postcode. Shipping rates should appear.

---

## Step 4 — Create your first category (3 minutes)

1. Go to **Categories** in the sidebar.
2. Type a category name (e.g., "Home Decor") and click **Add category**.
3. Optional: add a subcategory inside it (e.g., "Vases", "Planters").

**Why categories matter:** Customers can filter the shop by category. Without categories, all products appear in one big list.

---

## Step 5 — Add your first product (15 minutes per product)

1. Go to **Products** in the sidebar.
2. Click **+ New product** (top right).
3. Fill in the **Name** and **Description**.
4. Choose a **Category** and subcategory.
5. Go to the **Sizes & Pricing** tab:
   - Enable the sizes you make (Small, Medium, Large).
   - Enter a **selling price** for each enabled size.
6. Optional — go to the **Cost** tab to enter filament grams, print time, and labor minutes per size. This enables the profit tracker.
7. Upload **3 to 5 photos** using the photo uploader. The first photo is the thumbnail shown on listing cards.
8. Set the product to **Active** so it appears on the storefront.
9. Click **Save product**.

**Check it worked:** Open the storefront `/shop` page. Your product should appear. Click it — the size selector and prices should be correct.

**Common issue:** If the product doesn't appear, check that **Active** is toggled on and that at least one size is enabled with a price.

---

## Step 6 — Test the full purchase flow (10 minutes)

Before going live, complete a real test purchase yourself:

1. Open the storefront in a private/incognito window.
2. Create a customer account (use a personal email, not your admin email).
3. Add a product to the bag.
4. Go to checkout — enter a real Malaysian postcode. Shipping rates should appear.
5. Proceed to PayPal checkout and complete payment (you can refund yourself afterward from `/admin/payments`).

**Check it worked:**
- The order appears in **Orders** with status "Paid".
- You receive a confirmation email.
- The customer (you) receives a confirmation email.

**If payment fails:** Check that `PAYPAL_ENV=live` is set in your server environment. If it says `sandbox`, payments go to the test system, not real PayPal.

---

## Step 7 — Book the first shipment (2 minutes per order)

When you receive a paid order:

1. Open the order from **Orders**.
2. Scroll to the **Shipping** section.
3. Click **Book courier** — you'll see a list of couriers with live prices from Delyva.
4. Choose your preferred courier and confirm.
5. The label PDF will open automatically — print it and attach it to your parcel.
6. The order status updates to "Shipped" and the customer receives a tracking number.

---

## Step 8 — Turn off sandbox mode (1 minute)

If you set up using PayPal Sandbox (test mode), you must switch to live before real customers can pay:

1. On your server, set the environment variable `PAYPAL_ENV=live`.
2. Restart the Node.js app.
3. Test with a real card (then refund yourself from `/admin/payments`).

**Note:** Only your server administrator can change environment variables.

---

## Step 9 — Tell the world (ongoing)

- Share your store URL on Instagram, TikTok, and WhatsApp.
- Add your store URL to your bio links.
- Check **Subscribers** in the sidebar — any email signups from the footer form will appear here.

---

## Common pitfalls

**Product shows as "out of stock"**
You have inventory tracking turned ON for that variant and stock = 0. Either add stock in the product's Inventory tab, or turn tracking OFF (most 3D printing shops work on-demand, so tracking is optional).

**Shipping quote shows nothing at checkout**
Your origin postcode in Delyva settings is still a placeholder. Set your real workshop address — Delyva uses the postcode to calculate distances.

**PayPal button doesn't appear at checkout**
Your PayPal Client ID is either missing or set to sandbox credentials. Check Settings → Payments (environment variables set on the server).

**Confirmation email doesn't arrive**
Check the spam folder first. If it's not there, ask your server administrator to verify the SMTP credentials in the server environment.

**Banner announcement doesn't appear**
Go to Settings, enter text in the Banner field, and check the "Show banner" checkbox. Don't forget to Save.
