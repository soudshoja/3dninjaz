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
