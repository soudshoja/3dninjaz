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
  compact = false,
  fullWidth = false,
}: {
  orderId: string;
  inProduction: boolean;
  /** Compact form for table rows / cards — smaller padding + short label. */
  compact?: boolean;
  /** Stretch the button to fill its container (mobile card). */
  fullWidth?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [localIn, setLocalIn] = useState(inProduction);

  function onClick(e?: React.MouseEvent) {
    // The mobile card wraps content in a <Link>; stop the click from navigating.
    e?.preventDefault();
    e?.stopPropagation();
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

  const label = compact
    ? localIn
      ? "In production"
      : "Production"
    : localIn
      ? "Remove from production"
      : "Add to production";

  return (
    <div className={`flex flex-col gap-1 ${fullWidth ? "w-full" : ""}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={`inline-flex cursor-pointer items-center gap-2 font-bold transition-opacity hover:opacity-80 disabled:opacity-50 ${
          compact
            ? "justify-center rounded-full px-4 py-2 text-sm"
            : "rounded-2xl px-4 py-2.5 text-sm"
        } ${fullWidth ? "w-full justify-center" : ""}`}
        style={
          localIn
            ? {
                background: "rgba(11,16,32,0.08)",
                border: `2px solid ${INK}25`,
                color: INK,
                minHeight: compact ? 40 : 44,
              }
            : {
                background: BRAND.purple,
                color: "#fff",
                minHeight: compact ? 40 : 44,
              }
        }
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Factory className="h-4 w-4" />
        )}
        {label}
      </button>
      {error ? (
        <p className="text-xs font-semibold" style={{ color: "#dc2626" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
