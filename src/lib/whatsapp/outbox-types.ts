/**
 * WhatsApp outbox — pure types + state-machine helpers (no DB, no I/O).
 *
 * Plain module — NOT "use server". Must stay importable from vitest without
 * pulling in `db`, `server-only`, or anything from `src/actions/**`, so the
 * state-machine logic (idempotency keys, ack ranking, backoff, failure
 * classification) can be unit-tested in isolation.
 */

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

export const OUTBOX_STATUSES = [
  "queued",
  "sending",
  "accepted",
  "server_ack",
  "delivered",
  "read",
  "failed_retryable",
  "failed_final",
  "undelivered",
  "cancelled",
] as const;

export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export const ACK_STATUSES = [
  "ERROR",
  "PENDING",
  "SERVER_ACK",
  "DELIVERY_ACK",
  "READ",
  "PLAYED",
  "DELETED",
] as const;

export type AckStatus = (typeof ACK_STATUSES)[number];

// ---------------------------------------------------------------------------
// Ack ranking — monotonic guard for the `ack_rank < ?` SQL comparison.
// Negative = terminal/ignored, never "higher" than any in-flight rank.
// ---------------------------------------------------------------------------

export function ackRank(s: string | null | undefined): number {
  switch (s) {
    case "PENDING":
      return 0;
    case "SERVER_ACK":
      return 1;
    case "DELIVERY_ACK":
      return 2;
    case "READ":
    case "PLAYED":
      return 3;
    case "ERROR":
    case "DELETED":
      return -1;
    default:
      return -1;
  }
}

export function ackToStatus(ack: string | null | undefined): OutboxStatus | null {
  switch (ack) {
    case "SERVER_ACK":
      return "server_ack";
    case "DELIVERY_ACK":
      return "delivered";
    case "READ":
    case "PLAYED":
      return "read";
    case "ERROR":
      return "failed_final";
    case "PENDING":
      return "accepted";
    case "DELETED":
      return "cancelled";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Idempotency key (D-4) — one pre-computed VARCHAR(190) UNIQUE column.
// "<eventKey>:<orderId ?? '-'>:<recipient>[:<suffix>]"
// ---------------------------------------------------------------------------

const IDEMPOTENCY_KEY_MAX_LEN = 190;

export function buildIdempotencyKey(input: {
  eventKey: string;
  orderId?: string | null;
  recipient: string;
  suffix?: string | null;
}): string {
  const orderPart = input.orderId ?? "-";
  const base = `${input.eventKey}:${orderPart}:${input.recipient}`;
  const full = input.suffix ? `${base}:${input.suffix}` : base;

  if (full.length <= IDEMPOTENCY_KEY_MAX_LEN) return full;

  // Overflow (pathological suffix) — hash-truncate the suffix so the key
  // stays deterministic for identical inputs while fitting the column.
  if (!input.suffix) {
    // Even the base overflowed (unlikely) — hard-truncate as a last resort.
    return full.slice(0, IDEMPOTENCY_KEY_MAX_LEN);
  }

  const hash = simpleHash(input.suffix);
  const withHash = `${base}:${hash}`;
  return withHash.length <= IDEMPOTENCY_KEY_MAX_LEN
    ? withHash
    : withHash.slice(0, IDEMPOTENCY_KEY_MAX_LEN);
}

// Small deterministic non-cryptographic hash (FNV-1a) — good enough to
// disambiguate pathological suffixes without pulling in node:crypto here.
function simpleHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------------------
// Failure classification
// ---------------------------------------------------------------------------

// "unconfirmed": the request timed out, so the gateway may have accepted and
// delivered the message. Auto-retrying would risk a duplicate customer
// message, so it is never retried automatically (admin can resend).
export type FailureClass = "retryable" | "final" | "unconfirmed";

/** last_error values meaning "may have been delivered" (admin label). */
export const UNCONFIRMED_ERRORS = ["timeout-unknown", "stuck-sending-unknown"] as const;

export function isUnconfirmedError(lastError: string | null | undefined): boolean {
  return !!lastError && (UNCONFIRMED_ERRORS as readonly string[]).includes(lastError);
}

const FINAL_400_PATTERN =
  /not.*(on|registered).*whatsapp|exists.*false|number.*invalid/i;

export function classifyFailure(
  httpStatus: number | null,
  errorBody: string | null,
): FailureClass {
  // Client timeout: outcome unknown, never auto-retry (duplicate-send risk).
  if (httpStatus === null && errorBody === "timeout") return "unconfirmed";

  // Other network errors (refused, DNS, reset) / no status at all → retryable.
  if (httpStatus === null) return "retryable";

  if ([408, 425, 428, 429].includes(httpStatus)) return "retryable";
  if (httpStatus >= 500 && httpStatus <= 599) return "retryable";

  if (httpStatus === 400) {
    if (errorBody && FINAL_400_PATTERN.test(errorBody)) return "final";
    // An unrecognised 400 shape is ambiguous — treat as final rather than
    // retry-looping on a permanently malformed request.
    return "final";
  }

  if ([401, 403, 404].includes(httpStatus)) return "final";

  // Any other 4xx → final.
  if (httpStatus >= 400 && httpStatus <= 499) return "final";

  // Anything else unexpected (e.g. a weird 3xx) → retryable, be conservative.
  return "retryable";
}

// ---------------------------------------------------------------------------
// Backoff
// ---------------------------------------------------------------------------

// Terminal condition is AGE-based: give up 48h after created_at (longer than
// the 32.6h outage that motivated this feature). The attempts ceiling is only
// a safety valve so nothing can loop forever; with the 6h backoff cap a row
// makes roughly 18 attempts in 48h, so it is never the binding limit.
export const MAX_AGE_SECONDS = 48 * 60 * 60;
export const MAX_ATTEMPTS = 50;

/**
 * Decide whether a failed attempt should be the last one. `delayMs` is the
 * backoff to the NEXT attempt; if that attempt would land beyond the age
 * horizon there is no point waiting - and no message is ever sent >48h old.
 */
export function shouldGiveUp(input: {
  attempts: number;
  ageSeconds: number;
  delayMs: number;
}): "max-age" | "max-attempts" | null {
  if (input.ageSeconds + input.delayMs / 1000 > MAX_AGE_SECONDS) return "max-age";
  if (input.attempts >= MAX_ATTEMPTS) return "max-attempts";
  return null;
}

const BASE_BACKOFF_MS = 30_000; // 30s
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000; // 6h

/**
 * attempts is 1-indexed (the attempt number that just failed).
 * attempt 1 -> ~30s, 2 -> ~1m, 3 -> ~2m ... capped at 6h, with +-20% jitter.
 */
export function nextBackoffMs(attempts: number): number {
  const n = Math.max(1, attempts);
  const raw = BASE_BACKOFF_MS * Math.pow(2, n - 1);
  const capped = Math.min(raw, MAX_BACKOFF_MS);
  const jitterFactor = 0.8 + Math.random() * 0.4; // 0.8 .. 1.2
  return Math.round(capped * jitterFactor);
}

// ---------------------------------------------------------------------------
// Order-state guard (M2). Text is frozen at enqueue and retries can span 48h,
// so a stale "please pay" message could reach a customer who already paid, or
// any message could reach an admin-cancelled order. Re-checked immediately
// before send for rows with an order_id. Unknown events are NOT blocked.
//
//   event                              guard
//   order_pending                      send only while unpaid (pending / awaiting_customer / awaiting_payment_review)
//   order_bank_transfer_instructions   send only while unpaid (pending / awaiting_customer / awaiting_payment_review)
//   order_approved / order_confirmation
//   order_processing / order_shipped
//   order_delivered / invoice_pdf      block if cancelled
//   (everything else, incl. order_cancelled, order_refunded, return_*: never blocked)
// ---------------------------------------------------------------------------

type OrderStateGuard = { allow: readonly string[] } | { block: readonly string[] };

// awaiting_payment_review MUST be in here: a bank-transfer checkout INSERTS the order in
// that status (src/actions/whatsapp-order.ts), before any proof exists, so leaving it out
// cancelled EVERY bank-transfer instructions message and customers never got the
// bank details (2026-09-22 to 2026-09-26). It still means "not paid yet".
const PAYABLE_STATES = ["pending", "awaiting_customer", "awaiting_payment_review"] as const;

export const ORDER_STATE_GUARDS: Readonly<Record<string, OrderStateGuard>> = {
  order_pending: { allow: PAYABLE_STATES },
  order_bank_transfer_instructions: { allow: PAYABLE_STATES },
  order_approved: { block: ["cancelled"] },
  order_confirmation: { block: ["cancelled"] },
  order_processing: { block: ["cancelled"] },
  order_shipped: { block: ["cancelled"] },
  order_delivered: { block: ["cancelled"] },
  invoice_pdf: { block: ["cancelled"] },
};

/**
 * True when the order's current state means this message must not be sent.
 * `orderStatus` is null when the order no longer exists (pending orders are
 * deletable): that blocks allow-guarded payment events, nothing else.
 */
export function orderStateBlocksSend(
  eventKey: string,
  orderStatus: string | null,
): boolean {
  const guard = ORDER_STATE_GUARDS[eventKey];
  if (!guard) return false;
  if ("allow" in guard) return orderStatus === null || !guard.allow.includes(orderStatus);
  return orderStatus !== null && guard.block.includes(orderStatus);
}

// ---------------------------------------------------------------------------
// Admin view types (shared by the "use server" actions and the UI; "use
// server" files may not export types).
// ---------------------------------------------------------------------------

export const OUTBOX_FILTERS = [
  "all",
  "queued",
  "failing",
  "failed",
  "undelivered",
  "sent",
] as const;
export type OutboxFilter = (typeof OUTBOX_FILTERS)[number];

export const OUTBOX_FILTER_STATUSES: Record<
  Exclude<OutboxFilter, "all">,
  readonly OutboxStatus[]
> = {
  queued: ["queued", "sending"],
  failing: ["failed_retryable"],
  failed: ["failed_final"],
  undelivered: ["undelivered"],
  sent: ["accepted", "server_ack", "delivered", "read"],
};

export type OutboxListRow = {
  id: string;
  createdAt: string;
  eventKey: string;
  orderId: string | null;
  orderNumber: string | null;
  customerName: string | null;
  recipient: string;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: string;
  ackStatus: string | null;
  lastError: string | null;
};

export type OutboxListResult = {
  rows: OutboxListRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
};

export const RESENDABLE_STATUSES: readonly OutboxStatus[] = [
  "failed_final",
  "undelivered",
  "failed_retryable",
];
