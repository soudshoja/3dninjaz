/**
 * Next.js 15 instrumentation hook.
 *
 * 260922 — deliberately a no-op right now. It used to dynamically import
 * src/lib/whatsapp/dispatcher.ts to start the in-process outbox poller, but
 * src/middleware.ts exists, so Next also compiles this file for the edge
 * runtime — and dispatcher.ts reaches mysql2 and @react-pdf/renderer (fs,
 * path, crypto), which broke the production build with "Module not found",
 * even though the import only ever executes when NEXT_RUNTIME === "nodejs".
 * Splitting the Node-only logic into its own file (src/instrumentation-node.ts,
 * imported only from inside the runtime check) did NOT fix it either — proven
 * with two local production builds, both failing identically. Webpack resolves
 * a dynamic import() during module-graph construction, before any dead-code
 * elimination, regardless of how deeply the runtime-guarded code is split out.
 *
 * This is NOT a functional gap for the outbox: startOutboxDispatcher() was
 * only the 15-second in-process convenience poll. The outbox itself — enqueue
 * -> whatsapp_outbox table -> drain route -> actual send — does not depend on
 * this file at all. scripts/cron/whatsapp-outbox-watchdog.cjs (registered
 * separately, every 5 minutes) hits the same /api/internal/whatsapp/drain
 * route directly and drains the queue on its own, independent of
 * instrumentation.ts. Worst case with this file as a no-op: up to ~5 minutes
 * of latency on a queued message instead of ~15 seconds — not a lost message.
 *
 * checkOutboxHealth()'s boot-time "Error:" log line (flag unset / table
 * missing) is the one thing genuinely lost until this is revisited — it was
 * a nice-to-have diagnostic, not the delivery guarantee.
 *
 * TODO: find a build-safe way to start the in-process poller (a real
 * edge-vs-nodejs webpack config split, or a standalone long-running Node
 * process outside the Next.js build, rather than instrumentation.ts) and
 * restore startOutboxDispatcher() + checkOutboxHealth() here.
 */
export async function register() {}
