"use client";

import { useState, useTransition } from "react";
import { Landmark, Hash, User, Loader2, CheckCircle2 } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { saveStoreBankDetails } from "@/actions/admin-store-settings-bank";

interface BankDetailsFieldsetProps {
  initialBankName: string | null;
  initialBankAccountNumber: string | null;
  initialBankAccountHolder: string | null;
}

/**
 * Phase 20 (20-12) — admin editable bank details fieldset.
 *
 * Mounted below the Contact fieldset on /admin/settings, above Socials.
 * Three inputs with Lucide prefix icons. Calls saveStoreBankDetails server
 * action (from 20-04). Empty strings normalised to null in the action.
 *
 * UI-SPEC Surface 5: 48px inputs, 4px radius, 2px border, 40px clear button.
 */
export function BankDetailsFieldset({
  initialBankName,
  initialBankAccountNumber,
  initialBankAccountHolder,
}: BankDetailsFieldsetProps) {
  const [bankName, setBankName] = useState(initialBankName ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState(
    initialBankAccountNumber ?? "",
  );
  const [bankAccountHolder, setBankAccountHolder] = useState(
    initialBankAccountHolder ?? "",
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function clearAll() {
    setBankName("");
    setBankAccountNumber("");
    setBankAccountHolder("");
    setSaved(false);
    setError(null);
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveStoreBankDetails({
        bankName: bankName || null,
        bankAccountNumber: bankAccountNumber || null,
        bankAccountHolder: bankAccountHolder || null,
      });
      if (result.ok) {
        setSaved(true);
      } else {
        setError(result.error);
      }
    });
  }

  const inputBase =
    "w-full min-h-[48px] rounded-[4px] border-2 px-3 py-2 text-sm bg-white outline-none transition-colors duration-150 focus:border-[#0080ff]";
  const inputStyle = { borderColor: `${BRAND.ink}33` };

  return (
    <section
      className="rounded-[4px] border-2 p-5 space-y-5"
      style={{ borderColor: `${BRAND.ink}22`, backgroundColor: "#FAFAFA" }}
      aria-labelledby="sf-bank-heading"
    >
      <div>
        <h2
          id="sf-bank-heading"
          className="font-[var(--font-heading)] text-lg"
          style={{ color: BRAND.ink }}
        >
          Bank details
        </h2>
        <p className="text-xs text-slate-600 mt-1">
          Customers see these on the draft-order Bank Transfer card. Leave blank
          to hide the Bank Transfer option.
        </p>
      </div>

      {/* Bank name */}
      <div>
        <label
          htmlFor="bd-bankName"
          className="block text-sm font-semibold mb-1"
          style={{ color: BRAND.ink }}
        >
          Bank name
        </label>
        <div className="relative flex items-center">
          <span className="absolute left-3 flex items-center pointer-events-none">
            <Landmark size={16} className="text-slate-400" />
          </span>
          <input
            id="bd-bankName"
            type="text"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            className={inputBase}
            style={{ ...inputStyle, paddingLeft: "2.25rem" }}
            placeholder="Maybank"
            maxLength={100}
          />
        </div>
      </div>

      {/* Account number */}
      <div>
        <label
          htmlFor="bd-bankAccountNumber"
          className="block text-sm font-semibold mb-1"
          style={{ color: BRAND.ink }}
        >
          Account number
        </label>
        <div className="relative flex items-center">
          <span className="absolute left-3 flex items-center pointer-events-none">
            <Hash size={16} className="text-slate-400" />
          </span>
          <input
            id="bd-bankAccountNumber"
            type="text"
            value={bankAccountNumber}
            onChange={(e) => setBankAccountNumber(e.target.value)}
            className={`${inputBase} font-mono`}
            style={{ ...inputStyle, paddingLeft: "2.25rem" }}
            placeholder="1234567890"
            maxLength={50}
          />
        </div>
      </div>

      {/* Account holder */}
      <div>
        <label
          htmlFor="bd-bankAccountHolder"
          className="block text-sm font-semibold mb-1"
          style={{ color: BRAND.ink }}
        >
          Account holder
        </label>
        <div className="relative flex items-center">
          <span className="absolute left-3 flex items-center pointer-events-none">
            <User size={16} className="text-slate-400" />
          </span>
          <input
            id="bd-bankAccountHolder"
            type="text"
            value={bankAccountHolder}
            onChange={(e) => setBankAccountHolder(e.target.value)}
            className={inputBase}
            style={{ ...inputStyle, paddingLeft: "2.25rem" }}
            placeholder="3D Ninjaz Sdn Bhd"
            maxLength={200}
          />
        </div>
      </div>

      {/* Clear all button */}
      <button
        type="button"
        onClick={clearAll}
        className="min-h-[40px] rounded-[4px] border-2 px-4 py-1.5 text-sm font-semibold transition-colors duration-150 hover:bg-slate-50"
        style={{ borderColor: `${BRAND.ink}55`, color: BRAND.ink }}
      >
        Clear all bank details
      </button>

      {/* Feedback */}
      {error && (
        <p
          role="alert"
          className="rounded-[4px] px-3 py-2 text-sm"
          style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
        >
          {error}
        </p>
      )}
      {saved && !error && (
        <p
          role="status"
          className="rounded-[4px] px-3 py-2 text-sm font-semibold flex items-center gap-2"
          style={{ backgroundColor: `#03C03C22`, color: BRAND.ink }}
        >
          <CheckCircle2 size={16} className="shrink-0" style={{ color: "#03C03C" }} />
          Bank details saved.
        </p>
      )}

      {/* Save button */}
      <button
        type="button"
        onClick={handleSave}
        disabled={pending}
        className="min-h-[48px] rounded-[4px] px-6 py-2 font-bold text-white text-sm disabled:opacity-50 transition-colors duration-150 flex items-center gap-2"
        style={{ backgroundColor: BRAND.ink }}
      >
        {pending && <Loader2 size={16} className="animate-spin" />}
        {pending ? "Saving…" : "Save bank details"}
      </button>
    </section>
  );
}
