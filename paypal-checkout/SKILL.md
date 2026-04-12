---
name: paypal-checkout
description: "Integrate PayPal Standard Checkout for one-time payments using the Orders v2 API, PayPal JavaScript SDK, and PayPal Server SDK. Use this skill whenever the user mentions PayPal checkout, PayPal payments, PayPal buttons, PayPal orders, accepting payments via PayPal, integrating PayPal on a website, PayPal one-time payments, or building a checkout flow with PayPal. Also trigger when the user asks about creating PayPal orders, capturing PayPal payments, refunding PayPal transactions, PayPal JS SDK integration, or PayPal Server SDK setup. This skill covers both client-side (HTML/React) and server-side (Node.js/Python/PHP) integration patterns."
---

# PayPal Standard Checkout Integration

This skill covers integrating PayPal Standard Checkout for **one-time payments**. For recurring/subscription billing, see the `paypal-subscriptions` skill instead.

## Architecture Overview

PayPal Checkout uses a client-server architecture:

1. **Client (browser):** PayPal JavaScript SDK renders payment buttons, handles buyer approval in a popup
2. **Server (backend):** Creates orders via Orders v2 API, captures payments, handles refunds
3. **PayPal:** Authenticates the buyer, processes the payment, returns confirmation

The flow: Buyer clicks button → Client calls your server → Server creates order via PayPal API → Client opens PayPal popup → Buyer approves → Client calls your server → Server captures payment → Done.

## Prerequisites

- A PayPal Developer account with sandbox credentials (Client ID + Client Secret)
- Environment variables: `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`
- For sandbox testing: `https://api-m.sandbox.paypal.com`
- For production: `https://api-m.paypal.com`

## Step 1: Front-End — Add the PayPal JS SDK

Include the PayPal JavaScript SDK on your checkout page. The SDK renders payment buttons and handles the buyer popup flow.

### HTML Integration

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Checkout</title>
</head>
<body>
    <div id="paypal-button-container"></div>
    <p id="result-message"></p>

    <!-- Load PayPal JS SDK -->
    <script src="https://www.paypal.com/sdk/js?client-id=YOUR_CLIENT_ID&currency=USD&components=buttons&enable-funding=venmo,paylater,card"
        data-sdk-integration-source="developer-studio">
    </script>
    <script src="app.js"></script>
</body>
</html>
```

**Script parameters:**
- `client-id` (required): Your PayPal app client ID
- `currency`: Payment currency (default: USD). Options: USD, EUR, GBP, CAD, AUD, etc.
- `components`: SDK components to load. Use `buttons` for checkout buttons.
- `enable-funding`: Explicitly enable: `venmo`, `paylater`, `card`
- `disable-funding`: Explicitly disable payment methods
- `buyer-country`: **Sandbox only** — simulate buyer from a specific country
- `intent`: `capture` (default) or `authorize`

### Client-Side JavaScript (app.js)

```javascript
paypal.Buttons({
    style: {
        shape: "rect",    // "rect" or "pill"
        layout: "vertical", // "vertical" or "horizontal"
        color: "gold",    // "gold", "blue", "silver", "white", "black"
        label: "paypal"   // "paypal", "checkout", "buynow", "pay", "subscribe", "donate"
    },

    async createOrder() {
        // Call YOUR server to create the order
        const response = await fetch("/api/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                cart: [
                    { id: "PRODUCT_1", quantity: 1 }
                ]
            })
        });
        const orderData = await response.json();
        if (orderData.id) {
            return orderData.id;
        }
        throw new Error("Could not create order");
    },

    async onApprove(data, actions) {
        // Call YOUR server to capture the payment
        const response = await fetch(`/api/orders/${data.orderID}/capture`, {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });
        const orderData = await response.json();
        const transaction = orderData?.purchase_units?.[0]?.payments?.captures?.[0];
        if (transaction?.status === "COMPLETED") {
            document.getElementById("result-message").innerText =
                `Payment successful! Transaction ID: ${transaction.id}`;
        } else {
            throw new Error("Payment not completed");
        }
    },

    onError(err) {
        console.error("PayPal Checkout error:", err);
        document.getElementById("result-message").innerText =
            "An error occurred during payment. Please try again.";
    },

    onCancel(data) {
        document.getElementById("result-message").innerText =
            "Payment was cancelled.";
    }
}).render("#paypal-button-container");
```

### React Integration

```jsx
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

function Checkout() {
    const initialOptions = {
        clientId: "YOUR_CLIENT_ID",
        currency: "USD",
        intent: "capture",
        enableFunding: "venmo,paylater,card"
    };

    return (
        <PayPalScriptProvider options={initialOptions}>
            <PayPalButtons
                style={{ shape: "rect", layout: "vertical", color: "gold" }}
                createOrder={async () => {
                    const res = await fetch("/api/orders", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ cart: [{ id: "PRODUCT_1", quantity: 1 }] })
                    });
                    const data = await res.json();
                    return data.id;
                }}
                onApprove={async (data) => {
                    const res = await fetch(`/api/orders/${data.orderID}/capture`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" }
                    });
                    const orderData = await res.json();
                    // Handle success
                }}
                onError={(err) => console.error("PayPal error:", err)}
                onCancel={() => console.log("Payment cancelled")}
            />
        </PayPalScriptProvider>
    );
}
```

Install the React SDK: `npm install @paypal/react-paypal-js`

## Step 2: Back-End — Server Integration

### Option A: Using `@paypal/paypal-server-sdk` (Recommended for Node.js)

```bash
npm install @paypal/paypal-server-sdk
```

```javascript
import express from "express";
import {
    ApiError,
    Client,
    Environment,
    LogLevel,
    OrdersController,
    PaymentsController,
} from "@paypal/paypal-server-sdk";

const client = new Client({
    clientCredentialsAuthCredentials: {
        oAuthClientId: process.env.PAYPAL_CLIENT_ID,
        oAuthClientSecret: process.env.PAYPAL_CLIENT_SECRET,
    },
    timeout: 0,
    environment: Environment.Sandbox, // Change to Environment.Production for live
    logging: {
        logLevel: LogLevel.Info,
        logRequest: { logBody: true },
        logResponse: { logBody: true },
    },
});

const ordersController = new OrdersController(client);
const paymentsController = new PaymentsController(client);

const app = express();
app.use(express.json());
app.use(express.static("src")); // Serve your front-end files

// CREATE ORDER
app.post("/api/orders", async (req, res) => {
    try {
        const { cart } = req.body;
        const { body } = await ordersController.ordersCreate({
            body: {
                intent: "CAPTURE",
                purchase_units: [
                    {
                        amount: {
                            currencyCode: "USD",
                            value: "100.00", // Calculate from cart
                        },
                    },
                ],
            },
            prefer: "return=minimal",
        });
        res.json(JSON.parse(body));
    } catch (error) {
        console.error("Create order error:", error);
        res.status(500).json({ error: "Failed to create order" });
    }
});

// CAPTURE PAYMENT
app.post("/api/orders/:orderID/capture", async (req, res) => {
    try {
        const { orderID } = req.params;
        const { body } = await ordersController.ordersCapture({
            id: orderID,
            prefer: "return=minimal",
        });
        res.json(JSON.parse(body));
    } catch (error) {
        console.error("Capture error:", error);
        res.status(500).json({ error: "Failed to capture payment" });
    }
});

// REFUND (optional)
app.post("/api/payments/:captureID/refund", async (req, res) => {
    try {
        const { captureID } = req.params;
        const { body } = await paymentsController.capturesRefund({
            captureId: captureID,
            prefer: "return=minimal",
        });
        res.json(JSON.parse(body));
    } catch (error) {
        console.error("Refund error:", error);
        res.status(500).json({ error: "Failed to refund" });
    }
});

app.listen(8080, () => console.log("Server running on port 8080"));
```

### Option B: Using direct REST API calls (any language)

For the detailed REST API reference with curl examples, read `references/rest-api.md`.

The core endpoints are:

| Action | Method | Endpoint |
|--------|--------|----------|
| Generate access token | POST | `/v1/oauth2/token` |
| Create order | POST | `/v2/checkout/orders` |
| Capture payment | POST | `/v2/checkout/orders/{id}/capture` |
| Get order details | GET | `/v2/checkout/orders/{id}` |
| Refund capture | POST | `/v2/payments/captures/{id}/refund` |
| Authorize payment | POST | `/v2/checkout/orders/{id}/authorize` |
| Capture authorization | POST | `/v2/payments/authorizations/{id}/capture` |

### Option C: Python (Flask/FastAPI)

```python
import os, requests, base64
from flask import Flask, request, jsonify

app = Flask(__name__)

PAYPAL_CLIENT_ID = os.environ["PAYPAL_CLIENT_ID"]
PAYPAL_CLIENT_SECRET = os.environ["PAYPAL_CLIENT_SECRET"]
PAYPAL_BASE = "https://api-m.sandbox.paypal.com"  # Change for production

def get_access_token():
    auth = base64.b64encode(f"{PAYPAL_CLIENT_ID}:{PAYPAL_CLIENT_SECRET}".encode()).decode()
    response = requests.post(
        f"{PAYPAL_BASE}/v1/oauth2/token",
        headers={"Authorization": f"Basic {auth}"},
        data={"grant_type": "client_credentials"}
    )
    return response.json()["access_token"]

@app.post("/api/orders")
def create_order():
    token = get_access_token()
    response = requests.post(
        f"{PAYPAL_BASE}/v2/checkout/orders",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        json={
            "intent": "CAPTURE",
            "purchase_units": [{
                "amount": {"currency_code": "USD", "value": "100.00"}
            }]
        }
    )
    return jsonify(response.json())

@app.post("/api/orders/<order_id>/capture")
def capture_order(order_id):
    token = get_access_token()
    response = requests.post(
        f"{PAYPAL_BASE}/v2/checkout/orders/{order_id}/capture",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
    )
    return jsonify(response.json())
```

## Step 3: Handle Edge Cases

### Funding failures (INSTRUMENT_DECLINED)

When a payment method fails, restart the checkout so the buyer can pick another method:

```javascript
async onApprove(data, actions) {
    const response = await fetch(`/api/orders/${data.orderID}/capture`, { method: "POST" });
    const orderData = await response.json();
    const errorDetail = orderData?.details?.[0];
    if (errorDetail?.issue === "INSTRUMENT_DECLINED") {
        // Restarts the PayPal popup for a new payment method
        return actions.restart();
    }
    // Handle success...
}
```

### Error handling

```javascript
onError(err) {
    // This is a catch-all — show a generic message or redirect
    window.location.href = "/checkout-error";
}
```

### Authorize then capture later

Use `intent: "AUTHORIZE"` instead of `"CAPTURE"` in your create order call. Then capture within 3 days (extendable to 29 days) using:
- `POST /v2/checkout/orders/{id}/authorize`
- `POST /v2/payments/authorizations/{auth_id}/capture`

## Step 4: Webhooks

Set up webhooks in the PayPal Developer Dashboard to receive real-time notifications:

| Event | When it fires |
|-------|--------------|
| `CHECKOUT.ORDER.APPROVED` | Buyer approved the payment |
| `PAYMENT.CAPTURE.COMPLETED` | Payment captured successfully |
| `PAYMENT.CAPTURE.DENIED` | Capture was denied |
| `PAYMENT.CAPTURE.REFUNDED` | Refund was processed |
| `PAYMENT.CAPTURE.REVERSED` | Payment was reversed |

Webhook verification: Always verify webhook signatures server-side using the PayPal Webhook API or SDK.

## Step 5: Go Live Checklist

1. Log into the PayPal Developer Dashboard with your **business** account
2. Create a **Live** app and get production Client ID + Secret
3. Replace sandbox credentials with live credentials
4. Change API base URL from `sandbox` to production
5. Update JS SDK `client-id` to the live Client ID
6. Remove `buyer-country` parameter (sandbox-only)
7. Test with a real small transaction

## Common Pitfalls

- **Do NOT calculate amounts client-side only.** Always validate/calculate on your server.
- **Do NOT use the deprecated `@paypal/checkout-server-sdk`.** Use `@paypal/paypal-server-sdk` instead.
- **Cache your access token.** It's valid for ~9 hours; don't request a new one per API call.
- **Handle the `INSTRUMENT_DECLINED` error** by calling `actions.restart()`.
- **Always use `prefer: "return=minimal"` or `"return=representation"`** on create/capture calls for predictable responses.

## Reference

For the full REST API curl examples and detailed request/response schemas, read `references/rest-api.md`.
