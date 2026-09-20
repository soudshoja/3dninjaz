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

export const MAX_ATTEMPTS = 12;

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
