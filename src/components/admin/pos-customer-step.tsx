"use client";

/**
 * POS Customer Step — shown after "Create order" is clicked.
 *
 * Segmented toggle: Returning customer | New customer
 *
 * Returning:
 *   Debounced search box → results list (name + email + order count).
 *   Selecting a result autofills name/email/phone/address into the form.
 *
 * New:
 *   Standard address form (name, phone, email optional, address, city,
 *   state dropdown, postcode).
 *
 * Props:
 *   customerForm   — current CustomerForm state
 *   onChange(form) — parent updates its state
 */

import { useEffect, useRef, useState } from "react";
import { Search, Loader2, User, Phone, Mail, MapPin } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { MALAYSIAN_STATES } from "@/lib/validators";
import { getPosCustomerSearch, type PosCustomerResult } from "@/actions/admin-pos";

export type CustomerForm = {
  name: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: (typeof MALAYSIAN_STATES)[number];
  postcode: string;
};

type Props = {
  customerForm: CustomerForm;
  onChange: (form: CustomerForm) => void;
};

type Tab = "returning" | "new";

export function PosCustomerStep({ customerForm, onChange }: Props) {
  const [tab, setTab] = useState<Tab>("returning");

  // Returning customer search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PosCustomerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomerResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await getPosCustomerSearch(q);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  }, [searchQuery]);

  function selectCustomer(c: PosCustomerResult) {
    setSelectedCustomer(c);
    // Autofill address form from their last order snapshot
    const state = MALAYSIAN_STATES.includes(c.state as (typeof MALAYSIAN_STATES)[number])
      ? (c.state as (typeof MALAYSIAN_STATES)[number])
      : customerForm.state;

    onChange({
      name: c.name,
      email: c.email,
      phone: c.phone ?? customerForm.phone,
      addressLine1: c.addressLine1 ?? customerForm.addressLine1,
      addressLine2: c.addressLine2 ?? customerForm.addressLine2,
      city: c.city ?? customerForm.city,
      state,
      postcode: c.postcode ?? customerForm.postcode,
    });
    setTab("new"); // Switch to form view so admin can review/edit autofilled fields
  }

  function setField<K extends keyof CustomerForm>(k: K, v: CustomerForm[K]) {
    onChange({ ...customerForm, [k]: v });
  }

  const inputClass =
    "w-full min-h-[48px] rounded-[4px] border-2 border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#0080ff] transition-colors";

  return (
    <div className="space-y-5">
      {/* Segmented toggle */}
      <div
        className="flex rounded-[4px] border-2 border-slate-200 overflow-hidden"
        role="tablist"
        aria-label="Customer type"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "returning"}
          onClick={() => setTab("returning")}
          className="flex-1 min-h-[48px] text-sm font-semibold transition-colors"
          style={
            tab === "returning"
              ? { backgroundColor: "#0080ff", color: "#fff" }
              : { backgroundColor: "#fff", color: BRAND.ink }
          }
        >
          Returning customer
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "new"}
          onClick={() => setTab("new")}
          className="flex-1 min-h-[48px] text-sm font-semibold transition-colors"
          style={
            tab === "new"
              ? { backgroundColor: "#0080ff", color: "#fff" }
              : { backgroundColor: "#fff", color: BRAND.ink }
          }
        >
          New customer
        </button>
      </div>

      {/* ── Returning customer search ── */}
      {tab === "returning" ? (
        <div className="space-y-3">
          {selectedCustomer ? (
            /* Autofill confirmation chip */
            <div
              className="flex items-center gap-3 rounded-[4px] border-2 px-3 py-3"
              style={{ borderColor: "#0080ff", backgroundColor: "#0080ff0d" }}
            >
              <User size={16} style={{ color: "#0080ff" }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: BRAND.ink }}>
                  {selectedCustomer.name}
                </p>
                <p className="text-xs text-slate-500 truncate">{selectedCustomer.email}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedCustomer(null);
                  setSearchQuery("");
                }}
                className="text-xs text-slate-400 hover:text-slate-600 min-h-[44px] px-2 transition-colors"
              >
                Change
              </button>
            </div>
          ) : null}

          {/* Search input */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              aria-hidden
            />
            <input
              type="text"
              placeholder="Search by name or email…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={inputClass + " pl-9"}
              aria-label="Search returning customers"
            />
          </div>

          {/* Results */}
          {searching ? (
            <div className="flex items-center justify-center gap-2 py-6 text-slate-500 text-sm">
              <Loader2 size={18} className="animate-spin" style={{ color: "#0080ff" }} />
              Searching…
            </div>
          ) : searchQuery.trim() && searchResults.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">
              No customers found. Try a different name/email, or use "New customer".
            </p>
          ) : searchResults.length > 0 ? (
            <ul className="divide-y divide-slate-100 rounded-[4px] border-2 border-slate-200 bg-white overflow-hidden">
              {searchResults.map((c) => (
                <li key={c.userId}>
                  <button
                    type="button"
                    onClick={() => selectCustomer(c)}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-slate-50 transition-colors min-h-[60px]"
                  >
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-sm font-bold"
                      style={{ backgroundColor: "#0080ff" }}
                    >
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: BRAND.ink }}>
                        {c.name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{c.email}</p>
                    </div>
                    <span
                      className="shrink-0 text-xs font-semibold px-2 py-1 rounded-[4px]"
                      style={{ backgroundColor: "#0080ff1a", color: "#0080ff" }}
                    >
                      {c.orderCount} order{c.orderCount !== 1 ? "s" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {/* Prompt to switch if no search yet */}
          {!searchQuery.trim() && !selectedCustomer ? (
            <p className="text-xs text-slate-400 text-center pt-1">
              Type a name or email to look up a previous customer.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── Address form (new customer, or autofilled from returning) ── */}
      {tab === "new" ? (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Full name */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Full name <span className="text-red-600">*</span>
            </label>
            <div className="relative">
              <User
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                className={inputClass + " pl-9"}
                required
                value={customerForm.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="Ali Hassan"
                aria-label="Customer full name"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Phone <span className="text-red-600">*</span>
            </label>
            <div className="relative">
              <Phone
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                className={inputClass + " pl-9"}
                required
                value={customerForm.phone}
                onChange={(e) => setField("phone", e.target.value)}
                placeholder="601XXXXXXXX"
                aria-label="Customer phone number"
              />
            </div>
          </div>

          {/* Email */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">
              Email (optional)
            </label>
            <div className="relative">
              <Mail
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                type="email"
                className={inputClass + " pl-9"}
                value={customerForm.email}
                onChange={(e) => setField("email", e.target.value)}
                placeholder="customer@example.com"
                aria-label="Customer email"
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Without email, send the payment link via WhatsApp manually.
            </p>
          </div>

          {/* Address line 1 */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">
              Address line 1 <span className="text-red-600">*</span>
            </label>
            <div className="relative">
              <MapPin
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                className={inputClass + " pl-9"}
                required
                value={customerForm.addressLine1}
                onChange={(e) => setField("addressLine1", e.target.value)}
                aria-label="Address line 1"
              />
            </div>
          </div>

          {/* Address line 2 */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">
              Address line 2
            </label>
            <input
              className={inputClass}
              value={customerForm.addressLine2}
              onChange={(e) => setField("addressLine2", e.target.value)}
              aria-label="Address line 2"
            />
          </div>

          {/* City */}
          <div>
            <label className="block text-sm font-medium mb-1">
              City <span className="text-red-600">*</span>
            </label>
            <input
              className={inputClass}
              required
              value={customerForm.city}
              onChange={(e) => setField("city", e.target.value)}
              aria-label="City"
            />
          </div>

          {/* State */}
          <div>
            <label className="block text-sm font-medium mb-1">
              State <span className="text-red-600">*</span>
            </label>
            <select
              className={inputClass}
              required
              value={customerForm.state}
              onChange={(e) =>
                setField("state", e.target.value as (typeof MALAYSIAN_STATES)[number])
              }
              aria-label="State"
            >
              {MALAYSIAN_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Postcode */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Postcode <span className="text-red-600">*</span>
            </label>
            <input
              className={inputClass + " font-mono"}
              required
              maxLength={5}
              pattern="\d{5}"
              value={customerForm.postcode}
              onChange={(e) => setField("postcode", e.target.value)}
              placeholder="50000"
              aria-label="Postcode"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
