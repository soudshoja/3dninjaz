/* eslint-disable no-console */
/**
 * WhatsApp outbox watchdog - deliberately logic-free.
 * Pokes POST /api/internal/whatsapp/drain. No template rendering, no
 * normalizeMsisdn, no SQL (unlike draft-stale-digest.cjs, which duplicates
 * that logic). If the queue is non-empty but nothing sent across three
 * consecutive runs, the next poke carries ?wedged=1 so the app logs an
 * "Error:" line that scripts/log-alert.cjs picks up.
 *
 * Crontab (needs a human; one per environment port):
 *   *\/5 * * * * node scripts/cron/whatsapp-outbox-watchdog.cjs
 * Env: WHATSAPP_OUTBOX_DRAIN_SECRET, WATCHDOG_PORT (default 3000)
 */
const fs = require("node:fs");
const path = require("node:path");

function loadEnv() {
  const p = path.resolve(__dirname, "..", "..", ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnv();
  const secret = process.env.WHATSAPP_OUTBOX_DRAIN_SECRET;
  if (!secret) { console.error("[outbox-watchdog] WHATSAPP_OUTBOX_DRAIN_SECRET unset"); process.exit(1); }
  const port = process.env.WATCHDOG_PORT || "3000";
  const statePath = process.env.WATCHDOG_STATE || path.resolve(__dirname, ".outbox-watchdog-state.json");
  let stalls = 0;
  try { stalls = JSON.parse(fs.readFileSync(statePath, "utf8")).stalls || 0; } catch {}

  const wedged = stalls >= 2 ? "&wedged=1" : "";
  const res = await fetch(`http://127.0.0.1:${port}/api/internal/whatsapp/drain?secret=${encodeURIComponent(secret)}${wedged}`, { method: "POST" });
  const j = await res.json().catch(() => ({}));
  console.log("[outbox-watchdog]", JSON.stringify(j));
  const stalled = Number(j.queued) > 0 && Number(j.sent) === 0;
  fs.writeFileSync(statePath, JSON.stringify({ stalls: stalled ? stalls + 1 : 0 }));
}

main().catch((e) => { console.error("[outbox-watchdog] FATAL", e.message || e); process.exit(1); });
