import "server-only";
import { db } from "@/lib/db";
import {
  emailTemplates,
  seedEmailTemplates,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sanitiseEmailHtml, escapeHtml } from "@/lib/email/sanitize";

// ============================================================================
// Plan 05-06 — DB-backed email template renderer.
//
// Variable substitution rules:
//   - Default: every {{var}} value is HTML-escaped before insertion
//   - HTML_VARS (e.g. "items_table") are sanitised with DOMPurify and
//     inserted as-is (preserves caller-built table markup)
//
// Rendering pipeline:
//   1) Read template row from DB (lazy seed via seedEmailTemplates if missing)
//   2) DOMPurify sanitise the stored HTML once more (defense-in-depth even
//      though save also sanitises)
//   3) Substitute {{var}} placeholders → escapeHtml or sanitiseEmailHtml
//   4) Strip tags for the plain-text fallback (htmlToText)
// ============================================================================

export type TemplateKey =
  | "order_confirmation"
  | "order_shipped"
  | "order_delivered"
  | "order_refunded"
  | "order_cancelled"
  | "password_reset"
  | "password_changed"
  | "welcome"
  | "newsletter_welcome"
  | "newsletter_unsubscribed"
  | "dispute_opened_customer"
  | "dispute_opened_admin";

export const availableVariables: Record<TemplateKey, string[]> = {
  order_confirmation: [
    "customer_name",
    "order_number",
    "order_total",
    "order_link",
    "items_table",
    "paypal_capture_id",
    "store_name",
    "store_url",
    "current_year",
  ],
  order_shipped: [
    "customer_name",
    "order_number",
    "courier_name",
    "tracking_no",
    "consignment_no",
    "tracking_link",
    "order_link",
    "store_name",
    "store_url",
    "current_year",
  ],
  order_delivered: [
    "customer_name",
    "order_number",
    "order_link",
    "store_name",
    "store_url",
    "current_year",
  ],
  order_refunded: [
    "customer_name",
    "order_number",
    "refund_amount",
    "order_link",
    "support_email",
    "store_name",
    "store_url",
    "current_year",
  ],
  order_cancelled: [
    "customer_name",
    "order_number",
    "cancellation_reason",
    "order_link",
    "support_email",
    "store_name",
    "store_url",
    "current_year",
  ],
  password_reset: [
    "customer_name",
    "reset_link",
    "store_name",
    "store_url",
    "current_year",
  ],
  password_changed: [
    "customer_name",
    "store_name",
    "store_url",
    "current_year",
    "support_email",
  ],
  welcome: [
    "customer_name",
    "store_name",
    "store_url",
    "current_year",
    "shop_link",
  ],
  newsletter_welcome: [
    "subscriber_email",
    "store_name",
    "store_url",
    "current_year",
    "unsubscribe_link",
  ],
  newsletter_unsubscribed: [
    "subscriber_email",
    "store_name",
    "store_url",
    "current_year",
  ],
  dispute_opened_customer: [
    "customer_name",
    "order_number",
    "dispute_reason",
    "order_link",
    "support_email",
    "store_name",
    "store_url",
    "current_year",
  ],
  dispute_opened_admin: [
    "customer_name",
    "order_number",
    "dispute_reason",
    "dispute_amount",
    "admin_link",
    "store_name",
    "current_year",
  ],
};

// Variables whose value is a pre-built HTML fragment — they go through
// sanitiseEmailHtml (which strips scripts) but are NOT HTML-escaped.
const HTML_VARS = new Set(["items_table"]);

async function getOrSeed(key: TemplateKey) {
  const [row] = await db
    .select()
    .from(emailTemplates)
    .where(eq(emailTemplates.key, key))
    .limit(1);
  if (row) return row;
  const seeds = seedEmailTemplates();
  const target = seeds.find((s) => s.key === key);
  if (!target) throw new Error(`No seed for template key: ${key}`);
  await db.insert(emailTemplates).values(target);
  const [fresh] = await db
    .select()
    .from(emailTemplates)
    .where(eq(emailTemplates.key, key))
    .limit(1);
  if (!fresh) throw new Error("Failed to seed email template");
  return fresh;
}

/**
 * Render a template into { subject, html, text }. The caller passes a
 * `variables` map keyed by the names in availableVariables[key].
 *
 * Subject placeholders are NOT HTML-escaped (subject is plain-text in the
 * email envelope). HTML body placeholders are escaped per HTML_VARS rules.
 */
export async function renderTemplate(
  key: TemplateKey,
  variables: Record<string, unknown>,
): Promise<{ subject: string; html: string; text: string }> {
  const tpl = await getOrSeed(key);

  // Defense-in-depth — sanitise stored HTML again at render time.
  const safeHtml = sanitiseEmailHtml(tpl.html);

  const substituteHtml = (src: string): string =>
    src.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
      const val = variables[name];
      if (val === undefined || val === null) return "";
      if (HTML_VARS.has(name)) {
        return sanitiseEmailHtml(String(val));
      }
      return escapeHtml(val);
    });

  const substituteSubject = (src: string): string =>
    src.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
      String(variables[name] ?? ""),
    );

  const html = substituteHtml(safeHtml);
  const subject = substituteSubject(tpl.subject);
  const text = htmlToText(html);
  return { subject, html, text };
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
