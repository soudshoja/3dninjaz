"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { createIncomeEntry, updateIncomeEntry } from "@/actions/admin-income";
import {
  ACCOUNT_KEYS,
  ACCOUNT_LABELS,
  BANK_MATCH_LABELS,
  BANK_MATCH_VALUES,
  INCOME_KINDS,
  INCOME_KIND_LABELS,
  type IncomeEntryRow,
  type IncomeKind,
} from "@/lib/accounting-types";
import {
  CheckField,
  ErrorBanner,
  Field,
  SubmitRow,
  WarningBanner,
  border,
  inputCls,
  selectCls,
} from "./form-bits";

const KIND_HINT: Record<IncomeKind, string> = {
  project: "Money from a job or commission. Counts towards profit.",
  event: "Bazaar, fair or pop-up sales. Counts towards profit.",
  other: "Any other money in that is not website sales. Counts towards profit.",
  capital_in: "Money you put into the business. Funding, not profit.",
  capital_out: "Money you took out of the business. Funding, not profit.",
};

/** /admin/accounting/income/new + /[id]/edit form. */
export function IncomeForm({
  mode,
  initial,
  projectTags,
}: {
  mode: "new" | "edit";
  initial?: IncomeEntryRow;
  projectTags?: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<IncomeKind>(initial?.kind ?? "project");
  const [source, setSource] = useState(initial?.sourceName ?? "");

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res =
        mode === "new" ? await createIncomeEntry(fd) : await updateIncomeEntry(initial!.id, fd);
      if (res.ok) {
        router.push("/admin/accounting/income");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  const isWebsite = source.trim().toLowerCase() === "website";

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-xl" style={{ color: BRAND.ink }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="if-date" label="Date">
          <input
            id="if-date"
            name="entryDate"
            type="date"
            required
            defaultValue={initial?.entryDate ?? ""}
            className={inputCls}
            style={border}
          />
        </Field>
        <Field id="if-amount" label="Amount (MYR)">
          <input
            id="if-amount"
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

      <CheckField
        id="if-estimate"
        name="dateIsEstimate"
        label="The date is an estimate"
        defaultChecked={initial?.dateIsEstimate ?? false}
      />

      <Field id="if-kind" label="Kind" hint={KIND_HINT[kind]}>
        <select
          id="if-kind"
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as IncomeKind)}
          className={selectCls}
          style={border}
          aria-describedby="if-kind-hint"
        >
          {INCOME_KINDS.map((k) => (
            <option key={k} value={k}>
              {INCOME_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>

      <Field id="if-source" label="Source (who paid you)">
        <input
          id="if-source"
          name="sourceName"
          type="text"
          required
          maxLength={200}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className={inputCls}
          style={border}
        />
      </Field>
      {isWebsite ? (
        <WarningBanner>
          Website sales are calculated from orders. Do not enter them here or they would be counted twice.
        </WarningBanner>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="if-account" label="Received into">
          <select
            id="if-account"
            name="account"
            defaultValue={initial?.account ?? "bank"}
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
        <Field id="if-match" label="Bank match">
          <select
            id="if-match"
            name="bankMatch"
            defaultValue={initial?.bankMatch ?? "unchecked"}
            className={selectCls}
            style={border}
          >
            {BANK_MATCH_VALUES.map((v) => (
              <option key={v} value={v}>
                {BANK_MATCH_LABELS[v]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field id="if-project" label="Project tag (optional)" hint="Matches the tag on expenses, for example jo-melon.">
        <input
          id="if-project"
          name="projectTag"
          type="text"
          maxLength={64}
          list="if-project-list"
          defaultValue={initial?.projectTag ?? ""}
          className={inputCls}
          style={border}
        />
        <datalist id="if-project-list">
          {(projectTags ?? []).map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      </Field>

      <Field id="if-note" label="Note (optional)">
        <input
          id="if-note"
          name="note"
          type="text"
          maxLength={500}
          defaultValue={initial?.note ?? ""}
          className={inputCls}
          style={border}
        />
      </Field>

      <ErrorBanner error={error} />

      <SubmitRow
        pending={pending}
        label={mode === "new" ? "Add income" : "Save changes"}
        onCancel={() => router.push("/admin/accounting/income")}
      />
    </form>
  );
}
