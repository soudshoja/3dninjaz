/**
 * Server-only helper — renders a NinjazInvoiceDocument to a base64-encoded
 * PDF buffer for a given orderId.
 *
 * Used by:
 *  - The invoice PDF route (refactored to call renderInvoicePdfBuffer).
 *  - The WhatsApp invoice sender (sendWhatsAppInvoicePdf).
 *
 * Constraints:
 *  - NEVER throws — returns null on any failure so callers can treat it as
 *    best-effort.
 *  - Fetches the order directly via trusted DB access (no session check) so
 *    it works from server-side notification contexts where no session exists.
 *  - No rate-limit — callers are trusted server contexts, not end-users.
 */
import "server-only";
import fs from "fs";
import path from "path";
import ReactPDF from "@react-pdf/renderer";
import { db } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NinjazInvoiceDocument } from "@/lib/pdf/invoice-branded";
import type { NinjazInvoiceBusiness } from "@/lib/pdf/invoice-branded";
import { BUSINESS } from "@/lib/business-info";

const PDPA_LINE =
  "This is a digital invoice; no signature required. Records retained for 7 years per Malaysian PDPA 2010.";

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

async function resolveBusiness(): Promise<NinjazInvoiceBusiness> {
  let business: NinjazInvoiceBusiness = {
    businessName: BUSINESS.legalName,
    contactEmail: BUSINESS.contactEmail,
    whatsappDisplay: BUSINESS.whatsappNumberDisplay,
    pdpaLine: PDPA_LINE,
    bankName: null,
    bankAccountNumber: null,
    bankAccountHolder: null,
    city: BUSINESS.city,
    website: "3dninjaz.com",
    logoBase64: readLogoBase64(),
  };

  try {
    const mod: unknown = await import("@/lib/store-settings").catch(() => null);
    const fn =
      mod && typeof mod === "object" && "getStoreSettingsCached" in mod
        ? (mod as { getStoreSettingsCached?: () => Promise<unknown> })
            .getStoreSettingsCached
        : null;
    if (typeof fn === "function") {
      const s = (await fn()) as
        | {
            businessName?: string | null;
            contactEmail?: string | null;
            whatsappNumberDisplay?: string | null;
            bankName?: string | null;
            bankAccountNumber?: string | null;
            bankAccountHolder?: string | null;
          }
        | null;
      if (s) {
        business = {
          ...business,
          businessName: s.businessName ?? business.businessName,
          contactEmail: s.contactEmail ?? business.contactEmail,
          whatsappDisplay:
            s.whatsappNumberDisplay ?? business.whatsappDisplay,
          bankName: s.bankName ?? null,
          bankAccountNumber: s.bankAccountNumber ?? null,
          bankAccountHolder: s.bankAccountHolder ?? null,
        };
      }
    }
  } catch {
    // silently use BUSINESS fallback
  }

  return business;
}

/**
 * Fetch the order row + items from DB by orderId (no auth check — trusted
 * server context only).
 */
async function fetchOrderForPdf(orderId: string) {
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  return { ...row, items };
}

/**
 * Render a NinjazInvoiceDocument for the given orderId and return it as a
 * Buffer. Returns null on any failure (never throws).
 */
export async function renderInvoicePdfBuffer(
  orderId: string,
): Promise<Buffer | null> {
  try {
    const order = await fetchOrderForPdf(orderId);
    if (!order) return null;

    const business = await resolveBusiness();

    const orderData = {
      id: order.id,
      status: order.status,
      createdAt: order.createdAt,
      currency: order.currency,
      customerEmail: order.customerEmail,
      shippingName: order.shippingName,
      shippingPhone: order.shippingPhone,
      shippingLine1: order.shippingLine1,
      shippingLine2: order.shippingLine2 ?? null,
      shippingCity: order.shippingCity,
      shippingState: order.shippingState,
      shippingPostcode: order.shippingPostcode,
      shippingCountry: order.shippingCountry,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      totalAmount: order.totalAmount,
      discountAmount: order.discountAmount ?? null,
      discountCode: order.discountCode ?? null,
      items: order.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        variantId: i.variantId,
        productName: i.productName,
        size: i.size,
        variantLabel: i.variantLabel ?? null,
        configurationData: i.configurationData ?? null,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
      })),
    };

    const doc = <NinjazInvoiceDocument order={orderData} business={business} />;

    const stream = await ReactPDF.renderToStream(doc);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as unknown as AsyncIterable<Buffer>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch (err) {
    console.error("[render-invoice] renderInvoicePdfBuffer failed:", err);
    return null;
  }
}

/**
 * Render a NinjazInvoiceDocument for the given orderId and return it as a
 * base64-encoded string (no data: prefix). Returns null on any failure.
 */
export async function renderInvoicePdfBase64(
  orderId: string,
): Promise<string | null> {
  const buf = await renderInvoicePdfBuffer(orderId);
  if (!buf) return null;
  return buf.toString("base64");
}
