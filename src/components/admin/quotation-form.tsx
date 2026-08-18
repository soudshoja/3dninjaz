"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import {
  createQuotation,
  updateQuotation,
} from "@/actions/admin-quotations";
import {
  computeQuoteTotal,
  computeDeposit,
  formatQuoteMoney,
  DEFAULT_LEAD_TIME,
  type QuotationLineInput,
} from "@/lib/quotations";

/**
 * Quotation builder (2026-08-18).
 *
 * One form for both create and edit. Line totals and the deposit are computed
 * live for the admin's benefit, but the server recomputes both on save — the
 * numbers posted from here are never trusted.
 */

type Line = QuotationLineInput & { key: string };

export type QuotationFormInitial = {
  id?: string;
  contactName: string;
  companyName: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
  projectDescription: string;
  productionLeadTime: string;
  validUntil: string;
  depositPercent: string;
  notes: string;
  terms: string[];
  items: QuotationLineInput[];
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${BRAND.ink}22`,
  backgroundColor: "#fff",
  fontSize: 15,
  color: BRAND.ink,
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
      {children}
    </span>
  );
}

let keySeq = 0;
const nextKey = () => `line-${++keySeq}`;

export function QuotationForm({ initial }: { initial: QuotationFormInitial }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    contactName: initial.contactName,
    companyName: initial.companyName,
    contactEmail: initial.contactEmail,
    contactPhone: initial.contactPhone,
    contactAddress: initial.contactAddress,
    projectDescription: initial.projectDescription,
    productionLeadTime: initial.productionLeadTime || DEFAULT_LEAD_TIME,
    validUntil: initial.validUntil,
    depositPercent: initial.depositPercent || "50",
    notes: initial.notes,
  });

  const [terms, setTerms] = useState<string[]>(initial.terms);
  const [lines, setLines] = useState<Line[]>(
    initial.items.length > 0
      ? initial.items.map((i) => ({ ...i, key: nextKey() }))
      : [{ description: "", quantity: 1, unitPrice: "0", key: nextKey() }],
  );

  const total = computeQuoteTotal(lines);
  const deposit = computeDeposit(total, form.depositPercent || "0");

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function setLine(key: string, patch: Partial<Line>) {
    setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function save() {
    setError(null);
    const payload = {
      ...form,
      terms,
      items: lines.map(({ description, quantity, unitPrice }) => ({
        description,
        quantity: Number(quantity) || 0,
        unitPrice,
      })),
    };

    startTransition(async () => {
      const res = initial.id
        ? await updateQuotation(initial.id, payload)
        : await createQuotation(payload);

      if (!res.ok) {
        setError(res.error);
        return;
      }
      const id = initial.id ?? (res as { ok: true; id: string }).id;
      router.push(`/admin/quotations/${id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {error ? (
        <div
          role="alert"
          className="rounded-xl px-4 py-3 text-sm font-semibold"
          style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}
        >
          {error}
        </div>
      ) : null}

      {/* Client */}
      <section className="rounded-2xl bg-white p-5">
        <h2 className="mb-4 font-[var(--font-heading)] text-xl">Client</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label>
            <Label>Contact name *</Label>
            <input
              style={inputStyle}
              value={form.contactName}
              onChange={(e) => set("contactName", e.target.value)}
            />
          </label>
          <label>
            <Label>Company</Label>
            <input
              style={inputStyle}
              value={form.companyName}
              onChange={(e) => set("companyName", e.target.value)}
            />
          </label>
          <label>
            <Label>Email</Label>
            <input
              style={inputStyle}
              type="email"
              value={form.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
            />
          </label>
          <label>
            <Label>Phone</Label>
            <input
              style={inputStyle}
              value={form.contactPhone}
              onChange={(e) => set("contactPhone", e.target.value)}
            />
          </label>
          <label className="md:col-span-2">
            <Label>Delivery address</Label>
            <input
              style={inputStyle}
              value={form.contactAddress}
              onChange={(e) => set("contactAddress", e.target.value)}
              placeholder="Optional. Can be confirmed on the order later."
            />
          </label>
        </div>
      </section>

      {/* Document */}
      <section className="rounded-2xl bg-white p-5">
        <h2 className="mb-4 font-[var(--font-heading)] text-xl">Document</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <label>
            <Label>Valid until *</Label>
            <input
              style={inputStyle}
              type="date"
              value={form.validUntil}
              onChange={(e) => set("validUntil", e.target.value)}
            />
          </label>
          <label>
            <Label>Production lead time</Label>
            <input
              style={inputStyle}
              value={form.productionLeadTime}
              onChange={(e) => set("productionLeadTime", e.target.value)}
            />
          </label>
          <label>
            <Label>Deposit %</Label>
            <input
              style={inputStyle}
              type="number"
              min={0}
              max={100}
              value={form.depositPercent}
              onChange={(e) => set("depositPercent", e.target.value)}
            />
          </label>
          <label className="md:col-span-3">
            <Label>Project description</Label>
            <textarea
              style={{ ...inputStyle, minHeight: 110, resize: "vertical" }}
              value={form.projectDescription}
              onChange={(e) => set("projectDescription", e.target.value)}
            />
          </label>
        </div>
      </section>

      {/* Lines */}
      <section className="rounded-2xl bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-[var(--font-heading)] text-xl">Package inclusion</h2>
          <button
            type="button"
            onClick={() =>
              setLines((p) => [
                ...p,
                { description: "", quantity: 1, unitPrice: "0", key: nextKey() },
              ])
            }
            className="rounded-full px-4 text-sm font-semibold"
            style={{
              minHeight: 44,
              border: `2px solid ${BRAND.ink}22`,
              color: BRAND.ink,
            }}
          >
            Add line
          </button>
        </div>

        <div className="space-y-3">
          {lines.map((l) => (
            <div key={l.key} className="grid gap-2 md:grid-cols-[1fr_100px_130px_40px]">
              <input
                style={inputStyle}
                value={l.description}
                placeholder="Description"
                onChange={(e) => setLine(l.key, { description: e.target.value })}
              />
              <input
                style={inputStyle}
                type="number"
                min={0}
                value={l.quantity}
                onChange={(e) =>
                  setLine(l.key, { quantity: Number(e.target.value) })
                }
              />
              <input
                style={inputStyle}
                type="number"
                min={0}
                step="0.01"
                value={l.unitPrice}
                onChange={(e) => setLine(l.key, { unitPrice: e.target.value })}
              />
              <button
                type="button"
                aria-label="Remove line"
                onClick={() =>
                  setLines((p) =>
                    p.length > 1 ? p.filter((x) => x.key !== l.key) : p,
                  )
                }
                className="rounded-lg text-lg"
                style={{ minHeight: 44, border: `1px solid ${BRAND.ink}18` }}
              >
                &times;
              </button>
            </div>
          ))}
        </div>

        <p className="mt-3 text-xs text-slate-500">
          A line with a quantity but no price prints with an empty price column,
          matching the package-inclusion rows on the printed quotation.
        </p>

        <div className="mt-5 flex flex-col items-end gap-1 border-t border-black/10 pt-4">
          <p className="text-sm text-slate-600">
            Total <span className="font-bold text-slate-900">{formatQuoteMoney(total)}</span>
          </p>
          <p className="text-sm text-slate-600">
            Deposit ({form.depositPercent || 0}%){" "}
            <span className="font-bold text-slate-900">{formatQuoteMoney(deposit)}</span>
          </p>
        </div>
      </section>

      {/* Terms */}
      <section className="rounded-2xl bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-[var(--font-heading)] text-xl">Payment terms</h2>
          <button
            type="button"
            onClick={() => setTerms((p) => [...p, ""])}
            className="rounded-full px-4 text-sm font-semibold"
            style={{
              minHeight: 44,
              border: `2px solid ${BRAND.ink}22`,
              color: BRAND.ink,
            }}
          >
            Add term
          </button>
        </div>
        <div className="space-y-2">
          {terms.map((t, i) => (
            <div key={i} className="flex gap-2">
              <textarea
                style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                value={t}
                onChange={(e) =>
                  setTerms((p) => p.map((x, j) => (j === i ? e.target.value : x)))
                }
              />
              <button
                type="button"
                aria-label="Remove term"
                onClick={() => setTerms((p) => p.filter((_, j) => j !== i))}
                className="rounded-lg px-3 text-lg"
                style={{ minHeight: 44, border: `1px solid ${BRAND.ink}18` }}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Internal */}
      <section className="rounded-2xl bg-white p-5">
        <label>
          <Label>Internal notes (never printed)</Label>
          <textarea
            style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </label>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-full px-6 text-sm font-bold text-white disabled:opacity-60"
          style={{ minHeight: 48, backgroundColor: BRAND.ink }}
        >
          {pending ? "Saving..." : initial.id ? "Save changes" : "Create quotation"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={pending}
          className="rounded-full px-6 text-sm font-semibold"
          style={{ minHeight: 48, border: `2px solid ${BRAND.ink}22` }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
