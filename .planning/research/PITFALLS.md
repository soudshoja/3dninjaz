# Domain Pitfalls: Print Ninjaz

**Domain:** 3D Printing E-Commerce (Next.js, PayPal, Malaysia market)
**Researched:** 2026-04-12

---

## Critical Pitfalls

Mistakes that cause rewrites, security incidents, or lost revenue.

---

### Pitfall 1: Middleware-Only Admin Route Protection

**What goes wrong:** Admin routes (`/admin/*`) and admin API routes are protected only by Next.js middleware. An attacker sends a crafted `x-middleware-subrequest` header, bypasses the middleware entirely, and gains unauthenticated access to product upload, order management, and any admin API endpoint.

**Why it happens:** Next.js CVE-2025-29927 (CVSS 9.1, patched in 15.2.3+) demonstrated that middleware is not a security boundary — it is a routing layer. Developers assume middleware gatekeeping is sufficient.

**Consequences:** Arbitrary product creation/deletion, order data exposure, admin account takeover without credentials.

**Prevention:**
- Check session/role at the data layer (Server Action or API route handler), not only in middleware.
- Use Next.js 15.2.3+ which patches CVE-2025-29927.
- Implement role check on every `/admin` Server Action: `if (!session || session.user.role !== 'admin') throw new Error('Forbidden')`.
- Never pass `isAdmin` as a prop from a client component — derive it server-side every request.

**Detection:** If removing the middleware check allows the page to load, admin routes are not properly protected at the handler level.

**Phase:** Address in Phase 1 (Auth & Admin foundation). Every subsequent admin feature inherits this pattern.

---

### Pitfall 2: PayPal Order Not Verified Server-Side Before Fulfillment

**What goes wrong:** On checkout success, the frontend receives a PayPal `orderID` and calls an internal API to mark the order as paid. The API trusts the `orderID` from the client without calling PayPal's capture/verify API server-side. A bad actor can replay an old `orderID` or fabricate one.

**Why it happens:** Tutorials often show client-side `onApprove` triggering order creation without demonstrating server-side capture verification.

**Consequences:** Orders fulfilled without payment. Inventory/fulfillment triggered by spoofed payment signals.

**Prevention:**
- Never trust the client-side `onApprove` payload alone.
- On `onApprove`, send the `orderID` to your own backend API route.
- Backend calls `POST /v2/checkout/orders/{orderID}/capture` on PayPal's API.
- Only create/update the order record after PayPal returns `status: "COMPLETED"`.
- Verify `purchase_units[0].amount.value` matches the expected order total.

**Detection:** If you can mark an order paid by calling your API without a valid PayPal transaction, this pitfall is present.

**Phase:** Address in Phase 2 (Checkout & Payments).

---

### Pitfall 3: Duplicate Order Creation via Webhook + Return URL Race Condition

**What goes wrong:** PayPal triggers both the redirect return URL and a webhook simultaneously after payment. Both paths trigger order creation logic. The result: duplicate orders for a single payment, or orders in conflicting states (one "paid", one "failed").

**Why it happens:** This is a documented WooCommerce/PayPal issue affecting any custom integration. Developers implement the return URL flow first, then add webhooks, without idempotency guards.

**Consequences:** Double-fulfilled orders, confused order state, customer confusion, inventory inaccuracy.

**Prevention:**
- Use a database-level unique constraint on `paypal_order_id` in the orders table.
- Before creating an order, check if one already exists for that `paypal_order_id`.
- Use a transaction/atomic upsert to prevent concurrent inserts.
- Treat webhooks as the authoritative signal; treat the return URL as the UX signal only (redirect user, but do not write order state).

**Detection:** Test by rapidly double-submitting the payment return URL. If two orders appear, the guard is missing.

**Phase:** Address in Phase 2 (Checkout & Payments).

---

### Pitfall 4: Cart State Lost on Hard Refresh (SSR/CSR Mismatch)

**What goes wrong:** Cart is stored in React state or Zustand without persistence. A hard refresh wipes the cart. Alternatively, cart state is initialized on the server during SSR and hydrated client-side, causing a hydration mismatch error in Next.js App Router.

**Why it happens:** Next.js App Router separates Server and Client Components. Zustand or React Context initialized in a Server Component, or persisted to `localStorage` without a hydration guard, causes hydration errors or silent state loss.

**Consequences:** Users lose cart contents before checkout. Hydration errors break the page visually. Poor conversion rate.

**Prevention:**
- Store cart in `localStorage` via Zustand persist middleware, but wrap initial read in a client-side `useEffect` to prevent SSR mismatch.
- Mark the cart provider as `'use client'` explicitly.
- Consider server-side cart (database-backed per session) if cart persistence across devices is needed — simpler than fighting hydration.
- Test cart behaviour after: hard refresh, browser back button, opening in new tab.

**Detection:** Add an item to cart, press F5. If cart is empty, persistence is broken. Check browser console for hydration warnings.

**Phase:** Address in Phase 1 (Product browsing & cart).

---

### Pitfall 5: Unprotected Image Upload Endpoint

**What goes wrong:** The admin product upload route accepts image files without validating file type, file size, or that the uploader is actually an admin. Anyone who discovers the endpoint can upload arbitrary files.

**Why it happens:** Developers add auth to the admin UI page but forget to protect the underlying API route that handles the multipart upload. Next.js API routes are public by default.

**Consequences:** Storage cost abuse, malware upload, content injection, server compromise if files are executed.

**Prevention:**
- Validate session and `role === 'admin'` inside the API route handler before accepting any file bytes.
- Validate MIME type server-side (not just file extension — check magic bytes or use a library like `file-type`).
- Enforce max file size (e.g., 5MB) at the API handler level, not only in the frontend component.
- Store images in a dedicated object store (Cloudinary, Supabase Storage, AWS S3) — never serve user-uploaded files from the Next.js public directory.
- Generate a new UUID filename on the server; never trust the original filename.

**Detection:** Remove the admin session cookie, then attempt to POST directly to the upload API route using curl. If it succeeds, the endpoint is unprotected.

**Phase:** Address in Phase 1 (Admin product management).

---

### Pitfall 6: S/M/L Size Tiers Not Tied to Per-Product Pricing

**What goes wrong:** The data model stores a single price per product, with size applied as a label only. When the admin wants Small to cost MYR 20 and Large to cost MYR 45 for a specific product, the schema cannot represent this. A rewrite of the pricing model is required.

**Why it happens:** The requirement "simple size tiers" is interpreted as "one price field." In 3D printing, material usage scales non-linearly with size, so per-size pricing is almost always needed in practice.

**Consequences:** Either all sizes share one price (wrong for the business) or a schema migration is required after launch.

**Prevention:**
- Model price as a per-variant field from the start: `{ size: 'S', price: 20 }, { size: 'M', price: 30 }, { size: 'L', price: 45 }` stored as a JSON column or a `product_variants` join table.
- Even if the admin sets the same price for all sizes initially, the data model should support per-size pricing.
- Surface per-size price inputs in the admin upload form from day one.

**Detection:** Ask: "Can the admin set a different price for Small vs Large?" If the answer requires a schema change, the model is wrong.

**Phase:** Address in Phase 1 (Product data model design). Fixing this post-launch requires data migration.

---

## Moderate Pitfalls

---

### Pitfall 7: PayPal Currency Confusion (USD vs MYR)

**What goes wrong:** PayPal supports MYR, but developers default to USD in the order creation payload. Malaysian customers see prices in USD, causing confusion and abandoned carts. Currency conversion fees (up to 4%) reduce margins silently.

**Why it happens:** Most PayPal tutorials use USD. The SDK default is USD. Developers don't notice until a real transaction happens.

**Consequences:** Customer trust loss, currency conversion fees eating margin, regulatory ambiguity around displaying foreign currency prices in Malaysia.

**Prevention:**
- Set `currency_code: "MYR"` explicitly in every PayPal order creation payload.
- Display prices in MYR throughout the store (not USD with a converted note).
- Confirm MYR is accepted by the merchant's PayPal account (Malaysian PayPal accounts support MYR by default).
- PayPal transaction fee for Malaysia is 3.9% + MYR 2.00 per transaction — factor into pricing.

**Detection:** Create a test order in sandbox. Check the PayPal popup — if it shows USD, the currency is wrong.

**Phase:** Address in Phase 2 (Checkout).

---

### Pitfall 8: No Order Confirmation Email

**What goes wrong:** After successful PayPal payment, the customer receives no email. They have no receipt, no order reference number, and no confidence the order was received. Support burden increases.

**Why it happens:** Transactional email is treated as a "nice to have" feature deferred to later phases, but customers expect it immediately.

**Consequences:** Customer anxiety, repeat order attempts (leading to duplicate payment attempts), poor brand trust.

**Prevention:**
- Integrate a transactional email service (Resend, SendGrid, or Nodemailer) in the same phase as checkout.
- Send two emails: one to customer (order confirmation with itemised list), one to admin (new order notification).
- Trigger email from the server-side handler that confirms PayPal capture — not from the client.

**Detection:** Complete a test order end-to-end. If no email arrives in sandbox, the integration is missing.

**Phase:** Address in Phase 2 (Checkout). Do not defer to a later phase.

---

### Pitfall 9: Product Photos That Don't Convey 3D Print Scale

**What goes wrong:** Product photos show the item against a plain background with no size reference. Customers cannot judge actual size from S/M/L labels alone. Returns (or complaints) follow when the physical size differs from expectation.

**Why it happens:** Standard e-commerce photo advice does not account for 3D printed objects, which can vary dramatically in scale. "Small" means different things for different products.

**Consequences:** Negative reviews, return requests, customer service burden, trust erosion early in the brand's life.

**Prevention:**
- Include at least one photo per product showing the item next to a common reference object (coin, hand, ruler).
- Display approximate dimensions (cm/mm) alongside S/M/L labels in the product description and cart.
- Admin upload form should prompt for dimensions per size variant.

**Detection:** Show a product photo to someone unfamiliar with the product. Can they estimate the actual size without reading the description?

**Phase:** Address in Phase 1 (Product model) for dimensions field; address in content guidelines for admin.

---

### Pitfall 10: Malaysia SST Compliance Ignored

**What goes wrong:** The store launches without considering Malaysia's Sales and Service Tax (SST). As of July 2025, SST expanded to include more service categories at 8%. A physical goods seller may also be subject to sales tax. Operating without awareness of SST obligations creates legal and financial risk.

**Why it happens:** Developers treat tax as an accounting problem, not an engineering one. SST is not automatically applied by PayPal for Malaysian merchants.

**Consequences:** Regulatory penalties up to RM 50,000 or 3 years imprisonment for non-compliance. Retroactive tax liability.

**Prevention:**
- Consult a Malaysian accountant before launch to determine whether the business volume triggers SST registration (threshold: MYR 500,000 for digital services).
- For v1, document that tax compliance is deferred pending revenue volume — do not ignore it indefinitely.
- Design the order/invoice data model to include a tax field even if it is 0% at launch, so adding SST later requires no schema change.

**Detection:** Check whether invoices/order confirmations include any tax line. If not, the data model may not support it when compliance is required.

**Phase:** Note in Phase 2 (Checkout) as a compliance consideration; resolve with accountant before public launch.

---

### Pitfall 11: Unhandled PayPal Sandbox vs Production Environment Switching

**What goes wrong:** Development uses sandbox credentials. When switching to production, developers miss updating one or more of: `CLIENT_ID`, `CLIENT_SECRET`, the SDK URL (`sdk.js?client-id=...`), or the API base URL. Production environment silently uses sandbox or throws cryptic auth errors.

**Why it happens:** PayPal has multiple integration touch points. Missing any one breaks production without obvious error messages.

**Prevention:**
- Use `.env.local` (dev), `.env.production` (prod) with distinct variables: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE` (`sandbox`/`live`).
- Build a single `paypalConfig` module that reads these variables and exports the correct SDK URL and API base — no hardcoded strings elsewhere.
- Checklist item before any production deploy: verify all PayPal env vars are set to live values.

**Detection:** Inspect the `sdk.js` script tag in production. If `client-id` matches your sandbox client ID, the switch was missed.

**Phase:** Address in Phase 2 (Checkout). Critical before any real-money transaction.

---

## Minor Pitfalls

---

### Pitfall 12: Admin Panel Accessible via Direct URL Without Role Check in UI

**What goes wrong:** The admin link is hidden from the navigation for regular users, but the `/admin` URL is not role-gated in the UI rendering. Regular logged-in users can navigate to it directly.

**Prevention:** Always check `session.user.role === 'admin'` in the Server Component that renders admin pages, not only in middleware or navigation visibility logic.

**Phase:** Address in Phase 1 (Admin auth).

---

### Pitfall 13: No Loading / Error States on Add-to-Cart and Checkout

**What goes wrong:** Network latency causes the add-to-cart button to appear to do nothing. Users click multiple times. Multiple cart entries or duplicate checkout attempts result.

**Prevention:** Disable the button during async operations. Show a spinner. Show an error message on failure. This is not cosmetic — it prevents functional bugs.

**Phase:** Address in Phase 1 and Phase 2 as each interactive feature is built.

---

### Pitfall 14: PayPal Button Renders in Server Component

**What goes wrong:** The `@paypal/react-paypal-js` `PayPalButtons` component requires a browser environment. Rendering it in a Server Component throws a runtime error.

**Prevention:** Mark any file containing `PayPalScriptProvider` or `PayPalButtons` with `'use client'`. Isolate the payment UI into a dedicated Client Component.

**Phase:** Address in Phase 2 (Checkout).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Auth & Admin setup | Middleware-only protection (Pitfall 1) | Role check at every handler, not just middleware |
| Product data model | Single price field for S/M/L (Pitfall 6) | Per-variant pricing from day one |
| Product upload API | Unprotected upload endpoint (Pitfall 5) | Server-side auth + MIME validation |
| Cart implementation | Hydration mismatch / state loss (Pitfall 4) | Zustand persist + `useEffect` hydration guard |
| Checkout / PayPal | Server-side capture verification (Pitfall 2) | Capture on backend, not trusted from client |
| Checkout / PayPal | Webhook + return URL race (Pitfall 3) | Unique constraint on `paypal_order_id` |
| Checkout / PayPal | USD instead of MYR (Pitfall 7) | Explicit `currency_code: "MYR"` |
| Checkout / PayPal | PayPalButtons in Server Component (Pitfall 14) | `'use client'` directive |
| Post-checkout | No confirmation email (Pitfall 8) | Transactional email in same phase as checkout |
| Product content | Photos don't show scale (Pitfall 9) | Dimensions field in model, reference photos |
| Go-live | Sandbox/production credential mix (Pitfall 11) | Single config module, env-based switching |
| Compliance | SST obligations ignored (Pitfall 10) | Consult accountant pre-launch, tax field in schema |

---

## Sources

- CVE-2025-29927 Next.js middleware bypass: https://projectdiscovery.io/blog/nextjs-middleware-authorization-bypass
- Next.js security guide 2025: https://www.turbostarter.dev/blog/complete-nextjs-security-guide-2025-authentication-api-protection-and-best-practices
- PayPal webhook race condition (WooCommerce issue tracker): https://github.com/woocommerce/woocommerce-paypal-payments/issues/4058
- PayPal webhooks guide: https://developer.paypal.com/api/rest/webhooks/
- PayPal Malaysia fees: https://wise.com/my/blog/paypal-fees
- PayPal supported currencies: https://developer.paypal.com/docs/reports/reference/paypal-supported-currencies/
- PayPal sandbox testing: https://developer.paypal.com/tools/sandbox/
- Malaysia SST 2025 expansion: https://malaysia.incorp.asia/guides/malaysia-new-sst-2025-guide/
- Malaysia SST July 2025: https://www.bigseller.com/blog/articleDetails/3410/malaysia-sst-2025.htm
- Next.js session management pitfalls: https://clerk.com/articles/nextjs-session-management-solving-nextauth-persistence-issues
- 3D printing pricing complexity: https://blog.prusa3d.com/3d-printing-price-calculator_38905/
- E-commerce product photography mistakes: https://www.ecwid.com/blog/ecommerce-for-beginners-product-photography-mistakes.html
- Print-on-demand pitfalls: https://www.dtfsuppliesshop.com/print-on-demand-pitfalls-how-to-avoid-common-mistakes/
