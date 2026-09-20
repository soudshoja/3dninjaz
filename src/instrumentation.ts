/**
 * Next.js 15 instrumentation hook - registers the WhatsApp outbox dispatcher.
 * Off unless WHATSAPP_OUTBOX_DISPATCHER=1, so build/start behave as before.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.WHATSAPP_OUTBOX_DISPATCHER !== "1") return;
  const { startOutboxDispatcher } = await import("@/lib/whatsapp/dispatcher");
  startOutboxDispatcher();
}
