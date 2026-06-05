"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { refreshOrderShipping } from "@/actions/shipping";
import { formatMYR } from "@/lib/format";
import { BRAND } from "@/lib/brand";

/**
 * Admin-only: re-quote the order's selected courier live from Delyva and
 * persist the corrected shipping cost + recomputed total onto the order. Used
 * when the shipping stored at checkout has gone stale. After a successful
 * refresh the page re-renders (revalidatePath in the action), so the totals
 * and the downloadable invoice both reflect the live figure.
 */
export function RefreshShippingButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function onClick() {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = await refreshOrderShipping(orderId);
      if (res.ok) {
        setMsg(
          `Updated — shipping ${formatMYR(res.shipping)}, total ${formatMYR(res.total)}.`,
        );
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
        style={{ borderColor: `${BRAND.ink}22`, color: BRAND.ink, minHeight: 40 }}
      >
        <RefreshCw size={16} className={pending ? "animate-spin" : ""} />
        {pending ? "Re-quoting…" : "Refresh shipping from Delyva"}
      </button>
      {msg ? (
        <p className="mt-2 text-xs font-medium" style={{ color: BRAND.greenDark }}>
          {msg}
        </p>
      ) : null}
      {err ? (
        <p className="mt-2 text-xs" style={{ color: "#be123c" }}>
          {err}
        </p>
      ) : null}
    </div>
  );
}
