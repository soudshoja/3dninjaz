---
title: Seeing this month's profit
category: Operations
tags: [profit, analytics, dashboard]
order: 3
---

# Seeing this month's profit

The **Dashboard** shows your profit for the current calendar month in the "Profit this month" card.

## What the card shows

- **Profit (MYR)** — revenue minus cost for the current month
- **Margin %** — profit as a percentage of revenue
- **Revenue** — total payments captured this month
- **Total cost** — sum of all order costs (from product cost breakdowns)
- **Order count** — number of paid orders this month
- A **warning** if any orders are missing cost data (shown as a yellow alert)

## How the profit is calculated

For each order this month:

```
Order profit = order revenue - order cost
Order cost = sum of (unit_cost × quantity) for each line item
           + any extra_cost per line item
```

`unit_cost` is the cost price recorded when the order was placed (snapshotted from the variant's cost data at that time). This means even if you later change the product's cost data, historical orders keep their original cost snapshot.

## If the profit looks too high

The most common reason is **missing cost data**. If a variant had no cost data filled in when the order was placed, its `unit_cost` is zero — making it look like pure profit.

The warning message tells you how many orders have missing cost data this month. Open those orders and check whether the product's cost breakdown was set.

## Revenue chart and top products

Below the profit card, the Dashboard also shows:
- **Revenue chart** — daily revenue for the selected range (7d / 30d / 90d)
- **Top products** — which products are selling the most
- **Funnel** — a conversion funnel showing visitors → product views → orders

Use the range tabs (7d / 30d / 90d) to change the time window for the chart and funnel. The "Profit this month" card always shows the current calendar month regardless of the range tab.

**Admin page:** `/admin`
