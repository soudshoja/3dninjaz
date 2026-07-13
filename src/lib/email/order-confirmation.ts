import "server-only";
import { orders, orderItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendMail } from "@/lib/mailer";
import { formatOrderNumber, isManualLine } from "@/lib/orders";
import { ensureOrderItemConfigData } from "@/lib/config-fields";
import { getTenantContext } from "@/lib/tenant/context";
import type { TenantDb } from "@/lib/tenant/pool-manager";
import type { Tenant } from "@/lib/tenant/platform-schema";
import { publicOrigin } from "@/lib/public-url";

/**
 * Order confirmation email (HTML + plain-text).
 *
 * CONTRACT (D3-15, T-03-23, T-03-25):
 *  - Addressed to `orders.customerEmail` on the order row, NOT the current
 *    session's email. The snapshot survives account deletion (PDPA, D3-23)
 *    and prevents resend redirection to a different mailbox.
 *  - Every user-controlled string snapshotted on the order row is passed
 *    through `escapeHtml()` before inlining into the HTML template.
 *  - Only runs for rows where `status === "paid"` — guards against accidental
 *    re-sends for pending orders.
 *  - Fire-and-forget from the caller's POV: failures are logged, never thrown
 *    (T-03-26 — SMTP outage must not block the capture flow).
 */

function formatMYRServer(n: string | number): string {
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (!Number.isFinite(v)) return "RM 0.00";
  return `RM ${v.toFixed(2)}`;
}

/**
 * Phase 24 (24-05 / SC5 — B1 outbound URL): a non-"single" registry-mode
 * tenant's order-confirmation links derive from its registry canonical
 * domain (publicOrigin(tenant)), NEVER the incoming Host header. When no
 * tenant is resolved, or the tenant is the synthesized "single" tenant, this
 * keeps today's exact env-driven chain — byte-identical single-mode output
 * (mirrors resolveBaseUrl(tenant) in sitemap.ts/robots.ts, 24-04).
 */
function baseUrl(tenant?: Tenant): string {
  if (tenant && process.env.TENANT_MODE === "registry" && tenant.id !== "single") {
    return publicOrigin(tenant);
  }
  return (
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "http://localhost:3000"
  );
}

// The inferred type now includes guestAccessToken and nullable userId from schema.
type OrderWithItems = typeof orders.$inferSelect & {
  items: Array<{
    productId: string;             // Phase 20 (20-13) — D-08 isManualLine guard
    variantId: string;             // Phase 20 (20-13) — D-08 isManualLine guard
    productName: string;
    size: string | null;
    variantLabel?: string | null;
    configurationData?: string | null; // Phase 19 (19-09) — raw LONGTEXT JSON
    quantity: number;
    unitPrice: string;
    lineTotal: string;
    productImage: string | null;
  }>;
};

/**
 * Escape HTML-significant characters in a string. Every snapshot field that
 * originated from a user-controlled input MUST pass through this before being
 * inlined into the HTML body (T-03-25).
 */
function escapeHtml(s: string | null | undefined): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ] as string)),
  );
}

export function renderOrderConfirmationHtml(order: OrderWithItems, tenant?: Tenant): string {
  const orderNo = formatOrderNumber(order.id);
  // Guest orders carry a guestAccessToken; authenticated orders use a plain URL.
  const orderUrl = (order.guestAccessToken && !order.userId)
    ? `${baseUrl(tenant)}/orders/${order.id}?t=${order.guestAccessToken}`
    : `${baseUrl(tenant)}/orders/${order.id}`;

  const itemsHtml = order.items
    .map((i) => {
      // D-08 (Phase 20): manual lines have no variant/config — render name + qty only.
      // No product link in email HTML (email items never linked anyway).
      if (isManualLine(i)) {
        return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee;">
          <strong>${escapeHtml(i.productName)}</strong><br>
          <span style="color:#666;font-size:13px;">Qty ${i.quantity}</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">
          ${formatMYRServer(i.lineTotal)}
        </td>
      </tr>
    `;
      }
      const cfg = ensureOrderItemConfigData(i.configurationData);
      const summary = cfg?.computedSummary ?? i.variantLabel ?? (i.size ? `Size ${i.size}` : "");
      return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee;">
          <strong>${escapeHtml(i.productName)}</strong><br>
          <span style="color:#666;font-size:13px;">${escapeHtml(summary)} &middot; Qty ${i.quantity}</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">
          ${formatMYRServer(i.lineTotal)}
        </td>
      </tr>
    `;
    })
    .join("");

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#F7FAF4;color:#0B1020;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="text-align:center;padding:16px 0;">
      <h1 style="margin:0;font-size:24px;color:#0B1020;">Your 3D Ninjaz drop is on its way.</h1>
    </div>

    <p>Thanks for your order! Your payment has been confirmed. Here's the lowdown:</p>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:16px;">
      <tr>
        <td style="padding:8px 0;color:#666;">Order number</td>
        <td style="padding:8px 0;text-align:right;font-weight:bold;">${orderNo}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#666;">Placed</td>
        <td style="padding:8px 0;text-align:right;">${escapeHtml(new Date(order.createdAt).toLocaleString("en-MY"))}</td>
      </tr>
      ${order.paypalCaptureId ? `
      <tr>
        <td style="padding:8px 0;color:#666;">Payment reference</td>
        <td style="padding:8px 0;text-align:right;font-family:monospace;word-break:break-word;">${escapeHtml(order.paypalCaptureId)}</td>
      </tr>` : ""}
    </table>

    <h2 style="margin:24px 0 8px;font-size:18px;">Items</h2>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      ${itemsHtml}
    </table>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:16px;">
      <tr>
        <td style="padding:6px 0;color:#666;">Subtotal</td>
        <td style="padding:6px 0;text-align:right;">${formatMYRServer(order.subtotal)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#666;">Shipping</td>
        <td style="padding:6px 0;text-align:right;">${formatMYRServer(order.shippingCost)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-top:2px solid #0B1020;font-weight:bold;">Total</td>
        <td style="padding:10px 0;border-top:2px solid #0B1020;text-align:right;font-weight:bold;font-size:18px;">
          ${formatMYRServer(order.totalAmount)} ${escapeHtml(order.currency)}
        </td>
      </tr>
    </table>

    <h2 style="margin:24px 0 8px;font-size:18px;">Ship to</h2>
    <p style="margin:0;line-height:1.5;">
      ${escapeHtml(order.shippingName)}<br>
      ${escapeHtml(order.shippingLine1)}<br>
      ${order.shippingLine2 ? escapeHtml(order.shippingLine2) + "<br>" : ""}
      ${escapeHtml(order.shippingCity)} ${escapeHtml(order.shippingPostcode)}<br>
      ${escapeHtml(order.shippingState)}, ${escapeHtml(order.shippingCountry)}<br>
      ${escapeHtml(order.shippingPhone)}
    </p>

    <div style="text-align:center;margin:32px 0;">
      <a href="${orderUrl}" style="display:inline-block;padding:14px 28px;background:#0B1020;color:#fff;border-radius:999px;text-decoration:none;font-weight:bold;">
        View order online
      </a>
    </div>

    <p style="color:#666;font-size:13px;text-align:center;margin-top:32px;">
      Questions? Reply to this email &mdash; a human reads every message.<br>
      3D Ninjaz &middot; Kuala Lumpur, Malaysia
    </p>
  </div>
</body>
</html>`;
}

export function renderOrderConfirmationText(order: OrderWithItems, tenant?: Tenant): string {
  const lines: string[] = [];
  lines.push(`3D Ninjaz — Order ${formatOrderNumber(order.id)}`);
  lines.push("");
  lines.push(`Thanks for your order. Payment confirmed.`);
  lines.push("");
  lines.push(`Placed: ${new Date(order.createdAt).toLocaleString("en-MY")}`);
  if (order.paypalCaptureId) {
    lines.push(`Payment reference: ${order.paypalCaptureId}`);
  }
  lines.push("");
  lines.push("Items:");
  for (const i of order.items) {
    // D-08 (Phase 20): manual lines have no variant/config data
    if (isManualLine(i)) {
      lines.push(`  - ${i.productName} x${i.quantity} — ${formatMYRServer(i.lineTotal)}`);
      continue;
    }
    const cfg = ensureOrderItemConfigData(i.configurationData);
    const summary = cfg?.computedSummary ?? i.variantLabel ?? (i.size ? `Size ${i.size}` : null);
    lines.push(
      `  - ${i.productName}${summary ? ` — ${summary}` : ""} x${i.quantity} — ${formatMYRServer(i.lineTotal)}`,
    );
  }
  lines.push("");
  lines.push(`Subtotal: ${formatMYRServer(order.subtotal)}`);
  lines.push(`Shipping: ${formatMYRServer(order.shippingCost)}`);
  lines.push(`Total:    ${formatMYRServer(order.totalAmount)} ${order.currency}`);
  lines.push("");
  lines.push("Ship to:");
  lines.push(`  ${order.shippingName}`);
  lines.push(`  ${order.shippingLine1}`);
  if (order.shippingLine2) lines.push(`  ${order.shippingLine2}`);
  lines.push(`  ${order.shippingCity} ${order.shippingPostcode}`);
  lines.push(`  ${order.shippingState}, ${order.shippingCountry}`);
  lines.push(`  ${order.shippingPhone}`);
  lines.push("");
  const textOrderUrl = (order.guestAccessToken && !order.userId)
    ? `${baseUrl(tenant)}/orders/${order.id}?t=${order.guestAccessToken}`
    : `${baseUrl(tenant)}/orders/${order.id}`;
  lines.push(`View online: ${textOrderUrl}`);
  lines.push("");
  lines.push("Questions? Reply to this email.");
  return lines.join("\n");
}

/**
 * Pre-render the items table as a sanitised HTML fragment. Used as the
 * `items_table` template variable (HTML_VARS — bypasses HTML-escape but
 * still passes through DOMPurify for safety).
 */
function renderItemsTableFragment(order: OrderWithItems): string {
  return order.items
    .map((i) => {
      // D-08 (Phase 20): manual lines have no variant/config — render name + qty only.
      if (isManualLine(i)) {
        return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee;">
          <strong>${escapeHtml(i.productName)}</strong><br>
          <span style="color:#666;font-size:13px;">Qty ${i.quantity}</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">
          ${formatMYRServer(i.lineTotal)}
        </td>
      </tr>
    `;
      }
      const cfg = ensureOrderItemConfigData(i.configurationData);
      const summary = cfg?.computedSummary ?? i.variantLabel ?? (i.size ? `Size ${i.size}` : "");
      return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee;">
          <strong>${escapeHtml(i.productName)}</strong><br>
          <span style="color:#666;font-size:13px;">${escapeHtml(summary)} &middot; Qty ${i.quantity}</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">
          ${formatMYRServer(i.lineTotal)}
        </td>
      </tr>
    `;
    })
    .join("");
}

/**
 * Send the confirmation email for a paid order. Loads the order + items from
 * the DB, early-returns if not paid, and swallows SMTP failures so the caller
 * (capturePayPalOrder) is never blocked on email delivery (T-03-26).
 *
 * Plan 05-06: now reads the template subject + HTML body from the DB-backed
 * `email_templates` table via renderTemplate. The legacy renderOrderConfirmationHtml
 * is kept as a fallback used by the plain-text rendering and the "Resend
 * receipt" path; once 05-06 is verified in production we can drop the
 * fallback entirely.
 */
export async function sendOrderConfirmationEmail(
  orderId: string,
  db?: TenantDb,
): Promise<void> {
  const { tenant, db: ctxDb } = await getTenantContext();
  db ??= ctxDb;
  // Manual two-query hydration — MariaDB 10.11 does not support the LATERAL
  // joins Drizzle emits for db.query.*.findFirst({ with: { items: true } }).
  const orderHead = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (orderHead.length === 0) {
    console.error("[order-email] order not found:", orderId);
    return;
  }
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderHead[0].id));
  const row = { ...orderHead[0], items };
  if (row.status !== "paid") {
    console.warn(`[order-email] skipping send for non-paid order ${orderId}`);
    return;
  }

  // Plan 05-06: render via DB template. Variables map mirrors
  // availableVariables.order_confirmation in src/lib/email/templates.ts.
  let subject: string;
  let html: string;
  let text: string;
  try {
    const { renderTemplate } = await import("@/lib/email/templates");
    // Build the order link: guest orders include the access token so the
    // recipient can view without logging in.
    const orderLink = (row.guestAccessToken && !row.userId)
      ? `${baseUrl(tenant)}/orders/${row.id}?t=${row.guestAccessToken}`
      : `${baseUrl(tenant)}/orders/${row.id}`;
    const rendered = await renderTemplate("order_confirmation", {
      customer_name: row.shippingName,
      order_number: formatOrderNumber(row.id),
      order_total: `${formatMYRServer(row.totalAmount)} ${row.currency}`,
      order_link: orderLink,
      items_table: renderItemsTableFragment(row),
      // Optional template variable {{paypal_capture_id}} — empty when the
      // capture id isn't set yet (status !== "paid"); templates that include
      // it can wrap with conditional copy in their HTML.
      paypal_capture_id: row.paypalCaptureId ?? "",
    });
    subject = rendered.subject;
    html = rendered.html;
    text = rendered.text;
  } catch (err) {
    // Fallback to legacy hardcoded template if DB template load fails.
    console.warn(
      "[order-email] DB template render failed, falling back to legacy:",
      err,
    );
    subject = `3D Ninjaz — Order ${formatOrderNumber(row.id)} confirmed`;
    html = renderOrderConfirmationHtml(row, tenant);
    text = renderOrderConfirmationText(row, tenant);
  }

  // Skip the customer send for internal/sentinel addresses (manual/POS orders
  // without a real customer email). The admin notification below still fires.
  if (!row.customerEmail.endsWith("@3dninjaz.local")) {
    try {
      await sendMail({ to: row.customerEmail, subject, html, text, tenant });
    } catch (err) {
      console.error("[order-email] send failed:", err);
    }
  }

  // ── Owner/admin new-order notification ──────────────────────────────────
  // Notify the team on every paid order. Fire-and-forget — must never block
  // or fail the order flow (mirrors the customer-email contract above).
  try {
    const orderNo = formatOrderNumber(row.id);
    const adminSubject = `🛎️ New order ${orderNo} — ${formatMYRServer(row.totalAmount)} ${row.currency}`;
    const adminHtml = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#0B1020;">
      <h2 style="margin:0 0 12px;">New order ${orderNo}</h2>
      <p style="margin:4px 0;"><strong>Customer:</strong> ${escapeHtml(row.shippingName)} (${escapeHtml(row.customerEmail)})</p>
      <p style="margin:4px 0;"><strong>Phone:</strong> ${escapeHtml(row.shippingPhone)}</p>
      <p style="margin:4px 0;"><strong>Total:</strong> ${formatMYRServer(row.totalAmount)} ${escapeHtml(row.currency)}</p>
      <p style="margin:4px 0;"><strong>Placed:</strong> ${escapeHtml(new Date(row.createdAt).toLocaleString("en-MY"))}</p>
      <h3 style="margin:16px 0 4px;">Items</h3>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${renderItemsTableFragment(row)}</table>
      <h3 style="margin:16px 0 4px;">Ship to</h3>
      <p style="margin:0;line-height:1.5;">${escapeHtml(row.shippingName)}<br>${escapeHtml(row.shippingLine1)}<br>${row.shippingLine2 ? escapeHtml(row.shippingLine2) + "<br>" : ""}${escapeHtml(row.shippingCity)} ${escapeHtml(row.shippingPostcode)}<br>${escapeHtml(row.shippingState)}, ${escapeHtml(row.shippingCountry)}</p>
      <p style="margin:20px 0;"><a href="${baseUrl(tenant)}/admin/orders/${row.id}" style="display:inline-block;padding:10px 20px;background:#0B1020;color:#fff;border-radius:8px;text-decoration:none;">Open in admin</a></p>
    </body></html>`;
    const adminText =
      `New order ${orderNo}\n` +
      `Customer: ${row.shippingName} (${row.customerEmail})\n` +
      `Phone: ${row.shippingPhone}\n` +
      `Total: ${formatMYRServer(row.totalAmount)} ${row.currency}\n` +
      `Admin: ${baseUrl(tenant)}/admin/orders/${row.id}`;
    await sendMail({
      to: ["sumaiyaaniz@gmail.com", "info@3dninjaz.com"],
      subject: adminSubject,
      html: adminHtml,
      text: adminText,
      tenant,
    });
  } catch (err) {
    console.error("[order-email] admin notification failed:", err);
  }
}
