/**
 * Next.js 15 instrumentation hook - registers the WhatsApp outbox dispatcher.
 *
 * The dispatcher only starts when WHATSAPP_OUTBOX_DISPATCHER=1, so build and
 * start behave as before when it is off. It is NOT silent when off: the
 * startup health check logs an "Error:" line (matched by scripts/log-alert.cjs)
 * if the flag is unset or the whatsapp_outbox table cannot be read.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { checkOutboxHealth, startOutboxDispatcher } = await import(
    "@/lib/whatsapp/dispatcher"
  );
  await checkOutboxHealth();
  if (process.env.WHATSAPP_OUTBOX_DISPATCHER !== "1") return;
  startOutboxDispatcher();
}
