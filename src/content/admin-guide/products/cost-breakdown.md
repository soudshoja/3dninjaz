---
title: How cost is calculated (filament, electricity, labor)
category: Products
tags: [cost, profit, filament, electricity, labor]
order: 5
---

# How cost is calculated

The cost breakdown shows you exactly how much it costs to produce each variant, and what your profit margin is at the current selling price.

## The formula

```
Total cost = filament cost + electricity cost + labor cost + other cost
           + overhead %
```

Each component is calculated like this:

**Filament cost**
= (filament grams ÷ 1000) × filament cost per kg

**Electricity cost**
= print time hours × printer power kWh/hr × electricity cost per kWh

**Labor cost**
= (labor minutes ÷ 60) × labor rate per hour

**Overhead**
= overhead % × (filament + electricity + labor + other)

## Where the rates come from

Rates come from two places:

1. **Store defaults** — set in Settings → Cost Defaults. These apply to all products unless overridden.
2. **Per-variant overrides** — set on each variant. Use these when a specific product uses a specialty filament with a different cost, or when a variant requires unusually high labor.

If a variant has no override, the store default is used. If the store default is also blank, that component is treated as zero cost.

## Where to see the live calculation

Open any product for editing. In the Sizes & Pricing section, expand a size. As you fill in the cost fields, the panel shows:
- Total cost (MYR)
- Gross profit (selling price minus cost)
- Margin %

This updates live as you type.

## Profit on the dashboard

The **Dashboard** shows "Profit this month" — a calendar-month summary calculated from the cost data on each order's line items. If an order has no cost data, it's treated as zero cost (which inflates profit). The dashboard shows a warning if any orders this month are missing cost data.

**Tip:** You don't have to fill in cost data right away. Products sell normally without it. But if you want to understand your business economics, filling in cost data for your top-selling products is worth the 5 minutes.
