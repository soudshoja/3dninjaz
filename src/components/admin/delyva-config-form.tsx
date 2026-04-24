"use client";

import { useEffect, useState, useTransition, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import {
  updateShippingConfig,
  type ShippingConfigRow,
  type UpdateShippingConfigInput,
  type ServiceCatalogRow,
} from "@/actions/shipping";
import {
  testDelyvaConnection,
  registerWebhooks,
  refreshServiceCatalog,
  getServiceCatalog,
  updateServiceEnabled,
} from "@/actions/delyva";
import { DELYVA_EVENTS_TO_REGISTER } from "@/lib/delyva-events";

type ConnectionState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; name: string; customerId: string; subscription: string | null }
  | { state: "error"; error: string };

type CatalogState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "loaded"; rows: ServiceCatalogRow[]; loadedAt: Date }
  | { state: "error"; error: string };

type RefreshState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; uniqueServices: number; newlyAdded: number }
  | { state: "error"; error: string };

// Probe corridors used during catalog refresh (from origin to each destination)
const PROBE_CORRIDORS = [
  "KL→KL (local)",
  "KL→Penang",
  "KL→JB",
  "KL→KK",
  "KL→Kuching",
];

type Props = {
  initial: ShippingConfigRow;
};

const ITEM_TYPES: Array<"PARCEL" | "PACKAGE" | "BULKY"> = [
  "PARCEL",
  "PACKAGE",
  "BULKY",
];

/**
 * /admin/shipping/delyva — Phase 9 Delyva config surface (Phase 15 catalog UI).
 *
 * Sections: (1) Connection status, (2) Origin address, (3) Package defaults,
 * (4) Price adjustment, (5) Enabled services (catalog), (6) Webhook registration.
 *
 * Phase 15 changes to section 5:
 * - Catalog is loaded from shipping_service_catalog (not re-probed on mount).
 * - "Refresh catalog" button fires multi-corridor probe + upsert.
 * - Services grouped by courier brand with indeterminate parent checkbox.
 * - "Save toggles" persists only the changed enable/disable states.
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
    return () => { alive = false; };
  }, []);

  // --- catalog state
  const [catalog, setCatalog] = useState<CatalogState>({ state: "idle" });
  // Optimistic local enabled state keyed by serviceCode.
  const [localEnabled, setLocalEnabled] = useState<Record<string, boolean>>({});

  const loadCatalog = useCallback(() => {
    setCatalog({ state: "loading" });
    setLocalEnabled({});
    getServiceCatalog()
      .then((rows) => {
        const init: Record<string, boolean> = {};
        for (const r of rows) init[r.serviceCode] = r.isEnabled;
        setLocalEnabled(init);
        setCatalog({ state: "loaded", rows, loadedAt: new Date() });
      })
      .catch((e) => {
        setCatalog({ state: "error", error: (e as Error).message });
      });
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  // --- catalog refresh (multi-corridor probe)
  const [refreshState, setRefreshState] = useState<RefreshState>({ state: "idle" });
  const doRefreshCatalog = () => {
    setRefreshState({ state: "loading" });
    startTransition(async () => {
      try {
        const res = await refreshServiceCatalog();
        if (res.ok) {
          setRefreshState({
            state: "ok",
            uniqueServices: res.uniqueServices,
            newlyAdded: res.newlyAdded,
          });
          loadCatalog();
        } else {
          setRefreshState({ state: "error", error: res.error });
        }
      } catch (e) {
        setRefreshState({ state: "error", error: (e as Error).message });
      }
    });
  };

  // --- per-click optimistic toggle (replaces batch save)
  const toggleServiceEnabled = (serviceCode: string, currentEnabled: boolean) => {
    const newEnabled = !currentEnabled;
    // Optimistic update immediately
    setLocalEnabled((prev) => ({ ...prev, [serviceCode]: newEnabled }));
    // Persist in background
    startTransition(async () => {
      try {
        const res = await updateServiceEnabled(serviceCode, newEnabled);
        if (!res.ok) {
          // Rollback on failure
          setLocalEnabled((prev) => ({ ...prev, [serviceCode]: currentEnabled }));
        }
      } catch {
        // Rollback on error
        setLocalEnabled((prev) => ({ ...prev, [serviceCode]: currentEnabled }));
      }
    });
  };

  // --- form state (origin / pricing)
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
    // enabledServices kept for backward compat — no longer the source of truth
    // for checkout filtering, but we still persist it to avoid breaking the
    // existing column. Pass empty to signal "use catalog instead".
    enabledServices: [],
  });

  const setField = <K extends keyof UpdateShippingConfigInput>(
    key: K,
    v: UpdateShippingConfigInput[K],
  ) => setValues((prev) => ({ ...prev, [key]: v }));

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

  // Derive catalog rows for rendering
  const catalogRows = catalog.state === "loaded" ? catalog.rows : [];

  // Unique courier count
  const courierCount = useMemo(() => {
    const codes = new Set(catalogRows.map((r) => r.companyCode || r.serviceCode));
    return codes.size;
  }, [catalogRows]);

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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

      {/* --- 5. Enabled services (catalog) --- */}
      <section className="rounded-2xl border-2 p-5" style={border}>
        <h2 className="font-[var(--font-heading)] text-xl mb-1">Enabled services</h2>

        {/* Refresh result banner */}
        {refreshState.state === "ok" && (
          <p className="mb-3 text-sm rounded-xl px-3 py-2" style={{ backgroundColor: `${BRAND.green}22`, color: BRAND.ink }}>
            ✓ Found {refreshState.uniqueServices} service tier{refreshState.uniqueServices !== 1 ? "s" : ""} across 5 corridors
            {refreshState.newlyAdded > 0 ? ` (${refreshState.newlyAdded} newly added)` : ""}.
          </p>
        )}
        {refreshState.state === "error" && (
          <p className="mb-3 text-sm text-red-700 rounded-xl px-3 py-2 bg-red-50">
            ✗ Refresh failed: {refreshState.error}
          </p>
        )}

        {/* Catalog content */}
        {catalog.state === "loading" ? (
          <p className="text-sm text-slate-600">Loading catalog…</p>
        ) : catalog.state === "error" ? (
          <p className="text-sm text-red-700">Could not load catalog: {catalog.error}</p>
        ) : catalogRows.length === 0 ? (
          /* Empty state — catalog not yet probed */
          <div className="rounded-xl border-2 border-dashed p-8 text-center"
            style={{ borderColor: `${BRAND.ink}22` }}>
            <p className="font-semibold mb-1 text-sm" style={{ color: BRAND.ink }}>
              Your courier catalog is empty
            </p>
            <p className="text-sm text-slate-500 mb-4">
              Click below to probe Delyva across 5 Malaysian corridors and load all available services.
            </p>
            <button
              type="button"
              onClick={doRefreshCatalog}
              disabled={pending || refreshState.state === "loading"}
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-white min-h-[40px] disabled:opacity-50"
              style={{ backgroundColor: BRAND.blue }}
            >
              {refreshState.state === "loading" ? "Probing couriers…" : "Refresh catalog"}
            </button>
          </div>
        ) : (
          <ServiceCatalogUI
            rows={catalogRows}
            localEnabled={localEnabled}
            onToggle={toggleServiceEnabled}
            onRefresh={doRefreshCatalog}
            refreshing={pending || refreshState.state === "loading"}
            loadedAt={catalog.state === "loaded" ? catalog.loadedAt : null}
            courierCount={courierCount}
          />
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

      {/* --- Submit (origin/pricing only) --- */}
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

// ============================================================================
// Helpers
// ============================================================================

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins !== 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  return date.toLocaleDateString();
}

function formatEta(minMinutes: number | null, maxMinutes: number | null): string {
  if (!minMinutes && !maxMinutes) return "";
  const toDay = (m: number) => Math.round(m / (60 * 24));
  if (minMinutes && maxMinutes) {
    const minD = toDay(minMinutes);
    const maxD = toDay(maxMinutes);
    if (minD === maxD) return `${minD}d`;
    return `${minD}–${maxD}d`;
  }
  if (maxMinutes) return `≤${toDay(maxMinutes)}d`;
  if (minMinutes) return `≥${toDay(minMinutes)}d`;
  return "";
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

// ============================================================================
// ServiceCatalogUI — combobox + chips + transparency panel
// ============================================================================

type ServiceCatalogUIProps = {
  rows: ServiceCatalogRow[];
  localEnabled: Record<string, boolean>;
  onToggle: (serviceCode: string, currentEnabled: boolean) => void;
  onRefresh: () => void;
  refreshing: boolean;
  loadedAt: Date | null;
  courierCount: number;
};

function ServiceCatalogUI({
  rows,
  localEnabled,
  onToggle,
  onRefresh,
  refreshing,
  loadedAt,
  courierCount,
}: ServiceCatalogUIProps) {
  return (
    <div className="space-y-4">
      <ServiceCatalogCombobox
        rows={rows}
        localEnabled={localEnabled}
        onToggle={onToggle}
      />
      <SelectedServiceChips
        rows={rows}
        localEnabled={localEnabled}
        onRemove={(code) => onToggle(code, true)}
      />
      <CatalogTransparencyPanel
        rows={rows}
        courierCount={courierCount}
        loadedAt={loadedAt}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// ServiceCatalogCombobox
// ----------------------------------------------------------------------------

function ServiceCatalogCombobox({
  rows,
  localEnabled,
  onToggle,
}: {
  rows: ServiceCatalogRow[];
  localEnabled: Record<string, boolean>;
  onToggle: (serviceCode: string, currentEnabled: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (s) =>
        s.serviceCode.toLowerCase().includes(q) ||
        s.companyName.toLowerCase().includes(q) ||
        (s.serviceName?.toLowerCase().includes(q) ?? false) ||
        (s.serviceType?.toLowerCase().includes(q) ?? false),
    );
  }, [query, rows]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); } }}
        placeholder="Search couriers — J&T, Grab, Ninja Van, SPX..."
        className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px] outline-none focus:ring-2"
        style={{
          borderColor: `${BRAND.ink}33`,
          // @ts-expect-error CSS variable
          "--tw-ring-color": BRAND.blue,
        }}
      />

      {open && (
        <div
          className="absolute z-50 mt-1 w-full rounded-xl border-2 bg-white shadow-lg max-h-72 overflow-y-auto"
          style={{ borderColor: `${BRAND.ink}22` }}
        >
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">No services match "{query}"</p>
          ) : (
            <ul>
              {filtered.map((row) => {
                const isOn = localEnabled[row.serviceCode] ?? false;
                const eta = formatEta(row.etaMinMinutes, row.etaMaxMinutes);
                return (
                  <li key={row.serviceCode}>
                    <button
                      type="button"
                      onClick={() => onToggle(row.serviceCode, isOn)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
                      style={isOn ? { backgroundColor: `${BRAND.blue}0d` } : undefined}
                    >
                      {/* Checkmark indicator */}
                      <span
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 text-white text-xs font-bold"
                        style={{
                          borderColor: isOn ? BRAND.blue : `${BRAND.ink}33`,
                          backgroundColor: isOn ? BRAND.blue : "transparent",
                        }}
                      >
                        {isOn ? "✓" : ""}
                      </span>

                      {/* Service code badge */}
                      <span
                        className="font-mono text-xs px-1.5 py-0.5 rounded shrink-0"
                        style={{ backgroundColor: `${BRAND.ink}0c` }}
                      >
                        {row.serviceCode}
                      </span>

                      {/* Name + type */}
                      <span className="flex-1 min-w-0">
                        <span className="text-sm font-medium truncate block" style={{ color: BRAND.ink }}>
                          {row.companyName || row.companyCode}
                        </span>
                        <span className="text-xs text-slate-500 truncate block">
                          {row.serviceName ?? row.serviceCode}
                          {row.serviceType ? ` · ${row.serviceType}` : ""}
                        </span>
                      </span>

                      {/* Price + ETA */}
                      <span className="text-xs text-slate-500 shrink-0 text-right">
                        {row.samplePrice ? `RM ${Number(row.samplePrice).toFixed(2)}` : ""}
                        {eta ? <><br />{eta}</> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// SelectedServiceChips
// ----------------------------------------------------------------------------

function SelectedServiceChips({
  rows,
  localEnabled,
  onRemove,
}: {
  rows: ServiceCatalogRow[];
  localEnabled: Record<string, boolean>;
  onRemove: (serviceCode: string) => void;
}) {
  const enabledRows = rows.filter((r) => localEnabled[r.serviceCode] ?? false);

  if (enabledRows.length === 0) {
    return (
      <p className="text-xs text-slate-400 italic">
        No services enabled yet — search above to add some.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {enabledRows.map((row) => {
        const eta = formatEta(row.etaMinMinutes, row.etaMaxMinutes);
        const label = [
          row.companyName || row.companyCode,
          row.serviceType,
          row.samplePrice ? `RM ${Number(row.samplePrice).toFixed(2)}` : null,
          eta || null,
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <span
            key={row.serviceCode}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
            style={{
              backgroundColor: `${BRAND.blue}15`,
              color: BRAND.blue,
              border: `1px solid ${BRAND.blue}40`,
            }}
          >
            {label}
            <button
              type="button"
              onClick={() => onRemove(row.serviceCode)}
              aria-label={`Remove ${row.companyName || row.serviceCode}`}
              className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-blue-200 transition-colors text-blue-600"
            >
              ×
            </button>
          </span>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------------
// CatalogTransparencyPanel
// ----------------------------------------------------------------------------

function CatalogTransparencyPanel({
  rows,
  courierCount,
  loadedAt,
  onRefresh,
  refreshing,
}: {
  rows: ServiceCatalogRow[];
  courierCount: number;
  loadedAt: Date | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div
      className="rounded-xl border p-4 text-xs space-y-2"
      style={{ backgroundColor: "#fafafa", borderColor: "#e4e4e7" }}
    >
      <p className="font-semibold text-slate-600 mb-1">How this list is loaded</p>

      <p className="text-slate-500">
        <span className="font-medium text-slate-700">Source:</span>{" "}
        <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-600">
          POST https://api.delyva.app/v1.0/service/instantQuote
        </code>
      </p>

      <p className="text-slate-500">
        <span className="font-medium text-slate-700">Probes 5 corridors:</span>{" "}
        {PROBE_CORRIDORS.join(", ")}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="space-y-0.5 text-slate-500">
          <p>
            <span className="font-medium text-slate-700">Last refreshed:</span>{" "}
            {loadedAt ? formatRelative(loadedAt) : "—"}
          </p>
          <p>
            <span className="font-medium text-slate-700">Catalog:</span>{" "}
            {rows.length} service{rows.length !== 1 ? "s" : ""} from {courierCount} courier{courierCount !== 1 ? "s" : ""}
          </p>
          <p>
            <span className="font-medium text-slate-700">Frequency:</span>{" "}
            Manual only — click refresh when couriers change
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="rounded-full px-4 py-2 text-xs font-semibold text-white min-h-[32px] disabled:opacity-50 shrink-0"
          style={{ backgroundColor: BRAND.blue }}
        >
          {refreshing ? "Probing couriers…" : "Refresh catalog"}
        </button>
      </div>
    </div>
  );
}
