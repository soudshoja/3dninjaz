import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
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

// Brand palette (kept inline so this route has no client/style imports).
const INK = "#0B1020";
const BLUE = "#0080ff";
const CREAM = "#F7FAF4";

/**
 * Branded, friendly error page rendered in the new tab the admin opened for
 * the label PDF. We deliberately:
 *   - never expose the upstream courier-aggregator vendor name, and
 *   - return HTTP 200 so the LiteSpeed/Apache `ErrorDocument` rules (which
 *     intercept 5xx with static pages — see DEPLOY-NOTES) do not swallow this
 *     body. The message itself makes the failure clear to the admin.
 */
function labelErrorPage(
  title: string,
  message: string,
  trackUrl: string | null,
): NextResponse {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const trackBtn = trackUrl
    ? `<a class="btn" href="${escapeHtml(trackUrl)}" target="_blank" rel="noreferrer">Track parcel</a>`
    : "";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${safeTitle}</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    background:${CREAM}; color:${INK};
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .card { max-width:30rem; margin:1.5rem; padding:2rem; background:#fff; border-radius:1rem;
    box-shadow:0 10px 30px rgba(11,16,32,.08); text-align:center; }
  h1 { font-size:1.4rem; margin:0 0 .75rem; }
  p { color:#475569; line-height:1.55; margin:0 0 1.25rem; }
  .btn { display:inline-block; padding:.6rem 1.25rem; border-radius:999px; font-weight:700;
    text-decoration:none; color:#fff; background:${BLUE}; }
  .hint { font-size:.8rem; color:#94a3b8; margin-top:1rem; }
</style>
</head>
<body>
  <div class="card">
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
    ${trackBtn}
    <p class="hint">You can close this tab and return to the order.</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { db } = await requireAdmin();
  const { id } = await ctx.params;

  const s = await db
    .select()
    .from(orderShipments)
    .where(eq(orderShipments.orderId, id))
    .limit(1);
  if (s.length === 0 || !s[0].delyvaOrderId) {
    return labelErrorPage(
      "No label yet",
      "No shipping label is available for this order yet. Book a courier first, then try printing again.",
      null,
    );
  }

  const consignmentNo = s[0].consignmentNo;
  const trackUrl = consignmentNo
    ? `https://my.delyva.app/customer/strack?trackingNo=${encodeURIComponent(consignmentNo)}`
    : null;

  const base = process.env.DELYVA_BASE_URL ?? "https://api.delyva.app/v1.0";
  const key = process.env.DELYVA_API_KEY ?? "";
  if (!key) {
    return labelErrorPage(
      "Label unavailable",
      "The shipping label service isn't configured right now. Please contact the site administrator.",
      trackUrl,
    );
  }

  const upstream = await fetch(`${base}/order/${s[0].delyvaOrderId}/label`, {
    headers: { "X-Delyvax-Access-Token": key },
    cache: "no-store",
  });

  if (!upstream.ok) {
    // Parse the upstream body to detect the "already collected — cannot
    // re-print" case and surface a friendly, vendor-neutral message.
    const raw = await upstream.text().catch(() => "");
    let upstreamMsg = "";
    try {
      const parsed = JSON.parse(raw) as {
        error?: { message?: string };
        message?: string;
      };
      upstreamMsg = parsed.error?.message ?? parsed.message ?? "";
    } catch {
      upstreamMsg = raw;
    }

    const collected = /already collected|re-?print|cannot.*print/i.test(
      upstreamMsg,
    );
    if (collected) {
      return labelErrorPage(
        "Label can't be reprinted",
        "This parcel has already been collected by the courier, so its shipping label can no longer be printed. Use the tracking link below to follow the delivery.",
        trackUrl,
      );
    }

    return labelErrorPage(
      "Couldn't generate label",
      "We couldn't generate the shipping label right now. Please try again in a moment.",
      trackUrl,
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
