# PayPal Checkout REST API Reference

## Table of Contents
1. [Authentication](#authentication)
2. [Create Order](#create-order)
3. [Capture Payment](#capture-payment)
4. [Get Order Details](#get-order-details)
5. [Authorize Payment](#authorize-payment)
6. [Capture Authorization](#capture-authorization)
7. [Refund Capture](#refund-capture)
8. [Error Codes](#error-codes)
9. [Currency Codes](#currency-codes)

---

## Authentication

All API calls require an OAuth 2.0 access token. Exchange your Client ID and Secret for a token:

```bash
curl -X POST "https://api-m.sandbox.paypal.com/v1/oauth2/token" \
  -H "Accept: application/json" \
  -H "Accept-Language: en_US" \
  -u "CLIENT_ID:CLIENT_SECRET" \
  -d "grant_type=client_credentials"
```

Response:
```json
{
  "scope": "https://uri.paypal.com/services/payments/...",
  "access_token": "A21AAFEpH4PsADK7...",
  "token_type": "Bearer",
  "app_id": "APP-80W284485P519543T",
  "expires_in": 32400,
  "nonce": "2023-01-21T..."
}
```

The token is valid for approximately 9 hours (32400 seconds). Cache it and reuse until near expiry.

**Base URLs:**
- Sandbox: `https://api-m.sandbox.paypal.com`
- Production: `https://api-m.paypal.com`

---

## Create Order

`POST /v2/checkout/orders`

Creates an order that represents a payment intent.

### Request

```bash
curl -X POST "https://api-m.sandbox.paypal.com/v2/checkout/orders" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "PayPal-Request-Id: UNIQUE_REQUEST_ID" \
  -d '{
    "intent": "CAPTURE",
    "purchase_units": [
      {
        "reference_id": "order_ref_1",
        "description": "Widget order",
        "amount": {
          "currency_code": "USD",
          "value": "100.00",
          "breakdown": {
            "item_total": { "currency_code": "USD", "value": "85.00" },
            "shipping": { "currency_code": "USD", "value": "10.00" },
            "tax_total": { "currency_code": "USD", "value": "5.00" }
          }
        },
        "items": [
          {
            "name": "Premium Widget",
            "unit_amount": { "currency_code": "USD", "value": "85.00" },
            "quantity": "1",
            "description": "A premium widget",
            "category": "PHYSICAL_GOODS"
          }
        ],
        "shipping": {
          "name": { "full_name": "John Doe" },
          "address": {
            "address_line_1": "123 Main St",
            "admin_area_2": "San Jose",
            "admin_area_1": "CA",
            "postal_code": "95131",
            "country_code": "US"
          }
        }
      }
    ],
    "application_context": {
      "brand_name": "Your Company",
      "landing_page": "LOGIN",
      "user_action": "PAY_NOW",
      "return_url": "https://example.com/return",
      "cancel_url": "https://example.com/cancel"
    }
  }'
```

### Key fields

| Field | Required | Description |
|-------|----------|-------------|
| `intent` | Yes | `CAPTURE` (immediate) or `AUTHORIZE` (hold funds) |
| `purchase_units` | Yes | Array of purchase units (max 10) |
| `purchase_units[].amount.currency_code` | Yes | ISO 4217 currency code |
| `purchase_units[].amount.value` | Yes | Total amount as string with 2 decimals |
| `purchase_units[].amount.breakdown` | No | Breakdown of item_total, shipping, tax_total, discount, etc. |
| `purchase_units[].items` | No | Line items (amounts must sum to `item_total`) |
| `purchase_units[].shipping` | No | Shipping address |
| `application_context.return_url` | Conditional | Required for redirect-based flows |
| `application_context.cancel_url` | Conditional | Required for redirect-based flows |

### Response (201 Created)

```json
{
  "id": "5O190127TN364715T",
  "status": "CREATED",
  "links": [
    { "href": "https://api-m.sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T", "rel": "self", "method": "GET" },
    { "href": "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T", "rel": "approve", "method": "GET" },
    { "href": "https://api-m.sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T", "rel": "update", "method": "PATCH" },
    { "href": "https://api-m.sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T/capture", "rel": "capture", "method": "POST" }
  ]
}
```

Return the `id` to your client-side code.

---

## Capture Payment

`POST /v2/checkout/orders/{id}/capture`

Captures payment for an approved order (after buyer approval).

```bash
curl -X POST "https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER_ID/capture" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

### Response (201 Created)

```json
{
  "id": "ORDER_ID",
  "status": "COMPLETED",
  "purchase_units": [{
    "payments": {
      "captures": [{
        "id": "CAPTURE_ID",
        "status": "COMPLETED",
        "amount": { "currency_code": "USD", "value": "100.00" },
        "final_capture": true,
        "create_time": "2024-01-21T16:04:39Z"
      }]
    }
  }],
  "payer": {
    "email_address": "buyer@example.com",
    "payer_id": "PAYER_ID",
    "name": { "given_name": "John", "surname": "Doe" }
  }
}
```

Save the `captures[].id` for refunds.

---

## Get Order Details

`GET /v2/checkout/orders/{id}`

```bash
curl -X GET "https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER_ID" \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

---

## Authorize Payment

`POST /v2/checkout/orders/{id}/authorize`

Used when `intent: "AUTHORIZE"`. Holds funds without capturing.

```bash
curl -X POST "https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER_ID/authorize" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

The authorization is valid for 3 days (honor period), extendable up to 29 days. You must capture within this window.

---

## Capture Authorization

`POST /v2/payments/authorizations/{authorization_id}/capture`

```bash
curl -X POST "https://api-m.sandbox.paypal.com/v2/payments/authorizations/AUTH_ID/capture" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{
    "amount": { "currency_code": "USD", "value": "100.00" },
    "final_capture": true
  }'
```

---

## Refund Capture

`POST /v2/payments/captures/{capture_id}/refund`

### Full refund
```bash
curl -X POST "https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE_ID/refund" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

### Partial refund
```bash
curl -X POST "https://api-m.sandbox.paypal.com/v2/payments/captures/CAPTURE_ID/refund" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{
    "amount": { "currency_code": "USD", "value": "25.00" },
    "note_to_payer": "Partial refund for returned item"
  }'
```

---

## Error Codes

| HTTP Code | Error | Description |
|-----------|-------|-------------|
| 400 | `INVALID_REQUEST` | Malformed request body |
| 401 | `AUTHENTICATION_FAILURE` | Invalid or expired access token |
| 403 | `NOT_AUTHORIZED` | Insufficient permissions |
| 404 | `RESOURCE_NOT_FOUND` | Order/capture ID not found |
| 422 | `UNPROCESSABLE_ENTITY` | Valid request but cannot process |
| 422 | `INSTRUMENT_DECLINED` | Payment method was declined |
| 422 | `ORDER_NOT_APPROVED` | Buyer hasn't approved the order yet |
| 422 | `ORDER_ALREADY_CAPTURED` | This order was already captured |
| 429 | `RATE_LIMIT_REACHED` | Too many requests |

---

## Currency Codes

Common supported currencies: `USD`, `EUR`, `GBP`, `CAD`, `AUD`, `JPY`, `CHF`, `HKD`, `SGD`, `SEK`, `DKK`, `NOK`, `MXN`, `BRL`, `ILS`, `NZD`, `PHP`, `PLN`, `TWD`, `THB`, `CZK`, `HUF`, `KWD` (Kuwaiti Dinar).

Full list: https://developer.paypal.com/api/rest/reference/currency-codes/

---

## Webhook Events for Checkout

| Event Name | Trigger |
|-----------|---------|
| `CHECKOUT.ORDER.APPROVED` | Buyer approved the order in PayPal popup |
| `CHECKOUT.ORDER.COMPLETED` | Order completed (all payments captured) |
| `CHECKOUT.ORDER.SAVED` | Order saved for later processing |
| `PAYMENT.CAPTURE.COMPLETED` | Payment capture succeeded |
| `PAYMENT.CAPTURE.DENIED` | Capture denied by PayPal |
| `PAYMENT.CAPTURE.PENDING` | Capture is pending (review, echeck) |
| `PAYMENT.CAPTURE.REFUNDED` | Refund processed for a capture |
| `PAYMENT.CAPTURE.REVERSED` | Capture reversed (chargeback, dispute) |
| `PAYMENT.AUTHORIZATION.CREATED` | Authorization created |
| `PAYMENT.AUTHORIZATION.VOIDED` | Authorization voided |

### Webhook verification (Node.js example)

```javascript
// Verify webhook signature using PayPal's verification API
app.post("/webhooks/paypal", async (req, res) => {
    const verifyResponse = await fetch(
        "https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                auth_algo: req.headers["paypal-auth-algo"],
                cert_url: req.headers["paypal-cert-url"],
                transmission_id: req.headers["paypal-transmission-id"],
                transmission_sig: req.headers["paypal-transmission-sig"],
                transmission_time: req.headers["paypal-transmission-time"],
                webhook_id: "YOUR_WEBHOOK_ID",
                webhook_event: req.body
            })
        }
    );
    const result = await verifyResponse.json();
    if (result.verification_status === "SUCCESS") {
        // Process the webhook event
        const eventType = req.body.event_type;
        const resource = req.body.resource;
        // Handle event...
    }
    res.sendStatus(200);
});
```

---

## Testing with Sandbox

1. Use sandbox credentials from the PayPal Developer Dashboard
2. Log in with sandbox personal account to simulate buyer
3. Use the credit card generator: https://developer.paypal.com/tools/sandbox/card-testing/#link-creditcardgenerator
4. For negative testing (simulating errors): https://developer.paypal.com/tools/sandbox/negative-testing/
