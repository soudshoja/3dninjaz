"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { createAsset, updateAsset } from "@/actions/admin-accounting";
import type { AssetRow } from "@/lib/accounting-types";

const inputCls = "w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]";
const border = { borderColor: `${BRAND.ink}33` };

/** /admin/accounting/assets/new + /[id]/edit form. Assets are NOT in profit. */
export function AssetForm({
  mode,
  initial,
}: {
  mode: "new" | "edit";
  initial?: AssetRow;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = mode === "new" ? await createAsset(fd) : await updateAsset(initial!.id, fd);
      if (res.ok) {
        router.push("/admin/accounting/assets");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-xl" style={{ color: BRAND.ink }}>
      <div>
        <label htmlFor="af-name" className="block text-sm font-semibold mb-1">
          Asset name
        </label>
        <input
          id="af-name"
          name="name"
          type="text"
          required
          maxLength={200}
          defaultValue={initial?.name ?? ""}
          className={inputCls}
          style={border}
          placeholder="Bambu Lab P1S printer"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="af-date" className="block text-sm font-semibold mb-1">
            Purchase date
          </label>
          <input
            id="af-date"
            name="assetDate"
            type="date"
            required
            defaultValue={initial?.assetDate ?? ""}
            className={inputCls}
            style={border}
          />
        </div>
        <div>
          <label htmlFor="af-amount" className="block text-sm font-semibold mb-1">
            Cost (MYR)
          </label>
          <input
            id="af-amount"
            name="amount"
            type="text"
            required
            inputMode="decimal"
            pattern="\d+(\.\d{1,2})?"
            defaultValue={initial?.amount ?? ""}
            className={inputCls}
            style={border}
            placeholder="3500.00"
          />
        </div>
      </div>

      <div>
        <label htmlFor="af-note" className="block text-sm font-semibold mb-1">
          Note (optional)
        </label>
        <input
          id="af-note"
          name="note"
          type="text"
          maxLength={500}
          defaultValue={initial?.note ?? ""}
          className={inputCls}
          style={border}
          placeholder="Serial #, warranty, etc."
        />
      </div>

      <p className="text-xs text-slate-500">
        Assets are tracked separately and do <strong>not</strong> reduce profit.
      </p>

      {error ? (
        <p
          role="alert"
          className="rounded-xl px-3 py-2 text-sm"
          style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50"
          style={{ backgroundColor: BRAND.ink }}
        >
          {pending ? "Saving…" : mode === "new" ? "Add asset" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/accounting/assets")}
          disabled={pending}
          className="rounded-full px-6 py-3 font-semibold border-2 min-h-[48px]"
          style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
