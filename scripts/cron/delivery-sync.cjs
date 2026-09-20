/* eslint-disable no-console */
/**
 * Delivery-sync cron trigger.
 *
 * Dependency-free. POSTs to the local Next.js app's internal poller, which
 * asks Delyva for the live status of every fulfilled-but-not-delivered parcel
 * and flips delivered orders. Delivery must not depend on a webhook arriving.
 *
 * Env (read from process env, then .env.local for any that are unset):
 *   DELIVERY_SYNC_SECRET  required, must match the app's value
 *   PORT                  the app's port (default 3000; prod is 3001)
 *
 * Exit 0 = HTTP 200 (one summary line printed). Non-zero on any failure.
 * The secret is sent in the x-delivery-sync-secret header only and is never
 * printed.
 *
 * Run every 10 minutes from cron with PORT set (see the PR description).
 */
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
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

function main() {
  loadEnv();
  const secret = process.env.DELIVERY_SYNC_SECRET;
  if (!secret) {
    console.error("[delivery-sync] DELIVERY_SYNC_SECRET is not set");
    process.exit(2);
  }
  const port = Number(process.env.PORT || 3000);

  const req = http.request(
    {
      host: "127.0.0.1",
      port,
      path: "/api/internal/delivery-sync",
      method: "POST",
      headers: { "x-delivery-sync-secret": secret, "content-length": 0 },
      // Batch is capped at 25 parcels x (5s timeout + pause) worst case.
      timeout: 240000,
    },
    (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        if (res.statusCode !== 200) {
          console.error(`[delivery-sync] HTTP ${res.statusCode}`);
          process.exit(1);
        }
        try {
          const s = JSON.parse(body);
          console.log(
            `[delivery-sync] ${new Date().toISOString()} checked=${s.checked} delivered=${s.delivered} errors=${s.errors}`,
          );
          process.exit(0);
        } catch {
          console.error("[delivery-sync] unparseable response");
          process.exit(1);
        }
      });
    },
  );
  req.on("timeout", () => {
    console.error("[delivery-sync] request timed out");
    req.destroy();
    process.exit(1);
  });
  req.on("error", (e) => {
    console.error("[delivery-sync] request failed:", e.code || e.message);
    process.exit(1);
  });
  req.end();
}

main();
