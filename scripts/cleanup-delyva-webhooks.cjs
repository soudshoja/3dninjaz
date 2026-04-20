/* eslint-disable no-console */
/**
 * Dedupe Delyva webhook subscriptions.
 *
 * For each of the 4 events we care about:
 *   - order.created
 *   - order.failed
 *   - order_tracking.change
 *   - order_tracking.update
 * there should be exactly ONE subscription pointing to the expected webhook
 * URL. If there are duplicates, keep the OLDEST (lowest id / earliest
 * createdAt) and delete the rest.
 *
 * Also deletes any subscription whose URL does NOT match the expected
 * webhook URL (e.g. stale /v1/... paths left over from a subdomain
 * migration). Any subscription for an event type not in EVENTS is left
 * alone — operators can review those manually.
 *
 * Idempotent: safe to run repeatedly. Will no-op on a clean state.
 *
 * Usage:
 *   node scripts/cleanup-delyva-webhooks.cjs          # preview + apply
 *   node scripts/cleanup-delyva-webhooks.cjs --dry    # preview only
 *
 * Env (loaded from .env.local unless already set):
 *   DELYVA_BASE_URL
 *   DELYVA_API_KEY
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

async function listSubscriptions(base, key) {
  const res = await fetch(`${base}/webhook`, {
    headers: { "X-Delyvax-Access-Token": key },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET /webhook failed (${res.status}): ${body}`);
  }
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
}

async function deleteSubscription(base, key, id) {
  const res = await fetch(`${base}/webhook/${id}`, {
    method: "DELETE",
    headers: { "X-Delyvax-Access-Token": key },
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
  const expectedUrl =
    process.env.DELYVA_WEBHOOK_URL ||
    "https://app.3dninjaz.com/api/webhooks/delyva";
  const dryRun = process.argv.includes("--dry");

  if (!key) throw new Error("DELYVA_API_KEY missing — check .env.local");

  console.log("Delyva webhook cleanup");
  console.log(`  base        : ${base}`);
  console.log(`  expected url: ${expectedUrl}`);
  console.log(`  events      : ${EVENTS.join(", ")}`);
  console.log(`  dry-run     : ${dryRun ? "yes" : "no"}`);
  console.log("");

  const subs = await listSubscriptions(base, key);
  console.log(`Found ${subs.length} subscription(s) before cleanup.`);
  for (const s of subs) {
    console.log(`  id=${s.id} event=${s.event} url=${s.url} createdAt=${s.createdAt}`);
  }
  console.log("");

  const toDelete = [];

  // Bucket by event for the events we manage; flag anything pointing at a
  // non-expected URL regardless of event.
  for (const event of EVENTS) {
    const bucket = subs
      .filter((s) => s.event === event)
      .sort((a, b) => {
        // Oldest first: by createdAt asc, tiebreak on id asc.
        const ta = new Date(a.createdAt || 0).getTime();
        const tb = new Date(b.createdAt || 0).getTime();
        if (ta !== tb) return ta - tb;
        return (a.id || 0) - (b.id || 0);
      });

    if (bucket.length === 0) {
      console.log(`  ${event.padEnd(24)} MISSING — run register-delyva-webhooks.cjs`);
      continue;
    }

    // Keep the oldest that matches the expected URL if any; otherwise keep
    // the oldest overall and flag non-matching URLs for deletion.
    const matching = bucket.filter((s) => s.url === expectedUrl);
    const keep = matching[0] || bucket[0];
    for (const s of bucket) {
      if (s.id === keep.id) continue;
      toDelete.push({ ...s, reason: "duplicate" });
    }
    if (keep.url !== expectedUrl) {
      toDelete.push({ ...keep, reason: "wrong-url" });
    }
  }

  // Additionally: any sub with a wrong URL for an EVENTS event is suspect
  // even if it was the "kept" one — add-on pass catches rogue URLs from
  // historic migrations.
  for (const s of subs) {
    if (!EVENTS.includes(s.event)) continue;
    if (s.url === expectedUrl) continue;
    if (toDelete.find((d) => d.id === s.id)) continue;
    toDelete.push({ ...s, reason: "wrong-url" });
  }

  if (toDelete.length === 0) {
    console.log("Nothing to clean up. State is already correct.");
    return;
  }

  console.log(`Planned deletions (${toDelete.length}):`);
  for (const s of toDelete) {
    console.log(
      `  id=${s.id} event=${s.event} url=${s.url} reason=${s.reason}`,
    );
  }
  console.log("");

  if (dryRun) {
    console.log("--dry passed — no deletions performed.");
    return;
  }

  let okCount = 0;
  let failCount = 0;
  for (const s of toDelete) {
    process.stdout.write(`  DELETE id=${s.id} (${s.event}) ... `);
    try {
      const r = await deleteSubscription(base, key, s.id);
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
  console.log(`Done. ${okCount} deleted, ${failCount} failed.`);

  // Final verification.
  const after = await listSubscriptions(base, key);
  console.log("");
  console.log(`State after cleanup — ${after.length} subscription(s):`);
  for (const s of after) {
    console.log(`  id=${s.id} event=${s.event} url=${s.url}`);
  }

  if (failCount > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
