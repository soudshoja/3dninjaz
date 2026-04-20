"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import {
  bookShipmentForOrder,
  cancelShipment,
  refreshShipmentStatus,
  quoteRatesForOrder,
  type ShipmentRow,
} from "@/actions/shipping";

type Service = {
  serviceCode: string;
  serviceName: string;
  price: number;
  currency: string;
  etaMin?: number | null;
  etaMax?: number | null;
};

type Props = {
  orderId: string;
  shipment: ShipmentRow | null;
};

/**
 * Admin shipping panel for the order detail page (Phase 9 09-01).
 *
 * Two modes:
 *   1. No shipment — show "Book courier" button. Clicking runs a live quote
 *      for the order's destination and renders a service picker. Admin picks,
 *      we call bookShipmentForOrder().
 *   2. Shipment exists — show consignmentNo, trackingNo, personnel,
 *      statusMessage, action buttons (Refresh, Cancel, Print label, View map).
 *
 * Cancellation rules (see SKILL.md):
 *   - NDD / Courier services: cancellable only while statusCode < 110
 *   - Instant / Same-day: cancellable while statusCode < 200
 * We expose the button unconditionally and let Delyva reject — the error is
 * surfaced inline.
 */
export function OrderShipmentPanel({ orderId, shipment }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // --- booking flow state
  const [services, setServices] = useState<Service[] | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [selectedCode, setSelectedCode] = useState<string>("");

  const loadQuotes = () => {
    setQuoteErr(null);
    setQuoteLoading(true);
    startTransition(async () => {
      const res = await quoteRatesForOrder(orderId);
      setQuoteLoading(false);
      if (res.ok) {
        const mapped: Service[] = res.services.map((s) => ({
          // serviceCode is the bookable id (service.code e.g. "SPXDMY-PN-BD1")
          // — what POST /order expects. Previously we mistakenly passed the
          // brand-level companyCode which caused undefined access.
          serviceCode: s.serviceCode,
          serviceName: s.serviceName,
          price: Number(s.price.amount),
          currency: s.price.currency ?? "MYR",
          etaMin: s.etaMin,
          etaMax: s.etaMax,
        }));
        setServices(mapped);
        if (mapped[0]) setSelectedCode(mapped[0].serviceCode);
      } else {
        setQuoteErr(res.error);
      }
    });
  };

  // Autoload quotes when there is no shipment (saves admin a click).
  useEffect(() => {
    if (!shipment && services === null) loadQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipment]);

  const book = () => {
    if (!selectedCode) return;
    setError(null);
    const quoted = services?.find((s) => s.serviceCode === selectedCode);
    startTransition(async () => {
      const res = await bookShipmentForOrder(orderId, selectedCode, {
        quotedPrice: quoted ? quoted.price.toFixed(2) : null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  const refresh = () => {
    setError(null);
    startTransition(async () => {
      const res = await refreshShipmentStatus(orderId);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  const cancel = () => {
    if (!confirm("Cancel this courier booking? Delyva enforces time windows — see status code."))
      return;
    setError(null);
    startTransition(async () => {
      const res = await cancelShipment(orderId);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  // ------------------- rendering -------------------

  if (!shipment) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          No courier booked yet. Pick a service below to dispatch this order.
        </p>
        {quoteLoading ? (
          <p className="text-sm text-slate-600">Fetching live rates…</p>
        ) : quoteErr ? (
          <div>
            <p className="text-sm text-red-700">{quoteErr}</p>
            <button
              type="button"
              onClick={loadQuotes}
              disabled={pending}
              className="mt-2 rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: BRAND.ink }}
            >
              Retry
            </button>
          </div>
        ) : services && services.length === 0 ? (
          <p className="text-sm text-slate-600">
            Delyva returned no services for this destination. Verify the postcode
            and origin address.
          </p>
        ) : services ? (
          <>
            <ul className="grid gap-2 sm:grid-cols-2">
              {services.map((s) => (
                <li key={s.serviceCode}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3"
                    style={{ borderColor: selectedCode === s.serviceCode ? BRAND.blue : `${BRAND.ink}22` }}>
                    <input
                      type="radio"
                      name="serviceCode"
                      value={s.serviceCode}
                      checked={selectedCode === s.serviceCode}
                      onChange={() => setSelectedCode(s.serviceCode)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{s.serviceName}</p>
                      <p className="text-xs font-mono text-slate-500">{s.serviceCode}</p>
                    </div>
                    <p className="text-sm font-bold">
                      {s.currency} {s.price.toFixed(2)}
                    </p>
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={book}
              disabled={pending || !selectedCode}
              className="rounded-full px-6 py-3 font-bold text-white min-h-[44px] disabled:opacity-50"
              style={{ backgroundColor: BRAND.ink }}
            >
              {pending ? "Booking…" : "Book courier"}
            </button>
          </>
        ) : null}
        {error ? (
          <p className="rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  // -------- existing shipment view --------

  const status = shipment.statusCode;
  // Treat "delivered" as statusCode >= 400, "cancelled" as 90.
  const delivered = typeof status === "number" && status >= 400 && status !== 500;
  const cancelled = status === 90;
  const showMap = !!shipment.consignmentNo && !delivered && !cancelled;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 text-sm">
        <InfoLine label="Consignment" value={shipment.consignmentNo} mono />
        <InfoLine label="Tracking #" value={shipment.trackingNo} mono />
        <InfoLine label="Service" value={shipment.serviceCode} mono />
        <InfoLine
          label="Status"
          value={
            status !== null
              ? `${status}${shipment.statusMessage ? ` — ${shipment.statusMessage}` : ""}`
              : shipment.statusMessage ?? "pending"
          }
        />
        <InfoLine label="Courier" value={shipment.personnelName} />
        <InfoLine label="Courier phone" value={shipment.personnelPhone} />
        <InfoLine label="Delyva order id" value={shipment.delyvaOrderId} mono />
        {shipment.quotedPrice ? (
          <InfoLine label="Quoted price" value={`RM ${shipment.quotedPrice}`} />
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/admin/orders/${orderId}/label`}
          target="_blank"
          rel="noreferrer"
          className="rounded-full px-4 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: BRAND.blue }}
        >
          Print label (PDF)
        </a>
        <button
          type="button"
          onClick={refresh}
          disabled={pending}
          className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{
            backgroundColor: "transparent",
            color: BRAND.ink,
            border: `2px solid ${BRAND.ink}33`,
          }}
        >
          {pending ? "Refreshing…" : "Refresh status"}
        </button>
        {!cancelled && !delivered ? (
          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
          >
            Cancel booking
          </button>
        ) : null}
      </div>

      {showMap ? (
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: `${BRAND.ink}22` }}>
          <iframe
            src={`https://my.delyva.app/track/rmap?trackingNo=${encodeURIComponent(shipment.consignmentNo!)}`}
            style={{ width: "100%", height: 420, border: 0 }}
            loading="lazy"
            title="Delyva live tracking"
          />
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function InfoLine({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={mono ? "font-mono break-all" : "break-words"}>
        {value ?? <span className="text-slate-400">—</span>}
      </p>
    </div>
  );
}
