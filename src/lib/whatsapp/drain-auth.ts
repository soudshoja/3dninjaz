/**
 * Auth check for the outbox drain route.
 *
 * The secret is read from the `x-drain-secret` header ONLY. A query-string
 * secret is never accepted: URLs land in access logs, and this repo has
 * already leaked credentials through a world-readable log. Fails closed when
 * WHATSAPP_OUTBOX_DRAIN_SECRET is unset or empty. Constant-time compare.
 * The secret is never logged.
 */
import crypto from "node:crypto";

export function isDrainAuthenticated(req: Request): boolean {
  const expected = process.env.WHATSAPP_OUTBOX_DRAIN_SECRET;
  if (!expected) return false;
  const provided = req.headers.get("x-drain-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
