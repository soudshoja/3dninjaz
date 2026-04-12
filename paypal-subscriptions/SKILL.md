---
name: paypal-subscriptions
description: "Integrate PayPal Subscriptions for recurring billing using the Catalog Products API, Subscriptions REST API (v1/billing), and PayPal JavaScript SDK. Use this skill whenever the user mentions PayPal subscriptions, PayPal recurring payments, PayPal billing plans, PayPal subscription plans, creating subscription products, managing subscriber billing cycles, PayPal trial periods, PayPal plan pricing, upgrading/downgrading subscriptions, cancelling PayPal subscriptions, or integrating recurring billing with PayPal. Also trigger for PayPal vault-based recurring charges, payment method tokens for recurring, and subscription webhooks. This skill covers the full lifecycle: product creation, plan creation, subscriber checkout, and subscription management."
---

# PayPal Subscriptions Integration

This skill covers integrating PayPal Subscriptions for **recurring billing**. For one-time payments, see the `paypal-checkout` skill instead.

## Architecture Overview

PayPal Subscriptions uses a three-layer model:

1. **Product** (Catalog Products API): Represents your goods/service
2. **Plan** (Subscriptions API): Defines billing cycles, pricing, trial periods
3. **Subscription** (Subscriptions API): A buyer's active agreement to a plan

The flow: Create product → Create plan → Show subscribe button → Buyer agrees → Subscription active → PayPal auto-bills on schedule.

## Prerequisites

- A PayPal Developer account with sandbox credentials (Client ID + Client Secret)
- Environment variables: `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`
- Sandbox base: `https://api-m.sandbox.paypal.com`
- Production base: `https://api-m.paypal.com`

## Step 1: Create a Product

Products represent what you're selling. You typically create products once via API or the PayPal Dashboard.

```bash
curl -v -X POST "https://api-m.sandbox.paypal.com/v1/catalogs/products" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "PayPal-Request-Id: UNIQUE_ID" \
  -d '{
    "name": "Video Streaming Service",
    "description": "A video streaming service",
    "type": "SERVICE",
    "category": "SOFTWARE",
    "image_url": "https://example.com/streaming.jpg",
    "home_url": "https://example.com/home"
  }'
```

**Product types:** `PHYSICAL`, `DIGITAL`, `SERVICE`

**Response (201):**
```json
{
  "id": "PROD-5FD60555F23244316",
  "name": "Video Streaming Service",
  "description": "A video streaming service",
  "create_time": "2024-01-21T16:04:39Z",
  "links": [...]
}
```

Save the `id` — you'll need it when creating plans.

### Node.js example

```javascript
async function createProduct(accessToken) {
    const response = await fetch(
        `${PAYPAL_BASE}/v1/catalogs/products`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${accessToken}`,
                "PayPal-Request-Id": crypto.randomUUID()
            },
            body: JSON.stringify({
                name: "Video Streaming Service",
                description: "A video streaming service",
                type: "SERVICE",
                category: "SOFTWARE"
            })
        }
    );
    return response.json();
}
```

## Step 2: Create a Subscription Plan

Plans define billing cycles, pricing, trials, and payment preferences. You can create multiple plans per product (e.g., Basic, Pro, Enterprise).

### Simple monthly plan

```bash
curl -v -X POST "https://api-m.sandbox.paypal.com/v1/billing/plans" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "PayPal-Request-Id: UNIQUE_ID" \
  -d '{
    "product_id": "PROD-5FD60555F23244316",
    "name": "Basic Plan",
    "description": "Basic monthly plan",
    "billing_cycles": [
      {
        "frequency": {
          "interval_unit": "MONTH",
          "interval_count": 1
        },
        "tenure_type": "REGULAR",
        "sequence": 1,
        "total_cycles": 0,
        "pricing_scheme": {
          "fixed_price": {
            "value": "10",
            "currency_code": "USD"
          }
        }
      }
    ],
    "payment_preferences": {
      "auto_bill_outstanding": true,
      "setup_fee": {
        "value": "0",
        "currency_code": "USD"
      },
      "setup_fee_failure_action": "CONTINUE",
      "payment_failure_threshold": 3
    },
    "taxes": {
      "percentage": "0",
      "inclusive": false
    }
  }'
```

### Plan with free trial + regular billing

```bash
curl -v -X POST "https://api-m.sandbox.paypal.com/v1/billing/plans" \
  -H "Accept: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "PayPal-Request-Id: UNIQUE_ID" \
  -d '{
    "product_id": "PROD-5FD60555F23244316",
    "name": "Premium Plan",
    "description": "Premium plan with 1-month free trial",
    "billing_cycles": [
      {
        "frequency": {
          "interval_unit": "MONTH",
          "interval_count": 1
        },
        "tenure_type": "TRIAL",
        "sequence": 1,
        "total_cycles": 1
      },
      {
        "frequency": {
          "interval_unit": "MONTH",
          "interval_count": 1
        },
        "tenure_type": "REGULAR",
        "sequence": 2,
        "total_cycles": 12,
        "pricing_scheme": {
          "fixed_price": {
            "value": "25",
            "currency_code": "USD"
          }
        }
      }
    ],
    "payment_preferences": {
      "auto_bill_outstanding": true,
      "setup_fee": {
        "value": "10",
        "currency_code": "USD"
      },
      "setup_fee_failure_action": "CONTINUE",
      "payment_failure_threshold": 3
    },
    "taxes": {
      "percentage": "10",
      "inclusive": false
    }
  }'
```

### Billing cycle reference

| Field | Description |
|-------|-------------|
| `frequency.interval_unit` | `DAY`, `WEEK`, `MONTH`, `YEAR` |
| `frequency.interval_count` | Number of intervals between charges (e.g., 1 = every month, 2 = every 2 months) |
| `tenure_type` | `TRIAL` or `REGULAR` |
| `sequence` | Order of billing cycles (1, 2, 3). Trials must come before regular. |
| `total_cycles` | Number of times this cycle repeats. `0` = infinite (auto-renew). |
| `pricing_scheme.fixed_price` | Price per cycle. Omit for free trials. |

### Payment preferences

| Field | Description |
|-------|-------------|
| `auto_bill_outstanding` | `true` = automatically bill outstanding balance at next cycle |
| `setup_fee` | One-time fee charged at subscription start |
| `setup_fee_failure_action` | `CONTINUE` (activate anyway) or `CANCEL` (cancel if fee fails) |
| `payment_failure_threshold` | Number of consecutive failures before suspension (1-999) |

**Important:** Only one `currency_code` per plan. Create separate plans for different currencies.

**Response (201):**
```json
{
  "id": "P-17M15335A8501272JLXLLNKI",
  "product_id": "PROD-5FD60555F23244316",
  "name": "Basic Plan",
  "status": "ACTIVE",
  "billing_cycles": [...],
  "create_time": "2024-01-21T16:09:13Z",
  "links": [...]
}
```

Save the plan `id` for the subscribe button.

## Step 3: Add the Subscribe Button (Front-End)

### HTML + JavaScript SDK

```html
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Subscribe</title>
</head>
<body>
    <div id="paypal-button-container"></div>

    <!-- Note: vault=true and intent=subscription are REQUIRED -->
    <script src="https://www.paypal.com/sdk/js?client-id=YOUR_CLIENT_ID&vault=true&intent=subscription">
    </script>

    <script>
        paypal.Buttons({
            style: {
                shape: "rect",
                color: "gold",
                layout: "vertical",
                label: "subscribe"
            },

            createSubscription: function(data, actions) {
                return actions.subscription.create({
                    plan_id: "P-17M15335A8501272JLXLLNKI"
                });
            },

            onApprove: function(data, actions) {
                console.log("Subscription ID:", data.subscriptionID);
                // Send data.subscriptionID to your server to save
                alert("Subscription active! ID: " + data.subscriptionID);
            },

            onError: function(err) {
                console.error("Subscription error:", err);
            },

            onCancel: function(data) {
                console.log("Subscription cancelled by buyer");
            }
        }).render("#paypal-button-container");
    </script>
</body>
</html>
```

**Critical JS SDK parameters for subscriptions:**
- `vault=true` — Required for subscriptions
- `intent=subscription` — Required for subscriptions
- Do NOT use `intent=capture` for subscriptions

### React Integration

```bash
npm install @paypal/react-paypal-js
```

```jsx
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

function SubscribePage() {
    return (
        <PayPalScriptProvider options={{
            clientId: "YOUR_CLIENT_ID",
            vault: true,
            intent: "subscription"
        }}>
            <PayPalButtons
                style={{ shape: "rect", layout: "vertical", label: "subscribe" }}
                createSubscription={(data, actions) => {
                    return actions.subscription.create({
                        plan_id: "P-17M15335A8501272JLXLLNKI",
                        // Optional overrides:
                        // start_time: "2024-02-01T00:00:00Z",
                        // quantity: "2",
                        // subscriber: {
                        //     name: { given_name: "John", surname: "Doe" },
                        //     email_address: "buyer@example.com"
                        // }
                    });
                }}
                onApprove={(data) => {
                    // POST data.subscriptionID to your backend
                    fetch("/api/subscriptions/save", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            subscriptionId: data.subscriptionID,
                            userId: currentUser.id
                        })
                    });
                }}
                onError={(err) => console.error("Error:", err)}
            />
        </PayPalScriptProvider>
    );
}
```

### Server-side subscription creation (alternative)

If you need more control, create subscriptions server-side:

```bash
curl -v -X POST "https://api-m.sandbox.paypal.com/v1/billing/subscriptions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "PayPal-Request-Id: UNIQUE_ID" \
  -d '{
    "plan_id": "P-17M15335A8501272JLXLLNKI",
    "start_time": "2024-02-01T00:00:00Z",
    "subscriber": {
      "name": { "given_name": "John", "surname": "Doe" },
      "email_address": "buyer@example.com"
    },
    "application_context": {
      "brand_name": "Your Company",
      "locale": "en-US",
      "shipping_preference": "NO_SHIPPING",
      "user_action": "SUBSCRIBE_NOW",
      "return_url": "https://example.com/return",
      "cancel_url": "https://example.com/cancel"
    }
  }'
```

The response includes an `approve` link — redirect the buyer there. After approval, the subscription activates automatically if `user_action` is `SUBSCRIBE_NOW`.

## Step 4: Manage Subscriptions (Server-Side)

### Get subscription details

```bash
curl -X GET "https://api-m.sandbox.paypal.com/v1/billing/subscriptions/I-BW452GLLEP1G" \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

### Suspend a subscription

```bash
curl -X POST "https://api-m.sandbox.paypal.com/v1/billing/subscriptions/I-BW452GLLEP1G/suspend" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{ "reason": "Customer request" }'
```

### Reactivate a suspended subscription

```bash
curl -X POST "https://api-m.sandbox.paypal.com/v1/billing/subscriptions/I-BW452GLLEP1G/activate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{ "reason": "Customer resubscribed" }'
```

### Cancel a subscription

```bash
curl -X POST "https://api-m.sandbox.paypal.com/v1/billing/subscriptions/I-BW452GLLEP1G/cancel" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{ "reason": "Customer cancelled" }'
```

### Update subscription (change quantity, shipping, etc.)

```bash
curl -X PATCH "https://api-m.sandbox.paypal.com/v1/billing/subscriptions/I-BW452GLLEP1G" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '[
    {
      "op": "replace",
      "path": "/subscriber/shipping_address",
      "value": {
        "name": { "full_name": "Jane Doe" },
        "address": {
          "address_line_1": "456 Oak Ave",
          "admin_area_2": "Austin",
          "admin_area_1": "TX",
          "postal_code": "78701",
          "country_code": "US"
        }
      }
    }
  ]'
```

### Revise subscription (upgrade/downgrade plan)

```bash
curl -X POST "https://api-m.sandbox.paypal.com/v1/billing/subscriptions/I-BW452GLLEP1G/revise" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{
    "plan_id": "P-NEW_PLAN_ID",
    "application_context": {
      "return_url": "https://example.com/return",
      "cancel_url": "https://example.com/cancel"
    }
  }'
```

This returns an `approve` link if the buyer needs to re-approve the change.

### List transactions for a subscription

```bash
curl -X GET "https://api-m.sandbox.paypal.com/v1/billing/subscriptions/I-BW452GLLEP1G/transactions?start_time=2024-01-01T00:00:00Z&end_time=2024-12-31T23:59:59Z" \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

## Step 5: Manage Plans

### Deactivate a plan

```bash
curl -X POST "https://api-m.sandbox.paypal.com/v1/billing/plans/P-PLAN_ID/deactivate" \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

### Activate a plan

```bash
curl -X POST "https://api-m.sandbox.paypal.com/v1/billing/plans/P-PLAN_ID/activate" \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

### Update plan pricing

```bash
curl -X POST "https://api-m.sandbox.paypal.com/v1/billing/plans/P-PLAN_ID/update-pricing-schemes" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{
    "pricing_schemes": [
      {
        "billing_cycle_sequence": 2,
        "pricing_scheme": {
          "fixed_price": { "value": "15", "currency_code": "USD" }
        }
      }
    ]
  }'
```

### List plans

```bash
curl -X GET "https://api-m.sandbox.paypal.com/v1/billing/plans?product_id=PROD-XXX&page_size=10&page=1&total_required=true" \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

## Step 6: Webhooks

Set up webhooks in the PayPal Developer Dashboard for subscription lifecycle events:

| Event | When it fires |
|-------|--------------|
| `BILLING.SUBSCRIPTION.CREATED` | Subscription created |
| `BILLING.SUBSCRIPTION.ACTIVATED` | Subscription activated (payment approved) |
| `BILLING.SUBSCRIPTION.UPDATED` | Subscription updated (plan change, etc.) |
| `BILLING.SUBSCRIPTION.EXPIRED` | Subscription reached end of all cycles |
| `BILLING.SUBSCRIPTION.CANCELLED` | Subscription cancelled |
| `BILLING.SUBSCRIPTION.SUSPENDED` | Subscription suspended (payment failure or manual) |
| `BILLING.SUBSCRIPTION.PAYMENT.FAILED` | Recurring payment failed |
| `PAYMENT.SALE.COMPLETED` | Recurring payment collected successfully |
| `BILLING.PLAN.CREATED` | New plan created |
| `BILLING.PLAN.UPDATED` | Plan updated |
| `BILLING.PLAN.ACTIVATED` | Plan activated |
| `BILLING.PLAN.PRICING-CHANGE.ACTIVATED` | Plan pricing changed |

### Webhook handler example (Node.js)

```javascript
app.post("/webhooks/paypal", async (req, res) => {
    // Verify webhook signature first (see paypal-checkout skill for verification code)
    const event = req.body;

    switch (event.event_type) {
        case "BILLING.SUBSCRIPTION.ACTIVATED":
            // Provision access for the subscriber
            await activateUserSubscription(event.resource.id);
            break;

        case "BILLING.SUBSCRIPTION.CANCELLED":
            // Revoke access
            await deactivateUserSubscription(event.resource.id);
            break;

        case "BILLING.SUBSCRIPTION.SUSPENDED":
            // Suspend access, notify user
            await suspendUserSubscription(event.resource.id);
            break;

        case "PAYMENT.SALE.COMPLETED":
            // Record payment, extend access
            await recordPayment(event.resource);
            break;

        case "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
            // Notify user, retry logic
            await handlePaymentFailure(event.resource);
            break;
    }

    res.sendStatus(200);
});
```

## Step 7: Full Node.js Server Example

```javascript
import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PAYPAL_BASE = process.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

async function getAccessToken() {
    const auth = Buffer.from(
        `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
    ).toString("base64");

    const response = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
        method: "POST",
        headers: { "Authorization": `Basic ${auth}` },
        body: "grant_type=client_credentials"
    });
    const data = await response.json();
    return data.access_token;
}

// Create product
app.post("/api/products", async (req, res) => {
    const token = await getAccessToken();
    const response = await fetch(`${PAYPAL_BASE}/v1/catalogs/products`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "PayPal-Request-Id": crypto.randomUUID()
        },
        body: JSON.stringify(req.body)
    });
    res.json(await response.json());
});

// Create plan
app.post("/api/plans", async (req, res) => {
    const token = await getAccessToken();
    const response = await fetch(`${PAYPAL_BASE}/v1/billing/plans`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "PayPal-Request-Id": crypto.randomUUID()
        },
        body: JSON.stringify(req.body)
    });
    res.json(await response.json());
});

// Get subscription details
app.get("/api/subscriptions/:id", async (req, res) => {
    const token = await getAccessToken();
    const response = await fetch(
        `${PAYPAL_BASE}/v1/billing/subscriptions/${req.params.id}`,
        { headers: { "Authorization": `Bearer ${token}` } }
    );
    res.json(await response.json());
});

// Cancel subscription
app.post("/api/subscriptions/:id/cancel", async (req, res) => {
    const token = await getAccessToken();
    const response = await fetch(
        `${PAYPAL_BASE}/v1/billing/subscriptions/${req.params.id}/cancel`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ reason: req.body.reason || "Customer request" })
        }
    );
    res.sendStatus(response.status);
});

// Suspend subscription
app.post("/api/subscriptions/:id/suspend", async (req, res) => {
    const token = await getAccessToken();
    const response = await fetch(
        `${PAYPAL_BASE}/v1/billing/subscriptions/${req.params.id}/suspend`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ reason: req.body.reason || "Customer request" })
        }
    );
    res.sendStatus(response.status);
});

// Reactivate subscription
app.post("/api/subscriptions/:id/activate", async (req, res) => {
    const token = await getAccessToken();
    const response = await fetch(
        `${PAYPAL_BASE}/v1/billing/subscriptions/${req.params.id}/activate`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ reason: req.body.reason || "Reactivated" })
        }
    );
    res.sendStatus(response.status);
});

app.listen(8080, () => console.log("Server on port 8080"));
```

## Common Patterns

### Multiple subscribe buttons on one page

Render separate `paypal.Buttons()` instances with different `plan_id` values, each targeting a different container div.

### Custom start date

```javascript
createSubscription: function(data, actions) {
    return actions.subscription.create({
        plan_id: "P-PLAN_ID",
        start_time: "2024-03-01T00:00:00Z"
    });
}
```

### Quantity-based pricing (per-seat)

```javascript
createSubscription: function(data, actions) {
    return actions.subscription.create({
        plan_id: "P-PLAN_ID",
        quantity: "5" // 5 seats
    });
}
```

## Common Pitfalls

- **JS SDK must include `vault=true` and `intent=subscription`** for subscriptions. Missing these causes silent failures.
- **One currency per plan.** Create separate plans for USD, EUR, KWD, etc.
- **`total_cycles: 0` means infinite** (auto-renewing). Use a specific number for fixed-term subscriptions.
- **Trial cycles cannot be updated after completion.** Only future cycles can be modified.
- **`SUBSCRIBE_NOW` vs `CONTINUE` user_action:** `SUBSCRIBE_NOW` auto-activates; `CONTINUE` requires a separate activation call.
- **Do NOT use the deprecated Billing Agreements API** (`/v1/payments/billing-plans/`). Use the current Subscriptions API (`/v1/billing/plans`).
- **Cache your access token** — it's valid for ~9 hours.

## Go Live Checklist

1. Get production credentials from PayPal Developer Dashboard
2. Replace sandbox credentials and base URL
3. Update JS SDK `client-id` to live ID
4. Remove `buyer-country` (sandbox-only)
5. Verify webhook endpoints are publicly accessible
6. Test with a real small subscription and cancel immediately
7. Verify subscription appears in your PayPal business account

## Reference

For the full API endpoint reference, read `references/api-endpoints.md`.
