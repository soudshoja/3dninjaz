"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import {
  updateShippingConfig,
  type ShippingConfigRow,
  type UpdateShippingConfigInput,
} from "@/actions/shipping";
import {
  testDelyvaConnection,
  listDelyvaServices,
  registerWebhooks,
} from "@/actions/delyva";
import { DELYVA_EVENTS_TO_REGISTER } from "@/lib/delyva-events";

type ConnectionState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; name: string; customerId: string; subscription: string | null }
  | { state: "error"; error: string };

type ServiceOption = {
  companyCode: string;
  name: string;
  priceAmount: number;
  currency: string;
};

type Props = {
  initial: ShippingConfigRow;
};

const ITEM_TYPES: Array<"PARCEL" | "PACKAGE" | "BULKY"> = [
  "PARCEL",
  "PACKAGE",
  "BULKY",
];

/**
 * /admin/shipping/delyva — Phase 9 Delyva config surface.
 *
 * Sections: (1) Connection status, (2) Origin address, (3) Package defaults,
 * (4) Price adjustment, (5) Enabled services, (6) Webhook registration.
 *
 * The form calls updateShippingConfig() for persistence; services are
 * probed lazily via listDelyvaServices() on mount; webhook registration is
 * a button-triggered action that hits Delyva's /webhook/subscribe.
 */
export function DelyvaConfigForm({ initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- connection probe
  const [connection, setConnection] = useState<ConnectionState>({ state: "idle" });
  useEffect(() => {
    let alive = true;
    setConnection({ state: "loading" });
    testDelyvaConnection()
      .then((res) => {
        if (!alive) return;
        if (res.ok) {
          setConnection({
            state: "ok",
            name: res.name,
            customerId: res.customerId,
            subscription: res.subscription,
          });
        } else {
          setConnection({ state: "error", error: res.error });
        }
      })
      .catch((e) => {
        if (alive) setConnection({ state: "error", error: (e as Error).message });
      });
    return () => {
      alive = false;
    };
  }, []);

  // --- services probe
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [servicesErr, setServicesErr] = useState<string | null>(null);
  const [servicesLoading, setServicesLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setServicesLoading(true);
    listDelyvaServices()
      .then((res) => {
        if (!alive) return;
        if (res.ok) {
          // Note — serviceCode here is the bookable code (e.g. "SPXDMY-PN-BD1");
          // the old variable name `companyCode` is kept for form-state compat
          // since `enabledServices` persists the same string and the admin
          // UI has always shown one tick per rate tier, not per brand.
          const opts: ServiceOption[] = res.services.map((s) => ({
            companyCode: s.serviceCode,
            name: s.serviceName,
            priceAmount: Number(s.price.amount),
            currency: s.price.currency ?? "MYR",
          }));
          setServices(opts);
          setServicesErr(null);
        } else {
          setServicesErr(res.error);
        }
      })
      .finally(() => {
        if (alive) setServicesLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // --- form state
  const [values, setValues] = useState<UpdateShippingConfigInput>({
    originAddress1: initial.originAddress1,
    originAddress2: initial.originAddress2 ?? "",
    originCity: initial.originCity,
    originState: initial.originState,
    originPostcode: initial.originPostcode,
    originCountry: initial.originCountry,
    originContactName: initial.originContactName,
    originContactEmail: initial.originContactEmail,
    originContactPhone: initial.originContactPhone,
    defaultItemType: initial.defaultItemType,
    defaultWeightKg: initial.defaultWeightKg,
    markupPercent: initial.markupPercent,
    markupFlat: initial.markupFlat,
    freeShippingThreshold: initial.freeShippingThreshold,
    enabledServices: initial.enabledServices,
  });

  const setField = <K extends keyof UpdateShippingConfigInput>(
    key: K,
    v: UpdateShippingConfigInput[K],
  ) => setValues((prev) => ({ ...prev, [key]: v }));

  const toggleService = (code: string) => {
    setValues((prev) => {
      const set = new Set(prev.enabledServices ?? []);
      if (set.has(code)) set.delete(code);
      else set.add(code);
      return { ...prev, enabledServices: Array.from(set) };
    });
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const res = await updateShippingConfig(values);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  };

  // --- webhook registration
  const [webhookState, setWebhookState] = useState<
    | { state: "idle" }
    | { state: "loading" }
    | { state: "ok"; registered: string[]; url: string }
    | { state: "error"; error: string }
  >({ state: "idle" });
  const doRegisterWebhooks = () => {
    setWebhookState({ state: "loading" });
    startTransition(async () => {
      const res = await registerWebhooks();
      if (res.ok) setWebhookState({ state: "ok", registered: res.registered, url: res.url });
      else setWebhookState({ state: "error", error: res.error });
    });
  };

  const border = { borderColor: `${BRAND.ink}22`, backgroundColor: "#ffffff" };
  const inputStyle = { borderColor: `${BRAND.ink}33` } as const;

  return (
    <form onSubmit={onSubmit} className="space-y-5" style={{ color: BRAND.ink }}>
      {/* --- 1. Connection --- */}
      <section className="rounded-2xl border-2 p-5" style={border}>
        <h2 className="font-[var(--font-heading)] text-xl mb-3">
          Delyva connection
        </h2>
        {connection.state === "loading" ? (
          <p className="text-sm text-slate-600">Probing /user…</p>
        ) : connection.state === "ok" ? (
          <p className="text-sm" style={{ color: BRAND.green }}>
            <span aria-hidden>✓</span> Connected to <strong>{connection.name}</strong>{" "}
            (customer #{connection.customerId})
            {connection.subscription ? ` — plan: ${connection.subscription}` : ""}
          </p>
        ) : connection.state === "error" ? (
          <p className="text-sm text-red-700">
            <span aria-hidden>✗</span> {connection.error}
          </p>
        ) : null}
      </section>

      {/* --- 2. Origin address --- */}
      <section className="rounded-2xl border-2 p-5" style={border}>
        <h2 className="font-[var(--font-heading)] text-xl mb-3">Origin address</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldInput
            label="Address line 1"
            value={values.originAddress1}
            onChange={(v) => setField("originAddress1", v)}
            style={inputStyle}
            required
          />
          <FieldInput
            label="Address line 2"
            value={values.originAddress2 ?? ""}
            onChange={(v) => setField("originAddress2", v)}
            style={inputStyle}
          />
          <FieldInput
            label="City"
            value={values.originCity}
            onChange={(v) => setField("originCity", v)}
            style={inputStyle}
            required
          />
          <FieldInput
            label="State"
            value={values.originState}
            onChange={(v) => setField("originState", v)}
            style={inputStyle}
            required
          />
          <FieldInput
            label="Postcode (5 digits)"
            value={values.originPostcode}
            onChange={(v) => setField("originPostcode", v.replace(/\D/g, "").slice(0, 5))}
            style={inputStyle}
            required
          />
          <FieldInput
            label="Country (ISO-2)"
            value={values.originCountry ?? "MY"}
            onChange={(v) => setField("originCountry", v.toUpperCase().slice(0, 2))}
            style={inputStyle}
          />
          <FieldInput
            label="Contact name"
            value={values.originContactName}
            onChange={(v) => setField("originContactName", v)}
            style={inputStyle}
            required
          />
          <FieldInput
            label="Contact email"
            value={values.originContactEmail}
            onChange={(v) => setField("originContactEmail", v)}
            type="email"
            style={inputStyle}
            required
          />
          <FieldInput
            label="Contact phone (+60…)"
            value={values.originContactPhone}
            onChange={(v) => setField("originContactPhone", v)}
            style={inputStyle}
            required
          />
        </div>
      </section>

      {/* --- 3. Package defaults --- */}
      <section className="rounded-2xl border-2 p-5" style={border}>
        <h2 className="font-[var(--font-heading)] text-xl mb-3">Package defaults</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold mb-1">Item type</label>
            <select
              value={values.defaultItemType}
              onChange={(e) =>
                setField(
                  "defaultItemType",
                  e.target.value as "PARCEL" | "PACKAGE" | "BULKY",
                )
              }
              className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]"
              style={inputStyle}
            >
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <FieldInput
            label="Fallback weight (kg)"
            value={values.defaultWeightKg}
            onChange={(v) => setField("defaultWeightKg", v)}
            inputMode="decimal"
            pattern="\d+(\.\d{1,3})?"
            style={inputStyle}
            required
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Used when a product row has no shipping weight set.
        </p>
      </section>

      {/* --- 4. Price adjustment --- */}
      <section className="rounded-2xl border-2 p-5" style={border}>
        <h2 className="font-[var(--font-heading)] text-xl mb-3">Price adjustment</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <FieldInput
            label="Markup percent (%)"
            value={values.markupPercent}
            onChange={(v) => setField("markupPercent", v)}
            inputMode="decimal"
            pattern="\d+(\.\d{1,2})?"
            style={inputStyle}
          />
          <FieldInput
            label="Markup flat (MYR)"
            value={values.markupFlat}
            onChange={(v) => setField("markupFlat", v)}
            inputMode="decimal"
            pattern="\d+(\.\d{1,2})?"
            style={inputStyle}
          />
          <FieldInput
            label="Free-shipping threshold (MYR, blank = off)"
            value={values.freeShippingThreshold ?? ""}
            onChange={(v) => setField("freeShippingThreshold", v || null)}
            inputMode="decimal"
            pattern="\d+(\.\d{1,2})?"
            style={inputStyle}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          finalPrice = price + price×percent/100 + flat. Free-shipping is
          applied when cart subtotal reaches the threshold.
        </p>
      </section>

      {/* --- 5. Enabled services --- */}
      <section className="rounded-2xl border-2 p-5" style={border}>
        <h2 className="font-[var(--font-heading)] text-xl mb-3">Enabled services</h2>
        <p className="mb-3 text-xs text-slate-500">
          Leaving all unchecked = offer every courier Delyva returns at
          checkout. Tick one or more to restrict the allowlist.
        </p>
        {servicesLoading ? (
          <p className="text-sm text-slate-600">Probing couriers via sample KL→PJ quote…</p>
        ) : servicesErr ? (
          <p className="text-sm text-red-700">Could not load services: {servicesErr}</p>
        ) : services.length === 0 ? (
          <p className="text-sm text-slate-600">No services returned.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {services.map((s) => (
              <li key={s.companyCode}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={values.enabledServices.includes(s.companyCode)}
                    onChange={() => toggleService(s.companyCode)}
                  />
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100">
                    {s.companyCode}
                  </span>
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="text-xs text-slate-500">
                    RM {s.priceAmount.toFixed(2)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- 6. Webhooks --- */}
      <section className="rounded-2xl border-2 p-5" style={border}>
        <h2 className="font-[var(--font-heading)] text-xl mb-3">Webhooks</h2>
        <p className="mb-2 text-sm text-slate-700">
          Events we register:&nbsp;
          {DELYVA_EVENTS_TO_REGISTER.map((e) => (
            <code key={e} className="mx-1 font-mono text-xs px-2 py-0.5 rounded bg-slate-100">
              {e}
            </code>
          ))}
        </p>
        <button
          type="button"
          onClick={doRegisterWebhooks}
          disabled={pending || webhookState.state === "loading"}
          className="rounded-full px-5 py-2 text-sm font-semibold text-white min-h-[40px] disabled:opacity-50"
          style={{ backgroundColor: BRAND.blue }}
        >
          {webhookState.state === "loading" ? "Registering…" : "Re-register webhooks"}
        </button>
        {webhookState.state === "ok" ? (
          <p className="mt-3 text-sm" style={{ color: BRAND.green }}>
            ✓ Registered {webhookState.registered.length} event(s) at{" "}
            <code className="font-mono text-xs">{webhookState.url}</code>
          </p>
        ) : null}
        {webhookState.state === "error" ? (
          <p className="mt-3 text-sm text-red-700">✗ {webhookState.error}</p>
        ) : null}
      </section>

      {/* --- Submit --- */}
      {error ? (
        <p
          role="alert"
          className="rounded-xl px-3 py-2 text-sm"
          style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
        >
          {error}
        </p>
      ) : null}
      {savedAt ? (
        <p
          role="status"
          className="rounded-xl px-3 py-2 text-sm font-semibold"
          style={{ backgroundColor: `${BRAND.green}22`, color: BRAND.ink }}
        >
          Delyva config saved.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50 sticky bottom-4"
        style={{ backgroundColor: BRAND.ink }}
      >
        {pending ? "Saving…" : "Save configuration"}
      </button>
    </form>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  type,
  inputMode,
  pattern,
  style,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: "decimal" | "text" | "email" | "numeric";
  pattern?: string;
  style?: React.CSSProperties;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold mb-1">{label}</span>
      <input
        type={type ?? "text"}
        inputMode={inputMode}
        pattern={pattern}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]"
        style={style}
      />
    </label>
  );
}
