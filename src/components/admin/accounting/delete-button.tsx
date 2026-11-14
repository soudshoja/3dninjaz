"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import {
  deleteExpense,
  deleteAsset,
  deleteAssetPayment,
  deletePayout,
} from "@/actions/admin-accounting";
import { deleteIncomeEntry } from "@/actions/admin-income";

type Kind = "expense" | "asset" | "payout" | "income" | "asset_payment";

const LABEL: Record<Kind, string> = {
  expense: "expense",
  asset: "asset",
  payout: "transfer",
  income: "income entry",
  asset_payment: "payment",
};

/** Small confirm-then-delete button for accounting list/edit rows. */
export function DeleteButton({
  kind,
  id,
  warning,
}: {
  kind: Kind;
  id: string;
  /** Extra sentence shown in the confirmation, e.g. "Its payments are deleted too." */
  warning?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    if (!window.confirm(`Delete this ${LABEL[kind]}? ${warning ? `${warning} ` : ""}This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const res =
        kind === "expense"
          ? await deleteExpense(id)
          : kind === "asset"
            ? await deleteAsset(id)
            : kind === "income"
              ? await deleteIncomeEntry(id)
              : kind === "asset_payment"
                ? await deleteAssetPayment(id)
                : await deletePayout(id);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-full px-4 py-2 text-sm font-semibold border-2 min-h-[44px] disabled:opacity-50"
        style={{ borderColor: "#dc262633", color: "#dc2626" }}
      >
        {pending ? "Deleting..." : "Delete"}
      </button>
      {error ? (
        <span className="text-xs" style={{ color: "#dc2626" }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
