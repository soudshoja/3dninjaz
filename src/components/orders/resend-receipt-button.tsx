"use client";

import { useState, useTransition } from "react";
import { BRAND } from "@/lib/brand";
import { resendOrderConfirmationEmail } from "@/actions/orders";
import { Mail } from "lucide-react";

/**
 * Client button that dispatches the resend server action. Rate limiting
 * (5-minute cooldown per order) is enforced server-side in
 * resendOrderConfirmationEmail — this component just surfaces the result
 * message via an aria-live region.
 *
 * Accessibility:
 *   - min-h-[48px] meets WCAG tap target on mobile (D3-20).
 *   - role=status + aria-live="polite" on the result so screen readers
 *     announce success/cooldown without interrupting the user.
 */

export function ResendReceiptButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMsg(null);
          startTransition(async () => {
            const res = await resendOrderConfirmationEmail(orderId);
            setMsg(
              res.ok
                ? "Receipt email resent — check your inbox."
                : res.error ?? "Could not resend.",
            );
          });
        }}
        className="inline-flex items-center gap-2 rounded-full px-5 py-3 font-semibold min-h-[48px] border-2 disabled:opacity-60"
        style={{ borderColor: BRAND.ink, color: BRAND.ink }}
      >
        <Mail className="h-4 w-4" aria-hidden />
        {pending ? "Sending…" : "Email me the receipt"}
      </button>
      {msg ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-2 text-sm text-slate-700"
        >
          {msg}
        </p>
      ) : null}
    </div>
  );
}
