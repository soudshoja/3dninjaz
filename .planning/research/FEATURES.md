# Feature Landscape

**Domain:** 3D printing B2C e-commerce store (Malaysia market)
**Researched:** 2026-04-12
**Context:** Admin-uploaded pre-made products, S/M/L size selection, account-required checkout, PayPal payment. AI custom generation deferred to milestone 2.

---

## Table Stakes

Features users expect from any e-commerce store. Missing = product feels incomplete or untrustworthy. Users will leave.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Product catalog / browse page | Core store function — users cannot buy what they cannot find | Low | Grid layout with thumbnail, name, price. Category filter if SKU count grows beyond ~20. |
| Product detail page | Users need images, description, and options before buying | Low | Multiple images (3+ angles), full description, S/M/L size selector, price per size, Add to Cart |
| S/M/L size selection | Defined requirement. Missing = wrong orders and returns | Low | Button group preferred over dropdown (one tap vs two). Show price change per size. |
| Shopping cart | Industry standard. Users accumulate items before committing to pay | Low | Line items showing name, size, quantity, price. Quantity edit. Remove item. Subtotal. Proceed to checkout CTA. |
| User account (register / login) | Required per spec. No guest checkout. | Medium | Email + password. JWT or session cookies. Password reset via email. |
| Checkout flow | The money path. Every friction point costs a sale. | Medium | Review cart → shipping address → PayPal payment → confirmation. Clear progress indicator. |
| PayPal payment | Specified. Works in Malaysia. Cards accepted without PayPal account. | Medium | PayPal JS SDK (client-side). Server-side order creation and capture. Webhook for payment events. |
| Order confirmation (post-purchase) | Critical trust signal. Users panic without it. | Low | On-screen "order received" page + transactional email with order summary and next steps. |
| Admin: product CRUD | Admin must manage the catalog | Medium | Create/edit/delete products. Upload multiple images. Set name, description, price per size (S/M/L), active/inactive toggle. |
| Admin: order management | Admin must see and action orders | Medium | Order list with status. Update status (pending → processing → shipped → delivered). Customer name, address, items ordered. |
| Customer: order history | Users expect to see what they bought | Low | Table of past orders with status. Depends on: user account + orders stored in DB. |
| Mobile-responsive layout | 65–73% of Malaysian e-commerce traffic is mobile. Not optional. | Medium | Thumb-friendly tap targets (44px min). Fast load (<2s). Sticky checkout button. No horizontal scroll. |
| Print Ninjaz branding | Brand identity. Trust signal for unknown brand. | Low | Logo, ninja theme, green/blue/black color scheme. Consistent across all pages. |
| Privacy policy page | Malaysia PDPA 2010 requires explicit consent for personal data collection. Legal requirement. | Low | Static page. Checkbox consent on registration form. |
| Contact / About page | Trust-building for unknown brand. Reduces abandonment from suspicious visitors. | Low | Who you are, where you're based, how to reach you. Even a simple page helps. |

---

## Differentiators

Features that set Print Ninjaz apart from generic stores. Not expected baseline, but meaningfully improve trust, conversion, or retention in this specific niche.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Lead time / "ships in X days" notice | 3D printing is made-to-order. Malaysian buyers expect Lazada-speed. Setting expectations upfront prevents negative reviews and support tickets. | Low | Banner or product-page callout: "Made to order. Ships in 3–7 business days." |
| Size guide with real dimensions | S/M/L is meaningless without reference. Dimensions prevent wrong-size orders and return requests. | Low | Simple table per product: S = 5cm × 5cm × 3cm, M = 8cm × 8cm × 5cm, etc. |
| Material / process callout | Educates buyers unfamiliar with 3D printing. Explains durability, finish, and care. Differentiates from cheap mass-produced goods. | Low | Short text block per product or site-wide: "Printed in PLA, what this means..." |
| "How it's made" section | Transparency builds trust for an unfamiliar product category. Unique to 3D printing stores. | Low | One page or section explaining the printing process with a photo or short video. |
| Ninja-themed brand copy | Memorable identity in a generic market. Sets tone and personality that mass-market stores cannot replicate. | Low | Tone in product descriptions, 404 page, confirmation emails, microcopy. |
| WhatsApp contact link | Malaysian consumers use WhatsApp for pre-sales questions. A floating WhatsApp button is standard on Malaysian e-commerce sites. Reduces lost sales from unanswered questions. | Low | `wa.me/[number]` link with pre-filled message. No backend required. |
| Order history with status tracking | Reduces support load ("where is my order?"). Builds repeat purchase intent when experience is positive. | Low | Milestone 1 in-scope. Depends on: user account, orders stored with status field. |
| FPX / local e-wallet payment option | PayPal-only conversion in Malaysia is measurably lower than stores offering FPX/TnG/GrabPay. Malaysian users view FPX as table stakes. | High | Do NOT build in milestone 1. Evaluate after first 20–30 orders. Flag as critical for v1.1. |
| AI custom 3D generation (Meshy API) | Core milestone 2 differentiator. Unique in Malaysian market. Customers design their own items. | Very High | Explicitly deferred to milestone 2. Do not scope, design, or build any part in milestone 1. |

---

## Anti-Features

Features to deliberately NOT build in v1. Each is out of scope for an explicit reason — not because it was overlooked.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Guest checkout | Specified out of scope. Account enables order history, repeat purchase tracking, and milestone 2 personalization. | Require account creation. Explain benefit ("track your order") to reduce friction. |
| 3D model viewer (STL/OBJ embed) | High complexity (Three.js or model-viewer), large file sizes, poor mobile performance, accessibility issues. Not required for buying pre-made items. | Use high-quality photos from 3–5 angles. A short video is a better trust signal anyway. |
| Customer reviews and ratings | Adds content moderation complexity. A thin catalog at launch means sparse reviews that look bad and may never fill in. | Launch without. Add after catalog has 10+ products and 50+ completed orders. |
| Inventory / stock tracking | Manual management is fine at low order volume. Real-time tracking requires stock sync logic across orders and admin. | Admin manually toggles product active/inactive when stock runs out. |
| Multi-language (Malay / Chinese) | Significant scope increase. Malaysian e-commerce widely operates in English. Language adds ongoing content maintenance burden. | English-only for v1. Revisit if analytics show non-English traffic patterns. |
| Shipping integration (live carrier rates) | Overcomplicates checkout. Malaysian domestic rates are predictable and small. Live rates require carrier API keys, weight tracking, dimension data. | Flat shipping fee or free shipping. Display "ships via [carrier]" + lead time. |
| Discount codes / promotions engine | Non-essential for launch. Requires discount logic in cart, checkout, and admin. | Launch without. Add when first marketing campaign requires it. |
| Wishlist / save for later | Nice-to-have but not a purchase blocker. Users can bookmark URLs. | Defer. Add after core purchase loop is validated. |
| Live chat widget | Adds third-party script weight, requires staffing, often abandoned. Worse UX than WhatsApp for Malaysian buyers. | WhatsApp link achieves same goal with zero backend. |
| Social login (Google / Facebook) | Extra OAuth complexity and app registration for minimal conversion benefit at launch scale. | Email + password only. |
| Subscription / recurring orders | Irrelevant for 3D printed physical goods where each item is unique or made-to-order. | Not applicable to this product type. |
| B2B / wholesale pricing tiers | Out of scope for basic B2C store. | Single price tier per size per product. |
| Product comparison | Useful for large catalogs. Premature for an early-stage store with a small SKU count. | Defer. Revisit when catalog exceeds 30+ products. |
| Returns / refund management system | Operational process, not a software feature at this scale. | Handle manually via WhatsApp / email. Document policy on a static page. |

---

## Feature Dependencies

```
User account (register / login)
  └── Shopping cart (persisted per user, or user-linked session)
       └── Checkout flow (requires cart contents)
            └── PayPal payment (requires checkout context)
                 └── Order confirmation page + email (requires payment capture)
                      └── Order stored in DB with status
                           └── Admin: order management (reads stored orders)
                           └── Customer: order history (reads own stored orders)

Admin: product management (create product with name, description, images, price per size)
  └── Product catalog page (reads active products from DB)
       └── Product detail page (reads single product)
            └── S/M/L size selector (reads per-product size config)
                 └── Add to Cart (requires product + size selected)

Order status field (set by admin)
  └── Customer order history shows current status
```

---

## MVP Feature Priority

**Must ship for launch (milestone 1 blocking):**

1. Product catalog (browse page)
2. Product detail page with image gallery
3. S/M/L size selection with per-size pricing
4. Shopping cart
5. User account — register, login, logout, password reset
6. Checkout flow with PayPal
7. Order confirmation screen + transactional email
8. Customer: order history page
9. Admin: product CRUD with image upload
10. Admin: order list with status management
11. Mobile-responsive layout throughout
12. Print Ninjaz branding (logo, colors, ninja theme)
13. Privacy policy page (PDPA compliance)

**Include in milestone 1 — low complexity, high trust return:**

- Lead time / "ships in X days" notice (banner or product page)
- Size guide with real physical dimensions
- Material / "how it's made" explanation
- Contact / About page
- WhatsApp link for customer queries

**Defer with explicit trigger:**

- FPX / local e-wallet: after first 20–30 orders when PayPal drop-off becomes measurable
- Customer reviews: after 50+ completed orders and 10+ products in catalog
- AI custom 3D generation (Meshy API): milestone 2 only, no earlier
- Discount codes: when first marketing campaign is planned
- Wishlist: when repeat visitor rate is measurable

---

## Malaysia-Specific Notes

**Payment conversion risk (HIGH):** PayPal is recognized in Malaysia but local shoppers strongly prefer FPX (bank transfer), Touch 'n Go eWallet, and GrabPay. Conversion rates for PayPal-only stores are measurably lower than stores offering local options. Accept this trade-off for milestone 1 due to the available PayPal skill, but flag FPX integration as the single highest-ROI post-launch feature.

**PDPA 2010 compliance:** Malaysia's Personal Data Protection Act requires informed consent before collecting personal data. At minimum: a privacy policy page, a consent checkbox at registration, and no sharing of customer data with third parties without consent.

**WhatsApp as primary support channel:** Malaysian SME e-commerce sites almost universally include a WhatsApp floating button. It is a cultural expectation, not a nice-to-have. Build it for launch. Costs 30 minutes of development.

**Mobile performance:** Malaysian mobile penetration is near-universal. Page load times above 3 seconds cause significant abandonment. Optimize images (WebP format, lazy loading), avoid heavy third-party scripts, and test on mid-range Android devices (not just desktop Chrome).

**Trust signals for unknown brands:** Print Ninjaz is a new brand with no reviews. Offset with: clear contact info, visible WhatsApp link, explicit "how it's made" transparency, clear refund/return policy (even if "no returns on custom items"), and real product photos (not renders).

---

## Sources

- [eCommerce Website Malaysia Guide 2026 — Jumix Design](https://jumixdesign.com/ecommerce-website-malaysia-guide-2026-payment-gateways-design-trends-must-have-features/)
- [30+ Must-Have eCommerce Website Features 2026 — LitExtension](https://litextension.com/blog/ecommerce-website-features/)
- [Shopify Variant Selector UX Best Practices — EasyApps](https://easyappsecom.com/guides/shopify-variant-selector-guide)
- [Baymard Institute: Apparel UX Best Practices — size selection](https://baymard.com/blog/apparel-5-best-practices)
- [DHL Malaysia: Best Payment Gateways Comparison](https://www.dhl.com/discover/en-my/e-commerce-advice/e-commerce-best-practice/online-payment-gateway-comparison-malaysia)
- [How to Start a 3D Printing Business — Shopify Blog 2026](https://www.shopify.com/blog/how-to-start-a-3d-printing-business)
- [Beyond the Checkout: Malaysia Retail 2026 — The Sun](https://thesun.my/business/beyond-the-checkout-whats-defining-malaysias-retail-in-2026/)
- [Shapeways 3D Printing E-Commerce](https://www.shapeways.com/)
- [Admin Panel for Ecommerce Website: Features — Commrz](https://www.commrz.com/blog/admin-panel-for-ecommerce-website/)
