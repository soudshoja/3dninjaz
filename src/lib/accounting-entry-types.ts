// Row/filter shapes for the accounting entry screens (expenses list, assets
// with payments, orders payment-method tagging). Types and plain constants
// only, so "use server" action files and client components can both import
// them. Kept apart from accounting-types.ts so parallel tracks do not collide.

import type { AssetPaymentRow, AssetRow } from "@/lib/accounting-types";

export type ExpenseFilters = {
  from?: string | null;
  to?: string | null;
  category?: string | null;
  paidFrom?: string | null;
  bankMatch?: string | null;
  projectTag?: string | null;
  /** Free text over supplier, note, subcategory and external reference. */
  q?: string | null;
};

export type IncomeFilters = {
  from?: string | null;
  to?: string | null;
  kind?: string | null;
  account?: string | null;
  q?: string | null;
};

export type ExpenseFacets = {
  vendors: string[];
  subcategories: string[];
  projectTags: string[];
};

export type AssetWithPayments = AssetRow & {
  payments: AssetPaymentRow[];
  paidTotal: number;
  remaining: number;
  paymentCount: number;
};

export type OrderTagResult =
  | { ok: true; updated: number }
  | { ok: false; error: string };
