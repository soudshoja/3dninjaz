import { NextResponse } from "next/server";
import ReactPDF from "@react-pdf/renderer";
import { requireUser } from "@/lib/auth-helpers";
import { getMyOrder } from "@/actions/orders";
import { formatOrderNumber } from "@/lib/orders";
import { InvoiceDocument } from "@/lib/pdf/invoice";
import { BUSINESS } from "@/lib/business-info";

/**
 * Phase 6 06-06 — GET /orders/[id]/invoice.pdf (CUST-06).
 *
 * THREAT MODEL:
 *  - T-06-06-auth: requireUser() FIRST await; throws -> handled as 401
 *  - T-06-06-IDOR: getMyOrder owner-or-admin gate; 404 for non-owner
 *    (same response as truly missing — enumeration block, mirrors T-03-21)
 *  - T-06-06-rate-limit: 10 invoices/user/hour via in-process Map
 *  - T-06-06-cache-leak: Cache-Control: private, no-store
 *  - T-06-06-PDF-injection: react-pdf renders Text nodes as escaped strings;
 *    no template-string concatenation anywhere in lib/pdf/invoice.tsx
 *
 * Document source preference (Q-06-03): try DB-backed getStoreSettings()
 * (Phase 5 05-04) via dynamic import; fall back to static BUSINESS const.
 */

export const dynamic = "force-dynamic";

const INVOICE_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const INVOICE_MAX_PER_WINDOW = 10;
const invoiceLog = new Map<string, number[]>();

function allowInvoice(userId: string): boolean {
  const now = Date.now();
  const history = (invoiceLog.get(userId) ?? []).filter(
    (t) => now - t < INVOICE_COOLDOWN_MS,
  );
  if (history.length >= INVOICE_MAX_PER_WINDOW) {
    invoiceLog.set(userId, history);
    return false;
  }
  history.push(now);
  invoiceLog.set(userId, history);
  return true;
}

const PDPA_LINE =
  "This is a digital invoice; no signature required. Records retained for 7 years per Malaysian PDPA 2010.";

async function resolveBusiness(): Promise<{
  businessName: string;
  contactEmail: string;
  whatsappDisplay: string;
  pdpaLine: string;
}> {
  // Default — static BUSINESS const (widen the as-const literals to string).
  let business: {
    businessName: string;
    contactEmail: string;
    whatsappDisplay: string;
    pdpaLine: string;
  } = {
    businessName: BUSINESS.legalName,
    contactEmail: BUSINESS.contactEmail,
    whatsappDisplay: BUSINESS.whatsappNumberDisplay,
    pdpaLine: PDPA_LINE,
  };
  try {
    // Phase 5 05-04 may export getStoreSettings — load it dynamically so we
    // don't break when the module isn't merged yet.
    const mod: unknown = await import("@/lib/store-settings").catch(() => null);
    const fn =
      mod && typeof mod === "object" && "getStoreSettings" in mod
        ? (mod as { getStoreSettings?: () => Promise<unknown> })
            .getStoreSettings
        : null;
    if (typeof fn === "function") {
      const s = (await fn()) as
        | {
            businessName?: string;
            contactEmail?: string;
            whatsappNumberDisplay?: string;
          }
        | null;
      if (s) {
        business = {
          businessName: s.businessName ?? business.businessName,
          contactEmail: s.contactEmail ?? business.contactEmail,
          whatsappDisplay:
            s.whatsappNumberDisplay ?? business.whatsappDisplay,
          pdpaLine: PDPA_LINE,
        };
      }
    }
  } catch {
    // Phase 5 05-04 hasn't shipped — silently use BUSINESS fallback.
  }
  return business;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireUser();
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  if (!allowInvoice(session.user.id)) {
    return new NextResponse(
      "Too many invoice downloads. Try again in an hour.",
      { status: 429 },
    );
  }

  const order = await getMyOrder(id);
  if (!order) {
    // Same response as truly missing — T-06-06-IDOR.
    return new NextResponse("Not found", { status: 404 });
  }

  const business = await resolveBusiness();

  const stream = await ReactPDF.renderToStream(
    <InvoiceDocument
      order={{
        id: order.id,
        status: order.status,
        createdAt: order.createdAt,
        currency: order.currency,
        customerEmail: order.customerEmail,
        shippingName: order.shippingName,
        shippingPhone: order.shippingPhone,
        shippingLine1: order.shippingLine1,
        shippingLine2: order.shippingLine2,
        shippingCity: order.shippingCity,
        shippingState: order.shippingState,
        shippingPostcode: order.shippingPostcode,
        shippingCountry: order.shippingCountry,
        subtotal: order.subtotal,
        shippingCost: order.shippingCost,
        totalAmount: order.totalAmount,
        items: order.items.map((i) => ({
          id: i.id,
          productName: i.productName,
          size: i.size,
          variantLabel: i.variantLabel ?? null,
          configurationData: i.configurationData ?? null, // Phase 19 (19-09)
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          lineTotal: i.lineTotal,
        })),
      }}
      business={business}
    />,
  );

  // react-pdf returns a Node Readable; collect to a buffer for NextResponse.
  const chunks: Buffer[] = [];
  for await (const chunk of stream as unknown as AsyncIterable<Buffer>) {
    chunks.push(Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${formatOrderNumber(order.id)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
