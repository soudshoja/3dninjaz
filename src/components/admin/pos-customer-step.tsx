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
 * Once the address postcode (/^\d{5}$/) and state are set, automatically
 * quotes live Delyva shipping rates using quoteForCart. The cheapest option
 * is pre-selected and `onShippingChange` is called so the builder's summary
 * reflects the shipping cost before submit. Falls back to getShippingRate
 * (state flat-rate) when Delyva returns no options or errors.
 *
 * Props:
 *   customerForm      — current CustomerForm state
 *   onChange(form)    — parent updates its state
 *   items             — CartItemForQuote[] from the current ticket
 *   onShippingChange  — emits selected shipping cost (MYR) to parent
 */

import { useEffect, useRef, useState } from "react";
import { Search, Loader2, User, Phone, Mail, MapPin, Truck, CheckCircle2 } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { MALAYSIAN_STATES } from "@/lib/validators";
import { getPosCustomerSearch, type PosCustomerResult } from "@/actions/admin-pos";
import { quoteForCart, type QuoteOption, type CartItemForQuote } from "@/actions/shipping-quote";
import { getShippingRate } from "@/actions/admin-shipping";
import { formatMYR } from "@/lib/format";

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
  items: CartItemForQuote[];
  onShippingChange: (price: number) => void;
};

type Tab = "returning" | "new";

export function PosCustomerStep({ customerForm, onChange, items, onShippingChange }: Props) {
  const [tab, setTab] = useState<Tab>("returning");

  // Returning customer search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PosCustomerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomerResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Shipping quote ──────────────────────────────────────────────────────────
  const [shippingOptions, setShippingOptions] = useState<QuoteOption[]>([]);
  const [selectedServiceCode, setSelectedServiceCode] = useState<string | null>(null);
  const [quotingShipping, setQuotingShipping] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);
  const shippingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQuoteKeyRef = useRef<string>("");

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

  // ── Shipping quote: trigger when postcode + state are valid ─────────────────
  useEffect(() => {
    const postcode = customerForm.postcode.trim();
    const state = customerForm.state;
    const addressValid = /^\d{5}$/.test(postcode) && !!state;

    if (!addressValid || items.length === 0) {
      if (shippingDebounceRef.current) clearTimeout(shippingDebounceRef.current);
      setShippingOptions([]);
      setSelectedServiceCode(null);
      setShippingError(null);
      setQuotingShipping(false);
      lastQuoteKeyRef.current = "";
      return;
    }

    const quoteKey = JSON.stringify({ postcode, state, items: items.map(i => ({ id: i.productId, v: i.variantId, q: i.quantity })) });
    if (quoteKey === lastQuoteKeyRef.current) return;

    if (shippingDebounceRef.current) clearTimeout(shippingDebounceRef.current);

    shippingDebounceRef.current = setTimeout(async () => {
      lastQuoteKeyRef.current = quoteKey;
      setQuotingShipping(true);
      setShippingError(null);
      try {
        const res = await quoteForCart(items, {
          address1: customerForm.addressLine1 || "-",
          address2: customerForm.addressLine2 || null,
          city: customerForm.city || "-",
          state,
          postcode,
          country: "MY",
        });

        if (res.ok && res.options.length > 0) {
          setShippingOptions(res.options);
          const sorted = [...res.options].sort((a, b) => a.finalPrice - b.finalPrice);
          const cheapest = sorted[0];
          setSelectedServiceCode(cheapest.serviceCode);
          onShippingChange(cheapest.finalPrice);
          setQuotingShipping(false);
          return;
        }
      } catch {
        // Fall through to flat-rate fallback
      }

      // Fallback: use flat-rate getShippingRate
      try {
        const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
        const fallback = await getShippingRate(state, subtotal);
        setShippingOptions([]);
        setSelectedServiceCode(null);
        setShippingError(null);
        onShippingChange(fallback.cost);
      } catch {
        setShippingOptions([]);
        setSelectedServiceCode(null);
        setShippingError("Could not fetch shipping rates. You can override the amount manually.");
        onShippingChange(0);
      }
      setQuotingShipping(false);
    }, 500);

    return () => {
      if (shippingDebounceRef.current) clearTimeout(shippingDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerForm.postcode, customerForm.state, customerForm.addressLine1, items]);

  function handleSelectShippingOption(opt: QuoteOption) {
    setSelectedServiceCode(opt.serviceCode);
    onShippingChange(opt.finalPrice);
  }

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

      {/* ── Shipping rate picker ── */}
      {/^\d{5}$/.test(customerForm.postcode.trim()) && customerForm.state ? (
        <div
          className="rounded-[4px] border-2 border-slate-200 p-4 space-y-3"
          aria-label="Shipping options"
        >
          <div className="flex items-center gap-2">
            <Truck size={16} style={{ color: "#0080ff" }} aria-hidden />
            <span className="text-sm font-semibold" style={{ color: BRAND.ink }}>
              Courier &amp; Shipping Rate
            </span>
            {quotingShipping && (
              <Loader2
                size={14}
                className="animate-spin ml-auto"
                style={{ color: "#0080ff" }}
                aria-label="Fetching shipping rates"
              />
            )}
          </div>

          {shippingError ? (
            <p
              className="text-xs rounded-[4px] px-3 py-2"
              style={{ backgroundColor: "#fff3cd", color: "#92400e" }}
              role="alert"
            >
              {shippingError}
            </p>
          ) : null}

          {!quotingShipping && shippingOptions.length === 0 && !shippingError ? (
            <p className="text-xs text-slate-500">
              Fetching live rates — or using flat-rate fallback if Delyva is unavailable.
            </p>
          ) : null}

          {!quotingShipping && shippingOptions.length > 0 ? (
            <fieldset className="grid gap-2">
              <legend className="sr-only">Choose a courier</legend>
              {shippingOptions.map((opt) => {
                const selected = selectedServiceCode === opt.serviceCode;
                const eta =
                  opt.etaMin && opt.etaMax
                    ? `${opt.etaMin}–${opt.etaMax} min`
                    : opt.etaMin
                      ? `${opt.etaMin} min`
                      : null;
                return (
                  <label
                    key={opt.serviceCode}
                    className="flex items-center gap-3 rounded-[4px] border-2 px-3 py-3 cursor-pointer transition-colors duration-150 min-h-[52px]"
                    style={{
                      borderColor: selected ? "#0080ff" : "#e2e8f0",
                      backgroundColor: selected ? "#0080ff0d" : "#ffffff",
                    }}
                  >
                    <input
                      type="radio"
                      name="pos_shipping_service"
                      value={opt.serviceCode}
                      checked={selected}
                      onChange={() => handleSelectShippingOption(opt)}
                      className="h-4 w-4 shrink-0"
                      aria-label={`${opt.serviceName} — ${opt.freeShipApplied ? "FREE" : formatMYR(opt.finalPrice)}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-tight" style={{ color: BRAND.ink }}>
                        {opt.serviceName}
                      </p>
                      {eta ? (
                        <p className="text-xs text-slate-500">ETA {eta}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {opt.freeShipApplied ? (
                        <span className="text-sm font-bold tabular-nums" style={{ color: "#03C03C" }}>
                          FREE
                        </span>
                      ) : (
                        <span className="text-sm font-bold tabular-nums" style={{ color: BRAND.ink }}>
                          {formatMYR(opt.finalPrice)}
                        </span>
                      )}
                      {selected ? (
                        <CheckCircle2 size={15} style={{ color: "#0080ff" }} aria-hidden />
                      ) : null}
                    </div>
                  </label>
                );
              })}
            </fieldset>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
