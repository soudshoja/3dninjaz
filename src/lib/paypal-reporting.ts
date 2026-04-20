import "server-only";
import { getAccessToken, paypalApiBase } from "@/lib/paypal";

/**
 * Phase 7 (07-02) — Reporting API helpers.
 *
 * The PayPal SDK v2.3.x ships TransactionSearchController but its surface
 * does not cover all the fields recon needs. We use direct fetch via
 * /v1/reporting/transactions for portability + fewer SDK version traps.
 *
 * Q-07-08 (07-CONTEXT.md): some merchant accounts need PayPal support to
 * enable the Reporting feature. Caller should catch NOT_AUTHORIZED in the
 * error body and surface it via recon_runs.errorMessage.
 */

export type Transaction = {
  transactionId: string | null;
  paypalReferenceId: string | null;
  transactionStatus: string;
  transactionAmount: { value: string; currencyCode: string };
  transactionInitiationDate: string;
  transactionUpdatedDate: string;
  transactionEventCode: string | null;
};

type RawTxn = {
  transaction_id?: string;
  paypal_reference_id?: string;
  transaction_status?: string;
  transaction_amount?: { value?: string; currency_code?: string };
  transaction_initiation_date?: string;
  transaction_updated_date?: string;
  transaction_event_code?: string;
};

type RawResponse = {
  transaction_details?: Array<{ transaction_info?: RawTxn }>;
  total_pages?: number;
};

export async function fetchTransactions(input: {
  /** ISO datetime, e.g. 2026-04-15T00:00:00.000Z */
  startDate: string;
  endDate: string;
  pageSize?: number;
  fields?: string;
}): Promise<{ transactions: Transaction[]; truncated: boolean }> {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    start_date: input.startDate,
    end_date: input.endDate,
    page_size: String(input.pageSize ?? 500),
    fields: input.fields ?? "transaction_info,payer_info",
    page: "1",
  });
  const out: Transaction[] = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    params.set("page", String(page));
    const r = await fetch(
      `${paypalApiBase()}/v1/reporting/transactions?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!r.ok) {
      const body = await r.text();
      throw new Error(
        `[reporting] fetch failed: ${r.status} ${body.slice(0, 200)}`,
      );
    }
    const j = (await r.json()) as RawResponse;
    totalPages = j.total_pages ?? 1;
    for (const td of j.transaction_details ?? []) {
      const ti = td.transaction_info ?? {};
      out.push({
        transactionId: ti.transaction_id ?? null,
        paypalReferenceId: ti.paypal_reference_id ?? null,
        transactionStatus: ti.transaction_status ?? "UNKNOWN",
        transactionAmount: {
          value: ti.transaction_amount?.value ?? "0.00",
          currencyCode: ti.transaction_amount?.currency_code ?? "MYR",
        },
        transactionInitiationDate: ti.transaction_initiation_date ?? "",
        transactionUpdatedDate: ti.transaction_updated_date ?? "",
        transactionEventCode: ti.transaction_event_code ?? null,
      });
    }
    page++;
    if (page > 100) break; // sanity guard
  }
  return { transactions: out, truncated: page > 100 };
}
