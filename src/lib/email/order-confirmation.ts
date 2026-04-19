import "server-only";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendMail } from "@/lib/mailer";
import { formatOrderNumber } from "@/lib/orders";

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

function baseUrl(): string {
  return (
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "http://localhost:3000"
  );
}

type OrderWithItems = typeof orders.$inferSelect & {
  items: Array<{
    productName: string;
    size: "S" | "M" | "L";
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

export function renderOrderConfirmationHtml(order: OrderWithItems): string {
  const orderNo = formatOrderNumber(order.id);
  const orderUrl = `${baseUrl()}/orders/${order.id}`;

  const itemsHtml = order.items
    .map(
      (i) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee;">
          <strong>${escapeHtml(i.productName)}</strong><br>
          <span style="color:#666;font-size:13px;">Size ${escapeHtml(i.size)} &middot; Qty ${i.quantity}</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">
          ${formatMYRServer(i.lineTotal)}
        </td>
      </tr>
    `,
    )
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

export function renderOrderConfirmationText(order: OrderWithItems): string {
  const lines: string[] = [];
  lines.push(`3D Ninjaz — Order ${formatOrderNumber(order.id)}`);
  lines.push("");
  lines.push(`Thanks for your order. Payment confirmed.`);
  lines.push("");
  lines.push(`Placed: ${new Date(order.createdAt).toLocaleString("en-MY")}`);
  lines.push("");
  lines.push("Items:");
  for (const i of order.items) {
    lines.push(
      `  - ${i.productName} (Size ${i.size}) x${i.quantity} — ${formatMYRServer(i.lineTotal)}`,
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
  lines.push(`View online: ${baseUrl()}/orders/${order.id}`);
  lines.push("");
  lines.push("Questions? Reply to this email.");
  return lines.join("\n");
}

/**
 * Send the confirmation email for a paid order. Loads the order + items from
 * the DB, early-returns if not paid, and swallows SMTP failures so the caller
 * (capturePayPalOrder) is never blocked on email delivery (T-03-26).
 */
export async function sendOrderConfirmationEmail(orderId: string): Promise<void> {
  const row = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: { items: true },
  });
  if (!row) {
    console.error("[order-email] order not found:", orderId);
    return;
  }
  if (row.status !== "paid") {
    console.warn(`[order-email] skipping send for non-paid order ${orderId}`);
    return;
  }

  const subject = `3D Ninjaz — Order ${formatOrderNumber(row.id)} confirmed`;
  const html = renderOrderConfirmationHtml(row);
  const text = renderOrderConfirmationText(row);

  try {
    await sendMail({ to: row.customerEmail, subject, html, text });
  } catch (err) {
    // Do NOT throw. The payment has already succeeded; email failure should
    // surface as a log only. The user can still view the order online and the
    // "Resend receipt" button offers a retry path.
    console.error("[order-email] send failed:", err);
  }
}
