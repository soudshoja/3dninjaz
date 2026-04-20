import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { emailSubscribers } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/subscribers/export — stream a CSV of subscribers.
 *
 * Auth: admin-only. We use `requireAdmin()` as the first await; a non-admin
 * gets a 307 to /login instead of a 500 so the download button UX is clean.
 *
 * Query params:
 *   - status: 'all' | 'active' | 'unsubscribed' | 'bounced' (default 'all')
 *
 * Columns: email, source, status, subscribed_at, unsubscribed_at. CSV follows
 * RFC 4180 — quote any cell containing ",", `"`, or newline; escape `"` by
 * doubling it.
 */

type StatusFilter = "all" | "active" | "unsubscribed" | "bounced";
const VALID: StatusFilter[] = ["all", "active", "unsubscribed", "bounced"];

function escapeCsv(value: string | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fmtIso(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString();
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    // Non-admin / not logged in — redirect to /login (307 preserves method,
    // but GET redirect is what a download button user would expect).
    const url = new URL("/login", req.url);
    url.searchParams.set("next", "/admin/subscribers");
    return NextResponse.redirect(url, { status: 307 });
  }

  const statusParam = req.nextUrl.searchParams.get("status") ?? "all";
  const status: StatusFilter = (VALID as string[]).includes(statusParam)
    ? (statusParam as StatusFilter)
    : "all";

  const baseSelect = db
    .select({
      email: emailSubscribers.email,
      source: emailSubscribers.source,
      status: emailSubscribers.status,
      subscribedAt: emailSubscribers.subscribedAt,
      unsubscribedAt: emailSubscribers.unsubscribedAt,
    })
    .from(emailSubscribers);

  const rows =
    status === "all"
      ? await baseSelect.orderBy(desc(emailSubscribers.subscribedAt))
      : await baseSelect
          .where(eq(emailSubscribers.status, status))
          .orderBy(desc(emailSubscribers.subscribedAt));

  const header = "email,source,status,subscribed_at,unsubscribed_at\n";
  const body = rows
    .map(
      (r) =>
        [
          escapeCsv(r.email),
          escapeCsv(r.source),
          escapeCsv(r.status),
          escapeCsv(fmtIso(r.subscribedAt)),
          escapeCsv(fmtIso(r.unsubscribedAt)),
        ].join(",") + "\n",
    )
    .join("");

  const date = new Date().toISOString().slice(0, 10);
  const filename = `subscribers-${status}-${date}.csv`;

  return new NextResponse(header + body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
