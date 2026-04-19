"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { createCoupon, updateCoupon } from "@/actions/admin-coupons";

type CouponInitial = {
  id: string;
  code: string;
  type: "percentage" | "fixed";
  amount: string;
  minSpend: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageCap: number | null;
  active: boolean;
};

function toDateLocal(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * /admin/coupons/new + /admin/coupons/[id]/edit form.
 * - Code disabled in edit mode (T-05-03-immutable-code)
 * - Amount suffix toggles % vs RM based on type select
 * - All tap targets ≥ 48px (D-04)
 */
export function CouponForm({
  mode,
  initial,
}: {
  mode: "new" | "edit";
  initial?: CouponInitial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<"percentage" | "fixed">(
    initial?.type ?? "percentage",
  );

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    // datetime-local inputs need to be ISO-8601 with timezone for Zod's
    // .datetime() validator. Append `:00.000Z` only if value present.
    const startsAt = String(fd.get("startsAt") ?? "");
    const endsAt = String(fd.get("endsAt") ?? "");
    if (startsAt) fd.set("startsAt", new Date(startsAt).toISOString());
    if (endsAt) fd.set("endsAt", new Date(endsAt).toISOString());

    startTransition(async () => {
      const res =
        mode === "new"
          ? await createCoupon(fd)
          : await updateCoupon(initial!.id, fd);
      if (res.ok) {
        router.push("/admin/coupons");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 max-w-xl"
      style={{ color: BRAND.ink }}
    >
      <div>
        <label htmlFor="cf-code" className="block text-sm font-semibold mb-1">
          Code
        </label>
        <input
          id="cf-code"
          name="code"
          type="text"
          required
          minLength={3}
          maxLength={32}
          defaultValue={initial?.code ?? ""}
          disabled={mode === "edit"}
          className="w-full rounded-xl border-2 px-4 py-3 text-sm uppercase tracking-wide font-mono min-h-[48px] disabled:bg-slate-100"
          style={{ borderColor: `${BRAND.ink}33` }}
          placeholder="SAVE20"
        />
        <p className="mt-1 text-xs text-slate-500">
          A-Z, 0-9, _, - · 3 to 32 characters · case-normalised to UPPER.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cf-type" className="block text-sm font-semibold mb-1">
            Type
          </label>
          <select
            id="cf-type"
            name="type"
            value={type}
            onChange={(e) =>
              setType(e.target.value as "percentage" | "fixed")
            }
            className="w-full rounded-xl border-2 px-4 py-3 text-sm bg-white min-h-[48px]"
            style={{ borderColor: `${BRAND.ink}33` }}
          >
            <option value="percentage">Percentage off</option>
            <option value="fixed">Fixed MYR off</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="cf-amount"
            className="block text-sm font-semibold mb-1"
          >
            Amount {type === "percentage" ? "(%)" : "(MYR)"}
          </label>
          <input
            id="cf-amount"
            name="amount"
            type="text"
            required
            inputMode="decimal"
            pattern="\d+(\.\d{1,2})?"
            defaultValue={initial?.amount ?? ""}
            className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]"
            style={{ borderColor: `${BRAND.ink}33` }}
            placeholder={type === "percentage" ? "20" : "15.00"}
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="cf-minSpend"
          className="block text-sm font-semibold mb-1"
        >
          Minimum spend (MYR, optional)
        </label>
        <input
          id="cf-minSpend"
          name="minSpend"
          type="text"
          inputMode="decimal"
          pattern="\d+(\.\d{1,2})?"
          defaultValue={initial?.minSpend ?? ""}
          className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]"
          style={{ borderColor: `${BRAND.ink}33` }}
          placeholder="50.00"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="cf-startsAt"
            className="block text-sm font-semibold mb-1"
          >
            Starts at (optional)
          </label>
          <input
            id="cf-startsAt"
            name="startsAt"
            type="datetime-local"
            defaultValue={toDateLocal(initial?.startsAt ?? null)}
            className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]"
            style={{ borderColor: `${BRAND.ink}33` }}
          />
        </div>
        <div>
          <label htmlFor="cf-endsAt" className="block text-sm font-semibold mb-1">
            Ends at (optional)
          </label>
          <input
            id="cf-endsAt"
            name="endsAt"
            type="datetime-local"
            defaultValue={toDateLocal(initial?.endsAt ?? null)}
            className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]"
            style={{ borderColor: `${BRAND.ink}33` }}
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="cf-usageCap"
          className="block text-sm font-semibold mb-1"
        >
          Usage cap (optional)
        </label>
        <input
          id="cf-usageCap"
          name="usageCap"
          type="number"
          min={1}
          defaultValue={initial?.usageCap ?? ""}
          className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]"
          style={{ borderColor: `${BRAND.ink}33` }}
          placeholder="100"
        />
        <p className="mt-1 text-xs text-slate-500">
          Total redemptions allowed. Leave blank for unlimited.
        </p>
      </div>

      <div>
        <label className="inline-flex items-center gap-2">
          <input
            name="active"
            type="checkbox"
            value="true"
            defaultChecked={initial?.active ?? true}
            className="h-5 w-5 rounded"
          />
          <span className="text-sm font-semibold">Active</span>
        </label>
      </div>

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
          {pending ? "Saving…" : mode === "new" ? "Create coupon" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/coupons")}
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
