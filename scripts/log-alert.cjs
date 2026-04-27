#!/usr/bin/env node
// log-alert.cjs — Next.js error log monitor for 3D Ninjaz
//
// Runs every minute via cron. Reads new bytes from the app log since the last
// run, detects error lines, and sends a WhatsApp alert via Resayil API.
//
// State (last byte offset + inode) stored at STATE_PATH to survive rotations.
// Max 3 alert messages per run to prevent WhatsApp flooding.
//
// Cron entry (ninjaz user):
//   * * * * * /home/ninjaz/nodevenv/apps/3dninjaz_v1/20/bin/node \
//     /home/ninjaz/scripts/log-alert.cjs >> /home/ninjaz/scripts/log-alert.out 2>&1

'use strict';

const fs   = require('node:fs');
const https = require('node:https');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const LOG_PATH   = process.env.LOG_PATH   || '/home/ninjaz/apps/3dninjaz_v1/app.log';
const STATE_PATH = process.env.STATE_PATH || '/home/ninjaz/scripts/.log-alert-state.json';
const RESAYIL_KEY = 'f0bd277a312a53381db25d5af1e3a5c23f5dc869a8d4d667aab54a53293334adc4764ce2dadcfe87';
const PHONE       = '+96599800027';
const MAX_ALERTS_PER_RUN = 3;

// ---------------------------------------------------------------------------
// Error detection — lines that indicate real bugs worth alerting on
// ---------------------------------------------------------------------------
const ERROR_PATTERNS = [
  /⧋/,                         // ⨯ (U+29CB) — Next.js error prefix
  /\bError:/,
  /\bTypeError:/,
  /\bReferenceError:/,
  /\bSyntaxError:/,
  /\bURIError:/,
  /\bRangeError:/,
  /\bUncaught\b/,
  /\bUnhandledPromiseRejection/,
  /\bFATAL\b/i,
  /\bECONNREFUSED\b/,
  /\bEACCES\b/,
  /\bENOENT\b/,
  /\b500\b.*\(/,                    // HTTP 500 responses
  /\[error-page\]/,                 // Custom error-page logger in the app
];

// ---------------------------------------------------------------------------
// Noise suppression — expected lines that should never trigger alerts
// ---------------------------------------------------------------------------
const IGNORE_PATTERNS = [
  /favicon\.ico/,
  /\/robots\.txt/,
  /\/_next\/static/,
  /Error: Forbidden/,               // Admin auth guard fires on unauthenticated prefetch — expected
  /isn't a valid image/,            // Broken product image — logged, not crash-level alert
  /digest:/,                        // Stack trace digest lines, not actionable standalone
  /at async/,                       // Stack trace lines
  /^\s+at /,                        // Stack trace continuation lines
  /^\s*\{$/,                        // Opening brace of structured log object
  /^\s*\}$/,                        // Closing brace
];

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { offset: 0, inode: null };
  }
}

function saveState(s) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(s));
}

// ---------------------------------------------------------------------------
// WhatsApp sender
// ---------------------------------------------------------------------------
function sendWhatsApp(message) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ phone: PHONE, message });
    const req  = https.request(
      {
        hostname: 'api.resayil.io',
        port:     443,
        path:     '/v1/messages',
        method:   'POST',
        headers:  {
          'Authorization':  `Bearer ${RESAYIL_KEY}`,
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 12000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end',  () => {
          console.log(`[wa] ${res.statusCode} ${body.slice(0, 120)}`);
          resolve({ status: res.statusCode, body });
        });
      }
    );
    req.on('error',   (e) => { console.error(`[wa] error: ${e.message}`); resolve({ status: 0, body: e.message }); });
    req.on('timeout', ()  => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
    req.write(data);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.log(`[log-alert] run @ ${ts}`);

  if (!fs.existsSync(LOG_PATH)) {
    console.error(`[log-alert] log not found: ${LOG_PATH}`);
    process.exit(0);
  }

  const stat  = fs.statSync(LOG_PATH);
  const state = loadState();

  // If inode changed the log was rotated — reset to beginning
  let startOffset = (state.inode === stat.ino) ? state.offset : 0;
  // If offset exceeds file size the log was truncated (cleared) — reset
  if (startOffset > stat.size) startOffset = 0;

  if (startOffset >= stat.size) {
    // Nothing new since last run
    saveState({ offset: stat.size, inode: stat.ino });
    console.log('[log-alert] no new bytes');
    return;
  }

  // Read new bytes only
  const len = stat.size - startOffset;
  const buf = Buffer.alloc(len);
  const fd  = fs.openSync(LOG_PATH, 'r');
  fs.readSync(fd, buf, 0, len, startOffset);
  fs.closeSync(fd);

  const lines  = buf.toString('utf8').split('\n');
  const errors = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    if (IGNORE_PATTERNS.some((p) => p.test(line))) continue;
    if (ERROR_PATTERNS.some((p) => p.test(line))) {
      errors.push(line.slice(0, 800));
    }
  }

  console.log(`[log-alert] scanned ${lines.length} new lines, ${errors.length} errors`);

  if (errors.length === 0) {
    saveState({ offset: stat.size, inode: stat.ino });
    return;
  }

  // Send up to MAX_ALERTS_PER_RUN individual alerts
  const toSend = errors.slice(0, MAX_ALERTS_PER_RUN);
  for (const errLine of toSend) {
    const msg = `[3D Ninjaz] Server error detected:\n\n${errLine}\n\n(${ts} UTC)`;
    await sendWhatsApp(msg);
  }

  // If there were more errors, send a single summary message
  if (errors.length > MAX_ALERTS_PER_RUN) {
    const suppressed = errors.length - MAX_ALERTS_PER_RUN;
    await sendWhatsApp(
      `[3D Ninjaz] ${suppressed} more error(s) suppressed this minute.\nSSH and check:\n${LOG_PATH}`
    );
  }

  saveState({ offset: stat.size, inode: stat.ino });
})();
