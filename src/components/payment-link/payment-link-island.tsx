"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  PayPalButtons,
  PayPalScriptProvider,
} from "@paypal/react-paypal-js";
import {
  createPaymentLinkPayPalOrder,
  capturePaymentLinkPayment,
} from "@/actions/payment-links";

/**
 * Phase 7 (07-03) — public PayPal Smart Button island for /payment-links/<token>.
 *
 * SECURITY CONTRACT (T-07-X-money):
 *   - Client posts ONLY { token } to the server actions. Amount is server-
 *     derived from orders.totalAmount keyed by the token row. Client
 *     CANNOT forge a different price.
 *   - Token is the only credential — no email/name/phone in URL.
 */
export function PaymentLinkIsland({
  token,
  clientId,
  currency,
}: {
  token: string;
  clientId: string;
  currency: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!clientId) {
    return (
      <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
        PayPal is not configured. Contact 3D Ninjaz on WhatsApp.
      </p>
    );
  }

  if (done) {
    return (
      <div className="rounded-md border border-green-300 bg-green-50 p-4 text-center">
        <p className="text-lg font-semibold text-green-900">
          Payment received!
        </p>
        <p className="mt-1 text-sm text-green-800">
          A confirmation has been sent if your email was provided. We will
          start production shortly.
        </p>
      </div>
    );
  }

  return (
    <div>
      {error ? (
        <div
          className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}
      <PayPalScriptProvider
        options={{
          clientId,
          currency: currency || "MYR",
          intent: "capture",
        }}
      >
        <PayPalButtons
          style={{ layout: "vertical", color: "blue", shape: "rect" }}
          createOrder={async () => {
            setError(null);
            const r = await createPaymentLinkPayPalOrder({ token });
            if (!r.ok) {
              setError(r.error);
              throw new Error(r.error);
            }
            return r.paypalOrderId;
          }}
          onApprove={async (data) => {
            const r = await capturePaymentLinkPayment({
              token,
              paypalOrderId: data.orderID,
            });
            if (!r.ok) {
              setError(r.error);
              return;
            }
            setDone(true);
            // Force refresh so re-loading the page renders the 410.
            setTimeout(() => router.refresh(), 1500);
          }}
          onError={(err) => {
            console.error("[payment-link] PayPal error:", err);
            setError("PayPal could not process the payment. Please retry.");
          }}
        />
      </PayPalScriptProvider>
    </div>
  );
}
