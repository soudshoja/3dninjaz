import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { quotations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { renderQuotationPdfBuffer } from "@/lib/pdf/render-quotation";
import { formatQuoteNo } from "@/lib/quotations";

/**
 * GET /admin/quotations/[id]/quotation.pdf
 *
 * Admin-only stream of the quotation PDF, mirroring the customer invoice route
 * at src/app/(store)/orders/[id]/invoice.pdf/route.tsx.
 *
 * THREAT MODEL:
 *  - auth: requireAdmin() is the FIRST await; failure returns 401 rather than
 *    throwing an unhandled error (CVE-2025-29927 — middleware alone is
 *    bypassable, so the check lives in the handler).
 *  - cache leak: Cache-Control: private, no-store.
 *  - PDF injection: react-pdf renders Text nodes as escaped strings; no
 *    template-string concatenation in quotation-branded.tsx.
 *
 * No rate limit here: unlike the customer invoice route this is reachable only
 * by an authenticated admin.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  const [quote] = await db
    .select({ quoteNo: quotations.quoteNo })
    .from(quotations)
    .where(eq(quotations.id, id))
    .limit(1);
  if (!quote) return new NextResponse("Not found", { status: 404 });

  const buffer = await renderQuotationPdfBuffer(id);
  if (!buffer) {
    return new NextResponse("Could not render this quotation.", { status: 500 });
  }

  const fileName = `quotation-${formatQuoteNo(quote.quoteNo).replace("#", "")}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
