/**
 * Quotation helpers (2026-08-18).
 *
 * Plain module, NOT "use server" — it exports types and sync helpers, which a
 * "use server" file may not do (that combination is a runtime ReferenceError
 * 500 that tsc does not catch). The server actions in
 * src/actions/admin-quotations.ts import from here.
 */

import type { Quotation, QuotationItem } from "@/lib/db/schema";

/** A quotation with its lines, as hydrated by getQuotation(). */
export type QuotationWithItems = Quotation & { items: QuotationItem[] };

export type QuotationLineInput = {
  description: string;
  quantity: number;
  unitPrice: string;
  /** Optional explicit amount. When omitted, quantity x unitPrice is used. */
  lineTotal?: string;
};

export type QuotationInput = {
  contactName: string;
  companyName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactAddress?: string | null;
  projectDescription?: string | null;
  productionLeadTime?: string | null;
  /** YYYY-MM-DD */
  validUntil: string;
  depositPercent?: string;
  terms?: string[];
  notes?: string | null;
  items: QuotationLineInput[];
};

/**
 * Default payment terms, taken verbatim from the client's existing quotation
 * (templates/qutation.pdf). Seeded into every new quote and editable per quote,
 * so changing them here never rewrites quotes already sent.
 *
 * The lowercase "the remaining" in item 3 is intentional: it matches the
 * source document rather than silently correcting it.
 */
export const DEFAULT_QUOTE_TERMS: string[] = [
  "50% down payment is required to confirm the order and commence production.",
  "The down payment is non-refundable once production has started.",
  "the remaining 50% balance must be settled prior to shipment or delivery.",
  "Production lead time will be confirmed upon receipt of the down payment and final approval.",
  "Production lead time is approximately 4 weeks and will commence upon receipt of the 50% down payment and final approval of all order details.",
];

export const DEFAULT_LEAD_TIME = "4 weeks (30 Days)";

/**
 * `terms` is a JSON string[] stored in a LONGTEXT column. mysql2 does NOT
 * auto-parse it, so every read site must come through here.
 */
export function ensureTermsArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === "string");
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((t): t is string => typeof t === "string");
      }
    } catch {
      // corrupt payload — fall through
    }
  }
  return [];
}

/** 24 -> "#0024". The document's own series, unrelated to order numbers. */
export function formatQuoteNo(quoteNo: number): string {
  return `#${String(quoteNo).padStart(4, "0")}`;
}

/**
 * Document-style money: "RM12,000" when whole, "RM12,000.50" otherwise.
 * Matches the source quotation, which omits trailing ".00". Deliberately not
 * formatMYR() — that is the invoice's format and this document differs.
 */
export function formatQuoteMoney(value: string | number): string {
  const n = typeof value === "number" ? value : parseFloat(value);
  if (!isFinite(n)) return "RM0";
  const hasCents = Math.round(n * 100) % 100 !== 0;
  const fixed = hasCents ? n.toFixed(2) : String(Math.round(n));
  const [whole, cents] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `RM${grouped}${cents ? "." + cents : ""}`;
}

/** "2026-08-17" -> "17/08/2026", the format used on the printed document. */
export function formatQuoteDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) {
    const d = String(value.getDate()).padStart(2, "0");
    const m = String(value.getMonth() + 1).padStart(2, "0");
    return `${d}/${m}/${value.getFullYear()}`;
  }
  const parts = value.slice(0, 10).split("-");
  if (parts.length !== 3) return value;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/** Line amount as a fixed 2dp string. Explicit lineTotal wins when supplied. */
export function computeLineTotal(line: QuotationLineInput): string {
  if (line.lineTotal !== undefined && line.lineTotal !== "") {
    const explicit = parseFloat(line.lineTotal);
    if (isFinite(explicit)) return explicit.toFixed(2);
  }
  const qty = Number(line.quantity) || 0;
  const unit = parseFloat(line.unitPrice);
  const amount = qty * (isFinite(unit) ? unit : 0);
  return amount.toFixed(2);
}

/** Sum of line totals, as a fixed 2dp string. */
export function computeQuoteTotal(lines: QuotationLineInput[]): string {
  const sum = lines.reduce((acc, l) => acc + parseFloat(computeLineTotal(l)), 0);
  return sum.toFixed(2);
}

/** Deposit due, as a fixed 2dp string. 100% means payment in full up front. */
export function computeDeposit(total: string, depositPercent: string): string {
  const t = parseFloat(total);
  const p = parseFloat(depositPercent);
  if (!isFinite(t) || !isFinite(p)) return "0.00";
  return ((t * p) / 100).toFixed(2);
}

/** A quote past its validity date, still awaiting acceptance. */
export function isQuoteExpired(q: {
  validUntil: string;
  status: string;
}): boolean {
  if (q.status !== "sent" && q.status !== "draft") return false;
  const today = new Date().toISOString().slice(0, 10);
  return q.validUntil < today;
}

export const QUOTATION_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  deposit_paid: "Deposit paid",
  completed: "Paid in full",
  cancelled: "Cancelled",
};
