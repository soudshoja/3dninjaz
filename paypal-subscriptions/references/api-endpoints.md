# PayPal Subscriptions API Endpoints Reference

## Table of Contents
1. [Authentication](#authentication)
2. [Catalog Products API](#catalog-products-api)
3. [Plans API](#plans-api)
4. [Subscriptions API](#subscriptions-api)
5. [Subscription Statuses](#subscription-statuses)
6. [Billing Cycle Patterns](#billing-cycle-patterns)
7. [Webhook Events](#webhook-events)
8. [Error Codes](#error-codes)

---

## Authentication

Same as Checkout — exchange Client ID + Secret for an OAuth 2.0 Bearer token:

```bash
curl -X POST "https://api-m.sandbox.paypal.com/v1/oauth2/token" \
  -u "CLIENT_ID:CLIENT_SECRET" \
  -d "grant_type=client_credentials"
```

**Base URLs:**
- Sandbox: `https://api-m.sandbox.paypal.com`
- Production: `https://api-m.paypal.com`

---

## Catalog Products API

| Action | Method | Endpoint |
|--------|--------|----------|
| Create product | POST | `/v1/catalogs/products` |
| List products | GET | `/v1/catalogs/products` |
| Get product | GET | `/v1/catalogs/products/{id}` |
| Update product | PATCH | `/v1/catalogs/products/{id}` |

### Create Product — full request body

```json
{
  "name": "My SaaS Product",
  "description": "Cloud-based SaaS platform",
  "type": "SERVICE",
  "category": "SOFTWARE",
  "image_url": "https://example.com/logo.png",
  "home_url": "https://example.com"
}
```

**Product types:** `PHYSICAL`, `DIGITAL`, `SERVICE`

**Categories (common):** `SOFTWARE`, `MEDIA_AND_ENTERTAINMENT`, `EDUCATION`, `FOOD_AND_BEVERAGE`, `HEALTH_AND_BEAUTY`, `CONSULTING`, `FINANCIAL_SERVICES`, `CLOTHING_AND_ACCESSORIES`

Full category list: https://developer.paypal.com/docs/api/catalog-products/v1/#definition-product_category

---

## Plans API

| Action | Method | Endpoint |
|--------|--------|----------|
| Create plan | POST | `/v1/billing/plans` |
| List plans | GET | `/v1/billing/plans` |
| Get plan | GET | `/v1/billing/plans/{id}` |
| Update plan | PATCH | `/v1/billing/plans/{id}` |
| Activate plan | POST | `/v1/billing/plans/{id}/activate` |
| Deactivate plan | POST | `/v1/billing/plans/{id}/deactivate` |
| Update pricing | POST | `/v1/billing/plans/{id}/update-pricing-schemes` |

### Create Plan — full request body schema

```json
{
  "product_id": "PROD-XXX",
  "name": "Plan Name",
  "description": "Plan description",
  "status": "ACTIVE",
  "billing_cycles": [
    {
      "frequency": {
        "interval_unit": "MONTH",
        "interval_count": 1
      },
      "tenure_type": "TRIAL",
      "sequence": 1,
      "total_cycles": 1,
      "pricing_scheme": {
        "fixed_price": {
          "value": "0",
          "currency_code": "USD"
        }
      }
    },
    {
      "frequency": {
        "interval_unit": "MONTH",
        "interval_count": 1
      },
      "tenure_type": "REGULAR",
      "sequence": 2,
      "total_cycles": 0,
      "pricing_scheme": {
        "fixed_price": {
          "value": "29.99",
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
}
```

### Frequency options

| interval_unit | interval_count examples |
|---------------|------------------------|
| `DAY` | 1 (daily), 7 (weekly alternative), 30 (monthly alternative) |
| `WEEK` | 1 (weekly), 2 (biweekly) |
| `MONTH` | 1 (monthly), 3 (quarterly), 6 (semi-annually) |
| `YEAR` | 1 (annually) |

### List plans with filters

```bash
curl -X GET "https://api-m.sandbox.paypal.com/v1/billing/plans?product_id=PROD-XXX&plan_ids=P-XXX,P-YYY&page_size=10&page=1&total_required=true" \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

---

## Subscriptions API

| Action | Method | Endpoint |
|--------|--------|----------|
| Create subscription | POST | `/v1/billing/subscriptions` |
| Get subscription | GET | `/v1/billing/subscriptions/{id}` |
| Update subscription | PATCH | `/v1/billing/subscriptions/{id}` |
| Revise subscription | POST | `/v1/billing/subscriptions/{id}/revise` |
| Suspend subscription | POST | `/v1/billing/subscriptions/{id}/suspend` |
| Activate subscription | POST | `/v1/billing/subscriptions/{id}/activate` |
| Cancel subscription | POST | `/v1/billing/subscriptions/{id}/cancel` |
| Capture payment | POST | `/v1/billing/subscriptions/{id}/capture` |
| List transactions | GET | `/v1/billing/subscriptions/{id}/transactions` |

### Create Subscription — full request body

```json
{
  "plan_id": "P-PLAN_ID",
  "start_time": "2024-02-01T00:00:00Z",
  "quantity": "1",
  "shipping_amount": {
    "currency_code": "USD",
    "value": "5.00"
  },
  "subscriber": {
    "name": {
      "given_name": "John",
      "surname": "Doe"
    },
    "email_address": "buyer@example.com",
    "shipping_address": {
      "name": { "full_name": "John Doe" },
      "address": {
        "address_line_1": "123 Main St",
        "admin_area_2": "San Jose",
        "admin_area_1": "CA",
        "postal_code": "95131",
        "country_code": "US"
      }
    }
  },
  "application_context": {
    "brand_name": "Your Company",
    "locale": "en-US",
    "shipping_preference": "SET_PROVIDED_ADDRESS",
    "user_action": "SUBSCRIBE_NOW",
    "payment_method": {
      "payer_selected": "PAYPAL",
      "payee_preferred": "IMMEDIATE_PAYMENT_REQUIRED"
    },
    "return_url": "https://example.com/success",
    "cancel_url": "https://example.com/cancel"
  },
  "plan": {
    "billing_cycles": [
      {
        "sequence": 2,
        "total_cycles": 0,
        "pricing_scheme": {
          "fixed_price": {
            "value": "35.00",
            "currency_code": "USD"
          }
        }
      }
    ]
  }
}
```

**shipping_preference options:** `GET_FROM_FILE` (PayPal provides address), `NO_SHIPPING`, `SET_PROVIDED_ADDRESS` (use the address you provide)

**user_action options:** `SUBSCRIBE_NOW` (auto-activate on approval), `CONTINUE` (require separate activation call)

### Override plan pricing at subscription level

The `plan` object in the create subscription body lets you override specific billing cycles. The override must adhere to the plan structure but can change the price. Useful for promotional pricing.

### Revise subscription (upgrade/downgrade)

```json
{
  "plan_id": "P-NEW_PLAN_ID",
  "shipping_amount": {
    "currency_code": "USD",
    "value": "5.00"
  },
  "application_context": {
    "brand_name": "Your Company",
    "return_url": "https://example.com/return",
    "cancel_url": "https://example.com/cancel"
  }
}
```

Returns approval link if buyer consent is required.

### Capture outstanding payment

Force an immediate payment on a subscription (e.g., for outstanding balance):

```bash
curl -X POST "https://api-m.sandbox.paypal.com/v1/billing/subscriptions/SUB_ID/capture" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{
    "note": "Charging outstanding balance",
    "capture_type": "OUTSTANDING_BALANCE",
    "amount": {
      "currency_code": "USD",
      "value": "10.00"
    }
  }'
```

---

## Subscription Statuses

| Status | Description |
|--------|-------------|
| `APPROVAL_PENDING` | Created, waiting for buyer approval |
| `APPROVED` | Buyer approved, not yet active |
| `ACTIVE` | Subscription is active and billing |
| `SUSPENDED` | Temporarily paused (manual or payment failure) |
| `CANCELLED` | Permanently cancelled |
| `EXPIRED` | All billing cycles completed |

### Status transitions

```
APPROVAL_PENDING → APPROVED → ACTIVE
ACTIVE → SUSPENDED (payment failure or manual suspend)
SUSPENDED → ACTIVE (reactivate)
ACTIVE → CANCELLED (manual cancel)
ACTIVE → EXPIRED (all cycles completed)
SUSPENDED → CANCELLED
```

---

## Billing Cycle Patterns

### Monthly subscription (infinite)
```json
[{
  "frequency": { "interval_unit": "MONTH", "interval_count": 1 },
  "tenure_type": "REGULAR",
  "sequence": 1,
  "total_cycles": 0,
  "pricing_scheme": { "fixed_price": { "value": "9.99", "currency_code": "USD" } }
}]
```

### Annual with 7-day free trial
```json
[
  {
    "frequency": { "interval_unit": "DAY", "interval_count": 7 },
    "tenure_type": "TRIAL",
    "sequence": 1,
    "total_cycles": 1
  },
  {
    "frequency": { "interval_unit": "YEAR", "interval_count": 1 },
    "tenure_type": "REGULAR",
    "sequence": 2,
    "total_cycles": 0,
    "pricing_scheme": { "fixed_price": { "value": "99.99", "currency_code": "USD" } }
  }
]
```

### Discounted first 3 months, then regular price
```json
[
  {
    "frequency": { "interval_unit": "MONTH", "interval_count": 1 },
    "tenure_type": "TRIAL",
    "sequence": 1,
    "total_cycles": 3,
    "pricing_scheme": { "fixed_price": { "value": "4.99", "currency_code": "USD" } }
  },
  {
    "frequency": { "interval_unit": "MONTH", "interval_count": 1 },
    "tenure_type": "REGULAR",
    "sequence": 2,
    "total_cycles": 0,
    "pricing_scheme": { "fixed_price": { "value": "14.99", "currency_code": "USD" } }
  }
]
```

### Fixed 12-month subscription with setup fee
```json
{
  "billing_cycles": [{
    "frequency": { "interval_unit": "MONTH", "interval_count": 1 },
    "tenure_type": "REGULAR",
    "sequence": 1,
    "total_cycles": 12,
    "pricing_scheme": { "fixed_price": { "value": "19.99", "currency_code": "USD" } }
  }],
  "payment_preferences": {
    "auto_bill_outstanding": true,
    "setup_fee": { "value": "25.00", "currency_code": "USD" },
    "setup_fee_failure_action": "CANCEL",
    "payment_failure_threshold": 2
  }
}
```

---

## Webhook Events

### Subscription lifecycle events

| Event | Description |
|-------|-------------|
| `BILLING.SUBSCRIPTION.CREATED` | Subscription created, awaiting approval |
| `BILLING.SUBSCRIPTION.ACTIVATED` | Subscription activated after buyer approval |
| `BILLING.SUBSCRIPTION.UPDATED` | Subscription details updated |
| `BILLING.SUBSCRIPTION.EXPIRED` | All billing cycles completed |
| `BILLING.SUBSCRIPTION.CANCELLED` | Subscription cancelled |
| `BILLING.SUBSCRIPTION.SUSPENDED` | Subscription suspended |
| `BILLING.SUBSCRIPTION.PAYMENT.FAILED` | A scheduled payment failed |
| `BILLING.SUBSCRIPTION.RE-ACTIVATED` | Suspended subscription reactivated |

### Payment events

| Event | Description |
|-------|-------------|
| `PAYMENT.SALE.COMPLETED` | Recurring payment collected |
| `PAYMENT.SALE.REFUNDED` | Payment refunded |
| `PAYMENT.SALE.REVERSED` | Payment reversed |

### Plan events

| Event | Description |
|-------|-------------|
| `BILLING.PLAN.CREATED` | Plan created |
| `BILLING.PLAN.UPDATED` | Plan modified |
| `BILLING.PLAN.ACTIVATED` | Plan activated |
| `BILLING.PLAN.PRICING-CHANGE.ACTIVATED` | Plan pricing updated |

---

## Error Codes

| HTTP | Error | Description |
|------|-------|-------------|
| 400 | `INVALID_REQUEST` | Malformed request |
| 401 | `AUTHENTICATION_FAILURE` | Bad or expired token |
| 403 | `NOT_AUTHORIZED` | Insufficient permissions |
| 404 | `RESOURCE_NOT_FOUND` | Plan or subscription not found |
| 422 | `UNPROCESSABLE_ENTITY` | Valid request but cannot process |
| 422 | `SUBSCRIPTION_STATUS_INVALID` | Action not allowed in current status |
| 422 | `BILLING_CYCLE_NOT_EDITABLE` | Attempted to edit a completed cycle |
| 429 | `RATE_LIMIT_REACHED` | Too many requests |

### Common 422 error details

- `PLAN_NOT_ACTIVE` — Plan must be ACTIVE to create subscriptions
- `SUBSCRIPTION_STATUS_INVALID` — Cannot perform action in current subscription status
- `BILLING_CYCLES_NOT_VALID` — Billing cycles don't follow plan structure rules
- `CURRENCY_NOT_SUPPORTED` — Currency not allowed for this merchant/country
