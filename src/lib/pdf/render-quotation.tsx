/**
 * Server-only helper — renders a quotation to a PDF buffer for a given
 * quotationId. Mirrors src/lib/pdf/render-invoice.tsx.
 *
 * Constraints (same as the invoice renderer):
 *  - NEVER throws. Returns null on any failure so callers treat it as
 *    best-effort.
 *  - Reads the quote via trusted DB access with no session check, so it works
 *    from server-side notification contexts where no session exists. The
 *    admin-facing route in front of it does its own requireAdmin().
 */
import "server-only";
import fs from "fs";
import path from "path";
import ReactPDF from "@react-pdf/renderer";
import { db } from "@/lib/db";
import { quotations, quotationItems, storeSettings } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { NinjazQuotationDocument } from "@/lib/pdf/quotation-branded";
import type { QuotationDoc } from "@/lib/pdf/quotation-branded";
import { BUSINESS } from "@/lib/business-info";
import {
  ensureTermsArray,
  formatQuoteNo,
  formatQuoteMoney,
  formatQuoteDate,
} from "@/lib/quotations";

/**
 * Registered entity line under the wordmark. Kept verbatim from the client's
 * existing quotation, including its "SND." spelling, so reissued quotes match
 * documents already in circulation. Page 2's bank block spells it "SDN." —
 * that discrepancy exists in the source and is the client's to resolve.
 */
const ENTITY_LINE = "CITY COMMERCE SND. BHD - (1608815-U)";

function readLogoBase64(): string | null {
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    if (!fs.existsSync(logoPath)) return null;
    const buffer = fs.readFileSync(logoPath);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Build the presentational document object. Exported so a future preview route
 * can render without touching the DB twice.
 */
export async function buildQuotationDoc(
  quotationId: string,
): Promise<QuotationDoc | null> {
  const [quote] = await db
    .select()
    .from(quotations)
    .where(eq(quotations.id, quotationId))
    .limit(1);
  if (!quote) return null;

  // Manual hydration — MariaDB 10.11 has no LATERAL, so db.query…with fails.
  const items = await db
    .select()
    .from(quotationItems)
    .where(eq(quotationItems.quotationId, quotationId))
    .orderBy(asc(quotationItems.position));

  // Bank block comes from store settings, the same source the invoice uses.
  let bank: QuotationDoc["bank"] = null;
  try {
    const [settings] = await db.select().from(storeSettings).limit(1);
    if (settings?.bankAccountNumber && settings?.bankName) {
      bank = {
        holder: settings.bankAccountHolder || BUSINESS.legalName,
        accountNumber: settings.bankAccountNumber,
        bankName: settings.bankName,
      };
    }
  } catch {
    // Bank block is optional on the document — omit rather than fail the PDF.
  }

  return {
    quoteNo: formatQuoteNo(quote.quoteNo),
    date: formatQuoteDate(quote.createdAt),
    validUntil: formatQuoteDate(quote.validUntil),
    // The client-facing "Customer ID" on the source document. We surface the
    // quote's own number when there is no external reference to show.
    customerId: String(quote.quoteNo),
    leadTime: quote.productionLeadTime || "",

    contactName: quote.contactName,
    companyName: quote.companyName,
    contactPhone: quote.contactPhone,

    projectDescription: quote.projectDescription,
    items: items.map((it) => ({
      description: it.description,
      qty: it.quantity > 0 ? String(it.quantity) : "",
      // Blank cells are meaningful on this document: component rows carry a
      // quantity but no price. A zero unit price renders as empty, not "RM0".
      unitPrice: parseFloat(it.unitPrice) > 0 ? formatQuoteMoney(it.unitPrice) : "",
      lineTotal: parseFloat(it.lineTotal) > 0 ? formatQuoteMoney(it.lineTotal) : "",
    })),
    subtotal: formatQuoteMoney(quote.subtotal),
    total: formatQuoteMoney(quote.totalAmount),

    terms: ensureTermsArray(quote.terms),
    bank,
    business: {
      wordmark: "3DNINJAZ",
      entity: ENTITY_LINE,
      contactEmail: BUSINESS.contactEmail,
      logoBase64: readLogoBase64(),
    },
  };
}

/** Render to a Buffer. Returns null on any failure. */
export async function renderQuotationPdfBuffer(
  quotationId: string,
): Promise<Buffer | null> {
  try {
    const doc = await buildQuotationDoc(quotationId);
    if (!doc) return null;

    const stream = await ReactPDF.renderToStream(
      <NinjazQuotationDocument doc={doc} />,
    );
    const chunks: Buffer[] = [];
    for await (const chunk of stream as unknown as AsyncIterable<Buffer>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch (err) {
    console.error("[render-quotation] failed:", quotationId, err);
    return null;
  }
}

/** Render to base64 (no data: prefix), for WhatsApp media sends. */
export async function renderQuotationPdfBase64(
  quotationId: string,
): Promise<string | null> {
  const buf = await renderQuotationPdfBuffer(quotationId);
  return buf ? buf.toString("base64") : null;
}
