/* eslint-disable no-console */
/**
 * Phase 7 (07-07) — nightly PayPal reconciliation cron.
 *
 * Plain Node CommonJS — does NOT bootstrap Next.js. Reads .env.local via a
 * tiny inline parser (same pattern as scripts/phase6-migrate.cjs). Pulls
 * PayPal /v1/reporting/transactions for "yesterday in MYT", compares to
 * local orders.paypalCaptureId, persists drift to recon_runs and writes
 * a JSON snapshot to .planning/intel/recon-YYYY-MM-DD.json (gitignored).
 *
 * Drift kinds:
 *   missing_local        — PayPal has txn, local orders has none
 *   missing_paypal       — local has paypalCaptureId, PayPal Reporting did not return it
 *   amount_mismatch      — amounts differ by > RM 0.02
 *   refund_only_external — PayPal status=REFUNDED but local refundedAmount is 0
 *
 * Re-running for the same MYT date is a no-op (UNIQUE on run_date +
 * ON DUPLICATE KEY UPDATE).
 *
 * Q-07-08 graceful failure: if PayPal returns NOT_AUTHORIZED, writes
 * recon_runs.status='error' + errorMessage and exits 1.
 */
"use strict";
const mysql = require("mysql2/promise");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", "..", ".env.local");
  if (!fsSync.existsSync(envPath)) return;
  const text = fsSync.readFileSync(envPath, "utf8");
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

const ENV = (process.env.PAYPAL_ENV || "sandbox").toLowerCase();
const IS_LIVE = ENV === "live" || ENV === "production";
const PAYPAL_BASE = IS_LIVE
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

function paypalCreds() {
  return {
    clientId: IS_LIVE
      ? process.env.PAYPAL_CLIENT_ID
      : process.env.PAYPAL_CLIENT_ID_SANDBOX || process.env.PAYPAL_CLIENT_ID,
    secret: IS_LIVE
      ? process.env.PAYPAL_CLIENT_SECRET
      : process.env.PAYPAL_CLIENT_SECRET_SANDBOX ||
        process.env.PAYPAL_CLIENT_SECRET,
  };
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function mytYesterdayRange() {
  // MYT = UTC+8. Yesterday in MYT -> [yMYT 00:00 -> 23:59:59.999] -> UTC.
  const nowMYT = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const yMYT = new Date(
    Date.UTC(
      nowMYT.getUTCFullYear(),
      nowMYT.getUTCMonth(),
      nowMYT.getUTCDate() - 1,
    ),
  );
  // yMYT is currently the UTC midpoint representation of "yesterday MYT 00:00".
  // To convert MYT 00:00 to UTC we subtract 8h.
  const startUTC = new Date(yMYT.getTime() - 8 * 60 * 60 * 1000);
  const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { startUTC, endUTC, dateStr: ymd(yMYT) };
}

async function getToken() {
  const { clientId, secret } = paypalCreds();
  if (!clientId || !secret) throw new Error("Missing PayPal creds");
  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const r = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`OAuth ${r.status}`);
  const j = await r.json();
  return j.access_token;
}

async function fetchAllTxns(token, startISO, endISO) {
  const out = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= 100) {
    const params = new URLSearchParams({
      start_date: startISO,
      end_date: endISO,
      page_size: "500",
      page: String(page),
      fields: "transaction_info",
    });
    const r = await fetch(
      `${PAYPAL_BASE}/v1/reporting/transactions?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!r.ok) {
      const body = await r.text();
      if (body.includes("NOT_AUTHORIZED")) {
        const e = new Error("NOT_AUTHORIZED");
        e.code = "NOT_AUTHORIZED";
        throw e;
      }
      throw new Error(`reporting ${r.status} ${body.slice(0, 200)}`);
    }
    const j = await r.json();
    totalPages = j.total_pages || 1;
    for (const td of j.transaction_details || []) {
      const ti = td.transaction_info || {};
      out.push({
        transactionId: ti.transaction_id,
        referenceId: ti.paypal_reference_id,
        status: ti.transaction_status,
        value: ti.transaction_amount && ti.transaction_amount.value,
        currency:
          ti.transaction_amount && ti.transaction_amount.currency_code,
        eventCode: ti.transaction_event_code,
      });
    }
    page++;
  }
  return out;
}

async function loadLocalOrders(conn, startUTC, endUTC) {
  // Add 1-day grace before window start (some captures settle next day).
  const lookbackStart = new Date(startUTC.getTime() - 24 * 60 * 60 * 1000);
  const [rows] = await conn.execute(
    `SELECT id, paypal_capture_id AS captureId, total_amount AS total,
            refunded_amount AS refunded, status, currency
     FROM orders
     WHERE paypal_capture_id IS NOT NULL
       AND created_at >= ? AND created_at <= ?`,
    [lookbackStart, endUTC],
  );
  return rows;
}

function computeDrift(paypalTxns, localOrders) {
  const byCapture = new Map();
  for (const t of paypalTxns) if (t.referenceId) byCapture.set(t.referenceId, t);
  const drift = [];

  // Local-side: every local capture should appear in PayPal report
  for (const o of localOrders) {
    const t = byCapture.get(o.captureId);
    if (!t) {
      drift.push({
        kind: "missing_paypal",
        localOrderId: o.id,
        captureId: o.captureId,
      });
      continue;
    }
    const localTotal = parseFloat(o.total);
    const paypalGross = parseFloat(t.value || "0");
    if (Math.abs(localTotal - Math.abs(paypalGross)) > 0.02) {
      drift.push({
        kind: "amount_mismatch",
        localOrderId: o.id,
        captureId: o.captureId,
        localTotal,
        paypalGross,
      });
    }
    if (
      String(t.status).toUpperCase() === "REFUNDED" &&
      parseFloat(o.refunded || "0") <= 0.001
    ) {
      drift.push({
        kind: "refund_only_external",
        localOrderId: o.id,
        captureId: o.captureId,
      });
    }
  }
  // PayPal-side: every payment txn should map to a local order
  for (const t of paypalTxns) {
    if (!t.referenceId) continue;
    if (
      t.eventCode &&
      (String(t.eventCode).startsWith("T11") ||
        String(t.eventCode).startsWith("T12"))
    ) {
      continue;
    }
    if (t.eventCode && !String(t.eventCode).startsWith("T0")) continue;
    if (!localOrders.find((o) => o.captureId === t.referenceId)) {
      drift.push({
        kind: "missing_local",
        paypalTxnId: t.transactionId,
        captureId: t.referenceId,
      });
    }
  }
  return drift;
}

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");

  const { startUTC, endUTC, dateStr } = mytYesterdayRange();
  console.log(
    `[recon] reconciling ${dateStr} (UTC ${startUTC.toISOString()} -> ${endUTC.toISOString()})`,
  );

  const conn = await mysql.createConnection(url);

  let row = {
    id: crypto.randomUUID(),
    runDate: dateStr,
    ranAt: new Date(),
    totalPaypalTxns: 0,
    totalLocalTxns: 0,
    driftCount: 0,
    driftJson: null,
    status: "ok",
    errorMessage: null,
  };
  let drift = [];

  try {
    const token = await getToken();
    const paypalTxns = await fetchAllTxns(
      token,
      startUTC.toISOString(),
      endUTC.toISOString(),
    );
    const localOrders = await loadLocalOrders(conn, startUTC, endUTC);
    drift = computeDrift(paypalTxns, localOrders);
    row.totalPaypalTxns = paypalTxns.length;
    row.totalLocalTxns = localOrders.length;
    row.driftCount = drift.length;
    row.driftJson = JSON.stringify(drift);
    row.status = drift.length > 0 ? "drift" : "ok";

    const intelDir = path.join(process.cwd(), ".planning", "intel");
    await fs.mkdir(intelDir, { recursive: true });
    await fs.writeFile(
      path.join(intelDir, `recon-${dateStr}.json`),
      JSON.stringify({ ...row, drift }, null, 2),
    );
  } catch (e) {
    row.status = "error";
    row.errorMessage =
      e && e.code === "NOT_AUTHORIZED"
        ? "PayPal Reporting API NOT_AUTHORIZED. Contact PayPal support to enable Reporting on the merchant account (Q-07-08)."
        : (e && e.message) || String(e);
    console.error("[recon] failed:", e);
  }

  try {
    await conn.execute(
      `INSERT INTO recon_runs
        (id, run_date, ran_at, total_paypal_txns, total_local_txns,
         drift_count, drift_json, status, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         ran_at=VALUES(ran_at),
         total_paypal_txns=VALUES(total_paypal_txns),
         total_local_txns=VALUES(total_local_txns),
         drift_count=VALUES(drift_count),
         drift_json=VALUES(drift_json),
         status=VALUES(status),
         error_message=VALUES(error_message)`,
      [
        row.id,
        row.runDate,
        row.ranAt,
        row.totalPaypalTxns,
        row.totalLocalTxns,
        row.driftCount,
        row.driftJson,
        row.status,
        row.errorMessage,
      ],
    );
    console.log(
      `[recon] ${row.runDate} status=${row.status} drift=${row.driftCount}`,
    );
  } finally {
    await conn.end();
  }

  process.exit(row.status === "error" ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
