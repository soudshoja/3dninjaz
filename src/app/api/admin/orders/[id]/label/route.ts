import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orderShipments } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth-helpers";

// ============================================================================
// Phase 9 (09-01) — admin-scoped PDF label proxy.
//
// Delyva returns the label as `application/pdf` from /order/{id}/label. We
// don't expose the API key to the browser, so this route fetches the PDF
// server-side and streams the bytes back with an inline disposition so the
// admin sees it in a new tab.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await ctx.params;

  const s = await db
    .select()
    .from(orderShipments)
    .where(eq(orderShipments.orderId, id))
    .limit(1);
  if (s.length === 0 || !s[0].delyvaOrderId) {
    return new NextResponse("No shipment", { status: 404 });
  }

  const base = process.env.DELYVA_BASE_URL ?? "https://api.delyva.app/v1.0";
  const key = process.env.DELYVA_API_KEY ?? "";
  if (!key) return new NextResponse("DELYVA_API_KEY missing", { status: 500 });

  const upstream = await fetch(`${base}/order/${s[0].delyvaOrderId}/label`, {
    headers: { "X-Delyvax-Access-Token": key },
    cache: "no-store",
  });

  if (!upstream.ok) {
    const txt = await upstream.text().catch(() => "");
    return new NextResponse(
      `Delyva label fetch failed (${upstream.status}): ${txt.slice(0, 200)}`,
      { status: 502 },
    );
  }

  const buf = await upstream.arrayBuffer();
  return new NextResponse(Buffer.from(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="label-${id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
