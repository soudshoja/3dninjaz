/* eslint-disable no-console */
/**
 * Stale checkout-draft WhatsApp digest (260815-rsk).
 *
 * Runs ONCE daily at 09:00 MYT and sends the admin a single WhatsApp message
 * listing every checkout draft that is still `open` and older than 24h, then
 * stamps those rows so they are never reported again.
 *
 * Plain Node CommonJS — does NOT bootstrap Next.js (same pattern as
 * scripts/cron/reconcile-paypal.cjs). Reads .env.local via a tiny inline parser.
 *
 * Timezone: the box and MariaDB both run GMT (@@time_zone = SYSTEM), and
 * created_at is stored UTC. MYT is UTC+8, so:
 *   - crontab line is `0 1 * * *`  (01:00 UTC = 09:00 MYT)
 *   - digest lines group on DATE(created_at + INTERVAL 8 HOUR), because
 *     /admin/drafts renders timestamps with toLocaleString("en-MY") and raw-UTC
 *     grouping would label rows a day off from what the admin sees on screen.
 *
 * Eligibility is exact-24h from created_at, NOT "yesterday's calendar date".
 * Combined with the daily cadence that means a draft is reported 24-47h after
 * it was created. That is intended.
 *
 * Safety properties:
 *   - Zero eligible drafts  -> sends nothing, exits 0 (no "0 drafts" spam).
 *   - Instance not connected -> sends nothing, stamps nothing, exits 0, so the
 *     same drafts are retried on the next run instead of being silently burned.
 *   - Stamps notified_at ONLY after the send returns HTTP 2xx, and only for the
 *     exact ids that went into the message.
 *   - --dry-run prints the composed message and the ids it would stamp, and
 *     touches nothing.
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

/** Hard cap so one bad day cannot produce a 500-line WhatsApp message. */
const MAX_ROWS = 50;
/** MYT is UTC+8. */
const MYT_OFFSET_HOURS = 8;

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

/**
 * True only when Evolution reports the instance as "open". Any error, timeout
 * or non-2xx is treated as not-connected so we defer rather than burn drafts.
 */
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

function describeItems(items) {
  if (items.length === 0) return "bag unavailable";
  const names = items
    .map((it) => {
      const name = typeof it.name === "string" && it.name.trim() ? it.name.trim() : "item";
      const qty = Number(it.quantity) || 1;
      return qty > 1 ? `${name} ×${qty}` : name;
    })
    .slice(0, 3);
  const extra = items.length > names.length ? ` +${items.length - names.length} more` : "";
  return `${items.length} item(s): ${names.join(", ")}${extra}`;
}

/** Format a MYT date key (YYYY-MM-DD as returned by MySQL) as "15 Aug 2026". */
function formatMytDate(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  if (!y || !m || !d) return String(key);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[m - 1]} ${y}`;
}

function buildMessage(rows, truncatedCount) {
  const byDate = new Map();
  for (const r of rows) {
    // mysql2 returns DATE as a JS Date or a string depending on driver config —
    // normalise to YYYY-MM-DD either way.
    const key =
      r.mytDate instanceof Date
        ? r.mytDate.toISOString().slice(0, 10)
        : String(r.mytDate).slice(0, 10);
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

  lines.push("Follow up: https://3dninjaz.com/admin/drafts");
  return lines.join("\n");
}

async function main() {
  loadEnv();

  const url = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");

  const conn = await mysql.createConnection(url);

  try {
    const [eligible] = await conn.query(
      `SELECT id,
              recipient_name AS recipientName,
              phone,
              subtotal,
              items_json    AS itemsJson,
              created_at    AS createdAt,
              TIMESTAMPDIFF(HOUR, created_at, UTC_TIMESTAMP()) AS ageHours,
              DATE(created_at + INTERVAL ? HOUR)               AS mytDate
         FROM checkout_drafts
        WHERE status = 'open'
          AND notified_at IS NULL
          AND created_at <= UTC_TIMESTAMP() - INTERVAL 24 HOUR
        ORDER BY created_at ASC`,
      [MYT_OFFSET_HOURS],
    );

    if (eligible.length === 0) {
      console.log("[draft-digest] 0 stale drafts — nothing sent");
      return 0;
    }

    const rows = eligible.slice(0, MAX_ROWS);
    const truncatedCount = eligible.length - rows.length;
    const ids = rows.map((r) => r.id);
    const text = buildMessage(rows, truncatedCount);

    if (DRY_RUN) {
      console.log("[draft-digest] --dry-run — message NOT sent, nothing stamped");
      console.log(`[draft-digest] recipient: ${RECIPIENT()}`);
      console.log(`[draft-digest] would stamp ${ids.length} id(s): ${ids.join(", ")}`);
      console.log("---8<--- message ---8<---");
      console.log(text);
      console.log("---8<--- end ---8<---");
      return 0;
    }

    if (!(await instanceIsConnected())) {
      console.log(
        `[draft-digest] instance ${INSTANCE()} not connected — deferring ${eligible.length} draft(s), nothing stamped`,
      );
      return 0;
    }

    const sent = await sendText(RECIPIENT(), text);
    if (!sent) {
      console.error(
        `[draft-digest] send FAILED — ${eligible.length} draft(s) left unstamped for the next run`,
      );
      return 1;
    }

    // Stamp exactly what we reported. Parameterised placeholders, never a
    // string-built IN list.
    const placeholders = ids.map(() => "?").join(",");
    const [res] = await conn.query(
      `UPDATE checkout_drafts
          SET notified_at = UTC_TIMESTAMP()
        WHERE id IN (${placeholders})`,
      ids,
    );

    console.log(
      `[draft-digest] sent=1 reported=${rows.length} stamped=${res.affectedRows} deferred=${truncatedCount}`,
    );
    return 0;
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
