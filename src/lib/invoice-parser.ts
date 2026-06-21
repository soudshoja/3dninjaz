// ============================================================================
// Invoice text → structured expense fields.
//
// Goal (client): auto-detect EVERYTHING on extraction — date, amount, and
// category are auto-allocated. The VENDOR is the only field the admin may need
// to pick, and only when detection is unclear (vendorClear === false).
//
// Strategy: a small per-supplier registry (few known suppliers) gives exact,
// high-confidence parses. Anything unmatched falls to robust generic heuristics
// (largest "total"-labelled amount, first parseable date, keyword category).
//
// Pure functions, no IO. Safe to import anywhere server-side.
// ============================================================================

export type ExpenseCategory =
  | "materials"
  | "utilities"
  | "marketing"
  | "shipping"
  | "equipment"
  | "other";

export type ParsedInvoice = {
  supplierName: string | null;
  invoiceDate: string | null; // YYYY-MM-DD
  amount: string | null; // "123.45"
  category: ExpenseCategory;
  /** 0..1 overall confidence in the extraction. */
  confidence: number;
  /** When false, the admin must confirm/select the vendor before saving. */
  vendorClear: boolean;
  /** Human-readable notes about fields the parser could not extract. */
  errors: string[];
};

// ---------------------------------------------------------------------------
// Generic extractors
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoIfValid(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/**
 * Extract an invoice date, normalized to YYYY-MM-DD. Malaysian invoices are
 * day-first (DD/MM/YYYY). Prefers a date sitting next to a date-ish label.
 */
export function findInvoiceDate(text: string): string | null {
  const labelled = text.match(
    /(?:invoice\s*date|order\s*date|date|dated|tarikh)[:\s]*([0-9]{1,4}[\s./-][0-9A-Za-z]{1,9}[\s./-][0-9]{1,4})/i,
  );
  const candidates: string[] = [];
  if (labelled) candidates.push(labelled[1]);

  // ISO first (unambiguous).
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const v = isoIfValid(+iso[1], +iso[2], +iso[3]);
    if (v) return v;
  }

  // DD Mon YYYY  /  Mon DD, YYYY
  const dmonY = text.match(/\b(\d{1,2})\s*([A-Za-z]{3,9})\s*(20\d{2})\b/);
  if (dmonY) {
    const m = MONTHS[dmonY[2].slice(0, 3).toLowerCase()];
    if (m) {
      const v = isoIfValid(+dmonY[3], m, +dmonY[1]);
      if (v) return v;
    }
  }
  const monDY = text.match(/\b([A-Za-z]{3,9})\s*(\d{1,2}),?\s*(20\d{2})\b/);
  if (monDY) {
    const m = MONTHS[monDY[1].slice(0, 3).toLowerCase()];
    if (m) {
      const v = isoIfValid(+monDY[3], m, +monDY[2]);
      if (v) return v;
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY (day-first, MY convention)
  for (const raw of candidates.concat(
    (text.match(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g) ?? []) as string[],
  )) {
    const m = raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
    if (!m) continue;
    let y = +m[3];
    if (y < 100) y += 2000;
    const v = isoIfValid(y, +m[2], +m[1]);
    if (v) return v;
  }
  return null;
}

/**
 * Extract the payable amount as "123.45". Prefers amounts adjacent to total-ish
 * labels (grand total / amount due / total payable); falls back to the largest
 * monetary figure in the document.
 */
export function findAmount(text: string): string | null {
  const num = (s: string) => parseFloat(s.replace(/,/g, ""));
  const collect = (re: RegExp, src = text): number[] => {
    const out: number[] = [];
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    while ((m = r.exec(src)) !== null) {
      const n = num(m[1]);
      if (Number.isFinite(n)) out.push(n);
    }
    return out;
  };

  // 1) Authoritative payable labels — take the max of these if any matched.
  const specific = collect(
    /(?:grand\s*total|amount\s*(?:due|payable)|total\s*payable|nett?\s*total)[:\s]*(?:rm|myr)?\s*([0-9][0-9,]*\.\d{2})/gi,
  );
  if (specific.length) return Math.max(...specific).toFixed(2);

  // 2) A bare "total" line, but skip "subtotal"/"sub-total" lines so a larger
  //    pre-discount subtotal never wins.
  const totalLine: number[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/sub[\s-]*total/i.test(line)) continue;
    totalLine.push(...collect(/\btotal\b[:\s]*(?:rm|myr)?\s*([0-9][0-9,]*\.\d{2})/gi, line));
  }
  if (totalLine.length) return Math.max(...totalLine).toFixed(2);

  // 3) Largest RM / MYR figure anywhere.
  const rm = collect(/(?:rm|myr)\s*([0-9][0-9,]*\.\d{2})/gi);
  if (rm.length) return Math.max(...rm).toFixed(2);

  // 4) Last resort: any decimal (capped width to avoid absurd matches).
  const bare = collect(/\b([0-9]{1,6}\.\d{2})\b/g);
  return bare.length ? Math.max(...bare).toFixed(2) : null;
}

const CATEGORY_KEYWORDS: Array<[ExpenseCategory, RegExp]> = [
  ["materials", /\b(filament|pla|petg|abs|resin|spool|raw\s*material|material)\b/i],
  ["utilities", /\b(electric|electricity|tnb|water|utility|utilities|internet|broadband|unifi|maxis|celcom|digi)\b/i],
  ["marketing", /\b(facebook|fb\s*ads|tiktok|instagram|google\s*ads|advertis|marketing|boost|promotion|campaign)\b/i],
  ["shipping", /\b(courier|postage|shipping|delivery|pos\s*laju|poslaju|j&t|jnt|gdex|city-?link|ninja\s*van|consignment)\b/i],
  ["equipment", /\b(printer|3d\s*printer|machine|nozzle|hotend|tool|equipment|spare\s*part|build\s*plate)\b/i],
];

export function detectCategory(text: string): ExpenseCategory {
  for (const [cat, re] of CATEGORY_KEYWORDS) {
    if (re.test(text)) return cat;
  }
  return "other";
}

/**
 * Best-effort vendor name. Returns { name, clear }: clear=true only when we
 * have a strong signal (registry match handled separately, or a company-suffix
 * like SDN BHD / ENTERPRISE / TRADING on a line).
 */
function detectVendor(text: string): { name: string | null; clear: boolean } {
  const companyLine = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /\b(sdn\.?\s*bhd|enterprise|trading|resources|sdn bhd|holdings|industries)\b/i.test(l));
  if (companyLine) {
    return { name: companyLine.replace(/\s{2,}/g, " ").slice(0, 200), clear: true };
  }
  // First non-empty, non-numeric line is a weak guess.
  const firstLine = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 2 && !/^[\d\s.,:/-]+$/.test(l));
  return { name: firstLine ? firstLine.slice(0, 200) : null, clear: false };
}

// ---------------------------------------------------------------------------
// Supplier registry — add one entry per known supplier.
// ---------------------------------------------------------------------------

type SupplierParser = {
  id: string;
  label: string;
  /** Detect whether this raw text belongs to this supplier. */
  match: (text: string) => boolean;
  /** Default category for this supplier (overrides keyword detection). */
  category?: ExpenseCategory;
};

const PARSERS: SupplierParser[] = [
  // Example: a filament supplier on Shopee. Extend as templates arrive.
  {
    id: "shopee",
    label: "Shopee",
    match: (t) => /\bshopee\b/i.test(t),
    category: "materials",
  },
  {
    id: "lazada",
    label: "Lazada",
    match: (t) => /\blazada\b/i.test(t),
    category: "materials",
  },
];

export function listSupplierParsers(): { id: string; label: string }[] {
  return PARSERS.map((p) => ({ id: p.id, label: p.label }));
}

/** Known vendor labels, for the admin's "select vendor" dropdown. */
export function knownVendorLabels(): string[] {
  return PARSERS.map((p) => p.label);
}

export function parseInvoiceText(text: string): ParsedInvoice {
  const supplier = PARSERS.find((p) => p.match(text));
  const amount = findAmount(text);
  const invoiceDate = findInvoiceDate(text);

  let supplierName: string | null;
  let vendorClear: boolean;
  let category: ExpenseCategory;

  if (supplier) {
    supplierName = supplier.label;
    vendorClear = true;
    category = supplier.category ?? detectCategory(text);
  } else {
    const v = detectVendor(text);
    supplierName = v.name;
    vendorClear = v.clear;
    category = detectCategory(text);
  }

  const errors: string[] = [];
  if (!amount) errors.push("Could not detect the total amount — please enter it.");
  if (!invoiceDate) errors.push("Could not detect the invoice date — please enter it.");
  if (!vendorClear) errors.push("Vendor unclear — please confirm or select the vendor.");

  // Confidence: weighted by what we resolved cleanly.
  let confidence = 0;
  if (amount) confidence += 0.4;
  if (invoiceDate) confidence += 0.3;
  if (vendorClear) confidence += 0.3;

  return { supplierName, invoiceDate, amount, category, confidence, vendorClear, errors };
}
