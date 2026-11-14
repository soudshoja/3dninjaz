import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { getSalesReport } from "@/lib/accounting";
import { resolveRange } from "@/lib/date-range";
import { publicOrigin } from "@/lib/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/accounting/sales-export?range=<preset> | ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Streams the sales report (one row per day, week or month by span) as CSV.
 * Amounts are raw 2dp numbers (no "RM" prefix) so spreadsheets parse them numerically.
 */

function escapeCsv(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    const baseUrl =
      process.env.BETTER_AUTH_URL ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      publicOrigin();
    const url = new URL("/login", baseUrl);
    url.searchParams.set("next", "/admin/accounting/sales");
    return NextResponse.redirect(url, { status: 307 });
  }

  // ?range=<preset> or ?from=&to= (same model as the accounting pages). Junk
  // falls back to this month, matching the sales report page default.
  const sp = req.nextUrl.searchParams;
  const range = resolveRange(
    { range: sp.get("range"), from: sp.get("from"), to: sp.get("to") },
    { defaultPreset: "this_month" },
  );
  const rows = await getSalesReport({ from: range.from, to: range.to, bucket: range.bucket });

  const header =
    "Period,Orders,SalesExclShipping,ShippingCollected,PayPalFees,ProductCost,GrossMargin\n";
  const body = rows
    .map((r) =>
      [
        escapeCsv(r.bucket),
        r.orderCount,
        r.sales.toFixed(2),
        r.shippingCollected.toFixed(2),
        r.paypalFees.toFixed(2),
        r.productCost.toFixed(2),
        r.grossMargin == null ? "" : r.grossMargin.toFixed(2),
      ].join(","),
    )
    .join("\n");

  const rangeLabel = `${range.from || "all"}_${range.to || "all"}`;
  return new NextResponse(header + body + (body ? "\n" : ""), {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="sales-${rangeLabel}.csv"`,
      "cache-control": "no-store",
    },
  });
}
