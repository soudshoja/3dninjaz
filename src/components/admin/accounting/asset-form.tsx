"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { createAsset, updateAsset } from "@/actions/admin-accounting";
import { ACCOUNT_KEYS, ACCOUNT_LABELS, type AssetRow } from "@/lib/accounting-types";
import { ErrorBanner, Field, SubmitRow, border, inputCls, selectCls } from "./form-bits";

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
  const [plan, setPlan] = useState<"full" | "instalments">(
    initial?.instalmentCount ? "instalments" : "full",
  );

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
      <Field id="af-name" label="Asset name">
        <input
          id="af-name"
          name="name"
          type="text"
          required
          maxLength={200}
          defaultValue={initial?.name ?? ""}
          className={inputCls}
          style={border}
        />
      </Field>

      <Field id="af-seller" label="Seller (optional)">
        <input
          id="af-seller"
          name="seller"
          type="text"
          maxLength={200}
          defaultValue={initial?.seller ?? ""}
          className={inputCls}
          style={border}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="af-date" label="Purchase date (first payment)">
          <input
            id="af-date"
            name="assetDate"
            type="date"
            required
            defaultValue={initial?.assetDate ?? ""}
            className={inputCls}
            style={border}
          />
        </Field>
        <Field id="af-amount" label="Total cost (MYR)">
          <input
            id="af-amount"
            name="amount"
            type="text"
            required
            inputMode="decimal"
            pattern="\d+(\.\d{1,2})?"
            defaultValue={initial?.amount ?? ""}
            className={`${inputCls} tabular-nums`}
            style={border}
          />
        </Field>
      </div>

      <Field id="af-paidFrom" label="Paid from">
        <select
          id="af-paidFrom"
          name="paidFrom"
          defaultValue={initial?.paidFrom ?? "bank"}
          className={selectCls}
          style={border}
        >
          {ACCOUNT_KEYS.map((v) => (
            <option key={v} value={v}>
              {ACCOUNT_LABELS[v]}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="rounded-2xl border-2 p-4 space-y-3" style={{ borderColor: `${BRAND.ink}1f` }}>
        <legend className="px-2 text-sm font-bold">How is it paid?</legend>
        <label className="flex items-center gap-3 min-h-[44px] text-sm font-semibold cursor-pointer">
          <input
            type="radio"
            name="payPlan"
            value="full"
            checked={plan === "full"}
            onChange={() => setPlan("full")}
            className="h-5 w-5"
          />
          <span>
            Paid in full
            <span className="block text-xs font-normal text-slate-500">
              {mode === "new"
                ? "One payment for the total cost is recorded on the purchase date."
                : "No instalment plan."}
            </span>
          </span>
        </label>
        <label className="flex items-center gap-3 min-h-[44px] text-sm font-semibold cursor-pointer">
          <input
            type="radio"
            name="payPlan"
            value="instalments"
            checked={plan === "instalments"}
            onChange={() => setPlan("instalments")}
            className="h-5 w-5"
          />
          <span>
            By instalments
            <span className="block text-xs font-normal text-slate-500">
              Record each payment later with Record payment.
            </span>
          </span>
        </label>

        {plan === "instalments" ? (
          <div className="grid gap-4 sm:grid-cols-2 pt-1">
            <Field id="af-inst-amt" label="Instalment amount (MYR)">
              <input
                id="af-inst-amt"
                name="instalmentAmount"
                type="text"
                required
                inputMode="decimal"
                pattern="\d+(\.\d{1,2})?"
                defaultValue={initial?.instalmentAmount ?? ""}
                className={`${inputCls} tabular-nums`}
                style={border}
              />
            </Field>
            <Field id="af-inst-count" label="Number of instalments">
              <input
                id="af-inst-count"
                name="instalmentCount"
                type="number"
                required
                min={1}
                max={600}
                defaultValue={initial?.instalmentCount ?? ""}
                className={`${inputCls} tabular-nums`}
                style={border}
              />
            </Field>
          </div>
        ) : null}
        {mode === "new" && plan === "full" ? <input type="hidden" name="paidInFull" value="on" /> : null}
      </fieldset>

      <Field id="af-note" label="Note (optional)">
        <input
          id="af-note"
          name="note"
          type="text"
          maxLength={500}
          defaultValue={initial?.note ?? ""}
          className={inputCls}
          style={border}
        />
      </Field>

      <p className="text-xs text-slate-500">
        Assets are tracked separately and do <strong>not</strong> reduce profit. Money paid for them still leaves the
        account it was paid from.
      </p>

      <ErrorBanner error={error} />

      <SubmitRow
        pending={pending}
        label={mode === "new" ? "Add asset" : "Save changes"}
        onCancel={() => router.push("/admin/accounting/assets")}
      />
    </form>
  );
}
