/* eslint-disable no-console */
/**
 * One-off script — register the 4 Delyva webhook events against the prod
 * app URL. Run once after deploy; Delyva's /webhook/subscribe is idempotent
 * on (url, event) so re-running is safe.
 *
 * Usage:
 *   node scripts/register-delyva-webhooks.cjs
 *
 * Env (loaded from .env.local unless already set):
 *   DELYVA_BASE_URL
 *   DELYVA_API_KEY
 *   DELYVA_WEBHOOK_SHARED_SECRET
 *   DELYVA_WEBHOOK_URL  (optional override; defaults to
 *                        https://app.3dninjaz.com/api/webhooks/delyva)
 */
const fs = require("node:fs");
const path = require("node:path");

const EVENTS = [
  "order.created",
  "order.failed",
  "order_tracking.change",
  "order_tracking.update",
];

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
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

async function subscribe(base, key, event, url) {
  // Confirmed endpoint via curl 2026-04-20: POST /webhook accepts
  // { event, url } with X-Delyvax-Access-Token. The `secret` field is
  // NOT allowed — HMAC verification on the receiver side uses
  // DELYVA_WEBHOOK_SHARED_SECRET that Delyva signs requests with.
  const res = await fetch(`${base}/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Delyvax-Access-Token": key,
    },
    body: JSON.stringify({ event, url }),
  });
  let body = {};
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, body };
}

async function run() {
  loadEnv();
  const base = process.env.DELYVA_BASE_URL || "https://api.delyva.app/v1.0";
  const key = process.env.DELYVA_API_KEY;
  const secret = process.env.DELYVA_WEBHOOK_SHARED_SECRET;
  const url =
    process.env.DELYVA_WEBHOOK_URL ||
    "https://app.3dninjaz.com/api/webhooks/delyva";

  if (!key) {
    throw new Error("DELYVA_API_KEY missing — check .env.local");
  }
  if (!secret) {
    throw new Error("DELYVA_WEBHOOK_SHARED_SECRET missing — check .env.local");
  }

  console.log(`Delyva webhook registration`);
  console.log(`  base: ${base}`);
  console.log(`  url : ${url}`);
  console.log(`  key : ${key.slice(0, 6)}…${key.slice(-4)} (${key.length} chars)`);
  console.log(`  events: ${EVENTS.join(", ")}`);
  console.log("");

  let okCount = 0;
  let failCount = 0;
  for (const event of EVENTS) {
    process.stdout.write(`  ${event.padEnd(28, " ")} ... `);
    try {
      const r = await subscribe(base, key, event, url);
      if (r.ok) {
        console.log(`OK (http ${r.status})`);
        okCount++;
      } else {
        console.log(
          `FAIL (http ${r.status})\n      body: ${JSON.stringify(r.body)}`,
        );
        failCount++;
      }
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      failCount++;
    }
  }

  console.log("");
  console.log(`Done. ${okCount} subscribed, ${failCount} failed.`);
  if (failCount > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
