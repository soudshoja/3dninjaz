import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { getSalesReport } from "@/lib/accounting";
import { publicOrigin } from "@/lib/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/accounting/sales-export?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Streams the by-month sales report as CSV. Amounts are raw 2dp numbers (no
 * "RM" prefix) so spreadsheets parse them numerically.
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

  // Accept only well-formed YYYY-MM-DD; ignore junk so a malformed param can't
  // reach new Date() in the query builder and 500 the export.
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const rawFrom = req.nextUrl.searchParams.get("from");
  const rawTo = req.nextUrl.searchParams.get("to");
  const from = rawFrom && dateRe.test(rawFrom) ? rawFrom : null;
  const to = rawTo && dateRe.test(rawTo) ? rawTo : null;
  const rows = await getSalesReport({ from, to });

  const header = "Month,Revenue,COGS,Shipping,PayPalFees,Profit,Orders\n";
  const body = rows
    .map((r) =>
      [
        escapeCsv(r.month),
        r.revenue.toFixed(2),
        r.cogs.toFixed(2),
        r.shipping.toFixed(2),
        r.paypalFees.toFixed(2),
        r.profit.toFixed(2),
        r.orderCount,
      ].join(","),
    )
    .join("\n");

  const range = `${from || "all"}_${to || "all"}`;
  return new NextResponse(header + body + (body ? "\n" : ""), {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="sales-${range}.csv"`,
      "cache-control": "no-store",
    },
  });
}
