"use server";

/**
 * Server actions for sending transactional emails triggered by various
 * user actions. Each email send is wrapped in try/catch so failures don't
 * block the primary flow (T-05-06-email-fire-and-forget).
 */

import "server-only";
import { renderTemplate } from "@/lib/email/templates";
import { sendMail } from "@/lib/mailer";

// ============================================================================
// Welcome Email (after signup)
// ============================================================================

export async function sendWelcomeEmail(
  customerEmail: string,
  customerName: string
): Promise<void> {
  try {
    const { subject, html, text } = await renderTemplate("welcome", {
      customer_name: customerName,
      store_name: "3D Ninjaz",
      store_url: "https://app.3dninjaz.com",
      current_year: new Date().getFullYear(),
      shop_link: "https://app.3dninjaz.com/shop",
    });

    await sendMail({
      to: customerEmail,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error(
      "[sendWelcomeEmail] Failed to send welcome email to",
      customerEmail,
      err
    );
    // Don't throw — welcome email failure should not block signup
  }
}

// ============================================================================
// Password Changed Email
// ============================================================================

export async function sendPasswordChangedEmail(
  customerEmail: string,
  customerName: string
): Promise<void> {
  try {
    const { subject, html, text } = await renderTemplate(
      "password_changed",
      {
        customer_name: customerName,
        store_name: "3D Ninjaz",
        store_url: "https://app.3dninjaz.com",
        current_year: new Date().getFullYear(),
        support_email: "support@3dninjaz.com",
      }
    );

    await sendMail({
      to: customerEmail,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error(
      "[sendPasswordChangedEmail] Failed to send to",
      customerEmail,
      err
    );
  }
}

// ============================================================================
// Newsletter Welcome Email
// ============================================================================

export async function sendNewsletterWelcomeEmail(
  subscriberEmail: string,
  unsubscribeToken: string
): Promise<void> {
  try {
    const unsubscribeLink = `https://app.3dninjaz.com/api/unsubscribe?token=${unsubscribeToken}`;

    const { subject, html, text } = await renderTemplate(
      "newsletter_welcome",
      {
        subscriber_email: subscriberEmail,
        store_name: "3D Ninjaz",
        store_url: "https://app.3dninjaz.com",
        current_year: new Date().getFullYear(),
        unsubscribe_link: unsubscribeLink,
      }
    );

    await sendMail({
      to: subscriberEmail,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error(
      "[sendNewsletterWelcomeEmail] Failed to send to",
      subscriberEmail,
      err
    );
  }
}

// ============================================================================
// Newsletter Unsubscribed Confirmation
// ============================================================================

export async function sendNewsletterUnsubscribedEmail(
  subscriberEmail: string
): Promise<void> {
  try {
    const { subject, html, text } = await renderTemplate(
      "newsletter_unsubscribed",
      {
        subscriber_email: subscriberEmail,
        store_name: "3D Ninjaz",
        store_url: "https://app.3dninjaz.com",
        current_year: new Date().getFullYear(),
      }
    );

    await sendMail({
      to: subscriberEmail,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error(
      "[sendNewsletterUnsubscribedEmail] Failed to send to",
      subscriberEmail,
      err
    );
  }
}

// ============================================================================
// Order Processing Email (admin transitions order to "processing")
// ============================================================================

export async function sendOrderProcessingEmail(opts: {
  customerEmail: string;
  customerName: string;
  orderNumber: string;
  orderId: string;
}): Promise<void> {
  // Skip internal/sentinel addresses used during development/seeding.
  if (opts.customerEmail.endsWith("@3dninjaz.local")) return;

  try {
    const orderUrl = `https://app.3dninjaz.com/orders/${opts.orderId}`;

    const { subject, html, text } = await renderTemplate("order_processing", {
      customer_name: opts.customerName,
      order_number: opts.orderNumber,
      order_url: orderUrl,
    });

    await sendMail({
      to: opts.customerEmail,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error(
      "[sendOrderProcessingEmail] Failed to send to",
      opts.customerEmail,
      err
    );
  }
}

// ============================================================================
// Order Shipped Email
// ============================================================================

export async function sendOrderShippedEmail(opts: {
  customerEmail: string;
  customerName: string;
  orderNumber: string;
  courierName: string;
  trackingNo: string;
  consignmentNo: string;
  orderId: string;
}): Promise<void> {
  try {
    const trackingLink = `https://app.3dninjaz.com/orders/${opts.orderId}`;
    const orderLink = `https://app.3dninjaz.com/orders/${opts.orderId}`;

    const { subject, html, text } = await renderTemplate("order_shipped", {
      customer_name: opts.customerName,
      order_number: opts.orderNumber,
      courier_name: opts.courierName,
      tracking_no: opts.trackingNo,
      consignment_no: opts.consignmentNo,
      tracking_link: trackingLink,
      order_link: orderLink,
      store_name: "3D Ninjaz",
      store_url: "https://app.3dninjaz.com",
      current_year: new Date().getFullYear(),
    });

    await sendMail({
      to: opts.customerEmail,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error(
      "[sendOrderShippedEmail] Failed to send to",
      opts.customerEmail,
      err
    );
  }
}

// ============================================================================
// Order Delivered Email
// ============================================================================

export async function sendOrderDeliveredEmail(opts: {
  customerEmail: string;
  customerName: string;
  orderNumber: string;
  orderId: string;
}): Promise<void> {
  try {
    const orderLink = `https://app.3dninjaz.com/orders/${opts.orderId}`;

    const { subject, html, text } = await renderTemplate("order_delivered", {
      customer_name: opts.customerName,
      order_number: opts.orderNumber,
      order_link: orderLink,
      store_name: "3D Ninjaz",
      store_url: "https://app.3dninjaz.com",
      current_year: new Date().getFullYear(),
    });

    await sendMail({
      to: opts.customerEmail,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error(
      "[sendOrderDeliveredEmail] Failed to send to",
      opts.customerEmail,
      err
    );
  }
}

// ============================================================================
// Order Refunded Email
// ============================================================================

export async function sendOrderRefundedEmail(opts: {
  customerEmail: string;
  customerName: string;
  orderNumber: string;
  refundAmount: string;
  orderId: string;
}): Promise<void> {
  try {
    const orderLink = `https://app.3dninjaz.com/orders/${opts.orderId}`;

    const { subject, html, text } = await renderTemplate("order_refunded", {
      customer_name: opts.customerName,
      order_number: opts.orderNumber,
      refund_amount: opts.refundAmount,
      order_link: orderLink,
      support_email: "support@3dninjaz.com",
      store_name: "3D Ninjaz",
      store_url: "https://app.3dninjaz.com",
      current_year: new Date().getFullYear(),
    });

    await sendMail({
      to: opts.customerEmail,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error(
      "[sendOrderRefundedEmail] Failed to send to",
      opts.customerEmail,
      err
    );
  }
}

// ============================================================================
// Order Cancelled Email
// ============================================================================

export async function sendOrderCancelledEmail(opts: {
  customerEmail: string;
  customerName: string;
  orderNumber: string;
  cancellationReason: string;
  orderId: string;
}): Promise<void> {
  try {
    const orderLink = `https://app.3dninjaz.com/orders/${opts.orderId}`;

    const { subject, html, text } = await renderTemplate("order_cancelled", {
      customer_name: opts.customerName,
      order_number: opts.orderNumber,
      cancellation_reason: opts.cancellationReason,
      order_link: orderLink,
      support_email: "support@3dninjaz.com",
      store_name: "3D Ninjaz",
      store_url: "https://app.3dninjaz.com",
      current_year: new Date().getFullYear(),
    });

    await sendMail({
      to: opts.customerEmail,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error(
      "[sendOrderCancelledEmail] Failed to send to",
      opts.customerEmail,
      err
    );
  }
}

// ============================================================================
// 260601-afs — Return-for-Replacement Process Emails
// All fire-and-forget (skip @3dninjaz.local). The requestId/orderId are used
// to look up the customer email from the orders table so no PII is passed in.
// ============================================================================

/**
 * Fetch the customer email + name + order number for a return request.
 * Used by all return email senders to avoid threading PII through action args.
 */
async function fetchReturnEmailContext(opts: {
  requestId: string;
  orderId: string;
}): Promise<{
  customerEmail: string;
  customerName: string;
  orderNumber: string;
} | null> {
  // Inline import avoids circular dependency (send-emails.ts -> db is fine;
  // db -> send-emails must never happen).
  const { db } = await import("@/lib/db");
  const { orders, user } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const { formatOrderNumber } = await import("@/lib/orders");

  const [order] = await db
    .select({
      id: orders.id,
      customerEmail: orders.customerEmail,
      userId: orders.userId,
    })
    .from(orders)
    .where(eq(orders.id, opts.orderId))
    .limit(1);
  if (!order) return null;

  let customerName = "Customer";
  if (order.userId) {
    const [u] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, order.userId))
      .limit(1);
    if (u?.name) customerName = u.name;
  }

  return {
    customerEmail: order.customerEmail,
    customerName,
    orderNumber: formatOrderNumber(order.id),
  };
}

// TODO: Replace with store_settings.returnAddress when that field is added.
const RETURN_ADDRESS_FOR_EMAIL =
  "Please contact support@3dninjaz.com for the current return address.";

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function sendReturnRequestedEmail(opts: {
  requestId: string;
  orderId: string;
}): Promise<void> {
  const ctx = await fetchReturnEmailContext(opts).catch(() => null);
  if (!ctx) return;
  if (ctx.customerEmail.endsWith("@3dninjaz.local")) return;

  try {
    const orderLink = `https://app.3dninjaz.com/orders/${opts.orderId}`;
    const { subject, html, text } = await renderTemplate("return_requested", {
      customer_name: ctx.customerName,
      order_number: ctx.orderNumber,
      order_link: orderLink,
    });
    await sendMail({ to: ctx.customerEmail, subject, html, text });
  } catch (err) {
    console.error("[sendReturnRequestedEmail] failed", err);
  }
}

export async function sendReturnApprovedEmail(opts: {
  requestId: string;
  orderId: string;
}): Promise<void> {
  // Fetch approvedAt from the request row to compute ship-by date
  let approvedAt: Date | null = null;
  try {
    const { db } = await import("@/lib/db");
    const { orderRequests } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const [req] = await db
      .select({ approvedAt: orderRequests.approvedAt })
      .from(orderRequests)
      .where(eq(orderRequests.id, opts.requestId))
      .limit(1);
    approvedAt = req?.approvedAt ?? null;
  } catch {
    // non-fatal
  }

  const ctx = await fetchReturnEmailContext(opts).catch(() => null);
  if (!ctx) return;
  if (ctx.customerEmail.endsWith("@3dninjaz.local")) return;

  try {
    const orderLink = `https://app.3dninjaz.com/orders/${opts.orderId}`;
    const shipByDate = approvedAt
      ? addDays(approvedAt, 3).toLocaleDateString("en-MY", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "within 3 days";

    const { subject, html, text } = await renderTemplate("return_approved", {
      customer_name: ctx.customerName,
      order_number: ctx.orderNumber,
      ship_by_date: shipByDate,
      return_address: RETURN_ADDRESS_FOR_EMAIL,
      order_link: orderLink,
    });
    await sendMail({ to: ctx.customerEmail, subject, html, text });
  } catch (err) {
    console.error("[sendReturnApprovedEmail] failed", err);
  }
}

export async function sendReturnRejectedEmail(opts: {
  requestId: string;
  orderId: string;
  reason: string;
}): Promise<void> {
  const ctx = await fetchReturnEmailContext(opts).catch(() => null);
  if (!ctx) return;
  if (ctx.customerEmail.endsWith("@3dninjaz.local")) return;

  try {
    const orderLink = `https://app.3dninjaz.com/orders/${opts.orderId}`;
    const { subject, html, text } = await renderTemplate("return_rejected", {
      customer_name: ctx.customerName,
      order_number: ctx.orderNumber,
      reason: opts.reason,
      order_link: orderLink,
    });
    await sendMail({ to: ctx.customerEmail, subject, html, text });
  } catch (err) {
    console.error("[sendReturnRejectedEmail] failed", err);
  }
}

export async function sendReturnReceivedEmail(opts: {
  requestId: string;
  orderId: string;
}): Promise<void> {
  const ctx = await fetchReturnEmailContext(opts).catch(() => null);
  if (!ctx) return;
  if (ctx.customerEmail.endsWith("@3dninjaz.local")) return;

  try {
    const orderLink = `https://app.3dninjaz.com/orders/${opts.orderId}`;
    const { subject, html, text } = await renderTemplate("return_received", {
      customer_name: ctx.customerName,
      order_number: ctx.orderNumber,
      order_link: orderLink,
    });
    await sendMail({ to: ctx.customerEmail, subject, html, text });
  } catch (err) {
    console.error("[sendReturnReceivedEmail] failed", err);
  }
}

export async function sendReturnExpiredEmail(opts: {
  requestId: string;
  orderId: string;
}): Promise<void> {
  if (!opts.orderId) return; // guard: expireStaleReturns may call with empty orderId
  const ctx = await fetchReturnEmailContext(opts).catch(() => null);
  if (!ctx) return;
  if (ctx.customerEmail.endsWith("@3dninjaz.local")) return;

  try {
    const orderLink = `https://app.3dninjaz.com/orders/${opts.orderId}`;
    const { subject, html, text } = await renderTemplate("return_expired", {
      customer_name: ctx.customerName,
      order_number: ctx.orderNumber,
      order_link: orderLink,
    });
    await sendMail({ to: ctx.customerEmail, subject, html, text });
  } catch (err) {
    console.error("[sendReturnExpiredEmail] failed", err);
  }
}

// ============================================================================
// Dispute Opened Emails (customer + admin)
// ============================================================================

export async function sendDisputeOpenedCustomerEmail(opts: {
  customerEmail: string;
  customerName: string;
  orderNumber: string;
  disputeReason: string;
  orderId: string;
}): Promise<void> {
  try {
    const orderLink = `https://app.3dninjaz.com/orders/${opts.orderId}`;

    const { subject, html, text } = await renderTemplate(
      "dispute_opened_customer",
      {
        customer_name: opts.customerName,
        order_number: opts.orderNumber,
        dispute_reason: opts.disputeReason,
        order_link: orderLink,
        support_email: "support@3dninjaz.com",
        store_name: "3D Ninjaz",
        store_url: "https://app.3dninjaz.com",
        current_year: new Date().getFullYear(),
      }
    );

    await sendMail({
      to: opts.customerEmail,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error(
      "[sendDisputeOpenedCustomerEmail] Failed to send to",
      opts.customerEmail,
      err
    );
  }
}

export async function sendDisputeOpenedAdminEmail(opts: {
  adminEmail: string;
  customerName: string;
  orderNumber: string;
  disputeReason: string;
  disputeAmount: string;
  disputeId: string;
}): Promise<void> {
  try {
    const adminLink = `https://app.3dninjaz.com/admin/disputes/${opts.disputeId}`;

    const { subject, html, text } = await renderTemplate(
      "dispute_opened_admin",
      {
        customer_name: opts.customerName,
        order_number: opts.orderNumber,
        dispute_reason: opts.disputeReason,
        dispute_amount: opts.disputeAmount,
        admin_link: adminLink,
        store_name: "3D Ninjaz",
        current_year: new Date().getFullYear(),
      }
    );

    await sendMail({
      to: opts.adminEmail,
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error(
      "[sendDisputeOpenedAdminEmail] Failed to send to",
      opts.adminEmail,
      err
    );
  }
}
