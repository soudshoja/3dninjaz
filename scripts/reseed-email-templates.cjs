/* eslint-disable no-console */
/**
 * Reseed all 18 email_templates rows with the neo-brutalist / claymorphism
 * design. Uses INSERT ... ON DUPLICATE KEY UPDATE to force-overwrite
 * html/subject/variables even if rows already exist.
 *
 * Usage:
 *   node scripts/reseed-email-templates.cjs
 *
 * Reads DATABASE_URL (and discrete DB_* fallbacks) from .env.local.
 */
const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");

// ---------------------------------------------------------------------------
// Env loader (same pattern as other phase scripts)
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("ERROR: .env.local not found at", envPath);
    process.exit(1);
  }
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

// ---------------------------------------------------------------------------
// Design helpers (mirrors brandedEmailTemplate in schema.ts)
// ---------------------------------------------------------------------------
function brandedEmailTemplate({ icon, title, subtitle, bodyHtml, cta }) {
  const ctaHtml = cta
    ? `<tr><td align="center" style="padding:0 28px 32px;border-collapse:collapse">
        <a href="{{${cta.url}}}" style="display:inline-block;padding:15px 30px;background:#C7E56B;color:#111111;text-decoration:none;border:3px solid #111111;border-radius:999px;box-shadow:5px 5px 0 #111111;font-size:16px;font-weight:900;letter-spacing:0.3px">${cta.text}</a>
      </td></tr>`
    : "";

  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#D8ECFF;border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <tr>
    <td align="center" style="padding:32px 12px">
      <table role="presentation" cellpadding="0" cellspacing="0" width="640" style="width:100%;max-width:640px;background:#ffffff;border:3px solid #111111;border-radius:26px;box-shadow:8px 8px 0 #111111;border-collapse:collapse">
        <!-- HEADER BAND -->
        <tr>
          <td align="center" style="background:#C7E56B;border-bottom:3px solid #111111;border-radius:23px 23px 0 0;padding:28px 24px 24px;border-collapse:collapse">
            <div style="display:inline-block;background:#ffffff;color:#111111;font-size:13px;font-weight:900;letter-spacing:1px;padding:10px 20px;border:3px solid #111111;border-radius:999px;box-shadow:4px 4px 0 #111111;margin-bottom:16px">3D NINJAZ</div>
            <div style="font-size:42px;line-height:1;margin-bottom:10px">${icon}</div>
            <div style="color:#111111;font-size:32px;font-weight:900;line-height:1.1;margin-bottom:12px">${title}</div>
            <div style="display:inline-block;background:#DCC3F3;color:#111111;border:3px solid #111111;border-radius:999px;font-size:14px;font-weight:800;padding:9px 16px">${subtitle}</div>
          </td>
        </tr>
        <!-- BODY -->
        <tr>
          <td style="padding:34px 28px 24px;border-collapse:collapse">
            ${bodyHtml}
          </td>
        </tr>
        <!-- CTA -->
        ${ctaHtml}
        <!-- HELP STRIP -->
        <tr>
          <td style="padding:0 28px 28px;border-collapse:collapse">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#DCC3F3;border:3px solid #111111;border-radius:18px;border-collapse:collapse">
              <tr>
                <td align="center" style="padding:16px 20px;color:#111111;font-size:14px;font-weight:700;border-collapse:collapse">
                  Need help? Contact us at <a href="mailto:{{support_email}}" style="color:#111111;font-weight:900">{{support_email}}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- FOOTER -->
        <tr>
          <td align="center" style="background:#111111;border-radius:0 0 23px 23px;padding:20px 24px;color:#ffffff;font-size:13px;font-weight:700;border-collapse:collapse">
            © {{current_year}} 3D Ninjaz &nbsp;·&nbsp;
            <a href="https://3dninjaz.com" style="color:#C7E56B;text-decoration:none;font-weight:700">3dninjaz.com</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

const h = (text) =>
  `<p style="font-size:28px;font-weight:900;color:#111111;margin:0 0 14px">${text}</p>`;
const p = (text) =>
  `<p style="font-size:16px;line-height:26px;color:#334155;margin:0 0 12px">${text}</p>`;
const card = (rows) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F8FBFF;border:3px solid #111111;border-radius:20px;box-shadow:5px 5px 0 #DCC3F3;border-collapse:collapse;margin-bottom:20px">${rows}</table>`;
const cardRow = (label, value, last = false) =>
  `<tr><td style="padding:14px 18px;border-collapse:collapse${last ? "" : ";border-bottom:2px dashed #111111"}"><div style="font-size:12px;font-weight:900;letter-spacing:.8px;color:#111111;text-transform:uppercase;margin-bottom:4px">${label}</div><div style="font-size:15px;font-weight:900;color:#111111">${value}</div></td></tr>`;
const link = (href, text) =>
  `<a href="${href}" style="color:#111111;font-weight:900">${text}</a>`;

// ---------------------------------------------------------------------------
// Seed data — mirrors seedEmailTemplates() in src/lib/db/schema.ts exactly
// ---------------------------------------------------------------------------
function buildSeeds() {
  return [
    {
      key: "order_confirmation",
      subject: "Order #{{order_number}} confirmed — thanks from 3D Ninjaz 🥷",
      html: brandedEmailTemplate({
        icon: "✅",
        title: "Order Confirmed!",
        subtitle: "Your 3D Ninjaz order is locked in",
        bodyHtml: `
          ${h("Thanks, {{customer_name}}!")}
          ${p("Your order <strong>#{{order_number}}</strong> has been confirmed and we are getting started right away.")}
          ${card(
            cardRow("Order Number", "#{{order_number}}") +
            cardRow("Order Total", "{{order_total}}", true)
          )}
          <div style="margin-bottom:20px">{{items_table}}</div>
          ${p("We will prepare your 3D printed items and ship them as soon as possible. You will receive a shipping notification the moment it leaves our hands.")}
        `,
        cta: { text: "View Your Order", url: "order_link" },
      }),
      variables: JSON.stringify([
        "customer_name","order_number","order_total","order_link",
        "items_table","store_name","store_url","current_year",
      ]),
    },
    {
      key: "order_processing",
      subject: "Your 3D Ninjaz order is being printed ({{order_number}})",
      html: brandedEmailTemplate({
        icon: "🖨️",
        title: "Printing Your Order!",
        subtitle: "Production is underway",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("Great news — your 3D Ninjaz order <strong>#{{order_number}}</strong> is now in production. Our printers are warming up and your item will be ready to ship soon.")}
          ${p("You can check the latest status anytime on your order page. We will send another notification the moment it ships.")}
        `,
        cta: { text: "View Your Order", url: "order_url" },
      }),
      variables: JSON.stringify(["customer_name","order_number","order_url"]),
    },
    {
      key: "order_shipped",
      subject: "Your 3D Ninjaz order is on its way! ({{courier_name}})",
      html: brandedEmailTemplate({
        icon: "📦",
        title: "Your Order Shipped!",
        subtitle: "On its way to you",
        bodyHtml: `
          ${h("Hey {{customer_name}},")}
          ${p("Your order <strong>#{{order_number}}</strong> has been dispatched and is on its way to you.")}
          ${card(
            cardRow("Courier", "{{courier_name}}") +
            cardRow("Tracking Number", "{{tracking_no}}") +
            cardRow("Consignment No.", "{{consignment_no}}", true)
          )}
          ${p("Click the button below to track your delivery in real-time.")}
        `,
        cta: { text: "Track Package", url: "tracking_link" },
      }),
      variables: JSON.stringify([
        "customer_name","order_number","courier_name","tracking_no",
        "consignment_no","tracking_link","order_link","store_name",
        "store_url","current_year",
      ]),
    },
    {
      key: "order_delivered",
      subject: "Your 3D Ninjaz order has been delivered 🎉",
      html: brandedEmailTemplate({
        icon: "🎉",
        title: "Delivered!",
        subtitle: "Your order has arrived",
        bodyHtml: `
          ${h("Hey {{customer_name}},")}
          ${p("Your order <strong>#{{order_number}}</strong> has been delivered to your doorstep.")}
          ${p("We hope you love your 3D printed items! If anything is not quite right, do not hesitate to reach out — we are always happy to help.")}
        `,
        cta: { text: "View Your Order", url: "order_link" },
      }),
      variables: JSON.stringify([
        "customer_name","order_number","order_link","store_name","store_url","current_year",
      ]),
    },
    {
      key: "order_refunded",
      subject: "Refund processed for order #{{order_number}}",
      html: brandedEmailTemplate({
        icon: "💰",
        title: "Refund Processed",
        subtitle: "Your money is on its way back",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("We have processed a refund for your order.")}
          ${card(
            cardRow("Order Number", "#{{order_number}}") +
            cardRow("Refund Amount", "{{refund_amount}}", true)
          )}
          ${p("The refund should appear in your account within 3–5 business days depending on your payment provider.")}
        `,
        cta: { text: "View Your Order", url: "order_link" },
      }),
      variables: JSON.stringify([
        "customer_name","order_number","refund_amount","order_link",
        "support_email","store_name","store_url","current_year",
      ]),
    },
    {
      key: "order_cancelled",
      subject: "Order #{{order_number}} has been cancelled",
      html: brandedEmailTemplate({
        icon: "❌",
        title: "Order Cancelled",
        subtitle: "Order #{{order_number}}",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("Your order <strong>#{{order_number}}</strong> has been cancelled.")}
          ${card(cardRow("Cancellation Reason", "{{cancellation_reason}}", true))}
          ${p("If this cancellation was unexpected or you have questions, please reach out to us — we are here to help.")}
        `,
        cta: { text: "Contact Support", url: "support_email" },
      }),
      variables: JSON.stringify([
        "customer_name","order_number","cancellation_reason","order_link",
        "support_email","store_name","store_url","current_year",
      ]),
    },
    {
      key: "password_reset",
      subject: "Reset your 3D Ninjaz password",
      html: brandedEmailTemplate({
        icon: "🔑",
        title: "Reset Your Password",
        subtitle: "Action required within 1 hour",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("We received a request to reset your password. Click the button below to create a new password.")}
          ${p("This link expires in <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email — your account is still secure.")}
        `,
        cta: { text: "Reset Password", url: "reset_link" },
      }),
      variables: JSON.stringify([
        "customer_name","reset_link","store_name","store_url","current_year",
      ]),
    },
    {
      key: "password_changed",
      subject: "Your 3D Ninjaz password was changed",
      html: brandedEmailTemplate({
        icon: "🔒",
        title: "Password Updated",
        subtitle: "Your account is secure",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("Your password has been successfully changed.")}
          ${p("If you did not make this change, please contact us immediately — your account security is our top priority.")}
        `,
      }),
      variables: JSON.stringify([
        "customer_name","store_name","store_url","current_year","support_email",
      ]),
    },
    {
      key: "welcome",
      subject: "Welcome to 3D Ninjaz! 🥷",
      html: brandedEmailTemplate({
        icon: "🥷",
        title: "Welcome to 3D Ninjaz!",
        subtitle: "Your account is ready",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("Your account is ready to go. Browse our collection of unique 3D printed items and find something you will love.")}
          ${p("We print every item fresh — crafted just for you. No mass-produced stuff here.")}
        `,
        cta: { text: "Shop Now", url: "shop_link" },
      }),
      variables: JSON.stringify([
        "customer_name","store_name","store_url","current_year","shop_link",
      ]),
    },
    {
      key: "newsletter_welcome",
      subject: "You're in! News from the 3D Ninjaz crew",
      html: brandedEmailTemplate({
        icon: "📬",
        title: "You're Subscribed!",
        subtitle: "Welcome to the crew",
        bodyHtml: `
          ${p("Thanks for subscribing to 3D Ninjaz news.")}
          ${p("You will be the first to hear about new products, exclusive deals, and behind-the-scenes 3D printing stories. Stay tuned!")}
          <p style="font-size:13px;color:#334155;margin-top:20px">${link("{{unsubscribe_link}}", "Unsubscribe anytime")}</p>
        `,
      }),
      variables: JSON.stringify([
        "subscriber_email","store_name","store_url","current_year","unsubscribe_link",
      ]),
    },
    {
      key: "newsletter_unsubscribed",
      subject: "You've been unsubscribed from 3D Ninjaz updates",
      html: brandedEmailTemplate({
        icon: "👋",
        title: "You've Unsubscribed",
        subtitle: "We'll miss you!",
        bodyHtml: `
          ${p("Your email has been removed from our mailing list.")}
          ${p("You will not receive any further marketing emails from us. You can resubscribe anytime from our website if you change your mind.")}
        `,
      }),
      variables: JSON.stringify([
        "subscriber_email","store_name","store_url","current_year",
      ]),
    },
    {
      key: "dispute_opened_customer",
      subject: "Dispute opened for order #{{order_number}}",
      html: brandedEmailTemplate({
        icon: "⚠️",
        title: "Dispute Notification",
        subtitle: "We're looking into it",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("A dispute has been opened on your order <strong>#{{order_number}}</strong>.")}
          ${card(cardRow("Dispute Reason", "{{dispute_reason}}", true))}
          ${p("Our team is investigating and will keep you updated every step of the way. If you have additional details that may help, please reach out to us.")}
        `,
        cta: { text: "View Your Order", url: "order_link" },
      }),
      variables: JSON.stringify([
        "customer_name","order_number","dispute_reason","order_link",
        "support_email","store_name","store_url","current_year",
      ]),
    },
    {
      key: "dispute_opened_admin",
      subject: "ADMIN: Dispute opened on order #{{order_number}}",
      html: brandedEmailTemplate({
        icon: "🚨",
        title: "New Dispute Alert",
        subtitle: "Requires your attention",
        bodyHtml: `
          ${p("A new dispute has been opened and requires your review.")}
          ${card(
            cardRow("Customer", "{{customer_name}}") +
            cardRow("Order Number", "#{{order_number}}") +
            cardRow("Dispute Reason", "{{dispute_reason}}") +
            cardRow("Dispute Amount", "{{dispute_amount}}", true)
          )}
          ${p("Click below to view the full dispute details and respond.")}
        `,
        cta: { text: "Review Dispute", url: "admin_link" },
      }),
      variables: JSON.stringify([
        "customer_name","order_number","dispute_reason","dispute_amount",
        "admin_link","store_name","current_year",
      ]),
    },
    {
      key: "return_requested",
      subject: "Return request received for order #{{order_number}}",
      html: brandedEmailTemplate({
        icon: "📦",
        title: "Return Request Received",
        subtitle: "Under review",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("We have received your return / replacement request for order <strong>#{{order_number}}</strong>.")}
          ${p("Our team will review your request and get back to you within 1 business day. You can track the status of your request on your order page.")}
        `,
        cta: { text: "View Your Order", url: "order_link" },
      }),
      variables: JSON.stringify([
        "customer_name","order_number","order_link","store_name","store_url","current_year",
      ]),
    },
    {
      key: "return_approved",
      subject: "Return approved — ship your item back by {{ship_by_date}}",
      html: brandedEmailTemplate({
        icon: "✅",
        title: "Return Approved!",
        subtitle: "Next step: ship it back",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("Great news! Your return / replacement request for order <strong>#{{order_number}}</strong> has been approved.")}
          ${card(
            cardRow("Ship Back By", "{{ship_by_date}}") +
            cardRow("Return Address", "{{return_address}}", true)
          )}
          ${p("Once you have shipped, please visit your order page to submit your courier name and tracking number so we can confirm receipt and start your re-make.")}
          <p style="font-size:13px;color:#334155;margin:0">If you do not submit tracking within 3 days, the request will expire and you will need to contact support.</p>
        `,
        cta: { text: "Submit Tracking Number", url: "order_link" },
      }),
      variables: JSON.stringify([
        "customer_name","order_number","ship_by_date","return_address",
        "order_link","store_name","store_url","current_year",
      ]),
    },
    {
      key: "return_rejected",
      subject: "Update on your return request — order #{{order_number}}",
      html: brandedEmailTemplate({
        icon: "❌",
        title: "Return Request Update",
        subtitle: "Unable to approve at this time",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("After reviewing your return request for order <strong>#{{order_number}}</strong>, we are unable to approve it at this time.")}
          ${card(cardRow("Reason", "{{reason}}", true))}
          ${p("If you believe this decision was made in error or you need further assistance, please contact us and we will do our best to help.")}
        `,
        cta: { text: "View Your Order", url: "order_link" },
      }),
      variables: JSON.stringify([
        "customer_name","order_number","reason","order_link",
        "support_email","store_name","store_url","current_year",
      ]),
    },
    {
      key: "return_received",
      subject: "We received your return — re-making your order #{{order_number}}",
      html: brandedEmailTemplate({
        icon: "🥷",
        title: "Return Received!",
        subtitle: "Re-make in progress",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("We have received your returned item for order <strong>#{{order_number}}</strong>. Thank you for sending it back!")}
          ${p("Our team is now working on your replacement. We will email you again once it has been shipped.")}
        `,
        cta: { text: "View Your Order", url: "order_link" },
      }),
      variables: JSON.stringify([
        "customer_name","order_number","order_link","store_name","store_url","current_year",
      ]),
    },
    {
      key: "return_expired",
      subject: "Your return window has expired — order #{{order_number}}",
      html: brandedEmailTemplate({
        icon: "⏰",
        title: "Return Window Expired",
        subtitle: "Ship-by deadline passed",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("Unfortunately the 3-day shipping window for your approved return on order <strong>#{{order_number}}</strong> has passed without a tracking number being submitted.")}
          ${p("If you still need help, please contact us or reach out via WhatsApp and we will do our best to assist you.")}
        `,
        cta: { text: "View Your Order", url: "order_link" },
      }),
      variables: JSON.stringify([
        "customer_name","order_number","order_link","support_email",
        "store_name","store_url","current_year",
      ]),
    },
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  loadEnv();

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set in .env.local");
    process.exit(1);
  }

  console.log("Connecting to database...");
  const conn = await mysql.createConnection(url);

  const seeds = buildSeeds();
  console.log(`Upserting ${seeds.length} email templates...`);

  let ok = 0;
  for (const seed of seeds) {
    try {
      await conn.query(
        `INSERT INTO email_templates (id, \`key\`, subject, html, variables, created_at, updated_at)
         VALUES (UUID(), ?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           subject    = VALUES(subject),
           html       = VALUES(html),
           variables  = VALUES(variables),
           updated_at = NOW()`,
        [seed.key, seed.subject, seed.html, seed.variables],
      );
      console.log(`  [ok] ${seed.key}`);
      ok++;
    } catch (err) {
      console.error(`  [FAIL] ${seed.key}:`, err.message);
    }
  }

  await conn.end();
  console.log(`\nDone: ${ok}/${seeds.length} templates upserted.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
