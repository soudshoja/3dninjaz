"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { deleteExpense, deleteAsset, deletePayout } from "@/actions/admin-accounting";

type Kind = "expense" | "asset" | "payout";

const LABEL: Record<Kind, string> = {
  expense: "expense",
  asset: "asset",
  payout: "payout",
};

/** Small confirm-then-delete button for accounting list/edit rows. */
export function DeleteButton({ kind, id }: { kind: Kind; id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    if (!window.confirm(`Delete this ${LABEL[kind]}? This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const res =
        kind === "expense"
          ? await deleteExpense(id)
          : kind === "asset"
            ? await deleteAsset(id)
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
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error ? (
        <span className="text-xs" style={{ color: "#dc2626" }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
