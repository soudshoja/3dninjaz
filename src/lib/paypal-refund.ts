import "server-only";
import { paymentsController, PAYPAL_CURRENCY } from "@/lib/paypal";

/**
 * Phase 7 (07-02) — refund helper.
 *
 * Pure passthrough to PaymentsController.refundCapturedPayment. Caller
 * (07-05 admin-refunds.ts) is responsible for the amount-cap validation
 * (T-07-05-money) BEFORE calling this. We map known PayPal error codes to
 * friendly messages so the admin UI can render them inline.
 */

export type IssueRefundInput = {
  captureId: string;
  /** Partial refund amount; omit for full refund. */
  amount?: number;
  /** Currency. Defaults to PAYPAL_CURRENCY (MYR). */
  currency?: string;
  /** Sent as PayPal noteToPayer; capped at 200 chars. */
  reason: string;
  /** Optional reconcile hint (e.g. internal order id). */
  invoiceId?: string;
};

export type IssueRefundResult =
  | {
      ok: true;
      refundId: string;
      status: string;
      refundedValue: string;
    }
  | { ok: false; error: string; errorCode?: string };

const ERROR_CODES = [
  "CAPTURE_FULLY_REFUNDED",
  "INSUFFICIENT_AMOUNT",
  "TRANSACTION_REFUSED",
  "INVALID_RESOURCE_ID",
  "NOT_AUTHORIZED",
] as const;

export async function issueCaptureRefund(
  input: IssueRefundInput,
): Promise<IssueRefundResult> {
  const currency = input.currency ?? PAYPAL_CURRENCY;
  const noteToPayer = (input.reason ?? "").slice(0, 200);

  try {
    const r = await paymentsController().refundCapturedPayment({
      captureId: input.captureId,
      body: {
        ...(input.amount != null
          ? {
              amount: {
                currencyCode: currency,
                value: input.amount.toFixed(2),
              },
            }
          : {}),
        ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
        noteToPayer,
      },
      prefer: "return=representation",
    });
    const refund = r.result;
    return {
      ok: true,
      refundId: refund.id ?? "",
      status: refund.status ?? "UNKNOWN",
      refundedValue: refund.amount?.value ?? "0.00",
    };
  } catch (err) {
    const raw = (() => {
      try {
        return JSON.stringify(err) + String((err as Error)?.message ?? "");
      } catch {
        return String(err ?? "");
      }
    })();
    let code: string | undefined;
    for (const c of ERROR_CODES) {
      if (raw.includes(c)) {
        code = c;
        break;
      }
    }
    let userMsg = "Refund failed.";
    if (code === "CAPTURE_FULLY_REFUNDED") {
      userMsg = "This capture is already fully refunded.";
    } else if (code === "INSUFFICIENT_AMOUNT") {
      userMsg = "Refund amount exceeds the captured amount.";
    } else if (code === "TRANSACTION_REFUSED") {
      userMsg =
        "PayPal refused this refund. Check seller balance + dispute status.";
    } else if (code === "NOT_AUTHORIZED") {
      userMsg =
        "PayPal account is not authorised to issue this refund.";
    } else if (code === "INVALID_RESOURCE_ID") {
      userMsg = "PayPal could not find that capture.";
    }
    console.error("[paypal-refund] failed:", err);
    return { ok: false, error: userMsg, errorCode: code };
  }
}
