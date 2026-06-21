// Pure types shared between the "use server" accounting actions and client
// forms/pages. Kept out of any "use server" or "server-only" module so both
// the client and server bundles can import them freely (types are erased at
// compile time, so there is no runtime import either way).
//
// See project memory "use server can't export types" — a "use server" file must
// export ONLY async functions, so row types live here, not in the action file.

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
};

export type AssetRow = {
  id: string;
  assetDate: string;
  name: string;
  amount: string;
  note: string | null;
};

export type PayoutRow = {
  id: string;
  payoutDate: string;
  amount: string;
  paidInto: string;
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
