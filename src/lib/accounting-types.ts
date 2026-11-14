// Pure types shared between the "use server" accounting actions and client
// forms/pages. Kept out of any "use server" or "server-only" module so both
// the client and server bundles can import them freely (types are erased at
// compile time, so there is no runtime import either way).
//
// See project memory "use server can't export types" — a "use server" file must
// export ONLY async functions, so row types live here, not in the action file.
//
// Accounting v2 (2026-11): this file also holds the shared runtime constants
// (category / account / bank-match / income-kind lists + labels). Those are
// plain values with no server imports, safe for client bundles. The value
// lists must stay in sync with the DDL enums in scripts/accounting-v2-migrate.cjs
// and the Drizzle enums in src/lib/db/schema.ts.

export const EXPENSE_CATEGORIES = [
  "materials",
  "packaging",
  "consumables",
  "equipment",
  "design",
  "marketing",
  "fees",
  "utilities",
  "shipping",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  materials: "Materials",
  packaging: "Packaging",
  consumables: "Consumables",
  equipment: "Equipment and setup",
  design: "Design",
  marketing: "Marketing",
  fees: "Fees and duties",
  utilities: "Utilities",
  shipping: "Shipping",
  other: "Other",
};

export const ACCOUNT_KEYS = ["paypal", "bank", "cash", "credit_card"] as const;
export type AccountKey = (typeof ACCOUNT_KEYS)[number];

export const ACCOUNT_LABELS: Record<AccountKey, string> = {
  paypal: "PayPal",
  bank: "Bank",
  cash: "Cash",
  credit_card: "Credit card",
};

export const BANK_MATCH_VALUES = ["unchecked", "matched", "check", "not_found"] as const;
export type BankMatch = (typeof BANK_MATCH_VALUES)[number];

export const BANK_MATCH_LABELS: Record<BankMatch, string> = {
  unchecked: "Not checked",
  matched: "Matched",
  check: "Needs checking",
  not_found: "Not found in bank",
};

export const INCOME_KINDS = ["project", "event", "other", "capital_in", "capital_out"] as const;
export type IncomeKind = (typeof INCOME_KINDS)[number];

export const INCOME_KIND_LABELS: Record<IncomeKind, string> = {
  project: "Project",
  event: "Event or bazaar",
  other: "Other income",
  capital_in: "Capital in",
  capital_out: "Capital out",
};

/** Kinds that count towards profit. capital_* is funding and never does. */
export const PROFIT_INCOME_KINDS = ["project", "event", "other"] as const satisfies readonly IncomeKind[];

export const PAYMENT_METHODS = ["paypal", "bank_transfer", "cash", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  paypal: "PayPal",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  other: "Other",
};

export const UNIT_COST_SOURCES = ["snapshot", "estimate", "manual"] as const;
export type UnitCostSource = (typeof UNIT_COST_SOURCES)[number];

export type MutateResult = { ok: true; id?: string } | { ok: false; error: string };

export type ExpenseRow = {
  id: string;
  expenseDate: string;
  category: string;
  note: string | null;
  amount: string;
  paidFrom: string;
  supplierName: string | null;
  sourceDocUrl: string | null;
  // Accounting v2 fields. Optional so pre-v2 row builders keep compiling.
  subcategory?: string | null;
  viaPaypal?: boolean;
  currency?: string;
  amountOriginal?: string | null;
  fxRate?: string | null;
  projectTag?: string | null;
  bankMatch?: BankMatch;
  bankAmount?: string | null;
  externalRef?: string | null;
  dateIsEstimate?: boolean;
};

export type AssetRow = {
  id: string;
  assetDate: string;
  name: string;
  /** Accounting v2: TOTAL cost of the asset. */
  amount: string;
  note: string | null;
  seller?: string | null;
  paidFrom?: string;
  instalmentAmount?: string | null;
  instalmentCount?: number | null;
};

export type AssetPaymentRow = {
  id: string;
  assetId: string;
  paymentDate: string;
  amount: string;
  paidFrom: string;
  instalmentNo: number | null;
  bankMatch: BankMatch;
  note: string | null;
};

export type IncomeEntryRow = {
  id: string;
  entryDate: string;
  dateIsEstimate: boolean;
  kind: IncomeKind;
  sourceName: string;
  amount: string;
  account: AccountKey;
  projectTag: string | null;
  bankMatch: BankMatch;
  note: string | null;
};

export type PayoutRow = {
  id: string;
  payoutDate: string;
  amount: string;
  paidInto: string;
  /** Accounting v2: transfer source (defaults to paypal for old rows). */
  fromAccount?: string;
  note: string | null;
};

import type { ParsedInvoice } from "@/lib/invoice-parser";

export type InvoicePreview =
  | {
      ok: true;
      uploadedUrl: string;
      fileName: string;
      extractedText: string;
      parsed: ParsedInvoice;
      knownVendors: string[];
    }
  | { ok: false; error: string };

/** Admin-confirmed (possibly edited) fields from the import preview. */
export type ConfirmInvoiceInput = {
  uploadedUrl: string;
  expenseDate: string;
  category: string;
  amount: string;
  paidFrom: string;
  supplierName: string | null;
  note: string | null;
};
