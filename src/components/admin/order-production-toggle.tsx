"use client";

import { useState, useTransition } from "react";
import { Factory, Loader2 } from "lucide-react";
import { setOrderInProduction } from "@/actions/admin-production";
import { BRAND } from "@/lib/brand";
import { useRouter } from "next/navigation";

const INK = "#0B1020";

/**
 * "Add to production" / "Remove from production" toggle button.
 * Placed on the order detail page alongside Edit/Add-items actions.
 */
export function OrderProductionToggle({
  orderId,
  inProduction,
}: {
  orderId: string;
  inProduction: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [localIn, setLocalIn] = useState(inProduction);

  function onClick() {
    setError(null);
    const next = !localIn;
    setLocalIn(next);
    startTransition(async () => {
      const res = await setOrderInProduction(orderId, next);
      if (!res.ok) {
        setError(res.error ?? "Could not update production status.");
        setLocalIn(!next); // revert
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex cursor-pointer items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-opacity hover:opacity-80 disabled:opacity-50"
        style={
          localIn
            ? {
                background: "rgba(11,16,32,0.08)",
                border: `2px solid ${INK}25`,
                color: INK,
                minHeight: 44,
              }
            : {
                background: BRAND.purple,
                color: "#fff",
                minHeight: 44,
              }
        }
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Factory className="h-4 w-4" />
        )}
        {localIn ? "Remove from production" : "Add to production"}
      </button>
      {error ? (
        <p className="text-xs font-semibold" style={{ color: "#dc2626" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
