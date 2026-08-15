/* eslint-disable no-console */
/**
 * Stale checkout-draft cron (260815-rsk, extended 260816).
 *
 * Runs ONCE daily at 09:00 MYT and does two independent passes:
 *
 *   PASS 1 — admin digest
 *     One WhatsApp message to the admin listing every draft still `open` and
 *     older than 24h. Bookkeeping column: notified_at.
 *
 *   PASS 2 — customer reminder  (OFF by default)
 *     One WhatsApp message to EACH customer whose draft is still `open` and
 *     older than 24h. Bookkeeping column: customer_notified_at.
 *     Gated by the master notifications toggle AND the
 *     `draft_abandoned_reminder` row in whatsapp_notifications, which seeds
 *     disabled — see DEFAULT_ENABLED in src/lib/whatsapp/events.ts.
 *
 * The two columns are separate so one pass can never suppress the other.
 *
 * Plain Node CommonJS — does NOT bootstrap Next.js (same pattern as
 * scripts/cron/reconcile-paypal.cjs). Reads .env.local via an inline parser.
 * Because it cannot import the TS helpers, it reads the template straight from
 * whatsapp_notifications and mirrors renderWhatsappTemplate / normalizeMsisdn
 * from src/lib/whatsapp/events.ts. Keep them in sync.
 *
 * Timezone: the box and MariaDB both run GMT (@@time_zone = SYSTEM) and
 * created_at is stored UTC. MYT is UTC+8, so:
 *   - crontab line is `0 1 * * *`  (01:00 UTC = 09:00 MYT)
 *   - digest lines group on DATE(created_at + INTERVAL 8 HOUR), because
 *     /admin/drafts renders timestamps with toLocaleString("en-MY") and
 *     raw-UTC grouping would label rows a day off from what the admin sees.
 *
 * Eligibility is exact-24h from created_at, NOT "yesterday's calendar date".
 * Combined with the daily cadence a draft is actioned 24-47h after creation.
 *
 * Safety properties:
 *   - Nothing eligible -> sends nothing, exits 0 (no "0 drafts" spam).
 *   - Instance not connected -> sends nothing, stamps nothing, exits 0, so the
 *     same drafts are retried next run instead of being silently burned.
 *   - Stamps only after the send returns HTTP 2xx, and only for ids that were
 *     actually in a message.
 *   - Customer pass additionally refuses to run outside 09:00-20:00 MYT, skips
 *     unusable phone numbers, spaces sends apart, and caps per run.
 *   - --dry-run prints what it would do and touches nothing.
 *
 * Run:
 *   node scripts/cron/draft-stale-digest.cjs --dry-run
 *   node scripts/cron/draft-stale-digest.cjs
 */
"use strict";

const mysql = require("mysql2/promise");
const fs = require("node:fs");
const path = require("node:path");

const DRY_RUN = process.argv.includes("--dry-run");
/** Bypass the business-hours guard on the customer pass (manual testing). */
const FORCE_WINDOW = process.argv.includes("--force-window");

/** Hard cap so one bad day cannot produce a 500-line WhatsApp message. */
const MAX_ROWS = 50;
/** Customer sends per run — deliberately smaller; these go to real strangers. */
const MAX_CUSTOMER_SENDS = 20;
/** Gap between customer sends, ms. Bulk-rate pacing for a Baileys account. */
const CUSTOMER_SEND_GAP_MS = 4000;
/** MYT is UTC+8. */
const MYT_OFFSET_HOURS = 8;
/** Customer reminders only inside these MYT hours (inclusive start, exclusive end). */
const CUSTOMER_WINDOW = { startHour: 9, endHour: 20 };
const REMINDER_EVENT_KEY = "draft_abandoned_reminder";

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
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

const EVO_BASE = () => process.env.EVOLUTION_API_URL || "http://127.0.0.1:8080";
const EVO_KEY = () => process.env.EVOLUTION_API_KEY || "";
const INSTANCE = () => process.env.WHATSAPP_INSTANCE_NAME || "3dninjaz";
/** Admin recipient. Store number by default (self-message). */
const RECIPIENT = () => process.env.ADMIN_NOTIFY_PHONE || "601125434730";

/** Mirrors publicOrigin() in src/lib/public-url.ts so dev links to dev. */
function publicOrigin() {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "https://3dninjaz.com";
  return raw.trim().replace(/\/+$/, "");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mirrors normalizeMsisdn() in src/lib/whatsapp/events.ts. */
function normalizeMsisdn(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = "60" + d.slice(1);
  if (!d.startsWith("60") && d.length <= 10) d = "60" + d;
  return d.length >= 10 ? d : null;
}

/** Mirrors renderWhatsappTemplate() in src/lib/whatsapp/events.ts. */
function renderTemplate(template, vars) {
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const v = vars[name];
    return v === undefined || v === null ? "" : String(v);
  });
}

/** Current hour in MYT, derived from UTC (the box runs GMT). */
function mytHourNow() {
  const now = new Date();
  return (now.getUTCHours() + MYT_OFFSET_HOURS) % 24;
}

async function instanceIsConnected() {
  try {
    const res = await fetch(
      `${EVO_BASE()}/instance/connectionState/${INSTANCE()}`,
      { headers: { apikey: EVO_KEY() }, cache: "no-store" },
    );
    if (!res.ok) return false;
    const json = await res.json();
    const state = (json && json.instance && json.instance.state) || (json && json.state);
    return state === "open";
  } catch {
    return false;
  }
}

async function sendText(number, text) {
  try {
    const res = await fetch(`${EVO_BASE()}/message/sendText/${INSTANCE()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVO_KEY() },
      body: JSON.stringify({ number, text }),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[draft-digest] sendText HTTP ${res.status} — ${body.slice(0, 300)}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("[draft-digest] sendText threw:", (err && err.message) || err);
    return false;
  }
}

/** items_json is LONGTEXT on MariaDB — mysql2 does NOT auto-parse it. */
function parseItems(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function itemNames(items, limit) {
  return items
    .map((it) => {
      const name =
        typeof it.name === "string" && it.name.trim() ? it.name.trim() : "item";
      const qty = Number(it.quantity) || 1;
      return qty > 1 ? `${name} ×${qty}` : name;
    })
    .slice(0, limit);
}

function describeItems(items) {
  if (items.length === 0) return "bag unavailable";
  const names = itemNames(items, 3);
  const extra =
    items.length > names.length ? ` +${items.length - names.length} more` : "";
  return `${items.length} item(s): ${names.join(", ")}${extra}`;
}

/** Customer-facing phrasing — no counts, just what they picked. */
function describeItemsForCustomer(items) {
  if (items.length === 0) return "your items";
  const names = itemNames(items, 2);
  const extra =
    items.length > names.length ? ` and ${items.length - names.length} more` : "";
  return `${names.join(", ")}${extra}`;
}

function formatMytDate(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  if (!y || !m || !d) return String(key);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[m - 1]} ${y}`;
}

function normaliseMytDateKey(value) {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

function buildDigest(rows, truncatedCount) {
  const byDate = new Map();
  for (const r of rows) {
    const key = normaliseMytDateKey(r.mytDate);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(r);
  }

  const plural = rows.length === 1 ? "draft" : "drafts";
  const lines = [
    `*${rows.length} unpaid checkout ${plural}* (24h+ old, still open)`,
    "",
  ];

  for (const [key, group] of [...byDate.entries()].sort()) {
    lines.push(`*${formatMytDate(key)}*`);
    for (const r of group) {
      const subtotal = Number(r.subtotal || 0).toFixed(2);
      lines.push(
        `• ${r.recipientName} — ${r.phone} — ${describeItems(parseItems(r.itemsJson))} — RM${subtotal} (${r.ageHours}h old)`,
      );
    }
    lines.push("");
  }

  if (truncatedCount > 0) {
    lines.push(
      `_+${truncatedCount} more not listed (capped at ${MAX_ROWS} per message) — they stay open and will be reported next run._`,
    );
    lines.push("");
  }

  lines.push(`Follow up: ${publicOrigin()}/admin/drafts`);
  return lines.join("\n");
}

const ELIGIBLE_SELECT = `
  SELECT id,
         recipient_name AS recipientName,
         phone,
         subtotal,
         items_json    AS itemsJson,
         created_at    AS createdAt,
         TIMESTAMPDIFF(HOUR, created_at, UTC_TIMESTAMP()) AS ageHours,
         DATE(created_at + INTERVAL ? HOUR)               AS mytDate
    FROM checkout_drafts
   WHERE status = 'open'
     AND {{COLUMN}} IS NULL
     AND created_at <= UTC_TIMESTAMP() - INTERVAL 24 HOUR
   ORDER BY created_at ASC`;

// ---------------------------------------------------------------------------
// PASS 1 — admin digest
// ---------------------------------------------------------------------------
async function runAdminDigest(conn) {
  const [eligible] = await conn.query(
    ELIGIBLE_SELECT.replace("{{COLUMN}}", "notified_at"),
    [MYT_OFFSET_HOURS],
  );

  if (eligible.length === 0) {
    console.log("[draft-digest] admin: 0 stale drafts — nothing sent");
    return 0;
  }

  const rows = eligible.slice(0, MAX_ROWS);
  const truncatedCount = eligible.length - rows.length;
  const ids = rows.map((r) => r.id);
  const text = buildDigest(rows, truncatedCount);

  if (DRY_RUN) {
    console.log("[draft-digest] admin: --dry-run — not sent, nothing stamped");
    console.log(`[draft-digest] admin: recipient ${RECIPIENT()}`);
    console.log(`[draft-digest] admin: would stamp ${ids.length} id(s)`);
    console.log("---8<--- admin digest ---8<---");
    console.log(text);
    console.log("---8<--- end ---8<---");
    return 0;
  }

  if (!(await instanceIsConnected())) {
    console.log(
      `[draft-digest] admin: instance ${INSTANCE()} not connected — deferring ${eligible.length} draft(s)`,
    );
    return 0;
  }

  if (!(await sendText(RECIPIENT(), text))) {
    console.error(
      `[draft-digest] admin: send FAILED — ${eligible.length} draft(s) left unstamped`,
    );
    return 1;
  }

  const placeholders = ids.map(() => "?").join(",");
  const [res] = await conn.query(
    `UPDATE checkout_drafts SET notified_at = UTC_TIMESTAMP() WHERE id IN (${placeholders})`,
    ids,
  );
  console.log(
    `[draft-digest] admin: sent=1 reported=${rows.length} stamped=${res.affectedRows} deferred=${truncatedCount}`,
  );
  return 0;
}

// ---------------------------------------------------------------------------
// PASS 2 — customer reminder (opt-in, off by default)
// ---------------------------------------------------------------------------
async function runCustomerReminders(conn) {
  // Master toggle — same gate every customer-facing WhatsApp respects.
  const [settings] = await conn.query(
    "SELECT notifications_enabled AS enabled FROM whatsapp_settings LIMIT 1",
  );
  if (settings.length === 0 || !Number(settings[0].enabled)) {
    console.log("[draft-digest] customer: master notifications OFF — skipped");
    return 0;
  }

  // Per-event toggle + admin-editable template.
  const [notif] = await conn.query(
    "SELECT enabled, template FROM whatsapp_notifications WHERE event_key = ? LIMIT 1",
    [REMINDER_EVENT_KEY],
  );
  if (notif.length === 0) {
    console.log(
      `[draft-digest] customer: ${REMINDER_EVENT_KEY} not seeded yet — skipped`,
    );
    return 0;
  }
  if (!Number(notif[0].enabled)) {
    console.log(
      `[draft-digest] customer: ${REMINDER_EVENT_KEY} disabled in Notification Center — skipped`,
    );
    return 0;
  }
  const template = notif[0].template;
  if (!template || !String(template).trim()) {
    console.log("[draft-digest] customer: template empty — skipped");
    return 0;
  }

  // Never message strangers outside business hours, even on a manual run.
  const hour = mytHourNow();
  const inWindow =
    hour >= CUSTOMER_WINDOW.startHour && hour < CUSTOMER_WINDOW.endHour;
  if (!inWindow && !FORCE_WINDOW) {
    console.log(
      `[draft-digest] customer: ${hour}:00 MYT is outside ${CUSTOMER_WINDOW.startHour}-${CUSTOMER_WINDOW.endHour} — skipped`,
    );
    return 0;
  }

  const [eligible] = await conn.query(
    ELIGIBLE_SELECT.replace("{{COLUMN}}", "customer_notified_at"),
    [MYT_OFFSET_HOURS],
  );
  if (eligible.length === 0) {
    console.log("[draft-digest] customer: 0 eligible — nothing sent");
    return 0;
  }

  const batch = eligible.slice(0, MAX_CUSTOMER_SENDS);
  const deferred = eligible.length - batch.length;

  if (!DRY_RUN && !(await instanceIsConnected())) {
    console.log(
      `[draft-digest] customer: instance ${INSTANCE()} not connected — deferring ${eligible.length}`,
    );
    return 0;
  }

  const origin = publicOrigin();
  let sent = 0;
  let skippedPhone = 0;
  let failed = 0;

  for (const r of batch) {
    const number = normalizeMsisdn(r.phone);
    if (!number) {
      // Matches the isDeliverablePhone behaviour elsewhere: bad MSISDN is a
      // silent skip, but we log it here so it is not invisible. Left unstamped
      // on purpose — a corrected number could still be reachable later.
      console.log(`[draft-digest] customer: unusable phone "${r.phone}" — skipped`);
      skippedPhone += 1;
      continue;
    }

    const text = renderTemplate(template, {
      customerName: r.recipientName,
      itemsSummary: describeItemsForCustomer(parseItems(r.itemsJson)),
      subtotal: Number(r.subtotal || 0).toFixed(2),
      bagUrl: `${origin}/bag`,
    });

    if (DRY_RUN) {
      console.log(`---8<--- customer ${number} ---8<---`);
      console.log(text);
      console.log("---8<--- end ---8<---");
      sent += 1;
      continue;
    }

    if (await sendText(number, text)) {
      await conn.query(
        "UPDATE checkout_drafts SET customer_notified_at = UTC_TIMESTAMP() WHERE id = ?",
        [r.id],
      );
      sent += 1;
    } else {
      // Not stamped — retried on the next run.
      failed += 1;
    }

    if (CUSTOMER_SEND_GAP_MS > 0) await sleep(CUSTOMER_SEND_GAP_MS);
  }

  console.log(
    `[draft-digest] customer: ${DRY_RUN ? "would send" : "sent"}=${sent} failed=${failed} badPhone=${skippedPhone} deferred=${deferred}`,
  );
  return 0;
}

async function main() {
  loadEnv();

  const url = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");

  const conn = await mysql.createConnection(url);
  try {
    const adminCode = await runAdminDigest(conn);
    const customerCode = await runCustomerReminders(conn);
    return adminCode || customerCode;
  } finally {
    await conn.end();
  }
}

main()
  .then((code) => process.exit(code || 0))
  .catch((err) => {
    console.error("[draft-digest] FATAL:", (err && err.message) || err);
    process.exit(1);
  });
